# OpenAI × Anthropic 官方一手文章调研：Data Agent（数据智能体）

> 调研时间：2026-09-14。方法：WebSearch（site 限定官方域名）+ 逐篇 WebFetch 抓取官方原文。
> 引用纪律：全部论据来自两家的官方域名（openai.com / cdn.openai.com / developers.openai.com / anthropic.com / claude.com / docs 域名），编号引用见第 8 节；仅经搜索摘要核实、未能逐字抓取原文的条目均已显式标注。官方"原文金句"给出英文原文 + 中文翻译；"归纳："开头的内容为本报告作者的观点综合，非官方原话。

---

## 1. TL;DR

1. **Anthropic 的立场**：没有发布过一篇"数据智能体"专题文章，而是给出一套**通用 agent 工程方法论**——workflow 优先、agent 是"LLM 在循环中使用工具"、上下文是稀缺资源、工具即接口（ACI）、评估分三类 grader；数据智能体所需的每块积木（analysis tool、code execution、MCP、evals、Skills）都单独成文。
2. **OpenAI 的立场**：**亲自下场做并产品化数据智能体**——公开内部数据智能体的完整架构（六层上下文、golden SQL 评估、权限穿透），并推出面向企业的 Data agent in ChatGPT；方法论侧有官方 PDF 指南和分阶段 SQL 工作流 Cookbook。
3. 两家共识惊人一致：**先问"要不要用 agent"，单 agent 优先，护栏全程伴随，评估先行**。
4. 2026 年重要信号：OpenAI 于 2026-06-03 宣布关停低代码 Agent Builder/Evals 产品（2026-11-30 生效），转向 Agents SDK（代码优先）——印证"用 LangGraph 写代码编排"的路线比绑低代码平台更持久。
5. 最重要的三篇：OpenAI《Inside our in-house data agent》(2026-01-29)、Anthropic《Building effective agents》(2024-12-19)、Anthropic《Demystifying evals for AI agents》(2026-01-09)。

---

## 2. 调研方法与范围

### 2.1 检索记录（实际使用的查询）

| # | 查询 | 限定域名 | 产出 |
|---|------|---------|------|
| 1 | `site:anthropic.com/engineering agents` | anthropic.com | Anthropic 工程博客 agent 系列全清单 |
| 2 | `text-to-SQL data analysis agent` | openai.com 等官方域（限定未生效，改用后续查询） | 第三方为主，弃用 |
| 3 | `site:openai.com "a practical guide to building agents"` | openai.com | 官方指南落地页 + cdn PDF 直链 |
| 4 | `site:openai.com AgentKit Agent Builder Connector Registry` | openai.com | AgentKit 公告页 |
| 5 | `site:cookbook.openai.com SQL agent data analysis orchestration` | cookbook.openai.com | 0 结果；发现 Cookbook 已迁移至 developers.openai.com/cookbook |
| 6 | `site:anthropic.com Claude data analysis analysis tool news` | anthropic.com | analysis tool 公告（claude.com/blog/analysis-tool） |
| 7 | `"inside our in-house data agent" openai published` | — | OpenAI 内部数据智能体文（2026-01-29）+ 配套产品公告 put-data-to-work |
| 8 | `openai "new tools for building agents" March 2025 / "Introducing ChatGPT agent" July 2025 / AgentKit October 2025 launch dates` | — | 三篇公告的确切发布日期核实 |
| 9 | `openai "introducing deep research" February 2025` | — | deep research 公告（2025-02-02） |
| 10 | `openai "now everyone can put data to work" data agent ChatGPT connectors permissions` | — | Data agent 权限模型关键句 |

### 2.2 收录标准

- **一手来源**：仅 openai.com、cdn.openai.com、developers.openai.com（官方 Cookbook）、anthropic.com、claude.com（Anthropic 官方博客新域名，原 anthropic.com/engineering 部分 301/308 迁移至此）、docs.claude.com 系。
- **相关性**：与"数据分析 / text-to-SQL / BI 问数 / 数据管道 agent"直接相关，或为构建该类 agent 的方法论支柱（编排、工具、上下文、评估、安全）。
- **时效**：以 2024-10 ～ 2026-09 为主（都在两到三年窗口内）。
- **精读 vs 列名**：能抓到原文全文的进入第 4/5 节精读；仅经搜索摘要核实的在清单表中标注"未逐字抓取"。
- 未能打开的页面（openai.com 部分页面返回 403）如实标注，不编造。

---

## 3. 文章清单表

### Anthropic（10 篇精读）

| 标题 | 日期 | URL | 一句话定位 |
|------|------|-----|-----------|
| Introducing the analysis tool in Claude.ai | 2024-10-24 | https://claude.com/blog/analysis-tool | Claude 内置 JS 沙箱做"数学上精确"的数据分析，2025-11 起被更强 code execution 取代 [3] |
| Introducing the Model Context Protocol | 2024-11-25 | https://www.anthropic.com/news/model-context-protocol | 数据源连接开放协议的出生证明，首发即含 Postgres server [2] |
| Building effective agents | 2024-12-19 | https://www.anthropic.com/engineering/building-effective-agents | workflow vs agent 定义 + 五种编排模式 + "能用简单方案就别用 agent" [1] |
| How we built our multi-agent research system | 2025-06-13 | https://www.anthropic.com/engineering/multi-agent-research-system | orchestrator-worker 实战 + LLM-as-judge 评估 + token 成本账（多智能体 ≈ 15× 聊天）[4] |
| Writing effective tools for agents — with agents | 2025-09-11 | https://www.anthropic.com/engineering/writing-tools-for-agents | 用 agent 造工具：命名、防御性报错、token 效率、工具合并 [5] |
| Effective context engineering for AI agents | 2025-09-29 | https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents | 上下文是稀缺资源；just-in-time 检索 / compaction / 结构化笔记 [6] |
| Building agents with the Claude Agent SDK | 2025-09-29 | https://claude.com/blog/building-agents-with-the-claude-agent-sdk | "给 agent 一台计算机"；gather context → take action → verify work 循环 [7] |
| Equipping agents for the real world with Agent Skills | 2025-10-16 | https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills | SKILL.md 技能包 + 渐进披露 + "用代码做确定性计算" [8] |
| Code execution with MCP | 2025-11-04 | https://www.anthropic.com/engineering/code-execution-with-mcp | 以代码 API 呈现 MCP 工具，免把全部工具定义载入上下文：150k→2k token，中间结果不出沙箱 [9] |
| Demystifying evals for AI agents | 2026-01-09 | https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents | 三类 grader、outcome vs trajectory、20-50 任务起步的评估方法论 [10] |

### OpenAI（11 篇，9 篇精读）

