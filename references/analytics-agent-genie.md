# 调研四：Analytics Engineer 转型、语义层运动、Analytics Agent 品类与 Genie

> 调研时间：2026-09-14。起因：用户提供了一份已获 leadership sign-off 的 Data Team 转型观点（"AI 会算但不懂业务；口径不统一，AI 只会给看起来合理但偏掉的答案；团队应从 use data 转向 define data——做 metrics 定义、语义层、逻辑标准化"），本报告用一手来源逐句验证该观点，并深挖 Genie 的数据侧准备方法论。方法：WebFetch 官方文档直抓（✅ 逐字核实）+ WebSearch（⚠️ 摘要核实）。
> 姊妹篇：报告一（官方文章 [1]-[21]）、报告二（开源 [1]-[28]）、报告三（前沿 [1]-[13]，其中已覆盖 Cortex Analyst/Genie index/Fabric data agent 三产品）。本报告编号独立 [1]-[9]。

---

## 1. TL;DR

1. 用户观点的每一句话都有一手出处级印证：dbt 对"口径打架"的原始诊断是分析师 "knew just enough SQL to be dangerous"，产生 conflicting metrics；解法是把业务逻辑从 BI 层移进建模层，成为可复用数据模型——即 Analytics Engineer 的核心工作 [3][1]。
2. 这个运动已被产业标准化：**Open Semantic Interchange（OSI）**——Snowflake 牵头、dbt Labs/Salesforce/ThoughtSpot/Amazon/Google/DataHub 等参与，YAML 语义模型跨平台交换规范已定稿；Salesforce 的定位话术就是"终结语义漂移（ending semantic drift），为可信 agentic AI 打地基" [4][5][6][7][8]。
3. Genie 官方 best practices 证明：**问数 agent 的准确率大部分是"数据侧准备"出来的**——表要少（建议 ≤5、上限 50）、指标用 metric view 预定义、Unity Catalog 注释是地基、**结构化 SQL 定义优先于文字指令**、example SQL + benchmark questions 做系统化评分 [9]。
4. 对本项目的含义：Petro-Agent 的最大升级点不是再加一个 agent 功能，而是把"口径治理"做成平台资产（语义层 + verified queries），用 Analytics Engineer 的思路把整个项目串起来。

---

## 2. 用户观点 × 一手来源逐句对读

| 观点表述 | 一手印证 | 出处 |
|---|---|---|
| "AI 可以帮你算，但 it doesn't understand the business" | Genie bp：准确率靠数据侧喂上下文——"Quality table and column descriptions in Unity Catalog are critical for Genie accuracy"、"Genie uses Unity Catalog column names and descriptions to generate responses" | [9] |
| "同一个问题不同团队用不同 definition，AI 只会给看起来合理但偏掉的答案" | dbt 对前语义层时代的诊断："people often knew just enough SQL to be dangerous"，产出 conflicting metrics；MetricFlow 的存在意义是 "ensuring consistent and accurate results" | [3][2] |
| "把业务逻辑从 Power BI / Excel 移到 data platform 里，变成 reusable data models" | dbt SL："Moving metric definitions out of the BI layer and into the modeling layer allows data teams to feel confident that different business units are working from the same metric definitions"；Genie bp："Metric views are particularly effective for Genie Agents because they pre-define metrics, dimensions, and aggregations" | [1][9] |
| "define metrics, build semantic layer, standardise logic = Analytics Engineer 的核心" | dbt 定义：分析工程师做 "transforming, testing, deploying, and documenting data"，"apply software engineering best practices like version control and continuous integration to the analytics code base"；角色 ~2018 年成形，"neither data engineering, nor analysis" | [3] |
| "从 use data 到 define data" | MetricFlow/OSI：指标一次定义到处复用——"If a metric definition changes in dbt, it's refreshed everywhere it's invoked and creates consistency across all applications"；OSI 把"define once, reuse everywhere"升级为跨平台标准 | [1][2][4][5] |
| "为未来的 AI（Genie 这类自然语言交互）打基础" | Salesforce（OSI 参与方）：语义标准是 "ending semantic drift"、为 "trustworthy agentic AI" 提供地基；ThoughtSpot 称之为 "agentic semantic layer" | [7][8] |

