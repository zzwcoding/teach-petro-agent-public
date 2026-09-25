# 模块划分（模块卡格式）

> 设计稿：模块 = 系统的逻辑载体；接口 = 伪代码签名（输入输出写清，不求可运行）。每张卡给"概念一句话 / 设计取舍 / 机制细节"三层描述。术语见 CONTEXT.md。
> 函数主干（伪代码体）不落在本文件，由各模块的实现走查文档承载。接口变更只能改模块卡，走查断言（walkthroughs）只引用。
> 模块编号沿用旧版 M1–M12；本次按深模块准则补三卡：`m13` Agent 运行时、`m14` 索引存储、`m15` 问智 worker（旧版散落在"增补节"，现为正式卡）。
> **2026-09-14 前沿对齐升级增补四卡**：`m16` 语义层与指标注册、`m17` 执行前校验链、`m18` 评估证据链、`m19` 注入防御层（PRD 增补节 F13–F16；走查断言 §F13–§F16）。

## 底座 m1

职责: FastAPI 异步应用宿主——鉴权、SSE 会话通道、请求日志与装配（组合根），所有 Agent 接口的路由入口。
目录: `app/main.py`、`app/api/`

### 公开接口

```text
create_app() -> FastAPI                      # 装配：注册路由/依赖注入/异常处理/工具注册表装载/lifespan 建连接池
chat_endpoint(agent_type, body, user) -> EventSourceResponse
    # POST /chat/{agent}；SSE 事件帧生成器（事件协议见 F1：agent/token/tool_call/done/error）
verify_token(credentials) -> User            # 🛡️ 防未授权访问（Depends 注入）
require_permission(level) -> User            # 角色权限依赖（领域工具写权限用）
presign_report_upload(filename) -> {url,key} # POST /reports/presign：报告直传预签名（F5）
artifact_download_url(artifact_id) -> URL    # GET /artifacts/{id}/url：产物预签名下载（F10）
request_log(request, digest) -> None         # 请求日志：报文 SM3 摘要留痕（m11），正文不落日志
healthz() -> "ok"                            # GET /healthz：Docker HEALTHCHECK 探针
```

### 依赖

- 模块: `m3`、`m4`、`m5`、`m9`、`m11`、`m13`
- 外部: FastAPI ≥0.135（`fastapi.sse.EventSourceResponse/ServerSentEvent`、`Depends`、`Annotated[Header]`）——宿主无替身，stub 期以 curl 直连 `m13` 的 EchoAgent 事件帧

### Seam 与走查计划

- Seam: 路由层与 Agent 运行时之间——`chat_endpoint` 只认 `dispatch(agent_type, ...) -> EventStream` 一个出口；鉴权与权限是 Depends 树上的接缝。
- Adapter: （宿主无替身）`m13` 未就位时以 EchoAgent 固定帧序列先行交付（见 `m13` 卡）。
- 走查计划: 锁死 SSE 事件帧协议与鉴权闸（W-F1-1/2/3/4）、报告预签名直传（W-F5-1）、SM3 日志留痕（W-F11-2）、健康探针（W-F11-4）。

### 参考锚点

- K-G 后端底座：`docs/tech-stack/fastapi-sse.md`（EventSourceResponse、Depends、StreamingResponse 取消坑点）；book/chapter2.md §Agent如何调用大模型（流式 delta 与 API 消息结构）。

## 网关 m2

职责: 所有模型流量的唯一出口——LiteLLM 网关封装：多模型路由、Fallback、重试、冷却与用量记账。
目录: `app/gateway/`

### 公开接口

```text
Gateway.chat(messages, model_alias, stream=False, tools=None) -> ChatResult | TokenStream
    # OpenAI SDK base_url=http://litellm:4000，POST /v1/chat/completions；
    # 流式时带 stream_options={"include_usage": true}（F12 用量采集）
Gateway.embed(texts) -> Vectors              # POST /v1/embeddings，Embedding 统一走网关
record_spend(call_id, usage, latency) -> None# 写 Redis 用量计数（m4）+ Postgres 审计表（m3）
# 配置契约（app/gateway/config.yaml）：model_list（Petro-72B 主+DeepSeek 备）、fallbacks、
# num_retries（router 层，SDK max_retries 置 0）、allowed_fails+cooldown_time、request_timeout
```

### 依赖

- 模块: `m3`、`m4`、`m12`
- 外部: LiteLLM Proxy（:4000，config.yaml 契约）——Adapter: **EchoGateway**（固定回复+假 usage+假 call-id）

### Seam 与走查计划

- Seam: 网关是全部 Agent 与"模型世界"的唯一接缝；业务侧只见 OpenAI 兼容形状，换模型不动业务代码。
- Adapter: EchoGateway（骨架期 stub，LiteLLM Proxy 就绪后换真）。
- 走查计划: 锁死 base_url=:4000 调用形状（W-F2-1）、Fallback 降级（W-F2-2）、spend 记账（W-F2-3）、重试防套娃（W-F2-4）、故障冷却（W-F2-5）。

### 参考锚点

- K-F AI 网关：`docs/tech-stack/litellm.md`（model_list 三字段、Router simple-shuffle、三类 fallbacks、冷却、spend logs）；book/chapter1.md §如何选择模型；book/chapter7.md 成本工程节。

## 持久化 m3

职责: SQLAlchemy 2.0 async 统一数据访问——会话记录、用量审计、知识库元数据、问数结果快照、产物元数据；方言可切 PG/金仓。
目录: `app/db/`

### 公开接口

```text
build_engine(url) -> AsyncEngine             # create_async_engine(url, pool_size, pool_pre_ping)；连接串外置
get_session_factory() -> async_sessionmaker  # async_sessionmaker(engine, expire_on_commit=False)
Repository.save_chat_turn(turn) -> None
Repository.get_session_history(thread_id) -> list[Turn]      # selectinload 急加载
Repository.save_query_snapshot(snapshot) -> None             # 问数结果快照（F7）
Repository.get_query_snapshot(snapshot_id) -> snapshot | None  # 问数结果快照读侧：评估回读（m18 调）
Repository.save_audit(call_record) -> None                   # 网关用量审计（m2 调）；亦承载审批审计（幂等键=会话:轮次:SQL指纹）
Repository.save_artifact_meta(meta) -> ArtifactMeta          # 产物元数据（m15 调）
Repository.get_artifact_meta(artifact_id) -> ArtifactMeta    # 产物元数据读侧（下载端点/m15 对账用）
Repository.save_snapshot(key, payload) -> None / get_snapshot(key) -> bytes|None  # BM25 快照存取（m14 装载用）
Repository.save_chunk_meta(meta) -> None / list_chunk_meta(doc_id) -> list[ChunkMeta]  # 块元数据（增量更新定位旧块）
Repository.get_chunks_by_ids(ids) -> list[ChunkMeta]  # 块元数据批查（含块原文与引用定位，Hits 只带 id/score/source）
Repository.save_user(user) -> None / get_user(user_id) -> User  # 敏感字段走 EncryptedField（m11）
# 模型层契约（app/db/models.py）：DeclarativeBase + Mapped[T] + mapped_column；
# EncryptedField 列类型（委托 m11 SM4-CBC）；lazy="raise" 禁隐式 IO
```

### 依赖

- 模块: `m11`（EncryptedField 委托 SM4-CBC）
- 外部: PostgreSQL（开发，`postgresql+asyncpg://`）/ 金仓 KingbaseES（生产，ksycopg2 异步路径，端口 54321，兼容模式 initdb 期固化）——Adapter: **FakeRepository**（内存字典同签名）

### Seam 与走查计划

- Seam: 方言接缝在 `build_engine(url)` 一处——业务代码零修改切库（F11 双跑验证的机制来源）。
- Adapter: FakeRepository；方言层用连接串外置 + 同一 Repository 用例双跑锁死。
- 走查计划: 锁死短会话+expire_on_commit=False（W-F3-1）、selectinload 急加载（W-F3-2）、PG/金仓双跑（W-F3-3）、lazy="raise" 闸（W-F3-4）、SM4 字段落库（W-F11-1）。

### 参考锚点

- K-G 后端底座：`docs/tech-stack/sqlalchemy-async.md`（create_async_engine、async_sessionmaker、selectinload、stream）；`docs/tech-stack/guochan-db-os.md`（ksycopg2、兼容模式、方言差异）。

## 缓存与队列 m4

职责: Redis 承载四件事的统一封装——cache-aside 缓存、Streams 任务队列、SSE 事件缓冲（断线恢复）、网关用量计数。
目录: `app/cache/`

### 公开接口

```text
Cache.get(key) -> value|None / Cache.set(key, value, ttl) / Cache.incr(key) -> int
    # cache-aside 自封（redis-py 官方无高层缓存抽象）；from_url 建连、用毕显式 aclose
TaskQueue.enqueue(stream, job) -> msg_id     # XADD（MAXLEN ~ 裁剪）
TaskQueue.consume(group, consumer, block_ms) -> [Job]   # XREADGROUP，处理后调用方 XACK
TaskQueue.ack(stream, group, msg_id) -> None            # XACK
TaskQueue.claim_stale(stream, group, min_idle_ms) -> [Job]  # XAUTOCLAIM 打捞 PEL 卡住消息
EventBuffer.append(thread_id, event) -> event_id        # SSE 事件按 thread_id 追加 Stream
EventBuffer.replay_since(thread_id, last_event_id) -> [event]  # 断线恢复续推
```

### 依赖

- 模块: （无——叶子）
- 外部: Redis 7.x（redis.asyncio：`from_url`、`xadd/xreadgroup/xack/xautoclaim`、Pub/Sub 仅对照不用于任务）——Adapter: **FakeRedis**（内存 dict + list 模拟 Streams 语义）

### Seam 与走查计划

- Seam: "队列语义"接缝——enqueue/consume/ack/claim_stale 四函数把 Streams 命令细节封在卡内，消费方（`m13`/`m15`）不见 Redis 命令。
- Adapter: FakeRedis。
- 走查计划: 锁死 cache-aside 回填（W-F4-1）、消费组闭环（W-F4-2）、XAUTOCLAIM 打捞（W-F4-3）、Streams vs Pub/Sub 取舍断言（W-F4-4）、断线恢复（W-F1-4）。

### 参考锚点

- K-G 后端底座：`docs/tech-stack/redis-minio.md`（redis-py asyncio、XADD/XREADGROUP/XACK/XAUTOCLAIM、官方无缓存抽象）。

## 对象存储 m5

职责: MinIO 对象存储封装——报告原文与产物的存取、预签名直传直下载、异步生成结果的转存义务。
目录: `app/storage/`

### 公开接口