| 标题 | 日期 | URL | 一句话定位 |
|------|------|-----|-----------|
| Introducing deep research | 2025-02-02 | https://openai.com/index/introducing-deep-research/ | o3 系推理模型优化"网页浏览与数据分析"的长程 agent（未逐字抓取原文，摘要核实）[13] |
| New tools for building agents | 2025-03-11 | https://openai.com/index/new-tools-for-building-agents/ | Responses API + 内置搜索/文件/计算机工具 + 开源 Agents SDK（编排/护栏/观测）[12] |
| A practical guide to building agents（PDF） | 2025（页面未标具体日期） | https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf | 官方 agent 入门指南：定义、三组件、单/多 agent、护栏、人机介入 [11] |
| Introducing ChatGPT agent | 2025-07-17 | https://openai.com/index/introducing-chatgpt-agent/ | 通用 agent：虚拟计算机上"边想边做"，含 prompt injection 防护与确认机制 [14] |
| Introducing AgentKit | 2025-10-06 | https://openai.com/index/introducing-agentkit/ | Agent Builder / ChatKit / Evals / Connector Registry；2026-06-03 官方宣布关停 Builder/Evals 转向 Agents SDK [15] |
| Inside our in-house data agent | 2026-01-29 | https://openai.com/index/inside-our-in-house-data-agent/ | **与本课题最相关**：OpenAI 内部数据智能体完整架构（六层上下文、golden SQL、权限穿透）[16] |
| Now everyone can put data to work | 2026（具体日期未核实） | https://openai.com/index/put-data-to-work/ | 产品化 Data agent in ChatGPT Work；行列级权限穿透（403，未逐字抓取，摘要核实）[17] |
| GPT Action Library: SQL Database（Cookbook） | 页面未标日期 | https://developers.openai.com/cookbook/examples/chatgpt/gpt_actions_library/gpt_action_sql_database | ChatGPT 连 SQL 库的官方范式：只读中间件 + 按用户动态出 schema [18] |
| SchemaFlow（Cookbook） | 页面未标日期 | https://developers.openai.com/cookbook/examples/partners/schemaflow_design_guide/schemaflow_cookbook | 分阶段 SQL 工作流 + 阶段间确定性校验 + artifact + eval [19] |
| Getting Started with OpenAI Evals（Cookbook） | 未抓取 | https://developers.openai.com/cookbook/examples/evaluation/getting_started_with_openai_evals | 官方评估框架入门，含 Spider text-to-SQL 测试集示例（仅搜索摘要核实）[20] |
| Orchestrating Agents: Routines and Handoffs（Cookbook） | 未抓取 | https://developers.openai.com/cookbook/examples/orchestrating_agents | routines/handoffs 编排模式（仅搜索摘要核实）[21] |

> 延伸阅读（官方但未精读，或第三方仅一句带过，不作论据）：Anthropic《Scaling Managed Agents》（https://www.anthropic.com/engineering/managed-agents）；OpenAI《Introducing workspace agents in ChatGPT》（https://openai.com/index/introducing-workspace-agents-in-chatgpt/）；第三方对 OpenAI 内部数据智能体的解读（ByteByteGo、InfoQ 关于"Anthropic 内部 95% 分析由 Claude 处理"的转述）。

---

## 4. Anthropic 逐篇精读笔记

### 4.1 Building effective agents（2024-12-19）[1]

**核心论点：**

1. **workflow 与 agent 是两类系统**：workflows 是"systems where LLMs and tools are orchestrated through predefined code paths"（LLM 和工具通过预定义代码路径编排的系统）；agents 是"systems where LLMs dynamically direct their own processes and tool usage"（LLM 动态主导自身流程与工具使用的系统），并保持对完成任务方式的控制权。
2. **五种 workflow 模式 + 自主 agent**：prompt chaining（可插入程序化"闸门"检查）、routing（分类分流）、parallelization（sectioning / voting）、orchestrator-workers、evaluator-optimizer；自主 agent"typically just LLMs using tools based on environmental feedback in a loop"（通常就是 LLM 在循环中基于环境反馈使用工具）。
3. **能用简单方案就别用 agent**："We recommend finding the simplest solution possible, and only increasing complexity when needed."（我们建议寻找尽可能简单的方案，只在需要时才增加复杂性。）；"Agentic systems often trade latency and cost for better task performance."（agentic 系统常以延迟和成本换取更好的任务表现。）对许多应用，"optimizing single LLM calls with retrieval and in-context examples is usually enough"（用检索和上下文示例优化单次 LLM 调用通常就足够了）。
4. **工具即接口（ACI）**："Carefully craft your agent-computer interface (ACI) through thorough tool documentation and testing."；要"Poka-yoke your tools"（像防呆设计一样塑造工具参数，让错误更难发生——改为绝对文件路径即修复了 SWE-bench 上的错误）；团队"actually spent more time optimizing our tools than the overall prompt"（实际花在优化工具上的时间比整体 prompt 还多）。
5. **护栏与测试**：agent 需要"extensive testing in sandboxed environments, along with the appropriate guardrails"（在沙箱环境中大量测试并配备适当护栏），并设迭代上限等停止条件；"Start with simple prompts, optimize them with comprehensive evaluation"（从简单 prompt 开始，用全面评估来优化）。
6. 页面现有一则更新说明：自 2024-12 发布以来工具生态已变化，指向 Claude Managed Agents——引用时注意部分表述已被官方"时间戳化"。

**与 data agent 的关联（归纳）**：NL→SQL 流水线的大多数环节（意图分类→schema 选择→SQL 生成→校验→产出）本质是 prompt chaining + routing + evaluator-optimizer 的 workflow 组合，只有"探索式查数"才需要自主循环——这正是本项目用 LangGraph 显式编图而非放任循环的依据。

**金句**：
> "We recommend finding the simplest solution possible, and only increasing complexity when needed."
> （我们建议寻找尽可能简单的方案，只在需要时才增加复杂性。）

---

### 4.2 Introducing the Model Context Protocol（2024-11-25）[2]

**核心论点：**

1. MCP 是"a new standard for connecting AI assistants to the systems where data lives"（连接 AI 助手与数据所在系统的开放标准），覆盖内容仓库、业务工具与开发环境。
2. 痛点定义：先进模型仍"trapped behind information silos and legacy systems"（被困在信息孤岛和遗留系统之后）；"Every new data source requires its own custom implementation, making truly connected systems difficult to scale."（每个新数据源都要求各自的定制实现，使真正互联的系统难以规模化。）
3. 架构：数据方暴露 MCP server，AI 应用作为 MCP client 连接；首发组件含规范与 SDK、Claude Desktop 本地 MCP 支持、开源 server 仓库；**预置 server 即包含 Google Drive、Slack、GitHub、Git、Postgres、Puppeteer**。
4. 早期采用者：Block、Apollo，以及 Zed、Replit、Codeium、Sourcegraph 等工具厂商。

**与 data agent 的关联（归纳）**：数据库连接层的协议化是官方背书的方向；项目"国产化数据库适配"环节可以表述为"为金仓/达梦实现 MCP server（或在 LangGraph 侧等价实现工具层）"，Postgres 首发即有官方 server，金仓 PG 兼容性是天然切入点。

---

### 4.3 Introducing the analysis tool in Claude.ai（2024-10-24）[3]

**核心论点：**

