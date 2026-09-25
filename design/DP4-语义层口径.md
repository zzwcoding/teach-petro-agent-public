# 设计稿 DP4：语义层口径（dp4）

> **红线声明**：本设计稿零真实可运行代码。全部代码块均为**伪代码**（块首标注"伪代码 — 文件:函数 / 文件形状"），公开签名取自模块卡 dp4（specs/data-plane/modules.md：`metric_catalog` / `resolve_term` / `build_query` / `authoritative_source` 四签名逐字），函数体=输入输出契约+主干判断；SQL 为 PostgreSQL 方言设计演绎（金仓≈postgres 近似）。
> **框架红线**（设计范围）：Cube（开源版）——数据模型 YAML（cubes/measures/dimensions/meta.ai_context）与 REST `/meta` 形状**逐字照 docs/tech-stack/cube-semantic-layer.md**；分册没有的 Cube 配置键不写（连 measure 的模板占位符语法分册未收录，也一律不引入）；StarRocks 无官方驱动、须经 Trino（PRD §9-4）如实写。
> **语言纪律**：业务事实一律注 `设定书 §x`——15 条指标卡取 §3，术语四类（禁用词/别名/黑话/一词两译）取 §6，一数四源与事故 13 取 §3+§8.13；技术形状一律注分册。
> **接线边界**：dp4 只依赖 dp3（manifest 只读——口径与模型对齐）；**禁止发明口径**：指标定义只来自 dp3 manifest 与设定书 §3 指标卡（边界规则表：语义层是口径唯一暴露面，禁止第二真源）。Seam=`DictionaryBackend`，Adapter=`StaticYaml`（S1）/`FakeCube`（S2 走查替身）。
> **明确不讲的**：指标审批流与五级语义 CI（属平台 F13/F20，衔接不复做）；预聚合构建运维（只提能力存在，分册）；dp5 执行与 dp6 路由（本设计稿只产出 StructuredQuery 与粒度元数据，消费在下游模块）。

## 实现清单

- [x] `DP-W-D4-1` metric_catalog 返回 15 条 MetricDef 七字段（公式/单位/粒度/修饰词/Owner/权威源/ai_context）（源：`DP-W-D4-1`）✅ **走查 1/2**（S1 静态 YAML / S2 `/meta` 双后端同形状 + dp3 manifest 对齐闸）
- [x] `DP-W-D4-2` "有效产量"无修饰词 → 两支口径消歧询问不擅断（§3 指标 2：开井日历/检修剔除两 measure）（源：`DP-W-D4-2`）✅ **走查 2**（两 measure）+ **走查 4**（Clarify 分支）
- [x] `DP-W-D4-3` "老完成率"禁用词 block，指向"产量完成率"（§6）（源：`DP-W-D4-3`）✅ **走查 3** 分支一
- [x] `DP-W-D4-4` "剔检产量"rewrite 为净产量口径（§6 别名）（源：`DP-W-D4-4`）✅ **走查 3** 分支二
- [x] `DP-W-D4-5` 一数四源权威源仲裁（§8 事故 13）：authoritative_source 返回唯一 SourceRef+仲裁注记（源：`DP-W-D4-5`）✅ **走查 5**
- [x] 规模矩阵 dp4 行兑现：S1 静态 YAML / S2 Cube / S3 联邦；cube 数据模型 YAML 形状（指标卡→measure 逐字段映射 ≥3 条：指标 1/2/10）（源：设计范围）✅ **走查 0/2**
- [x] 取舍节 ≥4：Cube vs 自建语义资产（主线 F13/F19 是自建、Cube 是行业对照物不是替换设定）、开源版无官方 MCP 之辨、躺井等黑话限语境（源：设计范围）✅ **取舍 1–5**
- [x] 锚点对照：cube-semantic-layer.md / 设定书 §x（源：设计范围）✅ 锚点对照表
- [x] 越界自查：dp4 只依赖 dp3（manifest 只读）；零发明口径（指标定义只来自 §3 指标卡 + dp3 manifest）；零分册外 Cube 配置键；业务事实全注 `设定书 §x`（源：边界规则表）✅ 头部接线边界 + 全稿注源

---

## 伪代码走查

### 0. 规模矩阵 dp4 行：换的是适配器，不是接口（规模映射矩阵总纲）

| 档位 | 形状（modules.md dp4 卡原词） | 本设计稿落位 |
|---|---|---|
| S1 边缘档 | 静态 YAML 字典 | `StaticYaml` 读 `semantic/dictionary.yaml` + `semantic/cube/` 模型定义，零服务端 |
| S2 平台档 | Cube 开源版（Trino 数据源） | 同一份模型定义被 Cube 编译；dp4 经 REST `/meta`、`/load` 形状对接（分册） |
| S3 集团档 | Cube 联邦/多实例 | 多实例 `/meta` 聚合成单一 catalog（形状声明，不展开） |

