# 湖仓六件套 × Data Agent：角色分工与 Petro-Agent 落地场景（合成篇）

> 技术栈调研（合成篇：收拢六份增量调研）· slug: dataagent-stack-map
> 分册：[s3.md](s3.md)（协议底座）· [minio-iceberg.md](minio-iceberg.md)（对象存储+表格式）· [flink.md](flink.md)（实时进料与加工）· [dbt.md](dbt.md)（T 层分析工程）· [cube-semantic-layer.md](cube-semantic-layer.md)（语义层）· [duckdb.md](duckdb.md)（进程内分析引擎）· [data-fabric.md](data-fabric.md)（横切治理控制平面，行业理念对照）
> 适用场景：国产化内网环境 · 假想业务：Petro-Agent 油田智能平台
> 调研日期：2026-09-24。**引用纪律**：业务事实一律注 `设定书 §x`（[business-setting.md](../business-setting.md)）；技术→业务的映射为**设计演绎**，不新增业务事实。技术论断的官方源在各分册，本篇只做收拢不重复列。

## 1. 一根栈：从井口到 Agent 回答

| 层 | 技术 | 一句话职责 | 详见 |
|---|---|---|---|
| 协议底座 | S3 | 对象存储世界语：文件面统一接口、预签名直传直下、事件驱动入湖 | [s3.md](s3.md) |
| 物理湖 | MinIO | 内网私有部署的 S3 兼容对象存储 = 数据湖的磁盘（国产化友好） | [minio-iceberg.md](minio-iceberg.md) |
| 表语义 | Iceberg | 给"一堆对象文件"补上表语义：ACID 快照、schema/分区演化、时间旅行 | [minio-iceberg.md](minio-iceberg.md) |
| 实时进料 | Flink + CDC | 业务库/实时库增量 → 湖，exactly-once 不重不丢；流批一体 | [flink.md](flink.md) |
| T 层 | dbt | 明细加工成测试过的可信中间层；测试/文档/血缘工程化 | [dbt.md](dbt.md) |
| 交互引擎 | Trino / StarRocks | 服务端交互式大查询（Iceberg 外表） | [minio-iceberg.md](minio-iceberg.md) |
| 沙箱末端 | DuckDB | 进程内 OLAP：PyIceberg→Arrow→DuckDB 本地试算，不惊动服务端 | [duckdb.md](duckdb.md) |
| 语义层 | Cube | 指标口径定义一次处处一致；Agent 生成结构化查询而非自由 SQL | [cube-semantic-layer.md](cube-semantic-layer.md) |
| Agent 面 | 问数节点（LangGraph SQL Agent） | 语义理解→结构化查询→质量闸→归纳作答 | [langgraph.md](langgraph.md) |

定位一句话：Petro-Agent 平台本体（RAG/Wiki/语义治理）在本仓库已有全套设计文档；**六件套是它问数链路脚下的数据面**，本篇为"增量调研"补充，不改既有设计。

## 2. DataAgent 四类失败模式 × 栈的四道闸

| 失败模式 | 闸 | 实现机制 | Petro-Agent 对应 |
|---|---|---|---|
| 猜错 schema（幻觉 SQL） | 确定性信源 | Iceberg catalog 元数据 + Cube `/meta` 喂机器可读 schema，Agent 不靠目录列表猜 | 问数上下文 = 8 表字典（设定书 §2.2/附录 A）+ 指标卡（§3） |
| 查了脏数据 | 质量闸 | dbt tests + run_results/freshness：答数前查闸，脏表拒答 | §4 的 20 条规则（A/B 班重复行、吨方混写、T-3 补录……） |
| 口径漂移 | 语义层口径唯一 | Cube measures 定义一次处处一致；`meta.ai_context` 装口径争议注记 | §3 的 15 条指标卡 + §6 禁用词/别名/黑话 |
| 结论不可复现 | 快照绑定 | Iceberg `snapshot_id` = 结论的"数据版本"，审计按同快照重放 | §7 剧本 1 输出合同明文要"结论+证据链+**数据版本**" |

## 3. 逐件技术：作用 × 本项目场景

### 3.1 S3 —— Agent 的文件面统一接口