1. 内置"a built-in code sandbox"（内置代码沙箱），Claude 可写并运行 JavaScript，实现"precise data analysis and real-time insights with mathematically accurate results"（数学上精确的数据分析与实时洞察）。
2. 定位转变："When you need precise, verifiable answers from data, Claude now works more like a real data analyst."（当你需要来自数据的精确、可验证的答案时，Claude 现在更像一名真正的数据分析师。）分析过程是"cleaning, exploring, and analyzing it step-by-step"（逐步清洗、探索、分析），答案"not just well-reasoned, but are mathematically precise and reproducible"（不仅有理有据，而且数学精确、可复现）。
3. 场景清单：财务月度数据→财务看板；全球销售数据→分国别表现分析；营销全漏斗数据→转化机会；服务器性能日志→资源利用率。
4. **2025-11-05 更新**：analysis tool "is being replaced by more powerful code execution capabilities"（正被更强大的代码执行能力取代），代码执行可"generate downloadable files (spreadsheets, CSVs, reports), create visualizations"（生成可下载文件：表格/CSV/报告，并创建可视化）。

**与 data agent 的关联（归纳）**：官方把"可复现的代码计算 + 可下载的产物文件"视为数据问答可信度的关键——对应本项目的 Artifact 产出环节（结果表、图表、CSV 落盘）。

---

### 4.4 How we built our multi-agent research system（2025-06-13）[4]

**核心论点：**

1. **架构**："Our Research system uses a multi-agent architecture with an orchestrator-worker pattern"——LeadResearcher 编排、子 agent 并行、CitationAgent 收尾；计划写入 Memory，因为"context window exceeds 200,000 tokens it will be truncated"（上下文超 20 万 token 会被截断）。
2. **收益与代价**：多智能体（Opus 主导 + Sonnet 子代理）在内部评估上"outperformed single-agent Claude Opus 4 by 90.2%"；并行化"cut research time by up to 90%"。但代价明确："agents typically use about 4× more tokens than chat interactions"（agent 约用 4 倍于聊天的 token），"multi-agent systems use about 15× more tokens than chats"（多智能体约 15 倍）；"token usage by itself explains 80% of the variance"（仅 token 用量就解释了 80% 的性能差异）。
3. **评估方法论**：agent 会走不同但都有效的路径，所以要"flexible evaluation methods that judge whether agents achieved the right outcomes"（判断是否达成正确结果的灵活评估）；"Start evaluating immediately with small samples"（约 20 条真实查询即可起步）；LLM judge 按多维 rubric 打分——"factual accuracy (do claims match sources?)", "citation accuracy (do the cited sources match the claims?)"（事实准确性/引用准确性/完整性/来源质量/工具效率）；一致性最好的是"a single LLM call with a single prompt outputting scores from 0.0-1.0"（单次 LLM 调用、单 prompt、0.0-1.0 打分）；"Human evaluation catches what automation misses"（人工评估能抓住自动化漏掉的东西——如测试者发现 agent 偏爱 SEO 内容农场而轻视学术 PDF）。
4. **工程可靠性**："Agents are stateful and errors compound"（agent 有状态，错误会复合）——系统应从检查点恢复而非整体重启；"letting the agent know when a tool is failing and letting it adapt works surprisingly well"（让 agent 知道工具失败了并自行调整，效果出奇地好）；部署用"rainbow deployments"（彩虹部署）灰度切流；同步等待是瓶颈。
5. **自改进**：让一个工具测试 agent 重写有缺陷的工具描述，"a 40% decrease in task completion time"（任务完成时间下降 40%）。

**与 data agent 的关联（归纳）**：a) 多智能体的 token 成本账是"要不要拆多 agent"的定量依据；b) 断点续传/检查点恢复直接对应项目的失败重试设计；c) "引用准确性"rubric 可平移为"答案-数据一致性"评估维度。

---

### 4.5 Writing effective tools for agents — with agents（2025-09-11）[5]

**核心论点：**

1. **流程**：原型（MCP server / DXT 包装）→ 建 eval（每个 prompt 要有"a verifiable response or outcome"）→ 跑 eval（while 循环 + 指标：accuracy、runtime、tool-call 次数、token、错误）→ 读 transcripts 分析 → 让 Claude 批量重构工具，用 held-out 测试集防过拟合。
2. **命名与语义**："Namespacing (grouping related tools under common prefixes) can help delineate boundaries between lots of tools"（命名空间即公共前缀分组）；参数要无歧义："instead of a parameter named user, try a parameter named user_id"；描述工具要"think of how you would describe your tool to a new hire on your team"（像给新同事介绍工具一样写描述）。
3. **防御性报错**："you can prompt-engineer your error responses to clearly communicate specific and actionable improvements"（把错误响应 prompt 工程化，清楚传达具体可执行的改进建议），而非不透明的错误码或堆栈；截断提示要引导 agent 用过滤/分页。
4. **token 效率与工具合并**：实现"pagination, range selection, filtering, and/or truncation"（分页/范围/过滤/截断）组合；Claude Code 默认把工具响应限制在 25,000 token；合并工具——"Instead of implementing a read_logs tool, consider implementing a search_logs tool"（与其实现 read_logs，不如实现 search_logs）。
5. **真实案例**：web search 工具曾"Claude was needlessly appending 2025 to the tool's query parameter"（Claude 不必要地在查询参数后附加 2025）——改工具描述即修复；对工具描述做精细打磨后，Claude Sonnet 3.5 在 SWE-bench Verified 达到 SOTA；把 UUID 解析为语义化名称"significantly improved retrieval precision and reduced hallucinations"（显著提升检索精度并减少幻觉）。

**与 data agent 的关联（归纳）**：SQL 校验护栏的报错信息应当"可执行"（指出哪条 AST 规则挂了、建议怎么改），而不是抛异常；`run_sql` vs `search_schema` 的工具粒度设计直接照此办理。

---

### 4.6 Effective context engineering for AI agents（2025-09-29）[6]

**核心论点：**

1. **定义**：context engineering 是"strategies for curating and maintaining the optimal set of tokens (information) during LLM inference"（在 LLM 推理期间策展并维护最优 token 集合的策略），是 prompt engineering 的"natural progression"（自然演进）。
2. **attention budget / context rot**：随 token 增多，"the model's ability to accurately recall information from that context decreases"（模型从上下文中准确回忆信息的能力下降），上下文"must be treated as a finite resource with diminishing marginal returns"（必须当作边际收益递减的有限资源）；目标是"smallest possible set of high-signal tokens"（可能范围内最小的高信号 token 集）。
3. **工具与示例**：工具要"self-contained, robust to error, and extremely clear with respect to their intended use"；工具集膨胀的判据——"If a human engineer can't definitively say which tool should be used in a given situation, an AI agent can't do better either."（如果人类工程师都无法确定该用哪个工具，AI agent 也好不到哪去。）
4. **长时程四技术**：just-in-time 检索（只保留"lightweight identifiers (file paths, stored queries, web links, etc.)"轻量标识符，运行时再加载）、compaction（接近窗口上限时用摘要重开对话）、structured note-taking（把笔记固化到上下文窗口之外的持久记忆）、sub-agent 架构（子 agent 各自干净上下文，只回传"condensed, distilled summary"压缩摘要）。
5. agent 的极简定义："LLMs autonomously using tools in a loop."（在循环中自主使用工具的 LLM。）总原则："do the simplest thing that works"（用能奏效的最简方案）。

