# 技术栈考察

> 每个技术的完整"使用场景/核心能力面/典型用例模式/官方文档锚点"在 `docs/tech-stack/<slug>.md` 分节文件里，本文件是总览与覆盖对账。伪代码的 API 形状一律以分节文件为准（来自官方文档，非凭记忆）。

## 点名技术覆盖对账表

| # | 点名技术 | 考察文件 | 状态 |
|---|---|---|---|
| 1 | FastAPI / asyncio / ASGI | fastapi-sse.md | ✅ |
| 2 | SSE 流式输出 | fastapi-sse.md | ✅ |
| 3 | SQLAlchemy 2.0 async | sqlalchemy-async.md | ✅ |
| 4 | KingbaseES / PostgreSQL / MySQL | guochan-db-os.md（+sqlalchemy-async.md 方言部分） | ✅ |
| 5 | Redis | redis-minio.md | ✅ |
| 6 | S3 / MinIO | redis-minio.md | ✅ |
| 7 | OpenAI 兼容接口 | openai-embedding.md（+litellm.md Proxy 形态） | ✅ |
| 8 | Embedding / 向量检索 / Reranker | openai-embedding.md（bge-m3 / bge-reranker-v2-m3） | ✅ |
| 9 | Function Calling | openai-embedding.md（工具声明→执行→tool 消息回灌五步循环） | ✅ |
| 10 | LangGraph | langgraph.md（官方 SQL Agent 教程与问数节点一一同构） | ✅ |
| 11 | LiteLLM | litellm.md | ✅ |
| 12 | Docker | docker.md | ✅ |
| 13 | 麒麟 OS / 统信 | guochan-db-os.md | ✅ |
| 14 | 金仓 / 达梦 | guochan-db-os.md | ✅ |
| 15 | SM3 / SM4 国密 | guomi-sm.md（gmssl 3.2.2，含本地实测） | ✅ |
| 16 | PPT/图片/视频/TTS/ASR 接口 | multimodal-api.md | ✅ |
| 17 | Git / Git Flow / CI/CD | 低权重（不单独考察） | ⚠️ 有意降级 |

> 第 17 项为有意降级：非本平台建设重点。其余 16 项无降级、无静默跳过。

## 各技术一句话使用场景

- **FastAPI+SSE**：AI 平台统一出入口——所有 Agent 对话走 SSE 流式推送 token，FastAPI 0.135+ 原生 `EventSourceResponse`。
- **SQLAlchemy 2.0 async**：问数/会话/用量数据统一异步 ORM 层；金仓环境换官方 ksycopg2 异步路径（asyncpg 无金仓官方支持）。
- **LangGraph**：问数 Agent 状态机——官方 SQL Agent 教程节点（list_tables→get_schema→generate_query→check_query→run_query）与问数链路"意图/选表/生成/校验/修正"一一同构，直接锚定。
- **LiteLLM**：AI 网关——`model_list` 配置多模型（含Petro-72B/DeepSeek），Router 路由 + 三类 fallback + 冷却 + spend 落 Postgres。
- **OpenAI 兼容接口 + Function Calling**：所有 Agent 与工具的通用语言；注意 Chat Completions 的 `tool_calls`/`role:"tool"` 与 Responses API 形状不同，伪代码不得混用。
- **bge-m3 + bge-reranker-v2-m3**：问答 Agent 的 Embedding/Reranker 本地国产化方案（CPU 可跑），hybrid retrieval + re-ranking 是官方推荐管线。
- **Redis**：会话/缓存/网关用量计数；Streams 消费组做可重试任务队列。
- **MinIO**：报告 PDF 与生成物（PPT/图片/视频）对象存储，预签名 URL 让前端直传直下载；万相结果 URL 24 小时过期必须及时转存。
- **python-pptx / 万相 / edge-tts / FunASR**：问智模块四件套——PPT 模板驱动生成、文生图/文生视频异步任务轮询、TTS 原型、ASR 有 OpenAI 兼容接口可过网关。
- **金仓/达梦/麒麟**：国产化部署目标栈——金仓 initdb 期固化兼容模式、dmPython 占位符是 `?`、麒麟 V10 是 RHEL8 兼容系。
- **gmssl**：敏感字段 SM4 加密存储 + SM3 摘要签名；已实测 3.2.2 无 GCM 模式。
- **Docker**：多阶段构建 + compose `depends_on: service_healthy` 编排 FastAPI+PG+Redis+MinIO；`docker save/load` 适配信创内网交付。