### 1. metric_catalog：15 条指标卡 → 机器可读口径字典（DP-W-D4-1）

```text
伪代码 — app/data_plane/semantic.py:metric_catalog
function metric_catalog() -> list[MetricDef]:
  输出: 15 条 MetricDef，每条=名称+七字段（公式/单位/粒度/修饰词/Owner/权威源/ai_context）
        （逐件对应 §3 指标卡字段：定义/公式/单位/粒度/修饰词/Owner/数据源/口径争议注记）
  契约: 全量拉取的口径字典=问数 prompt 的口径上下文——Agent 拿到的是"带注释的指标清单"，
        而非靠翻库表猜口径（分册模式 1）；一卡一 measure，"有效产量"一词两译展开为两 measure
  主干:
    match backend:                                   # Seam=DictionaryBackend
      S1:  return StaticYaml.load("semantic/dictionary.yaml").metric_defs
      S2+: meta = GET {CUBE}/cubejs-api/v1/meta      # REST /meta：cubes/views 的名称、标题、
                                                     # measures、dimensions、hierarchies、segments（分册）
           return [拼 MetricDef(名称+七字段) for cube in meta.cubes]
           # description（人+Agent 通用）与 meta.ai_context（仅 Agent 可见）拼进 ai_context 件
  对齐闸: 每 MetricDef 的 measure 所引模型/列 ↔ dp3 manifest 只读比对（模型在 models_built 内、
          列名一致）——manifest 只读是唯一对齐面，对不上=登记失败不放行（边界规则）
```

### 2. semantic/cube/ 数据模型 YAML：指标卡→measure 逐字段映射（≥3 条）

```yaml
# 伪代码（semantic/cube/ 模型形状——键名逐字照 cube-semantic-layer.md：cubes(name/sql_table/
# measures(name+sql+type，可带 filters/format，计算度量引用其他度量)/dimensions/joins/
# preAggregations/meta) + views(join_path/includes) + description + meta.ai_context(单条≤2000 字符)。
# 未收录的模板占位符语法不引入：measure 的 sql 写模型列上的聚合表达式（PostgreSQL 方言设计演绎）；
# type 值（sum/number/time/string）取分册信源列表收录的 cube() 参考页（全属性清单）。）
cubes:
  - name: fct_block_monthly                        # 映射① 指标 1 ★产量完成率（§3.1）
    sql_table: marts.fct_block_monthly             # 配产 join 在 dp3 marts 模型内完成——语义层不裸 join（§5 纪律）
    description: "★产量完成率=Σ实际产油/Σ计划配产×100%；粒度 月/区块·油田；Owner 开发室（§3.1）"
    measures:
      - {name: actual_oil_sum,    sql: sum(actual_oil),    type: sum}
      - {name: planned_quota_sum, sql: sum(planned_quota), type: sum}
      - name: completion_rate                         # 计算度量：引用其他度量（分册原话）
        sql: actual_oil_sum / planned_quota_sum * 100
        type: number
        description: "计划版本切换日双值——默认取当期生效版本并声明（§3.1 争议注记）"
        meta:
          ai_context: "答完成率优先用本 measure；禁用词「老完成率」已由术语闸拦截（§6）"

  - name: fct_valid_output_monthly                 # 映射② 指标 2 ★有效产量：一词两译=两 measure（§3.2/§6）
    sql_table: marts.fct_valid_output_monthly      # 口径 B 需 well_overhaul（§2.4）——join 收进 marts 模型
    measures:
      - name: valid_output_calendar                 # 口径 A：开井日历折算
        sql: sum(valid_output_calendar)
        type: sum
        meta: {ai_context: "修饰词=开井日历；用户未带修饰词时 build_query 发消歧询问（DP-W-D4-2）"}
      - name: valid_output_overhaul_excluded        # 口径 B：检修剔除
        sql: sum(valid_output_overhaul_excluded)
        type: sum
        description: "跨月检修切割是两支口径差异源（§3.2 争议注记）"

  - name: fct_wellset_annual                       # 映射③ 指标 10 ☆递减增油（§3.10）
    sql_table: marts.fct_wellset_annual
    measures:
      - name: incr_oil_wellset
        sql: sum(incr_oil)
        type: sum
        meta:
          ai_context: "口径争议注记（§3.10）：一数多源争议之最（事故 7）——基线 q_0(1−d_a)^t 拟合、
            多井受效按劈分系数（Σ=1）分摊、多措施叠加以主要措施为主；公式实体在 marts 模型+联席
            裁决（Owner=采油工艺所，开发室联席），Agent 只许引用本 measure 不许重算"
views:
  - name: petro_metrics                            # 门面：Agent 只许查 view——治理边界就在这里（分册原话）
    description: "15 指标对外暴露面；includes 控制终端用户能查什么"
    includes:
      - fct_block_monthly.completion_rate
      - fct_valid_output_monthly.valid_output_calendar
      - fct_valid_output_monthly.valid_output_overhaul_excluded
      - fct_wellset_annual.incr_oil_wellset        # ……其余指标卡同构展开，共 15 卡 16 measure
```

