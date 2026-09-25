# 数据面走查规格（D1–D9）

> 与 docs/prd-data-plane.md 功能清单 D1–D9 一一对应；断言是设计合同：每条 checkbox 注源到 DP-W-ID；各模块实现逐条对账（伪代码走查段标 `文件:函数`）。
> 走查列的 `文件:函数` 全部来自 specs/data-plane/modules.md 目录骨架（app/data_plane/*，仅存在于伪代码）；调用路径沿模块卡依赖行可走通。业务事实一律 `设定书 §x`；技术形状一律 docs/tech-stack/ 分册。成功路径与错误路径（捣乱输入被闸拦/拒答）同等对待。

## D1 湖底座与表格式（dp1）

目标: 三档规模统一的对象存储 + Iceberg 访问门面；schema/分区/快照是问数的确定性信源。
不做什么: 不做 compaction 调优与引擎 SQL 优化器。

| 断言 ID | 给定（输入/前条件） | 走查（调用路径，标 文件:函数） | 期望（可观察行为） |
|---|---|---|---|
| `DP-W-D1-1` | S1 档配置 `backend="jdbc"` 加载 oil_production_daily | `app/data_plane/lake_store.py:load_catalog` → `Catalog.load_table` → `TableRef.schema` | 返回列名/类型/注释/分区规格四件齐的 SchemaInfo；换 `backend="rest"` 时调用方代码零改动（只换配置） |
| `DP-W-D1-2` | 对同一表先后两次 append，再按旧 snapshot_id 读 | `TableRef.scan(snapshot_id=旧)` | 读到 append 前的数据视图（快照隔离，不脏读） |
| `DP-W-D1-3` | scan 带 `pred="prod_date>='2026-09-01'"` 与字段子集 | `TableRef.scan` | 返回 ArrowTable 仅含谓词命中行与所选列；ColumnStats 可解释裁剪依据（分区/列 min/max） |
| `DP-W-D1-4` | 非进料/加工模块调用 `Catalog.append` | 边界规则检查（dp1.append 调用方审计） | 违规调用在走查自查中报越界；Agent 工具面无任何写入口 |

状态: 已实现（2026-09-24 对账：35 条断言全部对上，签名一致，边界 7/7；3 处表面偏差已收敛）

## D2 实时进料与新鲜度（dp2）

目标: 批/流两条进料路径把数据写进湖表，且每张表携带新鲜度档位元数据供路由消费。
不做什么: 不做流式持续聚合的完整实现；不做调度系统。

| 断言 ID | 给定（输入/前条件） | 走查（调用路径，标 文件:函数） | 期望 |
|---|---|---|---|
| `DP-W-D2-1` | S1：资料员提交班报批（含 A/B 班重复行样本，设定书 §A.2） | `transform.py:validate_batch`（先）→ `ingest.py:run_batch_load`（后，带 provenance） | 校验报告不合格行被拦；合格批写入后 SnapshotInfo.provenance 含 quality_report_id |
| `DP-W-D2-2` | S2：为 oil_production_daily 生成 CDC 管道 spec | `ingest.py:cdc_pipeline_spec` | 返回 FlinkJobSpec，sink 语义字段明确标注 native=exactly-once / pipeline=at-least-once+主键幂等（flink.md 分界） |
| `DP-W-D2-3` | CDC 写入完成后 | `ingest.py:register_freshness(tier="realtime", as_of=…)` → `freshness()` | dp6 可读到该表档位与截至时点；未登记表 freshness 返回 unknown |
| `DP-W-D2-4` | 设定书 §4 规则 11（传感器零值 2 小时告警）作为实时域规则进入 spec | `deploy/flink/` 作业形状 + `ingest.py:register_freshness` | 告警流标注 realtime 档；文档注明"设定书自标为演绎设定，唯一实时域锚" |

状态: 已实现（2026-09-24 对账：35 条断言全部对上，签名一致，边界 7/7；3 处表面偏差已收敛）

## D3 离线 T 层与质量闸（dp3）

目标: 明细 → 可信中间层；20 条质量规则（设定书 §4）翻成可执行 tests；manifest 提供口径血缘。
不做什么: 不做调度选型与实现；不做 dbt Cloud（开源 Core 形态）。

| 断言 ID | 给定（输入/前条件） | 走查（调用路径，标 文件:函数） | 期望 |
|---|---|---|---|
| `DP-W-D3-1` | 规则 1：oil_production_daily.(well_id,prod_date) 唯一性，输入含 A/B 班重复行 | `transform.py:validate_batch` / `transform/dbt/schema.yml` 对应 test | 校验 fail 且 failures 定位到重复 (well_id, prod_date)；`rule_mapping()` 可查 rule-1 ↔ test 名 |
| `DP-W-D3-2` | 规则 3：单位一致性，输入含"12.40 方"误录行（设定书 §A.2） | 同上 | 折算密度越出 [0.82,0.98] t/m³ 判 fail（§4 规则 3 阈值） |
| `DP-W-D3-3` | marts 模型引用 fluid_test | `transform/dbt/models/intermediate/` 形状 | 直连被模型边界禁止：必须经 intermediate（双键+时间容差，设定书 §5）；`lineage()` 能给出该路径 |
| `DP-W-D3-4` | build_marts 执行（FakeDbt） | `transform.py:build_marts` | BuildResult 含 models/tests/manifest_ref 三项；manifest_ref 可被 dp4 读取 |

状态: 已实现（2026-09-24 对账：35 条断言全部对上，签名一致，边界 7/7；3 处表面偏差已收敛）

## D4 语义层口径暴露（dp4）

目标: 15 条指标卡（设定书 §3）成为机器可读口径；术语归一（§6）是问数入口第一闸；权威源仲裁（§8 事故 13）。
不做什么: 不做指标审批流（属平台 F13/F20）。

| 断言 ID | 给定（输入/前条件） | 走查（调用路径，标 文件:函数） | 期望 |
|---|---|---|---|
| `DP-W-D4-1` | `metric_catalog()` 全量拉取 | `semantic.py:metric_catalog` | 返回 15 条 MetricDef，每条含公式/单位/粒度/修饰词/Owner/权威源/ai_context 七件（对应 §3 卡片字段） |
| `DP-W-D4-2` | 问"有效产量"不带给修饰词 | `semantic.py:build_query` | 返回两支口径的消歧询问（开井日历折算/检修剔除——§3 指标 2），不擅自二选一 |
| `DP-W-D4-3` | 用户说"老完成率"（禁用词） | `semantic.py:resolve_term` | action=block，note 指向替代词"产量完成率"（§6） |
| `DP-W-D4-4` | 用户说"剔检产量" | `semantic.py:resolve_term` | action=rewrite 为净产量口径（§6 别名） |
| `DP-W-D4-5` | "油气产量"一数四源（§8 事故 13） | `semantic.py:authoritative_source` | 返回唯一权威 SourceRef 并携带仲裁注记（实时加和 vs 统计上报差 3.2% 的口径说明） |

状态: 已实现（2026-09-24 对账：35 条断言全部对上，签名一致，边界 7/7；3 处表面偏差已收敛）

## D5 查询执行适配（dp5）

目标: 同一 StructuredQuery 三后端（DuckDB/Trino/StarRocks）同构执行，返回 Arrow+快照号+统计。
不做什么: 不做引擎运维与调优。

| 断言 ID | 给定（输入/前条件） | 走查（调用路径，标 文件:函数） | 期望 |
|---|---|---|---|
| `DP-W-D5-1` | 同一 StructuredQuery 分别配 duckdb/trino 后端 | `query_runner.py:run`（EngineAdapter 两实现） | 两后端返回同构 QueryResult（同 snapshot_id 透传、同 stats 结构），方言差异封在 adapter 内 |
| `DP-W-D5-2` | S1 沙箱试算：well_daily 表谓词+字段+limit | `query_runner.py:sandbox_query`（dp1 scan→Arrow→DuckDB） | 进程内返回 ArrowTable，零服务端依赖；设计文档给出与 PyIceberg 链路的衔接（duckdb.md） |
| `DP-W-D5-3` | limit 超过成本护栏（如 10 万行） | `query_runner.py:run` | 拒绝执行或降级采样并显式声明，不静默全表扫 |
| `DP-W-D5-4` | snapshot_id 传入 run | 同上 | 结果可追溯到该快照（Result.snapshot_id 与请求一致） |

状态: 已实现（2026-09-24 对账：35 条断言全部对上，签名一致，边界 7/7；3 处表面偏差已收敛）

## D6 新鲜度路由与拒答（dp6）

目标: 按问题时间窗 × 档位三出口路由，拒答必须诚实声明。
不做什么: 不做预测类问题处理。

| 断言 ID | 给定（输入/前条件） | 走查（调用路径，标 文件:函数） | 期望 |
|---|---|---|---|
| `DP-W-D6-1` | 月度指标"产量完成率" × 问题窗"今天上午" | `freshness.py:route` | answerable=False，refusal_reason=档位 offline 且窗口粒度不符（§3 指标 1 粒度=月） |
| `DP-W-D6-2` | 拒答决策进入话术合同 | `freshness.py:refusal_text` | 文本含"数据截至 X，未覆盖您问的 Y"，零编数（诚实框架纪律） |
| `DP-W-D6-3` | realtime 档注水比 × 日内问题（S2） | `freshness.py:route` | answerable=True 走实时面，declared_as_of 与口径差异声明在场（事故 13 意识：实时加和≠统计上报） |

状态: 已实现（2026-09-24 对账：35 条断言全部对上，签名一致，边界 7/7；3 处表面偏差已收敛）

## D7 快照审计与回放（dp7）

目标: 结论绑定快照四元组，审计按同快照重放（设定书 §7"数据版本"的工程落地）。
不做什么: 不做全平台 OTel 可观测（F29）。

| 断言 ID | 给定（输入/前条件） | 走查（调用路径，标 文件:函数） | 期望 |
|---|---|---|---|
| `DP-W-D7-1` | 一次成功作答 | `audit.py:record` | AuditRef 落四元组：question_id/StructuredQuery/snapshot_id/semantic_version+quality_status 齐全 |
| `DP-W-D7-2` | 按已有 AuditRef 回放，表未变 | `audit.py:replay`（dp5 按记录快照重跑） | match=True，original 与 current 逐行一致（剧本 1 归因报告可回放，§7） |
| `DP-W-D7-3` | 记录的快照已被 expire 清理 | `audit.py:replay` | 显式报错"快照已过保留窗口"，不静默用当前快照替代；retention_policy() 给出窗口取舍 |

状态: 已实现（2026-09-24 对账：35 条断言全部对上，签名一致，边界 7/7；3 处表面偏差已收敛）

## D8 Agent 数据工具面（dp8）

目标: 五个只读工具成为问数 Agent 与数据面的唯一接缝；S2+ 以 MCP server 形态暴露。
不做什么: 不做 A2A AgentCard（F28）；不做任何湖表写工具。

| 断言 ID | 给定（输入/前条件） | 走查（调用路径，标 文件:函数） | 期望 |
|---|---|---|---|
| `DP-W-D8-1` | Agent 问"有哪些表可查" | `tools_mcp.py:discover_tables` | TableCard 含 name/tier/freshness/metrics；S1=in_process 传输，S2+=MCPServerSpec（serve_mcp） |
| `DP-W-D8-2` | Agent 发起 query（合法指标+窗口） | `tools_mcp.py:query`（内部 dp9.check_join → dp6.route → dp5.run → dp7.record） | AnswerBundle 四件齐：arrow_summary/snapshot_id/quality_status/as_of；任一闸拒绝则整体拒绝并带原因 |
| `DP-W-D8-3` | Agent 请求写湖表 / 增删改数据 | 工具清单审计 | 五工具之外无写入口（只读红线）；请求被拒并提示走 dp2/dp3 管道 |
| `DP-W-D8-4` | Agent 问"这个数从哪来" | `tools_mcp.py:lineage` / `replay` | lineage 给上游模型链（dp3 manifest）；replay 按 AuditRef 回放（衔接 DP-W-D7-2） |

状态: 已实现（2026-09-24 对账：35 条断言全部对上，签名一致，边界 7/7；3 处表面偏差已收敛）

## D9 治理控制面（dp9）

目标: join 白名单默认拒绝、行级作业区隔离、导出审批、S3 凭证下发——横切闸在 SQL 生成前生效。
不做什么: 不做完整 fabric 产品实现（理念对照）。

| 断言 ID | 给定（输入/前条件） | 走查（调用路径，标 文件:函数） | 期望 |
|---|---|---|---|
| `DP-W-D9-1` | query 含 oil_production_daily ⋈ fluid_test 直连 | `governance.py:check_join` | allowed=False，violated_edges 指明须经 intermediate（双键+时间容差，设定书 §5） |
| `DP-W-D9-2` | 渤中作业区用户查渤南井数据 | `governance.py:authorize` | read 被拒（行级隔离，设定书 §1 三作业区） |
| `DP-W-D9-3` | 无审批导出全量明细 | `governance.py:export_report` | 拒绝并要求审批位（S2+）；带审批 watermark 后返回 presigned URL（s3.md 预签名形状） |
| `DP-W-D9-4` | S3：Agent 工具需要临时访问新表 | `governance.py:vend_credentials` | 返回短时效 CredentialRef（ttl 到期失效），不落长期密钥（credential vending 形状，minio-iceberg.md/data-fabric.md） |

状态: 已实现（2026-09-24 对账：35 条断言全部对上，签名一致，边界 7/7；3 处表面偏差已收敛）
