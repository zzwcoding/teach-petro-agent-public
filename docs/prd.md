# Petro-Agent 油田智能平台 PRD（设计稿）

状态: 已定稿
深度档位: 能讲概念 + 能讲设计取舍 + 能讲源码级机制（文档按三档分层写）

## 业务设定

Petro-Agent 是给油田技术团队用的智能分析平台：地质/油藏工程师用自然语言问平台上的东西——问报告（"N-2 井的完井方式是什么"）、问数据（"上个月产量最高的三口井"）、要成品（"把这份分析做成汇报 PPT，配张示意图"）。平台后台有三个专职 Agent（问答/问数/问智）加一个统一 AI 网关，全部跑在国产化环境（麒麟 OS + 金仓数据库）上。

反向设计说明：这个业务是"被逼出来的"——问数/问答/问智三大职责各逼出一个 Agent；问数的"意图→规划→工具调用→反思校验"逼出 LangGraph 状态机；问答的"分块→向量化→检索→重排序→生成"逼出完整 RAG 管道；多模型调度逼出 LiteLLM 网关；央企环境逼出国产化适配与国密。知识点清单（A–J）逐条都有业务流程认领，见文末对账表。

## 角色与场景清单

| 角色 | 一句话 | 主场景 |
|---|---|---|
| 油藏工程师（老王） | 平台的主要用户，懂业务不懂 SQL | "上个月产量最高的三口井"——问数 Agent 状态机的一生：意图理解→选表→生成 SQL→安全校验→执行→结果校验→图表→SSE 流式推给他 |
| 地质工程师（小李） | 常翻钻井报告 | "N-2 井的完井方式是什么"——RAG 管道的一生：报告 PDF 解析分块→bge-m3 向量化→混合检索→bge 重排序→带引用回答；不满意追问时检索进 ReAct 循环 |
| 平台运维（阿强） | 管部署和国产化 | 把平台从 PostgreSQL 迁到金仓、给敏感字段加 SM4、麒麟 OS 上 Docker 部署、主模型挂了看网关自动 Fallback 日志 |
| 汇报人（主任） | 要成品不要过程 | "这份分析做成 PPT 再配张示意图、出个语音解读"——问智模块的一生：分析结果→python-pptx 生成 PPT→万相异步文生图→edge-tts 出语音 |

> 每个主场景都有起点（角色发起请求）与终点（角色看到结果）；场景依次为：起楼 → 小李问报告 → 老王问数 → 老王问岩性 → 主任要汇报 → 阿强上生产 → 又快又稳。

## 功能清单

### F1 异步底座与 SSE 会话通道

- **做什么**：FastAPI 应用承载所有 Agent 对话接口，统一以 SSE 流式把 token/事件推给前端；带鉴权、依赖注入、请求日志。
- **不做什么**：不做 WebSocket 双向通道（SSE 单向够用），不做前端 UI。
- **涉及知识点**：G 后端底座——AI 对话是长连接流式场景，逼出异步编程模型与 SSE 的工程细节。
- **涉及技术栈**：FastAPI/asyncio/ASGI + SSE（fastapi-sse.md：EventSourceResponse、Depends、StreamingResponse 坑点）。
- **信源锚点**：book/chapter2.md §Agent如何调用大模型（API 消息结构、流式 delta）。
- **业务逻辑要点**：
  1. 路由 `POST /chat/{agent}`，依赖注入鉴权与会话；返回 `EventSourceResponse`，路由内 `yield` 事件帧（agent 类型/ token / tool_call / done）。
  2. 每个事件帧是 `{event, data}`；token 帧 data 为 JSON `{delta}`；结束帧 event=`done`；异常帧 event=`error` 后关闭流。
  3. 生成器内每轮必须 `await`（即使 `anyio.sleep(0)`），否则断连无法取消（异步生成器的取消语义）。
  4. 断线恢复：`Last-Event-ID` 头从 Redis 取最近事件续推。

### F2 AI 网关多模型调度

- **做什么**：所有 Agent 不直连模型，统一走 LiteLLM 网关：模型配置外置 yaml，主模型失败自动 Fallback 到备用，记录每次调用的模型/token/延迟。
- **不做什么**：不做模型微调与自建推理服务（路线已定：通用模型 + RAG + 工具）。
- **涉及知识点**：F AI 网关——多模型统一调度是生产可靠性的核心。
- **涉及技术栈**：LiteLLM（litellm.md：model_list 三字段、Router simple-shuffle、三类 fallbacks、num_retries vs max_retries、spend 落 Postgres）；OpenAI 兼容接口（openai-embedding.md：base_url 只改一处）。
- **信源锚点**：book/chapter1.md §如何选择模型；book/chapter7.md 成本工程节。
- **业务逻辑要点**：
  1. `config.yaml` 的 `model_list` 配"Petro-72B 主模型 + DeepSeek 备用"，OpenAI SDK 只改 `base_url` 指向网关 :4000。
  2. 路由策略 `simple-shuffle`；`fallbacks` 配主→备；`allowed_fails + cooldown_time` 让故障部署冷却。
  3. 重试只走 router 层（`num_retries`），SDK `max_retries` 置 0 防套娃。
  4. 每次调用拿 `x-litellm-call-id` 与 spend 记录写 Redis（F4 计数）+ Postgres（F3 审计表）——设计要点：无 DB 模式预算形同虚设。
  5. 故意关停主模型做故障演练，Fallback 日志可查。

### F3 数据持久化层

- **做什么**：SQLAlchemy 2.0 async 统一管理会话记录、用量审计、知识库元数据、问数结果快照；开发库 PostgreSQL，生产切金仓。
- **不做什么**：不做分库分表，不做手写 SQL 绕过 ORM 的业务代码。
- **涉及知识点**：G 后端底座——异步 ORM 是 FastAPI 底座的标配，金仓适配是国产化核心环节。
- **涉及技术栈**：SQLAlchemy 2.0 async（sqlalchemy-async.md：create_async_engine、async_sessionmaker、selectinload、stream）；金仓官方 ksycopg2 异步路径（guochan-db-os.md：asyncpg 无金仓官方支持）。
- **业务逻辑要点**：
  1. `create_async_engine` + `async_sessionmaker(expire_on_commit=False)`，请求作用域内一个 session，请求结束归还连接池。
  2. 关系查询一律 `selectinload` 急加载（asyncio 禁止隐式 IO，lazy="raise"）。
  3. 方言抽象：`postgresql+asyncpg://` ↔ 金仓 `ksycopg2` 异步通信，连接串外置配置——设计要点：金仓兼容模式是 initdb 期固化的。
  4. 迁移踩坑对照表（PG ↔ 金仓 方言差异）是 F11 的素材。

### F4 Redis 缓存与队列

- **做什么**：Redis 承载四件事：会话上下文缓存、网关用量计数、SSE 断线续传事件缓冲、问智异步任务队列。
- **不做什么**：不做 Redis 集群与哨兵（单机部署），不存大块正文（那是 F5 的活）。
- **涉及知识点**：G 后端底座——中间件的选型与用法模式是后端底座的核心要求。
- **涉及技术栈**：redis-py asyncio（redis-minio.md：from_url、Pub/Sub、Streams 消费组 XADD/XREADGROUP/XACK、官方无高层缓存抽象）。
- **业务逻辑要点**：
  1. cache-aside 自己封一层（官方无抽象）：读先查 Redis  miss 回源 Postgres 再回填，带 TTL。
  2. 任务队列用 Streams 消费组（可重试、XAUTOCLAIM 打捞卡住消息），不用 Pub/Sub（不可靠）——设计要点：两形态取舍。
  3. SSE 事件按 `thread_id` 追加到 Stream，容量 MAXLEN 裁剪。

### F5 MinIO 对象存储

- **做什么**：MinIO 存报告原文 PDF、问智产物（PPT/图片/音频）；前端用预签名 URL 直传直下载，不过 FastAPI 转发。
- **不做什么**：不做 CDN，不做跨区域复制。
- **涉及知识点**：G 后端底座——S3 协议对象存储。
- **涉及技术栈**：minio-py（redis-minio.md：put_object 流式、get_object 必须 close+release_conn、presigned_get_object 默认 7 天）。
- **业务逻辑要点**：
  1. 桶规划：`reports`（原始报告）、`artifacts`（生成产物）；上传走 `presigned_put_object`。
  2. 万相返回的图 URL 24 小时过期——网关层下载转存 MinIO（设计要点：异步生成接口的转存义务）。

### F6 智能问答 RAG 管道

