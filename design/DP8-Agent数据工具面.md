# 设计稿 DP8：Agent 数据工具面（dp8）—— 五个只读工具 + MCP server 形状

> **红线声明**：本设计稿零真实可运行代码。全部代码块均为**伪代码**（块首标注"伪代码 — 文件:函数"），公开签名逐字取自 `specs/data-plane/modules.md`「dp8 数据工具面 DataTools」卡（discover_tables / describe_table / query / replay / lineage / serve_mcp 六签名）；函数体=输入输出契约+主干判断，不写实现细节。
> **语言纪律**：业务事实一律注 `设定书 §x`（发明即违规）；技术形状一律 docs/tech-stack/ 分册——**MCP 生态事实只写分册已核实条目**：Cube 官方 MCP 属 **Cube Cloud 托管端点**（Premium/Enterprise 计划，OAuth+PKCE，约 30 个工具；开源版无此物，开源侧官方配套是 cube-agent-skills）；**DuckDB 本体无官方 MCP**，MotherDuck 官方款为本地（MIT、**默认只读**、加 `--read-write` 才可写）+托管双形态；**apache/iceberg 本体无官方 MCP**，Polaris MCP Server 是 catalog 侧厂商实现——未核实的协议字段（方法名/报文/传输细节）宁可不写，协议概念形状沿设计稿 30（设计演绎）。
> **边界声明**：dp8 依赖 dp1/dp4/dp5/dp6/dp7/dp9（依赖图行原文）；**query 工具内部强制 dp9.check_join → dp6.route → dp5.run → dp7.record 顺序**（dp8 卡原文）；治理闸是工具面**唯一放行路径**（边界规则"dp8 绕过 dp9 放行任何查询/导出=禁止"）；**只读红线：无任何湖表写工具**（边界规则第 5 条"dp1.append 仅 dp2/dp3 可调"的 Agent 侧体现）；Seam=`ToolTransport`（in_process / mcp 两实现），Adapter=直调（S1 形态即测试形态）——三档换适配器不换工具合同。
> **明确不讲的**：A2A AgentCard（主 PRD F28，设计稿 30 已交付）；MCP 服务端真实搭建与传输层（同设计稿 30 设计演绎边界）；dp9 闸判定本体、dp6 拒答话术合同、dp7 回放实现（各自设计稿已交付，本设计稿只消费其公开签名）；dp5 引擎翻译（DP5 设计稿）。

## 实现清单

- [x] `DP-W-D8-1` discover_tables 返回 TableCard（name/tier/freshness/metrics 四件齐）；S1=in_process 直调传输，S2+=MCPServerSpec（serve_mcp）✅ **主干一 + 主干六**
- [x] `DP-W-D8-2` query 全链闸位图：dp9.check_join → dp6.route → dp5.run → dp7.record；AnswerBundle 四件齐（arrow_summary/snapshot_id/quality_status/as_of）；任一闸拒则整体拒带原因 ✅ **主干三 + 合同表 query 行**
- [x] `DP-W-D8-3` 只读红线：serve_mcp 工具清单审计无写入口；写请求被拒并提示走 dp2/dp3 管道 ✅ **主干四 + 合同表越界行**
- [x] `DP-W-D8-4` lineage 给上游模型链（dp3 manifest parent_map/child_map）；replay 按 AuditRef 回放（衔接 DP-W-D7-2）✅ **主干五**
- [x] 五工具 JSON 合同表（输入/输出/拒绝路径逐字段）——本设计稿核心交付 ✅ **主干〇合同表**
- [x] 规模矩阵 dp8 行兑现：进程内函数 → 自建 MCP server → server 池；"目录即工具"业界趋势对照（minio-iceberg.md"前沿已兑现：表格式 × MCP"行 + dataagent-stack-map.md §3.7 agentic 转向——设计范围所指"§6 第一行"实落于此两处，本设计稿按实际落点注源）✅ **主干六 + 取舍 1**
- [x] 取舍 ≥4 条（自建 MCP vs Cube MCP/Polaris MCP、F28 衔接位、五工具恰五个、AnswerBundle 四元组必须齐）✅ **取舍节**
- [x] 锚点对照：cube-semantic-layer.md / duckdb.md / minio-iceberg.md / dataagent-stack-map.md / 主 PRD F28 → 断言 ID ✅ **锚点对照**

---

