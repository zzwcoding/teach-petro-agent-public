# 设计稿 07：LiteLLM 网关调度与记账

> **红线声明**：本设计稿零真实可运行代码。全部代码块均为**伪代码**（块首标注"伪代码 — 文件:函数"），公开签名取自设计稿 00 登记表 m2 四行（chat / embed / record_spend + config.yaml 契约）。LiteLLM Proxy 按官方 API 形状书写（锚 docs/tech-stack/litellm.md）：OpenAI SDK `base_url` 指向统一入口（POST /v1/chat/completions）、config.yaml `model_list` 三字段、`fallbacks`、router 层 `num_retries` 与 SDK `max_retries=0`、`allowed_fails`+`cooldown_time`、`request_timeout`、流式 `stream_options={"include_usage": true}`。
> **stub 换真身声明**（设计稿 00 登记表 #2）：本节把 EchoGateway（固定回复+假 usage+假调用号）换为真身 Gateway——LiteLLM Proxy 的客户端封装，落点同 `app/gateway/client.py` 同签名；替身段保留（同文件同签名），供网关容器未起的离线走查指名使用（处理方式同设计稿 02/04）。此前各设计稿中的网关调用（假调用号 call-20260913-0007 / gw-20260913-0a1b 等）自本设计稿起按真实形状采集：调用号出响应头、用量出流式末帧、成本随调用入账。
> **边界声明**：本设计稿只在 `m2` 范围；对 `m3`/`m4`/`m12` 全部为**使用公开接口**——`Repository.save_audit`（设计稿 04）、`Cache.incr` 与日计数键形状（设计稿 02）、`Metrics.record_*`/`over_budget` 与 `Clock`（设计稿 06），零内部 import、零接口修改。业务调用方接线（设计稿 09/10/14/17/20）一律以"调用方（后续设计稿接线）"占位。
> **明确不讲的**（设计范围声明）：各业务 Agent 的调用方接线（设计稿 09/10/14/17 各自兑现）；LiteLLM Virtual Keys/Admin UI 等企业功能细化（litellm.md：需 Postgres 且企业版）；模型微调与自建推理服务（设计范围"不做什么"）。

> **前端展示位注记**（2026-09-27）：成本熔断（单次 0.05 元＋累计 GATEWAY_BUDGET；熔断=改路由不拒绝——别名整体改降级组 petro-lite、在途照跑完、熔断位进程内单向不自动恢复）与故障切换留痕三处（审计行 served_model/attempted_fallbacks＋Fallback 结构化日志＋账本备注）在原型 D5/D1 页有对应展示（A2 / B2.3 / F2/F29 改注）。

## 实现清单

- [x] 主模型健康时一次问答生成：流式走网关统一入口、别名路由正确；响应中的网关调用号被记录进调用记录（源：W-F2-1）✅ **主干一**（AsyncOpenAI `base_url` 统一入口、`model="petro-llm"` 别名、POST /v1/chat/completions 流式应答）+ **主干二**（响应头 `x-litellm-call-id` 落审计行）
- [x] 主模型部署被故意关停：自动切换备用模型组正常应答，spend 记录含回退痕迹、回退日志可查（源：W-F2-2）✅ **主干四**（t4~t5：fallbacks 切 deepseek-backup 组应答；回退痕迹三处可查——审计行请求别名≠实际模型、网关 spend metadata `attempted_fallbacks`、Fallback 日志）+ **捣乱输入 C**（关停演练全程）
- [x] 逐调用记账：模型/token/延迟可查——计数入缓存、审计入库双写；"无 DB 模式预算形同虚设"的反例写入本设计稿（源：W-F2-3）✅ **主干二**（record_spend 双写：m4 日计数自增 + m3 逐调用审计行）+ **捣乱输入 A**（无 DB 模式 max_budget 形同虚设推演与三层账口径）
- [x] 重试只在 router 层（SDK 重试置零），无 SDK×router 套娃放大（源：W-F2-4）✅ **主干三**（router 半边 num_retries=3 + SDK 半边 max_retries=0 + 官方 provider SDK 置零纪律）+ **捣乱输入 B**（12 次上游请求的乘法放大推演）
- [x] 主模型连续失败达阈值：故障部署进冷却期不被选中，流量全走备用部署（源：W-F2-5）✅ **主干四**（t3~t6：连续失败达 allowed_fails → cooldown_time 冷却期不被选中 → 组内备用部署接流量；冷却由网关自身机制承担，零自研代码）
- [x] 流式用量采集：末帧用量非空→逐调用入账；"中断的流丢用量"作为已知坑记录（源：W-F12-3）✅ **主干五**（末帧判别 choices 空+usage 非空 → record_spend 入账；已知坑=GeneratorExit 丢末帧 → usage_missing 行、成本不入累计、宁缺毋假口径）
- [x] 单次调用成本超预算：切降级模型组，熔断事件入追踪（源：W-F12-4）✅ **主干六**（单次/累计双判据 → tripped → resolve 切降级组全程；熔断事件载荷与 span 回填调用纪律定形，span 树推演见主干六末段——span 开关本身是调用方打点纪律，设计稿 17/19 通流）+ **超限后累计成本处置口径**定形块（设计稿 06 留给本节的定形项）
- [x] 配置契约文件落位：模型清单/回退/重试/冷却/超时全部外置（源：卡 `m2` 公开接口·配置契约）✅ **配置契约**块（app/gateway/config.yaml 五件全外置：model_list 三字段 / fallbacks / num_retries / allowed_fails+cooldown_time / request_timeout）
- [x] 本节把设计稿 00 登记的 EchoGateway 换为真身（源：卡 `m2` Adapter）✅ 头部 stub 换真身声明 + **越界自查**
- [x] 越界引用为零（源：modules.md 边界规则表）✅ **越界自查**