- **做什么**：Volve 钻井/完井报告 PDF 经解析分块→bge-m3 向量化→向量库→混合检索（向量+BM25→RRF）→bge-reranker 重排序→带引用生成；建 RAGAS 评估集跑 faithfulness/answer relevancy/context precision。
- **不做什么**：不做 GraphRAG/RAPTOR 生产实现（只讲概念与选型），不做多模态图表入库的完整实现（讲思路）。
- **涉及知识点**：B RAG 全流程——分块三策略、稠密/稀疏嵌入、混合检索与 RRF、重排序、生成引用、评估指标。
- **涉及技术栈**：bge-m3 / bge-reranker-v2-m3（openai-embedding.md：FlagReranker.compute_score、hybrid retrieval 官方推荐管线）；Embedding API 形状。
- **信源锚点**：book/chapter3.md §RAG基础（分块/稠密/稀疏/混合检索三阶段/三指标）、§超越扁平文本（Contextual Retrieval、Agentic RAG）；book/chapter7.md（评估指标口径）。
- **业务逻辑要点**：
  1. 离线索引：PDF 解析→递归分块（256–1024 token、重叠 10–20%，对比固定/语义分块）→bge-m3 批量嵌入→向量库 + BM25 倒排索引双写。
  2. 在线检索：双路召回 top-k（向量 + BM25）→RRF 融合→bge-reranker 精排 top-n→按引用格式拼进提示词。
  3. 生成：系统提示词要求"每句论断标注 [报告名 p.页码]"，无据不答。
  4. 评估：20+ 石油领域构造 QA 对跑 RAGAS，三指标出报告（设计要点：评估驱动迭代）。
  5. 进阶支线：追问类问题走 Agentic RAG（检索变工具、ReAct 多轮），只讲设计不讲实现。

### F7 智能问数 Agent 状态机

- **做什么**：LangGraph 状态机把"自然语言→数据查询"拆成节点：意图理解→Schema 检索选表→SQL 生成→SQL 安全校验→执行→结果校验→（失败回边）反思修正，最多 3 次；成功则解释结果并给图表建议。
- **不做什么**：不做写库操作（只读分析），不做跨库联邦查询。
- **涉及知识点**：A 问数全链路 + E 编排状态机——意图理解/规划/工具调用/反思校验四件套靠状态机承载。
- **涉及技术栈**：LangGraph（langgraph.md：StateGraph/reducer、条件边、checkpointer、官方 SQL Agent 教程节点同构、中断恢复整节点重跑所以节点幂等）。
- **信源锚点**：book/chapter1.md §ReAct循环、§编排模式（工作流 vs 自主）；book/chapter5.md 故障四层分类与恢复分级（重试/熔断/死亡螺旋）。
- **业务逻辑要点**：
  1. State（TypedDict）：`question / intent / tables / sql / error / attempts / result`；`attempts` 用 reducer 累加。
  2. 节点一一对应官方教程：意图澄清（信息不足先反问）→get_schema 选表→generate_query（few-shot 示例固定保缓存）→check_query（安全校验）→run_query→结果校验（空结果/报错→条件边回 generate_query，attempts≥3 熔断转人工话术）。
  3. SQL 安全校验（sql_guard）：AST 解析只放行 SELECT、白名单表、强制 LIMIT——设计要点：执行层约束优先于提示词约束（代码即规则）。
  4. 反思修正把错误信息结构化成 tool 结果回灌（与 OpenAI tool 消息同构）——源码级讲"错误回灌的提示词工程"。
  5. 中断/人工审批用 LangGraph interrupt()，恢复时整节点重跑——副作用节点必须幂等。

### F8 Function Calling 工具体系

- **做什么**：统一工具注册表：每个工具声明名称/描述/参数 JSON Schema/所需权限级别；Agent 通过 OpenAI Function Calling 调用；权限按角色过滤工具可见性；工具异常走标准错误格式回灌模型。
- **不做什么**：不自研 Agent 框架的函数调用协议（用 OpenAI 标准），不做 MCP 服务化（讲概念与对标）。
- **涉及知识点**：D Function Calling——工具注册/页面唤起/API 集成是平台核心职责之一；工具描述艺术与参数保真是设计重点。
- **涉及技术栈**：OpenAI Function Calling 五步循环（openai-embedding.md：tools 字段/tool_call_id 回灌/arguments 必须校验）；LangGraph tool 节点。
- **信源锚点**：book/chapter4.md 全章（五分类、ACI、工具描述的艺术、参数保真、执行-验证-反馈闭环）。
- **业务逻辑要点**：
  1. 注册表条目：`{name, description(写"什么时候用"+反例), parameters(JSON Schema), permission_level}`——description 质量直接决定选型准确率（书：72%→90%）。
  2. 工具三类实例：数据库查询工具（F7 的执行器）、页面唤起工具（返回前端路由指令）、API 集成工具（调外部系统）。
  3. 调用循环：模型返回 tool_calls→框架校验 arguments（JSON 解析失败即标准错误回灌）→权限检查→执行→tool 消息回灌→模型继续。
  4. 异常三分法：参数错（可纠正，回灌让模型重试）/权限拒（明确拒绝+理由入轨迹）/下游错（结构化错误码）。
  5. 禁止静默参数注入/转换——模型感知的世界与工具操作的世界不能有系统性偏差（书 §参数传递的保真性）。

### F9 领域工具示例（岩性识别/产量预测）

- **做什么**：把两个油田领域能力封装为 F8 注册表里的正式工具：`identify_lithology(well_id, depth_range)`（XGBoost 测井岩性识别）、`forecast_production(well_id, days)`（LSTM 产量预测）；问数/问答 Agent 可自主调用并解读。
- **不做什么**：不训练新模型（用 FORCE 2020 复现方案与既有模型文件），不讲深度学习原理。
- **涉及知识点**：D 的落地实例 + 编排（多 Agent 协作的"新信息判据"案例）。
- **涉及技术栈**：F8 注册表；LangGraph 并行工具调用。
- **信源锚点**：FORCE 2020/Volve 数据与方案；book/chapter10.md 多 Agent 何时真正优于单 Agent（执行/工具反馈=新信息，正例）。
- **业务逻辑要点**：
  1. 工具是"感知工具"（书 ch4 五分类）：内部跑模型，返回压缩后的结论+关键数值，不把原始曲线塞回上下文。
  2. 权限：预测工具只读角色可用；写操作类工具（若有）需更高权限级。
  3. 用户问"帮我分析 F-1 井 2500-2600m 岩性"→ Agent 自主选工具→结果解读→SSE 流式输出。

### F10 问智多模态生成

- **做什么**：把问数/问答的分析结果变成成品：python-pptx 生成汇报 PPT（模板驱动）、万相异步文生图配示意图、edge-tts 出语音解读、FunASR 语音提问转文字。
- **不做什么**：不自研生成模型，不做视频生成的完整实现（讲接口形态与异步轮询模式，图/视频同构）。
- **涉及知识点**：C 问智——多模态接口集成；异步任务模式与转存义务。
- **涉及技术栈**：python-pptx、万相 API、edge-tts、FunASR（multimodal-api.md：万相两步异步任务+URL 24h 过期、FunASR OpenAI 兼容接口、提议者-审核者生成 PPT）。
- **信源锚点**：book/chapter5.md §代码：通用Agent的元能力（多媒体生成：Proposer 写代码、Reviewer 渲染检查）。
- **业务逻辑要点**：
  1. PPT：分析结果 JSON→模板布局→`Presentation()` 生成→存 MinIO→预签名 URL 返回；进阶讲"提议者-审核者"：生成后渲染截图交视觉模型审排版。
  2. 文生图：`X-DashScope-Async` 创建任务→轮询 `tasks/{id}`→SUCCEEDED 后下载转存 MinIO（F5 转存义务）。
  3. 文生视频：与图同构（创建任务→轮询），只讲模式。
  4. TTS：edge-tts 原型（无 SLA 的定位要说清）；ASR：FunASR 走 OpenAI 兼容接口可挂 LiteLLM 网关统一管理。
  5. 所有产物元数据入 F3 表，文件入 F5。

### F11 国产化适配

