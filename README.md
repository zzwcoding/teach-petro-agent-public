# Petro-Agent —— 油田智能平台 · 架构设计项目

> 面向油田生产场景的智能问数 / 问答 / 问智平台，从业务设定、PRD、模块设计到可交互原型的完整设计稿。设计过程中使用 AI 辅助完成技术调研与前端原型验证。

## 项目地图（同一项目的各部分 GitHub 仓）

本项目按「设计真源 → 平台实现 → 数据面 → 合成数据」分仓协作，各仓独立 git，GitHub 平级发布：

| 仓库 | 角色 | 可见性 |
|---|---|---|
| [petro-agent-platform](https://github.com/zzwcoding/petro-agent-platform) | 平台实现仓：后端 `app/`＋`appv2/` · 前端 `web/` · 本体 `ontology/`（已并入） | 公开 |
| [teach-petro-agent](https://github.com/zzwcoding/teach-petro-agent) | 设计/教学真源仓：合同册 · ADR · 业务设定 · 场景课 | 私有 |
| **本仓** [teach-petro-agent-public](https://github.com/zzwcoding/teach-petro-agent-public) | 教学仓公开向副本（架构设计项目形态） | 私有 |
| [tpa-data-plane](https://github.com/zzwcoding/tpa-data-plane) | 数据面仓：独立数据服务（进料→清洗→出汇总→质检→报水位） | 私有 |
| [fieldforge](https://github.com/zzwcoding/fieldforge) | 油气领域合成数据生成工作台 | 公开 |

## 这个项目是什么

一份**系统架构设计项目**（design repo）：以渤海油田分公司（3 作业区、120 口在产井）技术团队的真实工作流为场景，设计一个由三个专职 Agent（问答 / 问数 / 问智）+ 统一 AI 网关承载的自然语言平台，跑在国产化环境（麒麟 OS + 金仓数据库 + SM3/SM4 国密）上。交付物覆盖从需求到设计的全链路：

- **PRD**（`docs/prd.md` F1–F55 + `docs/prd-data-plane.md` D1–D9）：功能点、双向对账表、三档规模（边缘 / 平台 / 集团）的取舍。
- **模块设计**（`specs/modules.md` 27 卡 + `specs/walkthroughs.md` 193 条走查断言）：每个模块的公开接口签名、输入输出契约、边界规则；断言与设计逐条对应。
- **模块设计稿**（`design/` 78 篇）：每个模块一篇——伪代码级设计（公开签名、主干流程、时序推演、走查推演、取舍记录），与模块卡和走查断言逐条对号；数据面另有 DP1–DP9 九篇。
- **业务设定书**（`docs/business-setting.md`）：组织 / 8 表字典 / 15 指标卡 / 20 质量规则 / Ontology-Glossary-Playbook 草案 / 事故簿——所有设计决策的业务地基。
- **可探索架构大图**（`diagrams/petro-agent.html`，HTML 可拖拽缩放）：26 容器 / 140 节点 / 179 边，每张防护清单都写明"防什么错"。
- **前端原型**（`prototype/`）：22 页可交互线框（Vite + React + antd5），覆盖 PRD 全部功能面，每页带契约溯源。
- **技术调研**（`docs/tech-stack/` 19 分册 + `references/`）：AI 辅助完成的官方文档级调研笔记（LangGraph / LiteLLM / 湖仓 / 语义层 / 国产化栈等），设计决策的出处。
- **对外协议名片**（`agent-card.html`）：A2A AgentCard 静态页，平台以 MCP 形态暴露 Tools / Elicitation / Tasks 三映射。

**诚实声明**：组织、人名、事故簿为虚构设定；数据形状 / 指标公式 / 治理做法取自公开论文与行业调研（逐条注源）。本仓库以设计文档与原型为交付物，不含生产代码。

## 假想业务一句话

技术团队用自然语言问平台三件事——**问报告**（"N-2 井的完井方式是什么"，RAG 管道）、**问数据**（"上个月产量最高的三口井"，Text2SQL 状态机）、**要成品**（"做成 PPT 配张示意图再出段语音"，问智 worker）；v3/v4 又在语义层治理（四域资产 + 五级 CI）与本体交互层（Palantir AgentOS 五层）上扩展。

## 仓库地图

| 路径 | 是什么 |
|---|---|
| `docs/prd.md`、`docs/prd-data-plane.md` | PRD：F1–F55 + D1–D9，技术故事的主索引 |
| `docs/business-setting.md` | 业务设定书：组织 / 表字典 / 指标卡 / 质量规则 / 事故簿 |
| `docs/architecture-data-plane-v1.md`、`docs/adr/` | 数据面架构图（井口→Agent 回答全链）与架构决策记录 |
| `docs/tech-stack/` | 技术栈调研 19 分册（湖仓 × DataAgent 增量 9 分册） |
| `specs/modules.md` / `specs/walkthroughs.md` | 27 模块卡（公开接口签名）/ 193 条走查断言（W-ID） |
| `specs/data-plane/`、`specs/walkthroughs-data-plane.md` | 数据面 dp1–dp9 模块卡与 35 条断言 |
| `design/` | 78 篇模块设计稿（00–69 + DP1–DP9）：伪代码级主干流程、时序与走查推演、取舍记录 |
| `diagrams/petro-agent.html` | 架构大图（双击直开，可拖拽缩放） |
| `prototype/` | 前端原型：V1 静态 22 页 + V2 React 构建版（`prototype/app/dist/index.html` 双击直开） |
| `references/` | 行业与产品调研笔记（DataAgent / 语义层 / 石油信息化） |
| `agent-card.html` | A2A AgentCard 名片静态页 |
| `CONTEXT.md` | 术语表 |

## 推荐阅读顺序

1. `docs/business-setting.md`（业务地基）→ `docs/prd.md`（功能全景）
2. `diagrams/petro-agent.html`（架构大图，对照 PRD 功能点看节点）
3. `specs/modules.md`（模块卡）→ `specs/walkthroughs.md`（设计如何被逐条校验）→ `design/`（对应模块的设计稿看伪代码主干与走查推演）
4. `prototype/app/dist/index.html`（可交互原型，`?dev=1` 开契约溯源条）
5. 数据面专题：`docs/prd-data-plane.md` → `docs/architecture-data-plane-v1.md` → `specs/data-plane/`