- **作用**：结构化数据走 SQL/湖仓，非结构化资产（报告 PDF、图片、导出 CSV、语料原文）走对象存储；预签名 URL 让 Agent 产物前端直传直下、文件流不过应用进程；事件通知"落桶即触发"驱动入湖管线；版本控制 + 2020 起强一致读 = 产物可审计（[s3.md](s3.md)）。
- **本项目场景**：剧本产物落桶——剧本 1《产量下滑归因》的归因报告（§7）与剧本 2 的评估归档（§7）生成 PDF/CSV 落 S3 桶、presigned 给前端下载；§4 质量闭环里"节点审查把控：数据是否入湖且质检通过为必选检查科目"对应到工程形状就是**对象落桶 → 事件触发质检 → 过闸才入湖**的门禁管线；一万 RTU 秒级采样（§2.1）的原始文件面也在对象层。
- **诚实边界**：本设定里非结构化面主要是语料原文与 Agent 报告；8 表是结构化面，两桶分治。

### 3.2 MinIO + Iceberg —— 自建数据湖的底座与表语义

- **作用**：MinIO 是湖的磁盘（油田内网私有部署），Iceberg 在对象文件之上补表语义。对 Agent 的三个直接收益：catalog 元数据是确定性信源压幻觉、快照隔离保证并发探索查询不脏读、时间旅行让结论可回放（[minio-iceberg.md](minio-iceberg.md)）。
- **本项目场景**：8 表生产库（§2.2）是核心事实源，而它的脏特征恰好都是"**上游会修正、修正必须留痕**"型：班次 A/B 重复行更正（§A.2）、吨方混写折算（§A.2/§4 规则 3）、T-3 补录批次（§A.4 `batch_id=20260911-T3`）、设备编码新旧并存切换（§A.7）——在 Iceberg 里**每一次修正是新快照**，修正前的口径按快照可回读，而不是物理覆盖。剧本 1 报告绑 `snapshot_id` 就是 §7 输出合同里"数据版本"的工程落地。一数四源（§3 真实案例/§8 事故 13：A11 实时加和 vs E7 统计上报差 3.2%）各源各落一层、以元数据血缘标注，为口径仲裁提供回查面。
- **诚实边界**：社区版 MinIO 无内嵌 catalog（AIStor 才有），本栈 catalog 外置（REST/Nessie/JDBC）；§9 明说本设定是 8 表生产库，真实企业是梦想云 15 专业 1.7PB。

### 3.3 Flink —— 实时进料口（不是问数引擎）