- **做什么**：平台从 PG+Linux 迁到金仓+麒麟的完整适配：Docker 交付、数据库方言迁移、敏感字段 SM4 加密存储、接口报文 SM3 摘要。
- **不做什么**：不做达梦双栈同时支持（讲 dmPython 差异点即可），不做等保测评流程。
- **涉及知识点**：I 国产化——央企环境差异化优势。
- **涉及技术栈**：金仓 ksycopg2/兼容模式、麒麟 V10（guochan-db-os.md）；gmssl SM3/SM4（guomi-sm.md：set_key+crypt_ecb/crypt_iv_cbc、无 GCM 实测）；Docker 多阶段构建+compose healthy 依赖（docker.md）。
- **信源锚点**：金仓替换公开行业案例。
- **业务逻辑要点**：
  1. 迁移路径：asyncpg 连接串→金仓官方驱动；方言差异逐条记录（兼容模式 initdb 期固化，SQLAlchemy 用官方方言包）。
  2. 敏感字段（如用户手机号）：写库前 SM4-CBC 加密，应用层密钥管理；接口日志对报文做 SM3 摘要留痕。
  3. 交付：多阶段 Dockerfile（非 root）+ compose `depends_on: service_healthy`；信创内网用 `docker save/load` 离线交付。
  4. 验证：同一套业务代码 PG/金仓双跑测试用例。

### F12 性能优化与可观测

- **做什么**：三层优化：提示词/上下文层的 KV Cache 友好布局；网关层的 TTFT/成本监控与熔断；系统层的 Trace 可观测。
- **不做什么**：不做推理引擎级优化（vLLM 调参只提概念），不做模型蒸馏。
- **涉及知识点**：J 性能优化 + H Prompt 工程——KV Cache、流式延迟、成本工程。
- **涉及技术栈**：系统提示词冻结+动态信息末尾追加（book ch2）；LiteLLM spend/call-id（F2 已有）；Trace 概念。
- **信源锚点**：book/chapter7.md（TTFT/p95、成本上限熔断、OpenTelemetry Trace）。
- **业务逻辑要点**：
  1. 三条缓存铁律：系统提示词与工具定义冻结、动态信息只追加末尾、用标准 API 格式——时间戳这类动态内容别放前缀（首 token 延迟暴涨案例）。
  2. 少轮对话靠稳定前缀命中 Prompt Cache（命中价约 1/10）；长会话按 token 阈值批量压缩 tool results。
  3. 网关记录每次调用 TTFT/总延迟/成本，超预算熔断转便宜模型（成本-性能曲线讲取舍）。
  4. Trace/span 树采集：每次 Agent 运行的节点耗时、工具调用、token 成本可视化（类比"体检指标"）。

## 知识点认领对账（A–J）

| 知识域 | 认领功能点 | 状态 |
|---|---|---|
| A 智能问数（意图/规划/工具/反思） | F7 | ✅ |
| B RAG 全流程 | F6 | ✅ |
| C 问智多模态 | F10 | ✅ |
| D Function Calling 工具体系 | F8、F9 | ✅ |
| E Agent 编排状态机 | F7（LangGraph） | ✅ |
| F AI 网关 | F2 | ✅ |
| G 后端底座（FastAPI/SQLA/Redis/MinIO） | F1、F3、F4、F5 | ✅ |
| H LLM 通用能力（Prompt 工程） | F6 生成环节、F7 节点提示词、F12 上下文工程 | ✅ |
| I 国产化 | F11 | ✅ |
| J 性能优化 | F12 | ✅ |

## 技术栈认领对账（tech-stack.md 对账表 17 项）

| 点名技术 | 认领功能点 | 用到的核心能力 |
|---|---|---|
| FastAPI/asyncio/ASGI | F1 | EventSourceResponse、Depends |
| SSE | F1 | 事件帧协议、断线续传 |
| SQLAlchemy 2.0 async | F3 | AsyncEngine/async_sessionmaker/selectinload |
| KingbaseES/PG/MySQL | F3、F11 | 连接串外置+ksycopg2 异步路径、方言迁移 |
| Redis | F4 | cache-aside 封装、Streams 消费组 |
| S3/MinIO | F5 | 预签名 URL、转存义务 |
| OpenAI 兼容接口 | F2、F8 | base_url 统一、消息结构 |
| Embedding/向量检索/Reranker | F6 | bge-m3 嵌入、BM25+RRF、bge-reranker 精排 |
| Function Calling | F8 | tools 声明→执行→tool 消息回灌五步 |
| LangGraph | F7 | StateGraph/条件边/checkpointer/interrupt |
| LiteLLM | F2 | model_list/Router/fallbacks/spend |
| Docker | F11 | 多阶段构建、compose healthy 编排 |
| 麒麟/统信 | F11 | RHEL8 兼容系部署、离线交付 |
| 金仓/达梦 | F11（达梦差异点） | 兼容模式、dmPython 占位符差异 |
| SM3/SM4 | F11 | SM4-CBC 字段加密、SM3 摘要留痕 |
| 多模态接口 | F10 | python-pptx/万相异步/edge-tts/FunASR |
| Git/Git Flow/CI | — | **有意降级**（按项目范围裁剪） |

## 范围外明确不做

- 模型训练/微调/SFT/RL：领域化路线已定"通用模型 + RAG + 工具"。
- GraphRAG/RAPTOR 生产实现：只讲概念与选型判断（book ch3 有锚点）。
- WebSocket/前端：SSE 单向够用。
- vLLM/推理引擎调参与模型蒸馏：概念提及即可。
- 达梦双栈适配实操：讲差异点，不双跑。
- MCP 协议服务化：讲概念与对标（book ch4），不实现。
- 等保测评/国密合规流程：只讲技术实现（gmssl）。

## 变更记录

| 日期 | 变更 | 触发 |
|---|---|---|
| 2026-09-12 | 初稿 F1–F12 + 双向对账表 | 业务方向确定（Petro-Agent，三档深度） |
| 2026-09-13 | 状态翻已定稿；角色与场景清单定稿 | 叙事框架修正 |
| 2026-09-14 | 增补功能点（前沿对齐升级）：F13–F16 | 调研报告一~四（references/） |
| 2026-09-15 | 版本 3 增补功能点（AE 工作台+语义层平台+可信问数）：F17–F29 | AE 前沿调研（演讲集 / AE 书） |
| 2026-09-22 | 版本 4 增补 F30–F55（知识管理全对齐+本体双引擎+AgentOS 交互层+Palantir 落地链路+本体×GraphRAG 缝合）+ 选项矩阵；总原则=全量纳入、选项制 | 决策：叠加 All-agent 本体层设计与 WeKnora 知识管理对齐，Palantir 为顶层叙事 |

---

## 增补功能点（2026-09-14 前沿对齐升级）

> 依据调研报告一~四（references/），状态：已定稿。F1–F12 不变，本节只增不改。

### F13 语义层与口径治理

- **做什么**：指标口径 YAML 注册表（定义/修饰词/同义词/单位/owner/版本/SQL 模板）+ 同义词→候选解析（唯一命中直绑/多候选澄清）+ verified metric 生命周期（命中走固定模板；未命中 AI 候选→人工审核→版本化写回）。
- **不做什么**：不做口径自动挖掘（AI 仅候选辅助，裁决必须人工审核）；不做跨库语义联邦。
- **涉及知识点与技术栈**：语义层/M-Schema/verified queries；PyYAML。
- **信源锚点**：dbt Semantic Layer/MetricFlow/Genie 最佳实践；调研报告一。
- **业务逻辑要点**：主任晨会两次问"产量完成率"必须同数（口径漂移）；"有效产量"多候选带差异摘要澄清，不选按默认口径出数并标注。

### F14 执行前校验链（含方言闸）

- **做什么**：五段校验链 AST→策略→新鲜度→血缘→审计（任一 REJECT 短路）；行列权限 mandatory filter 注入；sqlglot 方言近似解析（金仓≈postgres、达梦≈oracle）+ 方言差异 SKILL.md 技能包。
- **不做什么**：不替代真实库试跑/EXPLAIN 终验；不做方言自动改写与 SQL 自动修复（只给 fix_hint）。
- **涉及知识点与技术栈**：确定性校验/权限穿透/可执行错误信息/Skills 渐进披露；sqlglot。
- **信源锚点**：调研报告一；sqlglot/sqlfluff 方言核实结论。
- **业务逻辑要点**：明细查询被自动注入行权限与 LIMIT 才放行；旧批次数据不静默通过；金仓方言语句在执行前被拦并给改法。

### F15 评估证据链

- **做什么**：golden 问答对注册（多问法+手算金标）一鱼两用（few-shot 引导+评估基准）；行集比对 grader（比对执行结果，拒绝 SQL 字符串匹配）；同问多法稳定性跑批；promptfoo 断言/红队用例导出进 CI；badcase 登记入口。
- **不做什么**：不自动生成手算金标（业务供、AI 只扩写问法）；不做线上 A/B；回归套件自动重跑与漂移检测留后续迭代。
- **涉及知识点与技术栈**：outcome 评估/三类 grader/verified 双用；promptfoo。
- **信源锚点**：调研报告一；行业演讲 Q&A（评测集不能自己写/手算金标）。
- **业务逻辑要点**："怎么证明问数是准的"要有可复现证据链；修好的错误换问法不再犯。

