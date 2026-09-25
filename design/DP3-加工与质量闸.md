# 设计稿 DP3：加工与质量闸（dp3）

> **红线声明**：本设计稿零真实可运行代码。全部代码块均为**伪代码**（块首标注"伪代码 — 文件:函数"），公开签名取自模块卡 dp3（specs/data-plane/modules.md：`validate_batch` / `rule_mapping` / `build_marts` / `lineage` 四签名逐字），函数体=输入输出契约+主干判断；SQL 为 PostgreSQL 方言设计演绎（金仓≈postgres 近似）。
> **框架红线**（设计范围）：dbt / dbt-trino——模型与 test 的 YAML 形状、manifest.json 结构逐字照 docs/tech-stack/dbt.md（规则 ID↔test 名对照是设计主打）；**分册没有的 dbt 配置键不写**，本设计稿只用分册点名过的能力：内置四测试 unique/not_null/accepted_values/relationships、generic `{% test %}` 块、singular `tests/*.sql`、source freshness（`warn_after`/`error_after`/`loaded_at_field`）、`dbt build` / `dbt source freshness`、`--store-failures`、exposures（`type`/`owner`/`depends_on`）。
> **接线边界**：dp3 只依赖 dp1（模块卡依赖行）；合法 join 白名单（设定书 §5）只允许出现在 intermediate 层；manifest 是 dp4 的唯一口径来源（dp4 只读）。Seam=Runner（dbt 执行器），Adapter=FakeDbt（固定 manifest 与结果）。
> **明确不讲的**：调度系统选型与实现（Airflow/DolphinScheduler 只在取舍提）；dbt Cloud（开源 Core 形态，走查规格 D3"不做什么"）；dp4 语义层与指标定义（设计稿 DP4）；dp9 治理闸只留引用（check_join 消费本设计稿白名单边）。

## 实现清单

- [x] 规则 1 唯一性：A/B 班重复行样本判 fail，failures 定位到 (well_id, prod_date)，rule_mapping 可查（源：`DP-W-D3-1`）✅ **走查 1/3/4**（validate_batch 规则对象 + 对照表第 1 行 + singular test）
- [x] 规则 3 单位一致性："12.40 方"误录折算密度越界判 fail（阈值 [0.82,0.98] t/m³）（源：`DP-W-D3-2`）✅ **走查 1/4**（算式复算 1.00 t/m³ 越上界 + accepted_range 挂列）
- [x] fluid_test 必经 intermediate（双键+时间容差），lineage 给出路径（源：`DP-W-D3-3`）✅ **走查 4/5**（int_well_fluid 视图 + lineage 走查：上游链无直连边）
- [x] build_marts（FakeDbt）返回 models/tests/manifest_ref 三件（源：`DP-W-D3-4`）✅ **走查 5**（BuildResult 组装，manifest_ref 供 dp4 只读）
- [x] 规则映射表：§4 规则 1/2/3/5/6 逐条 ↔ dbt test（unique/not_null/单位折算 accepted_range/关系容差/freshness），其余归类一句带过（源：实现清单）✅ **走查 3**
- [x] 规模矩阵 dp3 行兑现：S1 校验脚本 / S2 dbt-trino 单项目 / S3 多项目联邦 + 分层职责表（ODS/DWD/DWS/ADS，阿里 OneData 规范，streaming-batch-warehouse.md）（源：设计范围）✅ **走查 0**
- [x] 取舍节 ≥4 条（Semantic Layer 开源边界 / 国产适配器现状 / exposures 挂 Agent / S1 不用 dbt）（源：设计范围）✅ **取舍 1–5**
- [x] 越界自查：全稿零 dp3→dp4/dp5+ 依赖；写面只有模型物化落湖（dp1.append 合法调用方之二）；业务事实全部注 `设定书 §x`（源：边界规则表）✅ 头部接线边界 + 走查 0/5

---

## 伪代码走查

### 0. 规模矩阵 dp3 行：换的是适配器，不是接口（规模映射矩阵总纲）

| 档位 | 形状 | 本节落位 |
|---|---|---|
| S1 边缘档 | 校验脚本直查 8 表（20 规则直查） | `validate_batch` 直查 dp1 Arrow，无 dbt |
| S2 平台档 | dbt 项目（dbt-trino），单项目 | `build_marts`，Runner=dbt-trino 子进程 |
| S3 集团档 | dbt 多项目联邦 | 项目间靠 source/ref 跨包引用，lineage 跨 manifest 聚合（形状声明，不展开） |

