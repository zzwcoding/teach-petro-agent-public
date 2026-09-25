# 设计稿 DP2：进料与新鲜度（dp2）

> **红线声明**：本设计稿零真实可运行代码。全部代码块均为**伪代码**（块首标注"伪代码 — 文件:函数"或"伪代码形状"），公开签名取自模块卡 dp2（specs/data-plane/modules.md：`register_freshness` / `freshness` / `run_batch_load` / `cdc_pipeline_spec`）；`deploy/flink/` 只产**配置形状**——YAML/DDL 键位逐字照 docs/tech-stack/flink.md 模式 1/2，分册里没有的 connector 参数名一个不写。
> **框架红线**（设计范围）：Flink / flink-cdc 只产配置形状与机制讲解，不引入依赖、不真跑。sink 语义分界逐字对照 flink.md：**Flink Iceberg 原生 sink = "guarantees exactly-once semantics"（checkpoint 恢复状态 + sink 侧两阶段提交，FLIP-191）；flink-cdc pipeline sink = "Exactly-once semantics are not supported. at-least-once + the table's primary key for idempotent writing"（且源表必须有主键）**。
> **接线边界**：dp2 只依赖 dp1——湖表写面收敛（`Catalog.append` 仅 dp2/dp3 可调，边界规则表）；"入湖必过质检"是**编排序纪律**（dp3 的 `validate_batch` 先行 + dp9 闸 + 设定书 §4 质量闭环），dp2 不实现质检、只在 provenance 里记录 `quality_report_id`；不读湖表以外数据；新鲜度档位元数据是 dp6 路由的唯一读面（边界规则表：dp6 只许读 dp2 档位元数据与 dp4 粒度）。
> **明确不讲的**：质检规则对象与 `rule_mapping()`（设计稿 DP3）；新鲜度路由三出口与拒答话术（设计稿 DP6）；对账作业执行与快照保留窗口（设计稿 DP7）；小文件治理/compaction 运维（flink.md 模式 3 有一手形状，归维护位）；调度系统与流式持续聚合的完整实现（走查规格 D2"不做什么"）。

## 实现清单

- [x] `DP-W-D2-1` S1 班报批（A/B 班重复行，设定书 §A.2）先 `validate_batch`（dp3 S1 形态）后 `run_batch_load`，不合格行被拦；合格批 `SnapshotInfo.provenance` 含 `quality_report_id` ✅ **走查 1**
- [x] `DP-W-D2-2` `cdc_pipeline_spec("oltp", ["oil_production_daily"])` 返回 FlinkJobSpec，`sink_semantics` 明确标注 native=exactly-once / pipeline=at-least-once+主键幂等（flink.md 分界逐字）✅ **走查 2**
- [x] `DP-W-D2-3` CDC 写入完成后 `register_freshness(tier="realtime")` → `freshness()` dp6 可读档位与截至时点；未登记表返回 unknown ✅ **走查 2 步 3**
- [x] `DP-W-D2-4` 设定书 §4 规则 11（传感器零值 2 小时告警）进 `deploy/flink/` 作业形状，告警流登记 realtime 档，注明"设定书自标设计演绎，唯一实时域锚" ✅ **走查 3**
- [x] 规模矩阵 dp2 行：三档进料形态各一节（S1 校验后脚本直写 / S2 flink-cdc pipeline 与原生 sink 双形状 / S3 多源联邦一句钩子）；Lambda 双链路与对账作业讲机制（Marz 2011 / Kreps 2014 一手出处）✅ **走查 1/2/4**
- [x] 取舍 ≥4 条：pipeline vs 原生 sink（exactly-once 归属）、Lambda vs Kappa vs 流批一体、15 分钟闭环档位映射、质检闸为什么在编排层不在 dp2 内 ✅ **取舍 1–5**
- [x] 锚点对照：flink.md / streaming-batch-warehouse.md / 设定书 §x → 断言 ID ✅ **锚点对照表**

---

## 伪代码走查

