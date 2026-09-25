# Data Fabric（数据编织 × Data Agent）

> 技术栈调研 · slug: data-fabric · 关联: [dataagent-stack-map.md](dataagent-stack-map.md)（湖仓六件套合成篇——data fabric 是凌驾其上的横切治理/控制平面）
> 适用场景：国产化内网环境 · 假想业务：Petro-Agent 油田智能平台
> 调研日期：2026-09-24，论断以官方/权威源为准，逐条注源。

## 使用场景

### Data Fabric 是什么：架构理念 + 产品叙事，不是单一开源组件

- **Gartner 定义（官方主题页原话，公开可引）**："Data fabric is an emerging data management and data integration design concept. Its goal is to support data access across the business through flexible, reusable, augmented and sometimes automated data integration."——一个**新兴的数据管理与集成设计理念**，靠柔性、可复用、增强（常常自动化）的集成支撑全企业数据访问（[Gartner: What is Data Fabric](https://www.gartner.com/en/data-analytics/topics/data-fabric)，下引同页）。
- **机制一句话**："a data fabric takes in metadata from participating systems and users, analyzes it, and produces alerts and recommendations"——持续吸入元数据、分析、再产出告警与建议，自动化地组织/集成/释义数据（同页）。**"找得到、看得懂、取得到、管得住"是对这一句的中文压缩，非 Gartner 原文。**
- **不是单一组件（官方原话背书）**："Though data fabric is not a mature technology, and no single vendor currently delivers all data fabric components"——理念尚不成熟、无单一厂商交付全部组件（同页）。IBM 同口径："It is not a piece of software, but rather a design approach"（[IBM: What is a data fabric](https://www.ibm.com/think/topics/data-fabric)）。**与六件套分册的"可落盘技术"不同，本文件如实按理念写**；落地时是一组产品的组合，没有一处叫 data fabric 的可安装包。
- **无推倒重来**："There is no 'rip and replace' with a data fabric design"——它套在既有系统之上做横切整合（Gartner 同页）。

### 为什么 Data/Data Agent 需要它（全文重点）

- **① Agent 的"找数据"问题**：跨源发现、血缘、口径统一正是 fabric 的核心交付——Gartner 2025 公开新闻稿口径："data fabrics leverage active metadata, semantic models, and AI to automate data discovery, integration, and delivery"（[Gartner 新闻稿 2025-10-14](https://www.gartner.com/en/newsroom/press-releases/2025-10-14-gartner-says-chief-supply-chain-officers-can-scale-ai-with-data-fabric-architecture)）。Agent 工具层的统一语义查询/目录发现接口由 fabric 提供，Agent 不必对每个源各写一套发现逻辑。
- **② 策略即代码的访问控制**：Agent 能查哪些数据、行级/列级权限，由 fabric 的统一策略引擎在查询路径上裁决，而非各源各管各的——Denodo 官方能力面即"define and enforce comprehensive access controls, reporting, auditing"（[Denodo 官网治理能力](https://www.denodo.com/)）；Informatica 官方口径："Empower AI agents with governed, trusted data at scale"（[Informatica agentic data management](https://www.informatica.com/use-cases/agentic-data-management.html)）。
- **③ active metadata 的持续分析让集成管线"自维护"**：元数据被持续分析后产出自动化建议/告警（源变更→血缘受影响→集成自动适配），Agent 数据面从"人工修管线"变为"元数据驱动自愈"（Gartner 主题页机制原话，见上）。
- **④ 2025-26 agentic 叙事**：厂商正把 fabric 重新包装为"给 AI agent 供可信上下文的控制平面"——已核实为真，各厂商原话见下文"agentic 现状"。分工口径：**湖仓六件套解决"数据怎么存怎么算"，fabric 解决"跨这么多系统，谁说得清有什么数、谁能取、口径是否一致"——恰好是 Agent 问数的四个失败模式里偏治理的那一半**（另一半见 [dataagent-stack-map.md](dataagent-stack-map.md) 第 2 节四道闸）。

### 与 Petro-Agent 的对照

- **"三多四难"= fabric 痛点原话**：设定书 §6 术语表收录治理热词"三多四难"——数据库多平台多孤立应用多/共享难复用难开发难协同难（引用马涛）。Gartner fabric 的整个叙事起点就是它：跨异构源统一发现与访问，解的正是这四难。
- **治理闭环的微缩对照**：设定书 §1 角色-流程-工具三角（采集管理员→数字化室配置入湖强制规则→质量管理员质检复检→工具 API 自动比对质检结果、动态更新问题状态，问题单走"分发→认领→整改→复核→关闭"）与 §4 质量闭环+"节点审查把控"（业务节点论证前"数据是否入湖且质检通过"为必选检查科目）——把人工环节换成 active metadata 持续分析与策略引擎，就是 fabric 宣称的自动化治理闭环与"数据 CI"。
- **§9 对照表**：真实企业资产目录 = 梦想云 L1-L5 树形五层/6 业务域，本项目设定 = marts 层模型物+语义目录；统一数据湖 → 8 表生产库；门禁 → 五级语义 CI。fabric 的"统一数据目录"对应物在本项目设定里就是语义目录+血缘标注（一数四源各源各落一层、以元数据血缘标注口径）。
- **诚实边界（同构不同名）**：本仓库语义治理主线——Ontology（§5）/Glossary（§6）/Metric（§3）/Playbook（§7）域 + 五级语义 CI + 提案池——就是 **active metadata 的自建实现**：术语/指标/血缘持续治理并机判检查，同 fabric 的知识图谱+语义推断同构。**fabric 是行业理念对照物，不是替换设定**；本设计里它的角色由 Cube 语义层（[cube-semantic-layer.md](cube-semantic-layer.md)）+ dbt manifest 血缘（[dbt.md](dbt.md)）分摊。

## 核心能力面

### 参考架构组件（Gartner 三步 + 惯例五件）

- **Gartner 官方构建三步**：① 增强型数据目录（AI/ML 发现、标记、注解）→ ② 激活元数据：用图分析训练 AI/ML 模型、生成知识图谱 → ③ 给知识图谱叠加语义层（同主题页）。落到产品惯例是五件：**统一数据目录 / 语义层 / 集成层（虚拟化 vs 物理复制）/ 策略引擎 / 数据 ops**。
- **集成层的核心分野——虚拟化 vs 物理复制**：Denodo 主张逻辑数据管理（logical data management，universal semantic layer，数据不搬家实时联邦查询，[Denodo 官网定位](https://www.denodo.com/)）；另一派走物化复制进湖仓再统一目录（IBM watsonx.data 线）。中国厂商 Aloudata AIR 自称"国内首个基于 Data Fabric 理念的逻辑数据编织平台"，同属逻辑派（[aloudata.com](https://aloudata.com/)）。

### active metadata 机制

- **Gartner 原话（公开主题页）**：元数据分四类（technical/operational/business/social），各分 passive 与 active；"By definition, a data fabric converts passive into active metadata"（[Gartner 主题页](https://www.gartner.com/en/data-analytics/topics/data-fabric)）。
- **Gartner 完整定义在付费报告里**，公开可得的是厂商转述："Active metadata is the continuous analysis of all available users, data management, systems/infrastructure and data governance experience"（Atlan 转述 Gartner，[atlan.com](https://atlan.com/gartner-data-fabric-principles-benefits-implementation/)，层级：二手）。IBM 一手公开口径："federated active metadata uses semantic knowledge graphs and AI/ML technologies to continuously analyze metadata"（[IBM](https://www.ibm.com/think/topics/data-fabric)）。

### 代表实现清单（各一句话 + 官方页）

- **IBM**：data fabric = "modern data architecture designed to democratize data access"，产品线 watsonx.data（开放湖仓）+ watsonx.data intelligence（语义知识图谱撑治理/血缘/质量/数据产品）（[IBM think](https://www.ibm.com/think/topics/data-fabric)）。
- **Informatica**：IDMC = 端到端智能数据管理云，CLAIRE AI 引擎打底，现主打 agentic（[informatica.com](https://www.informatica.com/)、[CLAIRE AI](https://www.informatica.com/platform/claire-ai.html)）。**注意：其官网首页通篇未用 "data fabric" 一词**（本次核实），用 "AI-ready data platform"——分析师常把它归入 fabric 象限，但官方话术已转 agentic。
- **Denodo**：数据虚拟化/逻辑数据管理的 fabric 代表实现，"The Denodo Platform is the leading logical data management platform for a universal semantic layer"（[denodo.com](https://www.denodo.com/) 官网 meta 描述）。
- **Qlik（Talend）/ Alation**：Qlik 有 "What is Data Fabric?" 官方解释页（[qlik.com](https://www.qlik.com/)，站内 topic 页）；Alation 2025 年改打 "Agentic Data Intelligence Platform"——目录+机构知识变 AI-ready 数据产品（[alation.com](https://www.alation.com/)）。
- **开源侧如实说：无单一开源 fabric**。OpenMetadata（开源元数据平台：目录/治理/质量，[open-metadata.org](https://open-metadata.org/)）、DataHub（图模型元数据平台，[docs.datahub.com](https://docs.datahub.com/)）、OpenLineage（血缘元数据标准/规范而非平台，[openlineage.io](https://openlineage.io/)）、Apache Atlas/Amundsen——都是**零件**；缺的正是 fabric 叙事里"持续分析元数据并自动决策"的那颗大脑。

### agentic 现状（2025-26 官方叙事核实）

- **Denodo（有官方页）**：DeepQuery 2025-07-07 官宣，"Like Deep Research for the Enterprise"，多步"为什么"问题的推理型查询；同公告宣布 MCP Server 进入 Denodo Platform；Platform 9.3（2025-09）起 GA，9.4（2026-03）补 Agent 集成模式与 Data Marketplace chatbot（[denodo.com](https://www.denodo.com/) 新闻中心；新闻稿经 GlobeNewswire 分发，层级：官方 PR 转述）。
- **Informatica（有官方页）**：首页 hero 即 "Power every agent with AI-ready data"；"Automate complex data operations with CLAIRE® AI agents"；MCP 专题（[agentic data management 页](https://www.informatica.com/use-cases/agentic-data-management.html)、[首页](https://www.informatica.com/)）。
- **IBM（部分）**：data fabric 专文正文未展开 agent，但导航含 "Agentic AI data engineering"；watsonx.data intelligence 官宣以语义知识图谱为 AI/agent 供上下文（IBM 博客《Introducing watsonx.data intelligence》，ibm.com，本次检索到标题与要旨、未固定到具体 URL，层级：官方博客检索转述）。
- **Alation（有官方页）**："Agentic Data Intelligence Platform"（[alation.com](https://www.alation.com/)）；"Ask Your Data" 自然语言问数为第三方报道（TechTarget 2025-08，层级：媒体转述）。

## 典型用例模式

### 模式 1：Agent 经统一语义层跨源问数（虚拟化下推，口径由 fabric 语义层统一）

```python
# 伪代码形状（来源：Gartner fabric"集成层+语义层"定义 + Denodo logical data management 定位）
def tool_ask(question: str) -> Answer:
    intent = semantic_parse(question)          # "渤中 3 月产量完成率" → (指标=完成率, 区块=渤中, 窗口=2026-03)
    plan  = fabric.planner.expand(intent)      # 语义层按指标定义展开成跨源查询计划（口径定义在语义层，不散落各源）
    for sub in plan.pushdowns:                 # 查询下推：生产库 PostgreSQL / 实时库 InfluxDB / 湖 MinIO+Iceberg
        sub.engine = fabric.connector_for(sub.source)   # JDBC/REST/湖原生协议，各源各配
    rows = fabric.federate(plan)               # 虚拟化联邦执行：数据不搬家（logical），聚合在虚拟化层完成
    return Answer(value=rows,
                  lineage=plan.source_lineage,        # 血缘随答返回：结论可回查到每个源
                  metric_ver=fabric.semantics.version_of(intent.metric))  # 口径版本 = 结论的语义锚
```

### 模式 2：策略即代码——Agent 查询过统一策略引擎再放行

```python
# 伪代码形状（来源：Denodo 治理能力（access controls/auditing）+ Informatica "governed, trusted data" 口径）
@fabric.policy_engine.enforce(scopes=["row", "column", "sensitivity"])
def agent_query(req: QueryRequest, agent_id: str) -> QueryResult:
    ctx = fabric.identity.resolve(agent_id)            # Agent 身份 → 委托人/作业区/角色（人授权给 Agent）
    row_f  = ctx.policy.row_level("oil_production_daily")     # 行级：仅放行授权作业区的井（项目设定 3 作业区/120 口井，设定书 §1）
    masked = ctx.policy.column_level(["well_coordinates"])    # 列级：敏感列脱敏或拒绝
    if req.sensitivity == "PII" and not ctx.clearance:        # 敏感级：权限不够直接拒
        return DENY(req, reason="clearance")
    res = fabric.semantic.execute(req, row_filter=row_f, masked=masked)
    fabric.audit.log(agent_id, req, decision="ALLOW")         # 统一审计留痕：一个日志面看全部 Agent 行为
    return res
```

## 选型差异（一句话版）

- **Data Fabric vs Data Mesh**：Gartner 官方口径——"in fact, they are independent concepts. Under the right circumstances, they can be used to complement each other"；fabric = 数据管理设计（元数据自动化集中智能），mesh = 架构方法（分布式所有权+业务数据产品），区分轴为 Technology/Purpose/Data authority and governance/People（[Gartner 主题页 Data Fabric vs. Data Mesh 节](https://www.gartner.com/en/data-analytics/topics/data-fabric)；一手定义转述另见 [Starburst](https://www.starburst.io/blog/data-fabric-and-data-mesh-same-or-different/)，层级：厂商转述 Gartner）。
- **Data Fabric vs 数据中台**：Gartner 叙事（全球）= 元数据自动化+逻辑集成+不搬家；中国叙事 = 物理汇聚+统一加工+可复用资产/API。**无 Gartner 官方东西对照文（本次核实不存在）**；中文权威面：信通院何宝宏把数据编织列为数据治理趋势、称"增强数据目录、数据虚拟化、主动元数据……打造逻辑统一数据视图"且信通院已启动数据编织标准化研究（通信世界网 2023-12 报道，[cww.net.cn](https://www.cww.net.cn/)，层级：信通院观点的媒体转述）；厂商级对照见 Aloudata 选型文（[aloudata.com](https://aloudata.com/)，层级：厂商白皮书）——**一套话语体系（中台）重组织重资产，一套（fabric）重元数据重自动化，互补竞争皆可，别当同谱系竞品**。
- **Data Fabric vs Lakehouse**：fabric = 治理/集成控制平面（设计理念），lakehouse = 存储计算范式（开放表格式+对象存储，见 [minio-iceberg.md](minio-iceberg.md)），**互补不互斥**——IBM 官方同页并存 watsonx.data（"hybrid, open data lakehouse"）与 data fabric 方案即证（[IBM](https://www.ibm.com/think/topics/data-fabric)）。
- **Microsoft Fabric 消歧**：Microsoft Fabric 是微软同名 SaaS 分析平台（OneLake+各 workload，官方自称 "complete data platform"，产品页**通篇不用** Gartner 意义的 "data fabric" 一词，[microsoft.com/fabric](https://www.microsoft.com/en-us/microsoft-fabric)）；微软自己的架构指引把 data mesh/data fabric 当作"可部署在 Fabric 之上的架构框架"（Azure 架构中心部署模式页 Pattern 3 原话 "Your organization wants to deploy architectural frameworks like data mesh or data fabric"，[learn.microsoft.com](https://learn.microsoft.com/en-us/azure/architecture/data-guide/technology-choices/fabric-deployment-patterns)）——**同名不同物：一个是产品，一个是架构理念**。

## 版本锚点

（理念/产品叙事锚点，无版本号组件；查询日期 2026-09-24）

- **Gartner 术语页状态**：data fabric 官方主题页公开在列且持续更新（含 Data Fabric vs Data Mesh 节与"no single vendor"表述，[gartner.com/en/data-analytics/topics/data-fabric](https://www.gartner.com/en/data-analytics/topics/data-fabric)）；Gartner 自评 "not a mature technology"。IT Glossary 词条页有 Cloudflare 反爬墙，本次经公开检索取文。另一公开锚：2025-10-14 新闻稿把 fabric 直接挂上 AI 叙事（URL 见上"使用场景"节）。
- **厂商产品线现状**：Denodo Platform 9.3（2025-09，DeepQuery GA）/9.4（2026-03，MCP+chatbot）；Informatica CLAIRE agents + agentic data management 页（2025 在线）；IBM watsonx.data intelligence（语义知识图谱线）；Alation Agentic Data Intelligence Platform（2025 改版）；Aloudata AIR/BIG/Agent 国产 fabric 线在售。
- **本次未找到一手源/证据不足**：① Gartner active metadata 完整定义在付费报告，公开面只有主题页"converts passive into active metadata"一句与厂商转述；② "数据中台 vs data fabric" 无 Gartner/信通院两造同台对照的权威文档，只有厂商白皮书与信通院趋势表态；③ Denodo DeepQuery 官宣新闻稿的 denodo.com 站内直链未固定（经 GlobeNewswire/媒体分发核实）；④ IBM watsonx.data intelligence 博客具体 URL 未固定，论断取官方标题与要旨。

## 信源列表

- Gartner: What is Data Fabric? Uses, Definition & Trends（定义/active metadata/no single vendor/fabric vs mesh）：https://www.gartner.com/en/data-analytics/topics/data-fabric
- Gartner: Data Architecture 主题页（fabric/mesh 并列两种选项）：https://www.gartner.com/en/data-analytics/topics/data-architecture
- IBM: What is a data fabric?（"not a piece of software"/federated active metadata/watsonx 并列）：https://www.ibm.com/think/topics/data-fabric
- Denodo 官网（logical data management/universal semantic layer 定位与治理能力）：https://www.denodo.com/
- Informatica agentic data management（"governed, trusted data at scale"/CLAIRE agents/MCP）：https://www.informatica.com/use-cases/agentic-data-management.html ；首页（"Power every agent with AI-ready data"）：https://www.informatica.com/
- Alation Agentic Data Intelligence Platform：https://www.alation.com/ ；Qlik 官网 "What is Data Fabric?" 解释页：https://www.qlik.com/
- Microsoft Fabric 产品页（"complete data platform"，不用 data fabric 一词）：https://www.microsoft.com/en-us/microsoft-fabric
- Azure Architecture Center: Choose a Microsoft Fabric deployment pattern（data mesh/fabric 是可部署于其上的架构框架）：https://learn.microsoft.com/en-us/azure/architecture/data-guide/technology-choices/fabric-deployment-patterns
- Starburst: Gartner—Data fabric and data mesh: same or different（Gartner 定义转述）：https://www.starburst.io/blog/data-fabric-and-data-mesh-same-or-different/
- Atlan: Gartner Data Fabric 原理/收益/实现（Gartner active metadata 定义转述）：https://atlan.com/gartner-data-fabric-principles-benefits-implementation/
- Gartner 新闻稿 2025-10-14（fabric × AI 官方叙事："active metadata, semantic models, and AI to automate data discovery, integration, and delivery"）：https://www.gartner.com/en/newsroom/press-releases/2025-10-14-gartner-says-chief-supply-chain-officers-can-scale-ai-with-data-fabric-architecture
- 开源零件：OpenMetadata https://open-metadata.org/ ；DataHub 文档 https://docs.datahub.com/ ；OpenLineage https://openlineage.io/
- 中文侧：通信世界（信通院何宝宏数据治理趋势/数据编织标准化）：https://www.cww.net.cn/ ；Aloudata（国产逻辑数据编织/主动元数据，选型对照）：https://aloudata.com/
- 关联分册：[dataagent-stack-map.md](dataagent-stack-map.md) · [cube-semantic-layer.md](cube-semantic-layer.md) · [dbt.md](dbt.md) · [minio-iceberg.md](minio-iceberg.md)
