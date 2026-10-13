# DataAgent 数据面模块划分（dp1–dp9）

> 来源: docs/prd-data-plane.md §4 功能清单 D1–D9 · 状态: 已定稿（PRD §9 决策 7）
> 分层：**数据层 dp1–dp3**（存/进/加工）→ **语义与服务层 dp4–dp7**（口径/执行/路由/审计）→ **Agent 接口层 dp8–dp9**（工具面/治理闸）。
> 目录骨架仅存在于 specs 与伪代码（本仓库不含可运行代码）；伪代码公开签名一律取自本文件卡。

## 目录骨架（伪代码位）

```
app/data_plane/
├── lake_store.py      # dp1
├── ingest.py          # dp2（+ deploy/flink/ 作业配置形状）
├── transform.py       # dp3（+ transform/dbt/ 项目形状）
├── semantic.py        # dp4（+ semantic/cube/ 数据模型形状）
├── query_runner.py    # dp5
├── freshness.py       # dp6
├── audit.py           # dp7
├── tools_mcp.py       # dp8
└── governance.py      # dp9
```

---

## 数据层

### dp1 湖底座 LakeStore

职责: 对象存储 + Iceberg 表的统一读写门面，屏蔽 catalog/存储/表格式差异。
规模档位: S1=JDBC catalog + 单机 MinIO；S2=REST catalog（Polaris/Nessie）+ 分布式 MinIO；S3=REST 目录联邦。
目录: `app/data_plane/lake_store.py`

#### 公开接口
- `load_catalog(backend: Literal["jdbc","rest","federated"], **cfg) -> Catalog`
- `Catalog.load_table(name: str) -> TableRef`
- `TableRef.schema() -> SchemaInfo`（列名/类型/注释/分区规格——Agent 问数的确定性信源）
- `TableRef.scan(pred: str | None, fields: tuple[str, ...], snapshot_id: int | None, limit: int) -> ArrowTable`
- `TableRef.snapshots() -> list[SnapshotInfo]`
- `Catalog.append(table: str, arrow: ArrowTable, commit_meta: dict) -> SnapshotInfo`（**仅 dp2/dp3 可调**）
- `TableRef.metrics() -> ColumnStats`（列级 min/max/null 计数——裁剪依据）

#### 依赖
- 模块: （无——最底层）
- 外部: MinIO/S3 端点、Iceberg catalog（JDBC/REST）、PyIceberg

#### Seam 与走查计划
- Seam: `Catalog`/`TableRef` 抽象。
- Adapter: `InMemoryLake`（内存 Arrow 表替身）；`FakeCatalog`。
- 测试计划: 档位切换只换 backend 配置不改调用方；按 snapshot 读一致；limit/谓词下推语义；append 权限收敛。

#### 参考锚点
minio-iceberg.md（PyIceberg API 形状/REST catalog/元数据树）、duckdb.md（iceberg 扩展对照）、s3.md（path-style/预签名）。

### dp2 进料 Ingest

职责: 把上游数据（班报批量 / 生产库 CDC）写入湖表，登记并暴露新鲜度档位元数据。
规模档位: S1=校验后脚本直写；S2=flink-cdc pipeline 与原生 Iceberg sink 双形状（exactly-once 归属分界见 flink.md）；S3=多源联邦进料。
目录: `app/data_plane/ingest.py`（+ `deploy/flink/` 作业配置形状）

#### 公开接口
- `register_freshness(table: str, tier: Literal["realtime","nearline","offline"], as_of: datetime, pipeline: str) -> None`
- `freshness(table: str) -> FreshnessInfo(tier, as_of, pipeline)`
- `run_batch_load(table: str, records: ArrowTable, provenance: Provenance(quality_report_id, operator)) -> SnapshotInfo`（S1；provenance 随 commit 落元数据——"入湖必过质检"由编排序与 dp9 闸保证，本卡只记录）
- `cdc_pipeline_spec(source_db: str, tables: list[str]) -> FlinkJobSpec`（S2；spec 内标注 sink 语义：native=exactly-once / pipeline=at-least-once+主键幂等）