## 伪代码走查

### 主干〇：五工具 JSON 合同表（核心交付——逐字段，拒绝路径全部经 dp9）

| 工具 | 输入（JSON 字段） | 输出（JSON 字段） | 拒绝路径（闸 → 出参形状） |
|---|---|---|---|
| `discover_tables` | `prefix: str\|null` | `list[TableCard{name, tier, freshness, metrics}]`（tier/freshness=dp2 登记档位元数据；metrics=dp4 目录反查，§3 指标） | 候选表逐张过 `dp9.authorize(read)`：越权表**不进清单**（行级隔离的清单面投影，不报错）；无匹配 → 空清单（发现面零结果合法） |
| `describe_table` | `name: str` | `TableSchema{columns, partition_spec, current_snapshot, metrics_linked}`（columns/partition_spec/current_snapshot=dp1 确定性信源；metrics_linked=dp4） | 表不存在 → `refused{reason: unknown_table}`；越权（作业区隔离 §1）→ `refused{gate: dp9.authorize, reason}` |
| `query` | `metric: str, dims: list[str], window: TimeWindow, filters: dict` | `AnswerBundle{arrow_summary, snapshot_id, quality_status, as_of}` | 四道闸任一拒 → `refused{gate, reason}` 整体拒（见主干三）；AnswerBundle 不产出、不落审计 |
| `replay` | `audit_ref: str` | `ReplayResult{match, original, current}` | ref 不存在 → error；快照已过保留窗口 → **显式报错不静默**（DP-W-D7-3 同款） |
| `lineage` | `table_or_metric: str` | `LineageInfo{upstreams, downstreams, columns}` | 不在 dp3 manifest → `refused{reason: 口径唯一真源=dp3 manifest}`（禁止第二真源） |
| （无对应工具） | 任何写意图（增/删/改/建表/写湖） | — | 只读红线：`refused{reason: 工具面只读, fix: "写路径走 dp2 进料/dp3 加工管道——入湖必过质检"}`（DP-W-D8-3） |

### 主干一：discover_tables——发现面的确定性信源（DP-W-D8-1）

**契约**：入参=prefix（可空前缀过滤）；出参=list[TableCard(name, tier, freshness, metrics)]。dp8 自身**零元数据**：tier/freshness 读 dp2 登记面（dp6 同源），metrics 反查 dp4 目录——不造第二真源（边界规则 dp4 行同构）。

```text
伪代码 — app/data_plane/tools_mcp.py:discover_tables（dp8 卡签名原文：
         discover_tables(prefix: str | None) -> list[TableCard(name, tier, freshness, metrics)]）

def discover_tables(prefix) -> list[TableCard]:
    # ── 主干判断① 候选集：dp1 catalog 列表 + prefix 过滤（元数据操作，零数据扫描）──
    候选 = catalog.list_tables() 按 prefix 过滤          # REST catalog 即接缝：会发 HTTP 就能 list/load 表
                                                          # 读 schema、拿 vended credentials（minio-iceberg.md）
    # ── 主干判断② 行级过滤：越权表不进清单（每条工具的拒绝路径都经 dp9）──
    return [TableCard(
        name=t,                                          # 表名（§2.2 八表字典）
        tier=freshness_registry.tier(t),                 # dp2 登记档位：realtime/nearline/offline
        freshness=freshness_registry.as_of(t),           # 截至时点——诚实纪律的字段化
        metrics=metric_catalog.挂表指标(t),               # dp4 反查（§3 指标卡 → 数据源 2.2/2.3…）
    ) for t in 候选 if governance.authorize(ctx, t, "read").allowed]   # 渤中用户看不见渤南-only 表
```

**走查推演 1（DP-W-D8-1 主角）**：Agent 问"有哪些表可查"→ 返回 TableCard 四件齐的清单。可观察行为：S1 档直调函数返回同一结构；S2+ 档同一结构经 serve_mcp 工具清单出门——**ToolTransport 换传输不换合同**。对着失败模式"猜错 schema"（dataagent-stack-map.md §2 第一行）：Agent 拿到的是机器可读档位+指标映射，不是靠目录列表猜。

### 主干二：describe_table——列/分区/快照的确定性信源

**契约**：入参=name；出参=TableSchema(columns, partition_spec, current_snapshot, metrics_linked)。