---

## 走查：从输入到验收行为

> **主角数据**（业务真数据样子）：
> ① 小李在会话 `th-xiaoli-001` 问"N-2 井的完井方式是什么"→ 问答链一次流式网关调用：别名 `petro-llm`，调用号由响应头 `x-litellm-call-id` 发放（W-F2-1 / W-F12-3 主角）；
> ② 这笔调用的账目：模型别名 / 实际服务模型 / prompt 1847·completion 312 tokens / 耗时 1400ms / 成本 0.0042 元（W-F2-3 主角）；
> ③ 阿强的故障演练：`docker stop` Petro-72B vLLM 主部署、再停热备（W-F2-2 / W-F2-5 主角）；
> ④ 老王问数反思回边三连的长上下文调用，单次成本 0.08 元顶破单次上限（W-F12-4 主角）。
> **地图先行**（六主干与调用方占位，后续步骤引用不重画）：

```text
伪代码（六主干总览，非代码）

业务调用方（设计稿 09/10/14/17/20 接线）    AI 网关容器 C3（LiteLLM Proxy :4000 + 封装层 app/gateway/）

问答/问数/问智 ──OpenAI SDK base_url=:4000──→ Gateway.chat（主干一：别名→流式/非流式分支）
   主循环/管道                                  │ 第①步 过熔断位 resolve（主干六 cost_breaker）
                                               ▼
                        config.yaml model_list 按别名选中部署组（主干一 alias_router）
                            │ 主用故障：组内换部署→备用组（主干四 fallback_switch）
                            │ 限次重试 num_retries=3，SDK max_retries=0（主干三 retry_cooldown）
                            │ 连续失败达 allowed_fails → 冷却期不被选中（主干四 retry_cooldown）
                            ▼
                        流式末帧 usage 采集（主干五 usage_probe）
                            ▼
                        record_spend 记账双写（主干二 spend_recorder）
                            ├─.计数.→ m4 Cache.incr 日累计（Redis 容器，设计稿 02）
                            ├─.审计.→ m3 Repository.save_audit 逐调用行（持久化容器，设计稿 04）
                            └─.喂数.→ m12 Metrics.record_cost/ttft/latency（可观测容器，设计稿 06）
                                       │ 判据 over_budget（主干六）
                                       ▼
                        超限 → 切降级模型组 + 熔断事件载荷（主干六，回填调用方 span）
```

### 配置契约：五件全外置（验收第 8 条落点）

```text
伪代码 — app/gateway/config.yaml（m2 配置契约；compose 挂载给 litellm 服务，锚设计稿 03 交付物契约；形状=litellm.md 官方）

model_list:                                    # 每项三字段：model_name / litellm_params / model_info（litellm.md）
  - model_name: petro-llm                      # 业务侧别名：三 Agent 统一只用这一个名字
    litellm_params:
      model: openai/Petro-72B-Instruct       # openai/ 前缀 = OpenAI 兼容端点（Petro-72B vLLM 部署，litellm.md）
      api_base: os.environ/PETRO72B_API_BASE    # 端点与密钥支持 os.environ/VAR 引用（litellm.md），不进配置文件
      api_key: os.environ/PETRO72B_API_KEY
  - model_name: petro-llm                      # 同别名第二个部署 → 构成负载均衡组（simple-shuffle 组内换部署）
    litellm_params:
      model: openai/Petro-72B-Instruct
      api_base: os.environ/PETRO72B_API_BASE_BAK
      api_key: os.environ/PETRO72B_API_KEY
  - model_name: deepseek-backup                # 备用组别名：fallbacks 的落点（W-F2-2）
    litellm_params:
      model: openai/DeepSeek-V3
      api_base: os.environ/DEEPSEEK_API_BASE
      api_key: os.environ/DEEPSEEK_API_KEY
  - model_name: petro-lite                     # 降级组别名：成本熔断的落点（W-F12-4，便宜模型）
    litellm_params: { model: openai/Qwen2.5-7B-Instruct, api_base: os.environ/LITE_API_BASE, … }
  - model_name: petro-embed                    # 嵌入别名：Gateway.embed 用（变形段）
    litellm_params: { model: openai/bge-m3, api_base: os.environ/EMBED_API_BASE, … }

litellm_settings:
  fallbacks: [{"petro-llm": ["deepseek-backup"]}]   # 主组全失败→按列表顺序切备组（其余错误如 429/500）
  num_retries: 3                              # ★ router 层重试次数：RateLimitError 指数退避，其他立即重试
  request_timeout: 30                         # 秒；超时抛 TimeoutError → 计一次失败（喂冷却计数）
  allowed_fails: 3                            # 每分钟失败达 3 次
  cooldown_time: 30                           # → 该部署冷却 30 秒不被选中（W-F2-5）

router_settings:
  routing_strategy: simple-shuffle            # 官方推荐生产默认：同别名多部署加权随机（litellm.md）
```