#### 依赖
- 模块: `dp1`
- 外部: Flink / flink-cdc（S2+，仅产出配置形状与机制说明）

#### Seam 与走查计划
- Seam: `FreshnessRegistry`。
- Adapter: `StaticFreshness`（固定档位）。
- 测试计划: 档位登记后 dp6 可读；批量写入带 provenance；CDC spec 的两种 sink 语义标注正确。

#### 参考锚点
flink.md（CDC pipeline sink / 原生 sink / SQL Gateway 定位）、streaming-batch-warehouse.md（Lambda 双链路/流批一体三路线）、设定书 §2.1（五层链路/15 分钟闭环）。

> 对齐注记，2026-09-27；Owner 拍板"数据接入已安排数据面任务在实际开发"）：上游数据源形态在生产部署下可为**数据中台**（托管视图/API）替代直连生产库——此时进料链路不变（dp2 只认源清单与新鲜度登记），**映射卡＝平台与数据中台两边共同维护的约定**：语义面 mapping_cards（本体边→台账表固定落点，见本体数据全链路文档 §⑤）的对端就是 dp2 登记的源清单；数据中台侧改表/改接口时两边同改映射卡并版本化，平台侧不感知中台内部实现（与"数据面与平台语义侧只走公开面"边界规则同构）。A2 关系链下钻 demo 直查台账表；生产形态＝同一映射卡路由到数据中台源，对页面与 Agent 透明。

### dp3 加工与质量 Transform

职责: 把明细加工成可信中间层（staging→intermediate→marts），执行质量规则，产出 manifest 机器可读口径与血缘。
规模档位: S1=校验脚本直查 8 表；S2=dbt 项目（dbt-trino）；S3=dbt 多项目联邦。
目录: `app/data_plane/transform.py`（+ `transform/dbt/` 项目形状：`models/staging|intermediate|marts` + `schema.yml`）

#### 公开接口
- `validate_batch(table: str, rules: list[QualityRule]) -> QualityReport(passed, failures, rule_ids)`（S1：设定书 §4 的 20 条规则翻成规则对象）
- `rule_mapping() -> dict[rule_id, test_name]`（§4 规则 ID ↔ dbt test 名对照——质量闸主锚点）
- `build_marts() -> BuildResult(models_built, tests_passed, manifest_ref)`（S2：dbt build 形状）
- `lineage(model: str) -> LineageInfo(upstreams, downstreams, columns)`（读 manifest.json 的 parent_map/child_map）

> **（数据质量闭环，2026-09-28）**：QualityReport 下游补管理闭环——**隔离区**（坏行 payload+rule_id+batch_id 落 append-only 隔离表；schema 级故障整批拒收）、**问题单五态**（自动建单+按 规则×对象×数据日期 挂同单；复核=对修正批次自动重跑 validate_batch，全绿方可关闭，单记整改批次 ID）、**命中动作三档**（隔离/整批拒收/告警，锚定规则原文）、**安全类自动修**（归一/枚举/去重只作用派生层，留"原始值→修正值"痕迹；金额口径绝不）。接口契约=specs/api/E2-数据质量台.md v0.2；实现归 数据面服务仓 dp3 配套（实现票设计范围=tickets/105 附录 A）。调研依据=docs/research/2026-09-28。

#### 依赖
- 模块: `dp1`
- 外部: dbt / dbt-trino（S2+）

#### Seam 与走查计划
- Seam: `Runner`（dbt 执行器）。
- Adapter: `FakeDbt`（固定 manifest 与结果）。
- 测试计划: §4 规则 1/2/3/5/6 逐条翻 test 并可执行判断；合法 join 白名单（§5）只允许出现在 intermediate 层；lineage 双向可查。

#### 参考锚点
dbt.md（manifest schema/freshness.json/exposures/dbt-trino/dbt-starrocks）、streaming-batch-warehouse.md（ODS/DWD/DWS/ADS 分层，阿里 OneData 规范源）、设定书 §4/§5。

---

## 语义与服务层

### dp4 语义层 Semantic