- **作用**：CDC 实时入湖、流批一体同一条 SQL 两侧口径一致、实时聚合指标的生产者。**exactly-once 归属要分清**：Flink 原生 Iceberg sink 保证 exactly-once；flink-cdc 3.x 的 Iceberg pipeline sink 官方明写 "Exactly-once not supported"——at-least-once + 主键幂等（源表必须有主键），"不重不丢"靠主键兜底（[flink.md](flink.md)）。定位红线：Flink SQL Gateway 官方自标 OpenAPI experimental，是作业提交/会话形态——**Agent 交互问数走 Trino/StarRocks/DuckDB，Flink 管进料与加工**。
- **加分项**：官方子项目 **Flink Agents**（自称 "streaming Agent OS"）把 agent 当数据流一等 operator（记忆/工具/**MCP 工具托管**，checkpoint+外部 WAL 保证 agent 执行 exactly-once）；SQL 侧 2.1 起内置 `ML_PREDICT`、2.2 起内置 `VECTOR_SEARCH`——进料层自己长出了 AI 叙事（[flink.md](flink.md)）。
- **本项目场景**：§2.1 五层采集链路里"实时库（InfluxDB 类）→ ETL 入数据仓库（15 分钟级闭环调度）"这一跳，现代实现就是 Flink CDC → 湖表；两类天然的实时源：`equip_status` 设备状态时间戳流（§A.7）与传感器零值 2 小时告警（§4 规则 11，唯一标注"实时域"的规则）。
- **诚实边界**：8 表全部是日/月粒度，§3 指标粒度多为月——**实时域在本项目只有规则 11 一处且设定书自标"演绎"**；Flink 在本设计里是链路演绎位，无独立模块设计。

### 3.4 dbt —— 明细到可信中间层的 T 层

- **作用**：把明细加工工程化：models/tests/docs/lineage；`manifest.json` 是机器可读的口径与血缘库；exposures 把下游应用（含 Agent）挂进 DAG（[dbt.md](dbt.md)）。
- **本项目场景**：8 表明细 → marts 层可信中间层（§9 资产目录行的本项目对应物就是"marts 层模型物+语义目录"）。**§4 的 20 条规则几乎逐条可翻成 dbt tests**：唯一性 #1（`(well_id,prod_date)` count=distinct）、完整性 #2（非空率 ≥99.5%）、单位一致性 #3（折算密度 ∈[0.82,0.98] t/m³）、计量 vs 化验 #4（偏差 ≤5pp）、值域 #5（water_cut∈[0,100]）、及时性 #6（≤T-1）——治理规则有了官方工程对应物。**合法 Join 白名单（§5）是 intermediate 模型的存在理由**：`oil_production_daily ⋈ fluid_test` 须双键+时间容差经中间视图、`⋈ water_injection_daily` 须经受效关系实体——Agent 只许引用 dbt 模型、不许裸 join 明细。事故 13 的"数据源血缘标注"落 manifest 血缘，Agent 应用注册为 exposure 进血缘。
- **诚实边界**：设定书规则是治理规则库不是 dbt 项目，映射为设计演绎；MetricFlow 引擎已开源但托管 Semantic Layer 仍收费（[dbt.md](dbt.md) 版本锚点）。

### 3.5 Cube —— 指标口径的确定性暴露

- **作用**：语义层让"指标定义一次、处处一致"：Agent 生成结构化 JSON 查询（measures/dimensions/timeDimensions）而非自由发挥 SQL；`meta.ai_context` 专门装载只给 AI 看的口径注记；securityContext 在 SQL 生成前划权限边界（[cube-semantic-layer.md](cube-semantic-layer.md)）。
- **本项目场景**：§3 的 15 条指标卡（定义/公式/单位/粒度/**修饰词**/Owner/数据源/**争议注记**）几乎就是 Cube measure 的字段清单——一卡一 measure，争议注记（如指标 10 递减增油"一数多源争议之最"）进 `meta.ai_context`。§6 术语域直接管问数入口：禁用词"老完成率"拦截、别名"剔检产量→净产量"归一、黑话"躺井"限语境、**一词两译"有效产量"用修饰词消歧成两个 measure**（开井日历/剔检，正是 §3 指标 2 的两支口径）。一数四源仲裁（§8 事故 13"语义层口径仲裁+权威源回读"）= Cube 的权威 source 定义；物质平衡联动（§3：β/f_w/q_o 强约束、改一处查联动）= 口径变更影响分析的语义层检查；行级安全对应三作业区数据权限（§1）。
- **诚实边界**：**本仓库设计主线已自建 Metric/Ontology 域，Cube 是它的行业对照物、不是替换设定**——两者同构（指标卡↔measure、Glossary↔术语归一、权威源回读↔语义层仲裁）；Cube 无 StarRocks 官方驱动、开源版无官方 MCP（[cube-semantic-layer.md](cube-semantic-layer.md)）。

### 3.6 DuckDB —— 进程内沙箱末端

- **作用**：嵌入式 OLAP：`PyIceberg scan → Arrow → DuckDB` 一条链本地聚合；httpfs 直连 MinIO（path-style）读 Parquet/湖表；单二进制无服务端（[duckdb.md](duckdb.md)）。
- **本项目场景**：剧本 1 归因五步（§7）里的"分解/下钻"试算——120 口井 × 8 表（§1/§2.2）是单机毫秒级体量，Agent 在沙箱里用 DuckDB 现算"新井贡献/老井递减/措施增油"分解与受效劈分试算（§3 指标 10 多井劈分 Σ=1、§5 受效关系），不必惊动服务端引擎；§2.1 第三层"边缘计算"就是嵌入式分析的部署位。
- **诚实边界**：单机可行是本设定体量——真实 1.7PB（§9）当然走分布式；DuckDB iceberg 扩展的写入能力是新近版本特性（[duckdb.md](duckdb.md) 版本锚点）。

### 3.7 Data Fabric —— 横切治理控制平面（行业理念对照）

- **作用**：Gartner 提出的数据管理设计理念：**active metadata（被动元数据→主动）+ 知识图谱 + 语义推断**，跨异构源自动做发现/集成/治理/访问——"找得到、看得懂、取得到、管得住"。Gartner 官方自评 "not a mature technology, no single vendor currently delivers all data fabric components"——**是架构理念，不是单一开源组件**（[data-fabric.md](data-fabric.md)）。
- **与六件套的关系**：fabric 是凌驾于 §1 栈之上的横切控制平面——统一目录/语义层/策略引擎/血缘正是各层管理面的收拢；2025-26 厂商叙事已从 fabric 转向 agentic（Informatica "Power every agent with AI-ready data"、Denodo DeepQuery + MCP Server 入平台），概念本体留在 Gartner 与分析师侧。
- **本项目对照（微缩）**：§6 术语"三多四难"是 fabric 要解的痛点原话；§1 角色-流程-工具三角 + §4 质量闭环/节点审查把控 = 自动化治理闭环与"数据 CI"的微缩对照；本仓库自建的 Ontology/Glossary/Metric/Playbook 域 + 五级语义 CI + 提案池 = **active metadata 的自建实现**（同构不同名，fabric 是行业对照物、不是替换设定）。
- **辨析必背**：fabric vs mesh——Gartner 官方"独立概念、可互补"（集中智能增强层 vs 组织去中心化所有权）；**Microsoft Fabric 是同名不同物**（微软 SaaS 分析产品，Azure 架构中心反把 data mesh/fabric 当作可部署于其上的架构框架）；国产对照物 Aloudata AIR（"逻辑数据编织"）。详见 [data-fabric.md](data-fabric.md)。

## 4. 60 秒全链路串联

从传感器到回答走一遍：井口一万 RTU 秒级采样（§2.1）→ **Flink** 把实时库增量写进 **MinIO** 桶上的 **Iceberg** 表（原生 sink exactly-once，CDC pipeline 走主键幂等），上游每修一次数就是新快照、旧口径随时回读 → **dbt** 把 8 表明细加工成 marts 中间层，20 条治理规则翻成 tests，血缘进 manifest，Agent 只许引用模型不许裸 join 明细 → **Cube** 把 15 条指标卡变成 measures，禁用词/别名/一词两译在语义层归一 → 问数 **Agent**（LangGraph SQL 节点）拉 `/meta` 的机器可读 schema 生成**结构化查询**，答数前过 freshness/tests 质量闸，结论绑 `snapshot_id`——剧本 1 输出合同要的"结论+证据链+数据版本"（§7）逐字落地。小体量试算 **DuckDB** 进程内就地解决，交互大查询走 Trino/StarRocks。每一层都对着 Agent 问数的一个失败模式：幻觉、脏数、口径漂移、不可复现；再往上，这套目录/血缘/语义资产的治理面就是 **data fabric** 理念的微缩对照。

## 5. 诚实边界（规模与体系归属）

- **规模设定**：项目设定 = 3 作业区/120 口在产井/8 表（§1/§2.2）；真实企业 = 梦想云 15 专业 1.7PB（§9 对照表）。栈的形状相同，量级差 5~6 个数量级。
- **体系归属**：全部是"增量调研"产出（docs/tech-stack/ 六件套分册 + [data-fabric.md](data-fabric.md) + 本合成篇），作为平台数据面的补充设计；设定书无湖仓专章，唯一对照锚是 §9"统一数据湖"行。
- **分册残留缺口**：社区版 MinIO 无内嵌 catalog、Cube×StarRocks/Dremio 驱动缺口、Iceberg 官方无 Flink 版本支持矩阵页（以 Maven artifacts 实证）、Flink 实时域仅 §4 规则 11 一处且自标"演绎"、data fabric 无权威"vs 数据中台"对照文——逐册见各自"版本锚点"节。