```text
Storage.put_stream(bucket, key, stream) -> ObjectWriteResult   # put_object 流式上传
Storage.get_stream(bucket, key) -> stream                      # get_object；用毕 close+release_conn
Storage.presigned_url(bucket, key, method, ttl) -> URL         # presigned_put/get_object（GET 默认上限 7 天）
Storage.fetch_and_rearchive(url, bucket) -> key                # 🛡️ 转存义务：24h 临时 URL 下载转存
# 桶契约：reports（原始报告）/ artifacts（生成产物）
```

### 依赖

- 模块: （无——叶子）
- 外部: MinIO（minio-py：Minio(endpoint, ak, sk)、bucket_exists/make_bucket、put/get_object、presigned_*）——Adapter: **FakeStorage**（内存桶+临时目录）

### Seam 与走查计划

- Seam: "对象引用"接缝——库（`m3`）只存 key 不存大块正文；转存义务集中在 `fetch_and_rearchive` 一处。
- Adapter: FakeStorage。
- 走查计划: 锁死预签名直传（W-F5-1）、直下载与连接归还（W-F5-2）、转存义务失败路径（W-F5-3）、万相图转存（W-F10-2）。

### 参考锚点

- K-G 后端底座：`docs/tech-stack/redis-minio.md` MinIO 节（presigned_put/get_object 默认 7 天、get_object 必须 close+release_conn）。

## 问答管道（RAG）m6

职责: 报告库的一生——离线索引（解析分块→向量化→双写索引）与在线检索生成（混合检索→重排序→带引用生成）及 RAGAS 评估。
目录: `app/rag/`（indexer/retriever/ranker/generator/evaluator）、`scripts/build_index.py`、`scripts/eval_ragas.py`

### 公开接口

```text
Indexer.run(pdf) -> ChunkBatch
    # 解析→递归分块（256–1024 token、重叠 10–20%，固定/语义分块可切换对比）→bge-m3 批量嵌入
    # →双写 m14（VectorStore.upsert + Bm25Index.build/save_snapshot）→块元数据入 m3
Retriever.search(query, top_k) -> Candidates
    # 向量（VectorStore.query）+ BM25（Bm25Index.search）双路召回→RRF 融合；低分/空候选返回空
Ranker.rerank(query, candidates, top_n) -> Ranked   # FlagReranker.compute_score(normalize=True) 精排
Generator.answer(query, ranked) -> Answer(citations)
    # 系统提示词要求每句 [报告名 p.页码]，无据不答；经 m2 流式生成（Agentic RAG 追问支线只作设计说明）
Evaluator.run(qa_pairs) -> Metrics                  # RAGAS：faithfulness / answer relevancy / context precision
# —— 版本 4 扩容（知识管理全对齐，F30–F37）——
Indexer.run_parent_child(pdf) -> ChunkBatch         # 父子分块：子块进索引负责命中，父块只入 m3 不索引（F30）
Indexer.build_index_content(chunk) -> str           # 嵌入/倒排输入=标题+面包屑+LLM 前缀摘要+正文（F31；原文不动，前缀只是索引投影）
ParentStore.fetch_parents(child_hits) -> [ParentChunk]  # 命中子块回捞父块扩上下文；INV：父块永不出现在检索结果集（F30）
FaqRegistry.upsert(qa_pair) -> None / FaqRegistry.search(query, top_k) -> [FaqHit]
    # FAQ 一等知识：一条问答对一个 chunk 直入索引、不走解析管线；相似问合并/负例问题不索引/召回不足迭代扩检≤5 轮翻倍（F35）
    # 与 m18 golden 问答对分账：golden=评估资产，FAQ=服务资产，可互转不混用
RefExpander.expand(stream) -> stream                # cN 引用别名流式展开成带 chunk_id 的公开引用；未知别名 fail-closed 直接删除（F33）
Generator.answer_or_fallback(query, ranked) -> Answer
    # 检索空/低分→兜底分支：固定文案或自由回答+明确标注，不报错（F33）
Ranker.rerank_composite(query, candidates, top_n) -> Ranked
    # 重排三档选项：bge 模型分（既有）/ LLM 逐一打分（换范式非补救 RRF）/ 复合分 0.6×模型+0.3×检索+0.1×来源 + MMR λ=0.7（F34）
```

### 依赖

- 模块: `m2`（嵌入与生成）、`m3`（块元数据）、`m14`（双路索引读写）
- 外部: FlagEmbedding（`BGEM3FlagModel('BAAI/bge-m3').encode(return_dense, return_sparse)`、`FlagReranker('BAAI/bge-reranker-v2-m3')`）——Adapter: **FakeRag**（固定候选+固定带引用回答）；嵌入/精排替身 FakeEmbedder/FakeReranker（固定向量/固定分）

### Seam 与走查计划

- Seam: 检索接缝在 `Retriever.search`（m13 的 qa 链只认 Candidates）；索引存储接缝在 m14（本卡不关心向量库实现）。
- Adapter: FakeRag（消费方替身）；真身接入时替换嵌入/精排/生成三处。
- 走查计划: 锁死索引双写（W-F6-1）、混合检索 RRF（W-F6-2）、精排（W-F6-3）、带引用生成（W-F6-4）、无据拒答闸（W-F6-5）、RAGAS 评估（W-F6-6）；版本 4 增锁：父子分块与回捞（W-F30-×）、面包屑前缀对照（W-F31-×）、引用别名 fail-closed 与兜底（W-F33-×）、复合重排+MMR（W-F34-×）、FAQ 库（W-F35-×）。

### 参考锚点

- K-B RAG 全流程：`docs/tech-stack/openai-embedding.md`（bge-m3 三表示、hybrid+rerank 官方管线）；book/chapter3.md §RAG基础（分块三策略/稠密稀疏/混合检索三阶段/三指标）、§超越扁平文本；book/chapter7.md 评估指标口径。
- **版本 4 增补锚点**：父子分块"父块只入库不索引"/EmbeddingContent 面包屑/llmreference fail-closed/rerank.go 复合分+MMR/knowledge_faq.go（weknora 参考实现对照）；book/chapter3.md §3.5（上下文增强 −49%/−67%）。

## 问数状态机 m7

职责: 老王一次提问的一生——LangGraph 状态机把"自然语言→数据查询"拆成意图→选表→生成→安全校验→执行→结果校验的节点与反思回边。
目录: `app/agents/text2sql/`

### 公开接口

```text
build_graph() -> CompiledGraph
    # StateGraph(State)：节点 add_node、静态边 add_edge、反思回边 add_conditional_edges(route_after_verify)、
    # checkpointer（开发 InMemorySaver / 生产 AsyncPostgresSaver，按 thread_id 恢复）
State(TypedDict): question / intent / tables / sql / error / attempts / result / metric / explanation
    # metric 格增补：MetricRef（指标口径绑定，选表节点出、生成节点消费）
    # explanation 格增补：校验注记+血缘解释链（校验链出、结果校验组装解释时带上，可选）
    # attempts 用 Annotated[list, add] reducer 累加（graph.py:AttemptsReducer 语义）
clarify_intent(state) -> dict       # 信息不足先反问（节点幂等——中断恢复整节点重跑）
retrieve_schema(state) -> dict      # 走 m14 的 schema 集合查相关表列（不依赖 m6）
TrustScore.rank(candidates, user) -> [scored]   # 📊 可信资产评分卡（v3.1 扩容）：八信号确定性加权排序，
    # 选表节点前置过滤；逐表信号 breakdown 可解释；v3 重锚定两信号——marts 分层归属（m20）/Ontology 归属域（m16）
generate_sql(state) -> dict         # few-shot 示例固定保缓存；经 m2 生成
check_sql(state) -> dict            # 🛡️ 执行前校验：首段保留纯 AST 只读闸语义；内部经 m17.GuardChain.validate 单出口（五段短路），AST 段 sqlglot 方言近似
run_query(state) -> dict            # 经 m8 执行器跑只读查询；含 interrupt() 人工审批位
verify_result(state) -> dict        # 空/错→结构化错误回灌；条件边回 generate_sql；attempts≥3 熔断转人工
route_after_verify(state) -> "generate_sql" | END   # 条件边路由函数（反思回边）
```

### 依赖

- 模块: `m2`（节点 LLM 调用）、`m3`（结果快照）、`m8`（SQL 执行走工具执行器）、`m14`（schema 检索）、`m16`（指标口径与模板）、`m17`（执行前校验链）、`m18`（few-shot 金标取样）、`m20`（marts 层模型物——选表只认就绪层）、`m21`（检索瀑布与强类型中间态）
- 外部: LangGraph（StateGraph/reducer、条件边、checkpointer、interrupt/Command(resume)、stream_events）——Adapter: **FakeText2SqlGraph**（固定 SQL 轨迹事件流）

### Seam 与走查计划

- Seam: 状态机与模型之间接在 m2；与数据之间接在 m8（执行永远是工具调用）；与运行时之间只认 `CompiledGraph.stream_events`。
- Adapter: FakeText2SqlGraph。
- 走查计划: 锁死意图反问闸（W-F7-1）、主干一生（W-F7-2）、SQL 只读闸（W-F7-3）、反思回边自愈（W-F7-4）、熔断转人工闸（W-F7-5）、interrupt 审批与幂等重跑（W-F7-6）。

### 参考锚点

- K-A 问数全链路 + K-E 编排状态机：`docs/tech-stack/langgraph.md`（官方 SQL Agent 教程节点同构、StateGraph/reducer、interrupt、节点幂等）；book/chapter1.md §ReAct循环、§编排模式；book/chapter5.md 故障四层分类与恢复分级。

## 工具体系 m8

职责: Function Calling 工具机制——注册表、权限闸、执行器与五步调用循环的标准错误三分法；内置三类示例工具。
目录: `app/agents/tools/`（registry/permission/executor/builtin/）

### 公开接口

```text
ToolSpec(name, description, parameters(JSON Schema), permission_level, func)
    # description 必须写"什么时候用+反例"（工具描述的艺术）
Registry.register(spec) -> None
Registry.lookup(name) -> ToolSpec | None
Registry.tools_for(user) -> tools数组     # 经 Permission.filter_tools 过滤后的 OpenAI tools 形状（每轮 ≤20 条）
Permission.filter_tools(user, tools) -> VisibleTools     # 按角色过滤工具可见性 🛡️
Permission.assert_allowed(user, tool) -> None | 拒绝(理由) # 执行前权限闸 🛡️
Executor.call(tool_call, user) -> ToolResult
    # json.loads(arguments) 校验（非法即标准错误回灌）→权限→执行→标准错误三分法：
    # 参数错（可纠正回灌重试）/权限拒（理由入轨迹）/下游错（结构化错误码）
# 内置示例工具（builtin/）：query_production_db（只读查生产库，走 m3）/
# navigate_page（返回前端路由指令）/ invoke_api（调外部系统）
# 沙箱执行模式（v3.1 扩容）：Executor.call_sandboxed(tool_call, user, limits)——受限容器伪代码
#   （只读断言/资源限额/超时，fail-closed）；大结果落 artifact（m5 预签名下载），上下文只收 5 行预览+句柄
# 协议化暴露（v3.1 扩容，概念演绎）：app/agents/tools/mcp_server.py——既有工具经 MCP
#   Tools/Elicitation/Tasks 三映射暴露；只包装 m8 注册工具，外部调用同过 Permission 闸（协议层不加权）；
#   A2A AgentCard 样例为文本交付物
```