**契约纪律**：调度行为（换模型/加部署/调重试/调冷却）全部改这一份文件，零业务代码、零客户端发版；网关自身密钥与端点走环境变量（同设计稿 03/04 注入纪律）。熔断三参数（单次上限/累计预算/降级组别名）不进这份 LiteLLM 配置——它是网关自己的判断依据，走环境变量注入（主干六）。

### 主干一：别名路由——统一入口的一次流式问答（W-F2-1）

```text
伪代码 — app/gateway/client.py:Gateway（m2；业务侧只见 OpenAI 兼容形状）

class Gateway:
    def __init__(self, cache, repo, metrics, clock=Clock()):
        # 注入的全是下游模块公开接口：m4 Cache / m3 Repository / m12 Metrics+Clock（卡 m2 依赖行）
        self._client = AsyncOpenAI(
            api_key=环境变量("LITELLM_KEY"),            # 网关 Virtual Key——模型厂商密钥只住在网关侧
            base_url=环境变量("LITELLM_BASE_URL", "http://litellm:4000/v1"),
            # ★ 统一入口：三 Agent 一切模型调用只认这一个 base_url（W-F2-1 断言一；边界规则第 1 行）
            max_retries=0,                              # ★ SDK 重试置零——重试只归 router 层（主干三）
        )
        self._breaker = CostBreaker(metrics)            # 主干六
        self._spend = SpendRecorder(cache, repo, metrics)   # 主干二
        self._clock = clock                             # 时间源注入（锚设计稿 06：单调钟，只进不退）

    async def chat(self, messages, model_alias, stream=False, tools=None) -> ChatResult | TokenStream:
        # 主干判断①：预算闸先于调用——已熔断则别名被换成降级组（主干六 resolve）
        target = self._breaker.resolve(model_alias)
        # 主干判断②：流式/非流式分支——调用形状差异只有 stream_options 一处
        kwargs = {"model": target, "messages": messages}     # model=别名，业务不知道真实模型名
        if tools is not None:
            kwargs["tools"] = tools                          # 工具声明原样透传（m8 主循环用，设计稿 12/17）
        if stream:
            kwargs["stream"] = True
            kwargs["stream_options"] = {"include_usage": True}   # ★ 官方形状：末帧带总用量（主干五）
        started = self._clock.now()
        try:
            resp = await self._client.chat.completions.create(**kwargs)
            # 线上形状：POST {base_url}/chat/completions，即 /v1/chat/completions（锚 litellm.md）
        except 网关异常 as e:
            # 异常去向：router 层重试与 fallback 已跑完仍失败（备用组也失败）→ 结构化网关错误上抛
            #   （错误码：all_deployments_failed / timeout / …），调用方折进事件帧 error 路径
            #   （设计稿 17 桥接，锚 W-F1-3）；本层不吞错、不再重试——重试纪律只有 router 一层
            raise GatewayError(原因码 from e)
        if stream:
            return self._token_stream(resp, model_alias, started)   # 包装生成器：采集+记账（主干五）
        # 非流式：一次拿全，记账后返回
        call_id = resp.headers["x-litellm-call-id"]          # ★ 网关调用号（锚 litellm.md 响应头三件套之一）
        latency = self._clock.now() - started
        self._metrics.record_latency(model_alias, latency)   # m12 喂数（锚设计稿 06 记录点）
        await self._spend.record_spend(call_id,
              用量载荷(resp.usage, model_alias, resp.model, 成本 = resp.headers.get("x-litellm-response-cost")),
              latency)
        self._breaker.observe(call_id, 成本)                 # 熔断回看（主干六）
        return ChatResult(content=resp.choices[0].message.content, call_id=call_id,
                          served_model=resp.model, breaker=self._breaker.事件载荷())
```

走查（W-F2-1 全程）：调用方（设计稿 10 接线的 `Generator.answer`）以 `model_alias="petro-llm"`、`stream=True` 调入 → `resolve` 未熔断原样放行 → SDK 对统一入口发 POST /v1/chat/completions，请求体 model 只是别名 → 网关按 model_list 选中 petro-llm 组内一个部署（simple-shuffle）→ 流式 token 逐帧外送。**观察到的验收行为**：业务代码里没有一个真实模型名、一个厂商密钥；换模型=改 config.yaml 一行，业务零改动（Seam：网关是全部 Agent 与"模型世界"的唯一接缝）。

### 主干二：记账双写——调用号入审计、日计数入缓存（W-F2-3）