职责: 把 15 条指标卡（设定书 §3）暴露成机器可读口径与结构化查询 schema；术语归一是问数入口的第一道闸。
规模档位: S1=静态 YAML 字典；S2=Cube 开源版（Trino 数据源）；S3=Cube 联邦/多实例。
目录: `app/data_plane/semantic.py`（+ `semantic/cube/` 数据模型 YAML 形状）

#### 公开接口
- `metric_catalog() -> list[MetricDef]`（名称/公式/单位/粒度/修饰词/Owner/权威源/ai_context——对应 Cube `/meta` 形状）
- `resolve_term(term: str) -> TermResolution(canonical, action: Literal["pass","rewrite","block"], note)`（§6：禁用词 block、别名 rewrite、黑话限语境）
- `build_query(metric: str, dims: list[str], time_window: TimeWindow, filters: dict) -> StructuredQuery`（measures/dimensions/timeDimensions/filters 四件套）
- `authoritative_source(metric: str) -> SourceRef`（一数四源仲裁结果，§8 事故 13）

#### 依赖
- 模块: `dp3`（manifest 只读——口径与模型对齐）
- 外部: Cube（/meta、/load 形状）

#### Seam 与走查计划
- Seam: `DictionaryBackend`。
- Adapter: `StaticYaml`（S1）；`FakeCube`。
- 测试计划: 指标 2"有效产量"两支口径=两个 measure（修饰词消歧）；禁用词"老完成率"拦截；"剔检产量"rewrite 为净产量口径；权威源回读（事故 13）。

#### 参考锚点
cube-semantic-layer.md（meta.ai_context/securityContext/REST /meta /sql）、设定书 §3/§6/§8.13、dataagent-stack-map.md §3.5。

### dp5 执行适配 QueryRunner

职责: 统一结构化查询的执行门面：同一 `StructuredQuery` 按档位路由到 DuckDB/Trino/StarRocks，返回 Arrow + 快照号 + 统计。
规模档位: S1=DuckDB 进程内；S2=Trino（默认）或 StarRocks + DuckDB 沙箱末端；S3=多引擎并存。
目录: `app/data_plane/query_runner.py`

#### 公开接口
- `run(query: StructuredQuery, snapshot_id: int | None = None) -> QueryResult(arrow, snapshot_id, stats(rows_scanned, bytes, engine))`
- `sandbox_query(table: str, pred: str, fields: tuple[str, ...], limit: int) -> ArrowTable`（DuckDB 末端：dp1 scan→Arrow→DuckDB 本地聚合）
- `engines() -> list[EngineInfo(name, tier)]`

#### 依赖
- 模块: `dp1`、`dp4`（StructuredQuery 定义在 dp4）
- 外部: DuckDB、Trino / StarRocks（二选一为交互引擎，决策 PRD §9-3）

#### Seam 与走查计划
- Seam: `EngineAdapter`（duckdb/trino/starrocks 三实现）。
- Adapter: `RecordedEngine`（固定结果回放）。
- 测试计划: 同一 query 三后端翻译同构（只换方言形状）；limit/成本护栏（超限拒绝或采样声明）；snapshot_id 透传。

#### 参考锚点
duckdb.md（to_arrow_table/httpfs/iceberg ATTACH）、minio-iceberg.md（Trino/StarRocks 接入形状）、cube-semantic-layer.md（SQL API 对照）。

### dp6 新鲜度路由 FreshnessRouter

职责: 问题时间窗 × 表新鲜度档位 → 三出口（答实时面 / 答离线面 / 拒答并诚实声明）。
规模档位: S1=单档直通（全部 offline，仍声明截至时点）；S2/S3=完整路由。
目录: `app/data_plane/freshness.py`

#### 公开接口
- `route(window: TimeWindow, metric: str) -> RouteDecision(answerable, source_tier, declared_as_of | refusal_reason)`
- `refusal_text(decision: RouteDecision) -> str`（拒答话术合同：声明"数据截至 X，未覆盖您问的 Y"，不编数）

#### 依赖
- 模块: `dp2`（freshness 元数据）、`dp4`（指标粒度）
- 外部: （无）