**分层职责表**（dbt 三层 ↔ 阿里 OneData 四层，源：streaming-batch-warehouse.md 分层表；两套命名不对齐处如实注明）：

| OneData 层 | 职责一句话（分册原词） | 本项目落位 |
|---|---|---|
| ODS | 原样落库，业务库/日志的原貌镜像 | `source()` 声明的生产库 8 表——dbt 模型不动它 |
| DWD | 清洗+规范化后的业务过程明细（一事件一行） | staging（1:1 原粒度清洗/单位折算/归一化）+ intermediate（跨源统一视图） |
| DWS | 按主题预聚合的公共汇总（宽表/轻量指标） | marts 的 fct/dim 星型（设计稿 32/33 同款模型名沿用） |
| ADS | 面向应用的最终结果（报表/看板/接口直出） | marts 面向应用的一支 + exposures 登记消费方 |

> 注：OneData 是四层、dbt 惯例是三层——ODS 归 `source()` 原样（不入模型），DWS/ADS 在 marts 里合并承载；对应关系是设计对照不是一一映射（分册诚实纪律②同款）。

### 1. validate_batch（S1：§4 的 20 条规则翻成规则对象直查）

```text
伪代码 — app/data_plane/transform.py:validate_batch
function validate_batch(table: str, rules: list[QualityRule])
                      -> QualityReport(passed, failures, rule_ids):
  输入: table=湖表名（经 dp1.Catalog.load_table 读取，只依赖 dp1）
        rules=QualityRule 对象列表——设定书 §4 的 20 条翻成规则对象（id/维度/判据）
  契约: 逐规则执行，failures 定位到行级键；不合格行被拦——
        由编排序保证先 validate 后 dp2.run_batch_load（衔接 DP-W-D2-1，provenance 记 quality_report_id）
  主干:
    tbl  = dp1.load_table(table).scan()
    fails, hit_ids = [], []
    for rule in rules:
        rows = rule.check(tbl)          # 每条规则=一个"返回失败记录的判断"（与 dbt 测试同构语义）
        if rows: fails += [(rule.id, 键列值(r)) for r in rows]; hit_ids += [rule.id]
    return QualityReport(passed=not fails, failures=fails, rule_ids=hit_ids)
```

```text
伪代码（规则对象两例——判据逐字取 §4，样本行取附录 A）
RULE_1 唯一性: group by (well_id, prod_date) having count(*) > 1
  # §A.2 样本: N-02|2026-09-14|…|A 与 N-02|2026-09-14|…|B（班次手抄汇总重复行）
  # → fail，failures=[("rule-1", ("N-02", "2026-09-14"))]  ← 定位到重复键，不吞行
RULE_3 准确性: density = oil_output / (liquid_output × (1 − water_cut/100)) 须 ∈ [0.82, 0.98] t/m³
  # §A.2 样本: N-11|2026-09-14|12.40方|96.00|87.1（油单位误录）
  # 复算: 12.40/(96.00×0.129)=12.40/12.38≈1.00 t/m³ → 越上界 0.98 → fail
  # 换算真值: 12.40 方 × 渤中 0.89 t/m³ = 11.04 吨（§2.2 单位换算表）→ 折算后 0.89 ∈ 阈值，放行
```

### 2. rule_mapping：§4 规则 ID ↔ dbt test 名对照（设计主打）

```text
伪代码 — app/data_plane/transform.py:rule_mapping
function rule_mapping() -> dict[rule_id, test_name]:
  # 静态对照表，直接 return 下表左两列——Agent/人查"这条规则在 dbt 里长什么样"的唯一入口
```

| §4 规则 | 判据（§4 原词） | dbt test | 落位 |
|---|---|---|---|
| 1 唯一性 | (well_id,prod_date) count(*)=count(distinct) | **singular** `tests/dup_well_date.sql`（内置 unique 只挂单列，组合键翻 singular） | stg 层 + validate_batch |
| 2 完整性 | oil_output 非空率 ≥99.5% | **not_null**（内置）；比率阈值版翻 singular 变体（内置是 100% 判据） | int_well_daily |
| 3 准确性 | 单位一致性：折算 density∈[0.82,0.98] | **accepted_range**（自定义 generic 块，单位折算后判） | int_well_daily.oil_density |
| 4 一致性 | 计量 vs fluid_test 化验 偏差≤5pp（容差=取样时间窗） | **deviation_max**（自定义 generic）；内置 relationships=引用完整、无容差参数，作设计对照 | int_well_fluid（白名单层） |
| 5 值域 | water_cut∈[0,100]、open_days∈[0,24] | **accepted_range 复用** | int_well_daily |
| 6 及时性 | 批次水位 ≤T-1，超窗 reject | **source freshness**：warn_after=T-1 / error_after=T-3 + loaded_at_field；`dbt source freshness` 产 freshness.json | sources 段 |