**与 data agent 的关联（归纳）**：Schema Linking 就是数据版的 just-in-time 检索——先给 agent 表名/注释等轻量标识符，命中后再拉全 DDL，而不是把整个库的 schema 塞进上下文。"stored queries"（存储的查询）被官方点名为一种轻量标识符——项目的"指纹熔断/SQL 模板缓存"有官方同构表述。

---

### 4.7 Building agents with the Claude Agent SDK（2025-09-29）[7]

**核心论点：**

1. 设计原则："The key design principle behind the Claude Agent SDK is to give your agents a computer"（给 agent 一台计算机）。
2. 默认循环："gather context -> take action -> verify work -> repeat"（收集上下文→行动→验证工作→重复）。
3. **验证工作三法**："Defining rules"（定义规则，如 lint）、"Visual feedback"（视觉反馈，截图）、"LLM as a judge"——并明确标注 LLM judge "generally not a very robust method"（通常不是非常稳健的方法）且有延迟代价。
4. 积木：工具是"the primary building blocks of execution"（执行的首要积木）且占据上下文显著位置；subagents 默认支持（隔离上下文、只回传相关信息）；compaction 自动摘要；MCP"provides standardized integrations to external services, handling authentication and API calls automatically"（标准化外部服务集成并自动处理鉴权）。
5. 场景示例点名 finance agents（"portfolio analysis, running calculations"）；改进路径：检查失败→问"has the right tools for the job"（是否有合适工具）→"build a representative test set for programmatic evaluations"（为程序化评估建代表性测试集）。

**与 data agent 的关联（归纳）**：官方把"确定性规则验证"排在 LLM judge 之前——项目的 AST 检查/指纹熔断（规则层）应作为主验证，LLM Judge 只做补充层。

---

### 4.8 Equipping agents for the real world with Agent Skills（2025-10-16）[8]

**核心论点：**

1. Skill 定义："organized folders of instructions, scripts, and resources that agents can discover and load dynamically"（指令、脚本与资源的文件夹，agent 可发现并动态加载）；最小形态是含 YAML frontmatter（name + description）的 SKILL.md；写 skill 像"putting together an onboarding guide for a new hire"（给新员工写入职指南）。
2. **渐进披露**："Progressive disclosure is the core design principle that makes Agent Skills flexible and scalable."（渐进披露是让技能灵活可扩展的核心设计原则。）启动只载入 name/description，用到才读全文；因此"the amount of context that can be bundled into a skill is effectively unbounded"（技能可捆绑的上下文量实际上不受限）。
3. **代码执行**："Skills can also include code for Claude to execute as tools at its discretion."（技能可包含代码供 Claude 酌情作为工具执行。）理由："sorting a list via token generation is far more expensive than simply running a sorting algorithm"（用 token 生成排序列表远比直接跑排序算法贵），且"many applications require the deterministic reliability that only code can provide"（许多应用需要只有代码才能提供的确定性可靠性）。
4. 案例：PDF skill 内置"pre-written Python script that reads a PDF and extracts all form fields"（预写好的 Python 脚本读取 PDF 并抽取全部表单字段），"Claude can run this script without loading either the script or the PDF into context"（不把脚本或 PDF 载入上下文即可运行）。2025-12-18 更新：Agent Skills 已发布为开放标准。

**与 data agent 的关联（归纳）**：金仓/达梦方言适配可做成"方言 Skill"：SKILL.md 讲方言差异（如 `LIMIT`/分页语法、类型映射），附确定性校验脚本——比把方言规则写进系统提示更可扩展。

---

### 4.9 Code execution with MCP（2025-11-04）[9]

**核心论点：**

1. **问题**：多数 MCP client 把所有工具定义预先载入上下文、所有中间结果都过模型一遍，context 成本高企。
2. **核心数字**：把 MCP server 呈现为代码 API 后，"This reduces the token usage from 150,000 tokens to 2,000 tokens—a time and cost saving of 98.7%."（token 用量从 15 万降到 2 千——节省 98.7%。）
3. **数据分析实例**：取 1 万行表格时，不写代码则"returns 10,000 rows in context to filter manually"（1 万行进上下文手动过滤）；写代码则在沙箱内过滤后只回传预览——"The agent sees five rows instead of 10,000."（agent 看到 5 行而不是 1 万行。）适用于"aggregations, joins across multiple data sources, or extracting specific fields"（聚合、跨源 join、字段抽取）。
4. **隐私与状态**："intermediate results stay in the execution environment by default"（中间结果默认留在执行环境）；可自动将 PII 令牌化，出站调用时在 MCP client 侧还原；agent 可把中间结果写文件以便续作、把可用代码沉淀为 SKILL.md。
5. **代价**："Running agent-generated code requires a secure execution environment"（运行 agent 生成的代码需要安全执行环境：沙箱、资源限制、监控）。

**与 data agent 的关联（归纳）**：这是"大数据量问数不爆上下文"的官方答案——查数 agent 应把大结果集落盘为 artifact 并只回传预览/摘要；对石油行业数据（商业敏感、可能涉密）"中间结果不出执行环境"尤其契合。

---

### 4.10 Demystifying evals for AI agents（2026-01-09）[10]

**核心论点：**

1. **三类 grader**：code-based（字符串匹配、静态分析、状态/工具调用校验——"fast, cheap, objective, reproducible"，但对合法变体脆弱）、model-based（rubric 打分、自然语言断言、成对比较、多 judge 共识——"Captures nuance; Handles open-ended tasks"，但非确定、贵、需人工校准）、human（"Gold standard quality"，贵且慢）。选型口诀："deterministic graders where possible, LLM graders where necessary, human graders judiciously"（能用确定性就用确定性，必要时用 LLM，审慎用人工）。
2. **outcome vs trajectory**："Each grader evaluates some portion of either the transcript or the outcome."；outcome 的例子正是数据库——航班 agent 自称订票成功，真正要查的是"a reservation exists in the SQL database"（SQL 数据库里是否真有预订记录）。但别过度约束路径："it's often better to grade what the agent produced, not the path it took"（更好的做法是评估 agent 产出了什么，而非它走了什么路径）；多组件任务要"build in partial credit"（内置部分得分）。
3. **评估集建设**："20-50 simple tasks drawn from real failures is a great start"（从真实失败中抽取 20-50 个简单任务即是好开端）；好任务的标准是"two domain experts would independently reach the same pass/fail verdict"（两位领域专家独立得出相同 pass/fail 结论）；必须带参考解法；"One-sided evals create one-sided optimization"（单边评估造成单边优化——既要测"该检索时检索"，也要测"不该检索时别检索"）；每次 trial 用干净环境隔离状态。
4. **失败分析**："Reading transcripts is how you verify that your eval is measuring what actually matters."（读 transcripts 才能验证评估在测量真正重要的东西。）分数极低时"most often a signal of a broken task, not an incapable agent"（分数极低多半说明任务本身设定有问题，而非 agent 无能——文中例子：Opus 4.5 在 CORE-Bench 上仅因修正评分方式就从 42% 涨到 95%）；给 LLM judge 提供"Unknown"逃生选项并对照人类专家校准。

