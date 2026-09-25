# DataAgent 数据面落地设计 PRD（湖仓栈 × 多规模）

状态: 已定稿（决策记录见 §9）
版本: v1（2026-09-24）
取材地基: docs/tech-stack/ 九份调研分册（技术真源，逐条官方源；含合成篇 dataagent-stack-map.md 与流批一体范式分册 streaming-batch-warehouse.md）+ docs/business-setting.md（业务真源）+ docs/tech-stack/dataagent-stack-map.md（栈合成篇）
衔接: 主 PRD（docs/prd.md）的 F7 问数 Agent / F13 语义层 / F17-F18 转换分层与质量 / F27 沙箱执行 / F28 协议化暴露是**平台语义侧**既有承诺——本 PRD 是它的**数据面升级**：问数 Agent 的数据源从"Postgres 8 表"扩展为"湖仓栈 × 多规模"，不废弃、不重定义既有 F 项。

## 1. 做什么 / 不做什么

**做什么**：为 Petro-Agent 的问数 Agent 设计一套湖仓数据面（采集入湖 → 湖表 → 加工 → 语义暴露 → Agent 工具 → 审计治理），给出**三档企业数据规模**下的应用场景与对应技术选型（规模变了换的是适配器与部署拓扑，不变的是模块接口与口径治理纪律），并以伪代码走查落到模块粒度。

**不做什么**：不做可运行代码（设计阶段产物为 specs + 伪代码）；不改主 PRD F1–F29 既有承诺；不做前端页面（平台前端见 prototype/，本设计无新页面）；不做模型/RAG 层（属平台主链路）；不做真实数据集成（业务事实一律 `设定书 §x`，禁止发明）。

## 2. 业务设定与用户

- 业务事实唯一真源 = 设定书：渤海油田分公司，3 作业区、120 口在产井（采油 86/注水 34）、5 平台（设定书 §1）；生产域 8 表（§2.2/附录 A）；15 条指标卡（§3）；20 条质量规则（§4）；Ontology/Glossary/Playbook 草案（§5/§6/§7）；事故簿 13 条（§8）；真实企业对照=梦想云 15 专业 1.7PB（§9）。
- 用户与调用方：① 问数 Agent（主消费方，经数据工具面取数）；② 数据工程师（治理/加工链路的操作者）；③ 平台语义 Owner（阿强岗，口径仲裁，设定书 §1）。
- 成功标准（可观察）：问数 Agent 对三档规模的每一档，都能走通"发现表 → 结构化查询 → 质量闸 → 归纳作答 → 快照回放"全链路伪代码走查；每个模块的规模档位切换只换适配器不换接口。

## 3. 三档企业数据规模 × 应用场景（本 PRD 的核心）

| 档位 | 企业形态 | 数据量级 | 团队 | 对标 |
|---|---|---|---|---|
| **S1 边缘档** | 作业区/单平台，内网单机 | GB 级，≤百井 | 无专职数据团队（资料员兼职） | 本平台设定：120 井 × 8 表（设定书 §1/§2.2） |
| **S2 平台档** | 油田分公司，小集群 | TB~百 TB，千井~万井 | 专职数据组（3-8 人） | 主 PRD 假想业务的完整形态 |
| **S3 集团档** | 集团总部，多地域多集群多专业域 | PB 级+ | 中心数据平台 + 各域数据团队 | 梦想云 15 专业 1.7PB（设定书 §9） |

### S1 一天（事件回放）

资料员早上把昨天的班报 Excel 校验后批量入湖（一个脚本：校验 20 条规则 → 写 Iceberg 表落 MinIO 单机）。开发室老王问 Agent"N-02 井上周产量"：Agent 进程内直接 PyIceberg 拉 schema、DuckDB 本地聚合、答数并报出"数据截至昨日班报"。主任问"为什么递减"——Agent 试算受效劈分（设定书 §3 指标 10）生成初查报告落桶，presigned 给前端。**没有 K8s、没有流、没有专职运维**——深了没有，快了才对。

### S2 一天