```text
伪代码 — app/gateway/spend_recorder.py:SpendRecorder.record_spend（m2；双写）

class SpendRecorder:
    def __init__(self, cache, repo, metrics):      # m4/m3/m12 公开接口注入（卡 m2 依赖行的落点）
        self._cache, self._repo, self._metrics = cache, repo, metrics

    async def record_spend(self, call_id, usage, latency) -> None:
        # 卡面签名三参数不动；usage 取广义用量载荷（一次调用的全部记账事实）：
        #   {model_alias, served_model, prompt_tokens, completion_tokens, cost, usage_missing}
        #   ——审计字段清单见设计稿 04 CallAudit（调用号/模型别名/prompt/completion/耗时/发生时刻）
        try:
            await self._cache.incr(f"spend:{usage.model_alias}:{今天}")
            # 双写①计数：键形状=设计稿 02 定形（"spend:petro-llm:2026-09-13"，日累计、TTL 30 天）
        except CacheUnavailable:
            结构化日志("计数失败——记账非关键路径不拦调用，缺口靠审计表对账")   # 锚设计稿 02 口径
        try:
            await self._repo.save_audit(CallAudit(       # 双写②审计：逐调用一行=对账真源（设计稿 04）
                call_id=call_id, model_alias=usage.model_alias, served_model=usage.served_model,
                prompt_tokens=usage.prompt_tokens, completion_tokens=usage.completion_tokens,
                latency_ms=latency, cost=usage.cost, usage_missing=usage.usage_missing,
                created_at=现在))
        except PersistenceError:
            结构化日志("审计落库失败——账目缺口可见，不静默")   # 可见不致命：模型回答已完成，不回滚业务
        if not usage.usage_missing and usage.cost is not None:
            self._metrics.record_cost(call_id, usage.cost)    # m12 喂数③：逐调用入账（主干六判据数据源）
        # 双写互不为事务：两写独立捕获、互不拖死；"模型/token/延迟逐调用可查"=审计表按 call_id 查
        #   + m12 _cost_by_call 同键账（锚设计稿 06"call_id 串联跨模块链路"）
```

走查（W-F2-3）：主角②那笔调用完成 → record_spend → Redis 里 `spend:petro-llm:2026-09-13` 自增一次、审计表多一行（1847/312 tokens、1400ms、0.0042 元）→ 按调用号可查、按日可汇总。**预算按累计 spend 生效**的闭环在主干六：m12 累计吃的就是这里的逐调用成本。

### 捣乱输入 A：无 DB 模式的"每天限 10 块"——形同虚设的预算

```text
伪代码（时序推演，非代码）——网关不带库起服务，预算写在配置里就以为闸上了

前提：阿强图省事，litellm 容器不带 Postgres 起（无 DB 模式），config.yaml 写了
      max_budget: 10（"每天限 10 块"）——litellm.md 明文：无 DB 模式下 max_budget 等预算不生效
      （global spend 无法累计），生产建议配 Postgres

t0  上午三 Agent 正常调用，一切"看起来"有预算在管
t1  网关容器重启（一次普通部署更新）：global spend 无处持久化，累计清零——
    "每天限 10 块"实际是"每重启 10 块"
t2  午后问数 Agent 反思回边长上下文调用暴走（锚 原书第七章：上下文累积是成本放大因素），
    单日真实成本 47 元——网关一声不吭：判据没有数据源，闸存在的感觉还在、闸本身已经没了
t3  反例结论：预算闸不能建在"无持久化的网关内存"上。本设计稿的三层账口径：
    ①记账双写自带持久化半边——审计表（m3）是对账真源、Redis 日计数（m4）是快查视图，
      网关重启两者都在；
    ②熔断判据走 m12 进程内累计（自给自足，锚设计稿 06 叶子纪律）——它同样重启归零，但只承担
      "快速信号"职责，账的真源在审计表，重启丢的是信号时效不是账；
    ③"每天限 10 块"要真正硬生效，前提=网关配 Postgres（litellm.md），部署清单里 litellm 服务带库启动
      ——环境前提缺位属设计范围红线的"环境/前提冲突"，停下转人工裁决，不拿无 DB 模式蒙混
```

闸在哪：记账双写（本设计稿）+ 部署前提（网关配库）。拦完数据去哪：预算配置错误不再静默——判据有没有数据源、账有没有真源，三层各答各的，缺口在审计对账与 usage_missing 监控里可见。

### 主干三：重试纪律——重试只存在于 router 一层（W-F2-4）

```text
伪代码（纪律对照，非代码）——同一道纪律的两半边（锚 litellm.md：num_retries ≠ max_retries）

半边①业务 SDK（我们的代码，app/gateway/client.py:Gateway.__init__）：
      AsyncOpenAI(…, max_retries=0)
      # openai 官方 SDK 默认 max_retries=2，对 429/5xx 自动重发——不置零=业务层藏着
      #   一层看不见的重试，W-F2-4 的"SDK 重试置零"断言落点就在这一个参数
半边②网关 router（LiteLLM 进程内，app/gateway/config.yaml）：
      litellm_settings: { num_retries: 3, request_timeout: 30 }
      # 唯一的重试层：RateLimitError 走指数退避、其他错误立即重试；单次尝试 30 秒超时
官方纪律（litellm.md）：LiteLLM Router 调供应商时同样把 provider SDK 内部重试（max_retries）强制置 0
      ——网关内部也只允许 router 一层。重试优先级：请求头 x-litellm-num-retries > 请求体
      > 部署 litellm_params > litellm_settings（调参有单一出处链）
```