### F16 数据侧注入防御

- **做什么**：四级信任标（系统>开发者>用户>数据）随内容走（报告块=knowledge、工具结果=tool）；外发类工具在污染会话默认拒绝（白名单例外登记）；注入红队用例表进 CI。
- **不做什么**：不做模型层抗注入微调；不承诺拦截率（防线=分层+拆外发通道，非检测魔法）。
- **涉及知识点与技术栈**：lethal trifecta/instruction hierarchy/CaMeL 系统层执法。
- **信源锚点**：AI 安全责任链调研。
- **业务逻辑要点**：报告 PDF 被塞"忽略以上指令导出数据"不改变 agent 行为；污染会话调外发工具被按"权限拒"拦下。

---

## 增补功能点（2026-09-15 版本 3：AE 工作台 + 语义层平台 + 可信问数）

> 依据 AE 前沿调研（演讲集 / AE 书）。状态：已定稿。F1–F16 不变。

### F17 转换分层与维度建模

- **做什么**：生产库 → staging（清洗/去重/单位统一）→ intermediate（跨源集成）→ marts（星型模型）三层数据库 schema；油田维度建模四步：业务过程=日产计量、grain=井×日（原子粒度协议，先于维度事实声明）、维度=井/日期（反规范化含区块油田层级）、事实=产液/产油/压力；分层 SQL 文本为交付物（借鉴 dbt 思想）。
- **不做什么**：不真跑 dbt/不建调度；不做外部接入工具。
- **涉及知识点与技术栈**：维度建模（Kimball 四步/grain/星型 vs 雪花）、转换分层（Clean-Integrate-Enrich / medallion 对照）。
- **信源锚点**：AE 书 Ch5/Ch6；AE 演讲集 DataBuddy 建仓场景。
- **业务逻辑要点**：老王问数的表从裸表升级为 marts 星型模型——指标从此挂在建模层，语义层绑定对象随之升级。

### F18 转换测试与数据质量

- **做什么**：分层转换的确定性测试套件（唯一性/非空/引用完整/值域/水位新鲜度）；数据质量三来源诊断法（源系统/管道/治理定义）；v2 新鲜度水位来源升级为 marts 层。
- **不做什么**：不做数据可观测平台；不接第三方测试框架。
- **信源锚点**：AE 书 Ch9；AE 演讲集。
- **业务逻辑要点**：一个坏数能定位到三层来源之一；质量问题早拦便宜。

### F19 语义层 4+1 能力域（Glossary / Ontology / Playbook）

- **做什么**：m16 从 Metric 单域扩为四域：Glossary（术语/同义词/**禁用词**/缩写/有效期/Owner/状态）、Operational Ontology（实体/关系/**合法 Join 白名单**/约束/有效时间）、Playbook（触发意图/步骤/工具/缺参策略/HITL 点/输出合同）；三域冷启动=AI 候选→冲突检测→Owner 审批（简化流程）；Metric 域绑定升级到 marts 模型物。
- **不做什么**：不做图数据库；不做自动本体推理。
- **信源锚点**：AE 演讲集 DataBuddy 4+1/六阶段冷启动；Gravitino 四对象。
- **业务逻辑要点**：一句"为什么下滑"由 Playbook 剧本驱动；"哪些表能 join"由 Ontology 白名单裁决。

### F20 五级语义 CI

- **做什么**：语义资产变更五级检查：L1 schema 合法（收编 v2 装载闸）→ L2 引用一致性（三域引用闭包/循环/废弃引用）→ L3 指标 SQL 与安全（只读/粒度/零分母/参数化）→ L4 治理（Owner/敏感字段/破坏性变更）→ L5 行为回归（golden 全量+负样本，复用 m18）；Shadow Build 概念。
- **不做什么**：不搭真 CI 平台（伪代码+脚本形状）；L5 不重写。
- **信源锚点**：AE 演讲集 DataBuddy 五级 CI。
- **业务逻辑要点**：口径变更从"手改文件"升级为"过五级安检才可发布"。

### F21 检索瀑布协议（S0–S8）

- **做什么**：lookup 升级为检索协议：S0 固定边界（用户/会话/口径版本/ACL）→ S1 **显式锚定**（@metric/@entity/Stable ID）→ S2 对象装配（引用闭包+任务裁剪）→ S3 确定性检索 → S4 混合召回 → S6 资格与歧义（混淆/拒答）→ S7 回读权威源（校验版本）；逐级升级、可早停。
- **不做什么**：S5 受限图扩展只做设计示意（白名单边 1–2 跳）；不做 Shadow Index 实装。
- **信源锚点**：AE 演讲集 DataBuddy S0–S8。
- **业务逻辑要点**：显式锚定直达不进向量；确定性先于相似度；混淆时宁拒答不猜。

### F22 强类型中间态

- **做什么**：问数主链路状态五段类型化：IntentSpec / SemanticContext / SemanticPlan / ExecutionPlan / EvidencePack（LangGraph TypedDict 伪代码形状）；"模型提出计划，协议决定执行"分工显式化。
- **不做什么**：不换编排框架；不引入 pydantic 运行时校验（类型契约靠设计约定）。
- **信源锚点**：AE 演讲集 DataBuddy 五段式。
- **业务逻辑要点**：每一段中间态可检查、可回放；计划违反本体约束即失败关闭。

### F23 Ossie 兼容导出

- **做什么**：语义资产 YAML → Apache Ossie 格式导出（Dataset/Metric/Relationship/扩展字段）；"一条 export"的可移植性叙事；厂商细节进 extensions。
- **不做什么**：不做合规认证；不做跨平台互通实测；导入仅设计示意。
- **信源锚点**：AE 演讲集 开放语义层 §Ossie。
- **业务逻辑要点**：语义层不是孤岛——同一份定义可被 BI/平台/Agent 消费。

### F24 三源建议池与实体体检

- **做什么**：propose 升级三源统一入口：监督源 Benchmark（golden fail）/ 自检源实体体检（四维评分：信息完整度/逻辑语义/数据覆盖/关系健全度）/ 交互源 Runtime 信号（miss/ambiguous/rewrite/error/feedback）；统一字段（证据/置信度/优先级/状态）。
- **不做什么**：不做自进化中心 UI；体检只出评分与补全建议。
- **信源锚点**：AE 演讲集 DataBuddy 三源/四维体检。
- **业务逻辑要点**：发现问题的机制不同，发布入口必须统一。

### F25 Agent 只提 MR

- **做什么**：治理链路显式化：Agent 产最小 diff 变更包（只改源 YAML 不改派生物）→ 五级 CI 验证 → Owner 审批 → 合并发布 → 可回滚；**四条红线**成文（不直接改主干/只提 MR 不自行合并/不手改派生物/高影响人工审批）。
- **不做什么**：不搭 Git 服务端（版本管理不做实装）。
- **信源锚点**：AE 演讲集 DataBuddy 六步+四红线。
- **业务逻辑要点**：自动化止于提案，责任归于 Owner。

### F26 可信资产评分卡（重锚定版）

- **做什么**：选表节点前置过滤升级为评分卡：八信号加权排序（v3 重锚定：以"marts 分层归属"取代粗糙的"是否生产表"、新增"Ontology 归属域"信号），逐表信号 breakdown 可解释、信号来源逐条声明（真源/设计推演）。
- **不做什么**：不做机器学习打分（确定性加权）；信号不落库（查询时经公开面现算）。
- **信源锚点**：调研报告一（可信资产评分卡雏形）+ AE 演讲集（语义资产治理）。
- **业务逻辑要点**：选表从"检索命中率"升级为"可信度排序"，排序可解释是底线。

### F27 沙箱执行节点

- **做什么**：大结果/重计算查询走沙箱执行模式：受限容器伪代码（只读断言/资源限额/超时，fail-closed）；大结果落 artifact（不过模型），上下文只收 5 行预览+句柄；任务由剧本驱动——沙箱是剧本步骤里声明的工具。
- **不做什么**：不真建容器（伪代码示意）；不做通用沙箱产品。
- **信源锚点**：调研报告一（artifact/沙箱）+ AE 演讲集（任务托管三标准）。
- **业务逻辑要点**：大结果不过上下文（token 账可算）；沙箱内逃逸尝试失败关闭。