> **主角数据**（业务真数据样子，随行标注）：① 资料员阿强交班报批——N-02 井 2026-09-14 的 A/B 班两行逐格相同（重复行）、N-11 井 oil_output 误录 `12.40方`（设定书 §A.2 样本行）；② 生产库 oil_production_daily 开 CDC（设计替身链路"井口→实时库→生产库 8 表→平台"，设定书 §2.1）；③ 传感器零值告警是设定书留给实时域的唯一钩子（§4 规则 11）。

### 走查 1：S1 批量链路时序——校验先于入湖（DP-W-D2-1）

```python
# 伪代码 — 编排时序（S1 档"校验后脚本直写"；validate_batch 是 dp3 的 S1 形态，本卡只调不实现）
report = transform.validate_batch("oil_production_daily", rules=QUALITY_RULES_20)
# QualityReport(passed, failures, rule_ids)（dp3 卡签名）——走查样本判定：
#   N-02 的 (2026-09-14, A/B) 两行 → 规则 1（(well_id,prod_date) 唯一性，设定书 §4 规则 1）fail，failures 定位重复键
#   N-11 `12.40方` → 规则 3（折算密度∈[0.82,0.98] t/m³，设定书 §4 规则 3）fail
# 主干判断：passed=False → 拦截，run_batch_load 不执行（不合格行被拦；整改走 §4 质量闭环问题单）
if not report.passed:
    raise BatchRejected(rule_ids=report.rule_ids)      # 质检闸在编排层，dp2 不自带质检（取舍 4）

snapshot = ingest.run_batch_load(
    "oil_production_daily", records=clean_batch_arrow,
    provenance=Provenance(quality_report_id=report.report_id, operator="阿强·资料员"))
# run_batch_load 内部契约（S1 主干三步）：
#   ① TableRef.schema() 对齐列名/类型（dp1 是唯一读写面，不绕过）；
#   ② Catalog.append(table, records, commit_meta={"provenance": provenance})——append 仅 dp2/dp3 可调；
#   ③ 返回 SnapshotInfo，其 provenance 含 quality_report_id（DP-W-D2-1 落点：质检证据随 commit 落元数据）
register_freshness("oil_production_daily", tier="offline",
                   as_of=snapshot.committed_at, pipeline="batch-shift-report")
# 班报批=T+1 离线档（8 表日粒度是主体，设定书 §2.2/附录 A）
```

### 走查 2：S2 CDC 双形状——spec 产配置形状 + 新鲜度登记（DP-W-D2-2 / D2-3）

```python
# 伪代码 — app/data_plane/ingest.py
_FRESH: dict[tuple[str, str], FreshnessInfo] = {}   # Seam: FreshnessRegistry（Adapter: StaticFreshness 设计替身）

def register_freshness(table: str, tier: Literal["realtime", "nearline", "offline"],
                       as_of: datetime, pipeline: str) -> None:
    # 契约：登记"表×管道"的档位元数据；调用时机=CDC 作业成功 commit 后 / 批量 append 返回后
    # 主干判断：tier 必须落在三枚举内；同表多链路=多条登记（pipeline 字段区分，Lambda 双链路的登记面）
    _FRESH[(table, pipeline)] = FreshnessInfo(tier=tier, as_of=as_of, pipeline=pipeline)

def freshness(table: str) -> FreshnessInfo(tier, as_of, pipeline):
    # 契约：dp6 路由的唯一数据面（dp6 只读档位元数据，不许"先查湖表再说"）
    # 主干判断：未登记 → FreshnessInfo(tier="unknown", as_of=None, pipeline=None)（DP-W-D2-3：dp6 据此声明不可答）；
    #           同表多链路 → 返回 as_of 最新一条（哪条链路刚 commit 就声明哪条；差异对账见走查 4）
    ...

def cdc_pipeline_spec(source_db: str, tables: list[str]) -> FlinkJobSpec:
    # 契约：给定源库与表清单，产出可部署的作业配置形状（deploy/flink/ 下 YAML/SQL 文本），dp2 内不执行
    # 主干判断：两变体二选一或并列产出；spec 必带 sink_semantics 语义标签与 freshness_contract（成功 commit → register_freshness）
    return FlinkJobSpec(variant="pipeline", source_db=source_db, tables=tables,
                        config_ref="deploy/flink/cdc_oil_daily.pipeline.yaml",
                        sink_semantics="at-least-once + 主键幂等",        # flink.md 分界，逐字
                        freshness_contract=freshness_on_commit(tier="realtime"))
```