### 依赖

- 模块: `m3`（query_production_db 只读查生产库）、`m19`（外发类工具执行前过注入防御闸）
- 外部: OpenAI Chat Completions 工具协议（`tools` 声明 / `tool_calls` / `role:"tool"` + `tool_call_id` 回灌）——Adapter: **EchoTool**（原样回显参数的注册工具）

### Seam 与走查计划

- Seam: 工具即插件——具体工具（m9/builtin）只经 `Registry.register` 进入体系，Executor 按注册名调用，机制与政策分离。
- Adapter: EchoTool。
- 走查计划: 锁死注册契约（W-F8-1）、五步调用循环（W-F8-2）、参数校验闸（W-F8-3）、权限闸（W-F8-4）、下游错结构化（W-F8-5）。

### 参考锚点

- K-D Function Calling：`docs/tech-stack/openai-embedding.md`（tools 字段/tool_call_id 回灌/arguments 必须校验五步循环）；book/chapter4.md 全章（五分类、ACI、工具描述的艺术、参数保真、执行-验证-反馈闭环）。

## 领域工具 m9

职责: 油田领域能力封装为注册表正式工具——岩性识别与产量预测两个"感知工具"（内部跑模型，返回压缩结论）。
目录: `app/agents/tools/domain/`

### 公开接口

```text
identify_lithology(well_id, depth_range) -> LithologyResult
    # XGBoost 测井岩性（FORCE 2020 复现方案）；返回压缩结论+关键数值，原始曲线不进上下文
forecast_production(well_id, days) -> ForecastResult   # LSTM 产量预测；只读角色可用
register_all(registry) -> None       # 启动装配（m1 create_app 调）：批量注册并声明权限级别
```

### 依赖

- 模块: `m8`（ToolSpec/Registry 注册契约）
- 外部: FORCE 2020 预训练模型文件（XGBoost/LSTM，只推理不训练）——Adapter: **FakeDomainModel**（固定岩性/预测结论 JSON）

### Seam 与走查计划

- Seam: 领域知识与 Agent 世界的接缝是 ToolSpec——工具实现不知道调用者是谁，权限与校验全在 m8。
- Adapter: FakeDomainModel。
- 走查计划: 锁死感知工具压缩返回（W-F9-1）、权限放行（W-F9-2）、查无此井结构化错误（W-F9-3）、启动装配（W-F9-4）。

### 参考锚点

- K-D 落地实例：FORCE 2020/Volve 数据与方案；book/chapter10.md 多 Agent 何时真正优于单 Agent（执行/工具反馈=新信息）。

## 问智生成器 m10

职责: 多模态成品能力件——PPT 生成、万相异步文生图/文生视频、TTS 与 ASR 四件套的接口集成（不含队列与落库）。
目录: `app/multimodal/`（ppt_gen/image_gen/video_gen/speech）

### 公开接口

```text
make_ppt(analysis_json, template) -> PptFile
    # Presentation('模板.pptx')→add_slide→shapes.title/placeholders/add_textbox→prs.save；
    # 进阶形态："提议者-审核者"（Proposer 写代码经 m2、Reviewer 渲染检查）
create_image(prompt) -> {task_id, urls} | 任务失败
    # 万相两步异步：POST image-synthesis（头 X-DashScope-Async: enable）→轮询 GET tasks/{task_id}
    # 至 task_status=SUCCEEDED；返回的 OSS URL 24h 过期——转存是调用方（m15）经 m5 的义务
create_video(prompt) -> {task_id}     # 与文生图同构（创建→轮询），只给模式
tts(text) -> AudioStream              # edge-tts（--voice zh-CN-XiaoxiaoNeural 形状，出 mp3+srt；无 SLA 仅原型）
asr(audio) -> Text                    # FunASR OpenAI 兼容 POST /v1/audio/transcriptions（经 m2 网关统一管理）
```

### 依赖

- 模块: `m2`（proposer LLM、asr 经网关）
- 外部: python-pptx / 万相 DashScope（异步任务）/ edge-tts / FunASR——Adapter: **FakeMultimodal**（秒回本地假产物文件、立即 SUCCEEDED）

### Seam 与走查计划

- Seam: 生成器只产出"产物候选"（内存/临时文件/任务句柄），落桶、落库、通知全在 `m15`——生成与交付分离。
- Adapter: FakeMultimodal。
- 走查计划: 锁死 PPT 模板生成（W-F10-1）、万相两步异步与转存（W-F10-2）、任务失败路径（W-F10-3）、TTS（W-F10-4）、ASR（W-F10-5）、视频同构模式（W-F10-6）。

### 参考锚点

- K-C 问智多模态：`docs/tech-stack/multimodal-api.md`（python-pptx quickstart、万相 X-DashScope-Async 两步+24h、edge-tts、FunASR OpenAI 兼容服务）；book/chapter5.md §代码：通用Agent的元能力（提议者-审核者）。

## 国产化与安全合规 m11

职责: 国密与国产化交付——敏感字段 SM4 加密、接口报文 SM3 摘要、Docker/麒麟离线交付物（金仓方言适配在 m3 的 Seam 上）。
目录: `app/security/`、`deploy/`

### 公开接口

```text
Crypto.encrypt_field(plaintext) -> base64(iv‖cipher)
    # gmssl：CryptSM4().set_key(key16bytes, SM4_ENCRYPT)→crypt_cbc(iv, plain)（PKCS7，无 GCM）；IV 随机
Crypto.decrypt_field(payload) -> plaintext   # set_key(key, SM4_DECRYPT)→crypt_cbc 解密去填充
Crypto.digest(payload_bytes) -> sm3_hex
    # gmssl：sm3.sm3_hash(func.bytes_to_list(data))→func.list_to_bytes(...).hex()（列表进出是形状坑）
key_selfcheck() -> None                      # 🛡️ 启动自检：密钥缺失/长度≠16 字节快速失败
# 交付物契约：deploy/Dockerfile（多阶段构建、非 root USER app、HEALTHCHECK /healthz、CMD exec 形式）
# deploy/docker-compose.yml（depends_on: condition: service_healthy、命名卷、litellm 服务）
```

### 依赖

- 模块: （无——叶子；被 `m1`、`m3` 依赖）
- 外部: gmssl 3.2.2（纯 Python，无 native 扩展，麒麟/鲲鹏可跑）；Docker/Compose——Adapter: 无（纯函数库自检即替身）

### Seam 与走查计划

- Seam: 加密接缝藏在 m3 的 EncryptedField 列类型后（调用方无感）；交付接缝是 Dockerfile/compose 两个文件。
- Adapter: 无替身；密钥自检函数是可走查的最小接缝。
- 走查计划: 锁死 SM4 字段加解密（W-F11-1）、SM3 留痕（W-F11-2）、金仓双跑（W-F3-3/W-F11-3）、compose healthy 编排（W-F11-4）、离线交付（W-F11-5）、密钥自检闸（W-F11-6）。

### 参考锚点

- K-I 国产化：`docs/tech-stack/guomi-sm.md`（set_key+crypt_ecb/crypt_cbc(iv, plain)、无 GCM、sm3 列表进出）；`docs/tech-stack/docker.md`（多阶段、非 root、HEALTHCHECK、depends_on service_healthy、save/load）；`docs/tech-stack/guochan-db-os.md`（麒麟 V10 RHEL8 兼容系、ksycopg2）；金仓替换公开行业案例。

## 可观测 m12

职责: Trace 与指标采集——每次 Agent 运行的节点耗时、工具调用、token 成本与网关 TTFT/延迟的 span 树。
目录: `app/observability/`

### 公开接口

```text
Tracer.start_span(run_id, name) -> Span / Tracer.end_span(span, attrs) -> None
Tracer.trace_run(run_id, spans) -> None      # span 树落盘（"体检指标"类比）
Metrics.record_ttft(model_alias, ms) / Metrics.record_latency / Metrics.record_cost(call_id, cost)
Metrics.over_budget?(budget) -> bool         # 成本熔断判据（m2 降级切换用）
# 可观测标准化（v3.2 扩容）：otel_map.py:to_otel_attrs(span_attrs) -> gen_ai.* 属性族
#   —— m12 span 属性按 OTel GenAI 语义约定映射出门，不丢不造（平台特有属性显式标注）；Langfuse 形态文档交付
```

### 依赖

- 模块: （无——叶子）
- 外部: 无外部服务（内存 span 树 + 结构化日志）——Adapter: **FakeClock**（可拨快的时间源，喂固定耗时样本）

### Seam 与走查计划

- Seam: 采集接缝是 start_span/end_span 两函数——各模块在公开接口边界打点，内部零侵入。
- Adapter: FakeClock。
- 走查计划: 锁死成本熔断判据（W-F12-4）、运行 span 树（W-F12-5）。

### 参考锚点

- K-J 性能优化 → book/chapter7.md（TTFT/p95、成本上限熔断、OpenTelemetry Trace）；book/chapter2.md §KV Cache友好的上下文设计。

## Agent 运行时 m13

职责: 三链路的调度与主循环——dispatch 按 agent_type 路由 qa/text2sql/wenzhi，qa/text2sql 跑工具调用主循环并把节点/token 事件桥接成事件帧，wenzhi 不进主循环转任务队列。
目录: `app/agents/`（runtime.py、prompt_layout.py）

### 公开接口

```text
dispatch(agent_type, message, user) -> EventStream
    # "qa"→run_qa_loop；"text2sql"→run_text2sql；"wenzhi"→enqueue_wenzhi（不进主循环）
run_qa_loop(message, user, thread_id) -> 事件帧序列
    # 主循环（while 有 tool_calls/未终态）：m6 管道产出候选→m2 生成；模型 tool_calls→m8.Executor→
    # role:"tool" 回灌→继续；每帧 append 进 m4.EventBuffer（断线恢复）
run_text2sql(message, user, thread_id) -> 事件帧序列
    # m7 graph.ainvoke / stream_events → 节点级事件桥接；会话上下文走 m4 cache-aside（miss 回源 m3）
enqueue_wenzhi(job) -> msg_id     # m4.TaskQueue.enqueue 后立即返回受理帧（运行时不等 worker）
layout_messages(system, history, tools, dynamic) -> messages
    # KV Cache 友好装配（F12 三铁律：系统提示词+工具定义冻结、动态信息只追加末尾、标准 API 格式）
```