> 逐字段对照一句话：指标卡的**定义/公式**→measure 的 `sql`+`description`；**单位/粒度**→measure 语义+timeDimensions.granularity 消费端；**修饰词**→一词多 measure+`ai_context` 消歧规则；**Owner**→`ai_context`；**数据源**→`sql_table`（marts 模型，对齐 dp3 manifest）；**争议注记**→`meta.ai_context`（只给 AI 看、不进 UI——分册）。

### 3. resolve_term：术语归一是问数入口第一道闸（DP-W-D4-3/4 + 黑话限语境）

```yaml
# 伪代码（semantic/dictionary.yaml 词表形状——条目=设定书 §6 逐条，零发明）
terms:
  - {term: 老完成率, type: 禁用词,   replacement: 产量完成率, note: "v1 口径（不含自用油折算），2024 年废弃（§6）"}
  - {term: 剔检产量, type: 别名,     canonical: 净产量, measure: valid_output_overhaul_excluded,
     note: "剔除检修井口径（§6）——落指标 2「检修剔除」支 measure"}
  - {term: 有效产量, type: 一词两译, measures: [valid_output_calendar, valid_output_overhaul_excluded],
     note: "需修饰词消歧（开井日历/剔检）（§6）"}
  - {term: 躺井,     type: 黑话,     gloss: 停产待检泵, note: "作业区口语，限作业区语境（§6）"}
```

```text
伪代码 — app/data_plane/semantic.py:resolve_term
function resolve_term(term: str) -> TermResolution(canonical,
                     action: Literal["pass","rewrite","block"], note):
  契约: 三分支照 §6 类型映射——禁用词 block / 别名(含缩写) rewrite / 黑话限语境 pass+note；
        词表唯一来源=设定书 §6（发明口径=越界，边界规则）
  主干:
    entry = DictionaryBackend.lookup(term)           # S1=StaticYaml / S2+=FakeCube·模型注解
    match entry.type:
      "禁用词":   return TermResolution(entry.replacement, "block",
                    note=f"禁用词：{entry.note}——请改用「{entry.replacement}」")
      "别名":     return TermResolution(entry.canonical, "rewrite", note=entry.note)
      "黑话":     return TermResolution(term, "pass",
                    note=f"{entry.gloss}——限作业区语境，对外输出展开为规范词")
      default:    return TermResolution(term, "pass", note=entry.note)
  走查: resolve_term("老完成率") → (canonical="产量完成率", action="block",
          note="禁用词：v1 口径（不含自用油折算），2024 年废弃——请改用「产量完成率」")（DP-W-D4-3 ✅）
        resolve_term("剔检产量") → (canonical="净产量", action="rewrite",
          note="剔除检修井口径——落指标 2「检修剔除」支 measure")（DP-W-D4-4 ✅）
        resolve_term("躺井") → (canonical="躺井", action="pass",
          note="停产待检泵——限作业区语境，对外输出展开为规范词")（限语境分支 ✅）
```

### 4. build_query：四件套编译 + 消歧询问不擅断（DP-W-D4-2）

