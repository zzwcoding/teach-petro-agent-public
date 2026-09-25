# 设计稿 DP6：新鲜度路由与拒答（dp6）

> **语言纪律声明**：本设计稿零真实可运行代码——全部代码块为**伪代码**（块首标注"伪代码 — 文件:函数"或"伪代码形状"），公开签名取自模块卡 dp6（specs/data-plane/modules.md：`route` / `refusal_text`）；函数体=输入输出契约+主干判断；分册（docs/tech-stack/streaming-batch-warehouse.md）里没有的机制细节不写，业务事实一律注 `设定书 §x`。
> **框架红线**（设计范围）：机制设计稿不点名框架——新鲜度元数据形状与 Lambda 对账叙事取 streaming-batch-warehouse.md（其模式 1/模式 2 是本卡的直接对照物）；拒答话术合同沿诚实框架纪律（"showing N of M"式不编数：话术只陈述可核实事实——档位/截至时点/可答窗，绝不补一个像样的数）。
> **接线边界**：dp6 只依赖 dp2+dp4——**只读两样元数据**：dp2 的 FreshnessInfo（档位/截至时点）、dp4 的 MetricDef（粒度/公式/权威源）；**禁止读湖表数据**（modules.md 边界规则第 3 条：路由判定不得为"先查了再说"开后门）。消费位：dp8 query 工具内部强制先经 dp9.check_join + dp6.route，`declared_as_of` 随 AnswerBundle.as_of 出场。
> **明确不讲的**：档位怎么登记（dp2 设计稿）；术语消歧/权威源仲裁的实现（dp4 设计稿——dp6 只消费结论）；对账作业执行与快照审计（dp7 设计稿）；预测类问题的模型侧处理（走查规格 D6"不做什么"）。

## 实现清单

- [x] `DP-W-D6-1` 月度指标"产量完成率" × 问题窗"今天上午" → 拒答：answerable=False，refusal_reason=档位 offline 且窗口粒度不符（粒度与档位双因判定）✅ **走查 1 分支 A**
- [x] `DP-W-D6-2` 拒答话术合同：文本含"数据截至 X，未覆盖您问的 Y"，零编数（诚实框架纪律）✅ **走查 2**
- [x] `DP-W-D6-3` realtime 档注水比 × 日内问题（S2 完整路由）→ answerable=True 走实时面，declared_as_of 与口径差异声明在场（事故 13 意识：实时加和≠统计上报）✅ **走查 1 分支 B + 走查 3**
- [x] 规模矩阵 dp6 行：S1 单档直通仍声明截至时点 / S2 完整路由 / S3 跨域路由形状 ✅ **走查 4 + 取舍 3**
- [x] 路由判定伪代码：时间窗粒度（日/月）× 档位（realtime/nearline/offline/unknown）× 指标粒度三查表；streaming-batch-warehouse.md 模式 2 freshness 档位路由逐出口对照 ✅ **走查 1 + 对照表**
- [x] 取舍 ≥4 条：Lambda 对账作业兜"两面对不上"（模式 1 对照）/ 拒答优于降级猜测（Agent 可信底线）/ S1 单档仍声明截至时点 / 粒度判定读 dp4 不猜表结构 ✅ **取舍 1–5**
- [x] 锚点对照：streaming-batch-warehouse.md / 设定书 §x → 断言 ID ✅ **锚点对照表**

---

## 伪代码走查

> **主角数据**（业务真数据样子，随行标注）：① 开发室用户问**"今天上午的产量完成率"**——§3 指标 1，粒度=月/区块·油田，公式 Σ实际产油/Σ计划配产，分母是月度计划值（数据源"2.2+配产表"）；② 采油工艺所用户问**"今天上午的注水比"**——§3 指标 6 注采比 β=月注水量/月产液量，分子分母均为在跑计量量（争议注记：折算系数按区块），底层注水/产量表已由 CDC 进实时面（dp2 登记 realtime 档，DP2 设计稿走查 2）；③ 有人问一张**从未登记**新鲜度的表。

### 走查 1：路由判定主干——三查表逐分支（DP-W-D6-1 / D6-3）

