# Data Agent 前沿速览（2025H2～2026-09）：商业产品 / 协议标准 / 安全 / 工程模式 / 评估

> 调研时间：2026-09-14。方法说明：本轮 WebSearch 服务限流，改为**直接 WebFetch 官方文档/论文页**，全部 13 个引用均当日逐字抓取成功，标注 ✅；仅个别延伸线索未核实、显式标注。
> 姊妹篇：报告一 references/data-agent-research.md（OpenAI×Anthropic 官方文章，[1]-[21]）；报告二 references/data-agent-opensource.md（开源项目，[1]-[28]）。本报告为报告三，编号独立 [1]-[13]，交叉引用写"报告一/二 [X]"。

---

## 1. TL;DR

1. **三大商业问数产品（Snowflake Cortex Analyst / Databricks Genie / Microsoft Fabric data agent）已收敛到同一套打法**：语义层承载业务口径 + verified/certified 问答对（既引导生成又当评估集）+ 用户身份权限穿透 + 强制只读 + 治理审计。报告一所载方法论已全部被产品化。
2. **协议层定型**：MCP 最新规范 2026-07-28 版（Tools/Resources/Prompts + Elicitation，扩展 Tasks/Skills-over-MCP/MCP Apps）；A2A 由 Linux Foundation/Agentic AI Foundation 托管，Agent Card 发现、任务协作，与 MCP 明确分工互补；AGENTS.md 成为仓库级 agent 指令事实标准。
3. **安全叙事已成体系**：lethal trifecta（私数据×不可信内容×外发通道）是问数 agent 的风险模型；OpenAI instruction hierarchy（训练层）→ Fabric "intent layers"（产品层）→ CaMeL（系统层，可证明安全）构成三道防线词汇。
4. **工程模式**：deep agents = 同一个循环 + 规划工具/子代理/文件系统/详尽提示词；记忆层走向 ADD-only 提取 + 多信号检索（mem0）；可观测走向 OTel GenAI 语义约定（含 agent span 与 MCP 约定）。
5. **评估前沿**：BIRD-CRITIC（SWE-SQL，NeurIPS 2025）把 text-to-SQL 评估从"生成"推进到"诊断修复"，o1-preview 仅 35.5%、人类专家 ~80%——"执行反馈 + 修复回路"正是问数 agent 的核心工程价值。

---

## 2. 商业产品篇：三家 converged 打法

### 2.1 Snowflake Cortex Analyst [1]

- 定位：托管 LLM 问数服务，REST API 返回 text-to-SQL，"business users ask questions in natural language and receive direct answers without writing SQL"；官方已建议迁移到能力超集 Cortex Agents。
- **语义层**：Semantic Views 作为 schema 级对象，定义逻辑表/维度/事实/**度量（metrics）**/join 关系，"bridge business language and database storage"；官方原话："Cortex Analyst uses Semantic Views to understand your data and generate accurate SQL queries"——因为裸 schema 缺业务定义（如指标公式）。
- **Verified queries 双用**：既是生成引导（"sample questions and their SQL answers that guide query generation"），又是评估集（"running your verified queries against Cortex Analyst and measuring how accurately it generates SQL"）。
- 定位话术：帮企业"accelerate the delivery of high-precision, self-serve conversational analytics"，避免自研 RAG/选型/GPU 的 DIY 成本。

### 2.2 Databricks Genie [2]

- 2026 形态三件套：Genie One（业务用户界面）/ **Genie Agents**（"Domain-specific environments where data teams configure trusted data, metrics, and business rules"）/ Genie Code（开发者助手）。
- 治理总纲："Every answer is grounded in your organization's data and governed through Unity Catalog."
- 质量机制：配置 datasets、sample queries、instructions，加 **verified answers** 提升 "response quality"——与 Snowflake verified queries 同构。

### 2.3 Microsoft Fabric data agent（GA）[3]

- 多源路由：Lakehouse / Warehouse / Power BI 语义模型 / KQL 库 / ontology / Microsoft Graph，按问题选源，分别走 NL2SQL / NL2DAX / NL2KQL；instructions + example queries（每源最多 100 对）引导。
- **权限穿透**：全程用"requesting user's credentials"，"least-privilege access"，RLS/CLS 依旧生效；**强制只读**（"strictly enforces read-only access"）。
- **Intent layers（指令层级的产品化）**：冲突时高层覆盖低层——① Organizational intent（租户策略）② Role-based intent（工作区治理）③ Developer intent（开发者 instructions/examples）④ User intent（用户输入）。
- 治理与运营：Purview DLP/审计/eDiscovery 管住 agent 交互；Git 集成版本化 agent 配置、部署管道晋级；diagnostics 排查选源问题；human-in-the-loop escalation 路径。
- **结果裁剪**：对话输出**上限 25 行 × 25 列**，"designed for conversational insights rather than for returning complete datasets"——商业产品直接替用户决定"大结果不进对话"。