**观察到的验收行为**：一次用户提问，最坏 1 次用户请求 = 最多 4 次上游尝试（1 首试 + 3 重试，全部在 router 层）；业务代码与业务 SDK 零重试参与；改重试策略=改 config.yaml，零代码零发版。

### 捣乱输入 B：两套重试叠加——套娃放大推演

```text
伪代码（时序推演，非代码）——SDK×router 两层重试是乘法不是加法

前提：捣乱配置——SDK 留默认 max_retries=2，router num_retries=3；Petro-72B 端点今晚限流（429）

世界一（只有 router 重试，本设计稿）：
  用户 1 次请求 → router 首试 429 → 退避重试 ×3 → 全 429 → 结构化错误上抛
  上游收到 4 次请求；用户等待 = 4 次尝试+退避；错误可解释（限流，稍后重试）

世界二（两层都开，套娃）：
  用户 1 次请求 → SDK 第 1 次发出 → router 内部 4 次尝试全 429 → 网关回 500
  → SDK 见 5xx 自动重发第 2 次 → router 又 4 次 → ……SDK 共发 3 次
  上游收到 3×4 = 12 次请求——对已限流的端点放大 3 倍流量，429 风暴自我实现、恢复更慢；
  用户等待按分钟计，远超 request_timeout=30 秒的设计预期；
  日志里 12 条失败对应 1 次用户动作——排障时所有人都以为流量涨了 12 倍

世界三（本设计稿：SDK 置零）：放大系数恒为 1×4，可推演、可写进 SLO——"重试次数"有单一出处
闸在哪：AsyncOpenAI(max_retries=0)（业务侧）+ Router 对 provider SDK 置零（网关侧，官方内建）
拦完数据去哪：重试耗尽 → 结构化网关错误上抛 → 调用方折进事件帧 error 路径（设计稿 17 桥接）；
  失败尝试同时喂冷却计数（主干四）——重试与冷却同源，不会互相看不见
```

### 主干四：Fallback 与冷却——阿强的故障演练（W-F2-2 / W-F2-5；捣乱输入 C：故意关停主模型）

```text
伪代码（时序推演，非代码）——主模型部署被故意关停的一分钟

前提：petro-llm 组挂两个部署（vllm-svc 主 + vllm-svc-bak 热备）、deepseek-backup 备用组；
      allowed_fails=3 / cooldown_time=30 / fallbacks: [{"petro-llm": ["deepseek-backup"]}]

t0  小李提问 → 按别名 petro-llm 进组 → simple-shuffle 选中主部署 → 正常流式应答
t1  阿强：docker stop vllm-svc（捣乱输入 C：演练开始）
t2  下一笔调用选中主部署 → 连接拒绝 → router 记失败 1 次 → 组内重试换 vllm-svc-bak →
    应答成功（用户无感，只是这笔延迟里含一次失败尝试）
t3  一分钟内连续失败达 allowed_fails=3 → 主部署进冷却 30 秒：simple-shuffle 不再选中它
    （W-F2-5：冷却期内不被选中——失败尝试的延迟从此从用户路径里消失，流量全走备用部署）
t4  阿强再停 vllm-svc-bak（全主组下线）→ 组内无部署可用 → fallbacks 按顺序切 deepseek-backup
    → 备用组正常应答（W-F2-2：自动切换备用模型组，问答不断服）
t5  回退痕迹三处可查：
    ①我们的审计行：model_alias=petro-llm，served_model=DeepSeek-V3——请求别名≠实际模型
    ②网关 spend log metadata：attempted_fallbacks + original_model_group（锚 litellm.md）
    ③Fallback 日志：router 层每次切换一条——阿强排障的第一入口
t6  冷却到期：主部署重新可被选中，流量按负载均衡自然回流；若主组已恢复则无感切回
    异常去向：备用组也失败 → 结构化网关错误上抛（主干一 except 段，设计稿 17 折进 error 帧）
```

落点声明：冷却与回退的机制**全部由网关自身承担**（config.yaml 四个键：fallbacks / allowed_fails / cooldown_time / routing_strategy），我们的封装层零冷却代码——`app/gateway/` 里没有一行"重试逻辑"或"故障标记"，这正是配置契约外置（验收第 8 条）的意义：故障演练调的是配置，不是代码。

### 主干五：流式用量采集——末帧 include_usage（W-F12-3）