```python
# 伪代码 — app/data_plane/freshness.py
# Seam: Clock（Adapter: FakeClock 冻结时间——"现在"由注入时钟取，不直取系统钟，测试可复现"今天上午"）

def route(window: TimeWindow, metric: str) -> RouteDecision(answerable, source_tier, declared_as_of | refusal_reason):
    # 契约：问题时间窗 × 指标 → 三出口决策（答实时面 / 答离线面 / 拒答并诚实声明）
    # 确定性代码、无 LLM——上游 LLM 只负责把问题解析成 (metric, window)（分册模式 2 关键句：
    # "路由是确定性代码，LLM 只负责理解问题"）
    # 红线：全程只读 dp2 档位元数据与 dp4 口径元数据，不碰湖表——"先查了再说"是被边界规则点名堵死的后门

    m = semantic.metric_def(metric)                    # 查一（dp4）：MetricDef——公式/单位/粒度/权威源/ai_context
    if m is None:
        return refuse("指标未在语义层注册")             # 口径面没有 = 不可答，与 dp2 未登记同一纪律

    src = semantic.authoritative_source(metric)        # 一数四源仲裁结果（§8 事故 13）：metric→权威表/域的唯一合法映射
    info = ingest.freshness(src.table)                 # 查二（dp2）：FreshnessInfo(tier, as_of, pipeline)；未登记→tier="unknown"
    if info.tier == "unknown":
        return RouteDecision(answerable=False, source_tier=None,
                             refusal_reason=Refusal(kind="unregistered", table=src.table))   # 走查 4

    now = clock.now()
    if window.start >= now:
        return refuse("问题窗在未来——预测类问题不在本层处理（走查规格 D6 不做什么）")

    # 查三：窗口粒度 × 指标粒度 × 档位 × 公式可实例化性（三查表主干，分支 A→B→B'→C→兜底）
    wg = window_granularity(window)    # 窗口粒度由 TimeWindow 边界精度派生：日内（带时刻）/日/月——纯元数据派生
    mg = m.granularity                 # 指标粒度：§3 指标卡"粒度"字段（完成率=月、注采比=月、检泵周期=单井……）
    additive = formula_additive(m.formula)   # dp6 本地判定：分子分母均为可加计量量（Σ注入量/Σ产液量 ✓；
                                             # 含计划值/拟合基线/状态计数——如 Σ计划配产 ✗）。只读公式元数据，不查数据

    # 分支 A（DP-W-D6-1）：月度统计指标 × 日内窗 × 非纯可加（计划值分母）× 权威面 offline → 拒答
    if mg == "月" and wg == "日内" and not additive and info.tier == "offline":
        # "今天上午的产量完成率"：粒度=月（§3 指标 1），分母 Σ计划配产是月度计划值——"今天上午"对它不存在；
        # 月度统计指标在自然月闭合 + T+1 前没有官方值，实时加和≠统计上报（§8 事故 13）——没有可答对象，
        # 与"数据还没到"（分支 B'）不同：这一问**任何时候**都答不了官方口径
        return RouteDecision(answerable=False, source_tier="offline",
                             refusal_reason=Refusal(kind="granularity", metric=metric,
                                                    window_desc="今天上午", as_of=info.as_of,
                                                    why="档位 offline 且窗口粒度不符（§3 指标 1 粒度=月）"))

    # 分支 B（DP-W-D6-3）：日内窗 × realtime/nearline 档 × 纯可加公式 → 答实时/近线面临时值
    if wg == "日内" and info.tier in ("realtime", "nearline") and additive:
        # "今天上午的注水比"（§3 指标 6：Σ注水/Σ产液，分子分母均为在跑计量量）：日内窗只有流水面答得了
        # （8 表离线面日粒度为主，§2.2）；窗口未进仓的尾段由 declared_as_of 声明截点，口径差异声明随答附上（走查 3）
        return RouteDecision(answerable=True, source_tier=info.tier, declared_as_of=info.as_of)

    # 分支 B'（日内/今日窗 × 非 realtime 档）：只有 T+1 离线面 → 拒答并给改答路径（分册模式 2 出口② DEFER 的归并位）
    if wg == "日内" or (wg == "日" and window.end.date() == now.date()):
        return refuse(Refusal(kind="defer", as_of=info.as_of, window_desc="今天",
                              hint="离线面 T+1，明日此问可答；急用可改问实时面同源指标"))

    # 分支 C：已闭合历史窗 → 答离线面（即使同表挂了 realtime 链路：历史月结以批层覆盖后的为准，Marz 铁律）
    if window.end <= info.as_of:
        # 剧本 1《产量下滑归因》默认窗"最近 30 天"（设定书 §7）即走此分支：纯离线面问题
        return RouteDecision(answerable=True, source_tier="offline", declared_as_of=info.as_of)

    return refuse(Refusal(kind="uncovered", as_of=info.as_of,
                          window_desc=describe(window)))   # 兜底：未闭合月窗（"这个月完成率"）等超可答窗情形——
                                                           # 分册模式 2 出口③：声明边界，不编数，宁可拒答不静默
```