```text
伪代码 — app/data_plane/tools_mcp.py:describe_table（dp8 卡签名原文：
         describe_table(name: str) -> TableSchema(columns, partition_spec, current_snapshot, metrics_linked)）

def describe_table(name) -> TableSchema:
    d = governance.authorize(ctx, name, "read")
    if not d.allowed: return refused(gate="dp9.authorize", reason=d.reason)   # 拒绝路径经 dp9
    t = catalog.load_table(name)                    # dp1：schema/分区/快照是问数确定性信源（dp1 卡）
    return TableSchema(
        columns=t.schema(),                          # 列名/类型/注释（§附录 A 字典的机器可读投影）
        partition_spec=t.spec(),                     # 分区规格 → 生成谓词可带分区裁剪
        current_snapshot=t.current_snapshot(),       # 当前快照号 = 口径锚点（time travel 语义）
        metrics_linked=metric_catalog.挂表指标(name), # dp4：这张表供哪些 §3 指标
    )
```

### 主干三：query——四道闸位图，顺序即合同（DP-W-D8-2）

**契约**：入参=(metric, dims, window, filters)；出参=AnswerBundle(arrow_summary, snapshot_id, quality_status, as_of)；**任一闸拒则整体拒带原因**。闸位图与 DP9 设计稿注入点位图同源（dp9 占两拍：check_join+authorize；走查断言口径四拍=dp9→dp6→dp5→dp7）：

```text
伪代码 — app/data_plane/tools_mcp.py:query（dp8 卡签名原文：
         query(metric: str, dims: list[str], window: TimeWindow, filters: dict)
             -> AnswerBundle(arrow_summary, snapshot_id, quality_status, as_of)）
         （内部强制先经 dp9.check_join + dp6.route —— dp8 卡原文）

def query(metric, dims, window, filters) -> AnswerBundle:
    q = semantic.build_query(metric, dims, window, filters)    # dp4 四件套装配（术语归一在 dp4 入口）
    # ── 闸① dp9：join 白名单（默认拒绝，§5）+ 行级授权（作业区隔离，§1）——先于一切路由与执行 ──
    j = governance.check_join(q)
    if not j.allowed: return refused(gate="dp9.check_join", reason=j.violated_edges)
    a = governance.authorize(ctx, q.基表, "read")
    if not a.allowed: return refused(gate="dp9.authorize", reason=a.reason)
    # ── 闸② dp6：时间窗 × 档位路由——拒答走话术合同，零编数 ──
    r = freshness.route(window, metric)
    if not r.answerable: return refused(gate="dp6.route", reason=refusal_text(r))
    #   # "数据截至 X，未覆盖您问的 Y"（dp6 卡拒答合同；月度指标 ×"今天上午"在此被拦）
    # ── 闸③ dp5：执行（含成本护栏，DP-W-D5-3：超限拒绝或降级采样声明）──
    res = query_runner.run(q, snapshot_id=None)                # dp1 收敛取数，引擎不背权限的债
    if res.超护栏: return refused(gate="dp5.run", reason=res.护栏声明)
    # ── 闸④ dp7：留痕——四元组落审计，AuditRef 是 replay 的钥匙 ──
    ref = audit.record(question_id, q, res.snapshot_id, semantic_version, quality_status)
    return AnswerBundle(
        arrow_summary=摘要(res.arrow),          # 摘要出门喂 LLM；全量行走导出审批位（取舍 4）
        snapshot_id=res.snapshot_id,            # §7 输出合同逐字要"数据版本"
        quality_status=res.质量档位,             # §4 质量闸状态声明（脏表走拒答，不伪装可信）
        as_of=r.declared_as_of,                 # dp6 透传截至时点——事故 13 意识（实时加和≠统计上报，§8）
    )
```

**走查推演 2（DP-W-D8-2 主角）**：合法指标+窗口 → 四闸全过，AnswerBundle 四件齐，审计落四元组。捣乱路径：①`oil_production_daily ⋈ fluid_test` 直连 → 闸① refused 带 violated_edges（须双键+时间容差经 intermediate，§5）；②月度"产量完成率"×"今天上午" → 闸② refused 带话术合同拒答文本；③任一闸拒 = **整体拒**：refused 形状无 AnswerBundle、无部分结果、无审计记录——半截答案比拒答更危险。

### 主干四：只读红线——工具清单审计 + 写请求拒答（DP-W-D8-3）