**与 data agent 的关联（归纳）**：几乎逐条对应项目评估环节——RAGAS 类指标是 model-based grader，AST/指纹是 code-based grader，专家抽检是 human grader；"查询数据库终态做 outcome 校验"正是 NL2SQL 评估的正确姿势（对比结果集而非只看 SQL 文本）。

---

## 5. OpenAI 逐篇精读笔记

### 5.1 A practical guide to building agents（官方 PDF，2025 年发布）[11]

**核心论点：**

1. **定义**："Agents are systems that independently accomplish tasks on your behalf."（Agent 是代表你独立完成任务的系统。）反面界定："Applications that integrate LLMs but don't use them to control workflow execution—think simple chatbots, single-turn LLMs, or sentiment classifiers—are not agents."（集成了 LLM 但不用它控制工作流执行的应用——简单聊天机器人、单轮 LLM、情感分类器——不是 agent。）
2. **三组件**：Model（LLM 推理决策）+ Tools（外部函数/API）+ Instructions（显式指南与护栏）。
3. **何时该建 agent**（三类场景）：复杂决策（refund approval 类）、难维护的规则系统（规则集臃肿易错）、重度依赖非结构化数据。并且"Before committing to building an agent, validate that your use case can meet these criteria clearly. Otherwise, a deterministic solution may suffice."（在承诺建 agent 前，先验证用例确实满足这些标准；否则确定性方案可能就够了。）
4. **单 agent 优先**："Our general recommendation is to maximize a single agent's capabilities first."（一般建议先榨干单 agent 能力。）"often a single agent with tools is sufficient"（通常单 agent 加工具就足够）；只有当 agent "fail to follow complicated instructions or consistently select incorrect tools"（无法遵循复杂指令或持续选错工具）时才拆分多 agent。
5. **护栏是一等公民**：Agents SDK 把 guardrails 作为一等概念，"relying on optimistic execution by default"（默认乐观执行——主 agent 并行生成、护栏并发运行、违规即抛异常触发 tripwire）；护栏可实现为函数或 agent，用于 jailbreak 防护、相关性校验、关键词过滤、黑名单、安全分类。
6. **人机介入的两类触发器**："Exceeding failure thresholds: Set limits on agent retries or actions."（超过失败阈值：给重试/动作设上限）；"High-risk actions: Actions that are sensitive, irreversible, or have high stakes should trigger human oversight."（高危动作：敏感、不可逆、高赌注的动作应触发人工监督。）
7. **模型选型**：先用最强模型建 baseline，"Set up evals to establish a performance baseline"（先建评估确立基线），再逐步换小模型降成本——"Focus on meeting your accuracy target with the best models available"（先用最好模型达到准确率目标），再优化成本与延迟。
8. 结论："The path to successful deployment isn't all-or-nothing. Start small, validate with real users, and grow capabilities over time."（部署之路不是全有或全无。从小做起，用真实用户验证，逐步长大。）

**与 data agent 的关联（归纳）**："意图澄清 N 次失败→转人工"、"高危 SQL（DDL/大范围 UPDATE）→人工确认"可直接引用其两类触发器表述；"函数调用护栏 + tripwire 异常"与项目护栏设计同构。

### 5.2 New tools for building agents（2025-03-11）[12]

**核心论点：**

1. "Today, we're releasing the first set of building blocks that will help developers and enterprises build useful and reliable agents. We view agents as systems that independently accomplish tasks on your behalf."（今天我们发布第一批积木，帮助开发者与企业构建有用且可靠的 agent。我们把 agent 视为代表你独立完成任务的系统。）
2. 发布内容：Responses API（agents 的 API 基座）；内置工具 **web search / file search / computer use**；开源 **Agents SDK**（编排 handoffs、guardrails、tracing 观测）与对应观测面板。
3. file search 与多文件向量检索直接相关，是"文档型数据源"（报告、规程、台账）接入的官方原语。

**与 data agent 的关联（归纳）**：本案标志着 OpenAI 的 agent 方法论产品化起点；"handoffs + guardrails + tracing"三件套与 LangGraph 的图编排/检查点/LangSmith 追踪是同位概念，可与本项目对举。

### 5.3 Introducing deep research（2025-02-02；摘要核实）[13]

**核心论点：**

1. deep research 由"a version of the upcoming OpenAI o3 model that's optimized for web browsing and data analysis"（针对网页浏览与数据分析优化的 o3 版本）驱动，自主执行多步检索-综合，产出带引用的报告。
2. 页面未能直接打开（403），以上表述经官方页面搜索摘要核实；官方另提供 PDF 镜像 https://cdn.openai.com/API/docs/deep_research_blog.pdf。

**与 data agent 的关联（归纳）**：OpenAI 把"data analysis"与 browsing 并列为推理模型的核心优化目标——"分析"被官方视为长程推理任务而非单次生成。

### 5.4 Introducing ChatGPT agent（2025-07-17）[14]

**核心论点：**

1. 定位："bridging research and action"（连接研究与行动）——ChatGPT 在自己的虚拟计算机上"thinks and acts"（边想边做），主动选择浏览器（可视化操作）、终端、文件 API 等工具，把 deep research 的信息综合与 Operator 的站点操作合而为一。
2. 发布节奏：Pro 先行，Plus/Team 随后；Operator 能力并入 ChatGPT agent 后逐步下线。
3. **安全交互模式**（对数据 agent 最有参考价值）：针对 prompt injection 的站点扫描与防御；**Watch Mode**（敏感站点操作时用户可观察接管）；**proactive confirmations**（发送邮件/下载文件等不可逆动作前主动请求用户确认）。

**与 data agent 的关联（归纳）**：Watch Mode + 不可逆动作确认 = 数据 agent 的"高危 SQL 确认 UI"的通用形态；对 BI 问数场景，查询是可逆的但覆盖写入/下发报表不可逆，应分级确认。

### 5.5 Introducing AgentKit（2025-10-06；2026 年重大更新）[15]

**核心论点：**

1. "Today, we're releasing new tools to help developers go from prototype to production faster: AgentKit, expanded evals capabilities, and reinforcement fine-tuning for agents."（今天我们发布新工具帮助开发者更快从原型到生产：AgentKit、扩展的评估能力、面向 agent 的强化微调。）
2. 组件：**Agent Builder**（拖拽式可视化画布，官方类比 Canva/Figma）；**ChatKit**（可嵌入聊天界面）；**Connector Registry**（跨部署治理数据连接：Connectors let developers "connect data to their agents"并统一管控数据流向）；Evals 扩展（数据集、人工标注、版本化、trace 级逐步评分、可用第三方模型当 grader）。
3. 客户指标：Ramp"built 8 agents in 2 hours"（2 小时建 8 个 agent，对比过去 2 个月 1 个）、"70% less back-and-forth to production"（进入生产的往返沟通减少 70%）；Carlyle、HubSpot 等亦有引用。
4. **2026-06-03 官方更新（页内原文）**："OpenAI is winding down the Agent Builder and Evals products. From November 30, 2026 onward, they will no longer be available on the OpenAI platform. For workflows that should continue as code, we recommend the Agents SDK. For use cases better suited to natural language prompting, we recommend Workspace Agents in ChatGPT."（OpenAI 将关停 Agent Builder 与 Evals 产品，2026-11-30 起不再可用。对于应以代码延续的工作流，我们推荐 Agents SDK；更适合自然语言提示的用例，则推荐 ChatGPT 的 Workspace Agents。）