> **与 streaming-batch-warehouse.md 模式 2 的逐出口对照**（freshness 档位路由，直接对照物）：
>
> | 分册模式 2 出口 | dp6 对应分支 | 本设计稿微缩的增量 |
> |---|---|---|
> | REFUSE"超出该表可答时间窗" | 查三兜底 + 未来窗前置拒答 | 同构：声明边界不编数 |
> | DEFER"离线面 T+1，请明日查询或改用实时面" | 分支 B'（并入拒答出口） | dp6 多了**指标粒度**一维：月度统计指标 × 日内窗连 DEFER 都不可（分支 A 直接拒）——分册只看表档位，dp6 还看指标口径粒度 |
> | ANSWER rt/offline 面 | 分支 B / C（nearline 分支 D 并入 B 的档位枚举） | dp6 答案强制附 declared_as_of；实时面另附口径差异声明（走查 3） |

### 走查 2：拒答话术合同（DP-W-D6-2）

```python
# 伪代码 — app/data_plane/freshness.py
def refusal_text(decision: RouteDecision) -> str:
    # 契约：RouteDecision(answerable=False, …, refusal_reason) → 用户话术；只渲染 route() 的结构化结论，不改事实
    # 合同（DP-W-D6-2）：文本必含"数据截至 X，未覆盖您问的 Y"；零编数——
    #   话术元素白名单 = 截至时点 / 未覆盖窗口 / 拒答原因 / 改答路径（只指路，不给数）
    r = decision.refusal_reason
    if r.kind == "granularity":
        return (f"这个问题暂不可答：数据截至 {r.as_of:%Y-%m-%d %H:%M}，未覆盖您问的{r.window_desc}。"
                f"「{r.metric}」为月度统计指标（粒度=月），由离线面在自然月闭合后产出，"
                f"不存在「{r.window_desc}」的官方值。您可改问：上月{r.metric}；"
                f"或本月实时累产量（实时加和口径，与统计上报存在差异）。")       # 替代路径只指路，一个数都不给
    if r.kind == "defer":
        return (f"数据截至 {r.as_of:%Y-%m-%d %H:%M}，未覆盖您问的{r.window_desc}：该表走 T+1 离线面，"
                f"明日此问可答；急用可改问实时面同源指标（以实时加和口径声明为准）。")
    if r.kind == "unregistered":
        # unknown 档的诚实退化：没有登记就没有可声明的截至时点——零编数纪律优先于模板，连"数据截至 X"都不填
        return ("这个问题暂不可答：该数据表尚未登记新鲜度档位（未入湖或进料管道未登记），"
                "在登记完成前我无法声明数据截至时点，因此不作答，也不猜测。")
    return f"数据截至 {r.as_of:%Y-%m-%d %H:%M}，未覆盖您问的{r.window_desc}，该窗口超出可答范围。"
```

> 合同要点：**拒答不是空手**——"截至 X / 未覆盖 Y / 可答 Z"三件套把"不知道"变成可核实的结构化事实（诚实框架："showing N of M"式陈述，绝不补数）。

### 走查 3：realtime 档日内问答——答实时面 + declared_as_of + 口径差异声明（DP-W-D6-3，S2 完整路由）

```python
# 伪代码形状 — 实时面作答的口径差异声明（dp6 导出模板常量，dp8 渲染）
CALIBER_NOTE_REALTIME = ("以上为实时面加和的临时值，数据截至 {as_of}。"
    "提示：实时加和 ≠ 统计上报——同一「油气产量」在 A11 实时加和 / A2 上报审核 / A5 站库计量 / "
    "E7 统计上报四个系统互不一致（设定书 §3.1「一数四源」/§8 事故 13：差 3.2%）；"
    "正式月度口径以离线面月结为准。注采比另注意：体积折算系数按区块取值（设定书 §3 指标 6）。")

# dp8.query 的强制闸序（dp8 卡：内部 dp9.check_join → dp6.route → dp5.run → dp7.record）：
d = freshness.route(window, metric)                    # dp6 在闸序第二位：SQL 生成之前就拦
if not d.answerable:
    return reject(refusal_text(d))                     # 拒答出闸，不生成 SQL、不碰引擎
res = query_runner.run(semantic.build_query(metric, dims, window, filters))
answer = AnswerBundle(arrow_summary=summarize(res.arrow), snapshot_id=res.snapshot_id,
                      quality_status=quality_status, as_of=d.declared_as_of)  # declared_as_of 落 AnswerBundle.as_of
if d.source_tier == "realtime":
    answer.attach(CALIBER_NOTE_REALTIME.format(as_of=d.declared_as_of))     # 口径差异声明"在场"的落点（DP-W-D6-3）
audit.record(question_id, query, res.snapshot_id, semantic_version, quality_status)  # dp7 四元组留痕
```