### 依赖

- 模块: `m2`（循环内 LLM 调用）、`m3`（会话轮落库/上下文回源）、`m4`（事件缓冲、任务队列、cache-aside）、`m6`（qa 管道）、`m7`（问数图）、`m8`（工具执行）、`m12`（span 打点）、`m19`（装配打标与措辞裁决）
- 外部: 无直接外部（外部依赖全部经下游模块的 Adapter 隔离）——Adapter: **EchoAgent**（固定事件帧序列；骨架期 stub，后续逐链路换真身）

### Seam 与走查计划

- Seam: 运行时是"事件语义"接缝——下游管道只需产出事件，SSE 帧形状由本卡桥接（m1 不懂业务事件）。
- Adapter: EchoAgent；stub 纪律=某部件未就绪时以 XX stub 先行交付，后续换真身。
- 走查计划: 锁死 dispatch 路由（W-F1-1/W-F7-1/W-F10-1 的第一跳）、主循环五步闭环（W-F8-2）、断线恢复帧缓冲（W-F1-4）、KV Cache 装配（W-F12-1/2）。

### 参考锚点

- K-A/K-E/K-H：stream_events 桥接（LangGraph）；book/chapter2.md §Agent如何调用大模型、§KV Cache友好的上下文设计、§提示工程；book/chapter1.md §编排模式（工作流 vs 自主）。

## 索引存储 m14

职责: 报告库的双路索引封装——Chroma 向量库 + rank_bm25 倒排（快照落库，重启装载），检索方不看存储实现。
目录: `app/rag/`（vector_store.py、bm25_index.py）

### 公开接口

```text
VectorStore.upsert(ids, embeddings, documents, metadatas) -> None   # Chroma collection.upsert
VectorStore.query(embedding, top_k, where=None) -> Hits             # collection.query（含过滤）
Bm25Index.build(chunk_ids, tokens) -> None          # rank_bm25.BM25Okapi 进程内建索引
Bm25Index.search(query_tokens, top_k) -> Hits       # BM25Okapi.get_scores 取 top
Bm25Index.save_snapshot() -> None                   # pickle 快照经 m3 落 bm25_snapshots 表
Bm25Index.load_snapshot() -> None                   # 启动装载（进程内索引的持久化义务）
# 选型记录：向量库 Chroma（官方件，compose 增 chroma 服务）；生产替换路径 pgvector（只作设计说明，不实现）
# —— 版本 4 扩容（F30/F35/F36/F37）——
# 父块表（m3）只入不索引：INV——父块永不出现在 VectorStore/Bm25Index，命中后由 m6 回捞
# FAQ 块/摘要块/问题块/图片子块（image_caption/image_ocr）复用同一六函数双写，metadatas 带 chunk_type 区分——
# 检索侧可按类型过滤或加权；删除按知识 ID 级联（先清后写守幂等）
```

### 依赖

- 模块: `m3`（BM25 快照落库/装载）
- 外部: Chroma（PersistentClient/collection API）、rank_bm25（BM25Okapi）——Adapter: **FakeIndex**（内存 dict 同签名）

### Seam 与走查计划

- Seam: 存储接缝是 upsert/query 与 build/search/save/load 六函数——m6/m7 只认 Hits，换 pgvector 不动管道。
- Adapter: FakeIndex。
- 走查计划: 锁死双写（W-F6-1 的索引半程）、双路召回（W-F6-2）、schema 检索（W-F7-2 经 m7c）；版本 4 增锁：父块不索引 INV（W-F30-2）、chunk_type 区分与级联删（W-F36-2/W-F37-2）。

### 参考锚点

- K-B → book/chapter3.md §RAG基础（稠密/稀疏/混合检索三阶段）；bge-m3 sparse 词项权重与 BM25 的同构性（`docs/tech-stack/openai-embedding.md`）；Chroma/rank_bm25 选型（官方件、CPU 可跑），生产替换路径 pgvector。

## 问智 worker m15

职责: 问智异步进程——Streams 消费循环取任务→调 m10 生成→产物落 MinIO→元数据入库→事件通知。
目录: `app/multimodal/worker.py`

### 公开接口

```text
WenzhiWorker.run() -> Never
    # 消费循环：TaskQueue.consume("wenzhi", consumer, block_ms)→_handle_job→TaskQueue.ack；
    # 启动时先 TaskQueue.claim_stale 打捞 PEL 卡住消息（XAUTOCLAIM）
WenzhiWorker._handle_job(job) -> 产物引用
    # 编排：m10.make_ppt/create_image/tts → m5.put_stream + fetch_and_rearchive（转存义务）→
    # m3.Repository.save_artifact_meta → 通知
WenzhiWorker.notify_done(thread_id, artifact_ref) -> None
    # m4.EventBuffer.append 完成事件帧（主任在线即经 SSE 收到）
```

### 依赖

- 模块: `m3`（产物元数据）、`m4`（消费循环与通知）、`m5`（产物落桶与转存）、`m10`（生成能力）、`m12`（耗时打点）
- 外部: 无直接外部——Adapter: **EchoJob**（手动 enqueue + 同步 _handle_job 的先行替身）

### Seam 与走查计划

- Seam: "受理与交付"接缝——m13 只管 enqueue 受理，交付结果经 m4 事件缓冲异步回流；生成失败语义（重试→FAILED）锁在本卡。
- Adapter: EchoJob。
- 走查计划: 锁死消费组闭环（W-F4-2）、打捞（W-F4-3）、PPT 交付全链（W-F10-1）、万相失败路径（W-F10-3）、转存义务（W-F10-2/W-F5-3）。

### 参考锚点

- K-C/K-G：Streams 消费组/XAUTOCLAIM；万相异步任务模式；book/chapter5.md（异步任务模式与元能力编排）。

## 语义层与指标注册 m16

职责: 业务口径与语义资产的治理平台——**4+1 能力域**（Glossary 术语 / Operational Ontology 实体关系 / Metric 指标 / Playbook 任务剧本 + Governance 横切）；Metric 域承载"一次定义处处复用"（YAML 注册表 + verified metric 生命周期）；三域冷启动走"AI 候选→冲突检测→Owner 审批"；对外提供 Ossie 兼容导出。Metric 域绑定升级到 `m20` marts 层模型物。
目录: `app/semantics/`（registry.py、resolver.py、lifecycle.py、glossary.py、ontology.py、playbook.py、ossie.py、metrics/、glossary/、ontology/、playbooks/）

### 公开接口

```text
MetricRegistry.load(dir) -> None                    # 装载 metrics/*.yaml（口径即代码，进版本管理；PyYAML safe_load）
MetricRegistry.lookup(term, user) -> [MetricCandidate]   # 精确 id→同义词表→别名模糊；候选带口径差异摘要
MetricRegistry.get(metric_id, version="latest") -> MetricDef
Resolver.bind(candidates, user_choice=None) -> MetricRef | 澄清(候选差异) | 默认(标注)
    # 唯一命中直绑；多候选→澄清帧交用户裁决；用户不选按默认口径出数并标注
Lifecycle.propose(draft) -> proposal_id             # 未命中：AI 候选入库待审（候选生成在 m7 经 m2）
Lifecycle.approve(proposal_id, reviewer) -> MetricDef  # 🛡️ 人工审核发布：版本+1 写回注册表
Lifecycle.template_for(metric_ref) -> sql_template  # 命中 verified metric → 固定模板（m7 直用，不重新自由生成）
# MetricDef: id/name/definition/modifiers/synonyms/unit/owner/version/sql_template/status
# —— 版本 3 扩容（4+1 能力域）——
GlossaryRegistry.load(dir) / lookup_term(term) -> [GlossaryHit]
    # 术语/同义词/缩写/**禁用词**/有效期/Owner/状态；禁用词命中→拒答或替换建议（🛡️）
OntologyRegistry.resolve_entity(term) -> [EntityDef] / joins_allowed(tables) -> bool | join_path
    # 实体（属性/有效时间/Action）/关系（隶属/计量/替代+基数）/**合法 Join 白名单**（"产液表只能 join 井 dim"）
PlaybookRegistry.match_intent(intent) -> PlaybookDef | None
    # 触发意图/步骤/工具/缺参策略/HITL 点/输出合同——"为什么下滑"类分析任务的剧本（m7 按剧本驱动子图）
    # 步骤工具枚举 v3.1 补记：装载闸紧枚举增"沙箱查库"
OssieExport.dump() -> ossie_yaml                  # 语义资产 → Apache Ossie 格式（Dataset/Metric/Relationship/extensions）
# 冷启动共识：AI 只产候选草稿，冲突检测后必须 Owner 审批才入权威域（三域同规）
```

### 依赖

- 模块: `m3`（注册表与审批审计落库）、`m20`（Metric 域绑定 marts 模型物）
- 外部: PyYAML（`yaml.safe_load`）——Adapter: **FakeRegistry**（内存字典同签名）

### Seam 与走查计划

- Seam: "口径语义"接缝——`m7` 只认 MetricRef/sql_template/`match_intent`/`joins_allowed` 公开面，不读 YAML 细节；审批人身份由调用方传入，本卡不鉴权。
- Adapter: FakeRegistry。
- 走查计划: 锁死 W-F13-1/2/3/4、W-F19-1/2/3/4、W-F23-1/2。

### 参考锚点

- K-A 问数/口径治理：dbt SL"一次定义处处刷新"一致性、MetricFlow 编译、Genie metric view/verified queries、OSI YAML 交换规范；黑话→语义对象、verified metric 闭环、澄清交互；curated descriptions 六层上下文。
- **版本 3 增补锚点**：DataBuddy 4+1 能力域与六阶段冷启动、Gravitino 四对象（Domain/Glossary term/Semantic view/Data asset）；术语 glossary 与 ownership 治理实践。

## 执行前校验链 m17

职责: "SQL 能跑"到"结果可直用"的闸门组——AST（方言近似解析）→策略（行列权限 mandatory filter 注入）→新鲜度（批次水位比对）→血缘（解释链标注）→审计（span+落库）五段短路链；方言差异沉淀为渐进披露技能包。
目录: `app/agents/text2sql/guardchain/`（chain.py、stages/、dialects/SKILL.md）

### 公开接口