### 2.4 归纳：共同理念（与报告一/二互证）

语义层固化口径（=报告一 [16] Curated descriptions 的产品化）、verified 问答对一鱼两吃（=报告一 [16] golden QA 对 + 报告二 SuperSonic Chat Memory）、权限穿透（=报告一 [16][17] pass-through permissions）、只读红线（=报告二 [18] GPT Action Library）、结果裁剪/artifact（=报告一 [9]）。**结论：这三家产品没有魔法，全是报告一里那套工程纪律的产品化。**

---

## 3. 协议与标准篇

### 3.1 MCP：2026-07-28 版 [4]

- 架构三角色 Host/Client/Server，JSON-RPC 2.0；服务器能力 Resources / Prompts / Tools；客户端能力 **Elicitation**（"Server-initiated requests for additional information from users"——服务端反向向用户要澄清，问数场景的"澄清闸"有了协议原生形态）。
- 三个 opt-in 扩展：**Tasks**（长任务异步执行：轮询、mid-flight input、durable handles——对应断点续传/长跑分析）；**Skills over MCP**（技能经 MCP 发现与消费的工作组）；**MCP Apps**（会话内嵌交互 UI：图表、表单）。
- 安全原则写进规范：工具描述/annotations **视为不可信**（"unless obtained from a trusted server"）；调用任何工具前须用户同意。

### 3.2 A2A：agent 互操作 [5]

- "The A2A protocol is an open standard for communication between AI agents"，Linux Foundation 版权、Apache-2.0，并已宣布加入 Agentic AI Foundation。
- 发现机制 **Agent Card**：客户端先抓 `/.well-known/agent-card` 学能力与端点（含安全方案声明）。
- 核心对象：Message → Task（状态机 Submitted/Working/Completed…）→ **Artifacts**（产出物，流式 TaskArtifactUpdateEvent 推送）。
- 与 MCP 分工（官方原话）："A2A complements MCP"——MCP 连接"模型↔工具/数据"，A2A 让"agent↔agent"直接协作、多轮委托；把 agent 包成 tool 是削足适履，"A2A exposes agents as they are, with no wrapping."

### 3.3 AGENTS.md [6]

- "A simple, open format for guiding coding agents"、"Think of AGENTS.md as a README for agents"；纯 Markdown 无强制结构；由 Linux Foundation 旗下 Agentic AI Foundation 托管；自称 6 万+ 开源项目采用；目录就近覆盖（closest file wins）。
- 对本项目：仓库根目录放一份 AGENTS.md 是零成本对齐信号（写明项目约定与红线规则）。

---

## 4. 安全前沿篇：问数 agent 的风险模型与三道防线

### 4.1 风险模型：lethal trifecta [7]