---

## 3. Analytics Engineer：角色的出处与边界 [3]

- 定义："transforming raw data into clean, well-documented datasets that empower business users to answer their own questions"；"Analytics engineers provide clean data sets to end users"。
- 与邻角的分工：analyst 花时间"analyzing data"，analytics engineer 花在 "transforming, testing, deploying, and documenting data"；data engineer 管基础设施（集成/管道/ML），analytics engineer 拥有"原始接入与 BI 工具之间的转换层"。
- 起因（2018 年前后）：云数仓让存储处理便宜快、管道服务让抽取一键化、BI 自助化——副作用是口径失控；"The solution: transform the raw data into a shape that's ready for analytics."

---

## 4. 语义层：从 dbt 实践到 OSI 行业标准

### 4.1 dbt Semantic Layer + MetricFlow（实践层）[1][2]

- 问题定义："The dbt Semantic Layer eliminates duplicate coding by allowing data teams to define metrics on top of existing models and automatically handling data joins."
- 一致性保证："If a metric definition changes in dbt, it's refreshed everywhere it's invoked and creates consistency across all applications."
- MetricFlow 编译保证：指标定义被 "compiled into a dataflow-based query plan, which is then optimized and translated into engine-specific SQL"，多跳 join、比率/累计等复杂指标、时间粒度聚合都由它处理（Apache-2.0，`pip install dbt-metricflow`）。
- 消费方式：下游工具经 Semantic Layer API 查"治理过的指标"而非裸 SQL——这正是 AI/analytics agent 接入语义层的姿势。

### 4.2 Open Semantic Interchange（标准层）[4][5][6][7][8]

- OSI 是 "industry-wide specification effort to standardize how we exchange semantic metadata across analytics, AI and BI platforms"，Snowflake 牵头，规范**已定稿**；YAML 语义模型 + 自然语言同义词，兼容 dbt Semantic Layer。
- 参与方：Snowflake、dbt Labs、Salesforce、ThoughtSpot、Omni、Collibra、Preset、Amazon、Google、DataHub、Denodo。
- 两个代表性定位话术：Salesforce——"ending semantic drift"、语义统一是 "trustworthy agentic AI" 的基础；ThoughtSpot——"the agentic semantic layer"。
- 归纳：**语义层正在从"某家产品的功能"变成"AI 时代的数据基础设施标准"**——这正是用户观点"未来 12-36 个月"判断的产业级背书。

---

## 5. Analytics Agent 品类与 Genie 深挖

### 5.1 品类图景

"Analytics agent / agentic analytics" 品类的三家标杆已逐一核实（报告三 [1][2][3]）：Snowflake Cortex Analyst（Semantic View + verified queries，官方建议迁移到能力超集 Cortex Agents）、Databricks Genie（Genie One/Agents/Code 三件套，"Every answer is grounded in your organization's data and governed through Unity Catalog"）、Microsoft Fabric data agent（GA，NL2SQL/NL2DAX/NL2KQL 多源路由，intent layers 指令层级，强制只读 + 用户凭据穿透 + 25 行裁剪）。共同点：**没有一家靠"更强的模型"解决准确率，全部靠语义层 + verified 问答对 + 治理。**

### 5.2 Genie 数据侧准备方法论（best practices 官方文档）[9]