凌晨 Flink CDC 把生产库增量实时写入湖表（exactly-once，原生 Iceberg sink）；dbt 夜间跑 T 层把 8 表明细加工成 marts 中间层（20 条规则翻成 tests，设定书 §4）；早上 Cube `/meta` 把 15 条指标卡的口径暴露给问数 Agent；老王问"今天上午注水比"——freshness 路由判断月度口径表答不了日内问题，改答实时聚合宽表并声明口径差异；主任问月度归因——Agent 走 Trino 交互查询下钻受效关系（合法 join 白名单内，设定书 §5），结论绑 snapshot_id 归档，月底审计按同快照重放（设定书 §7 输出合同"数据版本"）。**实时/离线两面并存**，事故 13 式的"实时数 vs 上报数打架"（设定书 §8）靠对账作业+语义层权威源仲裁兜住。

### S3 一天

勘探、开发、经营三个域团队各自运营自己的湖仓与数据产品（mesh 式自治），集团 fabric 控制面统一目录联邦、active metadata、策略即代码与 credential vending（data-fabric.md）；问数 Agent 面向跨域问题经统一语义层联邦路由到各域（"渤南区块产量完成率"=开发域口径，"商品量结算"=销售计量站口径，一数四源仲裁规则在集团语义层，设定书 §3/§8）；策略引擎在 SQL 生成前完成行级/列级/敏感级放行；Agent 的 MCP 工具面接入集团 MCP server 池，短期凭证按表下发、用完即弃。**中心不管数据管规则**——梦想云式体量下，唯一可扩展的治理是自动化治理（设定书 §9"五位一体"与 L1-L5 目录的真实对照）。

## 4. 功能清单（D1–D9）

> 编号 D = data plane，独立命名空间，不与主 PRD F 序号混用。每功能标注规模档位（S1/S2/S3 = 该档启用；— = 全档）。

### D1 湖底座与表格式（—）
统一的对象存储 + Iceberg 表语义访问层：建表/加载/scan→Arrow/按快照读/追加写。做：S3 协议访问（含 path-style）、REST/JDBC catalog 接入、schema/分区规格读取、snapshot 列表。不做：引擎内 SQL 下推优化器、compaction 策略调优（只讲机制）。

### D2 实时进料与新鲜度（S2/S3）
批/流两条进料路径：批量校验入湖（S1 即全部）与 Flink CDC 实时入湖（S2+，原生 sink exactly-once / flink-cdc pipeline 主键幂等的分界，见 flink.md）；每张湖表携带**新鲜度档位元数据**（realtime/nearline/offline + 截至时点）。做：新鲜度档位的登记与查询、CDC 管道配置形状。不做：流式 SQL 持续聚合的完整实现（讲机制+一处伪代码）。

### D3 离线 T 层与质量闸（S1 脚本版 / S2+ dbt）
把明细加工成可信中间层：S1=校验脚本直写；S2+=dbt 模型（staging→intermediate→marts），20 条质量规则（设定书 §4）翻成 dbt tests，manifest.json 提供机器可读口径与血缘。做：分层模型边界、tests 映射表、freshness 回写 D2。不做：调度系统选型与实现（Airflow/DolphinScheduler 只在取舍里提）。

### D4 语义层口径暴露（S1 静态字典 / S2+ Cube）
把 15 条指标卡（设定书 §3）暴露成机器可读口径：measure 定义/修饰词消歧（有效产量两支口径，§3.2）/权威源标注（一数四源仲裁，§8.13）/`ai_context` 口径争议注记/Glossary 术语归一（§6 禁用词/别名/黑话）。做：语义字典 schema、Cube 数据模型映射、`/meta` 喂 Agent。不做：指标审批流（属平台 F13/F20 语义 CI，衔接不复做）。

### D5 查询执行适配（—，后端按档换）
统一结构化查询接口 `run(query) → Arrow + snapshot_id + stats`：S1=DuckDB 进程内；S2/S3=Trino/StarRocks 下推 + DuckDB 沙箱末端。做：适配器接口、分区/谓词下推语义、行数与成本护栏。不做：引擎运维（调优/扩缩容只讲取舍）。

### D6 新鲜度路由与拒答（S2/S3；S1 简化为单一档位）
按问题时间窗 × 表新鲜度档位路由：能答实时面/离线面/明确拒答并声明"数据截至 X"。做：路由判定伪代码、拒答话术合同（诚实框架）。不做：预测类问题的模型侧处理。