**其余 14 条一句带过**：规则 7/8 规范性（井号归一化/新旧编码映射"全命中"——singular join 映射表）、规则 9 唯一性（well_id 主键 unique + 状态机合法迁移 singular）、规则 10/12 一致性（恒值 30 日/物质平衡勾稽 ≤3%——singular SQL）、规则 11（传感器零值 2 小时）**实时域规则不进 dbt**（规则卡自标"设计演绎"，唯一实时域锚归 dp2 流水线/dp6 路由）、规则 13–20（提取件二：引用完整/跨表一致/枚举合法/正则/极值/波动率/钩稽/scrub）按"内置四测试 + generic/singular 两形状"复用归类，无新形状。

### 3. transform/dbt/ 项目形状（S2）：白名单 join 只许 intermediate

```text
伪代码（目录形状——仅存在于 specs 与本设计稿，仓库零代码红线）
transform/dbt/
├── models/
│   ├── staging/       stg_oil_production_daily.sql   # source() 进、ref() 出：1:1 清洗/单位折算/井号归一化
│   ├── intermediate/  int_well_daily.sql             # 消费 stg，派生 oil_density 列
│   │                  int_well_fluid.sql             # ★§5 白名单唯一合法 join 位：fluid_test 须双键+时间容差
│   ├── marts/         dim_well.sql / fct_daily_metering.sql   # 问数/Agent 只认这层
│   └── schema.yml
└── tests/             dup_well_date.sql              # singular：规则 1 组合唯一
```

```yaml
# 伪代码（YAML 形状照 dbt.md：sources freshness 键名、generic {% test %} 挂列、exposures 必填 type/owner）
sources:
  - name: prod
    freshness:                       # 规则 6 及时性（阈值键名照分册；值形状照官方 sources 文档）
      warn_after: {count: 1, period: day}    # ≤T-1 正常
      error_after: {count: 3, period: day}   # T-3 补录触发 error=reject（§A.4：N-11 batch=20260911-T3）
    loaded_at_field: batch_loaded_at
    tables: [{name: oil_production_daily}, {name: fluid_test}]
models:
  - name: int_well_daily
    columns:
      - {name: well_id,      tests: [not_null]}                    # 规则 2（比率阈值版见走查 2）
      - {name: oil_density,  tests: [{accepted_range: {lo: 0.82, hi: 0.98}}]}   # 规则 3
      - {name: water_cut,    tests: [{accepted_range: {lo: 0, hi: 100}}]}       # 规则 5
  - name: int_well_fluid
    description: "§5：oil_production_daily ⋈ fluid_test 直连✗——井号+取样日期双键+时间容差，唯此视图"
    columns:
      - {name: water_cut_dev_pp, tests: [{deviation_max: 5}]}      # 规则 4 关系容差
exposures:
  - name: qa_agent                                 # 问数 Agent 注册为消费方（取舍 3）
    type: application
    owner: 数据平台组
    depends_on: [ref('fct_daily_metering')]
```

```sql
-- 伪代码 — tests/dup_well_date.sql（规则 1 singular：返回失败记录的 select，0 行=通过，dbt.md 原则）
select well_id, prod_date from {{ ref('stg_oil_production_daily') }}
group by 1, 2 having count(*) > 1        -- 命中 §A.2 的 (N-02, 2026-09-14) → fail
-- 伪代码 — {% test accepted_range(model, column_name, lo, hi) %}（generic 块，可复用挂列）
--   select * from {{ model }} where {{ column_name }} < {{ lo }} or {{ column_name }} > {{ hi }}
```

> 模型层纪律（dbt.md 原则照抄）：依赖只走 `ref('上游模型')` / `source('源','表')`，禁止硬编码表名——DAG 由 ref 推导；marts 模型引用 fluid_test 只能写 `ref('int_well_fluid')`，直连 `source('prod','fluid_test')` 在 marts/任意非 intermediate 层被模型边界禁止（DP-W-D3-3 前半）。int_well_fluid 的 join 判据：`well_id` 相等且 `prod_date` 落在取样日期容差窗内（§5 双键+时间容差；§4 规则 4"容差=取样时间窗"原词）。