- **表收敛**："Aim for five or fewer tables"；硬上限 "Genie Agents support up to 50 tables, views, or metric views"；更多就预 join 成视图或 metric view。
- **metric view 是首选载体**："Metric views are particularly effective for Genie Agents because they pre-define metrics, dimensions, and aggregations."
- **注释是地基**："Quality table and column descriptions in Unity Catalog are critical for Genie accuracy"——AI 生成的描述要先人工检查再用；同义词加在 agent 作用域，不污染全局元数据。
- **结构化 SQL 优先于文字**：业务口径（revenue、active customers、margins）用 SQL 表达式定义，"Structured definitions through SQL are more reliable and maintainable than plain text guidance"；文字 instructions 是"last resort"，且过多会降低长对话效果。
- **example SQL + benchmark 双用**：example queries 让 Genie "match user prompts to verified SQL queries and learn from examples"；复核过的问题收进 **benchmark questions**，"test and score your agent for overall accuracy"，还要测同一问题的多种问法。
- **评估姿态**："You should be your agent's first user"——先自己审生成的 SQL，再拉业务用户点赞/点踩，Monitoring tab + audit log 追踪；部署用 Declarative Automation Bundles 做 dev/staging/prod 可复现晋级。

---

## 6. 对本项目的映射（升级方向）

1. **主线设计升级**：整个项目可以用这个观点立论——"问数平台的竞争力不在生成 SQL，而在口径治理：AI 会算但不懂业务，语义层 + verified queries 才是可信问数的地基"。这与国内头部海上油公司的生产场景严丝合缝（产量完成率、检修井剔除、储量口径都是典型的 conflicting metrics）。
2. **语义层模块**：YAML 口径文件（metrics/同义词/单位/预置 join）+ 指标注册表 + Schema Linking 先查语义层 + 命中 verified query 走模板缓存——对应 Genie metric view [9] 与 Cortex Analyst Semantic View（报告三 [1]）。
3. **评估模块升级**：verified 问答对"一鱼两吃"（引导生成 + 评估基准，Genie benchmark questions 同款 [9]），同一问题多问法测稳定性。
4. **注释纪律**：M-Schema 生成器 + "AI 生成描述先人工审"的流程写进冷启动场景（Genie bp 同款 [9]）。
5. **结构化优先原则**：方言/口径全部用 SQL 表达式与代码定义，文字指令只做兜底——与项目"AST 闸/确定性校验优先"的既有设计同构，可互为印证。
6. **与商业产品的差距定位**：对"和 Genie/Cortex Analyst 差距"的诚实回答——它们是产品，本项目做的是同类产品的工程实现；语义层/verified queries/权限穿透三项核心机制同构（报告三 §2.4）。

---

## 7. 引用来源汇总（访问日期 2026-09-14）

1. dbt Docs, *The dbt Semantic Layer*. https://docs.getdbt.com/docs/use-dbt-semantic-layer/dbt-sl ✅
2. dbt Labs, *MetricFlow* GitHub README（含 OSI 与编译保证表述，~1.8k stars 为 README 自述）. https://github.com/dbt-labs/metricflow ✅
3. dbt Labs, *Analytics Engineering*（角色定义与起源）. https://www.getdbt.com/analytics-engineering ✅
4. Open Semantic Interchange 官网. https://open-semantic-interchange.org/ ⚠️（搜索摘要核实）
5. Snowflake Blog, *Open Semantic Interchange: an open AI standard*（牵头与参与方）. https://www.snowflake.com/en/blog/open-semantic-interchange-ai-standard/ ⚠️（搜索摘要核实）
6. Snowflake Blog, *OSI specs finalized*. https://www.snowflake.com/en/blog/open-semantic-interchanges-specs-finalized/ ⚠️（搜索摘要核实）
7. Salesforce Blog, *Ending semantic drift: a unified business logic foundation*. https://www.salesforce.com/blog/ending-semantic-drift-unified-business-logic-foundation/ ⚠️（搜索摘要核实）
8. ThoughtSpot Blog, *The agentic semantic layer and OSI*. https://www.thoughtspot.com/blog/the-agentic-semantic-layer-and-OSI ⚠️（搜索摘要核实）
9. Databricks Docs, *Genie best practices*. https://docs.databricks.com/aws/en/genie/best-practices.html ✅
