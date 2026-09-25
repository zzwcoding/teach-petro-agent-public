# Data Agent 开源项目调研：text-to-SQL / ChatBI 问数 / 数据分析 Agent

> 调研时间：2026-09-14。方法：GitHub REST API（无鉴权公开端点）逐仓核实硬事实（star 数、license、archived、pushed_at、open_issues），raw README/LICENSE 全文抓取提取架构要点，基准官网（BIRD / Spider 2.0）WebFetch 逐字抓取。
> 引用纪律：每条事实性论断带编号引用（第 7 节汇总）；所有 star 数等硬数字均来自本次实际发出的 GitHub API / 页面请求，截至 2026-09-14；抓取失败、字段缺失、仓库 404 一律如实写"未能核实"。官方文档原话与作者归纳严格区分："归纳："开头为本报告作者观点。
> 与姊妹篇的关系：本报告是 references/data-agent-research.md（下称"报告一"，调研 OpenAI × Anthropic 官方文章）的续作。报告一引用编号 [1]-[21]，本报告编号独立（[1]-[28]）；交叉引用一律写"报告一 [X]"。

---

## 1. TL;DR

**生态一句话**：Data Agent 开源生态已分层成熟——上游"text-to-SQL 引擎"（Vanna / XiYan-SQL / Dataherald）进入残酷洗牌期，中游"ChatBI/GenBI 平台"（WrenAI / DB-GPT / SuperSonic）靠语义层卷工程化，旁支"分析 agent"（PandasAI / Data Interpreter / Data Formulator）各自摸索，而真正稳定可依赖的轮子在底座层（sqlglot、BIRD/Spider 2.0、promptfoo/ragas、MCP/E2B/护栏框架）。

1. **头部 text-to-SQL 框架正在批量"死亡或改名"**：Vanna（23.8k star）已于 2026-03-29 官方归档只读 [1]；Dataherald 停更逾两年 [4]；ragas 与 NeMo Guardrails 均迁移了组织（旧名 301）[18][23]。**结论：工程实践不要绑框架，要绑底座。**
2. **"多生成器集成 + 确定性校验 + 语义层"是当前 SOTA 公认路线**：BIRD 榜首为中国企业团队系统（华为 DataGallery-Text2SQL 82.39%，2026-08-22），人类基线 92.96% [13]；XiYan-SQL 用 M-Schema + 多生成器 + Refiner/Selector 双重校验登顶过 BIRD [2]；WrenAI/SuperSonic 均以语义层为核心卖点 [5][7]——这与报告一 [16] OpenAI 内部数据智能体"golden SQL + 结果集双重比对"的架构判断一致。
3. **对企业级难度，前沿模型远未饱和**：Spider 2.0（632 个企业级任务）发布时 o1-preview 仅解出 17.1%、GPT-4o 仅 10.1%（对比 Spider 1.0 的 86.6%）[17]；到 2026-09，Spider 2.0-Lite 榜首已达 76.23%（腾讯天穹 + GLM 5.2）[17]——进步来自工程（schema linking、执行反馈、语义层）而非单靠模型升级，这正是自研构建路线的价值所在。

---

## 2. 调研方法与范围

### 2.1 检索与核实方式（实际操作记录）

| 手段 | 说明 |
|------|------|
| GitHub REST API 直查 | `GET api.github.com/repos/{owner}/{repo}` 逐仓核实 stargazers_count / license / archived / pushed_at / open_issues / language，无鉴权额度（60 次/小时）内完成约 35 次调用，全部为 2026-09-14 当日实时数据 |
| GitHub 301 重定向跟进 | explodinggradients/ragas 与 NVIDIA/NeMo-Guardrails 返回 `Moved Permanently`，经 `repositories/{id}` 端点跟进获得新地址与最新数据 [18][23] |
| GitHub Search API | 用于勘误候选清单中的错误仓库名（XiYan、Data-Interpreter、langchain-ai 官方 SQL 示例、data-herald） |
| raw README / LICENSE 抓取 | 对 sqlglot、sqlfluff、XiYan-SQL、WrenAI、DB-GPT、SuperSonic、Vanna、E2B、data-formulator、modelcontextprotocol/servers、MetaGPT、pandas-ai 抓取 README 原文与 LICENSE 文件原文 |
| 基准官网 WebFetch | bird-bench.github.io 与 spider2-sql.github.io 逐字抓取榜单数字与数据集构成 |
| WebSearch（1 次） | 仅用于 Dataherald 公司下落的线索检索；因未找到一手公告，相关表述在正文中明确降级为"线索" |

### 2.2 维护状态判定口径（本报告自定义）

- **活跃**：默认分支 2 个月内有 push（≤ 2026-07-14）；
- **常规**：6 个月内有 push；
- **缓慢/停滞**：超过 6 个月无 push；
- **archived**：GitHub 官方归档、只读（以 API `archived:true` + 仓库页归档横幅日期为准）。

### 2.3 收录标准

- 数据垂直场景（text-to-SQL / ChatBI 问数 / 数据分析 agent）直接相关，或为构建该类 agent 的底座（SQL 处理、评估、沙箱、护栏、连接协议）；
- 候选清单中仓库名错误的（ModelScope/XiYan-SQL、Dataherald/data-herald、FoundationAgents/Data-Interpreter、langchain-ai/sql-agent 均不存在），以 Search API 勘误后的真实仓库为准收录；
- 已删除/无法核实的不强行收录（如 Chat2DB：alibaba/chat2db 与 chat2db/Chat2DB 均 404，未能核实其现址，仅在生命周期案例中一笔带过）。

### 2.4 候选清单核实记录（勘误与异常，全部为 2026-09-14 实查）

| 候选（凭记忆给出） | API/搜索结果 | 处理 |
|------|------|------|
| ModelScope/XiYan-SQL | 404 | 勘误为 XGenerationLab/XiYan-SQL [2]（Search API 命中） |
| Dataherald/data-herald | 404 | 勘误为 Dataherald/dataherald（org 仓库列表确认 [4]） |
| FoundationAgents/Data-Interpreter | 404；org 全量仓库列表（35 个）中无此仓 | 勘误：Data Interpreter 是 MetaGPT 主仓内模块 [9] |
| langchain-ai/sql-agent | 404 | 勘误为 langchain-ai/text-to-sql-agent（Search API 命中 [25]） |
| NVIDIA/NeMo-Guardrails | API 301 Moved Permanently | 跟进得 NVIDIA-NeMo/Guardrails [23] |
| explodinggradients/ragas | API 301 Moved Permanently | 跟进得 vibrantlabsai/ragas [18] |
| alibaba/chat2db | 404；chat2db/Chat2DB 亦 404 | 现址未能核实，不收录 |
| XGenerationLab/XiYan-SQL language 字段 | 两次 API 调用返回空 | 总表标注"未返回"，不凭猜测填写 |
| `kingbase sqlglot` / `dameng sqlglot` 仓库搜索 | 0 结果 | 如实写"未找到可核实的社区方言包" [11] |
| GitHub API 限流 | 未触发（额度 60 次/小时，本次约 35 次调用，剩余 20） | 全部硬数据来自 API 直查 |