三要素齐备即高危：① **访问私数据**（"one of the most common purposes of tools in the first place"）② **暴露于不可信内容**（网页/邮件/**文档**）③ **外发通道**。原文判词："LLMs are unable to reliably distinguish the importance of instructions based on where they came from."
**问数/问答平台的特殊性：报告库本身就是"不可信内容"载体——Volve 报告、用户上传的 Excel、注释字段都可以藏指令。三要素天然齐备，必须在架构上拆解。**

### 4.2 防线一（训练/模型层）：Instruction Hierarchy [9]

OpenAI 论文（arXiv 2404.13208）：为冲突指令定义优先级，训练让模型"selectively ignore lower-privileged instructions"；GPT-3.5 上鲁棒性"drastically increases"，常规能力损失极小。产品化对应即 Fabric 的 intent layers [3]（组织>角色>开发者>用户）。

### 4.3 防线二（系统层）：CaMeL [8]

Google Research：不赌模型变强，"creates a protective system layer around the LLM"；显式抽取可信查询的**控制流与数据流**，"untrusted content can never impact the program flow"；以能力（capability）+ 策略在**工具调用边界**执法，阻断私数据外流。AgentDojo 实测：77% 任务可证明安全 vs 无防御 84%——用约 7 个点的可用性换形式化保证。
（细节注：CaMeL 双 LLM 设计——privileged LLM 定控制流、quarantined LLM 只读数据——出自论文正文，本页摘要未列，引用时注意。）

### 4.4 归纳：问数平台的三道防线映射

① 数据进上下文前**标记来源与信任级**（报告库内容=数据非指令）；② 指令按来源分层（系统>开发者>用户>数据），低层不得覆盖高层；③ **工具调用边界执法**（外发类工具对"沾染不可信数据"的会话默认拒绝——我们的执行器错误三分法正好承载）。彻底解法按 Willison：拆掉三角之一——问数场景可拆"外发通道"（默认无外发工具）。

---

## 5. 工程模式篇

### 5.1 Deep agents [10]

LangChain：底层循环不变（"an LLM running in a loop calling tools"），深挖型 agent 靠四件套——① 详尽系统提示词（"Prompting matters still!"）② 规划工具（Claude Code 的 todo 是 no-op，价值在"context engineering strategy to keep the agent on track"）③ 子代理（"context management and prompt shortcuts"）④ **文件系统**（共享工作区 + 外置记忆，Manus 同款）。开源包 `deepagents`（pip 可装，内置 Claude Code 风格提示词、todo 工具、子代理、虚拟文件系统）。
**对问数的启示：探索式分析（非固定链路问数）可以吃这套；但报告一 [4] 的 15× token 成本账仍是闸门——"深挖模式"应是显式的高成本档位。**

### 5.2 记忆层：mem0 为代表 [11]

定位 "Drop-in memory infrastructure for AI agents"；2026-04 算法转向 **ADD-only 单遍提取**（"one LLM call, no UPDATE/DELETE. Memories accumulate; nothing is overwritten"）+ 实体链接 + 多信号检索（语义/BM25/实体并行打分融合）+ 时间推理；README 报 LoCoMo 92.5 / LongMemEval 94.4（注意：为托管平台数字，开源 SDK 不含全部优化；65.3k stars）。
**对问数的启示：用户纠正（老王说"剔除检修井"）是最有价值的记忆；自建轻量"用户口径档案"（YAML + 装配时注入）即可讲透原理，mem0/Zep/Letta 作 landscape 引用。**

### 5.3 可观测：OTel GenAI 语义约定 [12]

官方页已迁移至 open-telemetry/semantic-conventions-genai 独立仓库；主题覆盖 **agent spans**、通用 GenAI spans、metrics、**MCP 约定**、各 provider 约定（OpenAI/Anthropic/Bedrock/Azure）。方向明确：agent 运行轨迹正在被标准化成可互操作的遥测数据。
**对项目的启示：现有内存 span 树是"机制半程"，补一节"映射到 OTel GenAI 属性"即可对齐标准约定（Langfuse 等后端兼容该约定）。**

---

## 6. 评估前沿篇：BIRD-CRITIC [13]

- 定位："the first SQL diagnostic benchmark"（又名 SWE-SQL，NeurIPS 2025）——考"修库"不考"生成"："Can large language models (LLMs) fix user issues in real-world database applications?"
- 构成：600 开发题 + 200 OOD 保留集；Open 变体 570 题覆盖 PostgreSQL/MySQL/SQL Server/Oracle；另有 PG-only 530、Flash 200 等；执行式评估环境。
- 榜单：o1-preview 35.5%、DeepSeek-R1 32.0%、GPT-4o 27.5%；**人类专家无 AI ~78.87-80，带 AI 工具升至 83.33-90**。
- 与报告二 [13][14]（BIRD/mini_dev）连读：BIRD 考"生成准"（榜首 82.39 vs 人类 92.96），BIRD-CRITIC 考"修得好"（SOTA 35.5 vs 人类 80）——**两条榜单共同证明：执行反馈与修复回路的工程化是主战场，本项目反思回边/熔断转人工正是对应这一主战场的设计。**

---

## 7. 热词表（全部有当日核实出处）

| 热词 | 出处 | 一句话 | 项目对照 |
|---|---|---|---|
| Semantic layer / Semantic View | [1][2][3] | 业务口径的声明式载体（metrics/同义词/join） | "我的口径治理等价于 Cortex Analyst 的 Semantic View" |
| Verified queries / answers | [1][2] | 金标问答对，既引导生成又当评估集 | "一鱼两吃，是我评估证据链的主锚" |
| Intent layers / instruction hierarchy | [3][9] | 组织>角色>开发者>用户的指令优先级 | "prompt injection 的第一道防线是分层而不是硬扛" |
| Lethal trifecta | [7] | 私数据×不可信内容×外发通道 = 注入风险模型 | "问数平台三要素天然齐备，我在架构上拆了外发通道" |
| Provable security (CaMeL) | [8] | 控制流/数据流抽取 + 工具边界执法 | "护栏执法点在执行器，不在提示词" |
| MCP Elicitation | [4] | 服务端反向要澄清的协议原语 | "澄清闸的协议原生形态" |
| MCP Tasks | [4] | 长任务异步：轮询/中途输入/durable handles | "断点续传的协议级对应物" |
| Agent Card (A2A) | [5] | agent 能力发现文档 | "一核三接口：REST/MCP/A2A" |
| Deep agents | [10] | 循环+规划/子代理/文件系统/详尽提示词 | "探索式问数的高成本档位，用成本账决定开关" |
| ADD-only memory | [11] | 只追加不改写的记忆提取 | "用户口径档案的设计取舍" |
| OTel GenAI semconv | [12] | agent 遥测标准化 | "span 树可映射标准属性，Langfuse 可视" |
| SQL 诊断修复 (BIRD-CRITIC) | [13] | 从"生成准"到"修得好"的评估转向 | "我的反思回边正是榜单证明的主战场" |

延伸线索（未核实，仅名词）：tau-bench/tau2（agent 轨迹评估）、Zep/Letta（时序记忆）、MCP Registry。

---

## 8. 对本项目的启示（12 条）

1. 语义层是最值得补的一块：三家产品全部以语义模型为中心，项目已有"选表+指纹熔断"，加一个 YAML 语义模块即可对齐。
2. verified queries 双用直接抄：自建 golden 问答对同时当 few-shot 引导与评估集。
3. Fabric 的 intent layers 是 instruction hierarchy 的产品化对照，越权防护可增加"四层意图"分层设计。
4. lethal trifecta 给问数平台定性：报告库/上传文件=不可信内容，默认拆掉外发通道。
5. 沙箱代码执行升级问数能力：从"查数"到"算数+画图"，大结果落盘 artifact。
6. MCP Elicitation 对应澄清闸、Tasks 对应断点续传——现有机制全部有协议级对应物。
7. 把问数 agent 包成 MCP server + 发一张 A2A Agent Card，是低成本高价值的升级。
8. BIRD-CRITIC 补评估第三层：生成准（golden 结果集）/ 检索好（RAGAS）/ 修得好（故障注入题）。
9. sqlglot 方言闸 + 方言 SKILL.md（报告二结论 + 报告一 [8]）落在国产化适配路线上。
10. 记忆做轻量自建"用户口径档案"，mem0 的 ADD-only 原则照抄。
11. 可观测补 OTel GenAI 属性映射表，内存 span 树升格为标准属性映射。
12. AGENTS.md 放仓库根目录，把项目约定写明、对 agent 友好。

---

## 9. 引用来源汇总（访问日期均为 2026-09-14，全部逐字抓取 ✅）

1. Snowflake Docs, *Cortex Analyst*. https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-analyst ✅
2. Databricks Docs, *Genie*. https://docs.databricks.com/aws/en/genie/index.html ✅
3. Microsoft Learn, *Fabric data agent creation*（ms.date 2026-05-11，updated 2026-09-09）. https://learn.microsoft.com/en-us/fabric/data-science/concept-data-agent ✅
4. MCP Specification（schema 2026-07-28）. https://modelcontextprotocol.io/specification/latest ✅
5. A2A Protocol, *What is A2A*. https://a2a-protocol.org/latest/topics/what-is-a2a/ ✅
6. AGENTS.md 官网. https://agents.md ✅
7. Willison, S., *The lethal trifecta*, 2025-06-16. https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/ ✅
8. Debenedetti et al. (Google Research), *CaMeL*, arXiv:2503.18813. https://arxiv.org/abs/2503.18813 ✅
9. Wallace et al. (OpenAI), *The Instruction Hierarchy*, arXiv:2404.13208. https://arxiv.org/abs/2404.13208 ✅
10. LangChain Blog, *Deep Agents*. https://www.langchain.com/blog/deep-agents ✅
11. mem0ai/mem0 README（含 2026-04 算法说明与基准表，65.3k stars 为 README 自述）. https://github.com/mem0ai/mem0 ✅
12. OpenTelemetry, *GenAI semantic conventions*（迁移声明）. https://opentelemetry.io/docs/specs/semconv/gen-ai/ ✅
13. BIRD-CRITIC / SWE-SQL 官网. https://bird-critic.github.io/ ✅