## 调研中发现的易踩坑

1. FastAPI `StreamingResponse` 生成器内无 `await` 会导致断连无法取消。
2. LangGraph 节点中断恢复时**整个节点函数重跑**——节点副作用必须幂等。
3. LiteLLM 无 DB 模式预算形同虚设；router 重试与 SDK `max_retries` 是两套，会被强制置 0 防套娃。
4. OpenAI `arguments` 是 JSON 字符串且可能幻觉，必须校验；`stream_options.include_usage` 才有用量，中断的流丢 usage。
5. gmssl 的 `sm3_kdf` 参数是 hex bytes 不是列表；README 与发版不同步（GCM 只在 master）。
6. 万相图/视频全部异步任务 + 结果 URL 24h 过期 + OSS 出口白名单。
7. 金仓方言兼容是 initdb 期固化的，不是连上才选；SQLAlchemy 需官方方言包。
8. redis-py 官方无高层缓存抽象，cache-aside 要自己封。

## 增量调研（2026-09-23/24，湖仓 × DataAgent 栈）

> 八份分册 + 一份合成篇（共九件），起因是"MinIO+Iceberg 在 DataAgent 中的应用"调研后逐件扩展。每册结构同上（使用场景×DataAgent 作用×核心能力×典型用例×选型×版本锚点），论断逐条注官方源，证据缺口如实入册。已消化为数据面落地设计：`docs/prd-data-plane.md` + `specs/data-plane/` + `specs/walkthroughs-data-plane.md`。

| 分册 | 一句话 |
|---|---|
| [s3.md](tech-stack/s3.md) | 对象存储世界语：协议语义、预签名/强一致/版本控制；S3 Select 已停新客、单对象上限 50TB |
| [minio-iceberg.md](tech-stack/minio-iceberg.md) | 湖底座：MinIO=湖的磁盘、Iceberg=表语义；REST Catalog 即 Agent 接缝；社区版无内嵌 catalog（AIStor 才有） |
| [flink.md](tech-stack/flink.md) | 实时进料与加工：CDC pipeline 主键幂等 vs 原生 sink exactly-once；Flink Agents 子项目；SQL Gateway 非问数引擎 |
| [dbt.md](tech-stack/dbt.md) | T 层分析工程：MetricFlow 引擎开源 vs 托管 Semantic Layer 收费；manifest=机器可读口径血缘；exposures 挂 Agent |
| [cube-semantic-layer.md](tech-stack/cube-semantic-layer.md) | 语义层：官方 MCP 属 Cloud；meta.ai_context 只给 AI 看；SQL API=Postgres 协议；无 StarRocks 官方驱动 |
| [duckdb.md](tech-stack/duckdb.md) | 进程内 OLAP 末端：iceberg 扩展 ATTACH 可写；httpfs 直连 MinIO；MotherDuck MCP 官方开源款 |
| [streaming-batch-warehouse.md](tech-stack/streaming-batch-warehouse.md) | 数仓范式：Lambda（Marz）/Kappa（Kreps）一手出处；流批一体三路线；Paimon 2.0 流写湖仓 |
| [data-fabric.md](tech-stack/data-fabric.md) | 横切治理理念：Gartner"理念非组件"；active metadata；fabric vs mesh vs Microsoft Fabric 消歧；厂商 agentic 转向 |
| [dataagent-stack-map.md](tech-stack/dataagent-stack-map.md) | 合成篇：一根栈从井口到 Agent 回答；四类失败模式×四道闸；Petro-Agent 场景逐件落地（锚设定书 §x） |