```text
伪代码 — app/data_plane/tools_mcp.py:audit_write_surface（走查断言"工具清单审计"的兑现形状；非卡签名，为 serve_mcp 的审计伴生函数）

def audit_write_surface() -> AuditReport:
    清单 = serve_mcp().tools                              # 五工具名 + 描述 + 输入 schema
    写动词 = {"insert","update","delete","create","drop","append","write","overwrite"}
    assert 不含写动词(清单)                                # 机查：五工具之外无写入口（只读红线）
    assert 附录面收敛(清单)                                # dp1.append 调用方 = dp2/dp3（边界规则第 5 条）
    return AuditReport(tools=5, write_surface=0)

# 越界形状：Agent 发"把 N-11 井 9 月产量改成 210 吨"→ 工具面无此工具 →
#   refused{reason: "工具面只读", fix: "数据写入走 dp2 进料管道（run_batch_load/cdc_pipeline_spec，先过质检）；
#   加工变更走 dp3 加工管道（build_marts）——入湖必过质检"}——拒答不是终点，给正道指引
```

**行业一致性佐证**（duckdb.md 逐字）：MotherDuck 官方本地 MCP **默认只读、加 `--read-write` 才可写**——"只读是默认、写是显式开关"是业界已核实形状；本设计稿更进一步：五工具清单里**连开关都没有**（写面收敛进料/加工两管道，Agent 侧零写入口）。

### 主干五：replay / lineage——"这个数从哪来、能不能重算"（DP-W-D8-4）

**契约**：replay(audit_ref: str) -> ReplayResult——**透传 dp7**，不造第二套回放；lineage(table_or_metric: str) -> LineageInfo——读 dp3 manifest，口径血缘唯一真源。

```text
伪代码 — app/data_plane/tools_mcp.py:replay / lineage（dp8 卡签名原文：
         replay(audit_ref: str) -> ReplayResult；lineage(table_or_metric: str) -> LineageInfo）

def replay(audit_ref) -> ReplayResult:
    return audit.replay(AuditRef.parse(audit_ref))   # dp7 按记录快照重跑 dp5 比对（衔接 DP-W-D7-2）
    # 表未变 → match=True，original/current 逐行一致（§7 剧本 1 归因报告可回放）
    # 快照已过期 → dp7 显式报错"快照已过保留窗口"，dp8 原样透传——不静默换当前快照（DP-W-D7-3 同款）

def lineage(table_or_metric) -> LineageInfo:
    return manifest.血缘(table_or_metric)            # dp3 manifest.json parent_map/child_map（dp3 卡原文）
    # "油气产量从哪来"→ A11/A2/A5/E7 四源血缘 + 权威源仲裁注记（§8 事故 13：差 3.2% 的口径说明）
```

### 主干六：serve_mcp——S2+ server 形状 + 三档换挡（DP-W-D8-1 传输面 + 矩阵 dp8 行）

```text
伪代码 — app/data_plane/tools_mcp.py:serve_mcp（dp8 卡签名原文：serve_mcp() -> MCPServerSpec）

def serve_mcp() -> MCPServerSpec:
    return MCPServerSpec(
        server_name="petro-data-plane",               # 合同面：只承载已核实形状
        tools=[五工具清单],                            # name/描述/输入 schema=主干〇合同表逐字段
        readonly=True,                                # 只读红线随清单出门（主干四审计对象）
        transport="S1=in_process 直调 | S2+=MCP server（协议概念形状沿设计稿 30 设计演绎）",
    )   # 未核实的 MCP 协议字段（报文/方法/传输细节）零书写——语言纪律声明

三档换挡（矩阵 dp8 行原文：进程内函数 → 自建 MCP server → MCP server 池）：
  S1 边缘档：五工具=进程内函数，直调即测试形态（Adapter=直调）
  S2 平台档：自建 MCP server——对齐 Polaris MCP/Databricks 托管 MCP/MotherDuck MCP 的"目录即工具"叙事
             （minio-iceberg.md："catalog/表格式作为 Agent 工具暴露"已是厂商共识动作）
  S3 集团档：MCP server 池（多实例）——工具合同零变化，换的是 ToolTransport 适配器
  趋势对照：REST catalog 即接缝——"Agent 的 MCP/工具层只要会发 HTTP，就能 list/load 表、读 schema、
            拿 vended credentials，不必捆绑任何计算引擎或 JVM"（minio-iceberg.md 逐字）；
            2025-26 厂商叙事从 fabric 转向 agentic（dataagent-stack-map.md §3.7）
```

