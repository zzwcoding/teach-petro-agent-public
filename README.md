# Petro-Agent —— 油田数据问答平台 · 架构设计项目

> 面向油田生产场景的智能问数 / 问答 / 问智平台，从业务设定、PRD、接口契约、架构决策到可交互原型的完整设计稿。设计过程中使用 AI 辅助完成技术调研与原型验证。

## 项目地图（同一项目的各部分 GitHub 仓）

本项目按「设计真源 → 平台实现 → 数据面 → 合成数据」分仓协作，各仓独立 git，GitHub 平级发布：

| 仓库 | 角色 | 可见性 |
|---|---|---|
| [petro-agent-platform](https://github.com/zzwcoding/petro-agent-platform) | 平台实现仓：后端 `app/`＋`appv2/` · 前端 `web/` · 本体 `ontology/`（已并入） | 公开 |
| **本仓** [teach-petro-agent-public](https://github.com/zzwcoding/teach-petro-agent-public) | 设计/教学真源仓（架构设计项目形态）：合同册 specs/api · ADR 链 · 业务设定 · 架构大图 · 前端原型 | 公开 |
| [tpa-data-plane](https://github.com/zzwcoding/tpa-data-plane) | 数据面仓：独立数据服务（进料→清洗→出汇总→质检→报水位） | 公开 |
| [fieldforge](https://github.com/zzwcoding/fieldforge) | 油气领域合成数据生成工作台 | 公开 |

## 这个项目是什么

一份**系统架构设计项目**：以渤海油田分公司（3 作业区、120 口在产井）技术团队的真实工作流为场景，设计一个由三个专职 Agent（问答 / 问数 / 问智）+ 统一 AI 网关承载的自然语言平台，跑在国产化环境（麒麟 OS + 金仓数据库 + SM3/SM4 国密）上。交付物覆盖从需求到设计的全链路：

- **PRD**（`docs/prd.md` F1–F62 + `docs/prd-data-plane.md` D1–D9）：功能点、双向对账表、技术栈认领对账、三档规模（边缘 / 平台 / 集团）的取舍、变更记录。
- **接口契约**（`specs/api/` 24 册）：A/B/C/D/E/F 六大功能面 + 系统级与模块划分、数据库层——逐端点写请求/响应形状、错误码、行为规则与合同常量，是前后端与数据面的唯一接口真源。
- **模块设计**（`specs/modules.md` 28 卡 + `specs/walkthroughs.md` 201 条走查断言）：每个模块的公开接口签名、输入输出契约、边界规则；断言与设计逐条对应。
- **模块设计稿**（`design/` 79 篇）：每个模块一篇——伪代码级设计（公开签名、主干流程、时序推演、走查推演、取舍记录）；数据面另有 DP1–DP9 九篇。
- **架构决策记录**（`docs/adr/` 8 篇）：统一入口决策链、真实开发技术选型、双轨验收基线、前端底座裁决等关键取舍的记录。
- **架构视图**（`docs/architecture-v1.md`、`docs/architecture-data-plane-v1.md`、`diagrams/petro-agent.html`）：架构图与可拖拽缩放的节点大图，每张防护清单都写明"防什么错"。
- **业务设定书**（`docs/business-setting.md`）：组织 / 8 表字典 / 15 指标卡 / 20 质量规则 / Ontology-Glossary-Playbook 草案 / 事故簿——所有设计决策的业务地基。
- **前端原型**（`prototype/`）：可交互线框（Vite + React + antd5），覆盖 PRD 全部功能面，每页带契约溯源。
- **技术调研**（`docs/tech-stack/` 19 分册 + `docs/research/`）：官方文档级调研笔记（LangGraph / LiteLLM / 湖仓 / 语义层 / 国产化栈等）与专项调研，设计决策的出处。
- **路线图**（`docs/roadmap.md`）：阶段划分与验收基线。
- **对外协议名片**（`agent-card.html`）：A2A AgentCard 静态页，平台以 MCP 形态暴露 Tools / Elicitation / Tasks 三映射。

**诚实声明**：组织、人名、事故簿为虚构设定；数据形状 / 指标公式 / 治理做法取自公开论文与行业调研（逐条注源）。本仓库以设计文档、接口契约与原型为交付物，不含生产代码。

## 假想业务一句话

技术团队用自然语言问平台三件事——**问报告**（"N-2 井的完井方式是什么"，RAG 管道）、**问数据**（"上个月产量最高的三口井"，Text2SQL 状态机）、**要成品**（"做成 PPT 配张示意图再出段语音"，问智 worker）；设计又在语义层治理（四域资产 + 五级 CI）与本体交互层（Palantir AgentOS 五层）上扩展。

## 仓库地图

| 路径 | 是什么 |
|---|---|
| `docs/prd.md`、`docs/prd-data-plane.md` | PRD：F1–F62 + D1–D9，技术故事的主索引 |
| `specs/api/` | 接口契约 24 册：逐端点请求/响应/错误码/合同常量，接口唯一真源 |
| `specs/modules.md` / `specs/walkthroughs.md` | 28 模块卡（公开接口签名）/ 201 条走查断言（W-ID） |
| `specs/data-plane/`、`specs/walkthroughs-data-plane.md` | 数据面 dp1–dp9 模块卡与 35 条断言 |
| `design/` | 79 篇模块设计稿（00–76 + DP1–DP9）：伪代码级主干流程、时序与走查推演、取舍记录 |
| `docs/business-setting.md` | 业务设定书：组织 / 表字典 / 指标卡 / 质量规则 / 事故簿 |
| `docs/adr/`、`docs/architecture-v1.md`、`docs/architecture-data-plane-v1.md` | 架构决策记录与架构视图 |
| `docs/roadmap.md` | 阶段划分与验收基线 |
| `docs/tech-stack/`、`docs/research/` | 技术栈调研 19 分册 + 专项调研笔记 |
| `diagrams/petro-agent.html` | 架构大图（双击直开，可拖拽缩放） |
| `prototype/` | 前端原型：静态线框页 + React 构建版（`prototype/app/dist/index.html` 双击直开） |
| `agent-card.html` | A2A AgentCard 名片静态页 |
| `CONTEXT.md` | 术语表 |

## 推荐阅读顺序

1. `docs/business-setting.md`（业务地基）→ `docs/prd.md`（功能全景）
2. `docs/architecture-v1.md` + `diagrams/petro-agent.html`（架构视图，对照 PRD 功能点看落点）
3. `specs/api/`（接口契约：每条功能落在哪个端点、什么形状）→ `specs/modules.md`（模块卡）→ `specs/walkthroughs.md`（设计如何被逐条校验）
4. `design/`（对应模块的设计稿，看伪代码主干、时序推演与取舍记录）
5. `prototype/app/dist/index.html`（可交互原型，`?dev=1` 开契约溯源条）
6. 决策回看：`docs/adr/`；数据面专题：`docs/prd-data-plane.md` → `docs/architecture-data-plane-v1.md` → `specs/data-plane/`