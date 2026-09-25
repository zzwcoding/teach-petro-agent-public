# LiteLLM（AI 网关）

> 覆盖对象：LiteLLM Proxy / Router。官方源：docs.litellm.ai。适用场景：国产化内网环境。Petro-Agent 定位：FastAPI 异步底座之上的统一模型网关，承接问数/问答/问智三 Agent 的全部 LLM 流量，支撑国产化（vLLM / OpenAI 兼容端点）部署。

## 使用场景

LiteLLM 在生产环境解决的核心问题：**用一套 OpenAI 兼容接口统一接入 100+ 模型供应商**（Azure / OpenAI / Bedrock / Vertex / Anthropic / vLLM / Ollama / HuggingFace TGI 等），并在网关层集中处理负载均衡、认证（Virtual Keys）、用量与成本追踪、预算控制（来源：https://docs.litellm.ai/docs/proxy/quick_start ）。

对 Petro-Agent 的典型业务场景：

- **统一入口**：三个 Agent（问数 Text-to-SQL、问答 RAG、问智规划）全部只面向网关的一个 base_url 编程，换模型/加国产模型不动业务代码（来源：https://docs.litellm.ai/docs/proxy/quick_start ）。
- **多部署负载均衡**：同一模型别名（model_name）挂多个部署（如多个 vLLM 实例或多个区域端点），官方压测称 proxy 可承载 1.5k+ requests/second（来源：https://docs.litellm.ai/docs/proxy/quick_start ）。
- **高可用 failover**：主模型限流/超时后自动降级到备份模型组，保障油田现场 7×24 问答不断服（来源：https://docs.litellm.ai/docs/proxy/reliability ）。
- **审计与计费**：每次调用记录 spend log（token 用量 + 成本），可按 key / team / 用户维度统计，满足企业内部算量审计（来源：https://docs.litellm.ai/docs/proxy/logging ）。
- **敏感数据合规**：`turn_off_message_logging` 可只记元数据（spend）不记消息正文，适合油气生产数据脱敏场景（来源：https://docs.litellm.ai/docs/proxy/logging ）。

## 核心能力面

### 1. 统一 OpenAI 兼容接口（Proxy Server）

- 启动：`litellm --config config.yaml`（也可 `litellm --model <model>` 裸跑），默认监听 `http://0.0.0.0:4000`（来源：https://docs.litellm.ai/docs/proxy/quick_start ）。
- 核心端点（OpenAI 形状）：
  - `POST /chat/completions`（OpenAI SDK 走 `/v1/chat/completions`，两者等价）
  - `POST /completions`、`POST /embeddings`
  - `GET /models`、`POST /key/generate`（来源：https://docs.litellm.ai/docs/proxy/quick_start ）。
- 客户端兼容 OpenAI SDK / Anthropic SDK / Langchain / LlamaIndex，只需把 `base_url` 指向 proxy（来源：https://docs.litellm.ai/docs/proxy/quick_start ）。

### 2. config.yaml 模型配置

- 顶层结构：`model_list`（部署清单）、`litellm_settings`（网关级默认）、`router_settings`（路由策略）、`general_settings`（master_key 等）（来源：https://docs.litellm.ai/docs/proxy/quick_start 、https://docs.litellm.ai/docs/proxy/reliability ）。
- `model_list` 每项三字段：
  - `model_name`：用户侧模型别名（可重复 → 构成负载均衡组）；
  - `litellm_params`：透传给 `litellm.completion()` 的全部参数（`model` 真实模型名、`api_base`、`api_key`、`rpm`/`tpm`、`weight`、`order`、`max_parallel_requests`、`timeout` 等）；
  - `model_info`（可选）：`id`、`base_model`（Azure 成本核算用）、`max_input_tokens`（自定义上下文上限）、`access_groups` 等（来源：https://docs.litellm.ai/docs/routing 、https://docs.litellm.ai/docs/proxy/reliability ）。
- `api_key` / `api_base` 支持 `os.environ/VAR_NAME` 引用环境变量（来源：https://docs.litellm.ai/docs/routing ）。

### 3. Router 多模型路由（SDK 形态 `litellm.Router`）