### F28 协议化暴露（MCP 形态 + A2A AgentCard）

- **做什么**：既有工具经 MCP server 形态暴露给外部 Agent：Tools/Elicitation/Tasks 三映射（工具调用/缺参澄清/异步任务各归其位）；大结果以 artifact 句柄出门（不撑爆对端上下文）；A2A AgentCard 样例为文本交付物。
- **不做什么**：不搭 MCP 服务端真实例（形状伪代码示意）；外部调用不绕权限闸（协议层不加权）。
- **信源锚点**：调研报告一/二（MCP Elicitation/Tasks）+ A2A AgentCard 规范 + Data for AI 圆桌（MCP 撑爆上下文论点）。
- **业务逻辑要点**：你的用户不再只是人，还有 Agent——平台要能被协议化消费，且消费时与内部主循环同权同闸。

### F29 可观测标准化（OTel GenAI 映射）

- **做什么**：m12 span 树 → OpenTelemetry GenAI 语义约定（gen_ai.* 属性族）的映射表与转换伪代码（`app/observability/otel_map.py`）：映射不丢不造（平台属性在 OTel 侧全部有落位或显式标注"平台特有"）；Langfuse 演示说明（同一 run 在 Langfuse 视图中的 trace 树/评分挂接形态，示意）。
- **不做什么**：不接 OTel SDK 真实例、不自建 Langfuse 服务（映射与说明为伪代码/文档交付物）。
- **信源锚点**：OTel GenAI 语义约定（官方属性族）+ 调研报告一（可观测性）。
- **业务逻辑要点**：自建 span 树不是孤岛——可观测数据按行业标准出门，平台排障与外部观测平台说同一种语言。

---

## 增补功能点（2026-09-22 版本 4：知识管理全对齐 + 本体双引擎 + AgentOS 交互层）

> 依据：WeKnora 源码级调研与复刻对照 / All-agent 本体仓调研 / Palantir 知识稿两篇 / book/chapter3.md。状态：已定稿。F1–F29 不变，本节只增不改。
>
> **总原则：全量纳入、选项制**——每个设计点把主流做法都纳进来，做成平台的可选项；取舍记录只回答"什么场景选哪个"。深度分档防烂尾：默认主线全机制档，非默认选项取舍档（概念+何时选+翻车长什么样），所有选项都在。
>
> **叙事框架**：Palantir 问题域（"AI 到底怎么理解你的公司"）为顶层叙事；本体构建的两种实现（All-agent 治理仓式 / WeKnora 抽取图谱式）是通往 AgentOS 的两条可选路线，不是对错关系。
>
> **取材声明**：本版**业务事实零新增**——油田语料/实体/关系/指标全部引设定书 §3/§5/§6/§7/§8 与附录 A；报告语料沿用 Volve 报告库（F6 既有）。新增的只是知识管理与本体两条技术线。

### 线 A · WeKnora 知识管理对齐（F30–F37）

#### F30 父子分块与父块回捞

- **做什么**：分块升级为父子两级——子块进双索引负责被命中，父块**只入库不索引**、命中后回捞扩展上下文；m6 Indexer 与 m14 各加一个角色；INV：父块永不出现在检索结果集（只能经子块回捞到达）。
- **不做什么**：不做祖孙多级分块；不删既有单级分块对照演示（保留为选项）。
- **涉及知识点与技术栈**：块粒度悖论（小块好检索/大块好理解）；命中后扩展。
- **信源锚点**：WeKnora 源码（processChunks"父块只入库不索引"原注释）；book/chapter3.md §3.2；weknora 复刻（store/ingest 真代码对照）。
- **业务逻辑要点**：小李问"N-2 井的完井方式"命中子块一句话，回捞父块带出完整段落（设定书 §A 语料）。

#### F31 上下文增强索引（面包屑前缀）

- **做什么**：索引期给每个子块加"文档标题+章节路径面包屑+LLM 生成的前缀摘要"再嵌入/入倒排；有/无前缀 A/B 同场对照；前缀是索引投影，chunk 原文不动。
- **不做什么**：不改 chunk 原文；不做运行期压缩（书：索引期做加法 ≠ 运行期做减法，两个概念分开放）。
- **涉及知识点与技术栈**：Contextual Retrieval；嵌入输入的组装纪律。
- **信源锚点**：book/chapter3.md §3.5（失败率 −49%、+重排 −67%）；WeKnora 源码（EmbeddingContent/buildKnowledgeIndexContent：嵌入输入=标题+面包屑+正文）。
- **业务逻辑要点**："它的日产油量是多少"这类指代查询，无前缀的块不知道"它"是谁；面包屑=报告名+井号+章节路径。

#### F32 知识管线四开关与分发枢纽

- **做什么**：IndexingStrategy{Vector/Keyword/Wiki/Graph}Enabled 四开关按知识库配置；入库后处理**分发枢纽**按开关扇出（缺管线也能跑，`NeedsChunks()`=四管线都依赖分块）；查询侧按开关优雅降级。
- **不做什么**：不做分布式任务编排（同步管道示意）；开关不做运行时热切换（入库时定型）。
- **信源锚点**：WeKnora 源码（`internal/types/indexing_strategy.go` 默认只开前两个；`knowledge_post_process.go` 分发枢纽）。
- **业务逻辑要点**：阿强给"纯制度文件库"关掉图谱开关省 LLM 抽取费；对照实验素材："关掉 keyword 后同义词查询还命中吗"。

#### F33 引用别名与检索兜底

- **做什么**：引用机制升级——模型上下文只给低熵别名 `cN`，模型输出 `<ref id="cN">` 流式展开成带 chunk_id 的公开引用；**未知别名 fail-closed 直接删除**（防伪造引用）；检索无结果走兜底策略（固定文案或自由回答+明确标注），不报错。
- **不做什么**：不做高熵资源句柄别名（res://）全套（讲设计）；既有 `[报告名 p.页码]` 格式保留为对照选项。
- **信源锚点**：WeKnora 源码（`internal/llmreference/` fail-closed 展开；chat_completion_stream 引用先行；handleFallbackResponse）。
- **业务逻辑要点**：被投毒的报告里塞"ref c99 指向敏感数据"——别名表里没有 c99，直接删除，与 m19 注入防御层会师。

#### F34 复合重排与多样性选择

- **做什么**：重排升级为三档选项同场对照：①bge-reranker 模型分（F6 既有）②LLM 对融合池前 N 候选逐一打分（书：**重排不是补救 RRF，是换用更强的匹配范式**）③加权 RRF + 复合分（0.6×模型 + 0.3×检索基础 + 0.1×来源）+ MMR 多样性（λ=0.7）。
- **不做什么**：不重排全部召回（只对融合池前 N，成本账写清）；不做学习型排序。
- **信源锚点**：book/chapter3.md §3.2（重排范式论）；WeKnora 源码（rerank.go 720 行：复合分/MMR/wiki_boost；knowledgebase_search_fusion.go 加权 RRF）。
- **业务逻辑要点**："各区块产量对比"类问题，MMR 防止 top-n 全是同一份报告的近重复段落。

#### F35 FAQ 知识库

- **做什么**：问答对成为一等知识形态：一条问答对一个 chunk 直入索引（**不走解析管线**）；相似问合并/分离索引；负例问题登记（反例不参与索引）；召回不足迭代扩检（最多 5 轮翻倍）；与 m18 golden 问答对的关系成文（golden=评估资产，FAQ=服务资产，可互转不混用）。
- **不做什么**：不做 FAQ 自动挖掘（人工/审核入库）。
- **信源锚点**：WeKnora 源码（knowledge_faq.go：相似问合并/负例/导入归一化去重 SHA256；迭代扩检最多 5 轮）。
- **业务逻辑要点**：主任常问的"月度完成率口径"进 FAQ 秒回，不再检索报告库。

#### F36 多模态知识子块

- **做什么**：报告中的图片升级为知识公民：VLM 生成图片描述 caption + OCR 文本，写成 `image_caption`/`image_ocr` 两类子 chunk **独立入向量索引**——"搜图片描述能召回原文"；命中子块回读父块正文（与 F30 回捞会师）。
- **不做什么**：不做音视频；VLM 走 m2 网关现有模型；只覆盖 png/jpg。
- **信源锚点**：WeKnora 源码（image_multimodal.go 每图一任务、子 chunk 独立入索引；wiki 侧回读 image_ocr 防空内容）。
- **业务逻辑要点**：小李问"N-2 井岩性柱状图说的是什么"——图里没有字，靠 caption 子块命中。