```yaml
# 伪代码形状 — deploy/flink/cdc_oil_daily.pipeline.yaml（键位逐字照 flink.md 模式 1；来源 flink-cdc 3.6 Iceberg pipeline connector 文档）
source:
  type: mysql
  hostname: oltp.petro.internal
  tables: production.oil_production_daily      # 生产库增量表（设计替身，设定书 §2.1）
sink:
  type: iceberg
  name: iceberg-sink
  catalog.properties.type: hadoop              # 或 hive/glue + 自定义 impl
  catalog.properties.warehouse: s3://warehouse/   # MinIO 桶（依赖 iceberg-flink-runtime-1.20 jar）
  table.properties.format-version: "2"
pipeline:
  route:
    - source-table: production.oil_production_daily
      sink-table: ods.oil_production_daily
      partition-key: prod_date                 # 支持 day/hour/truncate[10]/bucket[10] 等变换
# 语义红线（flink.md 逐字）：pipeline sink = at-least-once + 湖表主键幂等，非 exactly-once；源表必须有主键；
# 3.4 起官方 sink 附带：自动建表、加列 schema 变更自动传播、批+流两种同步
```

```sql
-- 伪代码形状 — deploy/flink/cdc_oil_daily.native.sql（变体 B：Flink SQL 原生 iceberg sink；键位照 flink.md 模式 2）
CREATE TABLE rt_oil_production_daily (
  well_id STRING, prod_date DATE, oil_output DECIMAL(10,2), water_cut DOUBLE, report_shift CHAR(1),
  PRIMARY KEY (well_id, prod_date) NOT ENFORCED   -- upsert 前提：v2 表 + 主键
) WITH ('connector'='iceberg', 'format-version'='2', 'write.upsert.enabled'='true',
        'catalog-type'='rest', 'uri'='http://rest-catalog:8181', 'warehouse'='s3://warehouse/');
-- 语义（flink.md 逐字）：Flink Iceberg sink "guarantees exactly-once semantics"——checkpoint 恢复状态 + sink 两阶段提交；
-- upsert 仅限 v2 表；流作业不支持 INSERT OVERWRITE；新 IcebergSink(SinkV2) 仍 experimental（use-v2-sink 开关）
```

> **步 3（DP-W-D2-3）**：CDC 作业成功 commit 出新快照 → `register_freshness("oil_production_daily", tier="realtime", as_of=快照时间, pipeline="cdc-pipeline")` → dp6 调 `freshness()` 读到 realtime 档与截至时点；查一张从未登记的表 → `tier="unknown"`，dp6 走"声明不可答"出口，不猜档位。

### 走查 3：实时域唯一钩子——规则 11 告警流（DP-W-D2-4）

```yaml
# 伪代码形状 — deploy/flink/rt_zero_alert.job.yaml
# 业务源：设定书 §4 规则 11"传感器零值：2 小时零值告警 [孙华]"——卡片自标"实时域规则（设计演绎）"，设定书唯一实时域锚；
#        遥测链路取 §2.1 五层（井口传感器→Modbus→边缘计算→实时库→ETL 入仓），设计替身只留"实时库→平台"一段
# 机制（flink.md 事件时间语义）：传感器遥测为流 → 事件时间 + watermark 声明进度，窗口确定性闭合，迟到走 allowed lateness
# 主干判断：某遥测点值=0 持续跨满 2 小时窗 → 产出告警事件一条 → 写告警湖表
# 新鲜度登记（DP-W-D2-4 落点）：
#   register_freshness("rt_zero_value_alerts", tier="realtime", as_of=事件时间, pipeline="flink-rt-alerts")
# 诚实声明：设定书 8 表以日粒度为主，realtime 档只有规则 11 这一个钩子——不为演示发明第二条实时业务规则
```