### 4. build_marts（FakeDbt）：三件产物，manifest 是 dp4 的唯一口径来源

```text
伪代码 — app/data_plane/transform.py:build_marts（Seam=Runner 注入：S1 无操作 / S2+ dbt-trino；Adapter=FakeDbt）
function build_marts() -> BuildResult(models_built, tests_passed, manifest_ref):
  契约: dbt build 形状——模型与测试串成一棵 DAG 按 ref 序执行；测试挂模型后，fail 即该分支下游不放行
        （--store-failures 落失败行备查）；产物三份：manifest.json / run_results.json / freshness.json
  主干:
    rr = runner.build(project="transform/dbt")     # FakeDbt 返回固定 manifest 与结果
    mf = read_json("target/manifest.json")   # 顶层键: metadata/nodes/sources/metrics/exposures/
                                             # macros/docs/parent_map/child_map/selectors/disabled（dbt.md）
    rj = read_json("target/run_results.json")# results[]: unique_id/status(success|pass|fail|error)/failures
    fz = read_json("target/freshness.json")  # 逐表 pass/warn/error + max_loaded_at
    tests_passed = 无 test.* 节点 status=fail 且 无 source status=error   # "测试全绿+源新鲜"两证闸（dbt.md 模式 2）
    return BuildResult(models_built=[n for n in mf.nodes if n 是 model.*],
                       tests_passed=tests_passed,
                       manifest_ref="target/manifest.json")   # dp4.metric_catalog/对齐只读本文件（边界规则）
```

### 5. lineage：读 manifest 的 parent_map/child_map（双向可查）

```text
伪代码 — app/data_plane/transform.py:lineage
function lineage(model: str) -> LineageInfo(upstreams, downstreams, columns):
  主干:
    uid = "model.petro." + model                   # unique_id 形状 model.<pkg>.<name>（dbt.md 模式 1）
    mf  = read_json(manifest_ref)
    return LineageInfo(upstream  = mf.parent_map[uid],     # 这个数从哪来
                       downstream= mf.child_map[uid],      # 被谁消费（含 exposures 节点）
                       columns   = mf.nodes[uid].columns 及 description)
  走查（DP-W-D3-3 后半）: lineage("fct_daily_metering").upstream 含 int_well_fluid →
    再 lineage("int_well_fluid").upstream = {stg_oil_production_daily, source.prod.fluid_test}
    ——计量面到化验面的路径经 intermediate 双键+时间容差视图，全链无直连边 ✅
```

---

## 取舍

1. **dbt Semantic Layer 的开源边界（易错点）**：MetricFlow 引擎 v0.209.0 起 Apache 2.0 开源（许可史 AGPL→BSL→Apache 2.0，dbt.md）；但托管 Semantic Layer（云上指标查询 API/BI 直连）须 Starter/Enterprise 付费档。一句话：**指标定义 YAML 跟开源项目走，把指标当服务暴露出去要付费云**。故本项目把"指标暴露"划给 dp4 Cube（独立开源语义层、仓库无关），dbt 只管 T 层、manifest 只供对齐——不走 dbt 托管 SL。
2. **dbt-starrocks / dbt-doris 适配器现状（国产化诚实账）**：dbt-trino=Starburst 官方维护、Apache-2.0、测试基线 Trino 478，Iceberg 支持以"连接器须支持建表"+CI 夹具间接佐证；dbt-starrocks=StarRocks 官方但文档标注 experimental；dbt-doris 1.0.0（apache/doris extension）由 dbt-for-apache-doris 1.1.0 接棒。S2 主线选 dbt-trino（模型直接物化到湖上 Iceberg 表），StarRocks/Doris 线留在 dp5 引擎侧，不承担 dbt 物化主链。
3. **exposures 把 Agent 挂进血缘**：exposures（必填 type/owner，depends_on 可挂 ref/source/metric）进 DAG 与选择器——问数 Agent 注册为 application exposure 后，"这个数被谁消费"反向可查、上游模型变更影响面可算；dp8.lineage 的血缘燃料=parent_map/child_map（上游）+exposures（下游）。代价：exposure 是人工声明，漏挂=血缘盲区——与 dp9 白名单默认拒绝互补（闸不靠自觉）。
4. **S1 为什么不用 dbt**：8 表 20 规则的校验，一个直查 Arrow 的脚本比一套 dbt 工程（适配器+profile+项目脚手架）成本低一个量级；dbt 的核心回报（ref 推导 DAG/测试/文档/血缘）在"单表行级校验"场景无用武之地。关键在接口不换：`validate_batch`/`build_marts` 签名不动，S2 只换 Runner 实现（直查→dbt-trino），换的是适配器不是接口（规模矩阵总纲）。
5. **freshness 独立产物、质量闸两证制**：source freshness 单独产出 freshness.json（与 run_results 分开）——放行判据是"测试全绿 **且** 源新鲜"两证齐（dbt.md 模式 2）；且 freshness 阈值（warn T-1/error T-3）与 dp2 登记的档位元数据同源，供 dp6 路由消费（PRD D3"freshness 回写 D2/D6 质量闸"的兑现位）。批 T 层不塞实时规则（规则 11 留在流上），是分层纪律不是能力缺失。