**与 data agent 的关联（归纳）**：这是 2026 年最重要的行业信号之一——低代码可视化 agent 编排一年内即被官方收缩，"代码即工作流"（Agents SDK/LangGraph 路线）获官方背书；本项目教 LangGraph 而非教某拖拽平台，方向被此更新印证。Evals 产品虽关停，"评估先行"的方法论不变。

### 5.6 Inside our in-house data agent（2026-01-29）——与本项目最相关的一篇 [16]

**核心论点：**

1. **定位与规模**：OpenAI 内部工具，"from question to insight in minutes, not days"（从问题到洞察只要几分钟而不是几天）；服务 Engineering、Data Science、GTM、Finance、Research 等团队；规模约 3,500 内部用户、600+ petabyte 数据、约 70,000 个数据集。"The agent covers the full analytics workflow: discovering data, running SQL, and publishing notebooks and reports."（该 agent 覆盖完整分析工作流：发现数据、运行 SQL、发布笔记本与报告。）由 Codex 构建，依托 GPT-5、Evals API、Embeddings API。
2. **已知失败模式**：many-to-many joins（多对多 join）、filter pushdown errors（过滤下推错误）、unhandled nulls（未处理的空值）。
3. **闭环自学习**："if an intermediate result looked wrong—like zero rows returning due to an incorrect join—the agent would investigate, adjust its approach, and retry"（若中间结果可疑——如因错误 join 返回零行——agent 会调查、调整方法、重试）。
4. **六层上下文**（架构核心）：
   - Metadata grounding：schema 元数据与表级 lineage（血缘）作为语义底座；
   - Query inference：从历史查询模式推断相关表；
   - Curated descriptions：领域专家策展的业务口径描述；
   - Code-level definition：**用 Codex 爬取代码库**，从"产生该表的管道代码"提取业务逻辑与新鲜度假设——"its true meaning lives in the code that produces it"（它的真实含义存在于产生它的代码里）；
   - Company knowledge：Slack/Docs/Notion 的 RAG 检索（继承源系统权限）补充上下文；
   - Runtime context：对数据仓库发实时查询核对。
   - 附加：memory（用户更正可保存为全局或个人记忆）与 workflows（把复现性分析固化为可复用指令集）。
5. **澄清策略**：含义不明时主动提出澄清问题；用户不响应则套用合理默认值（如默认最近 7/30 天）**不阻塞**继续执行。
6. **评估**：策展的问答对 + 人工撰写的"golden" SQL；**同时比较 SQL 文本与执行结果数据**，由 Evals grader 打分（"not a naive string match"，并非朴素字符串匹配）；"unit tests that run continuously... canaries in production"（持续运行的单元测试……生产中的金丝雀）。
7. **安全**：pass-through permissions（权限穿透）——"Users only query tables they already have permission to access"（用户只能查询其本就有权访问的表）；越权时标记缺失访问或降级回退；向用户暴露推理过程与底层结果链接以供验证。
8. **教训**：工具太多且职责重叠会迷惑 agent → 收紧并合并工具调用；"highly prescriptive prompting degraded results"（高度指令化的 prompt 反而降低效果）→ 改为高层级指导 + 让 GPT-5 自主推理；代码爬取能捕捉管道逻辑、假设与新鲜度。

**与 data agent 的关联（归纳）**：这篇是"BI 问数 agent"的完整官方蓝本，与本项目环节几乎一一对应（意图澄清闸、Schema Linking 多源上下文、SQL 生成、结果自检重试、golden 结果集评估、越权回退）；其"六层上下文"清单可直接作为项目 Schema Linking 模块的需求清单。

### 5.7 Now everyone can put data to work（2026；403 未逐字抓取，摘要核实）[17]

**核心论点（官方页面搜索摘要）：**

1. "Meet the new Data agent in ChatGPT Work: turn your company's data into answers, interactive dashboards, and ..."（认识 ChatGPT Work 的新 Data agent：把公司数据变成答案、交互式看板……）
2. 权限模型："Queries enforce the connected account's existing permissions, including table, row, and column restrictions."（查询强制执行所连接账户的既有权限，包括表、行、列级限制。）
3. 配套生态：ChatGPT Enterprise/Edu 发布说明提及 `@Data` 入口与工作区访问控制；Sigma 等 BI 插件可经 Data agent 市场接入。

**与 data agent 的关联（归纳）**：OpenAI 把"问数"做成企业级产品能力的姿态明确；行列级权限穿透与 [16] 的 pass-through 相互印证，是"越权防护"环节的官方基准线。

### 5.8 GPT Action Library: SQL Database（Cookbook，无日期）[18]

**核心论点：**

1. 官方范式：GPT 生成 SQL → 发给中间件 REST 端点（OpenAPI schema 声明）→ 中间件执行并转成 base64 CSV → 经 `openaiFileResponse` 回传给 code interpreter 处理。
2. **只读红线**："you should ensure that the middleware application has read-only permissions on the database."（应确保中间件应用对数据库只有只读权限。）需要写操作时"consider deploying operation-specific endpoints rather than accepting arbitrary SQL"（考虑部署操作特定的端点，而不是接受任意 SQL）。
3. **按用户出 schema**：用户级授权时，由中间件从 IdP 取身份、查询该用户的库表权限并按会话强制执行；为好的体验应"动态检索每用户的 schema"而非硬编码——让 GPT 只看到当前用户有权查询的表。

**与 data agent 的关联（归纳）**：这是"函数调用护栏 + 越权防护"的最简官方实现样本：连接层只读、写操作走白名单端点、schema 随权限裁剪。

### 5.9 SchemaFlow: Agentic Database Change Impact Analysis, SQL Generation, and Eval Guardrails（Cookbook，无日期）[19]

**核心论点：**

1. **分阶段而非一步到位**："the workflow breaks the task into explicit stages"（工作流把任务拆成显式阶段）而不是"asking one model to produce a final SQL script directly"（让一个模型直接产出最终 SQL 脚本）。
2. **阶段间确定性校验**："Adds deterministic checks between stages so obvious failures are caught before downstream steps consume bad state."（在阶段之间加入确定性检查，让明显失败在下游消费坏状态之前被拦截。）"These checks do not replace human review, but they catch common silent failures early."（这些检查不能替代人工评审，但能尽早抓住常见的静默失败。）
3. **契约与 artifact**：Pydantic 模型（ChangeRequestModel / ImpactModel / PlanModel）作为阶段间契约；产物落盘 `artifacts/notebook_runs/` 下的 JSON bundle；并生成 Promptfoo provider/assertion/config 供 parse-only 与 full-flow 两种评估。
4. SQL 生成分四层：LANDING (ODS) / STAGING (STG) / CORE (DIM/FACT/VIEW) / MARTS (SERVING)；确定性校验检查期望的表、列与关键字（`ALTER TABLE`、`UPDATE`、`CREATE INDEX`）。
5. 边界声明：工作流"does not execute SQL against a live database"（不对真实库执行 SQL），只产出草案 artifact。