### 走查 4：Lambda 双链路与对账作业机制（streaming-batch-warehouse.md 模式 1 对照）

```text
伪代码（机制图，微缩）
生产库 8 表 ──CDC──▶ Flink ──▶ 湖表实时面（pipeline/native 双形状，登记 realtime 档）
   └──批线──▶ 班报批 validate_batch → run_batch_load（offline 档，T+1 幂等重跑）
每日对账作业（执行归 dp7 S2 档"对账作业"；dp2 只负责两条链路各自登记档位，供其取数与声明）：
  实时面结果 ↔ 离线面结果 逐指标比对
  ├─ 偏差≤阈值 → 以离线面为准，实时面被覆盖（Marz 铁律：realtime 层产出最终被批层覆盖）
  └─ 偏差>阈值 → 告警进问题单（§4 质量闭环）；口径仲裁交 dp4 语义层（§8 事故 13：实时加和 vs 统计上报差 3.2%）
# 一手出处：Lambda = Nathan Marz《How to beat the CAP theorem》(2011)；双链路代价与 Kappa =
# Jay Kreps《Questioning the Lambda Architecture》(O'Reilly Radar, 2014-07-02)
```

> 阈值取值沿 §4 规则族同款纪律（如规则 12 物质平衡勾稽 3%），不另发明数。S3 多源联邦进料：`cdc_pipeline_spec` 按 source_db 复多份 spec + 多 catalog 登记形状，本设计稿只留钩子不展开（dp1 S3 目录联邦同构）。

---

## 取舍

1. **flink-cdc pipeline vs 原生 Iceberg sink（exactly-once 归属）**：pipeline 一条 YAML 管 source→sink、自动建表与加列 schema 演进，代价是语义只有 at-least-once，靠湖表主键幂等兜底（重复事件收敛为同键更新，ODS 原样镜像场景够用）；原生 sink 才是 exactly-once（checkpoint+两阶段提交），但 upsert 限 v2 表+主键、流作业禁 OVERWRITE。**设计立场**：两形状都产 spec 并打语义标签，"exactly-once"不挂在 CDC 头上——归属写错是本设计稿最高频错误点（flink.md 分界逐字）。
2. **Lambda vs Kappa vs 流批一体**：Lambda 双链路换"实时有数+批层兜正确性"，代价是 Kreps 原话"同一套转换逻辑写两遍"——口径漂移温床，设定书 §8 事故 13（实时加和 vs 统计上报差 3.2%）就是现实注脚；Kappa 砍批层只留流，代价是历史重算受日志保留期约束、财务重述类修正不如批层覆盖写干脆；流批一体把两链路收敛成一套 SQL/一张湖表。**设计取中间态**：一张 Iceberg 湖表接两条进料链路（流写+批写）+ 档位元数据 + 对账作业，把"双链路为何打架、如何兜底"讲成机制而非信仰。
3. **15 分钟闭环的档位映射（设定书 §2.1）**：五层链路里"ETL 入数据仓库（15 分钟级闭环调度）"就是设定书的准实时入仓档，映射到三枚举：`realtime`=规则 11 告警流与 CDC 快照级可见、`nearline`=15 分钟闭环调度档、`offline`=T+1 班报/日批主体。诚实前提：设定书 8 表日粒度为主，realtime/nearline 各只有钩子级存在，不虚充实时应答面。
4. **入湖质检闸为什么在编排层不在 dp2 内**：dp2 自己实现质检会让"写入门面"长出第二套规则真源——规则对象、rule_mapping、test 对照全是 dp3 的职责（modules.md 边界）；"入湖必过质检"由**编排序**（validate_batch 先于 run_batch_load）+ dp9 闸 + §4 质量闭环/节点审查保证，dp2 的义务收窄为**记录**：provenance 带着 quality_report_id 随 commit 落元数据，质检证据可追溯而不被复制。
5. **Flink 不对 Agent 暴露查询面**：Flink SQL Gateway 是作业提交/会话口（OpenAPI 官方自标 "still experimental"），延迟模型与 Trino/StarRocks 亚秒交互查询不同——Agent 问数走 dp5 引擎面，Flink 在本仓只当"进料与加工的产线"，产出湖表后由 dp4/dp5 消费（flink.md 定位差④）。