```text
GuardChain.validate(sql, user, metric_ref=None) -> Verdict
    # 五段顺序执行任一 REJECT 即短路；Verdict: allow(annotated) | reject(stage, reason, fix_hint)
AstStage.parse(sql, dialect="postgres") -> AST | ParseError
    # 首段以纯 AST 闸语义先行（SELECT+白名单+LIMIT）；正式实现换 sqlglot.parse_one(sql, read=dialect)
    # 金仓≈postgres、达梦≈oracle 近似；差异清单在 dialects/SKILL.md（渐进披露）
PolicyStage.inject_filters(sql, user) -> sql'      # 行列权限 mandatory filter 注入改写
FreshnessStage.check(tables) -> fresh | stale(batch_ts) | unknown   # m3 批次水位；unknown 跳过并标注
LineageStage.annotate(metric_ref, tables) -> Explanation  # 指标名+版本+来源表+过滤条件解释链
AuditStage.log(verdict, user) -> None              # 经 m12 span + m3 审计落痕
```

### 依赖

- 模块: `m3`（批次水位/审计）、`m12`（span）、`m16`（metric_ref 血缘标注，可选传入）、`m20`（水位测试来源升级为 marts 层批次）
- 外部: sqlglot（`parse_one(sql, read=...)`、`expression` 改写）——Adapter: **FakeFreshness**（固定批次水位）；AST 段替身沿用纯 AST 闸语义

### Seam 与走查计划

- Seam: "执行前裁决"接缝——`m7` 只认 `GuardChain.validate` 一个出口，五段顺序与短路语义锁死本卡；近似方言只拦截不修复，不替代真实库试跑。
- Adapter: FakeFreshness。
- 走查计划: 锁死 W-F14-1/2/3/4/5/6。

### 参考锚点

- K-A/K-I：sqlglot 34 方言、无金仓/达梦、postgres/oracle 近似结论；阶段间确定性检查、可执行错误信息、Skills 渐进披露；mandatory filter/新鲜度治理。

## 评估证据链 m18

职责: 问数质量的可复现证据 + **语义资产的发布门禁**——golden 问答对注册（多问法+手算金标；一鱼两用：few-shot 引导+评估基准）、结果集比对 grader（拒绝 SQL 文本匹配）、同问多法稳定性跑批、promptfoo 断言/红队导出、badcase 登记入口；**版本 3 扩容：五级语义 CI（L1–L5，L1 收编装载闸、L5 复用 golden）+ 三源建议池（Benchmark/实体体检/Runtime 信号统一收口）+ Agent 只提 MR 四红线流程**。
目录: `app/eval/`（golden_store.py、grader.py、stability.py、promptfoo_export.py、badcase.py、semantic_ci.py、suggestion_pool.py、mr_flow.py）、`scripts/eval_text2sql.py`

### 公开接口

```text
GoldenStore.add(case) -> case_id        # case: question×N 问法/golden_sql/golden_result(手算)/metric_ref/owner；无金标拒收
GoldenStore.sample_fewshot(metric_ref, k) -> [case]   # 引导半边：只读取样，装配进 m7.generate_sql 冻结段
ResultGrader.compare(expected, actual) -> pass | fail(diff) | inconclusive
    # 行集比对：排序键声明→行对齐→数值容差；拒绝朴素 SQL 字符串匹配
StabilityRunner.run(case) -> [trial]    # 同问 N 法 × M 次；全 pass 才标"稳"
PromptfooExport.cases() -> yaml         # 断言+注入红队用例导出（promptfoo eval -c 消费）
Badcase.register(query, answer, expected, owner) -> badcase_id  # 🛡️ 错误资产化（回归闭环后续扩展）
# —— 版本 3 扩容（发布门禁与受控进化）——
SemanticCI.validate_change(change) -> [gate_report]
    # L1 schema 合法（收编 v2 装载闸语义）→ L2 引用一致性（三域引用闭包/循环/废弃引用，查 m16 公开面）→
    # L3 指标 SQL 与安全（只读/粒度/零分母/参数化）→ L4 治理（Owner/敏感字段/破坏性变更）→ L5 行为回归（GoldenStore 全量+负样本）
SuggestionPool.submit(source, evidence) -> suggestion_id
    # 三源统一收口：benchmark（golden fail）/ checkup（实体体检四维评分）/ runtime（miss/ambiguous/rewrite/error/feedback）
    # 统一字段：证据/置信度/优先级/状态；四维体检 = 信息完整度/逻辑语义/数据覆盖/关系健全度
MrFlow.propose_mr(diff, submitter) -> mr_id / approve_mr(mr_id, reviewer) -> release
    # 🛡️ Agent 只提 MR 四红线：不直接改主干/只提 MR 不自行合并/不手改派生物/高影响变更人工审批；
    # 合并 = SemanticCI 全绿 + Owner 审批 → 版本发布可回滚
```

### 依赖

- 模块: `m3`（golden/badcase/建议池落库与结果快照回读）、`m16`（metric_ref 关联与三域引用闭包查询——CI 的 L2/L4 走 m16 公开面，不反向依赖）
- 外部: promptfoo（yaml 契约 + `promptfoo eval -c` CLI 形状）——Adapter: **FakeGrader**（固定 pass/fail+diff 样本）

### Seam 与走查计划

- Seam: "质量证据与发布门禁"接缝——评估只读公开面，不写问数主链路状态；CI 是语义资产变更的唯一放行出口（`m16` 生命周期产变更包，本卡裁决）。
- Adapter: FakeGrader。
- 走查计划: 锁死 W-F15-1/2/3/4、W-F20-1/2/3、W-F24-1/2、W-F25-1/2/3。

### 参考锚点

- K-A 评估：golden SQL 与结果双重比对/生产金丝雀；outcome vs trajectory、三类 grader、20-50 条起步；Genie example SQL/benchmark questions；评测集不能自己写、手算金标；promptfoo。

## 注入防御层 m19

职责: 数据侧 prompt injection 的系统层防线——四级信任标（系统>开发者>用户>数据）随内容走、装配处打标、外发类工具在污染会话默认拒绝、注入红队用例表常备。
目录: `app/security/injection/`（taint.py、policy.py、cases.yaml）

### 公开接口

```text
TaintTag: system | developer | user | tool | knowledge   # 信任级标签（数据侧两级：工具结果/知识检索）
Tagger.wrap(source, content) -> TaggedText               # 装配处打标：报告块=knowledge、工具结果=tool
Policy.assert_outbound(tool_name, tags_present) -> allow | deny(理由)
    # 🛡️ 外发通道闸：会话含 knowledge/tool 污染时外发类工具默认 deny（白名单例外登记在 cases.yaml）
Policy.highest_untrusted(tags_present) -> level          # 供 m13 装配"仅作引用不作指令"措辞裁决
RedteamCases.all() -> [case]                             # 注入红队用例（报告藏刀/工具结果藏指令/字段注释藏指令）
```

### 依赖

- 模块: （无——叶子；外发工具清单与用例表自持于 cases.yaml）
- 外部: 无——Adapter: 无（纯函数+用例表即替身）

### Seam 与走查计划

- Seam: "信任分级"接缝——`m13` 装配处只问 Tagger/Policy，`m8.Executor` 外发调用前置只问 assert_outbound；打标点集中在装配一处。
- Adapter: 无替身。
- 走查计划: 锁死 W-F16-1/2/3。

### 参考锚点

- K-A/K-H 安全：lethal trifecta；instruction hierarchy；CaMeL 系统层执法/工具边界；Fabric intent layers 产品化对照；责任链。

> **2026-09-15 版本 3 增补**：新卡 `m20` 数据建模与转换分层、`m21` 语义运行时；`m16` 扩容（4+1 能力域 + Ossie 导出）、`m18` 扩容（五级语义 CI + 三源建议池 + 只提 MR）；依赖边 `m7`→{m21}、`m17`→{m20}。PRD 增补节 F17–F25；走查断言 §F17–§F25。

## 数据建模与转换分层 m20

职责: AE 世界观载体——把裸生产库加工成"分析就绪"的分层模型：staging（清洗）/ intermediate（集成）/ marts（星型模型）；grain 协议先行，分层 SQL 文本为交付物，转换测试守护分层契约。
目录: `app/modeling/`（layers.py、grain.py、tests_policy.py、models/）

### 公开接口

```text
LayerPlan.describe(layer) -> LayerContract      # staging/intermediate/marts 各层"进什么/出什么/防什么错"
GrainProtocol.declare(table, grain) -> GrainSpec  # 🛡️ 粒度先行："每行是什么"的约束性协议，必须先于维度与事实声明
StarModel.design(process) -> ModelSpec          # 四步法：业务过程→grain→维度→事实
                                                # 油田锚定：日产计量 / 井×日 / 井·日期维度（反规范化含油田层级）/ 产液·产油·压力
TransformTest.suite(layer) -> [check]           # 唯一性/非空/引用完整/值域/水位新鲜度；marts 层收编 v2 freshness 语义
# 分层 SQL 文本（models/staging|intermediate|marts/*.sql）是本卡交付物——dbt 思想演绎，不引入 dbt 依赖
```

### 依赖

- 模块: `m3`（模型物与测试结果落库）
- 外部: 无框架（PostgreSQL 方言 SQL 文本演绎）——Adapter: **FakeModel**（固定分层 schema 与测试样本）

### Seam 与走查计划

- Seam: "分析就绪数据"接缝——`m7` 选表/生成、`m16` 指标绑定只消费 marts 层模型物；分层 SQL 本体是文本交付物，执行不在本卡。
- Adapter: FakeModel。
- 走查计划: 锁死 W-F17-1/2/3、W-F18-1/2/3。

### 参考锚点

- K-A/K-G：Kimball 四步与 grain、Clean-Integrate-Enrich、数据质量三来源；DataBuddy 建仓六步流水线。

## 语义运行时 m21

职责: 把"检索+装配"升级为协议——S0–S8 检索瀑布（显式锚定优先、确定性先于向量、可早停、回读权威源）与强类型中间态五段（IntentSpec→SemanticContext→SemanticPlan→ExecutionPlan→EvidencePack）。
目录: `app/agents/text2sql/retrieval_protocol/`（waterfall.py、stages.py）、`app/agents/text2sql/typedstate.py`

### 公开接口

```text
Waterfall.retrieve(question, user, budget) -> SemanticContext
    # S0 固定边界→S1 显式锚定→S2 对象装配→S3 确定性→S4 混合召回→S6 资格与歧义→S7 回读权威源；
    # 逐级升级可早停；S5 受限图扩展只作概念演绎
Anchor.parse(text) -> ExplicitAnchor | None       # "@metric 产量完成率"式显式锚定语法（S1）
TypedState.assemble(stage, payload) -> 五段强类型  # IntentSpec/SemanticContext/SemanticPlan/ExecutionPlan/EvidencePack
    # "模型提出计划，协议决定执行"：SemanticPlan 违反本体约束即失败关闭
```

### 依赖