#### F37 索引期知识加法（摘要 + 问题生成）

- **做什么**：入库后处理两道加法：全文档摘要 chunk×1 + 每 N 块自动生成"可能被问的问题"chunk 一批，都入索引并带类型标（检索结果可区分原文块/摘要块/问题块）；与 F31 同属"索引期做加法"家族。
- **不做什么**：不做 RAPTOR 递归聚类摘要树的生产实现（概念+选型对照进选项矩阵）。
- **信源锚点**：WeKnora 源码（后处理编排：摘要×1 + 问题生成每 20 chunk 一批；summary chunk 入索引）；book/chapter3.md §3.3（RAPTOR 对照）。
- **业务逻辑要点**：报告入库自动产"本报告可能回答的 10 个问题"——问句撞问句比问句撞正文好命中。

### 线 B · 本体构建五流派（F38–F42）

#### F38 本体构建缝与五流派选项卡

- **做什么**：定义本体构建接缝 OntologyBuilder 五操作（`define_schema / extract / validate / store / evolve`）；五流派（A 拆解 / B 聚类 / C 两步走 / D 框架 / E 直给）作为缝后五个可选实现；四维对照表（幻觉风险/工程复杂度/验证机制/版本管理）入模块卡。
- **不做什么**：五流派深度不平权（总原则的深度分档）：A/D 两派全机制档（F39/F40），B/C/E 三派取舍档（F41）。
- **涉及知识点与技术栈**：LLM 建本体的四道坎（类型未知/幻觉/粒度/验证）。
- **信源锚点**：Palantir 笔记一 §二、§三（五流派+对照表）；book/chapter3.md §GraphRAG。
- **业务逻辑要点**："你怎么建本体"要能答出完整菜单+选型决策树，而不是只会一种。

#### F39 A 派实现：治理本体仓（All-agent 式）

- **做什么**：m16 Ontology 域升级为**受治理本体仓**：机读 schema 注册表（模型清单/逐元素必填字段/依赖白名单"哪类模型的哪个 ref 允许指向哪类模型"）+ 前缀即类型（`AGG-`/`RULE-`/`GLS-`…，ref 只认稳定 ID 不用名称猜）+ 逐元素注源（无源不落仓）+ 换义锁定（退役字段名禁复用）+ profile 裁剪（full/core/headless 三档，域声明用哪档）+ 构建路径 LLM 草案→冲突检测→MR→语义 CI（m18 五级闸复用）→Owner 审批；**图是派生物**（每次启动从 YAML 全量重建纯内存引用图，禁持久化缓存成权威；`--closure N` 正向引用闭包 / `--impact` 反向影响集）。
- **不做什么**：不接真 Git 服务端（MR 流程示意，m16 既有纪律沿用）；不接 OWL/SHACL 真推理机（验证形状讲概念，A 派学术原型的双重验证讲清定位）。
- **信源锚点**：本体仓设计参考（ontology/schema/model-registry.json、model-deps.json、CHANGELOG、换义锁定、profile；tools/schema_check.py L1–L4；tools/graph_index.py"Git 是真源图是派生物"；references/tech-selection.md 否决 Neo4j 记录）。
- **业务逻辑要点**："递减增油"口径争议（事故 7/13，设定书 §8）在这套仓里 = 一条带注源、带 Owner、带版本的 RULE 元素，不是 LLM 现场抽出来的三元组。

#### F40 D 派实现：抽取式图谱（WeKnora 式）

- **做什么**：知识库级抽取配置 ExtractConfig（实体类型清单 + 关系 tags + few-shot 示例 + 自定义指令，系统保留输出协议所有权）+ 逐 chunk LLM 抽三元组（实体 name+attributes / 关系 node1-node2-type-strength 强度 5–10 打分标准）+ 图存储（namespace=知识库+文档）+ 查询侧问题实体识别 → 图检索 → **与向量/BM25 并行汇入**问答上下文；默认 11 类通用实体（Person/Organization/Location/Product/Event/Date/Work/Concept/Resource/Category/Operation），类型闸"不许创造新类型、拿不准宁可跳过"；chunk 挑选闸（无正文不抽——防 LLM 复读 few-shot、防重复计费）。
- **不做什么**：不接真 Neo4j（图存储伪代码 + 内存图形状）；不做实体消歧生产实现（同名合并讲策略）。
- **信源锚点**：WeKnora 源码（graph_extraction.yaml 11 类+强度标准；extract.go ExtractConfig 组装；search_entity.go 并行汇入；selectGraphChunks 挑选闸）；Palantir 笔记一 §三 D 派；book/chapter3.md §GraphRAG（软肋=语义降级+错误提取致知识污染）。
- **业务逻辑要点**：Volve 报告库开图谱开关，每块抽"井—位于→区块""措施—作用于→井"；老王问"哪些井受过 N-06 注水影响"走图遍历（受效关系=设定书 §5）。

#### F41 B/C/E 派速览（聚类 / 两步走 / 直给）

- **做什么**：三派各一篇取舍档设计说明——B 聚类派（先抽全部名词→AP 聚类不预设类数→LLM 给组命名；HT-R-O 三步关系法：实例关系→本体级关系；新域冷启动探路用）；C 两步走派（先概念清单→再层次结构→序列化；快速出 V1 验证想法）；E 直给派（一个 prompt 端到端；半小时出活；幻觉风险最高、prompt 措辞敏感——只用于原型验证）；每派配"什么时候选 / 翻车长什么样"。
- **不做什么**：三派不做全机制伪代码（深度分档）。
- **信源锚点**：Palantir 笔记一 §三 B/C/E + §四 五条实战教训（NER 是误差主源/关系比实体难/验证是玩具与生产的分界线/prompt 措辞敏感/不是数据越多越好）。
- **业务逻辑要点**："新接地质勘探域、不知道有哪些实体类型"→B 派探路，探完收编进 A 派仓（"先自由发现、再框架收编"——2025 Bian 综述结论）。

#### F42 五流派擂台对账

- **做什么**：同一份油田语料（设定书 §5 实体草案 + §A 报告样本）五种建法各走一遍（伪代码走查），同一组验证问题（"N-06 注水影响哪些井"）五种答法对照；产出选型决策树（有没有行业标准 / 要不要上生产 / 是不是新域探索）。
- **不做什么**：不评"谁最好"（选项制：只回答何时选谁）。
- **信源锚点**：Palantir 笔记一 §三对照表 + F39/F40/F41 互见。
- **业务逻辑要点**："你为什么这么建本体"要有完整依据。

### 线 C · 本体交互五层（Palantir AgentOS，F43–F49）

#### F43 本体交互层总纲（AgentOS 定位）

- **做什么**：引入 Palantir 五层交互模型作为"本体被消费"的总框架：Context（确定性注入）/ Query（LLM 自主探索）/ Logic（专业函数）/ Action（受控写入）/ Governance（全链约束）；Semantic（描述世界）vs Kinetic（改变世界）分类法；OAG（Ontology-Aware Generation）vs RAG 对照表；petro 既有能力对号入座表（m21 瀑布≈Query 前置策略、m9 领域工具≈Logic 雏形、m17 guardchain≈Action 前置闸、m19≈Governance 一部分、F28 MCP≈外部暴露雏形）。
- **不做什么**：五层不重建已有模块——对号入座后只补缺（缺 = Context 层完整形态 F44、Action 层完整形态 F47）。
- **信源锚点**：Palantir 笔记一 §9.1/§9.2（AgentOS、五层、Semantic/Kinetic）；笔记二 §四（OAG vs RAG）。
- **业务逻辑要点**：petro 叙事从"三个专职 Agent"升级为"本体操作层"——AI 理解的是有含义的对象，不是一堆彼此独立的表。

#### F44 Context 层（确定性注入）

- **做什么**：每条消息**确定性触发**的背景装配（不需要 LLM 判断要不要查）：Ontology Context（绑定当前对象：页面选中 N-02 井→自动带井档案/近 30 天产量/关联注水井）/ Document Context（全文模式 vs 片段模式，复用 m6 检索）/ Function-backed Context（高频场景预设函数："井 360°"一页纸=档案+产量趋势+措施记录+检修台账一次拉起）；与 m1 提示词装配器会师（Context 块位置对 KV Cache 的影响讲清）。
- **不做什么**：不做无上限注入（预算与裁剪规则成文；塞太多的 token 账算给读者看）。
- **信源锚点**：Palantir 笔记一 §9.3（三种 Context）+ §9.5（Context vs Query 最易混的一对；"确定的内容走 Context，允许探索的走 Query"）。
- **业务逻辑要点**：老王打开"N-02 井"页面问"它最近怎么样"——系统已把档案和近况摆在模型面前，不靠模型自己想到去查。