## 锚点对照

| 论断 | 注源 | 兑现位置 → 断言 ID |
|---|---|---|
| 原生 sink exactly-once（checkpoint+两阶段提交，FLIP-191）；upsert 限 v2 表+主键 | flink.md「核心能力面/选型差异」、Iceberg Flink Writes | 走查 2 native.sql → `DP-W-D2-2` |
| pipeline sink = at-least-once+主键幂等（官方原话非 exactly-once）、源表必须有主键、自动建表/schema 演进 | flink.md「Flink CDC 3.x」、pipeline connector 文档 | 走查 2 pipeline.yaml + FlinkJobSpec.sink_semantics → `DP-W-D2-2` |
| SQL Gateway 是作业提交口非问数引擎（"still experimental"） | flink.md「定位差④」 | 取舍 5 → — |
| Lambda 概念源头 Marz 2011；铁律"实时层产出最终被批层覆盖"；Kappa=Kreps 2014（O'Reilly Radar）；双链路=口径漂移温床 | streaming-batch-warehouse.md「实时数仓节/模式 1」 | 走查 4 + 取舍 2 → 规模矩阵 dp2 行 |
| 15 分钟级闭环=准实时入仓档；五层链路；设计替身压缩 | 设定书 §2.1、streaming-batch-warehouse.md 对照节 | 走查 2/3 档位登记 + 取舍 3 → 规模矩阵 dp2 行 |
| 规则 11 传感器零值 2 小时告警 = 实时域规则（设计演绎），唯一实时域锚 | 设定书 §4 规则 11 | 走查 3 → `DP-W-D2-4` |
| A/B 班重复行、`12.40方` 误录样本；规则 1/3 判据 | 设定书 §A.2、§4 规则 1/3 | 走查 1 → `DP-W-D2-1` |
| append 仅 dp2/dp3 可调；dp6 只读 dp2 档位元数据 | specs/data-plane/modules.md 边界规则表 | 走查 1/2 → `DP-W-D2-1`/`D2-3` |
| 事故 13 实时加和 vs 统计上报差 3.2%；规则 12 勾稽 3% | 设定书 §8.13、§4 规则 12 | 走查 4 + 取舍 2 → — |

## 预计追问

1. **pipeline sink 不是 exactly-once，数据会重吗？** 会重但收敛：at-least-once + 湖表主键幂等（v2 表），重复事件同键覆盖；强一致聚合面换原生 sink，两形状语义标签就是给下游（dp6/dp7）声明用的。
2. **同一张表批、流都写，快照不乱吗？** Iceberg 快照串行 commit 各自成版本，两条链路各带 provenance/pipeline 登记；对账作业逐指标比对，偏差≤阈值以离线面为准（Marz 铁律），超阈进问题单交语义层仲裁。
3. **未登记新鲜度的表 Agent 敢答吗？** 不敢：`freshness()` 返回 unknown，dp6 按"声明不可答"出口拒答并说明，档位元数据缺失=不可答，不猜不编。
4. **为什么规则 11 放进进料设计稿讲？** 它是设定书唯一实时域锚（自标设计演绎）——没有一条 realtime 告警流，档位枚举与 realtime 路由就成了无源之水；进料设计稿正是登记档位的地方。
5. **Kappa 一条链路不是更省吗？** 省运维不省责任：历史重算吃日志保留期与算力，财务重述类修正不如批层覆盖写干脆（Kreps 自己列的约束）；本设计稿设定离线面是主体（8 表日粒度），砍批层等于砍主角。