#### Seam 与走查计划
- Seam: `Clock`。
- Adapter: `FakeClock`（冻结时间）。
- 测试计划: 月度指标 × "今天上午" → 拒答并声明；realtime 档 × 日内问题 → 答并声明口径与离线面差异（事故 13 意识）。

#### 参考锚点
streaming-batch-warehouse.md（Lambda 双链路对账/流批一体）、flink.md（新鲜度进料）、设定书 §8 事故 13。

### dp7 快照审计 Audit

职责: 结论绑定快照四元组（问题/查询/snapshot_id/口径版本+质量状态），支持按同快照回放校验。
规模档位: —（全档；S3 加对账作业与集团审计面形状）。
目录: `app/data_plane/audit.py`

#### 公开接口
- `record(question_id: str, query: StructuredQuery, snapshot_id: int, semantic_version: str, quality_status: str) -> AuditRef`
- `replay(ref: AuditRef) -> ReplayResult(match: bool, original, current)`（按记录快照重跑 dp5 比对；快照已过期 → 明确报错不静默）
- `retention_policy() -> RetentionPolicy`（快照保留窗口取舍，对齐 Wiki 版两层保留窗口纪律的思路）

#### 依赖
- 模块: `dp1`（snapshots）、`dp5`（重跑执行）
- 外部: （无）

#### Seam 与走查计划
- Seam: `AuditStore`。
- Adapter: `InMemoryAudit`。
- 测试计划: 同快照重放结果一致（match=True）；快照过期显式报错；record 落四元组齐全。

#### 参考锚点
minio-iceberg.md（time travel/snapshot 语义）、设定书 §7（输出合同"数据版本"）、两层快照保留窗口纪律。

---

## Agent 接口层

### dp8 数据工具面 DataTools

职责: 把 dp1/dp4/dp5/dp6/dp7 的能力暴露为问数 Agent 的**五个只读工具**（S1=进程内函数；S2+=MCP server）。
规模档位: S1=进程内直调；S2=自建 MCP server（对齐 Polaris MCP/Databricks MCP/MotherDuck MCP 的"目录即工具"叙事）；S3=MCP server 池。
目录: `app/data_plane/tools_mcp.py`