**与 data agent 的关联（归纳）**：与本项目同构度最高的官方示例——分阶段编排 + AST/关键字确定性校验 + artifact 留档 + 双模式评估；其对数仓分层（ODS/STG/CORE/MARTS）的表述也便于石油数据湖场景类比。

### 5.10-5.11 Cookbook 评估与编排两篇（仅搜索摘要核实，未逐字抓取）[20][21]

- Getting Started with OpenAI Evals：官方评估框架入门，示例包含使用 **Spider text-to-SQL 测试数据集**的评估 [20]。
- Orchestrating Agents: Routines and Handoffs：提出 routines（例程）与 handoffs（交接）两概念，演示多 agent 编排实现 [21]。

---

## 6. 两家对比

| 维度 | Anthropic | OpenAI |
|------|-----------|--------|
| **workflow vs agent 定义** | 显式二分：workflow = LLM/工具由**预定义代码路径**编排；agent = LLM **动态主导**流程与工具使用；两者是光谱，能 workflow 就不 agent [1] | 定义 agent 为"代表你独立完成任务的系统"，并反面排除"不控制工作流执行"的 LLM 应用；其"workflow"一词指业务流程本身而非编排谱系（注意术语错位）[11][12] |
| **编排模式** | 五模式菜单：chaining/routing/parallelization/orchestrator-workers/evaluator-optimizer + 自主循环；多智能体仅在广度优先、可并行时使用 [1][4] | Agents SDK 的 handoffs/manager 编排 + 单 agent 优先（"maximize a single agent's capabilities first"）；官方内部数据智能体实为**带护栏的单体 + 多层上下文**而非多智能体 [11][16] |
| **共识** | "找得到最简单方案就别用 agent"；单 agent 优先；评估先行；小步上生产 [1][11] | 同左（"deterministic solution may suffice"；"Start small, validate with real users"）[11] |
| **工具/数据源连接** | MCP 开放协议（首发含 Postgres server）+ Skills 技能包 + code execution 沙箱处理大数据 [2][8][9] | Connector Registry（企业级连接治理）+ GPT Action/中间件范式（只读 + 按用户出 schema）+ Data agent 产品化 [15][17][18] |
| **评估方法论** | 三类 grader（code/model/human）+ outcome vs trajectory + "grade what the agent produced, not the path" + 20-50 真实失败任务起步 + judge 需人工校准 [7][10] | evals-first 选型（先建 baseline）+ golden SQL **与结果集双重比对**（拒绝朴素字符串匹配）+ 持续单元测试/生产金丝雀 + AgentKit Evals 版本化（该产品 2026-11 关停但方法论不变）[11][15][16] |
| **安全与护栏** | ACI/poka-yoke 防呆 + 可执行错误信息 + 沙箱执行 + PII 令牌化 + 中间结果不出执行环境 [1][5][9] | 护栏一等公民/乐观执行 tripwire + 只读中间件 + 表/行/列权限穿透 + prompt injection 防护 + Watch Mode/不可逆动作确认 + 失败阈值与人机介入 [11][14][17][18] |
| **对 text-to-SQL/数据分析垂直场景的供给** | 无专题文章；给积木：analysis tool（JS 沙箱→code execution）、MCP 数据连接、evals 方法、渐进披露 Skills [3][8][9][10] | 全链路供给：内部数据智能体架构复盘（六层上下文/golden SQL/权限穿透）+ 企业 Data agent 产品 + SQL Cookbook 两篇（连接范式与分阶段生成）[16][17][18][19] |
| **2026 年动向** | 工程博客转向 agent 运营化（Managed Agents、2026-01 评估专文）[10] | 产品线收缩聚焦：关停低代码 Agent Builder/Evals，转向 Agents SDK（代码优先）与 Workspace Agents [15] |

**归纳（易被误读的三点）**：
1. Anthropic 的"workflow 优先"不是保守，而是把可预测性视为数据任务的第一需求——NL2SQL 的主链路应该是确定性编排的 workflow，自主 agent 只用于开放式探索查数。
2. OpenAI 的内部数据智能体强调"架构相当朴素"（自称 pretty vanilla，见第三方转述，不作论据），真正的杠杆在上下文策展与评估，而非花哨编排。
3. 两家都没把"text-to-SQL 精确率"寄托在更强模型上，而是寄托在**确定性校验 + 结果比对 + 权限收窄**上。

---

## 7. 对本项目的可借鉴点

> 项目链路：自然语言问数 → 意图澄清 → Schema Linking → SQL 生成与校验（AST 检查、指纹熔断）→ Artifact 产出 → 评估（RAGAS 三指标、LLM Judge）→ 越权防护（函数调用护栏）→ 金仓/达梦适配。

### 7.1 被官方印证的设计（继续保留，官方话术可直接引用）

| 项目设计 | 官方印证 | 引用 |
|---------|---------|------|
| 意图澄清闸（先澄清再生成） | OpenAI 内部数据智能体：含义不明主动澄清，不响应则套默认值（最近 7/30 天）不阻塞——"澄清但不卡死"的官方范式 | [16] |
| 显式图编排（LangGraph）而非自由循环 | Anthropic 五模式：NL2SQL 主链路 = chaining + routing + evaluator-optimizer；"最简单方案优先" | [1] |
| SQL 校验护栏（AST 检查） | SchemaFlow："阶段间确定性检查，在下游消费坏状态前拦截"；OpenAI 护栏一等公民 + tripwire 异常；Claude Agent SDK 把"定义规则"排在 LLM judge 之前 | [19][11][7] |
| 指纹熔断/SQL 模板缓存 | Context engineering：just-in-time 检索保留"轻量标识符（stored queries 是官方点名形态）" | [6] |
| Artifact 产出 | analysis tool 可复现计算 + 可下载文件；code execution 中间结果落盘；SchemaFlow artifact bundle；multi-agent 文章"子代理写外部存储减少传话效应" | [3][9][19][4] |
| 失败重试/断点续传 | "Agents are stateful and errors compound"——从检查点恢复而非重启；内部数据智能体"调查→调整→重试"闭环 | [4][16] |
| 函数调用护栏/越权防护 | GPT Action SQL：中间件只读 + 写操作走操作特定端点；权限穿透（用户只能查已有权的表）；行列级权限强制执行 | [18][16][17] |
| LangGraph 代码优先编排 | OpenAI 2026-06-03 关停 Agent Builder/Evals，官方建议"应以代码延续的工作流改用 Agents SDK"——低代码平台生命周期风险实锤 | [15] |

### 7.2 与官方建议相悖或需校准的点