### D7 快照审计与回放（—）
结论绑定 `snapshot_id`：作答时记录（问题、查询、快照号、语义层版本），审计时按同快照重放校验（设定书 §7"数据版本"的工程落地）。做：审计记录 schema、回放比对伪代码、快照保留窗口策略（衔接 Wiki 版保留窗口纪律）。不做：全平台 OTel 可观测（属 F29）。

### D8 Agent 数据工具面（MCP）（S1 进程内工具 / S2+ MCP server）
把 D1/D4/D5/D6/D7 的能力暴露为 Agent 工具：`discover_tables / describe_table / query / replay / lineage` 五工具；S1=进程内函数，S2+=MCP server（对齐业界：Polaris MCP/Databricks MCP/MotherDuck MCP/Cube MCP 的"目录即工具"叙事，见各分册）。做：工具合同（输入输出 JSON schema）、只读红线、与平台 F28 暴露层的衔接位。不做：A2A AgentCard（F28 已做）。

### D9 治理控制面（S1 静态白名单 / S2 Cube securityContext+dbt tests / S3 fabric 策略引擎）
横切治理：合法 join 白名单强制（设定书 §5，默认拒绝）、行级权限（三作业区隔离，设定书 §1）、导出审批（presigned 高位水印）、S3 的策略即代码与 credential vending。做：白名单检查伪代码、权限上下文注入点、S3 控制面的接口形状。不做：完整 fabric 产品实现（理念对照，见 data-fabric.md）。

## 5. 技术栈表（按档位）

| 组件类 | S1 边缘档 | S2 平台档 | S3 集团档 | 调研锚 |
|---|---|---|---|---|
| 对象存储 | MinIO 单机 | MinIO 分布式 | MinIO 多集群/云 S3 兼容 | s3.md / redis-minio.md |
| 表格式 | Iceberg | Iceberg（流写备选 Paimon，仅取舍讨论） | Iceberg v2+（删除向量/row lineage） | minio-iceberg.md |
| Catalog | JDBC（Postgres/SQLite） | REST（Polaris/Nessie） | REST 联邦（多目录） | minio-iceberg.md |
| 进料 | 校验脚本直写 | Flink CDC（flink-cdc pipeline / 原生 sink 分界） | 多源联邦进料 | flink.md |
| 交互引擎 | DuckDB（进程内） | Trino 或 StarRocks（二选一，默认 Trino） | 多引擎（Trino+StarRocks 并存） | minio-iceberg.md / duckdb.md |
| T 层 | 校验脚本 | dbt（dbt-trino / dbt-starrocks 适配器） | dbt 多项目 + manifest 联邦 | dbt.md |
| 语义层 | 静态 YAML 字典 | Cube（开源版，Trino 数据源） | Cube 联邦/多实例 | cube-semantic-layer.md |
| Agent 工具面 | 进程内函数 | 自建 MCP server（只读五工具） | MCP server 池 + credential vending | 各分册趋势节 |
| 治理 | join 白名单 YAML | securityContext + dbt tests 闸 | 策略即代码控制面 | data-fabric.md |
| 审计 | 快照号记录 | 同左 + 对账作业 | 同左 + 集团审计面 | minio-iceberg.md |

国产化注记：MinIO 私有部署/国产 S3 兼容端点（OSS/OBS）、StarRocks/Doris 湖仓引擎、麒麟 OS 兼容位——沿主 PRD F11 国产化适配口径，不新增承诺。

## 6. 业界趋势对齐（每条趋势 → 本设计的落点）

| 调研到的趋势（2025-26） | 本设计落点 |
|---|---|
| "catalog/表格式即 Agent 工具"：Polaris MCP、Databricks 托管 MCP、AWS S3 Tables×MCP | D8 五工具 MCP 面的立项依据 |
| 语义层 agentic 化：Cube `meta.ai_context`、"context layer needs a semantic layer" | D4 口径注记 + `/meta` 喂 Agent |
| 快照绑定可复现分析（Iceberg time travel） | D7 审计回放（对齐设定书 §7"数据版本"） |
| credential vending（REST catalog 短期凭证下发） | D9 S3 档凭证下发形状 |
| freshness 是 Agent 问数的一等元数据 | D2 档位 + D6 路由拒答 |
| Flink Agents / ML_PREDICT / VECTOR_SEARCH | 取舍节讨论（不进默认栈，见 §9 决策 6） |
| fabric 控制面 + 策略即代码 | D9 S3 档 |
| PyIceberg 免 JVM / DuckDB iceberg ATTACH 直写 | S1 档"无 JVM、无服务端"选型依据 |