## 锚点对照

| 内容/断言 | 锚点 |
|---|---|
| `DP-W-D3-1` 规则 1 | 设定书 §4 规则 1（count(*)=count(distinct)）+ §A.2 A/B 班重复行样本；dbt.md data tests（测试=返回失败记录的 select，0 行=通过；generic vs singular） |
| `DP-W-D3-2` 规则 3 | 设定书 §4 规则 3（折算 density∈[0.82,0.98] t/m³）+ §A.2 "12.40方"误录样本 + §2.2 单位换算表（渤中 0.89） |
| `DP-W-D3-3` 白名单 | 设定书 §5（oil_production_daily ⋈ fluid_test 直连✗，须双键+时间容差经 intermediate 视图）+ §4 规则 4（容差=取样时间窗）；dbt.md models（ref/source 建 DAG、禁硬编码表名） |
| `DP-W-D3-4` build_marts | modules.md dp3 卡（BuildResult(models_built, tests_passed, manifest_ref) 签名逐字）；dbt.md manifest.json（顶层键/parent_map/child_map/manifest v12）+ run_results.json（schema v6：status/failures）+ sources（freshness.json） |
| 分层职责表 | streaming-batch-warehouse.md（阿里 OneData：ODS→CDM(DWD+DWS)→ADS 分层规范表） |
| 规则映射表其余条目 | 设定书 §4 规则 7–12 逐条 + 13–20 归属行（"其余 8 条见提取件二 §三"原词） |
| 取舍 1/2/3/5 | dbt.md（Semantic Layer 授权边界/适配器生态/exposures/sources freshness/模式 2 质量闸） |
| 规模矩阵与签名 | specs/data-plane/modules.md（dp3 卡公开接口/规模档位/规模映射矩阵 dp3 行/边界规则表） |

## 预计追问

1. **Q：Iceberg、manifest、Cube 都能给"口径"，Agent 听谁的？** A：三层各管一段——Iceberg 元数据管物理 schema，dbt manifest 管加工层口径+血缘，Cube 管面向业务的指标定义（§3 指标卡唯一真源）；Agent 的暴露面收敛在 dp4（边界规则：dp4 禁发明口径，manifest 只读对齐）。
2. **Q：规则 2 非空率 ≥99.5% 为什么不直接挂内置 not_null？** A：内置 not_null 是 100% 判据、一空全 fail；比率阈值翻 singular 变体（返回超率行）——形状不变，都是"返回失败记录的 select"。
3. **Q：测试 fail 之后 marts 还出数吗？** A：dbt build 把模型与测试串成一棵 DAG，测试挂模型后 fail 即该分支下游不放行（--store-failures 留失败行）；S1 等价动作是 validate_batch 先拦再进料（DP-W-D2-1 编排序）。
4. **Q：为什么白名单 join 只许出现在 intermediate 层？** A：join 一处定义处处复用、dp9.check_join 只认白名单边才可审计；散进 marts 或临时 SQL=血缘断、闸失效——fluid_test 直连的坑是计量 vs 化验天然打架（§A.2 water_cut 注记），必须双键+时间容差消歧。
5. **Q：dbt 的 exposures 和语义层（dp4）什么关系？** A：exposures 答"谁在消费这些模型"（血缘节点，人工声明），语义层答"数是什么"（指标定义+术语归一）；Agent 两头都挂——口径走 dp4 唯一暴露面，消费关系走 exposure 进 lineage。