#### 公开接口（五工具合同，输入输出 JSON schema）
- `discover_tables(prefix: str | None) -> list[TableCard(name, tier, freshness, metrics)]`
- `describe_table(name: str) -> TableSchema(columns, partition_spec, current_snapshot, metrics_linked)`
- `query(metric: str, dims: list[str], window: TimeWindow, filters: dict) -> AnswerBundle(arrow_summary, snapshot_id, quality_status, as_of)`（内部强制先经 dp9.check_join + dp6.route）
- `replay(audit_ref: str) -> ReplayResult`
- `lineage(table_or_metric: str) -> LineageInfo`
- `serve_mcp() -> MCPServerSpec`（S2+：server 配置/工具清单/**只读红线——无任何湖表写工具**）

#### 依赖
- 模块: `dp1`、`dp4`、`dp5`、`dp6`、`dp7`、`dp9`
- 外部: MCP 协议（S2+ 形状）

#### Seam 与走查计划
- Seam: `ToolTransport`（in_process / mcp 两实现）。
- Adapter: 直调（S1 形态即测试形态）。
- 测试计划: 五工具 JSON 合同逐字段；每条工具的拒绝路径都经 dp9；query 工具的 AnswerBundle 四元组齐全。

#### 参考锚点
cube-semantic-layer.md（MCP server 归属 Cloud/开源版之辨）、minio-iceberg.md（REST catalog 即接缝）、duckdb.md（MotherDuck MCP 官方款）、data-fabric.md（agentic 叙事）、主 PRD F28。

### dp9 治理控制面 Governance

职责: 横切闸：合法 join 白名单（默认拒绝）、行级权限（三作业区隔离）、导出审批、S3 策略即代码与凭证下发。
规模档位: S1=静态白名单 YAML；S2=Cube securityContext + dbt tests 闸 + 导出审批；S3=策略引擎 + credential vending。
目录: `app/data_plane/governance.py`

#### 公开接口
- `check_join(query: StructuredQuery) -> Decision(allowed, violated_edges)`（设定书 §5 白名单，默认拒绝）
- `authorize(ctx: UserContext, table: str, action: Literal["read","export"]) -> Decision`（行级：作业区隔离，§1）
- `export_report(artifact: bytes, watermark_level: str) -> PresignedUrl`（S2+ 审批位）
- `vend_credentials(table: str, ttl: timedelta) -> CredentialRef`（S3 形状：短期表级凭证）

#### 依赖
- 模块: （无——被 dp5/dp8 依赖）
- 外部: Cube securityContext（S2）、策略引擎（S3 形状）

#### Seam 与走查计划
- Seam: `PolicyBackend`。
- Adapter: `StaticPolicy`（YAML 白名单/权限表）。
- 测试计划: `oil_production_daily ⋈ fluid_test` 直连拒绝（须双键+时间容差经 intermediate）；作业区越权拒绝；无审批导出拒绝。

#### 参考锚点
设定书 §5（合法 join 白名单）/§1（组织与作业区）、cube-semantic-layer.md（securityContext/query_rewrite）、data-fabric.md（策略即代码/credential vending）。

---

## 依赖图（无环）

```
dp1 ← dp2 ← （上游数据源）
dp1 ← dp3 ← dp4
dp1 ← dp5 ← dp7        dp4 ← dp5
dp2 ← dp6 → dp4
dp1/dp4/dp5/dp6/dp7/dp9 ← dp8
dp9 ← dp5, dp8
```

## 规模映射矩阵（模块 × 档位：换的是适配器，不是接口）

| 模块 | S1 边缘档 | S2 平台档 | S3 集团档 |
|---|---|---|---|
| dp1 | JDBC catalog + 单机 MinIO | REST catalog + 分布式 MinIO | REST 目录联邦 |
| dp2 | 校验后脚本直写 | flink-cdc pipeline / 原生 sink | 多源联邦 |
| dp3 | 校验脚本（20 规则直查） | dbt-trino 单项目 | dbt 多项目 |
| dp4 | 静态 YAML 字典 | Cube 开源版 | Cube 联邦 |
| dp5 | DuckDB 进程内 | Trino（默认）/StarRocks + DuckDB 末端 | 多引擎 |
| dp6 | 单档直通+声明 | 完整路由 | 完整路由+跨域 |
| dp7 | 快照号记录 | +对账作业 | +集团审计面 |
| dp8 | 进程内函数 | 自建 MCP server | MCP server 池 |
| dp9 | 白名单 YAML | securityContext+审批 | 策略引擎+vending |

## 边界规则（边界闸唯一事实来源；本仓库无 CI——以伪代码走查自查代闸）

| 禁止 | 例外 | 理由 |
|---|---|---|
| `dp5` 绕过 `dp1` 直连 S3 SDK / 引擎原生文件访问 | （无） | 对象访问面收敛 LakeStore，档位切换才可能 |
| `dp8` 绕过 `dp9` 放行任何查询/导出 | （无） | 治理闸是工具面唯一放行路径 |
| `dp6` 读湖表数据（只许读 dp2 档位元数据与 dp4 粒度） | （无） | 路由判定不得为"先查了再说"开后门 |
| `dp4` 发明口径（指标定义只来自 dp3 manifest 与设定书 §3 指标卡） | （无） | 语义层是口径唯一暴露面，禁止第二真源 |
| `dp1.append` 被 dp2/dp3 之外的模块调用 | dp1 自身测试替身 | 湖表写面收敛进料/加工两管道，Agent 五工具全只读 |
| `dp7.replay` 用当前快照替代记录快照 | （无） | 回放的语义就是"那一版" |
| 任何 dp 模块 import 平台 m1–m21 内部实现 | （无） | 数据面与平台语义侧只走公开面（HTTP/工具合同） |

## 页面映射

N/A——PRD 无 `## 页面清单`（无新 Web 页面，问数界面属主 PRD F7 / prototype/）。