> 职责分界：**话术由 dp6 管（导出模板），组装由 dp8 管**——dp6 的公开签名只有 route/refusal_text 两个，口径声明以模板常量随模块暴露，不新增签名。

### 走查 4：unknown 未登记分支 + 规模矩阵 dp6 行（S1 单档 / S2 完整 / S3 跨域）

```text
伪代码形状 — 规模档位（换的是适配器，不是接口）
S1 单档直通：ingest.freshness 恒返回 offline 档（StaticFreshness 固定档位，dp2 Adapter）——
  分支 B 不可达，日内/今日窗一律拒答（分支 A / B'），已闭合窗走分支 C；
  唯一不变的是 declared_as_of 仍随每张答案出场（取舍 3）——"单档"省的是路由，不省声明。
S2 完整路由：本设计稿走查 1–3 主干。
S3 完整路由+跨域：authoritative_source 定域 → 各域 catalog 各自的 dp2 登记面 → 同一 route 合同按域复查；
  四个系统的四个"油气产量"只答仲裁后的权威源那个域（事故 13 的工程收口）——本设计稿留钩子不展开（dp1 S3 目录联邦同构）。
unknown 未登记分支：ingest.freshness 返回 tier="unknown"（DP2 设计稿走查 2 步 3）→ route 直接拒答；
  refusal_text 的 unknown 话术连"数据截至 X"都不填——没登记=无可声明的截至时点，零编数纪律优先于模板。
```

---

## 取舍

1. **Lambda 对账作业怎么兜"两面对不上"（streaming-batch-warehouse.md 模式 1 对照）**：dp6 的口径声明只解决"用户知情"，不解决"数据收敛"——收敛靠 dp7 S2 档的每日对账作业：实时面 ↔ 离线面逐指标比对，偏差≤阈值（取值沿 §4 规则 12 物质平衡勾稽 3% 的纪律，不另发明数）→ 以离线面为准、实时面被覆盖（Marz 铁律："everything the realtime layer computes is eventually overridden by the batch layer"）；偏差>阈值 → 告警进问题单（§4 质量闭环），口径仲裁交 dp4 权威源（事故 13 差 3.2% 的教训：两面对不上不能靠用户自己发现）。dp6 声明与 dp7 对账是一体两面：**声明面向人，对账面向数**。
2. **为什么拒答优于降级猜测（Agent 可信底线）**：分册原话"答不了的一律声明延迟档位而不是编"；Agent 编一个像样的数比"查不到"更糟——用户会拿两个版本的事实去做月度汇报（事故 13 的引信正是两套数各说各话）。拒答在 dp6 是确定性代码出口（模式 2："路由是确定性代码，LLM 只负责理解问题"），把"不知道"结构化成"截至 X / 未覆盖 Y / 可答 Z"；副产品是把 LLM 挡在判定闸外——三查表可单测（FakeClock 冻结时间复现"今天上午"）。
3. **S1 单档直通为什么仍要声明截至时点**：单档只是没有路由选择，不等于没有新鲜度边界——8 表日粒度 + T+1（§2.2）意味着"今天"永远不可答；不声明 as_of，用户会默认拿到的是"现在"的数（危险默认）。且 declared_as_of 是 dp8 AnswerBundle.as_of 与 dp7 审计的合同字段：S1 就带声明纪律，升 S2 接口零改动（规模矩阵总则：换的是适配器，不是接口）。
4. **粒度判定为什么读 dp4 而不是猜表结构**：边界规则点名禁 dp6 读湖表数据——"先查了再说"正是要堵的后门（离数据最近的路由层，查一次的诱惑最大）。表结构只说明"表能装什么"，说明不了"指标的官方口径粒度"：粒度是 §3 指标卡字段（完成率=月、注采比=月），月度统计指标的权威产出面在月结离线面——这些只有语义层知道；metric→表映射也走 dp4 authoritative_source（一数四源仲裁结论），dp6 连表名都不自己猜。
5. **DEFER 出口并入拒答而不是独立第三态（模式 2 对照的偏差声明）**：分册模式 2 三出口 ANSWER/DEFER/REFUSE；模块卡收敛为"答实时面/答离线面/拒答并诚实声明"。DEFER（"T+1 明日可答或改实时面"）并入拒答出口、由话术承担引导——dp8 只需处理 answerable 布尔，决策枚举少一个第三态；代价是引导语进话术合同（仍零编数：只指路不给数）。