- 模块: `m16`（三域权威源与回读）、`m14`（S4 混合召回复用既有索引）、`m20`（marts 模型物引用闭包）
- 外部: LangGraph（TypedDict/StateGraph 形状）——Adapter: **FakeWaterfall**（固定 S 级命中轨迹）

### Seam 与走查计划

- Seam: `m7` 的 retrieve_schema 升级为 `Waterfall.retrieve` 单出口；State 七字段升级为 TypedState 五段；`m19` Scope 约束作为 S0 边界输入（只读公开面）。
- Adapter: FakeWaterfall。
- 走查计划: 锁死 W-F21-1/2/3/4、W-F22-1/2。

### 参考锚点

- K-A/K-E：DataBuddy S0–S8 与五段式；LangGraph 官方形状。

## 知识管线枢纽 m22

职责: 知识库入库后的四开关与后处理分发——IndexingStrategy{Vector/Keyword/Wiki/Graph}Enabled 按知识库配置（缺管线也能跑），分发枢纽按开关扇出：多模态子块（F36）、摘要+问题生成（F37）、图谱抽取（m25）、Wiki 生成（m27）；chunk 挑选闸（无正文不抽——防 LLM 复读 few-shot、防重复计费）。
目录: `app/knowledge/`（strategy.py、post_process.py、summary.py、question_gen.py）

### 公开接口

```text
IndexingStrategy.for_kb(kb_id) -> Strategy          # 四开关按库配置，默认只开 vector+keyword；NeedsChunks=四管线都依赖分块
PostProcess.dispatch(doc_id, strategy) -> None      # 分发枢纽：按开关扇出四路后处理，原子计数收敛
ChunkPicker.pick(chunks, purpose) -> [Chunk]        # 挑选闸：丢 caption/OCR 无正文块、text 必须过可抽取判定（防复读防重复计费）
SummaryGen.run(doc) -> SummaryChunk                 # 全文档摘要×1，入索引带 chunk_type=summary（F37）
QuestionGen.run(chunks, batch=20) -> [QuestionChunk]  # 每 20 块一批生成"可能被问的问题"，入索引带 chunk_type=question（F37）
```

### 依赖

- 模块: `m2`（摘要/问题生成走网关）、`m3`（任务与计数落库）、`m14`（产物块双写）
- 外部: 无新增——Adapter: **FakePostProcess**（固定扇出轨迹）

### Seam 与走查计划

- Seam: "后处理"接缝——m6 的 Indexer 只管分块与双写，后处理四路全部经 `PostProcess.dispatch` 扇出；图谱/Wiki 两路的消费方只认本卡公开面，不知 m25/m27 内部。
- Adapter: FakePostProcess。
- 走查计划: 锁死四开关降级（W-F32-×）、多模态扇出（W-F36-1）、摘要+问题入索引（W-F37-×）。

### 参考锚点

- 参考实现对照：`indexing_strategy.go` 四开关+NeedsChunks；`knowledge_post_process.go` 分发枢纽；`selectGraphChunks`/`chunkHasExtractableText` 挑选闸（weknora 参考实现）。

## 本体构建缝 m23

职责: "本体怎么建"的接缝与选项制落点——OntologyBuilder 五操作统一接口，缝后挂五流派实现（A 拆解/B 聚类/C 两步走/D 框架/E 直给）；深度分档：A/D 全机制档（m24/m25），B/C/E 取舍档（本卡内联核心段+失败模式）；四维对照表（幻觉风险/工程复杂度/验证机制/版本管理）与选型决策树。
目录: `app/ontology_builder/`（builder.py、schools/pipeline_a.md、schools/cluster_b.md、schools/two_phase_c.md、schools/schema_guided_d.md、schools/e2e_e.md）

### 公开接口

```text
OntologyBuilder.define_schema(profile) -> SchemaSpec   # A 派=机读注册表；D 派=ExtractConfig；B/C/E=隐式
OntologyBuilder.extract(corpus, schema) -> DraftGraph  # 产出永远是草案——"证据非权威，待确认"
OntologyBuilder.validate(draft) -> ValidationReport    # A 派=语义 CI L1–L4；D 派=类型闸；E 派=无
OntologyBuilder.store(draft, namespace) -> None        # A 派=YAML 仓+MR；D 派=图存储 namespace=库+文档
OntologyBuilder.evolve(change) -> Proposal             # A 派=换义锁定+CHANGELOG；D 派=改配置重抽
# 五流派对照原表：幻觉风险 A低/B低/C中/D低/E高；工程复杂度 A高/B中/C中/D中/E低；
# 验证机制 A=SHACL+OWL 双重/D=框架约束/B/C/E=无在线验证；版本管理 仅 A 有
```

### 依赖

- 模块: `m2`（抽取走网关）；实现侧见 `m24`/`m25`
- 外部: 无——Adapter: **FakeBuilder**（固定草案）

### Seam 与走查计划

- Seam: 本卡就是缝——m24（A 派）与 m25（D 派）互不知情，都只实现五操作；消费方（问答链/问数链）只认 DraftGraph/ValidationReport 形状。
- Adapter: FakeBuilder。
- 走查计划: 锁死五操作契约（W-F38-×）、擂台对账（W-F42-×）。

### 参考锚点

- 本体构建四道坎、五流派、五条实战教训；book/chapter3.md §GraphRAG。

## 治理本体仓 m24（A 派实现）