1. **LLM Judge 的定位**：项目把 LLM Judge 与 RAGAS 并列为主评估。Anthropic 两处提醒：Agent SDK 文称 LLM-as-judge "generally not a very robust method"；evals 专文要求 judge 必须经人工校准并给"Unknown"逃生选项。**建议**：主锚点改为"golden 结果集比对"（OpenAI 范式：SQL 文本与执行结果双重比对、拒绝朴素字符串匹配），LLM Judge 只做开放维度（答案可读性、口径解释）的辅助层。引用 [7][10][16]。
2. **AST/指纹校验的适用边界**：Anthropic 警告"grade what the agent produced, not the path"——AST 检查作为**安全约束**（拦危险语句）完全符合官方护栏观；但若把"生成路径/中间步骤"也纳入评分，会惩罚合法的替代路径。**建议**：安全校验与效果评分分离，评分只看终态（结果集 + artifact）。引用 [10]。
3. **RAGAS 三指标属于"模型评估"**：官方数据智能体评估（golden QA 对 + 结果比对 + 生产金丝雀）更贴数据任务。RAGAS 可保留用于检索质量，但应说明官方评估的重心在 outcome。引用 [16][20]。

### 7.3 官方有、项目还没有的（建议增补的模块）

1. **golden 评估集 + 持续金丝雀**：从真实失败中攒 20-50 个问答对、附人工 golden SQL 与 golden 结果集，评估时**比对执行结果而非 SQL 字符串**；并在运行中把评估脚本作为"持续运行的单元测试/生产金丝雀"。引用 [16][10]。
2. **行列级权限穿透演练**：项目有函数调用护栏，可加一层"按用户角色裁剪 schema + 查询以连接账户既有权限执行（表/行/列）"的模拟（金仓/达梦均支持行级权限），直接对齐 [16][17][18]。
3. **大结果集不进上下文**：查数结果 >N 行时自动落盘 CSV artifact、上下文只回传 5 行预览与统计摘要（"agent sees five rows instead of 10,000"），石油数据敏感场景下同时演示"中间结果不出执行环境"。引用 [9]。
4. **方言 Skill 化**：把金仓/达梦方言差异做成 SKILL.md（渐进披露：先载方言名与描述，命中再读全文），附确定性校验脚本——官方"Skills + 渐进披露 + 代码做确定性计算"三合一的落地实现。引用 [8]。
5. **六层上下文自检清单**：Schema Linking 模块按 OpenAI 内部数据智能体的六层（元数据/血缘、历史查询、专家口径、产数代码、周边知识、运行时核对）逐层打勾，检查每层是否可注入、是否继承权限。引用 [16]。
6. **成本账**：引用"agent ≈ 4× 聊天 token，多智能体 ≈ 15×"与"150k→2k token"两组官方数字，量化单 agent 编排 + 代码执行的经济学；模型选型按"先最强建 baseline、再降级"官方流程走一遍。引用 [4][9][11]。
7. **高危动作分级确认**：把 Watch Mode/不可逆动作确认（[14]）与失败阈值转人工（[11]）映射为"DDL/大范围 UPDATE→确认 UI；澄清失败 N 次→转人工"的产品化设计。
8. **让 agent 改进工具**（可选）： Anthropic 的工具测试 agent 重写工具描述使任务完成时间降 40%——可用评估 transcripts 反向优化 `run_sql` 工具描述。引用 [4][5]。

---

## 8. 引用来源汇总（访问日期均为 2026-09-14）

1. Anthropic, *Building effective agents*, 2024-12-19. https://www.anthropic.com/engineering/building-effective-agents
2. Anthropic, *Introducing the Model Context Protocol*, 2024-11-25. https://www.anthropic.com/news/model-context-protocol
3. Anthropic, *Introducing the analysis tool in Claude.ai*, 2024-10-24（页含 2025-11-05 更新）. https://claude.com/blog/analysis-tool （注：anthropic.com 旧链已迁移至 claude.com 官方博客）
4. Anthropic, *How we built our multi-agent research system*, 2025-06-13. https://www.anthropic.com/engineering/multi-agent-research-system
5. Anthropic, *Writing effective tools for agents — with agents*, 2025-09-11. https://www.anthropic.com/engineering/writing-tools-for-agents
6. Anthropic, *Effective context engineering for AI agents*, 2025-09-29. https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
7. Anthropic, *Building agents with the Claude Agent SDK*, 2025-09-29. https://claude.com/blog/building-agents-with-the-claude-agent-sdk （原 https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk 返回 308 重定向至此）
8. Anthropic, *Equipping agents for the real world with Agent Skills*, 2025-10-16（页含 2025-12-18 开放标准更新）. https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
9. Anthropic, *Code execution with MCP: Building more efficient agents*, 2025-11-04. https://www.anthropic.com/engineering/code-execution-with-mcp
10. Anthropic, *Demystifying evals for AI agents*, 2026-01-09. https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
11. OpenAI, *A practical guide to building agents*（官方 PDF；发布年 2025，页面未标具体日期）. https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf ；落地页 https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/
12. OpenAI, *New tools for building agents*, 2025-03-11. https://openai.com/index/new-tools-for-building-agents/
13. OpenAI, *Introducing deep research*, 2025-02-02. https://openai.com/index/introducing-deep-research/ 【未能直接打开原文（403），标题/日期/关键表述经官方页与官方 PDF 镜像（https://cdn.openai.com/API/docs/deep_research_blog.pdf）搜索摘要核实】
14. OpenAI, *Introducing ChatGPT agent: bridging research and action*, 2025-07-17. https://openai.com/index/introducing-chatgpt-agent/
15. OpenAI, *Introducing AgentKit*, 2025-10-06（页含 2026-06-03 关停更新）. https://openai.com/index/introducing-agentkit/
16. OpenAI, *Inside our in-house data agent*, 2026-01-29. https://openai.com/index/inside-our-in-house-data-agent/
17. OpenAI, *Now everyone can put data to work*, 2026（具体日期未核实）. https://openai.com/index/put-data-to-work/ 【未能直接打开原文（403），核心引文经官方页面搜索摘要核实】
18. OpenAI Cookbook, *GPT Action Library: SQL Database*（页面未标日期）. https://developers.openai.com/cookbook/examples/chatgpt/gpt_actions_library/gpt_action_sql_database
19. OpenAI Cookbook, *SchemaFlow: Agentic Database Change Impact Analysis, SQL Generation, and Eval Guardrails*（页面未标日期）. https://developers.openai.com/cookbook/examples/partners/schemaflow_design_guide/schemaflow_cookbook
20. OpenAI Cookbook, *Getting Started with OpenAI Evals*. https://developers.openai.com/cookbook/examples/evaluation/getting_started_with_openai_evals 【未逐字抓取，仅搜索摘要核实（含 Spider text-to-SQL 示例）】
21. OpenAI Cookbook, *Orchestrating Agents: Routines and Handoffs*. https://developers.openai.com/cookbook/examples/orchestrating_agents 【未逐字抓取，仅搜索摘要核实】

### 延伸阅读（非论据）

- Anthropic, *Scaling Managed Agents: Decoupling the brain from the hands*. https://www.anthropic.com/engineering/managed-agents
- OpenAI, *Introducing workspace agents in ChatGPT*. https://openai.com/index/introducing-workspace-agents-in-chatgpt/
- OpenAI Developers, *Agents API 文档*. https://developers.openai.com/api/docs/guides/agents
- 第三方（仅线索，不作论据）：ByteByteGo《How OpenAI Built Its Data Agent》；InfoQ 对"Anthropic 内部约 95% 分析由 Claude 处理"的转述（2026-06）。