---

## 3. 生态全景总表（star 数均为 GitHub API 实查，2026-09-14）

| 项目 | 链接 | Stars | License | 语言 | 维护状态 | 一句话定位 |
|------|------|-------|---------|------|---------|-----------|
| vanna-ai/vanna | github.com/vanna-ai/vanna | 23,814 | MIT | Python | **archived（2026-03-29 归档，最后 push 2026-02-02）** | text-to-SQL RAG 框架鼻祖，2.0 重写后数周即归档 [1] |
| XGenerationLab/XiYan-SQL | github.com/XGenerationLab/XiYan-SQL | 1,019 | Apache-2.0 | 未返回（API 语言字段为空） | 常规（push 2026-05-18） | 阿里 MGI 多生成器集成 text-to-SQL，2024-12 曾登顶 BIRD [2] |
| XGenerationLab/xiyan_mcp_server | github.com/XGenerationLab/xiyan_mcp_server | 240 | 未核实 | 未核实 | 常规（push 2026-02-11） | XiYan 的 MCP server 形态，可本地跑 3B 模型问数 [3] |
| Dataherald/dataherald | github.com/Dataherald/dataherald | 3,647 | Apache-2.0 | Python | **停滞（最后 push 2024-07-24）** | 企业级 NL2SQL 引擎，公司疑似安静关停（见 4.1.3）[4] |
| Canner/WrenAI | github.com/Canner/WrenAI | 17,633 | 多协议（Apache-2.0 + AGPL-3.0 + CC-BY-4.0 文件共存） | Python（+Rust 引擎） | 活跃（push 2026-09-14） | 开源 GenBI 引擎：语义层 MDL + text-to-SQL + 治理原语 [5] |
| eosphoros-ai/DB-GPT | github.com/eosphoros-ai/DB-GPT | 19,954 | MIT | Python | 活跃（push 2026-09-14） | 国内社区最大的 AI 原生数据应用开发框架（AWEL/agent/RAG）[6] |
| tencentmusic/supersonic | github.com/tencentmusic/supersonic | 5,081 | Apache-2.0（LICENSE 原文已核对） | Java | 活跃（push 2026-09-08） | 腾讯音乐 ChatBI + Headless BI 语义层平台 [7] |
| sinaptik-ai/pandas-ai | github.com/sinaptik-ai/pandas-ai | 23,795 | 自定义分叉许可（Sinaptik GmbH） | Python | 缓慢（push 2025-10-28） | 对话式数据分析，已从 DataFrame 转向"chat with database/datalake" [8] |
| FoundationAgents/MetaGPT | github.com/FoundationAgents/MetaGPT | 70,383 | MIT | Python | 缓慢（push 2026-01-21） | 多智能体框架；其 Data Interpreter（数据科学 agent）为主仓内模块，**无独立仓库** [9] |
| microsoft/data-formulator | github.com/microsoft/data-formulator | 17,150 | MIT | Python | 活跃（push 2026-09-14） | 微软研究院的可视化驱动数据分析 agent（Data Thread 交互）[10] |
| tobymao/sqlglot | github.com/tobymao/sqlglot | 9,613 | MIT | Python | 极活跃（push 2026-09-14，open issues 仅 1） | 无依赖 SQL 解析/转译/优化器，34 种方言，AST 闸首选 [11] |
| sqlfluff/sqlfluff | github.com/sqlfluff/sqlfluff | 9,872 | MIT | Python | 活跃（push 2026-09-13） | SQL linter/格式化，28 种方言 [12] |
| bird-bench/mini_dev | github.com/bird-bench/mini_dev | 185 | 无 license | Python | 活跃（push 2026-09-05） | BIRD Mini-Dev：500 题、可本地跑的官方评估子集 [14] |
| xlang-ai/Spider2 | github.com/xlang-ai/Spider2 | 870 | MIT | HTML | 常规（push 2026-08-12） | Spider 2.0 企业级 text-to-SQL 工作流基准（ICLR 2025 Oral）[16] |
| vibrantlabsai/ragas（原 explodinggradients/ragas） | github.com/vibrantlabsai/ragas | 15,726 | Apache-2.0 | Python | 常规（push 2026-02-24） | RAG/LLM 应用评估框架（RAGAS 指标出处），组织已迁移 [18] |
| promptfoo/promptfoo | github.com/promptfoo/promptfoo | 25,095 | MIT | TypeScript | 极活跃（push 2026-09-14） | prompt/agent/RAG 评估 + 红队扫描，CI 友好 [19] |
| openai/evals | github.com/openai/evals | 19,449 | API 未识别（NOASSERTION） | Python | 缓慢（push 2026-04-14） | OpenAI 开源评估框架与基准注册表（含 Spider 示例，见报告一 [20]）[20] |
| modelcontextprotocol/servers | github.com/modelcontextprotocol/servers | 90,316 | API 未识别（NOASSERTION） | TypeScript | 活跃（push 2026-09-03） | MCP 官方参考服务器；**Postgres server 已移入 archived** [21] |
| e2b-dev/E2B | github.com/e2b-dev/E2B | 13,798 | Apache-2.0 | Python | 活跃（push 2026-09-14） | 云端隔离沙箱，运行 AI 生成代码（对应"大结果集不进上下文"）[22] |
| NVIDIA-NeMo/Guardrails（原 NVIDIA/NeMo-Guardrails） | github.com/NVIDIA-NeMo/Guardrails | 7,120 | API 未识别（NOASSERTION） | Python | 活跃（push 2026-09-11） | NVIDIA 可编程 LLM 护栏工具包，组织已迁移 [23] |
| guardrails-ai/guardrails | github.com/guardrails-ai/guardrails | 7,410 | Apache-2.0 | Python | 活跃（push 2026-09-13） | LLM 输出结构化校验护栏（validator 生态）[24] |
| langchain-ai/text-to-sql-agent | github.com/langchain-ai/text-to-sql-agent | 36 | 无 license | Jupyter | 常规（push 2026-08-05） | LangChain 官方 text-to-SQL agent 教程仓库 [25] |
| anthropics/skills | github.com/anthropics/skills | 176,264 | 无 license | Python | 活跃（push 2026-09-10） | Agent Skills 开放标准官方技能库 [26] |
| defog-ai/sqlcoder | github.com/defog-ai/sqlcoder | 4,049 | Apache-2.0 | Jupyter | **停滞（push 2024-05-23）** | 曾 SOTA 的开源 text-to-SQL 微调模型系列 [27] |

> 注：XiYan-SQL 的 language 字段在两次 API 调用中均返回为空，故标注"未返回"；anthropics/skills 的 star 数经两次独立 API 调用核实一致（176,263 → 176,264，当日自然增长）。

---

## 4. 分类精读

### 4a. text-to-SQL 引擎类

#### 4.1.1 Vanna：曾经的"默认答案"，2026-03-29 归档 [1]