## 7. 需求评审 11 维对账（Agent 产品加问适用）

① 边界与用户：适用——见 §1/§2。② 业务对象与关系：适用——对象=湖表/快照/新鲜度档位/指标口径/质量规则/审计记录；关系沿设定书 8 表与指标卡，不新增业务实体。③ 功能与规则：适用——D1–D9 清单，规则均可判断真伪（走查断言）。④ 跨对象联动：适用——D2 新鲜度回写 → D6 路由；D3 tests 结果 → D6 质量闸；D7 快照号 ← D5 执行。⑤ 流程与审批：适用（轻）——仅 S3 导出审批一个审批位；无多步状态机。⑥ 查询统计报表：适用——本 PRD 全部就是查询面设计；口径沿 §3 指标卡。⑦ 角色权限：适用——三作业区行级隔离（§1）+ 语义 Owner 仲裁权（§1）+ 只读红线。⑧ 输入输出集成：适用——上游=生产库/实时库/班报（§2.1），下游=问数 Agent/审计；失败=拒答+留痕。⑨ 异常边界：适用——每功能的捣乱输入在走查断言表给错误路径（脏表拒答/超窗拒答/白名单拒绝/快照不存在回错）。⑩ 量级：适用——三档量级即 §3 表格；无并发硬指标（讲机制不讲压测）。⑪ 数据生命周期：适用——快照保留窗口（对齐 Wiki 版 50/200 两层纪律的取舍思路）、审计记录留存=随快照窗口；湖表删除=expired snapshot 清理，讲机制不做实现。
**Agent 产品加问**：行动边界——五工具全部只读 + 一个受控写（报告对象落桶），无任何湖表写权限（写侧归 D2/D3 管道）；人在回路——S2+ 跨域查询与导出需审批位；输出校验——结构化查询先过 D9 白名单与 F14 校验链，失败重试一次即拒答；可追溯——答数必附（表，snapshot_id，口径版本，quality 状态）四元组；可审计——D7 记录留痕（谁/何时/什么输入/什么输出/依据哪张快照），留存随快照窗口。
**Web 产品加问**：N/A——本设计无新页面（平台前端已有 prototype/，问数界面属主 PRD F7）。

## 8. 术语（本设计局部，不回写平台 CONTEXT.md）

湖表（Iceberg 表）/ 快照（snapshot）/ 新鲜度档位（realtime / nearline / offline）/ 权威源（一数四源仲裁后的语义层唯一 source）/ 结构化查询（measures/dimensions/timeDimensions/filters 四件套）/ 质量闸（答数前 tests+freshness 检查）/ 数据版本（结论绑定的 snapshot_id 四元组）/ 档位适配器（同一模块接口在不同规模档的实现替换）。

## 9. 决策记录

| # | 决策 | 备选与理由 |
|---|---|---|
| 1 | 独立 PRD 文档，不动 docs/prd.md | 主 PRD 已 400+ 行且属既有承诺体系；独立文件零风险，后续可再决定是否回写为"版本 5 增补节" |
| 2 | 新命名空间：D1–D9 / dp1–dp8 / DP-W-ID | 不与主 PRD F/W/m 序号混用 |
| 3 | S2 交互引擎默认 Trino，StarRocks 为并列备选 | Trino 生态对 REST catalog/dbt-trino 更顺；国产化叙事时 StarRocks 上位——两者接口同构，适配器层二选一 |
| 4 | 语义层 S2 默认 Cube 开源版 | 无 StarRocks 官方驱动需经 Trino 中转（cube-semantic-layer.md），与决策 3 自洽 |
| 5 | Paimon 不进默认栈，只在 D2 取舍节讨论 | 本项目以 Iceberg 为主格式已贯穿各分册；Paimon 流写优势在 S3 高频更新场景，讲了不选 |
| 6 | Flink Agents / ML_PREDICT / VECTOR_SEARCH 不进功能清单 | 趋势对齐节收录、取舍节讨论；数据面主线是"进料与治理"，Agent 运行时属平台侧（F7/F28） |
| 7 | 架构图先行出稿，评审通过后再落伪代码 | 先对齐结构再写实现细节，避免返工 |