```text
伪代码 — app/gateway/client.py:Gateway._token_stream（流式包装——末帧采集与全程记账）

    async def _token_stream(self, upstream, model_alias, started) -> TokenStream:
        call_id = 响应头(upstream)["x-litellm-call-id"]     # 调用号：流式同样出响应头（锚 litellm.md）
        first_ms = None; usage = None
        try:
            async for chunk in upstream:                    # 逐帧：delta 帧 …… + 末帧 usage
                if first_ms is None:
                    first_ms = self._clock.now() - started
                    self._metrics.record_ttft(model_alias, first_ms)   # m12 喂数①（锚设计稿 06 记录点）
                if chunk.usage is not None:                 # ★ 末帧判别（主干五核心）：
                    usage = chunk.usage                     #    include_usage 只让最后一帧带总用量
                yield delta 帧(chunk)                       # 业务帧照常外送，采集对调用方零感知
            self._metrics.record_latency(model_alias, self._clock.now() - started)   # 喂数②
            await self._spend.record_spend(call_id,
                  用量载荷(usage, model_alias, 实际模型(upstream), 成本头(upstream)),
                  self._clock.now() - started)              # 逐调用入账（主干二）
            self._breaker.observe(call_id, 成本头(upstream))          # 熔断回看（主干六）
        except 流被中断:                                    # 已知坑：客户端断开/异常取消生成器
            await self._spend.record_spend(call_id,
                  用量载荷(None, model_alias, …, usage_missing=True),
                  self._clock.now() - started)              # 账照落：调用发生过、延迟可查，
            raise                                            #   但用量缺失——见下段口径
```

```text
伪代码（时序推演，非代码）——末帧形状与中断的坑（W-F12-3）

stream_options={"include_usage": true} 时的帧序列（主角①那笔调用）：
  chunk① choices=[delta:"N-2 井"]   usage 缺
  ……
  chunkN-1 choices=[delta:"完井"]    usage 缺
  chunkN  choices=[]                 usage={prompt_tokens: 1847, completion_tokens: 312, total_tokens: 2159}
          ★ 官方约定：末帧 choices 为空、只有 usage——采集判别"choices 空且 usage 非空"
→ usage 采集 → 审计行 prompt=1847 / completion=312 → record_cost(0.0042) 入 m12 累计

已知坑：中断的流丢用量
  客户端关页 / 网络断 / 网关异常 → 生成器被关闭 → 末帧永不到达 → usage=None
  → 审计行照落（usage_missing=true、延迟可查），成本不入 m12 累计
  → 口径：宁缺毋假（同设计稿 06 孤儿 span 口径）——用量缺失≠零成本，真实费用已发生；
    账面低估的缺口靠 usage_missing 行数监控 + 审计表对账补记，不伪造成本
```

### 主干六：成本熔断——判据、切组、事件入 span（W-F12-4 全程）

```text
伪代码 — app/gateway/client.py:CostBreaker（m2 内部件；判据走 m12 公开面）

class CostBreaker:
    def __init__(self, metrics):
        self._metrics = metrics                       # m12 公开接口：累计账与判据（卡 m2 依赖行）
        self._tripped = False                         # 熔断位：进程生命周期内单向（口径见下块）
        self._degrade_alias = 环境变量("GATEWAY_DEGRADE_ALIAS", "petro-lite")
        self._per_call_cap = 环境变量("GATEWAY_COST_PER_CALL_CAP", 0.05)   # 单次上限（元）
        self._budget = 环境变量("GATEWAY_BUDGET", None)   # 累计预算；None=未配置→判据恒不触发（锚设计稿 06）

    def resolve(self, model_alias) -> str:            # 每次调用前过闸（主干一第①步）
        return self._degrade_alias if self._tripped else model_alias

    def observe(self, call_id, cost) -> 事件载荷 | None:    # 每次 settle 记账后回看
        if self._tripped or cost is None:
            return None
        单次超限 = cost > self._per_call_cap               # W-F12-4 给定：单次调用成本超预算
        累计超限 = self._metrics.over_budget(self._budget) # m12 判据：累计成本 > 预算（设计稿 06 交付）
        if 单次超限 or 累计超限:
            self._tripped = True                       # 下一起调用起，resolve 全部改走降级组
            return {事件: "cost_breaker_tripped", call_id: call_id, cost: cost,
                    触发: "单次" if 单次超限 else "累计", 降级组: self._degrade_alias}
        return None
```

```text
伪代码（口径定形，非代码）——超限后累计成本怎么办（设计稿 06 留给本节的定形项）

m12 累计值：不清零、不复位、继续增长——它是仪表不是闸门；判据只读它，不写它
熔断位：进程生命周期单向，触发后不自动恢复。恢复通道两条：
  ①进程重启（m12 累计归零、熔断位随进程消亡）——误熔断的自愈通道，也是"重启即恢复"的代价；
  ②人工改配置重启（预算调大 / 降级组换型号）——预算政策的变更通道
日窗口：Redis 计数键 spend:{别名}:{日期} 每日换键——那是账本换页（日报口径），不是熔断复位；
  熔断不跟日窗口走
熔断期间记账照常：降级组的调用照样 record_spend、成本照样入累计——账永远记，闸只是改路由
对账：审计表是真源——重启丢的信号时效由"当日审计汇总 vs m12 累计"对账补齐
```