#### F45 Query 层（对象查询工具）

- **做什么**：Agent 自主查询本体的工具形态：Object Query（多条件过滤/聚合/link 遍历，遍历深度为超参数）——查语义对象与关系，**不是让模型自己写 SQL**；与 m21 检索瀑布的关系成文（瀑布 S1–S4 = Query 层内的"确定性优先"策略）；三种典型模式各配油田例子（过滤+聚合/沿 link 追溯根因/分组看板）。
- **不做什么**：不开放自由 SQL（那是 m7 问数链的地盘，有 guardchain 与 mandatory filter）；link 遍历深度设上限。
- **信源锚点**：Palantir 笔记一 §9.4；本体仓设计参考（tools/graph_index.py `--closure/--impact`：引用闭包与影响集）。
- **业务逻辑要点**："N-02 停产是哪个环节的问题"→沿 link 逐层追溯：井→措施记录→设备状态→检修台账（设定书 §A.4/A.7）。

#### F46 Logic 层（专业函数）

- **做什么**：业务计算封装为 Function 的纪律成文：LLM 负责理解意图、选函数、用自然语言解释结果；**专业判断交给函数，LLM 不拍脑袋**；油田样例：`calculate_decline_risk`（递减风险：历史递减拟合+措施记录+含水趋势→high/medium/low+依据）、m9 既有 `forecast_production` 按 Function 形态重述（输入/输出契约+可审计）。
- **不做什么**：不重写 m9 模型实现；优化求解（推荐方案）只讲接口形状。
- **信源锚点**：Palantir 笔记一 §9.6（calculateDelayRisk 样例）；book/chapter4.md §工具描述的艺术。
- **业务逻辑要点**："这口井有没有递减风险"——不许答"看起来有风险"，必须调函数拿结构化结论。

#### F47 Action 层（受控写入与写回）

- **做什么**：平台从"只读分析"补出"受控业务操作"：Action 四部分（参数/规则/前置条件/副作用，"每个 Action 像一份合同"）+ **写回纪律**（修改写独立变更记录区/Writeback，不污染源数据——as-is 入库原则的对偶）+ 高低风险分级（低风险自动：更新井备注；高风险人工确认：调整配产计划）+ 审批复用 m8 权限闸与 m17 校验链 + 全程审计（谁/何时/哪个 Agent/改了什么）。
- **不做什么**：不接真业务系统回写（落平台侧变更表）；高风险操作永无自动执行（Human-in-the-loop 红线："我们卖的是副驾驶"）。
- **信源锚点**：Palantir 笔记一 §五 阶段 4-5（Action Type/Writeback Dataset）+ §9.7；笔记二 §三 STEP 3（按钮上有锁）+ §四（建议→审批→执行）。
- **业务逻辑要点**：Agent 建议"N-06 配注上调 10%"→摆出影响测算→老王点确认→写变更记录+审计日志；生产库原表不动。

#### F48 Governance 层（贯穿式治理）

- **做什么**：治理不是单独一层而是贯穿前四层的约束机制：每层"能看/能查/能算/能动"都有角色×权限矩阵（一线调度员 vs 区域经理对照表入设计文档）；**防幻觉的结构化论证**——不是 prompt 叮嘱"别编"，而是结构上接触不到（L1 没配 Context、L2 没授对象、L3 没授函数 → 答案只能是"我没权限"）；审计与 m12 可观测/F29 OTel 映射会师。
- **不做什么**：不替代 m19 注入防御（Governance 管"权限内能不能"，注入防御管"内容被污染后会不会被教坏"，两者边界成文）。
- **信源锚点**：Palantir 笔记一 §9.8（权限分层对照表；防幻觉约束叠加；"不把答案带进考场"）。
- **业务逻辑要点**：实习生登录问"全油田经营利润"——不是被拒答，而是它的世界里根本没有这个数据。

#### F49 内外部 Agent 暴露（本体双通道）

- **做什么**：本体对外暴露的双通道形态成文：管理通道（改类型定义：proposal review + 人工审批，**不能写数据**）vs 消费通道（读对象/执行 action/写数据，**不能改类型**）——"改结构"与"动数据"两个权限域分离；与 F28（MCP 三映射）会师：外部 Agent 经消费通道形态用本体，与内部主循环同权同闸。
- **不做什么**：不搭真 MCP 服务（F28 既有声明沿用）。
- **信源锚点**：Palantir 笔记一 §9.11（Palantir MCP vs OMCP）；WeKnora 源码（MCP 33 工具对照）。
- **业务逻辑要点**：上级单位的 AI 系统问"渤海油田本月递减率"——经消费通道读到的是审定口径，不是原始表。

### 线 D · Wiki 管线（F50–F52）

#### F50 文档→Wiki 页

- **做什么**：报告库的第三种投影（向量/倒排之外）：chunk 拼回全文（**重叠去重**+**图片信息回读** caption/ocr——否则纯图片文档产出空内容）→ LLM 重写成结构化 Markdown 页（摘要/关键参数/井号链接/表格）；32K 截断纪律成文；核心认知：**重写≠检索**——Wiki 是对 chunk 的可读化再加工，产出物是文档不是索引。
- **不做什么**：不做多文档聚合（入口页是 F51 的事）；不改原始报告库。
- **信源锚点**：WeKnora 源码（reconstructContent 只取 text 块拼回+重叠去重；reconstructEnrichedContent 回读 image_ocr/caption；maxContentForWiki=32768）；book/chapter3.md §OpenViking（Markdown 范式）。
- **业务逻辑要点**：200 页英文 Volve 完井报告→一页中文结构化 Wiki，小李 5 分钟读完要点。

#### F51 Wiki 交叉链接与入口页

- **做什么**：Wiki 页自动交叉链接（linkify：识别页内实体词→挂站内链接；"必须像 Wikipedia 一样建链接"且**写入提示词时明确要求**——书的原话纪律）+ 每知识库一个入口页（目录+最近更新）；OpenViking L0 摘要/L1 概览/L2 全文的按需加载范式对照讲法。
- **不做什么**：链接不做人工审核流（自动生成+可人工编辑）；不做站外链接。
- **信源锚点**：WeKnora 源码（wiki_linkify.go/wiki_slug_handles.go）；book/chapter3.md §OpenViking（文件系统范式 L0/L1/L2）。
- **业务逻辑要点**：Wiki 页里"渤中28-1"自动变链接跳井卡；入口页=报告库自动生成的首页。

#### F52 Wiki 版本与一键回滚

- **做什么**：Wiki 页编辑落 revision（版本历史+diff）+ 一键回滚；**知识层/证据层分离**成文（Wiki 页=知识层，chunk=证据层，页上论断可回链证据块）；与 m16 生命周期/MR 纪律对照——文档知识的"PR 思想"（Proposer-Reviewer 双角色在文档知识上的形态）。
- **不做什么**：不做多人协同编辑冲突合并（单写者设计）。
- **信源锚点**：WeKnora 源码（wiki 页面版本存主库 repository/wiki_page.go）；book/chapter3.md §知识更新（证据层/知识层/服务层三层分离、增量=PR）。
- **业务逻辑要点**：小李改 Wiki 页改错了→一键滚回；审计问"这页上周长什么样"→revision 可查。

#### F55 本体 × GraphRAG 三接入点

- **做什么**：两套本体资产与 D 派图谱的缝合设计成文（本体仓 TERMS 定稿）——**A 建图段**：ExtractConfig 的类型清单可换成领域本体（m16/m24 的 GLS/实体卡复用为抽取对号表，治类型漂移；WeKnora 默认 11 类=**弱模式层**：通用、无规则、改 prompt 无审）；**B 图上**：抽取结果过闸再入库（类型闸→规则闸升级路径，治幻觉边——拦下的不立边，"图库对不上"正是图在执法的证据）；**C 查询段**：确定性前哨（m21 瀑布先行精确入图，图谱模糊检索降兜底，面外先拒答）；微软版 GraphRAG（社区聚类+分层摘要答全局问题）vs WeKnora 实体图（无社区层）的变体注记。
- **不做什么**：不接真 RDF 推理机；B 闸复用 m18/m17 形状不新建闸体系。
- **信源锚点**：本体仓 TERMS 定稿（三接入点定稿/灌图过闸/弱模式层论断）；book/chapter3.md §GraphRAG。
- **业务逻辑要点**："N-06 注水影响哪些井"——C 前哨先在瀑布里精确锚定 N-06（设定书 §A.1 井档案），命中直达图邻域；问"躺井"被 GLS 禁用词/黑话闸拦在入图前（§6）。