- **定位与架构**：README 自述为 text-to-SQL 生成框架（API 描述原话："Accurate Text-to-SQL Generation via LLMs using Agentic Retrieval"）[1]。0.x 时代的经典范式是"用 DDL/文档/历史 SQL 训练 RAG，检索相似 SQL 再生成"；抓取到的 2.0 README 显示其已转型为 agent 流水线：用户提问 → 后端 agent 经用户感知工具生成 SQL → 应用行级安全 → 流式回传进度、SQL、数据表、Plotly 图表与自然语言摘要，RAG 降级为可选的"Context Enrichers" [1]。迁移说明原话："Vanna 2.0 is a complete rewrite focused on user-aware agents and production deployments"（Vanna 2.0 是聚焦用户感知 agent 与生产部署的完全重写）[1]。
- **数据连接**：README 列出 PostgreSQL、MySQL、Snowflake、BigQuery、Redshift、SQLite、Oracle、SQL Server、DuckDB、ClickHouse 及"Others" [1]。
- **评估**：README 未提基准成绩（无 BIRD/Spider 分数）。
- **活跃度与风险**：GitHub API `archived: true`；仓库页归档横幅原文："This repository was archived by the owner on Mar 29, 2026. It is now read-only." [1]。归档发生在 2.0 完全重写发布（最后 push 2026-02-02）之后约七周，且 README 与描述均无后继项目指引 [1]。归纳：一个 23.8k star、被无数教程引用的"标杆项目"，在架构大迁移窗口期猝死——**凡以它为底座写生产代码的计划都应中止，只能作历史案例参考**。
- **对本项目的借鉴点**：其一，"DDL/文档/历史 SQL 三件套训练语料 + 相似检索"的思路仍成立，但需注明项目已归档；其二，其"用户感知 + 行级安全进 agent 工具层"的 2.0 方向与报告一 [16][17] 的权限穿透一致，印证项目"越权防护"环节的方向；其三，"历史 SQL 即检索资产"正是项目"指纹熔断/SQL 模板缓存"的框架级对照（与报告一 [6] "stored queries" 表述一致）。

#### 4.1.2 XiYan-SQL：多生成器集成路线的样板 [2][3]

- **定位与架构**（README 原话与要点）[2]：阿里达摩院系团队（XGenerationLab 组织，注意**不在 ModelScope org 下**，候选清单有误已勘误）。核心是"multi-generator ensemble strategy"（多生成器集成策略）：① M-Schema——"a semi-structured schema representation method designed to enhance the understanding of database structures"（半结构化 schema 表示法，增强对库表结构的理解）；② 候选生成 = ICL（"基于命名实体识别的示例选择"）+ SFT 微调多路候选；③ Refiner——"optimizes each candidate by correcting logical or syntactical errors"（修正候选 SQL 的逻辑/语法错误）；④ Selection model——微调一个选择模型"distinguish nuances of candidate SQL queries"（甄别候选 SQL 之间的细微差异）。
- **数据连接与部署形态**：配套 xiyan_mcp_server——"a MCP server that enables natural language queries to databases"（支持本地模式在 PC/Mac 上跑 3B 模型）[3]；另开源 XiYanSQL-QwenCoder 3B/7B/14B/32B text-to-SQL 模型 [2]。
- **评估**：README 明确记载 2024-12-17 以 EX 75.63%（R-VES 71.41%）登顶 BIRD；单模型 XiYanSQL-QwenCoder-32B 69.03%；2025 年下半年补充了多方言基准成绩（BIRD-CRITIC-PG 44.53%、BIRD-CRITIC-Flash 48.5%、BIRD-CRITIC-Open 44.37%）[2]。
- **活跃度与风险**：非 archived，push 2026-05-18（约 4 个月前，常规档）[2]。
- **对本项目的借鉴点**：其一，**M-Schema 是 Schema Linking 环节最值得抄的具体产物**——把表/列/注释/枚举值组织成半结构化 markdown 而非裸 DDL；其二，"生成 N 候选 → 规则修错 → 模型优选"的流水线与项目"AST 闸 + 指纹熔断"天然互补：AST 闸做确定性淘汰，Refiner/Selector 思路可作为 LLM 复核层（与报告一 [19] SchemaFlow"阶段间确定性检查"互补）；其三，xiyan_mcp_server 证明 text-to-SQL 可以整体封装为 MCP server，可作"框架级 vs 手写级"的选型对比。

#### 4.1.3 Dataherald：生命周期风险样本 [4][28]

- **定位与架构**：自述"natural language-to-SQL engine built for enterprise-level question answering over relational data"（面向企业级关系库问答的 NL2SQL 引擎），API 优先设计 [4][28]。注意仓库名是 `dataherald` 而非候选清单记忆中的 `data-herald`（后者 404，Search API + org 仓库列表双重确认 [4]）。
- **数据连接**：面向关系库问答（README 自述 enterprise relational data）；其 2024-05 曾以"open sourced our entire text-to-SQL product"登上 Hacker News Show HN [28]。（其具体连接器清单本次未逐项核实，不展开。）
- **活跃度与风险**：GitHub API 核实：非 archived，但**最后 push 停在 2024-07-24**，停滞已逾两年 [4]。公司下落：**未能找到官方关停公告**；可核实的线索——组织下所有仓库自 2024 年后无实质更新 [4]；联合创始人公开表述中已用过去时提及该公司并转向新创业项目（经搜索摘要获得，LinkedIn 线索，仅作参考不作确证）[28]；第三方博客将其与 Vanna 并列为"长期未提交"案例 [28]。归纳：这是一家 NL2SQL 创业公司"不宣布死亡、安静停摆"的典型——**开源项目的"非 archived"不等于"有人维护"，判活必须看 pushed_at**。
- **对本项目的借鉴点**：作为"选型尽调"的反面案例：star 数（3,647）、license（Apache-2.0）、非 archived 三项常规指标全部正常，唯独 pushed_at 暴露真相；与本报告 Vanna 案例合称"两种死法"（公告式归档 vs 停摆式死亡），并可与报告一 [15]（OpenAI 关停 Agent Builder）串成"平台/框架生命周期风险"专题。

### 4b. ChatBI / GenBI 平台类

#### 4.2.1 WrenAI：语义层 MDL 是最大公约数 [5]