## 关键判断的取舍记录

1. **自建五工具 MCP，不直接用 Cube MCP（Cloud 限定）或 Polaris MCP（catalog 侧）。** 逐字照分册：Cube 官方 MCP 是 **Cube Cloud 托管端点**（Premium/Enterprise 计划，OAuth+PKCE，约 30 个工具含模型编辑/预聚合管理，9 个破坏性工具强制确认）——油田内网私有部署进不去 Cloud 端点；且其工具集是"建模+仪表盘+运维"向，与只读红线冲突；最关键的是它只包语义层（dp4），**给不了 query 工具的跨模块组合语义**（dp9 闸→dp6 路由→dp5 执行→dp7 留痕）。Polaris MCP Server 是 catalog 侧（表发现/schema/凭证），覆盖不了口径、路由与快照审计。自建的理由因此精确：**组合语义只在自家栈上存在**。诚实边界：Cube 社区 MCP 实现、DuckDB 社区 duckdb_mcp 均为第三方款（分册明示"引用勿说成官方"），本设计稿不引。
2. **与平台 F28 暴露层的衔接位：平台 MCP 对外，本设计稿是平台内数据面工具——两级门不混装。** F28（设计稿 30，m8 三映射）把平台既有工具暴露给**外部** Agent，Tools/Elicitation/Tasks 各归其位、外部调用同权同闸；dp8 是数据面给平台侧的**内部**公开面。衔接纪律即边界规则原文："任何 dp 模块 import 平台 m1–m21 内部实现=禁止——数据面与平台语义侧只走公开面（HTTP/工具合同）"——双向成立：平台消费问数走 dp8 五工具合同（不 import governance/freshness 内部），外部 Agent 消费问数再经 F28 形状出门。上级平台要把问数嵌进自己系统，消费的是"F28 形状下的 dp8 合同"，两级各守一段。
3. **五工具为什么恰好是五个：发现/描述/查询/回放/血缘=问数闭环的最小完备集。** 找到表（discover）→ 看清列与口径（describe）→ 问到数（query）→ 验数（replay）→ 溯源（lineage）。**少一个即断链**：没有发现/描述就退回"猜 schema"幻觉（dataagent-stack-map.md §2 四道闸第一行）；没有回放则结论不可复现（§7"数据版本"落空）；没有血缘则"这个数从哪来"无处落（§8 事故 13 的血缘标注落空）。**多一个即越界**：第六个工具若是写面，只读红线破；若是直连执行（绕闸 query），"dp8 绕过 dp9=禁止"破——五恰是闭环与红线的交点。
4. **AnswerBundle 四元组为什么必须齐：缺一即答数退化。** arrow_summary=喂 LLM 的摘要——全量行不进工具面（上下文撑爆论点，主 PRD F28 信源"大结果以 artifact 句柄出门"；明细要拿走=导出，走 dp9.export_report 审批+水印+presigned，与 DP9 主干三同构）；snapshot_id=数据版本（§7 输出合同逐字"结论+证据链+**数据版本**"，无它则 replay 无钥匙）；quality_status=质量档位声明（§4 质量闸的正面形式，脏数据不伪装可信）；as_of=诚实纪律（§8 事故 13：实时加和≠统计上报，答数必带截至时点）。四件是"可信回答"的最小公约数——少任何一件，回答要么不可回放、要么不可信、要么不诚实、要么撑爆上下文。
5. **只读红线做成"清单可机查"而非"文档承诺"。** 拒绝单个写请求靠运行时判（主干四越界形状），但红线本体靠 serve_mcp 清单审计成立：五工具之外无写入口是**结构性事实**，不是行为约束——Agent 被提示注入诱导"写湖"时，面上一无工具可调、底下 dp1.append 调用方审计收敛 dp2/dp3（边界规则第 5 条），双层零口子。这与 MotherDuck"默认只读、显式开关"（duckdb.md）同向但更严：**连开关都不给**，写面只存在于进料/加工管道。

## 锚点对照