```text
伪代码（走查推演，非代码）——老王问数反思回边三连触发熔断（W-F12-4 全程）

t0  老王连问三轮，问数状态机反思回边修正 SQL：每轮把前轮历史与工具返回重新发全（锚 原书第七章
    上下文累积效应），第 3 轮单次调用成本 0.08 元——prompt token 较首轮翻两倍
t1  该调用 settle：record_spend 入审计 → record_cost(0.08) 入 m12 累计 → observe 回看：
    0.08 > 0.05 单次上限 → 判据真 → tripped，事件载荷返回
t2  span 回填（调用纪律，本设计稿定形）：调用方在 end_span("网关调用") 时把 ChatResult.breaker
    并入 attrs——span 树里"网关调用"环节多出 cost_breaker_tripped 事件，status 仍 ok
    （业务成功与熔断事件分开，锚设计稿 06 捣乱 A t5"attrs 记事件、status 不动"的同一通道）；
    span 开与关本身是调用方打点纪律（设计稿 17/19 通流），本节交付事件载荷与回填纪律
t3  下一通调用（任何 Agent）：resolve → petro-lite → 流量走便宜模型组——问答能力降档但不断服
t4  可查三处：span 树（事件）、审计表（0.08 那笔与降级组后续各笔）、结构化日志（tripped 一条）
```

### 变形段：嵌入统一走网关的形状（embed）

```text
伪代码 — app/gateway/client.py:Gateway.embed（m2；POST /v1/embeddings，同一统一入口）

    async def embed(self, texts) -> Vectors:
        resp = await self._client.embeddings.create(model="petro-embed", input=texts)
        return [d.embedding for d in resp.data]
        # 消费方接线不在本设计稿（设计稿 09/10 按需）；走网关的理由与 chat 同一条边界规则：
        # 嵌入也是模型流量——计入记账与熔断口径，不因"单价便宜"开绕行例外
```

## 关键判断的取舍记录

1. **独立 Proxy 进程（HTTP 形状），不用进程内嵌 Router SDK**（litellm.md 模式 B）。备选是 `litellm.Router` 进程内直调：少一跳网络、少一个服务。不选：三 Agent 全部只面向一个 OpenAI 兼容 base_url 编程，业务代码零 LiteLLM 依赖（openai SDK 就够），网关独立升级/重启不随应用发版；国产化部署里 vLLM/Petro-72B 端点、DeepSeek 云端、后续国产推理服务都从同一个口进，记账与熔断才有"唯一出口"可守（边界规则第 1 行）。付出：多一跳延迟、网关自身成为单点（高可用是部署题，不在本设计稿）。换边条件：单机原型或对代理跳数敏感的时延场景，换进程内 Router——配置契约形状不变。
2. **三层账分工：Redis 日计数=快查视图、Postgres 审计=对账真源、m12 进程累计=熔断信号源**；判据不读 Redis 也不读 PG。备选是熔断判据直接读 Redis 日计数（跨进程共享、日窗口天然）。不选：m2 的熔断判据按卡走 m12（W-F12-4 走查列明文 Metrics.record_cost → over_budget → 切降级），判据零外部依赖——Redis/PG 抖时闸不瞎、不误切。代价：m12 累计是进程生命周期的，"每天限 N 块"的日窗口语义由 Redis 换键承担（日报），熔断位重启复位（取舍见口径定形块）。换边条件：多实例部署使单进程累计失真时，对账后把判据数据源切到共享存储——判据签名 over_budget(budget) 不动。
3. **重试单层化，SDK 置零而不是"留一次兜底"**。备选是 SDK 留 max_retries=1 防"网关进程本身瞬断"。不选：两层重试的放大是乘法（捣乱输入 B 的 12 次推演），且"网关瞬断"该由网关自身的高可用与 router 重试管，业务层重试会把每次抖动放大成风暴；重试策略集中在 config.yaml 一处，SLO 里"重试几次"才有单一出处。换边条件：网关多实例+负载均衡就位后，业务层对"整个网关不可达"做一次兜底重试才有明确收益——届时也只加在调用方封装一层，不进 SDK 默认。
4. **成本熔断=切降级模型组，不做硬拒绝**。备选是超预算直接拒答（429/断流）。不选：油田现场 7×24 问答不断服优先——老王的问数拿不到答案就转人工，人力成本高于降档模型的答错风险；降级组（petro-lite）保住"有回答"，记账照常让费用仍可见。换边条件：预算变刚性约束（对外计费、安全红线类任务）时，把 resolve 的降级行为换成拒绝——CostBreaker 的 tripped 位与判据复用，只换执行半边。

## 锚点对照精要

**docs/tech-stack/litellm.md · 统一入口与 config.yaml 契约**（卡 `m2` 锚点 K-F）
litellm.md：`litellm --config config.yaml` 起网关默认监听 :4000，核心端点是 OpenAI 形状的 POST /chat/completions（SDK 走 /v1/chat/completions，两者等价）与 /embeddings；客户端只需把 base_url 指向 proxy，OpenAI SDK/Langchain 等零改造。落点：主干一调用序列逐条按此形状；业务代码零 LiteLLM 依赖即"业务侧只见 OpenAI 兼容形状"。