- **定位与架构**（README 原话）："the open-source generative BI (GenBI) engine"——"open-source, governed text-to-SQL through an open context layer"（经开放上下文层的、受治理的开源 text-to-SQL），把自然语言变成 SQL、图表与可分享看板；并明确自我定位为**服务现有 agent（Claude Code、Cursor、MCP client、LangChain）的语义层**而非又一个聊天 UI [5]。抓取到的 README 显示项目已重构：旧 Docker 版 GenBI 应用退役，Wren Engine 于 2026-05-07 合入主仓，聊天版产品仅以"Wren GenBI Classic"存于 `legacy/v1` 分支（不再修 bug、不加新功能）[5]。
- **核心组件**：wren-core——Rust 语义引擎，构建于 Apache DataFusion 之上；语义层用 **MDL（Modeling Definition Language）**声明 models、columns、relationships、cubes/metrics，另以 `instructions.md`/`queries.yml` 承载非 schema 上下文（枚举、单位、approved joins、示例）；Python SDK/CLI（PyPI `wrenai`）、MCP server、agent skills、本地 LanceDB 混合检索记忆；`wren-langchain`/`wren-pydantic` agent SDK；**治理原语**：dry-plan validation、row limits、value profiling、带修复提示的结构化错误 [5]。
- **数据连接**：单一 DataFusion 引擎接 22+ 数据源（BigQuery、Snowflake、PostgreSQL、ClickHouse、Redshift、Databricks、DuckDB 等）[5]。
- **评估**：README 无公开基准数字，仅有 `evals/spodbtify_ab` 目录与规划中的"golden eval runner"（未来工作），正确性声明是定性的 [5]。
- **活跃度与风险**：非常活跃（push 2026-09-14，2702 commits）；风险点是**多协议 license**（LICENSE 文件为"WrenAI License Overview"，README 称核心引擎/SDK/skills 为 Apache-2.0 可自托管，但仓库同时含 AGPL-3.0 与 CC-BY-4.0 文件，商用边界需法务确认）[5]。
- **对本项目的借鉴点**：其一，**MDL 语义层 = 项目"Schema Linking 多源上下文"的产品化形态**，与报告一 [16] 六层上下文中"Curated descriptions（专家策展口径）"完全同构——石油行业的"产量、井型、层位"等业务口径正需要这种声明式载体；其二，其治理原语（dry-plan、行数上限、结构化报错）可直接抄进项目的 SQL 校验与护栏设计（结构化报错呼应报告一 [5] "可执行错误信息"）；其三，license 多协议是二次分发/商用时的注意项。

#### 4.2.2 DB-GPT：国内数据 agent 工程化全景 [6]

- **定位与架构**（README 原话）："open-source agentic AI data assistant for the next generation of AI + Data products"（面向下一代 AI+Data 产品的开源 agentic AI 数据助理），连接数据、自主写 SQL/代码、在沙箱运行技能、产出报告；平台能力包括 agents、**AWEL**（Agentic Workflow Expression Language，工作流编排）、RAG、多模型管理（SMMF 在 README 中仅以文档链接出现，未展开）[6]。
- **主要特性**：Text2SQL（含经 DB-GPT-Hub 对 LLaMA/BLOOM/Falcon/Baichuan/InternLM/Qwen/ChatGLM2 等的微调）；RAG（文档解析 + ChromaDB 向量库随 PyPI 默认安装）；多源数据访问（关系库、CSV/Excel、文档、知识库，具体清单指向 docs 站点）；agent 与可复用技能（支持从 GitHub 导入技能）；沙箱执行；看板/HTML 报告 [6]。模型支持 DeepSeek、Qwen、GLM、Llama、Gemma、Yi 等 + OpenAI 兼容 API（Kimi/Moonshot、MiniMax、DashScope）[6]。
- **数据连接与国产库**：README 全文检索**无"达梦/Dameng/金仓/Kingbase"字样**；可核实的 rdbms 通用层目录（packages/dbgpt-core/src/dbgpt/datasource/rdbms）仅含 `__init__.py` 与 `base.py`，具体连接器分布在本报告尝试的目录路径下未定位到（docs 站点 docs.dbgpt.cn 本次未能抓取核实）[6]。**结论：DB-GPT 对金仓/达梦的支持未能核实，不得引用。**
- **评估**：README 无公开基准榜单成绩（其微调资产 DB-GPT-Hub 是独立项目）；评估体系以应用内反馈为主。
- **活跃度与风险**：非常活跃（push 2026-09-14）；19.9k star、MIT、国内社区最大数据应用框架 [6]。
- **对本项目的借鉴点**：其一，**最好的"工程全栈对照物"**：AWEL 显式编排 vs 本项目 LangGraph 图编排可直接对举；其二，"沙箱技能 + 报告产物"与本项目 Artifact 环节同构；其三，多模型管理（含 DashScope/Kimi/MiniMax 等国产模型 API）对国产化路线有直接参考价值；其四，框架功能多 ≠ 可控性强，DB-GPT 二次开发的复杂度恰恰是自研路线的正面论据。

#### 4.2.3 SuperSonic：ChatBI 与语义层双轮 [7]

- **定位与架构**（README 原话）："the next-generation AI+BI platform that unifies Chat BI (powered by LLM) and Headless BI (powered by semantic layer) paradigms"（统一 Chat BI 与 Headless BI 两种范式）——语义模型给 Text2SQL 提供上下文（降低幻觉），Headless BI 则获得自然语言查询 API（降低 SQL 生成复杂度）[7]。
- **核心组件**（即一条完整的语义解析流水线）：Knowledge Base（从语义模型构建字典/索引）→ Schema Mapper（查询文本到指标/维度/实体/值映射）→ Semantic Parser（规则 + LLM 混合解析出语义查询）→ **Semantic Corrector**（规则 + LLM 校验/修复语义查询）→ Semantic Translator（语义查询编译为可执行 SQL）；外围有 Chat Plugin（LLM 选择三方工具）、Chat Memory（召回历史查询轨迹做 few-shot）；Java SPI 扩展 [7]。
- **评估**：README 未提基准；团队称其用于支撑自有真实产品（tencentmusic org 内部使用背书）[7]。
- **活跃度与风险**：活跃（push 2026-09-08）；5,081 star 在同类中偏低，Java 技术栈与本项目 Python 技术栈异构 [7]。
- **对本项目的借鉴点**：其一，**Semantic Corrector 是"AST 闸之外再加一层语义校验"的成熟参照**——SQL 语法正确 ≠ 语义正确（join 错表、过滤漏条件），项目的评估环节可补一个"语义自检"节点；其二，Chat Memory（历史查询轨迹 few-shot）与指纹熔断/模板缓存直接同构，且给出了工程化位置；其三，"规则 + LLM 混合解析"与报告一 [7] "确定性规则验证排在 LLM judge 之前"的官方排序一致。适合作为"成品 ChatBI 长什么样"的演示参照。

#### 4.2.x 平台类三项目速览对比（归纳）

| 维度 | WrenAI [5] | DB-GPT [6] | SuperSonic [7] |
|------|-----------|------------|----------------|
| 核心抽象 | 语义层 MDL + DataFusion 引擎 | AWEL 工作流 + agent/RAG 全栈 | ChatBI + Headless BI 双范式 |
| 技术栈 | Python + Rust 引擎 | Python | Java（SPI 扩展） |
| 语义口径治理 | MDL 声明 models/relations/metrics + instructions | 以数据源/知识库 RAG 为主（README 未见显式语义口径层） | Knowledge Base + Schema Mapper 显式建模 |
| 治理与安全原语 | dry-plan、row limits、结构化报错 | 沙箱执行 | Semantic Corrector（规则+LLM 修复） |
| 公开评估成绩 | 无（golden eval runner 为未来工作） | 无 | 无 |
| license 复杂度 | 多协议（Apache/AGPL/CC-BY 文件共存） | MIT（干净） | Apache-2.0（LICENSE 原文已核对） |
| 选型角色 | 语义层参照 | 工程全栈对照 | 成品 ChatBI 演示 |

### 4c. 数据科学 / 分析 agent 类

#### 4.3.1 PandasAI：转向与放缓的对话式分析 [8]

