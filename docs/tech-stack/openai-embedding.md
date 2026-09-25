# OpenAI 兼容接口三件套：Chat Completions / Function Calling / Embedding API + bge-m3 与 bge-reranker-v2-m3

> 技术栈调研 · 假想业务：Petro-Agent 油田智能平台（FastAPI 异步底座 + LiteLLM 网关 + 问数/问答/问智三 Agent + 国产化部署）
> 所有 API 形状以 OpenAI 官方 API reference 与 FlagEmbedding 官方 README / HuggingFace 模型卡为准；查不到的点已明确标注。

## 使用场景

### 在生产环境解决什么问题

这套接口是"模型网关后面的一切"的标准协议形状，Petro-Agent 的三类 Agent 全建在它上面：

- **Chat Completions API**：统一的对话生成入口。LiteLLM 网关把各家模型（OpenAI / 通义 / DeepSeek / 国产模型）都收敛成这一个接口形状，业务层只写一次客户端代码。消息按 role 分角色（system 给行为指令、user 提需求、assistant 是模型历史回复、tool 回灌工具结果），天然表达多轮对话状态。([Chat Completions API reference](https://platform.openai.com/docs/api-reference/chat/create))
- **Function Calling**：让模型把"我需要查数据"翻译成结构化的函数调用（函数名 + JSON 参数），由应用侧真正执行——官方明确说明 **API 本身不执行任何函数调用**，执行责任在开发者代码。这是问数 Agent（NL2SQL）、问答 Agent（检索工具）、问智 Agent（调度工具）的核心机制。([Cookbook: How to call functions with chat models](https://cookbook.openai.com/examples/how_to_call_functions_with_chat_models))
- **Embedding API + 向量检索**：把文档/问题变成向量，用相似度做语义检索，是 RAG 问答链路的召回层。Embedding API 是文本→向量的标准 REST 形状（`input` + `model` → `data[].embedding`）。([Embeddings API reference](https://platform.openai.com/docs/api-reference/embeddings/create))
- **bge-m3 + bge-reranker-v2-m3**：国产化部署下的开源替代。bge-m3 一个模型同时产出 dense（稠密向量）、sparse（词项权重，类 BM25）、multi-vector（ColBERT）三种检索表示，支持 100+ 语言、最长 8192 token，免授权商用，正好覆盖油田中文技术文档 + 长文档场景；bge-reranker-v2-m3 以 bge-m3 为底座的 cross-encoder 精排模型，官方推荐的 RAG 管线是 **hybrid retrieval + re-ranking**（先混合检索、再精排）。([BAAI/bge-m3 模型卡](https://huggingface.co/BAAI/bge-m3)、[BAAI/bge-reranker-v2-m3 模型卡](https://huggingface.co/BAAI/bge-reranker-v2-m3))

### 同类选型差异（一两句）

- **Chat Completions vs Responses API**：Responses 是 OpenAI 新一代带内置工具编排的接口；Chat Completions 是业界事实标准，几乎所有国产模型与网关（含 LiteLLM）都以它为兼容目标，本项目与国产化落地选它。([Function calling guide](https://platform.openai.com/docs/guides/function-calling))
- **bge-m3 vs text-embedding-3-large**：前者开源可私有部署、单模型三功能、长文本 8192 token、对中文/多语检索在 MIRACL/MKQA 上达 SOTA；后者是闭源 API 模型，按 token 计费。([BAAI/bge-m3 模型卡](https://huggingface.co/BAAI/bge-m3))
- **Embedding（bi-encoder）vs Reranker（cross-encoder）**：前者把两段文本独立编码成向量再算相似度，快但精度低，负责召回 top-k；后者把 query+passage 拼一起直接打分，精度高但慢，负责精排过滤——两者串联是官方推荐管线。([BAAI/bge-m3 模型卡](https://huggingface.co/BAAI/bge-m3))

## 核心能力面

### Chat Completions API

消息角色（role 枚举：`developer | system | user | assistant | tool | function`，其中 `function` role 为旧版函数调用遗留、已废弃应由 `tool` 替代）：

| 角色 | 关键字段 | 说明 | 来源 |
|---|---|---|---|
| system | content, name? | 开发者指令；o1 及更新模型推荐用 `developer` 角色替代 | [API reference](https://platform.openai.com/docs/api-reference/chat/create) |
| user | content (string 或 content parts 数组，可含 text/image_url/input_audio/file) | 用户输入 | 同上 |
| assistant | content?, tool_calls?, function_call?(废弃), name? | 模型回复；`content` 在只有 `tool_calls` 时可为空 | 同上 |
| tool | content, tool_call_id | 工具结果回灌，`tool_call_id` 必须对应上一条 assistant 消息里的某个 tool call id | 同上 |
| function | content, name | 旧版角色，已由 `tool` 替代（deprecated） | 同上 |

请求关键参数：

- `messages`: 消息数组，按序构成对话历史。
- `tools`: 工具声明数组，元素形状 `{"type": "function", "function": {"name", "description", "parameters"(JSON Schema), "strict"?}}`；目前 `type` 只支持 `"function"`。
- `tool_choice`: `"none"`（禁用工具）/ `"auto"`（有工具时默认）/ `"required"`（必须调工具）/ `{"type": "function", "function": {"name": "my_function"}}`（强制调指定函数）。
- `stream`: bool；`stream_options: {"include_usage": true}` 让最后一个 chunk（`data: [DONE]` 之前）携带整次请求的 token 用量统计。([API reference](https://platform.openai.com/docs/api-reference/chat/create))
- `parallel_tool_calls`: bool，设为 false 时最多产生 0 或 1 个工具调用。([Function calling guide](https://platform.openai.com/docs/guides/function-calling))

响应关键结构：

- `choices[0].message.content`：文本回复。
- `choices[0].message.tool_calls`：数组，元素 `{"id": "call_xxx", "type": "function", "function": {"name", "arguments"}}`；**`arguments` 是 JSON 字符串而非对象，官方警告模型可能生成非法 JSON 或幻觉参数，必须在代码里校验**。([API reference](https://platform.openai.com/docs/api-reference/chat/create))
- `choices[0].finish_reason`：`"stop" | "length" | "tool_calls" | "content_filter"`（另有废弃值 `"function_call"`）；`"tool_calls"` 表示模型发起了工具调用。
- 流式 chunk（`object: "chat.completion.chunk"`）：`choices[0].delta` 含 `content` / `role` / `tool_calls`（元素带 `index`，arguments 以字符串片段增量到达）/ `function_call`(废弃)；`finish_reason` 只在最后一个 chunk 非空；`stream_options.include_usage=true` 时最后一个 chunk 的 `usage` 字段非空。([API reference](https://platform.openai.com/docs/api-reference/chat/create))

### Function Calling 机制（Chat Completions 五步循环）

官方定义的五步流程：①带 tools 请求模型 → ②收到模型的 tool call → ③应用侧执行代码 → ④把工具输出作为 tool 消息回灌、二次请求 → ⑤收到最终回复（或继续更多轮 tool call）。([Function calling guide](https://platform.openai.com/docs/guides/function-calling))

- 工具定义走 JSON Schema，支持 `properties` / `enum` / 嵌套对象；`strict: true` 走 structured outputs 保证参数严格符合 schema，但要求每个 object 设 `additionalProperties: false` 且所有 `properties` 字段都列入 `required`（可选字段用 `type: ["string", "null"]` 表达）；Chat Completions 默认非 strict。([Function calling guide](https://platform.openai.com/docs/guides/function-calling))
- 新模型（gpt-5、4.1、4o）支持一轮内并行调用多个函数；模型可同时返回 0/1/N 个调用，代码必须按 N 个处理。([Cookbook](https://cookbook.openai.com/examples/how_to_call_functions_with_chat_models))
- token 成本：函数定义以注入 system 消息的方式进上下文，计入输入 token 并计费；官方软建议**每轮起始可用函数控制在 20 个以内**。([Function calling guide](https://platform.openai.com/docs/guides/function-calling))

### Embedding API

- 端点 `POST /v1/embeddings`，入参：`input`（string / string 数组 / token 数组；**单条上限 8192 token，单次请求所有 input 合计上限 300,000 token，数组长度上限 2048**）、`model`（官方可选 `text-embedding-ada-002 | text-embedding-3-small | text-embedding-3-large`）、`dimensions`（仅 3 代及以后模型支持，可截断输出维度）、`encoding_format`（`"float" | "base64"`）、`user`。([Embeddings API reference](https://platform.openai.com/docs/api-reference/embeddings/create))
- 响应：`{"object": "list", "data": [{"object": "embedding", "embedding": [float...], "index": 0}], "model", "usage": {"prompt_tokens", "total_tokens"}}`。ada-002 输出 1536 维（3 代模型维度以 embedding guide 为准，本页未列出具体维数）。
- 向量检索本身不是 OpenAI API 的能力，是应用侧模式：embedding → 存向量库 → 查询时 embed query → 相似度（inner product / cosine）取 top-k。

### bge-m3 与 FlagEmbedding

模型卡关键规格：`BAAI/bge-m3`，维度 **1024**，序列长度 **8192**，多语言（100+），统一支持 dense / sparse / multi-vector(ColBERT) 三种检索，从 bge-m3-unsupervised 统一微调而来。([BAAI/bge-m3 模型卡](https://huggingface.co/BAAI/bge-m3))

FlagEmbedding 关键类与方法（`pip install -U FlagEmbedding`）：

- `FlagEmbedding.BGEM3FlagModel('BAAI/bge-m3', use_fp16=True)`（fp16 提速、轻微降质）。([BAAI/bge-m3 模型卡](https://huggingface.co/BAAI/bge-m3))
- `model.encode(sentences, batch_size=12, max_length=8192, return_dense=True, return_sparse=True, return_colbert_vecs=True)` → dict，键含 `'dense_vecs'`、`'lexical_weights'`（sparse）、`'colbert_vecs'`；dense 相似度用内积 `emb1 @ emb2.T`。
- `model.convert_id_to_token(lexical_weights)` 查看每个 token 的稀疏权重；`model.compute_lexical_matching_score(lw1, lw2)` 算 sparse 匹配分；`model.colbert_score(q_vecs, p_vecs)` 算 ColBERT 分；`model.compute_score(pairs, max_passage_length=128, weights_for_different_modes=[0.4, 0.2, 0.4])` 对文本对同时算 dense/sparse/colbert 及加权总分。
- **bge-m3 查询时不再需要加 instruction**（与 bge-v1.5 系列不同）。([BAAI/bge-m3 模型卡 FAQ](https://huggingface.co/BAAI/bge-m3))
- 新版通用接口：`FlagEmbedding.FlagAutoModel.from_finetuned('BAAI/bge-base-en-v1.5', query_instruction_for_retrieval=...)`（README quick start；bge-m3 用 `BGEM3FlagModel` 仍是模型卡给的用法）。([FlagEmbedding README](https://github.com/FlagOpen/FlagEmbedding))

### bge-reranker-v2-m3 与 FlagEmbedding

- cross-encoder：query 与 passage 一起输入，直接输出相关性分数（logit，可 `normalize=True` 经 sigmoid 映射到 [0,1]），不输出 embedding；基于 bge-m3 底座，轻量、多语言、易部署、推理快。([BAAI/bge-reranker-v2-m3 模型卡](https://huggingface.co/BAAI/bge-reranker-v2-m3))
- `FlagEmbedding.FlagReranker('BAAI/bge-reranker-v2-m3', use_fp16=True)`；`reranker.compute_score(['query', 'passage'])` 或 `compute_score([[q1,p1],[q2,p2]], normalize=True)`。
- transformers 等价用法：`AutoModelForSequenceClassification.from_pretrained(...)`，取 `model(**inputs).logits.view(-1)`；tokenizer 需 `max_length=512`。([BAAI/bge-reranker-v2-m3 模型卡](https://huggingface.co/BAAI/bge-reranker-v2-m3))
- 微调数据格式：jsonl 每行 `{"query": str, "pos": List[str], "neg": List[str], "prompt": str}`。([同上](https://huggingface.co/BAAI/bge-reranker-v2-m3))

## 典型用例模式

### 模式 1：最小 Chat Completions 多轮对话（非流式）

```python
resp = client.chat.completions.create(
    model="gpt-5",
    messages=[
        {"role": "system", "content": "你是油田数据助手"},
        {"role": "user",   "content": "昨天A12井产量多少？"},
    ],
)
text = resp.choices[0].message.content
```

消息数组随轮次追加 assistant 回复与新的 user 消息即可延续上下文。([API reference](https://platform.openai.com/docs/api-reference/chat/create))

### 模式 2：Function Calling 五步闭环（问数 Agent 的 NL2SQL 原型，来自官方 cookbook 的 ask_database 例）

```python
tools = [{
    "type": "function",
    "function": {
        "name": "ask_database",
        "description": "Use this function to answer user questions ...",
        "parameters": {
            "type": "object",
            "properties": {"query": {"type": "string", "description": "SQL..."}},
            "required": ["query"],
        },
    },
}]

# Step 1: 带 tools 请求
resp = client.chat.completions.create(model=GPT_MODEL,
    messages=[{"role": "user", "content": "哪张专辑曲目最多？"}],
    tools=tools, tool_choice="auto")
msg = resp.choices[0].message
messages.append(msg.to_dict())          # assistant 消息含 tool_calls，必须原样入历史

# Step 2-3: 检测并执行
tool_calls = msg.tool_calls             # 可能 0/1/N 个
tc = tool_calls[0]
args = json.loads(tc.function.arguments)   # arguments 是 JSON 字符串，需校验
results = ask_database(conn, args["query"])  # 应用侧执行，API 不替你执行

# Step 4: 结果以 role="tool" 回灌，tool_call_id 对应
messages.append({"role": "tool", "tool_call_id": tc.id,
                 "name": tc.function.name, "content": results})

# Step 5: 二次请求得最终自然语言答案
final = client.chat.completions.create(model=GPT_MODEL, messages=messages)
```

要点：role 为 `tool` 的消息必须是对前面 assistant 消息中 `tool_calls` 的应答，靠 `tool_call_id` 对齐；`finish_reason == "tool_calls"` 即模型决定调工具。([Cookbook](https://cookbook.openai.com/examples/how_to_call_functions_with_chat_models))

### 模式 3：流式输出 + tool_calls 聚合

`stream=True` 后逐 chunk 读 `choices[0].delta.content`；工具调用时 delta 里是 `tool_calls` 数组片段（按 `index` 归并、`function.arguments` 逐段拼接），最后一块才有 `finish_reason`；要 token 用量需设 `stream_options={"include_usage": true}`，中断的流可能丢失末尾 usage chunk。([API reference](https://platform.openai.com/docs/api-reference/chat/create))

### 模式 4：Embedding 批量向量化

```python
resp = client.embeddings.create(
    model="text-embedding-ada-002",
    input=["文档段1", "文档段2"],   # 数组批量；单条 ≤8192 token，合计 ≤30万 token
    encoding_format="float",
)
vecs = [d.embedding for d in resp.data]   # data 按 index 对齐 input
```

检索时 embed query → 与库内向量算内积/cosine → top-k →（可选）reranker 精排。([Embeddings API reference](https://platform.openai.com/docs/api-reference/embeddings/create))

### 模式 5：bge-m3 混合检索 + bge-reranker-v2-m3 精排（国产化 RAG 管线）

```python
from FlagEmbedding import BGEM3FlagModel, FlagReranker

m3 = BGEM3FlagModel('BAAI/bge-m3', use_fp16=True)
out = m3.encode(passages, return_dense=True, return_sparse=True,
                max_length=8192)                      # dense_vecs + lexical_weights
dense_scores = q_out['dense_vecs'] @ out['dense_vecs'].T   # 内积召回 top-k

reranker = FlagReranker('BAAI/bge-reranker-v2-m3', use_fp16=True)
scores = reranker.compute_score([[query, p] for p in topk_passages],
                                normalize=True)      # sigmoid → [0,1]，取最高分
```

官方建议管线即 hybrid retrieval（embedding + sparse/BM25 类词项权重）+ re-ranking；hybrid 工程落地可参考 Vespa、Milvus（模型卡点名）。([BAAI/bge-m3 模型卡](https://huggingface.co/BAAI/bge-m3))

## 选型与版本

- **协议基线**：以 OpenAI Chat Completions / Embeddings API reference 当前版本为准（`object: "chat.completion"` / `"chat.completion.chunk"` / `"list"`），该形状被 LiteLLM 等网关作为兼容目标，国产模型私有化部署沿用同一形状。
- **openai Python SDK**：cookbook 示例使用 `client.chat.completions.create(...)` / `client.responses.create(...)` 形态（v1.x SDK）；本项目伪代码以 HTTP 形状为准，SDK 版本基线建议 `openai>=1.x`。（具体最低版本号未在已读官方页中给出——**未找到公开文档**明示与本 API 形状对应的最低 SDK 版本，落地时以实际所用模型网关的兼容说明为准。）
- **模型基线（可替换为国产等价物）**：对话 gpt-5 系；embedding `text-embedding-3-small`（API 路线）或 `BAAI/bge-m3`（私有化路线，1024 维 / 8192 token）；精排 `BAAI/bge-reranker-v2-m3`。
- **FlagEmbedding**：`pip install -U FlagEmbedding`（纯推理不装 finetune 依赖；微调装 `FlagEmbedding[finetune]`）。包内版本号未在 README/模型卡中锚定，**未找到公开文档**给出推荐锁定版本，建议在 requirements 中锁定当时最新 release 并固定模型 revision。([FlagEmbedding README](https://github.com/FlagOpen/FlagEmbedding))
- **bge-reranker-v2-m3 tokenizer 长度**：transformers 用法示例中 `max_length=512`，长文档精排需自行切片。([BAAI/bge-reranker-v2-m3 模型卡](https://huggingface.co/BAAI/bge-reranker-v2-m3))
- 教训项（生产注意）：模型生成的 `arguments` 可能非法/幻觉，执行前必须校验（官方原文警告）；工具定义吃输入 token，每轮起始工具数控制在 20 个以内；流被中断时可能拿不到 usage 统计。([API reference](https://platform.openai.com/docs/api-reference/chat/create)、[Function calling guide](https://platform.openai.com/docs/guides/function-calling))

## 官方文档锚点

- Chat Completions API reference（消息角色/tools/tool_call_id/流式 delta/finish_reason 权威定义）：https://platform.openai.com/docs/api-reference/chat/create
- Function calling guide（五步流程、strict 模式、token 计费、parallel_tool_calls、每轮 <20 工具建议）：https://platform.openai.com/docs/guides/function-calling
- Cookbook: How to call functions with chat models（Chat Completions 函数调用四步代码范式、NL2SQL 例、tool 消息回灌）：https://cookbook.openai.com/examples/how_to_call_functions_with_chat_models
- Embeddings API reference（input 限制 8192/300k token、dimensions、encoding_format、响应结构）：https://platform.openai.com/docs/api-reference/embeddings/create
- FlagEmbedding README（安装、FlagAutoModel quick start）：https://github.com/FlagOpen/FlagEmbedding
- BAAI/bge-m3 模型卡（1024 维 / 8192 token / 三功能 / BGEM3FlagModel 全部用法 / hybrid+rerank 管线建议）：https://huggingface.co/BAAI/bge-m3
- BAAI/bge-reranker-v2-m3 模型卡（模型选型表、FlagReranker 用法、transformers 等价用法、微调数据格式）：https://huggingface.co/BAAI/bge-reranker-v2-m3

> 备注：`platform.openai.com/docs/guides/function-calling-chat-completions` 曾存在的独立 guide URL 现返回 404，Chat Completions 侧的函数调用范式以 cookbook 笔记本为锚；Responses API 的 `function_call`/`function_call_output` 结构与 Chat Completions 的 `tool_calls`/`role: "tool"` 结构不同，伪代码走 Chat Completions 形状时不要混用。