```text
伪代码 — app/data_plane/semantic.py:build_query
function build_query(metric: str, dims: list[str], time_window: TimeWindow,
                     filters: dict) -> StructuredQuery:
  输入: metric=指标名（调用前已过 resolve_term 归一）；dims=分组维度；filters=修饰词等过滤
  契约: 产四件套（measures/dimensions/timeDimensions/filters）；修饰词未消歧→返回消歧询问
        （StructuredQuery 的 Clarify 分支），不擅自二选一——两支口径都是正牌口径
  主干:
    card = metric_catalog() 中名称==metric 的 MetricDef
    if card.多 measure and "修饰词" not in filters:       # "有效产量"（§3.2/§6 一词两译）
        return Clarify(metric, options=["开井日历折算", "检修剔除"],
                       note="两支口径均为指标 2 正牌口径（跨月检修切割致差异）——请选修饰词")
    measure = card.按 filters["修饰词"] 消歧到唯一 measure
    return Executable(measures=[measure], dimensions=dims,
                      timeDimensions=[{dimension: card.时间维, dateRange: time_window,
                                       granularity: card.粒度}],
                      filters=[filters 去掉修饰词键])
  S2 落位: Executable 直映 Cube /load 的 query JSON（键名逐字照分册：measures/dimensions/
           timeDimensions(granularity)/filters）；响应 annotation（成员定义回显）与
           usedPreAggregations（命中哪些预聚合）供 Agent 自检；数值默认字符串返回防精度丢失
  走查: build_query("有效产量", dims=["block_name"], window=9 月, filters={}) →
        Clarify(options=[开井日历折算, 检修剔除])，不擅自二选一（DP-W-D4-2 ✅）；
        补 filters={修饰词: 开井日历} → Executable(measures=["fct_valid_output_monthly.valid_output_calendar"], …)
```

### 5. authoritative_source：一数四源仲裁（DP-W-D4-5，§8 事故 13）

```text
伪代码 — app/data_plane/semantic.py:authoritative_source
function authoritative_source(metric: str) -> SourceRef:
  输入: metric=指标/数名（如"油气产量"）
  契约: 一数多源时返回唯一权威 SourceRef + 仲裁注记；裁决在语义层配置期一次做死，
        不在问数现场猜——"语义层口径仲裁+数据源血缘标注"（§8.13 事故簿处置原词）
  主干:
    cands = DictionaryBackend.sources(metric)        # 源清单随指标卡登记（§3），零发明
    if len(cands) <= 1: return SourceRef(source=cands[0], arbitration_note=None)
    ref  = cands.by_rank("authority")                # 权威序=指标卡 Owner 联席登记（§3.10 联席制）
    return SourceRef(source=ref, arbitration_note=仲裁注记(口径差异/适用面),
                     lineage=dp3.lineage(ref.model)) # 血缘标注——dp4 只读 dp3 manifest
  走查: authoritative_source("油气产量") →
    一数四源：A11（实时加和）/A2（上报审核）/A5（站库计量）/E7（统计上报）（§3 原词）
    → 唯一权威 SourceRef = E7 统计上报（对外汇报与财务对齐面——事故 13 的对不上正发生在这里，§8.13）
    → 仲裁注记："A11 实时加和 vs E7 统计上报差 3.2%（§8.13）；差异原因=统计口径/计量误差/损耗/
      测算方式/精度累计/统计周期（§3 原词）；A11 实时面仅日内趋势可用，须声明与统计口径差异（dp6）" ✅
```

---

## 取舍

1. **Cube vs 自建语义资产（主线判定）**：主线 F13/F19（平台侧设计稿 22/35/36/39/40 的 Metric/Ontology 域）是**自建**；Cube 是它的行业对照物、不是替换设定（dataagent-stack-map.md §3.5 诚实边界原话）。同构对照：指标卡↔measure、Glossary↔术语归一、权威源回读↔语义层仲裁。工程含义：语义资产定义只写一份 YAML——S1 被 StaticYaml 直读，S2 被 Cube 编译后经 `/meta` 暴露，dp4 四签名不动。
2. **开源版无官方 MCP 之辨（易错点）**：官方 MCP server 是 **Cube Cloud 托管端点**（`cubecloud.dev/mcp`，Premium/Enterprise 计划限定，约 30 工具）；开源 Cube Core **不含**——开源侧官方配套是 cube-agent-skills（Apache-2.0），社区第三方 MCP 实现未核实到可背书一手源（分册"证据不足"原话）。故本项目 dp8 的 MCP server 是**自建**（"目录即工具"叙事对齐 Polaris/Databricks/MotherDuck），不经 Cube；dp4 只消费 REST `/meta`、`/load` 形状。
3. **S1 为什么静态 YAML 就够**：15 指标卡+10 术语是"小而稳"字典，改口径走治理流（低频事件）；Cube 的增量价值（预聚合+两级缓存、REST/SQL/GraphQL 多协议、securityContext）在多消费方并发探索场景才兑现。接口不变，S2 只换 DictionaryBackend 实现（规模矩阵总纲：换适配器不换接口）。
4. **修饰词消歧为什么在语义层、不在 prompt 里**："有效产量"两支口径都是 §3.2 正牌口径，差异是业务事实（跨月检修切割）——把消歧规则写进 measure 元数据+build_query 主干判断，任何上游 Agent 得到**同一个**询问；写 prompt 里则每个 Agent 各抄一份，抄错即口径漂移重演（分册：语义层让"Agent 猜 revenue 是毛是净"这类失败模式被结构性消除——Agent 从"写 SQL"降级为"选口径"）。黑话同理："躺井"限作业区语境由 resolve_term 的 note 统一携带，不靠各 Agent 自行发挥。
5. **StarRocks 无官方驱动（国产化诚实账，PRD §9-4）**：Cube 官方数据源清单含 Trino/Presto/Athena/Hive/DuckDB 等，**StarRocks 完全未列**——S2 若选 StarRocks 做交互引擎，Cube 须经 Trino 中转或走 Postgres 兼容面，如实写不粉饰。S2 主线默认 Trino（dp5 决策），Cube 骑 Trino 之上、Trino 之下是 MinIO+Iceberg——三层各管一段（分册）。