### 线 E · Palantir 落地链路（2026-09-22 补，覆盖 Palantir 笔记一 §5–§8 + 笔记二 §6）

#### F53 源系统→本体对象的落地链路

- **做什么**：Palantir 式"脏活链路"的落地设计并对照 petro 既有：①数据连接 as-is 入库（原封不动拉进来，端到端血缘=任何数据点可追溯到原始文件某一行）②存储分层（Dataset 通用容器带版本="Git for Data" / Media Set 媒体容器 / Media Reference 把结构化行与原始 PDF 连起来）③三条清洗路径（结构化=Apply Schema 自动识别；半结构化=explode 炸开嵌套；非结构化=OCR/VLM→**人工复核闭环**：规则校验+置信度过滤+抽样人核+异常队列）④映射四件套（表→Object Type / 行→Object / 列→Property / 外键→Link）+ 高级属性类型（Vector/Geopoint/Time Series/Media Reference）⑤增量更新三层配合（同步层拉新→管道只处理新增行→本体索引只更新变化对象）与两个坑（APPEND 模式下可变数据的新旧并存、双源时间差）；**大宽表拆解规则**（一种实体类型只对应一张表，200 列宽表必须先拆再映射）与 m20 维度建模四步做对照卡。
- **不做什么**：不接真连接器/真 OCR 服务（不做实装）；200+ 连接器清单只讲形态。
- **涉及知识点与技术栈**：数据血缘/as-is 原则/增量 vs 全量（SNAPSHOT 与 APPEND 的事务语义）。
- **信源锚点**：Palantir 笔记一 §五（五阶段全链路/图书馆比喻/两坑）+ §六（宽表拆解/一实体一表规则）；DDL→本体草案的逆向映射证据形状为对照。
- **业务逻辑要点**：油田语境——井口传感器五层采集链（设定书 §2.1）就是 as-is 的行业原型；班次手抄重复行（§A.2 脏特征）走"非结构化+人工复核闭环"的对照位；月度结算表与井口日报的双源时间差=事故 13 的另一面。

#### F54 FDE 与垂直模板产品化

- **做什么**：两个行业认知成文——①FDE（前置部署工程师）的价值定位：AIP/工具能帮你写拆分代码，但"200 列宽表拆成哪几个实体、order_status 归谁"需要懂业务的人判断；FDE 是行内 copilot 不是替代决策的 architect ②垂直行业模板三层复用：Layer 1 领域对象类型（复用 90%+）/ Layer 2 源系统映射（SAP/用友/金蝶→Object Type，复用 70%+）/ Layer 3 客户定制；核心论断"护城河不是模板里有哪些 entity，而是源系统→实体的 mapping 规则库"；Palantir 落地五阶段（Discovery→Bootcamp 5 天→Pilot→Production→Scale）与真实成本量级（Nebraska Medicine 6 周首个工作流/Forrester TEI 三年 $3000 万 vs 节约 30%）。
- **不做什么**：不做真模板市场/不做 mapping 规则库实现（认知与选型层，伪代码只到规则库形状）。
- **涉及知识点与技术栈**：知识工程方法论/行业产品化策略。
- **信源锚点**：Palantir 笔记一 §六/§七（FDE 价值/三层复用表/"你知道的又怎样"论断）；笔记二 §六（落地五阶段/成本/优缺点）。
- **业务逻辑要点**："这个平台怎么推广到其他油田"——三层复用表就是答案骨架；设定书 §9 真实企业对照表是本节的油田语境底座。

---

### 版本 4 选项矩阵（全量纳入的落盘形式；每行=一个设计点 × 全部候选 × 何时选谁）

| # | 设计点 | 候选（全收） | 何时选谁 | 落点 |
|---|---|---|---|---|
| 1 | 本体构建策略 | A 拆解 / B 聚类 / C 两步走 / D 框架 / E 直给 | 上生产→A；新域探索→B；快速验证→C；有行业标准→D；原型验证→E | F38–F42 |
| 2 | 本体存储 | Git+YAML 真源+内存图派生 / 图数据库 / 关系表 | 治理与演化优先→YAML 仓；多跳查询重→图库；轻量起步→关系表 | F39/F40 |
| 3 | 本体消费方式 | 确定性瀑布（m21 既有）/ 图检索并行汇入 RAG / Palantir 五层 | 口径问答→瀑布；关系探索→图检索；完整 AgentOS→五层 | m21/F40/F43–F48 |
| 4 | 写操作形态 | 无写操作 / guardchain 只读闸（既有）/ Action+Writeback | 纯分析平台→前两者；业务操作员→Action | F47 |
| 5 | 检索引擎 | Chroma+rank_bm25（既有）/ ParadeDB 一库三角色 / 独立向量库集群 | 中小规模→前者；生产省心→ParadeDB；超大规模→专用库 | 对账节 |
| 6 | 重排 | bge-reranker 模型 / LLM 逐一打分 / 复合分+MMR | 延迟敏感→模型；精度优先不怕贵→LLM；多样性敏感→MMR | F34 |
| 7 | 分块 | 递归语义（既有）/ 固定大小 / 父子分块 / RAPTOR 树 | 通用→递归；可复现实验→固定；长文档段落理解→父子；跨主题综合问答→RAPTOR | F30/F37 |
| 8 | Wiki 范式 | LLM 重写页（WeKnora）/ OpenViking L0-L2 文件系统范式 | 报告库可读化→前者；Agent 长期知识底座→后者 | F50–F52 |
| 9 | FAQ | 独立 FAQ 库（WeKnora）/ golden 问答对复用（m18 既有） | 高频固定问→FAQ 库；评估与服务分账→golden 复用 | F35 |
| 10 | 引用格式 | [报告名 p.页码]（既有）/ cN 别名 fail-closed | 人读友好→前者；防伪造引用→后者 | F33 |
| 11 | 本体 schema 治理 | profile 裁剪+换义锁定（All-agent）/ KB 级 ExtractConfig（WeKnora） | 多域长期演化→前者；单库快速上线→后者 | F39/F40 |
| 12 | 构建验证机制 | SHACL+OWL 双重验证（学术原型）/ 语义 CI L1–L4（All-agent）/ 无在线验证（WeKnora） | 合规强行业→SHACL；工程化治理→语义 CI；轻量检索增强→可免 | F38/F39 |
| 13 | 数据→本体管道 | Palantir 五阶段落地链路 / m20 转换分层（既有） | 本体为操作层→Palantir 链路；分析建模→m20 分层 | F53 |
| 14 | 行业化复用 | 三层复用（领域对象/源系统映射/客户定制）/ 每客户重头来 | 多客户规模化→三层复用；单客户深耕→重头 | F54 |
| 15 | 图谱与本体的缝合 | 三接入点（A 对号表/B 图上闸/C 查询前哨）/ 各管各的 | GraphRAG 语义错误代价越高的域越值得三接 | F55 |
| 16 | KG 冗余策略 | 虚拟化（OBDA 零复制，查询穿透回库）/ 选择性物化（只灌高频关系片）/ 全量物化 | 怕的不是存两份、怕的是两份都能改——只读投影可幂等重灌则冗余只是磁盘成本 | F40 注记 |
| 17 | 图引擎家族 | RDF 三元组库（语义标准/跨源合流/本体推理强）/ Neo4j 属性图（应用开发顺手/多跳指针追逐） | 要语义和标准走 RDF，要应用顺手走 Neo4j（WeKnora 选它=应用型导航+检索）；引擎只管存储，宪法照样归本体 | F42 决策树 |

### 版本 4 取材锚点声明

- 业务事实零新增：实体/关系/受效 → 设定书 §5；指标口径 → §3；剧本 → §7；事故 → §8；表与脏数据 → 附录 A；组织与 Owner → §1。
- FAQ 语料：m18 golden 问答对（已入库资产复用，不新造）。
- Wiki/图谱语料：Volve 报告库（F6 既有）。

### 版本 4 范围外明确不做（增补）

- 不接真 Neo4j/图数据库（图存储伪代码+内存图形状）。
- 不接 SHACL/OWL 真推理机（A 派验证闭环讲形状与定位）。
- 不接真 Palantir/真 Git 服务端（五层模型与 MR 均为设计示意）。
- RAPTOR 只讲概念与选型对照，不做生产实现。
- Wiki 不做多人协同冲突合并。