| 论断/内容 | 锚点 | 断言 ID / 落点 |
|---|---|---|
| TableCard 四件（name/tier/freshness/metrics） | modules.md dp8 卡签名原文；供数：dp2 登记面 + dp4 metric_catalog | DP-W-D8-1 → 主干一 |
| S1=in_process / S2+=MCPServerSpec 双传输；矩阵"进程内函数→自建 MCP server→server 池" | modules.md dp8 卡 Seam（ToolTransport）+ 矩阵 dp8 行 | DP-W-D8-1 → 主干六 |
| query 闸位图 check_join→route→run→record | modules.md dp8 卡原文"内部强制先经 dp9.check_join + dp6.route"；DP9 设计稿注入点位图 | DP-W-D8-2 → 主干三 |
| AnswerBundle 四件齐 / 任一闸拒整体拒 | modules.md dp8 卡出参形状；走查 D8-2 期望列 | DP-W-D8-2 → 主干三/取舍 4 |
| 只读红线（无写入口，写走 dp2/dp3） | modules.md 边界规则第 5 条（dp1.append 仅 dp2/dp3 可调——"Agent 五工具全只读"）；prd-data-plane D8"不做任何湖表写工具" | DP-W-D8-3 → 主干四/合同表越界行 |
| lineage=dp3 manifest；replay 衔接 DP-W-D7-2 | modules.md dp3 卡（parent_map/child_map）；walkthroughs D7-2/D7-3 | DP-W-D8-4 → 主干五 |
| MCP 归属之辨：Cube MCP 属 Cloud（Premium/Enterprise、OAuth+PKCE、约 30 工具）、开源侧=cube-agent-skills | cube-semantic-layer.md MCP 节 + 版本锚点（逐字） | 取舍 1 |
| MotherDuck MCP 官方款双形态、默认只读；DuckDB 本体无官方 MCP | duckdb.md MotherDuck 与 MCP server 节（逐字） | 主干四/取舍 1 |
| Polaris MCP Server=catalog 侧；apache/iceberg 本体无官方 MCP；REST catalog 即接缝 | minio-iceberg.md（前沿已兑现行、诚实边界①、REST Catalog 节逐字） | 主干六/取舍 1 |
| "目录即工具"趋势 + 四道闸（猜错 schema/脏数/口径漂移/不可复现） | minio-iceberg.md"厂商共识动作"句；dataagent-stack-map.md §2 四道闸表、§3.7 agentic 转向（设计范围"§6 第一行"实际落点） | 主干六/取舍 1、3 |
| F28 衔接位（平台 MCP 对外、dp8 平台内工具面、双向公开面） | 主 PRD F28；modules.md 边界规则末行（dp 不 import m1–m21）；设计稿 30 | 取舍 2 |
| snapshot_id/as_of/quality_status 业务依据 | 设定书 §7（输出合同"数据版本"）、§8 事故 13、§4 质量规则库；§2.2 八表字典（发现面） | 主干三/取舍 4 |

## 预计追问

1. **为什么不直接用 Cube 官方 MCP？** 三个硬理由：Cloud 托管端点（Premium/Enterprise）进不了油田内网；其工具集含模型编辑/仪表盘发布（9 个破坏性工具），与只读红线冲突；它只包语义层——我们 query 工具的价值恰是 dp9→dp6→dp5→dp7 四闸组合语义，任何单点官方款都不提供（取舍 1）。
2. **工具面被提示注入诱导写数据怎么办？** 结构性无解之门：五工具清单机查零写动词（主干四），dp1.append 调用方收敛 dp2/dp3——面上一无工具、底下一无权限；写请求只会得到带正道指引的 refused。
3. **arrow_summary 多大算"大"？** 合同只锁"摘要出门、全量不进工具面"：行级明细要拿走=导出，改走 dp9.export_report（审批+水印+presigned，DP9 主干三同构）——工具面不背大结果，上下文撑爆论点（F28 信源）在数据面同样成立。
4. **replay 时快照被 expire 了怎么办？** dp8 原样透传 dp7 的显式报错"快照已过保留窗口"，不静默换当前快照（DP-W-D7-3 同款）；保留窗口取舍归 dp7.retention_policy，工具面不造第二套策略。
5. **TableCard 的 tier/freshness/metrics 会不会和数据面元数据漂移？** dp8 零自持元数据：tier/freshness 直读 dp2 登记面（dp6 路由同源）、metrics 直查 dp4 目录（§3 指标卡）——单一事实源读取，工具面只是投影，无第二真源可漂移。