- **定位与架构**：API 描述现为"Chat with your database or your datalake (SQL, CSV, parquet)"——已从早期"和 DataFrame 对话"转向数据库/数据湖问数，用 LLM + RAG 做对话式数据分析 [8]。
- **活跃度与风险**：23.8k star 极高，但**最后 push 2025-10-28**（缓慢档）；LICENSE 为自定义分叉许可（"Copyright (c) 2023 Sinaptik GmbH. Portions of this software are licensed as follows"），部分功能商业授权 [8]。归纳：高 star + 缓慢维护 + 部分商业化的组合，说明其开源版进入守成状态。
- **对本项目的借鉴点**：演示"对话式分析"交互形态尚可；不建议作为依赖或架构参照，license 亦需谨慎。

#### 4.3.2 Data Interpreter（MetaGPT 团队）：没有独立仓库的数据科学 agent [9]

- **勘误**：候选清单中的 FoundationAgents/Data-Interpreter **不存在**（org 仓库列表 35 个项目中无此仓；GitHub 搜索亦无）[9]。实际位置：MetaGPT 主仓内模块——README 原文给出用法 `from metagpt.roles.di.data_interpreter import DataInterpreter`，示例代码在 `examples/di`，文档在 deepwisdom.ai 的 interpreter 用例页 [9]。
- **定位**：论文《Data Interpreter: An LLM Agent For Data Science》对应的官方实现，以"写代码解决数据科学任务"为核心（规划-写码-执行-调试循环）[9]。
- **活跃度**：MetaGPT 本体 70,383 star（MIT），但 push 停在 2026-01-21（缓慢档），组织重心已移向 OpenManus（58.3k star，push 2026-08-22）[9]。
- **对本项目的借鉴点**：引用时务必写"代码在 MetaGPT 主仓 examples/di"；其"数据分析任务拆成代码节点逐步执行"的思想与本项目"SQL 生成 → 执行 → 自检重试"同源，可作为 agent 侧对照。风险提示：仓库整体放缓，不建议新增依赖。

#### 4.3.3 Microsoft Data Formulator：可视化 agent 的交互范式 [10]

- **定位与架构**（README 原话）："a Microsoft Research project for data exploration with visualizations powered by AI agents"——上传数据（CSV/Excel/JSON/截图/文本）后经 **Data Thread** 会话提问、分支回溯、改图、合成可分享报告 [10]。
- **技术栈**：Flint（微软开源可视化语言，30+ 图表类型）+ DuckDB（大数据量支撑）+ LiteLLM（接 OpenAI/Azure/Ollama/Anthropic）[10]。
- **活跃度与风险**：活跃（push 2026-09-14），17,150 star，MIT [10]。
- **对本项目的借鉴点**：Data Thread 的"分支回溯"是问数产品交互的好素材（值得讨论"改一个问题参数要不要整轮重跑"）；DuckDB 本地承接大数据量 + 只回传图表的做法，是"大结果集不进上下文"（报告一 [9]）的又一实证。

### 4d. SQL 处理与方言工具（AST 闸与国产库适配的关键）

#### 4.4.1 sqlglot：AST 闸的事实标准，但金仓/达梦不在官方方言表 [11]

- **定位**：README 自述"a no-dependency SQL parser, transpiler, optimizer, and engine"（零依赖 SQL 解析器、转译器、优化器与引擎），可在 30+ 方言间转译 [11]。9,613 star、MIT、push 2026-09-14、**open issues 仅 1**——维护质量极高 [11]。
- **方言清单**（README 抓取，共 34 个）：官方 18 个——Athena、BigQuery、ClickHouse、Databricks、DuckDB、Hive、MySQL、Oracle、Presto、Postgres、Redshift、Snowflake、Spark、SQLite、StarRocks、Tableau、Trino、TSQL；社区 14 个——DAX、Doris、Dremio、Drill、Druid、Dune、Exasol、Fabric、Materialize、PRQL、RisingWave、SingleStore、Solr、Teradata；插件 2 个——YDB、MaxCompute [11]。
- **关键核实结论**：**Dameng/DM、Kingbase/KingbaseES、GoldenDB 均不在任何一层清单中** [11]；GitHub 搜索 `kingbase sqlglot`、`dameng sqlglot` 均为 0 结果（2026-09-14 实查）——**未找到可核实的社区方言包**。但 README 明确指出社区/外部方言可通过继承子类或 entry-point 插件包扩展（MaxCompute 即插件示例）[11]。
- **对本项目的借鉴点**（归纳）：AST 闸用 sqlglot 实现没有悬念；金仓走 **Postgres 方言近似**（金仓 PG 兼容度高）、达梦走 **Oracle 方言近似**（达梦以 Oracle 兼容为卖点）是当前最务实路线，但必须叠加"方言差异清单"做二次校验（如分页语法、类型映射、函数名差异），且近似解析只用于**闸前规范化与危险语句拦截**，不能替代真实库试跑/EXPLAIN。方言差异清单适合做成项目已规划的"方言 Skill"（报告一 [8] 渐进披露范式）。

#### 4.4.2 sqlfluff：Lint 层补充 [12]

- **定位**：自述"dialect-flexible and configurable SQL linter"，支持 Jinja 模板与 dbt，可自动修复多数 lint 问题；28 种方言（ANSI、BigQuery、ClickHouse、Databricks、Db2、Doris、DuckDB、Exasol、FlinkSQL、Greenplum、Hive、Impala、MariaDB、Materialize、MySQL、Oracle、PostgreSQL、Redshift、Snowflake、SOQL、SparkSQL、SQLite、StarRocks、Teradata、T-SQL、Trino、Vertica、Athena）[12]。**同样无金仓/达梦**；有 Greenplum（PG 系）可作金仓近似 [12]。9,872 star、MIT、活跃 [12]。
- **对本项目的借鉴点**：可选引入做生成 SQL 的"格式/风格规范化"补充（AST 闸管安全，linter 管风格），非必需。

### 4e. 评估与基准

#### 4.5.1 BIRD：最贴近"企业问数"的主流榜单 [13][14][15]

- **数据集构成**（官网原话）："over 12,751 unique question-SQL pairs, 95 big databases with a total size of 33.4 GB"，覆盖 37 个专业领域；论文为 NeurIPS 2023（arXiv 2305.03111，v1 2023-05-04）[13][15]。
- **最新榜单**（官网抓取，2026-09-14）：榜首 DataGallery-Text2SQL（华为 2012 实验室）Dev 78.10 / Test **82.39**（2026-08-22）；第二 SiriusAI-SQL（腾讯）82.28；第三 AskData + GPT-4o（AT&T CDO-DSAIR）81.95；第四 Agentar-Scale-SQL（蚂蚁）81.67；**人类基线（数据工程师 + DB 学生）92.96**（2026-09-07）[13]。
- **可本地跑的子集**：官方 Mini-Dev（500 题）仓库 bird-bench/mini_dev（185 star，Python，push 2026-09-05，无 license）[13][14]。
- **对本项目的借鉴点**：mini_dev 是"评估集不用自己从零造"的最现成轮子；但**不必以追 BIRD 榜为目标**——榜单头部已是企业级系统级工程（与报告一 [16] 架构判断一致），宜按报告一 [10] "20-50 个真实失败任务起步"自建小评估集，mini_dev 作参考题型。