## 锚点对照

| 内容/断言 | 锚点 |
|---|---|
| `DP-W-D4-1` metric_catalog 名称+七字段 | modules.md dp4 卡（签名+七件清单逐字）；cube-semantic-layer.md（`/meta` 返回 cubes/views 名称/标题/measures/dimensions/hierarchies/segments；description+meta.ai_context）；设定书 §3（15 卡字段） |
| `DP-W-D4-2` 消歧询问 | 设定书 §3 指标 2（开井日历折算/检修剔除、跨月检修切割）+ §6（有效产量=一词两译需修饰词消歧）；分册查询 JSON 四键（measures/dimensions/timeDimensions/filters） |
| `DP-W-D4-3` 老完成率 block | 设定书 §6（禁用词，v1 口径 2024 年废弃，替代：产量完成率） |
| `DP-W-D4-4` 剔检产量 rewrite | 设定书 §6（别名→净产量，剔除检修井口径） |
| `DP-W-D4-5` 权威源仲裁 | 设定书 §3（一数四源：A11/A2/A5/E7；差异原因六项原词）+ §8 事故 13（差 3.2%；处置=语义层口径仲裁+数据源血缘标注） |
| cube YAML 形状与键名 | cube-semantic-layer.md（cubes/measures(name+sql+type/filters/format/计算度量)/dimensions/views(join_path+includes=治理边界)/meta.ai_context ≤2000 字符仅 Agent 可见；`/load` query JSON；annotation/usedPreAggregations；数值字符串防精度） |
| 术语三分支/躺井限语境 | modules.md dp4 卡（resolve_term 的 Literal["pass","rewrite","block"]）；设定书 §6（黑话→停产待检泵，限作业区语境） |
| 规模矩阵/边界规则 | modules.md dp4 卡规模档位行+规模映射矩阵 dp4 行+边界规则（dp4 禁发明口径、dp3 manifest 只读）；PRD D4（做/不做清单） |
| 取舍 1/2/3/5 | dataagent-stack-map.md §3.5（Cube=对照物非替换设定）；cube-semantic-layer.md（MCP 归属 Cloud/数据源清单无 StarRocks）；PRD §9-4 |

## 预计追问

1. **Q：Cube 的 `/meta` 和 `metric_catalog` 什么关系？** A：S2 下 metric_catalog 的实现就是拉 `/meta` 再拼 MetricDef（名称+七字段）（模块卡注"对应 Cube `/meta` 形状"）；S1 直读静态 YAML——接口同形状，后端可换。
2. **Q：为什么"有效产量"不替用户选一支口径？** A：两支都是 §3.2 正牌口径（开井日历折算/检修剔除），差异源自跨月检修切割；擅选=发明口径（边界规则明令禁止），消歧询问是唯一合规出口。
3. **Q：`description` 和 `meta.ai_context` 都给 Agent 看，重复吗？** A：不重复——description 人+Agent 通用且进 UI，ai_context 只对 AI 可见不进 UI、单条 2000 字符封顶（分册）；口径争议注记、修饰词消歧规则这类"只给模型的指令"放 ai_context。
4. **Q：平台侧设计稿 35 已有 Glossary 域，dp4 为什么还做词表？** A：同一份 §6 数据两种消费面——平台域是治理资产（人用、五级 CI 管），dp4 词表是问数入口的执行闸（机器逐词 block/rewrite）；dp4 只读设定书 §6，不是第二真源。
5. **Q：权威源仲裁结果会被 Agent 改吗？** A：不会——仲裁在语义层配置期随指标卡版本做死，Agent 只读；版本号（semantic_version）进 dp7 审计四元组，改仲裁=改指标卡走治理流，不在问数现场改。