职责: 受治理的业务本体唯一真源——机读 schema 注册表（模型清单/逐元素必填/依赖白名单）+ 前缀即类型（AGG-/RULE-/GLS-…，ref 只认稳定 ID）+ 逐元素注源（无源不落仓）+ 换义锁定（退役字段名禁复用）+ profile 裁剪（full/core/headless）；构建路径=LLM 草案→冲突检测→MR→语义 CI（m18 五级闸复用）→Owner 审批；**图是派生物**（启动时从 YAML 全量重建纯内存引用图，禁持久化缓存成权威）。
目录: `app/ontology_vault/`（schema_registry.py、vault.py、graph_index.py、ci_gate.py、ontology/<域>/*.yaml）

### 公开接口

```text
SchemaRegistry.load() -> Registry                   # model-registry+model-deps 双机读表，version 同步检查
Vault.propose(draft) -> proposal_id                 # LLM 草案头部强制声明"证据非权威，待 Owner 确认"
Vault.ci_gate(proposal) -> L1|L2|L3|L4|L5 Report    # 复用 m18 五级闸；无源/坏前缀/越白名单 ref/旧字段名复用=红
Vault.approve(proposal_id, owner) -> Merge          # Owner 审批才入仓（四条红线沿用 F25）
GraphIndex.rebuild() -> Graph                       # 每次启动全量重建；--closure N 正向闭包 / --impact 反向影响集
# 换义锁定：lockedFields 登记退役字段名，L4 闸复用即红——"新增字段不复用旧名"
# —— 版本 4 增补（F53/F54）——
MappingPipe.ingest(source) -> DraftObjects           # 源系统→本体对象落地链路演绎：as-is 入库→三路径清洗→映射四件套→增量三层（F53）
# 行业化注记：三层复用（领域对象 90%+/源系统映射 70%+/客户定制），mapping 规则库=护城河（F54）
# 模式件（patterns/）："长得像的一类卡"的共享骨架单独存档（图纸库标准图纸）；组合产物仍须人审过闸，不是免检通行证
```

### 依赖

- 模块: `m3`（仓元数据）、`m16`（Glossary/Metric 既有资产对齐）、`m18`（五级 CI 闸复用）
- 外部: PyYAML——Adapter: **FakeVault**（内存仓同签名）

### Seam 与走查计划

- Seam: 仓内 YAML 只能经"Lifecycle 变更包+CI+Owner 审批"变更（边界规则既有条延伸）；查询只走 GraphIndex 公开面。
- Adapter: FakeVault。
- 走查计划: 锁死 W-F39-1..5、W-F53-1..4、W-F54-1/2。

### 参考锚点

- 治理件对照：model-registry.json/model-deps.json/CHANGELOG/换义锁定/profile；schema_check.py L1–L4；graph_index.py"Git 是真源图是派生物"；tech-selection.md 否决 Neo4j；A 派（SHACL+OWL 双重验证为学术原型对照）；落地链路/宽表拆解/FDE 与三层复用。

## 抽取式图谱 m25（D 派实现）

职责: 知识库级 LLM 抽取图谱——ExtractConfig（实体类型清单+关系 tags+few-shot 示例+自定义指令，系统保留输出协议所有权）+ 逐 chunk 抽三元组（实体 name+attributes/关系 node1-node2-type+strength 5–10）+ 图存储（namespace=库+文档）+ 查询侧实体识别→图检索→与向量/BM25 并行汇入问答上下文；类型闸：不许创造新类型、拿不准跳过。
目录: `app/graphrag/`（extract_config.py、extractor.py、graph_store.py、graph_search.py）

### 公开接口

```text
ExtractConfig.for_kb(kb_id) -> Config               # 默认 11 类通用实体（Person…Operation）；KB 可覆盖 tags/示例/指令
Extractor.extract(chunk, config) -> GraphData       # 一次 LLM 调用产 {text, node[], relation[]}；只抽文本显式存在的关系不编造
GraphStore.add(namespace, graph) -> None            # namespace=知识库+文档；同名节点合并（消歧只作策略说明，不实现）
GraphStore.search_node(namespace, entity) -> SubGraph  # 节点+关系链召回，强度参与权重
GraphRecall.parallel_merge(query, hits, subgraph) -> Context  # 与向量/BM25 并行汇入问答上下文（m13 装配）
```

### 依赖

- 模块: `m2`（抽取与实体识别走网关）、`m3`（图边落库形状）、`m22`（入库扇出由枢纽分发）
- 外部: 无新增（不接真 Neo4j——内存图形状演绎）——Adapter: **FakeGraphStore**（内存邻接表）

### Seam 与走查计划

- Seam: 图谱只经 m22 扇出生产、只经 GraphRecall 公开面消费；问答链不知图存储内部（换 Neo4j 不动管道）。
- Adapter: FakeGraphStore。
- 走查计划: 锁死 W-F40-1..5、W-F55-1..3（三接入点）。

### 参考锚点

- 参考实现对照：graph_extraction.yaml 11 类+强度 5–10 标准+拿不准跳过；extract.go ExtractConfig 组装+CustomInstructions；search_entity.go 并行汇入；book/chapter3.md §GraphRAG（语义降级+错误提取致知识污染=软肋）；D 派对照。

## 本体交互层 m26（Palantir 五层）

职责: 本体被 Agent 消费的完整形态——Context 层（确定性注入：Ontology/Document/Function-backed 三种）/ Query 层（Object Query：过滤/聚合/link 遍历，不写 SQL）/ Logic 层（专业函数，LLM 不拍脑袋）/ Action 层（受控写入：四部分+Writeback 不污染源+高低风险分级）/ Governance 层（角色×权限矩阵贯穿前四层，防幻觉靠结构不靠 prompt）；OAG vs RAG 对照。
目录: `app/agentos/`（context_layer.py、object_query.py、functions.py、actions.py、governance.py）

### 公开接口

```text
ContextLayer.assemble(message, page_state, user) -> ContextPack
    # 确定性触发不需要 LLM 判断：Ontology Context（绑定当前对象）/Document Context（全文 vs 片段）/Function-backed（"井 360°"预设函数）
ObjectQuery.run(user, filter, aggregate, traverse) -> ResultSet
    # 查语义对象与关系不写 SQL；link 遍历深度为超参数；瀑布 S1–S4 确定性优先策略复用 m21
FunctionTool.call(name, args) -> StructuredResult    # calculate_decline_risk 等；LLM 选函数+解释结果，专业判断归函数
ActionTool.propose(action, params) -> Proposal       # 四部分：参数/规则/前置条件/副作用；摆影响测算等人确认
ActionTool.execute(proposal, approver) -> Writeback  # 🛡️ 高风险必须人工确认；写回独立变更区不污染源表；审计全程
Governance.matrix(user) -> CapabilitySet             # 角色×五层权限矩阵；结构上接触不到=根本没这个数据（不是被拒答）
```

### 依赖

- 模块: `m8`（权限闸/工具注册）、`m16`/`m24`/`m25`（本体来源三选一或并存）、`m17`（Action 前置校验链复用）、`m21`（瀑布策略）、`m12`（审计 span 会师）
- 外部: 无新增——Adapter: **FakeAgentOS**（固定 ContextPack/权限矩阵）

### Seam 与走查计划

- Seam: "本体消费面"接缝——ContextPack/ResultSet/StructuredResult/Proposal/Writeback 五形状是唯一契约，本体来自 m24 还是 m25 消费方无感（双引擎可选的落点）；Action 执行必过 m8 权限闸+m17 校验链（边界规则新增条）。
- Adapter: FakeAgentOS。
- 走查计划: 锁死 W-F43-×（总纲对号入座）、W-F44-×（Context）、W-F45-×（Query）、W-F46-×（Logic）、W-F47-×（Action）、W-F48-×（Governance）、W-F49-×（双通道）。

### 参考锚点

- AgentOS 五层与权限分层、防幻觉结构论证、内外部 Agent 双通道；Action Type/Writeback/as-is；三步搭建、按钮上有锁；OAG vs RAG、副驾驶形态。

## Wiki 管线 m27

职责: 报告库的第三种投影——chunk 拼回全文（重叠去重+图片信息回读 caption/ocr）→ LLM 重写成结构化 Markdown 页 → 自动交叉链接（linkify，像 Wikipedia 建链接）+ 入口页 → 版本历史与一键回滚（知识层/证据层分离：页=知识层，chunk=证据层，论断回链证据块）。
目录: `app/wiki/`（reconstruct.py、writer.py、linkify.py、revisions.py）

### 公开接口

```text
Reconstructor.rebuild(doc_id) -> FullText            # 只取 text 块拼回+重叠去重；enriched 版回读 image_ocr/caption（纯图片文档防空白）
WikiWriter.write(full_text, kb) -> WikiPage          # LLM 重写结构化 Markdown；32K 截断纪律；重写≠检索（产出是文档不是索引）
Linkify.link(page, registry) -> LinkedPage           # 实体词→站内链接；提示词明确要求"像 Wikipedia 一样建链接"；入口页=目录+最近更新
Revisions.commit(page_id, edit, author) -> Rev       # 编辑落 revision+diff；一键回滚 rollback(page_id, rev)
Revisions.rollback(page_id, rev) -> None             # 回滚也是一次 commit（历史不可篡改只追加）
```

### 依赖

- 模块: `m2`（重写走网关）、`m3`（页面与版本落库）、`m14`（读 chunk 公开面，不回写索引）
- 外部: 无新增——Adapter: **FakeWiki**（固定页与双版本）

### Seam 与走查计划

- Seam: Wiki 是 m14 的只读消费者；入口页与链接注册表是自包含的；版本表与 m16 生命周期纪律对照（PR 思想）但不同管。
- Adapter: FakeWiki。
- 走查计划: 锁死 W-F50-×、W-F51-×、W-F52-×。

### 参考锚点

- 参考实现对照：reconstructContent 重叠去重/reconstructEnrichedContent 图片回读/maxContentForWiki=32768/wiki_linkify.go/wiki 版本存主库；book/chapter3.md §OpenViking（L0/L1/L2 按需加载+必须建链接）+§知识更新（三层分离/PR 模式）；Wiki 图谱可视化≠GraphRAG 的区分注记。

## 边界规则

| 禁止 | 例外 | 理由 |
|---|---|---|
| 任何业务模块绕过 `m2` 直连模型 API 端点（模型流量唯一出口是网关 :4000） | （无） | — |
| `m6` 与 `m7` 互相 import（问数选表只许走 `m14`，不许借 `m6` 的检索器） | （无） | — |
| `m8` import `m9`/`m10` 的具体工具实现（方向必须 `m9`→`m8` 注册；Executor 按注册名调用） | （无） | — |
| `m13` import `m15`（问智异步只经 `m4` TaskQueue 解耦，运行时不阻塞等 worker） | （无） | — |
| `m10` 直接写 `m5`/`m3`（产物落桶与元数据由 `m15` 统一经手，转存义务一处管） | （无） | — |
| `m1` 写业务逻辑（路由/鉴权/流式转发之外的状态机与管道逻辑归 `m6`/`m7`/`m13`） | （无） | — |
| 任何模块 import `m3` 的引擎内部（只走 build_engine/get_session_factory/Repository 公开面） | （无） | — |
| `m14` 的消费方直接操作 Chroma/rank_bm25 对象（只走 VectorStore/Bm25Index 六函数） | （无） | — |
| `scripts/` 绕过模块公开接口直读内部实现 | （无） | — |
| `m7` 节点绕过 `m16`/`m17`/`m18` 公开面直连其内部实现（只认 MetricRef/`GuardChain.validate`/`GoldenStore` 公开面） | （无） | — |
| `m18` 评估链路写问数主链路状态（评估只读公开面；few-shot 只读取样） | （无） | — |
| 新增外发类工具未同步登记 `m19` 的 `cases.yaml` 清单与红队用例（该文件是外发工具唯一登记处） | （无） | — |
| `m7` 节点绕过 `m21` 瀑布/TypedState 公开面散装检索或裸 dict 装配（只走 `Waterfall.retrieve`/`TypedState.assemble`） | （无） | — |
| 问数消费非 marts 层表（`m7` 选表与 `m16` 指标绑定只认 `m20` marts 层模型物；staging/intermediate 是管道内部层） | （无） | — |
| 大结果查询绕过沙箱 artifact 协议直灌上下文（大结果必须落 artifact、上下文只收 5 行预览+句柄） | （无） | — |
| MCP/外部协议暴露绕过 `m8` 注册与权限闸（外部 Agent 与内部主循环同权同闸，协议层不加权） | （无） | — |
| 语义资产文件绕过"Lifecycle 变更包 + 五级 CI + Owner 审批"链路被直接修改（`cases`/`metrics`/`glossary`/`ontology` YAML 只能经 `m18` 发布门禁变更） | 治理者手工改文件+立即重载（对照场景，须走 `Registry.load` 全量校验） | 版本 2 既有手工路径保留为对照；生产路径只认门禁 |
| —— 版本 4 增补（2026-09-22）—— | | |
| `m24` 与 `m25` 互相 import（两套本体实现只经 `m23` 五操作缝被消费，互不知情） | （无） | 双引擎可选的根基——缝不中立则二选一不成立 |
| `m27` Wiki 管线写 `m14` 索引（Wiki 是 chunk 的只读消费者；投影方向单向：chunk→页） | （无） | 防"改了 Wiki 页却污染检索索引"的隐性回路 |
| `m26` ActionTool 绕过 `m8` 权限闸或 `m17` 校验链直接执行；Writeback 直写 marts/源表（只许写独立变更记录区） | （无） | 高风险人工确认+不污染源数据是 Action 层的存在理由 |
| 图谱/Wiki 后处理绕过 `m22` 分发枢纽自行挂接入库管线（扇出唯一出口=PostProcess.dispatch） | （无） | 四开关的降级语义只在枢纽一处成立 |
| 父块进 `m14` 双索引（INV：父块只入 m3 不索引，命中后由 m6 回捞） | （无） | F30 核心不变量 |

## 目录骨架（随模块卡定稿生成）

> 文件系统 = 模块结构从此成立；每个函数必须有落点，没有落点说明模块卡有洞。本设计不含 tests/ 与 CI（零代码红线）。

```text
petro-agent/
├── app/
│   ├── main.py                          # create_app()、healthz()（m1）
│   ├── api/
│   │   ├── chat.py                      # chat_endpoint：SSE 事件帧生成器（m1/F1）
│   │   ├── auth.py                      # verify_token、require_permission（m1/F1）
│   │   ├── reports.py                   # presign_report_upload（m1/F5）
│   │   └── artifacts.py                 # artifact_download_url（m1/F10）
│   ├── gateway/
│   │   ├── client.py                    # Gateway.chat / Gateway.embed（m2/F2/F12）
│   │   ├── spend_recorder.py            # record_spend（m2/F2）
│   │   └── config.yaml                  # model_list/fallbacks/num_retries/allowed_fails+cooldown_time（m2/F2）
│   ├── db/
│   │   ├── engine.py                    # build_engine、get_session_factory（m3/F3/F11）
│   │   ├── models.py                    # ORM 实体：会话/用量审计/KB元数据/问数快照/产物/bm25_snapshots（m3/F3）
│   │   ├── encrypted_type.py            # EncryptedField 列类型（m3，委托 m11/F11）
│   │   └── repository.py                # Repository 全部读写方法（m3/F3）
│   ├── cache/
│   │   ├── redis_cache.py               # Cache.get/set/incr（m4/F4）
│   │   ├── task_queue.py                # TaskQueue.enqueue/consume/ack/claim_stale（m4/F4）
│   │   └── event_buffer.py              # EventBuffer.append/replay_since（m4/F1/F4）
│   ├── storage/
│   │   └── minio_store.py               # Storage.put_stream/get_stream/presigned_url/fetch_and_rearchive（m5/F5）
│   ├── semantics/
│   │   ├── registry.py                  # MetricRegistry.load/lookup/get（m16/F13）
│   │   ├── resolver.py                  # Resolver.bind：唯一直绑/多候选澄清（m16/F13）
│   │   ├── lifecycle.py                 # Lifecycle.propose/approve/template_for + 产变更包（m16/F13/F25）
│   │   ├── glossary.py                  # GlossaryRegistry：术语/禁用词/有效期（m16/F19）
│   │   ├── ontology.py                  # OntologyRegistry：实体/关系/合法 Join 白名单（m16/F19）
│   │   ├── playbook.py                  # PlaybookRegistry：任务剧本（m16/F19）
│   │   ├── ossie.py                     # OssieExport.dump：Ossie 兼容导出（m16/F23）
│   │   ├── metrics/                     # 指标口径 *.yaml：口径即代码，进版本管理（m16/F13）
│   │   ├── glossary/ ontology/ playbooks/  # 三域资产 YAML（m16/F19）
│   ├── eval/
│   │   ├── golden_store.py              # GoldenStore.add/sample_fewshot（m18/F15）
│   │   ├── grader.py                    # ResultGrader.compare：行集比对（m18/F15）
│   │   ├── stability.py                 # StabilityRunner.run：同问多法跑批（m18/F15）
│   │   ├── promptfoo_export.py          # PromptfooExport.cases：CI 导出（m18/F15）
│   │   ├── badcase.py                   # Badcase.register：错误资产化（m18/F15；回归闭环后续扩展）
│   │   ├── semantic_ci.py               # SemanticCI.validate_change：L1-L5 发布门禁（m18/F20）
│   │   ├── suggestion_pool.py           # SuggestionPool.submit：三源统一建议池+四维体检（m18/F24）
│   │   └── mr_flow.py                   # MrFlow.propose_mr/approve_mr：四红线（m18/F25）
│   ├── rag/
│   │   ├── indexer.py                   # Indexer.run（m6/F6）
│   │   ├── retriever.py                 # Retriever.search：双路召回→RRF（m6/F6）
│   │   ├── ranker.py                    # Ranker.rerank（m6/F6）
│   │   ├── generator.py                 # Generator.answer：带引用生成（m6/F6/F12）
│   │   ├── evaluator.py                 # Evaluator.run：RAGAS 三指标（m6/F6）
│   │   ├── vector_store.py              # VectorStore.upsert/query（m14/F6）
│   │   └── bm25_index.py                # Bm25Index.build/search/save_snapshot/load_snapshot（m14/F6）
│   ├── agents/
│   │   ├── runtime.py                   # dispatch / run_qa_loop / run_text2sql / enqueue_wenzhi（m13）
│   │   ├── prompt_layout.py             # layout_messages：KV Cache 三铁律装配（m13/F12）
│   │   ├── text2sql/
│   │   │   ├── graph.py                 # build_graph、State、AttemptsReducer、route_after_verify（m7/F7）
│   │   │   ├── trust_score.py           # TrustScore.rank：可信评分卡八信号加权（m7/F26）
│   │   │   ├── typedstate.py            # TypedState.assemble：五段强类型（m21/F22）
│   │   │   ├── nodes/
│   │   │   │   ├── intent.py            # clarify_intent（m7/F7）
│   │   │   │   ├── schema.py            # retrieve_schema（m7/F7）
│   │   │   │   ├── generate.py          # generate_sql（m7/F7/F12 few-shot 冻结）
│   │   │   │   ├── guard.py             # check_sql 🛡️ AST 只读闸（m7/F7）
│   │   │   │   ├── execute.py           # run_query：interrupt 审批位（m7/F7）
│   │   │   │   └── verify.py            # verify_result（m7/F7）
│   │   │   ├── guardchain/
│   │   │   │   ├── chain.py             # GuardChain.validate：五段顺序短路（m17/F14）
│   │   │   │   ├── stages/              # ast/policy/freshness/lineage/audit 五段（m17/F14）
│   │   │   │   └── dialects/            # SKILL.md 方言差异技能包 + check_dialect.py 离线扫描脚本形状（m17/F14；部署配置增键 text2sql.dialect_map）
│   │   │   └── retrieval_protocol/
│   │   │       ├── waterfall.py         # Waterfall.retrieve：S0-S8 逐级可早停（m21/F21）
│   │   │       └── stages.py            # S1-S8 各级实现（m21/F21）
│   │   └── tools/
│   │       ├── registry.py              # ToolSpec / Registry.register/lookup/tools_for（m8/F8）
│   │       ├── permission.py            # Permission.filter_tools / assert_allowed 🛡️（m8/F8）
│   │       ├── executor.py              # Executor.call：校验→权限→执行→错误三分法（m8/F8）
│   │       ├── sandbox.py               # Executor.call_sandboxed：受限容器伪代码+artifact 落盘+5 行预览（m8/F27）
│   │       ├── mcp_server.py            # MCP Tools/Elicitation/Tasks 三映射演绎（m8/F28）
│   │       ├── builtin/
│   │       │   ├── db_query.py          # query_production_db：只读查生产库（m8/F8，走 m3）
│   │       │   ├── page_nav.py          # navigate_page：返回前端路由指令（m8/F8）
│   │       │   └── api_invoke.py        # invoke_api：调外部系统（m8/F8）
│   │       └── domain/
│   │           ├── lithology.py         # identify_lithology（m9/F9）
│   │           ├── production.py        # forecast_production（m9/F9）
│   │           └── register.py          # register_all：启动装配（m9/F9）
│   ├── multimodal/
│   │   ├── worker.py                    # WenzhiWorker.run/_handle_job/notify_done（m15/F10）
│   │   ├── ppt_gen.py                   # make_ppt（m10/F10）
│   │   ├── image_gen.py                 # create_image：万相两步异步（m10/F10）
│   │   ├── video_gen.py                 # create_video：同构模式（m10/F10）
│   │   └── speech.py                    # tts（edge-tts）/ asr（FunASR）（m10/F10）
│   ├── security/
│   │   ├── guomi.py                     # Crypto.encrypt_field/decrypt_field/digest、key_selfcheck 🛡️（m11/F11）
│   │   └── injection/
│   │       ├── taint.py                 # TaintTag/Tagger.wrap：四级信任标（m19/F16）
│   │       ├── policy.py                # Policy.assert_outbound/highest_untrusted/RedteamCases（m19/F16）
│   │       └── cases.yaml               # 外发工具清单+注入红队用例（m19/F16）
│   ├── modeling/
│   │   ├── layers.py                    # LayerPlan.describe：三层契约（m20/F17）
│   │   ├── grain.py                     # GrainProtocol/StarModel：四步法（m20/F17）
│   │   ├── tests_policy.py              # TransformTest.suite：分层测试（m20/F18）
│   │   └── models/                      # 分层 SQL 文本交付物 staging|intermediate|marts/*.sql（m20/F17）
│   └── observability/
│       ├── tracer.py                    # Tracer.start_span/end_span/trace_run、Metrics.*（m12/F12）
│       └── otel_map.py                  # to_otel_attrs：OTel GenAI 映射（m12/F29）
├── scripts/
│   ├── build_index.py                   # main：离线索引入口（m6/F6）
│   ├── eval_ragas.py                    # main：RAGAS 评估入口（m6/F6）
│   ├── eval_text2sql.py                 # main：问数评估跑批入口（m18/F15）
│   └── semantic_ci.py                   # main：语义资产 CI 跑批入口（m18/F20）
└── deploy/
    ├── Dockerfile                       # 多阶段构建、非 root、HEALTHCHECK /healthz（m11/F11）
    └── docker-compose.yml               # depends_on: service_healthy、命名卷、litellm/chroma 服务（m11/F11）
```

### 版本 4 骨架增量（2026-09-22，m22–m27 落点）

```text
    ├── knowledge/                       # m22 知识管线枢纽
    │   ├── strategy.py                  # IndexingStrategy 四开关（F32）
    │   ├── post_process.py              # PostProcess.dispatch / ChunkPicker 挑选闸（F32/F36）
    │   ├── summary.py                   # SummaryGen（F37）
    │   └── question_gen.py              # QuestionGen（F37）
    ├── ontology_builder/                # m23 本体构建缝
    │   ├── builder.py                   # OntologyBuilder 五操作（F38）
    │   └── schools/                     # 五流派取舍档落点（F41）
    ├── ontology_vault/                  # m24 治理本体仓（A 派，F39）
    │   ├── schema_registry.py           # 机读注册表+依赖白名单+换义锁定
    │   ├── vault.py                     # 草案→MR→CI→Owner 审批
    │   ├── graph_index.py               # 图是派生物：启动全量重建+closure/impact
    │   └── ontology/bohai/              # 域 YAML（对齐 All-agent bohai 形状）
    ├── graphrag/                        # m25 抽取式图谱（D 派，F40）
    │   ├── extract_config.py            # ExtractConfig：11 类/tags/示例/指令
    │   ├── extractor.py                 # 逐 chunk 抽 GraphData
    │   ├── graph_store.py               # namespace=库+文档；同名合并
    │   └── graph_search.py              # search_node + 并行汇入
    ├── agentos/                         # m26 本体交互层（F43–F49）
    │   ├── context_layer.py             # Context 三种注入（F44）
    │   ├── object_query.py              # 过滤/聚合/link 遍历（F45）
    │   ├── functions.py                 # 专业函数（F46）
    │   ├── actions.py                   # Action 四部分+Writeback+审批（F47）
    │   └── governance.py                # 角色×五层权限矩阵+审计（F48/F49）
    └── wiki/                            # m27 Wiki 管线（F50–F52）
        ├── reconstruct.py               # 拼回全文：重叠去重+图片回读
        ├── writer.py                    # LLM 重写 Markdown 页；32K 截断
        ├── linkify.py                   # 交叉链接+入口页
        └── revisions.py                 # 版本历史+一键回滚
```

## 设计增补记录

- 2026-09-13 初版 15 卡定稿：依赖无环、四链路（问答/问数/工具/问智）沿公开接口走通、无孤儿模块；各卡走查计划挂 W-ID 共 58 条，与 specs/walkthroughs.md 一一对应。
- 2026-09-14 增补 `m16`–`m19`（PRD F13–F16）；2026-09-15 增补 `m20`/`m21` 并扩容 `m16`/`m18`（PRD F17–F25）；2026-09-22 增补 `m22`–`m27` 并扩容 `m6`/`m14`（PRD F30–F55）。
- 遗留：pgvector 生产替换路径、GraphRAG/RAPTOR、Agentic RAG 支线、文生视频完整实现——只作设计说明，不实现，不设卡。

## 伪代码通用约定

- 异步一律 `async`；IO 边界显式 `await`。
- 数据形状用业务术语（事件帧/候选块/轨迹），不用 foo/bar。
- 异常去向三层：可纠正→回灌模型重试；权限拒→理由入轨迹；不可恢复→熔断转人工。