**docs/tech-stack/litellm.md · model_list 三字段与 Router simple-shuffle**（卡 `m2` 锚点）
litellm.md：model_list 每项三字段——model_name（业务侧别名，可重复构成负载均衡组）、litellm_params（透传 completion 的全部参数：真实模型名/api_base/api_key/rpm/tpm/weight/order 等）、model_info（可选：id/base_model/max_tokens 上限）；api_base/api_key 支持 os.environ/VAR 引用；生产默认路由策略 simple-shuffle（加权随机）。落点：配置契约块的Petro-72B 主部署×2 + DeepSeek 备组 + 降级组 + 嵌入别名全部按三字段写；组内换部署（主干四 t2）就是"同别名多部署"语义。

**docs/tech-stack/litellm.md · 三类 fallbacks、重试与冷却**（卡 `m2` 锚点）
litellm.md：fallbacks（其余所有错误如 429/500）/content_policy_fallbacks/context_window_fallbacks 三类加 default_fallbacks，按列表顺序尝试；num_retries（RateLimitError 指数退避）与 max_retries（provider SDK 内部重试，走 router 时被置 0）是两个参数；冷却=allowed_fails（每分钟失败阈值）+cooldown_time（秒），429/高失败率/401/404/408 自动冷却默认 5 秒。落点：主干三的两半边纪律与捣乱输入 B、主干四的冷却时序全部站在这三条上；本设计稿只用到 fallbacks 一类，另两类记为换边条件。

**docs/tech-stack/litellm.md · spend logs、调用号与无 DB 模式**（卡 `m2` 锚点）
litellm.md：每次请求生成唯一 call_id，响应头携带 x-litellm-call-id / x-litellm-model-id / x-litellm-response-cost；spend logs 落 LiteLLM_SpendLogs 表（需 Postgres），fallback 请求 metadata 写 attempted_fallbacks 与 original_model_group；无 DB 模式下 max_budget 等预算不生效（global spend 无法累计），生产建议配 Postgres。落点：主干二调用号入账、主干四回退痕迹②、捣乱输入 A 的反例与部署前提全部引自这三条。

**原书第一章 §如何选择模型**（卡 `m2` 锚点）
书：选模型不看排行榜、要在自己的任务上评估；开源模型与闭源差距在 6 个月以内，成本低、可私有化、支持微调，适合成本敏感与数据合规场景（DeepSeek/Kimi/GLM 是国内能力较强者）；绝大多数 Agent 需要支持思考的模型；输出速度直接决定多轮任务的端到端延迟（20 轮×每轮慢 2 秒=多等 40 秒）。落点：配置契约的三组模型=选型结论的网关化——主用 Petro-72B开源私有化部署（合规）、备用 DeepSeek、降级组轻量型号；"换型号不改业务代码"由别名路由兑现，选型评估本身归评估体系（设计稿 11 口径）。

**原书第七章 成本工程节（选型关键维度·成本 + Agent 系统的成本分析·成本监控与预算控制）**（卡 `m2` 锚点）
书：成本要看输入/输出/缓存 token 定价，便宜但成功率低的模型因频繁重试实际更贵，应算每任务平均成本与成本-性能比；Agent 成本三层（模型推理——上下文累积与思考 token 是两个放大因素、工具调用的间接 token 成本、基础设施）；生产应建立实时成本监控（按任务类型/模型/用户维度追踪），并给每任务设成本上限，Agent 陷入循环时自动终止，防异常高额费用。落点：主干五逐调用入账=按维度追踪的最细粒度；主干六"单次+累计"双判据对应"每任务上限"，切降级组对应"分层选择模型"（轻量模型处理简单请求）——书里提醒异构组合需评估验证整体效益，降级组型号的选择凭评估设计稿口径，网关只负责切换机制。

## 越界自查（源：modules.md 边界规则表）

- **边界规则第 1 行（本设计稿主语行）**："任何业务模块绕过 `m2` 直连模型 API 端点（模型流量唯一出口是网关 :4000）"——本设计稿交付的就是这条出口本身：业务调用形状只有 `Gateway.chat`/`Gateway.embed` 两个公开入口，大图上全部调用方边（C4/C5/C7/C13）汇入别名路由节点，无任何绕行直连路径。
- **m3/m4/m12 均为使用公开接口**：`Cache.incr`（键形状承设计稿 02 定形，不自创键）、`Repository.save_audit`（字段清单承设计稿 04 CallAudit）、`Metrics.record_cost/record_ttft/record_latency/over_budget` 与 `Clock`（承设计稿 06）、span 事件走"attrs 记事件、status 不动"的既有通道——零内部 import、零接口修改。
- **调用方零接线**：走查中一切调用方以"（设计稿 09/10/14/17/20 接线）"占位；未替后续设计稿写任何接线代码；embed 的消费方、span 的开与关均注明定形设计稿号。
- **签名纪律**：chat / embed / record_spend 三签名 + config.yaml 契约逐条对齐设计稿 00 登记表 m2 四行；本设计稿新增仅内部件——`_token_stream` 流式包装、`SpendRecorder` 封装（方法形状=卡面 record_spend）、`CostBreaker`（网关内部件，判据走 m12 公开面），全部落在 `app/gateway/` 两文件一契约内，未发明卡面之外的新公开接口；熔断三参数走环境变量，不扩卡面签名。
- **零代码红线**：全文代码块均标注"伪代码"；无 tests/、无 CI 内容。