#### 4.5.2 Spider 2.0：企业级难度的"照妖镜" [16][17]

- **构成**（官网原话）："632 real-world text-to-SQL workflow problems derived from enterprise-level database use cases"；数据库常含 1,000+（乃至 3,000+）列，查询常超 100 行；子集：Snow（547 题，Snowflake 单方言，免费）、DBT（68 题，DuckDB/dbt，免费）、Lite（547 题：BigQuery 214 / Snowflake 198 / SQLite 135）；ICLR 2025 Oral（arXiv 2411.07763）[16][17]。
- **难度与最新榜单**（官网抓取）：发布时"even the advanced LLMs-o1-preview solve only 17.1% of Spider 2.0 tasks"；"the success rate is only 10.1% on Spider 2.0 tasks, compared to 86.6% on Spider 1.0"（GPT-4o 在 Spider 1.0 达 86.6% 而 Spider 2.0 仅 10.1%）[17]。2026-09 现状：Lite 榜首腾讯天穹数据 agent + GLM 5.2 达 **76.23**，Snow 榜首 Genloop Sentinel Agent v2 Pro 达 96.70，DBT 榜首仅 65.6 [17]。
- **对本项目的借鉴点**：Spider 2.0 证明了"真实企业库（超宽表、多方言、BI 工作流）仍是未解决问题"，是论证自研必要性的最佳数据点；其 Snow/DBT 免费子集可用于进阶测试集；"17.1% → 76.23% 的差距主要被工程吃掉"正是"架构重于调参"的论据。

#### 4.5.3 ragas / promptfoo / openai/evals：评估工具三件套 [18][19][20]

- **ragas**：GitHub API 核实已从 explodinggradients 组织**迁移至 vibrantlabsai/ragas**（旧名 301 重定向），15,726 star、Apache-2.0、push 2026-02-24 [18]。RAGAS 三指标的引用不受影响，但安装与 issue 入口要指向新组织。归纳：其重心在 RAG 评估，与数据问数的"结果集比对"评估（报告一 [16]）是互补而非替代关系。
- **promptfoo**：25,095 star、MIT、TypeScript、极活跃（push 2026-09-14）；自述"Test your prompts, agents, and RAGs"，含红队/渗透/漏洞扫描 [19]。对项目价值：断言式回归测试 + 越权/prompt injection 红队用例管理，适合放进 CI 当"持续金丝雀"（呼应报告一 [16] "持续运行的单元测试……生产中的金丝雀"）。
- **openai/evals**：19,449 star，但 push 停在 2026-04-14（缓慢档），license API 未识别 [20]；其官方 Cookbook 教程含 Spider text-to-SQL 示例（报告一 [20]）。了解即可，不建议作为主评估框架。

### 4f. 基础设施短评

- **modelcontextprotocol/servers** [21]：90,316 star；但 README 显示官方参考服务器仅剩 7 个（Everything/Fetch/Filesystem/Git/Memory/Sequential Thinking/Time），**PostgreSQL server 已在 Archived 名单**，原文指向 servers-archived 仓库："Read-only database access with schema inspection"；且官方明示这些是"reference implementations"（参考实现），"not as production-ready solutions"（非生产就绪方案）[21]。**工程含义**：报告一 [2] 所述"首发含 Postgres server"已成历史，如今数据库连接应走 MCP Registry 的正式服务器或自建（呼应报告一 [8] 方言 Skill/工具自建路线）。
- **e2b-dev/E2B** [22]：13,798 star、Apache-2.0、极活跃；自述"run AI-generated code in secure isolated sandboxes in the cloud"；README 未提隔离技术细节（infra 自托管在 e2b-dev/infra，Terraform 部署）；SDK 覆盖 JS/TS 与 Python（含 code-interpreter 与 desktop SDK）[22]。对应项目"大结果集落盘 artifact、只回传预览"的执行层（报告一 [9]）；开发环境用受限本地容器替代亦可。
- **护栏框架**：NVIDIA-NeMo/Guardrails（原 NVIDIA/NeMo-Guardrails，301 迁移核实）7,120 star、活跃（push 2026-09-11）、可编程护栏工具包 [23]；guardrails-ai/guardrails 7,410 star、Apache-2.0、活跃、以 validator 生态做 LLM 输出结构化校验 [24]。归纳：两者都偏"对话/输出层"护栏；本项目的**函数调用护栏（拦危险 SQL）本质是业务规则，手写 Python 函数即最简实现**（报告一 [11] 护栏可实现为函数），框架作扩展阅读。
- **LangChain 官方 SQL agent**：勘误——langchain-ai/sql-agent 不存在；真实存在的官方示例是 **langchain-ai/text-to-sql-agent**（36 star、Jupyter Notebook、push 2026-08-05、无 license）及 sql-support-bot（13 star）[25]。归纳：官方仅以小型 notebook 示例形态存在，远不足以作架构骨架，反而证明自研路线合理。另注：该仓库无 license，引用代码需注意版权。
- **anthropics/skills** [26]：176,264 star（两次 API 核实一致）、push 2026-09-10；**API 未识别到 license 文件**——复用其中技能内容需逐文件查看授权声明。作为"方言 Skill"（金仓/达梦差异 + 校验脚本）的格式参照最合适（报告一 [8]）。
- **附带一笔（text-to-SQL 开源模型）**：defog-ai/sqlcoder（曾 SOTA 的开源 NL2SQL 微调模型系列）4,049 star，**push 停在 2024-05-23，停滞** [27]——开源微调模型路线被通用大模型 + 系统工程路线明显挤压，与 XiYanSQL-QwenCoder（继续发多尺寸模型，[2]）的命运分化值得关注。

---

## 5. 横向对比与选型建议

### 5.0 text-to-SQL 引擎类对比（本项目最直接的"同类项"）

| 项目 | 生成策略 | 质量保障机制 | 公开基准 | 维护状态 | 对本项目的适用判断（归纳） |
|------|---------|-------------|---------|---------|--------------------------|
| Vanna [1] | RAG 检索增强（0.x）→ agent 流水线（2.0 重写） | 用户感知工具 + 行级安全（2.0） | README 无 | **已归档（2026-03-29）** | 只作历史案例参考，不作依赖 |
| XiYan-SQL [2] | ICL（NER 选例）+ SFT 多生成器集成（MGI） | Refiner 修错 + Selection model 优选 | BIRD 75.63%（2024-12 榜首）等 | 常规 | 抄 M-Schema 与"多候选-校验-优选"结构 |
| Dataherald [4] | 企业级 NL2SQL API 引擎 | （README 未见公开基准） | 无 | **停滞（2024-07 起）** | 生命周期反面案例 |
| sqlcoder [27] | 开源微调模型系列（Defog） | 模型本身 | 仓库描述至今仍自称 SoTA（API description 原话，为停滞前的遗留表述） | **停滞（2024-05 起）** | 讲"微调模型路线 vs 工程路线"的兴衰对比 |

### 5.1 按用途分流