- 构造：`Router(model_list=[...], routing_strategy="simple-shuffle")`；官方推荐生产默认 `simple-shuffle`（来源：https://docs.litellm.ai/docs/routing ）。
- 可用端点方法：`router.completion()` / `router.acompletion()`（异步，FastAPI 场景用这个）/ `router.embedding()` / `aembedding()` / `text_completion()` / `atext_completion()` / `image_generation()` / `aimage_generation()`（来源：https://docs.litellm.ai/docs/routing ）。
- 路由策略枚举：`simple-shuffle`（默认，加权随机）、`least-busy`、`latency-based-routing`、`usage-based-routing-v2`（RPM/TPM 感知）、`cost-based-routing`、自定义策略；`router_settings.routing_groups` 可按模型组分别指定策略（来源：https://docs.litellm.ai/docs/routing ）。
- 部署优先级：`litellm_params.order`（小值优先，失败后自动降到下一 order 层）；`weight` 控制同组内被选中的比例（来源：https://docs.litellm.ai/docs/routing ）。
- Session 亲和（Sticky Sessions）：`optional_pre_call_checks: ["session_affinity"]`，按 `x-litellm-session-id` 头把同一会话钉在同一部署上，多轮对话 / provider 侧 prompt cache 场景适用（来源：https://docs.litellm.ai/docs/routing ）。

### 4. Fallback / 重试 / 超时 / 冷却

- 三类 fallback（均可在 `litellm_settings` 配置）：`fallbacks`（其余所有错误，如 429/500）、`content_policy_fallbacks`、`context_window_fallbacks`；另有 `default_fallbacks` 兜底配置错误的模型组。按列表顺序依次尝试（来源：https://docs.litellm.ai/docs/proxy/reliability ）。
- 重试：`num_retries`（RateLimitError 走指数退避，其他错误立即重试）、`retry_after`（重试前最小等待秒数）；优先级：请求头 `x-litellm-num-retries` > 请求体 > 部署 `litellm_params` > `litellm_settings`。注意 `num_retries` ≠ `max_retries`（后者是 provider SDK 内部重试，走 router 时被置 0）（来源：https://docs.litellm.ai/docs/routing ）。
- 超时：`litellm_settings.request_timeout`（秒），超时抛 `TimeoutError`；router 级 `timeout` 参数作用整条调用链（来源：https://docs.litellm.ai/docs/proxy/reliability 、https://docs.litellm.ai/docs/proxy/timeout ）。
- 冷却（cooldown）：`allowed_fails`（每分钟允许失败次数）+ `cooldown_time`（冷却秒数）；429 / 高失败率 / 401/404/408 会自动冷却该部署 5 秒（默认）。支持 `RetryPolicy` / `AllowedFailsPolicy` 按错误类型定制，并可下放到单部署 `model_info.allowed_fails_policy`（来源：https://docs.litellm.ai/docs/routing ）。
- 同组内加权 failover：`Router(..., enable_weighted_failover=True)`（仅 simple-shuffle + 异步路径，按权重在组内换部署重试，组内全部失败才跨组 fallback）（来源：https://docs.litellm.ai/docs/routing ）。

### 5. 用量统计与 Logging

- 每次请求生成唯一 `call_id`，响应头携带 `x-litellm-call-id`、`x-litellm-model-id`、`x-litellm-response-cost` 等，可跨组件追踪（来源：https://docs.litellm.ai/docs/proxy/logging ）。
- 内置集成（`litellm_settings.success_callback` / `callbacks` / `failure_callback`）：Langfuse、OpenTelemetry（OTEL）、DataDog、S3 / GCS / Azure Blob 桶、AWS SQS、Langsmith、MLflow、Deepeval、Lunary、自定义 `CustomLogger` 回调类（`log_success_event` / `async_log_success_event` 等钩子，`litellm.completion_cost()` 算成本）（来源：https://docs.litellm.ai/docs/proxy/logging 、https://docs.litellm.ai/docs/routing ）。
- Spend Logs：落 `LiteLLM_SpendLogs` 表（需 Postgres），含 `model_group`、token 用量、成本；fallback 请求会在 metadata 里写 `attempted_fallbacks` 和 `original_model_group`，事后可区分直接服务与降级服务（来源：https://docs.litellm.ai/docs/proxy/reliability ）。
- 合规开关：`turn_off_message_logging: true`（不记消息正文只记 spend）、`no-log: true`（单请求全关）、`redact_user_api_key_info`（脱敏 key 信息）（来源：https://docs.litellm.ai/docs/proxy/logging ）。

## 典型用例模式

### 模式 A：最小调用序列（Petro-Agent 问数 Agent 经网关调 vLLM）