## 锚点对照

| 论断 | 注源 | 兑现位置 → 断言 ID |
|---|---|---|
| freshness 档位路由三出口；超窗 REFUSE"声明边界，不编数"；路由是确定性代码、LLM 只负责理解问题 | streaming-batch-warehouse.md 模式 2 | 走查 1 + 对照表 → `DP-W-D6-1`/`D6-3` |
| DEFER"离线面 T+1，请明日查询或改用实时面" | streaming-batch-warehouse.md 模式 2 出口② | 走查 1 分支 B' + 取舍 5 → — |
| "答不了的一律声明延迟档位而不是编"；Agent 引用两版本事实比查不到更糟 | streaming-batch-warehouse.md「为什么 DataAgent 需要」①② | 取舍 2 → `DP-W-D6-2` |
| Lambda 对账：偏差≤阈值以离线面为准（Marz 铁律）、>阈值进问题单交语义层仲裁 | streaming-batch-warehouse.md 模式 1、Marz 2011 | 取舍 1 → — |
| 完成率 Σ实际产油/Σ计划配产、粒度=月/区块·油田、数据源 2.2+配产表 | 设定书 §3 指标 1 | 走查 1 分支 A → `DP-W-D6-1` |
| 注采比 β=月注水量/月产液量（体积折算）、折算系数按区块 | 设定书 §3 指标 6 | 走查 1 分支 B + 走查 3 声明 → `DP-W-D6-3` |
| 一数四源：A11/A2/A5/E7 四系统互不一致；事故 13 差 3.2% | 设定书 §3.1、§8.13 | 走查 3 CALIBER_NOTE + 取舍 1 → `DP-W-D6-3` |
| 8 表以日粒度为主（oil_production_daily 一井一日）；15 分钟级闭环=准实时档 | 设定书 §2.2、§2.1 | 走查 1 分支 B 注 + 分支 D → 规模矩阵 dp6 行 |
| 剧本 1 时间窗默认最近 30 天（纯离线面） | 设定书 §7 | 走查 1 分支 C → — |
| 未登记表 freshness 返回 unknown=不可答 | specs/data-plane/modules.md dp2 卡、DP2 设计稿走查 2 | 走查 1/4 unknown 分支 → `DP-W-D6-2` |
| dp6 禁读湖表数据（只读 dp2 档位元数据与 dp4 粒度） | specs/data-plane/modules.md 边界规则表第 3 条 | 走查 1 头注 + 取舍 4 → — |
| dp8 query 内部强制先经 dp9.check_join + dp6.route；AnswerBundle 含 as_of | specs/data-plane/modules.md dp8 卡 | 走查 3 → `DP-W-D6-3` |
| S1 单档直通+声明 / S2 完整路由 / S3 完整路由+跨域 | specs/data-plane/modules.md 规模矩阵 dp6 行 | 走查 4 + 取舍 3 → 规模矩阵行 |
| 诚实框架纪律（showing N of M 式不编数） | 本设计稿框架红线 | 走查 2 → `DP-W-D6-2` |

## 预计追问

1. **用户被拒答后非要一个数怎么办？** 给改答路径（改窗口/改口径/改实时面）不补数；确有实时面可答的，走分支 B 的临时值+声明路径——绝不静默降级去编。
2. **路由判定要不要 LLM 参与？** 不：LLM 只把自然语言解析成 (metric, window)（dp4 术语消歧在先），路由是确定性三查表——可单测、可审计，FakeClock 冻结时间即可复现"今天上午"。
3. **实时面临时值和月报对不上，谁负责？** 两面治理：对用户靠口径声明在场（DP-W-D6-3），对数据靠 dp7 对账作业（≤阈值离线面覆盖、>阈值问题单+dp4 仲裁）——事故 13 的教训就是不能靠用户自己发现。
4. **unknown 档为什么直接拒，不先查一下试试？** 边界规则禁 dp6 读湖表；未登记=无法声明新鲜度=不可答，"先查了再说"正是要堵的后门——拒答话术连"数据截至"都不编。
5. **nearline（15 分钟档）什么时候答？** §2.1 的闭环调度档：日内问题而指标权威面在近线聚合时答 nearline 面，declared_as_of 与口径声明纪律与 realtime 完全同款。