| 用途 | 推荐 | 理由 |
|------|------|------|
| 直接引入的依赖 | **sqlglot**（AST 闸）、**promptfoo**（评估 CI + 红队）、**ragas**（检索质量指标）、BIRD mini_dev（评估数据） | 四者均为底座层：维护最好（sqlglot open issues 仅 1；promptfoo/ragas 活跃或常规）、协议干净（MIT/Apache-2.0）、不绑定任何 agent 框架 [11][19][18][14] |
| 可选依赖 | sqlfluff（风格 lint）、E2B 或本地沙箱（artifact 执行）、MCP SDK（连接层） | 均活跃且有官方背书，但非主链路必需 [12][22][21] |
| 抄架构思路 | XiYan-SQL（M-Schema + 多生成器 + Refiner/Selector）、WrenAI（MDL 语义层 + dry-plan/行限/结构化报错）、SuperSonic（Semantic Corrector + Chat Memory）、DB-GPT（沙箱技能 + AWEL 对举） | 四个项目的核心组件可逐一映射到本项目模块（见第 6 节）[2][5][7][6] |
| 成品演示参照 | DB-GPT（工程全栈）、SuperSonic（语义层 ChatBI）、WrenAI（GenBI 引擎）、Data Formulator（可视化 agent） | 覆盖"平台重 → 引擎轻 → 交互新"三种形态，反衬自研 LangGraph 的可控性 [6][7][5][10] |
| 只作案例、不作依赖 | Vanna（归档案例）、Dataherald（停摆案例）、sqlcoder（路线挤压案例）、OpenAI AgentKit（报告一 [15] 关停案例） | 生命周期风险专题四件套 [1][4][27] |

### 5.2 三条路线的横向对比（归纳）

1. **框架绑定路线**（Vanna、PandasAI）：上手最快，但本调研实测四个头部项目两个死两个缓——**把项目命运绑在别人的架构大版本上**（Vanna 2.0 重写即归档）[1][8]。
2. **平台路线**（DB-GPT、SuperSonic、WrenAI）：功能完备、语义层/治理原语先进，但 Java 栈或多协议 license、二开复杂度高；适合"用"与"对标"，不适合自研复刻 [5][6][7]。
3. **底座 + 自研编排路线**（本项目）：sqlglot/promptfoo/BIRD mini_dev/MCP 等底座各自独立演化、互不绑定，LangGraph 图编排代码即资产——与报告一 [15]（OpenAI 关停低代码 Builder、推荐代码优先 SDK）的官方风向一致。

---

## 6. 对本项目的具体落地建议

> 逐条映射项目环节：自然语言问数 → 意图澄清 → Schema Linking → SQL 生成与校验（AST 检查、指纹熔断）→ Artifact 产出 → 评估 → 越权防护 → 金仓/达梦适配。

1. **AST 闸：确定用 sqlglot**。parse（可配 dialect 参数）→ 遍历 AST 只放行 SELECT → 黑名单检查（DDL/DML 关键节点、多语句、注释混淆、危险函数）→ 拒绝时返回"哪条 AST 规则挂了 + 怎么改"的结构化错误（对齐报告一 [5] 可执行错误信息；SuperSonic Semantic Corrector 的"规则 + LLM 双层修复"可作为第二层 [7]）。
2. **金仓/达梦方言策略**：sqlglot/sqlfluff 均无金仓/达梦方言（2026-09-14 实查）[11][12]；采用"金仓 ≈ Postgres 方言、达梦 ≈ Oracle 方言"的近似解析 + 自维护方言差异清单（分页/类型/函数映射），差异清单做成 SKILL.md 格式（参照 anthropics/skills 的技能包结构 [26]；与报告一 [8] 渐进披露一致）。金仓 PG 兼容、达梦 Oracle 兼容是行业通行认知，但**近似方言不能替代真实库试跑**，应保留"EXPLAIN/试执行"终验节点。DB-GPT 等平台的国产库支持未能核实，勿在文档中引用 [6]。
3. **评估集**：以自建"20-50 题 + golden SQL + golden 结果集"为主锚（报告一 [10][16]），BIRD mini_dev（500 题可本地跑）作参考题型 [14]；SQL 文本与执行结果双重比对、拒绝朴素字符串匹配（报告一 [16]，与本调研 BIRD 榜首系统做法一致 [13]）；promptfoo 管断言回归与越权红队用例 [19]；RAGAS 只管检索质量层，且注意组织已迁移（安装/issue 指向 vibrantlabsai/ragas）[18]。
4. **Schema Linking：抄 M-Schema 与 MDL**。用 XiYan 的 M-Schema 半结构化表示法组织库表上下文 [2]，用 WrenAI 的 MDL 思路把"产量/井型/层位"业务口径声明化（对齐报告一 [16] Curated descriptions 层）[5]；DB-GPT 的多源连接与国产模型 API 接入（DashScope 等）可作连接层参考 [6]。
5. **指纹熔断/模板缓存：给足理论背书**。历史 SQL 即检索资产——Vanna 的 RAG 训练三件套 [1]、SuperSonic Chat Memory 的历史轨迹 few-shot [7]、报告一 [6] "stored queries" 三方互证；"命中历史指纹直接改参重跑"的加速效果有三方实证。
6. **Artifact 产出与执行层**：结果集 >N 行落盘 CSV/chart、上下文只回传预览 + 统计摘要——E2B（或受限本地容器）承担执行沙箱 [22]；Data Formulator 的 Data Thread 分支交互可作问数产品形态的讨论素材 [10]（报告一 [9] 提供官方同构论据）。
7. **越权防护**：主护栏手写函数实现（对齐报告一 [11] "护栏可实现为函数"）；扩展设计引入按用户角色裁剪 schema + 行列级权限（报告一 [16][17][18]）；护栏框架（NeMo Guardrails/Guardrails AI）作扩展阅读，注意两者组织/命名均已变动 [23][24]。
8. **演示与风险对照**：现场对比 DB-GPT/SuperSonic/WrenAI 成品效果与自研 LangGraph 版本的可控性/透明度；用 Vanna（归档）、Dataherald（停摆）、sqlcoder（停滞）、AgentKit Builder（报告一 [15] 关停）讲"依赖尽调四查"——star 数、license、**pushed_at**、archived 标志，并演示 ragas/NeMo 的 301 迁移实际案例说明"依赖要 pin 版本 + 关注重定向" [1][4][27][23][18]。

---

## 7. 引用来源汇总（访问/核实日期均为 2026-09-14）