```python
# 1. 启动网关：litellm --config config.yaml
# config.yaml
model_list:
  - model_name: petro-llm          # 业务侧别名，三 Agent 统一使用
    litellm_params:
      model: openai/Qwen2.5-72B-Instruct   # openai/ = OpenAI 兼容端点（vLLM）
      api_base: http://vllm-svc:8000/v1
      api_key: os.environ/VLLM_API_KEY
  - model_name: petro-llm
    litellm_params:
      model: openai/Qwen2.5-72B-Instruct
      api_base: http://vllm-svc-bak:8000/v1   # 第二个部署 → 同别名负载均衡

litellm_settings:
  num_retries: 3
  request_timeout: 30
  fallbacks: [{"petro-llm": ["cloud-backup"]}]  # 本地全挂时降级云端备份组

# 2. FastAPI 业务侧（OpenAI SDK 直接指网关，零 LiteLLM 依赖）
from openai import AsyncOpenAI
client = AsyncOpenAI(api_key="sk-litellm-key", base_url="http://litellm:4000")
resp = await client.chat.completions.create(
    model="petro-llm",
    messages=[{"role": "user", "content": sql_question}],
)
```

来源：https://docs.litellm.ai/docs/proxy/quick_start 、https://docs.litellm.ai/docs/proxy/reliability 。

### 模式 B：进程内嵌 Router（不走 HTTP，SDK 直连）

```python
from litellm import Router
router = Router(
    model_list=[
        {"model_name": "petro-llm",
         "litellm_params": {"model": "openai/Qwen2.5", "api_base": "http://vllm:8000/v1"}},
        {"model_name": "petro-llm",
         "litellm_params": {"model": "openai/Qwen2.5", "api_base": "http://vllm-bak:8000/v1"}},
    ],
    routing_strategy="simple-shuffle",
    num_retries=3, allowed_fails=3, cooldown_time=30,
)
resp = await router.acompletion(model="petro-llm", messages=[...])
```

来源：https://docs.litellm.ai/docs/routing 。

最小调用序列总结：写 config.yaml → `litellm --config` 起网关 → 客户端 base_url 指向网关 → 用别名调 `/chat/completions` → fallback/retry/cooldown 全自动 → spend log 落库审计。

## 选型与版本

- **同类差异**：相对 Portkey / OpenRouter / Kong AI Gateway，LiteLLM 是开源（MIT）、可自托管的 Python 网关，优势在 100+ provider 覆盖、SDK 与 Proxy 双形态、模型组 fallback 语义细（三种类型 + default + 组内加权 failover）；不足是部分企业功能（Admin UI、Virtual Keys 精细化预算）需 Postgres 且企业版才有完整 UI（来源：https://docs.litellm.ai/docs/proxy/quick_start 、https://docs.litellm.ai/docs/proxy/reliability ）。
- **版本基线建议**：pin `litellm[proxy] ~= 1.100`（PyPI 最新 1.100.1，2026-09 查）。注意 1.84.0 起要求 Python ≥ 3.10；session affinity 等较新特性需 ≥ 1.97.0（来源：https://docs.litellm.ai/docs/proxy/quick_start 、https://docs.litellm.ai/docs/routing 、https://pypi.org/project/litellm/ ）。
- 无 DB 模式下 `max_budget` 等预算不生效（global spend 无法累计），生产建议配 Postgres（来源：https://docs.litellm.ai/docs/proxy/docker_quick_start ）。

## 官方文档锚点

| 主题 | URL |
|---|---|
| Proxy Quickstart（启动 / config.yaml / 端点） | https://docs.litellm.ai/docs/proxy/quick_start |
| Docker Quickstart（无 DB 模式注意事项） | https://docs.litellm.ai/docs/proxy/docker_quick_start |
| Router 路由 / 负载均衡 / 重试 / 冷却 | https://docs.litellm.ai/docs/routing |
| Fallback / 超时（可靠性总览） | https://docs.litellm.ai/docs/proxy/reliability |
| Timeout 专项 | https://docs.litellm.ai/docs/proxy/timeout |
| Logging / 可观测集成 / 脱敏 | https://docs.litellm.ai/docs/proxy/logging |
| OpenAI 兼容端点（自托管 vLLM 接入） | https://docs.litellm.ai/docs/providers/openai_compatible |
| 负载均衡补充 | https://docs.litellm.ai/docs/proxy/load_balancing |
| PyPI 版本 | https://pypi.org/project/litellm/ |

未找到公开文档：国产化芯片（昇腾等）后端没有独立文档页，走 `openai/` OpenAI 兼容端点接入 vLLM/MindIE 等自建服务是唯一官方路径（推断自 https://docs.litellm.ai/docs/providers/openai_compatible ）。