1. vanna-ai/vanna 仓库页与归档横幅（"This repository was archived by the owner on Mar 29, 2026"）；GitHub API（stars 23,814 / MIT / archived / pushed 2026-02-02）；README raw。https://github.com/vanna-ai/vanna 【GitHub API】
2. XGenerationLab/XiYan-SQL README raw 与 GitHub API（stars 1,019 / Apache-2.0 / pushed 2026-05-18；BIRD 75.63% 等成绩为 README 原文记载）。https://github.com/XGenerationLab/XiYan-SQL 【GitHub API】
3. XGenerationLab/xiyan_mcp_server，GitHub API（stars 240 / pushed 2026-02-11）。https://github.com/XGenerationLab/xiyan_mcp_server 【GitHub API】
4. Dataherald 组织仓库列表与 dataherald 仓库详情，GitHub API（stars 3,647 / Apache-2.0 / 最后 push 2024-07-24 / 非 archived）。https://github.com/Dataherald/dataherald 【GitHub API】
5. Canner/WrenAI 仓库页/README（GenBI 定位、MDL、wren-core/DataFusion、治理原语、legacy/v1）与 LICENSE（"WrenAI License Overview"，多协议）；GitHub API（stars 17,633 / pushed 2026-09-14）。https://github.com/Canner/WrenAI 【GitHub API】
6. eosphoros-ai/DB-GPT README raw 与 GitHub API（stars 19,954 / MIT / pushed 2026-09-14；AWEL、Text2SQL、RAG、沙箱技能；全文检索无达梦/金仓）；datasource/rdbms 目录 listing（GitHub API contents 端点）。https://github.com/eosphoros-ai/DB-GPT 【GitHub API】
7. tencentmusic/supersonic README raw（ChatBI+Headless BI 统一、六组件流水线）与 master/LICENSE 原文（Apache-2.0）；GitHub API（stars 5,081 / pushed 2026-09-08）。https://github.com/tencentmusic/supersonic 【GitHub API】
8. sinaptik-ai/pandas-ai GitHub API（stars 23,795 / pushed 2025-10-28）与 LICENSE raw（Sinaptik GmbH 自定义分叉许可）。https://github.com/sinaptik-ai/pandas-ai 【GitHub API】
9. FoundationAgents 组织仓库列表（GitHub API，无 Data-Interpreter 独立仓库；MetaGPT stars 70,383 / MIT / pushed 2026-01-21）与 MetaGPT README raw（Data Interpreter 用法与 examples/di 路径）。https://github.com/FoundationAgents/MetaGPT 【GitHub API】
10. microsoft/data-formulator README raw 与 GitHub API（stars 17,150 / MIT / pushed 2026-09-14；Flint + DuckDB + LiteLLM）。https://github.com/microsoft/data-formulator 【GitHub API】
11. tobymao/sqlglot README raw（34 方言清单、无金仓/达梦、插件扩展机制）与 GitHub API（stars 9,613 / MIT / pushed 2026-09-14 / open issues 1）。https://github.com/tobymao/sqlglot 【GitHub API】
12. sqlfluff/sqlfluff README raw（28 方言清单、无金仓/达梦、含 Greenplum）与 GitHub API（stars 9,872 / MIT / pushed 2026-09-13）。https://github.com/sqlfluff/sqlfluff 【GitHub API】
13. BIRD 基准官网（12,751 题/95 库/33.4GB/37 域；榜单：DataGallery-Text2SQL 82.39 等；人类基线 92.96）。https://bird-bench.github.io/
14. bird-bench/mini_dev，GitHub API（stars 185 / 无 license / pushed 2026-09-05；"Mini-Dev (500)"见 [13] 官网页）。https://github.com/bird-bench/mini_dev 【GitHub API】
15. Li, Jinyang et al., *Can LLM Already Serve as A Database Interface? A BIg Bench for Large-Scale Database Grounded Text-to-SQLs*, NeurIPS 2023, arXiv:2305.03111（v1 2023-05-04；标题/摘要/收录经 arXiv 页面逐字核实）。https://arxiv.org/abs/2305.03111
16. xlang-ai/Spider2，GitHub API（stars 870 / MIT / pushed 2026-08-12；ICLR 2025 Oral）。https://github.com/xlang-ai/Spider2 【GitHub API】
17. Spider 2.0 官网（632 企业任务；o1-preview 17.1%、GPT-4o 10.1% vs Spider 1.0 86.6%；Snow/DBT/Lite 榜单；arXiv 2411.07763）。https://spider2-sql.github.io/
18. vibrantlabsai/ragas（原 explodinggradients/ragas，API 301 重定向跟进核实），GitHub API（stars 15,726 / Apache-2.0 / pushed 2026-02-24）。https://github.com/vibrantlabsai/ragas 【GitHub API】
19. promptfoo/promptfoo，GitHub API（stars 25,095 / MIT / pushed 2026-09-14）。https://github.com/promptfoo/promptfoo 【GitHub API】
20. openai/evals，GitHub API（stars 19,449 / license 未识别 NOASSERTION / pushed 2026-04-14）。https://github.com/openai/evals 【GitHub API】
21. modelcontextprotocol/servers README raw（7 个活跃参考服务器；PostgreSQL 列入 Archived，原文"Read-only database access with schema inspection"；"reference implementations...not as production-ready solutions"）与 GitHub API（stars 90,316）。https://github.com/modelcontextprotocol/servers 【GitHub API】
22. e2b-dev/E2B README raw 与 GitHub API（stars 13,798 / Apache-2.0 / pushed 2026-09-14）。https://github.com/e2b-dev/E2B 【GitHub API】
23. NVIDIA-NeMo/Guardrails（原 NVIDIA/NeMo-Guardrails，API 301 重定向跟进核实），GitHub API（stars 7,120 / pushed 2026-09-11）。https://github.com/NVIDIA-NeMo/Guardrails 【GitHub API】
24. guardrails-ai/guardrails，GitHub API（stars 7,410 / Apache-2.0 / pushed 2026-09-13）。https://github.com/guardrails-ai/guardrails 【GitHub API】
25. langchain-ai/text-to-sql-agent，GitHub API（stars 36 / 无 license / Jupyter Notebook / pushed 2026-08-05；langchain-ai/org 下 sql 相关仓库经 Search API 核实）。https://github.com/langchain-ai/text-to-sql-agent 【GitHub API】
26. anthropics/skills，GitHub API 两次独立核实（stars 176,263→176,264 / license 未识别 / pushed 2026-09-10）。https://github.com/anthropics/skills 【GitHub API】
27. defog-ai/sqlcoder，GitHub API（stars 4,049 / Apache-2.0 / 最后 push 2024-05-23）。https://github.com/defog-ai/sqlcoder 【GitHub API】
28. Dataherald 下落线索（仅线索、不作确证）：Show HN: Dataherald AI（2023-08，news.ycombinator.com/item?id=37240363）；联合创始人动向经搜索摘要获得（LinkedIn，未直接抓取原文）；第三方 Agentic AI Wiki 博客将其列为长期未提交案例。官方关停公告：未能核实。

### 延伸阅读（非论据）

- 未能核实的候选清单条目存档：ModelScope/XiYan-SQL（不存在，实际为 XGenerationLab/XiYan-SQL [2]）；Dataherald/data-herald（不存在，实际为 Dataherald/dataherald [4]）；FoundationAgents/Data-Interpreter（不存在，实现在 MetaGPT 主仓 [9]）；langchain-ai/sql-agent（不存在，实际为 text-to-sql-agent [25]）；alibaba/chat2db 与 chat2db/Chat2DB（均 404，Chat2DB 现址未能核实）。
- 报告一姊妹篇：references/data-agent-research.md（OpenAI × Anthropic 官方文章调研，编号 [1]-[21]）。
