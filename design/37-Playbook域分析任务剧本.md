# 设计稿 37：Playbook 域——分析任务剧本

> **红线声明**：本设计稿零真实可运行代码。全部代码块均为**伪代码**（块首标注"伪代码 — 文件:函数"或"伪代码（时序推演，非代码）"），公开签名取自模块卡 `m16`（`PlaybookRegistry.match_intent(intent) -> PlaybookDef | None`——卡面注释逐字"触发意图/步骤/工具/缺参策略/HITL 点/输出合同——'为什么下滑'类分析任务的剧本（m7 按剧本驱动子图）"；`register` 按设计范围伪代码梳理范围补写为写半边：冷启动 approve 的落域动作与手工资产过闸共用同一套闸，见主干一末段声明），函数体=输入输出契约+主干判断；剧本六字段的业务内容全部取自设定书 §7 剧本草案（逐条注源 `设定书 §x`）与提取件三（`提取件三 §x`），本设计稿只负责"格式化为 YAML"（设定书边界声明：草案给业务内容，设计稿负责格式化）。HITL 档位注源设定书 §7 剧本 1 括号原文"按 L1-L5 自主等级 [李欣]"——档位定义在提取件三 §1.6。
> **框架红线**（设计范围）：剧本为 YAML 资产——沿用 m16 既有纪律，`yaml.safe_load` 装载 `playbooks/*.yaml`（剧本文件与口径/术语/本体文件同规：**是数据不是代码**），官方调用序列在主干一给出，不许概念性提及；HITL 复用 LangGraph interrupt 既有机制（锚 docs/tech-stack/langgraph.md——`interrupt(审批载荷)` 暂停→人工决定→`Command(resume=决定)` 恢复→整节点幂等重跑，形状照设计稿 14 主干八既有写法，不发明第二种人工介入机制）。
> **接线边界**：本节活动范围**只在 m16 的 `playbook.py` + `playbooks/` 资产目录，外加 `m7` 的 `clarify_intent` 一处接线**（设计范围 Touches modules 明示）——`registry.py`/`resolver.py`/`lifecycle.py`/`glossary.py`/`ontology.py`/`metrics/`（设计稿 22/35/36 已交付）零改动；`ossie.py` 不动（设计稿 41）；m7 侧**只动 `intent.py` 一个文件**：分岔段收进 `clarify_intent` + 模块私有函数（同文件私有件），`graph.py` 的 State 七字段/六节点布线/反思回边/checkpointer 零触碰——剧本驱动子图是**节点内的数据驱动子图**，不是图上新布线（取舍 1）；步骤内的执行全走既有公开面（设计范围边界红线原话：检索瀑布/校验链/工具执行器——本节兑现为 m14 选表公开面、设计稿 22 指标模板公开面、m17 `GuardChain.validate` 单出口、m8 `Executor.call`、m2 网关，检索瀑布的实装归设计稿 39）；m7 对 m16 只增 `match_intent` 一个调用点（卡 `m16` Seam 行点名公开面），`PlaybookDef` 是 `match_intent` 的返回形状——读返回值=只认公开面，YAML 文件本体只有 m16 装载时碰。
> **stub 换真身声明**：`playbook.py` 本节即真身（PyYAML + 文件系统 + `m3` 公开面）；卡面 Adapter **FakeRegistry**（设计稿 22 已登记，同签名覆盖 Playbook 半边）照例供后续设计稿走查指名注入，本设计稿不展开。
> **明确不讲的**（设计范围声明）：检索瀑布 S0–S8（设计稿 39——`Waterfall.retrieve`/`Anchor.parse` 零出现，本节 `_执行步骤` 的选表半边走 m14 既有公开面，设计稿 39 升级时换真）；强类型中间态五段（设计稿 40——`TypedState.assemble` 零出现，剧本绑定暂住 `intent` 字段内，设计稿 40 升格）；Ossie 兼容导出（设计稿 41）；五级语义 CI 门禁本体（设计稿 38——本节只交付它要收编的引用闭包形状）；剧本《注水井措施评估》全文资产（设定书 §7 剧本 2 有草案全文，设计范围验收只点名两份 YAML，它作为冷启动下一份候选走主干三链路入域，本设计稿不落全样例）。

## 实现清单

- [x] "为什么下滑"命中剧本，步骤/工具/缺参策略/HITL 点/输出合同逐项可查（源：W-F19-3；卡 `m16` PlaybookRegistry）✅ **第 0 步**（设定书 §7 剧本 1 逐行格式化为剧本资产 1/2——六字段逐项注源）+ **主干五**（步骤执行全走既有公开面）+ **走查推演 1**（"渤海产量为什么下滑"五步逐项可查表）
- [x] 缺参走剧本策略（澄清/默认值），不阻塞主问（源：卡 `m16` PlaybookDef 字段契约；报告一）✅ **主干六**（默认值+标注 / 澄清反问双半边；`annotate` 缺失装载即拒）+ **主干四**（分岔段先于设计稿 14 充分性闸——命中剧本的问题不被反问闸拦住）+ **走查推演 1** t1（时间窗缺→默认最近 30 天带标注，反问闸零触发）
- [x] 未命中剧本的问题回退自由反思回边，行为与 v2 一致（反断言；源：卡 `m7`）✅ **主干四**（`match_intent` 返回 None→后续两分支与设计稿 14 主干三逐字一致；六节点主干一行未动的结构保证）+ **走查推演 3**（反断言三连：返回值形状/结构零改动/执行轨迹逐站对照）
- [x] 剧本资产 YAML ≥2 个（产量下滑归因/月度完成率体检）（源：卡 `m16` 目录契约 playbooks/）✅ **第 0 步**（资产 1/2 产量下滑归因全样例 + 资产 2/2 月度完成率体检精简样例）
- [x] 越界引用为零（源：边界规则表）✅ **越界自查**

---

## 走查：从输入到验收行为

> **主角数据**（业务真数据样子，全部取自设定书 §7/§3/§8/§1/附录 A 与提取件三，标注随行）：
> ① 老王（开发室，产量口径业务 Owner 侧用户——设定书 §1）问 **"渤海产量为什么下滑"**——归因剧本主角（W-F19-3；设定书 §10 锚点行"'为什么下滑'剧本引 §7"）。问题里没有时间窗——缺参策略主角（§7 剧本 1 原文：时间窗默认最近 30 天）；
> ② 捣乱输入 A：剧本步骤 2"分解"的自由生成段想把设备状态表与日产表 **直连**算停产影响——装配关系资产库没登记（设计稿 36 资产 4/9 结构空白声明同一处空白），被执行前校验链默认拒绝——剧本级处置主角（设计范围伪代码梳理范围第 3 条）；
> ③ 走查推演 3 主角：老王问 **"上个月 N-2 井的日产油"**（设计稿 14 主干同款标准问）——单井取数不在任何剧本触发意图里，未命中回退（反断言，验收 3）；
> ④ 第二剧本主角：每月例行 **"这个月完成率体检"**——月度完成率体检剧本（设计范围给定的第二份资产名；业务内容注源设定书 §3 指标 1/11/14、§8 事故 13、附录 A.1/A.8）；
> ⑤ HITL 时刻：步骤 3 生成三个归因分支候选（地质：含水上升？工程：检泵停产？管理：配产调整？——设定书 §7 步骤 3 原文），分支间置信度差距小于阈值——触发剧本 1 唯一的 HITL 点（L2 档：机器生成候选建议、人工确认后执行——提取件三 §1.6 L2 原文），老王确认"工程分支优先下钻"。
> **地图先行**（剧本域在 m16 与问数链的位置；命中/未命中分岔一步看全，后续主干引用不重画）：

```text
伪代码（总览，非代码）

问数状态机容器 C5 — m7（app/agents/text2sql/）              语义层容器 C15 — m16（app/semantics/）

clarify_intent（设计稿 37 分岔段，主干四）：
  抽槽位 → ① PlaybookRegistry.match_intent(意图特征) ───→ playbook.py:PlaybookRegistry.match_intent
  │                                                       第 1 级 显式点名（"为什么下滑"原词/别名）
  │                                                       第 2 级 槽位特征全覆盖（产量+下滑+归因）
  │                                                       未命中 → None（诚实返回，回退既有主干）
  ├─ 命中 → 剧本驱动子图（节点内，主干五）：
  │    缺参策略（主干六：默认值+标注 / 澄清反问）
  │    步骤循环：每步一腿走既有公开面——
  │      指标模板(m16/设计稿 22) · 选表(m14) · 生成(m2) · 校验链(m17 单出口) · 执行器(m8)
  │    校验拒绝 → 步骤 on_reject 剧本级处置（捣乱输入 A，不绕闸不自由发挥）
  │    HITL 点 → interrupt 挂起等确认（设计稿 15 既有机制，锚 docs/tech-stack/langgraph.md）
  │    输出合同组装（结论+证据链+数据版本）→ goto=END 出图
  └─ 未命中（None）→ 设计稿 14 主干三原样两分支：
       sufficient → 放行选表 → 生成 → 校验 → 执行 → 结果校验 → 反思回边 ↺（设计稿 14 一行未动）
       不足       → 反问话术 goto=END（信息不足闸原样）
冷启动旁路（离线，主干三——三域同规的第四个同构位）：
  触发意图撞车 / 步骤引用断裂 / 关卡悬空 / 工具越界 四条冲突检测 → Owner 审批 → 写回 playbooks/*.yaml → load 重载
```

### 第 0 步：剧本资产长什么样（交付物本体）

> 业务结构显性化：剧本域登记的是**任务事实**（这类分析任务分几步、每步用什么口径与数据面、缺参怎么办、哪步要人拍板、最后交什么）——不是口径事实（怎么算——设计稿 22）、语言事实（叫什么——设计稿 35）、结构事实（怎么连——设计稿 36）。四域各答一层：指标答"这个数怎么算"，剧本答"这个任务分几步干"。六字段对齐卡 `m16` PlaybookRegistry 注释逐字（触发意图/步骤/工具/缺参策略/HITL 点/输出合同）与 DataBuddy Playbook 六字段（锚 DataBuddy，AE 前沿方案报告 §⑤ "Playbook（触发意图/步骤/工具/缺参/HITL/输出合同）"）。每步除动作外还声明**关卡**（`tools` 公开面枚举 + `on_reject` 拒绝处置）——"剧本只声明'步骤与关卡'"是设计范围边界红线原词，关卡在 YAML 里有落点。kind 是机器判的紧枚举（playbook），一剧本一卡。

```yaml
伪代码 — app/semantics/playbooks/pb_production_decline.yaml（剧本资产 1/2——产量下滑归因，全样例）

# 设定书 §7 剧本 1《产量下滑归因》逐行格式化；档位注源提取件三 §1.6（李欣 L1~L5 自主等级）
id: pb_production_decline
kind: playbook                            # 机器枚举：playbook——装载闸按 kind 验收（主干一）
object: 产量下滑归因
trigger_intent:                           # 六字段之一：触发意图（设定书 §7 剧本 1 括号原文"触发意图='为什么下滑'"）
  pattern: 为什么下滑
  aliases: [产量下滑归因, 下滑原因]        # 口语叫法面——match_intent 显式点名层（主干二）
  features: [指标类=产量, 动向=下滑, 问式=归因]   # 槽位特征——match_intent 特征覆盖层；missing 不参与命中（主干二）
steps:                                    # 六字段之二：步骤（设定书 §7 剧本 1 五步原文逐行）
  - no: 1
    name: 拉完成率与构成                   # §7 步骤 1 原文
    uses:                                # 步骤引用的口径与数据——引用闭包在装载闸验（主干一）
      - metric: 产量完成率               # ★Σ实际产油/Σ计划配产×100%，月/区块·油田——设定书 §3 指标 1（Owner 开发室）
      - 构成三件: 产油/开井数/时率        # §7 步骤 1 括号原文；时率=Σopen_days/Σ日历天×100%——§3 指标 14
    tools: [指标模板, 只读查库]            # 六字段之三：工具=既有公开面紧枚举（设计稿 22 template_for / m8 执行器——主干五）
  - no: 2
    name: 分解                            # §7 步骤 2 原文
    uses:
      - 拆分四件: 新井贡献/老井递减/措施增油/停产影响   # §7 步骤 2 原文
      - metric: 自然递减率               # 1−q_t/q_{t−1}（扣新井与措施增油）——设定书 §3 指标 3（§7 步骤 2 原文"用指标 3/8/10"）
      - metric: 措施有效率               # N_y/N_z×100%——设定书 §3 指标 8
      - metric: 递减增油                 # 受效油井实际产油−按拟合基线、多井受效按劈分系数（Σ=1）分摊——设定书 §3 指标 10；
                                         #   一数多源争议之最（§8 事故 7；附录 A.5 两作业区算法不一致）——证据链必须带口径标注
    tools: [只读查库, 生成]               # 生成=m2 网关（冻结纪律，设计稿 14 主干五同款——步骤圈定范围进提示词）
    on_reject: 停产影响的设备级拆分被校验链拒绝时，改用检修台账估算并标注估算口径（附录 A.4 affected_output
               各作业区估算口径不一）——不换未声明的数据面、不自造 join（捣乱输入 A 的处置依据）
  - no: 3
    name: 归因分支                        # §7 步骤 3 原文
    uses:
      - 三分支: 地质=含水上升（§3 指标 5 综合含水率）/工程=检泵停产（附录 A.4 检修台账）/
                管理=配产调整（§3 指标 1 争议注记：计划版本切换日双值）   # §7 步骤 3 括号原文三分支
    tools: [只读查库, 生成]               # 生成=分支候选与置信度（"机器生成 1~2 套决策建议"的 L2 语义——提取件三 §1.6）
  - no: 4
    name: 下钻受效关系与检修台账           # §7 步骤 4 原文——消费设计稿 36 受效关系卡与井 Action 台账落点（设计稿 36 钩子兑现位）
    uses:
      - 受效关系: 注水井—受效→油井（N:N，属性=劈分系数 Σ=1/响应起始日——设计稿 36 资产 8/9）；
                  产液×注水日报直连是受控 ✗（须经受效关系实体——设定书 §5 白名单条目），剧本步骤声明的就是受控路径
      - 检修台账: well_overhaul（附录 A.4——跨月检修如 8-28→9-06 的当月归属是已知切割争议源，
                  证据链带检修起止原窗口，切割口径归 Owner 裁决＝§1 产量口径 Owner）
    tools: [只读查库]
  - no: 5
    name: 生成归因报告                     # §7 步骤 5 原文
    uses: []                             # 汇编步骤不查数——空也必须显式写（装载闸验形状）
    tools: [生成]
missing_policy:                           # 六字段之四：缺参策略（设定书 §7 剧本 1 原文："时间窗默认最近 30 天、范围默认全区块并标注"）
  时间窗: {default: 最近30天, annotate: true}    # 默认值+标注——报告一"用户不响应则套用合理默认值不阻塞"
  范围: {default: 全区块, annotate: true}        # annotate 是装载闸强制位（主干一）：无标注的默认值=静默口径，装载即拒
hitl_points:                              # 六字段之五：HITL 点（设定书 §7 括号原文：按 L1-L5 自主等级——机器建议占比与
                                          #   置信度决定人工确认档位；档位定义=提取件三 §1.6）
  - at_step: 3
    gate: 归因分支确认                     # 关键分岔：结论定调的一步——分支选错，步骤 4 下钻与整份报告跟着错
    level: L2                            # "机器生成 1~2 套决策建议，无最终决策权，需人工确认后执行"——提取件三 §1.6 L2 原文
    trigger: 分支间置信度差距小于阈值       # §7 括号原文"置信度决定人工确认档位"的设计落形
    mechanism: interrupt                 # 复用 LangGraph interrupt 既有机制（设计稿 15 审批位同款；锚 docs/tech-stack/langgraph.md；设计稿 14 主干八形状）
output_contract:                          # 六字段之六：输出合同（设定书 §7 步骤 5 原文："结论+证据链+数据版本"）
  - 结论（主因/次因/量级，引用分支确认记录）
  - 证据链（设计稿 24 血缘解释链同源：指标名+版本+来源表+过滤条件；步骤留痕与 on_reject 处置记录逐条附）
  - 数据版本（批次水位——设计稿 24 新鲜度闸读同一水位源；过期标注照带不冒充现行）
owner: 开发室（产量口径 Owner——设定书 §1；§3 指标 1/3 同 Owner）；措施类口径联席 采油工艺所（开发室联席——§3 指标 8/10 Owner 列）
status: approved
version: 1
```

```yaml
伪代码 — app/semantics/playbooks/pb_monthly_completion_check.yaml（剧本资产 2/2——月度完成率体检，精简样例）

# 剧本名=设计范围给定（验收 4）；步骤业务内容注源：设定书 §3 指标 1/11/14、§7 剧本 1 步骤 1 构成原文、
# §8 事故 13、附录 A.1/A.8——精简=步数少、HITL 只一个点，六字段一件不少（装载闸同闸）
id: pb_monthly_completion_check
kind: playbook
object: 月度完成率体检
trigger_intent:
  pattern: 完成率体检
  aliases: [本月完成率怎么样, 月度完成率]
  features: [指标类=完成率, 问式=体检]
steps:
  - no: 1
    name: 拉本月完成率
    uses:
      - metric: 产量完成率               # 设定书 §3 指标 1——争议注记"计划版本切换日双值"：体检单按计划版本分列，不混列
    tools: [指标模板, 只读查库]
  - no: 2
    name: 构成三件体检
    uses:
      - 构成三件: 产油/开井数/时率        # 设定书 §7 剧本 1 步骤 1 构成原文；时率=§3 指标 14
      - 井状态核验: 开井数口径过状态字段——附录 A.1 脏特征"N-11 已停仍'生产中'"（状态滞后）会让开井数虚高，体检单标注
    tools: [只读查库]
  - no: 3
    name: 井口与结算口径对账
    uses:
      - 对账两口径: 井口产量 vs 月度结算净重（扣自用油与输差、与井口口径天然不等——附录 A.8；§3 指标 11 商品量）
      - 差异样例: 一数四源（§8 事故 13：A11 实时加和 vs E7 统计上报差 3.2%）——体检单只报差异与口径出处，
                  仲裁归 Owner（§8 事故 13 处置行"语义层口径仲裁"；权威源回读归设计稿 39，本节不预支）
    tools: [只读查库]
missing_policy:                           # 缺参策略模式=§7 剧本 1 原文同款（默认值+标注）；默认粒度随指标（§3 指标 1 粒度"月"）
  时间窗: {default: 本月, annotate: true}
  范围: {default: 全区块, annotate: true}
hitl_points:
  - at_step: 3
    gate: 口径差异呈报                     # 机器对账出差异单，人工裁决差异要不要立案（§8 事故 13 仲裁归 Owner）
    level: L2                            # 提取件三 §1.6 L2
    trigger: 差异超过容忍阈值
    mechanism: interrupt
output_contract: [结论（含口径差异单）, 证据链, 数据版本]   # 与剧本 1 同款合同（§7 步骤 5）
owner: 开发室（§3 指标 1 Owner；§1 产量口径 Owner 行）
status: approved
version: 1
```

### 主干一：装载闸与 register——六字段闸 + 引用闭包 + 一意图一剧本（三域同款装载纪律）

```text
伪代码 — app/semantics/playbook.py:PlaybookRegistry（m16；签名=卡 m16；装载纪律=设计稿 22/35/36 四域同款）

import yaml                                 # PyYAML——与设计稿 22/35/36 同一纪律

class PlaybookRegistry:
    def __init__(self, repository):
        self._repo = repository             # m3 公开面注入（save_query_snapshot/get 走查快照、save_audit 决议行）——零引擎内部触碰
        self._by_intent = {}                # 触发意图 → PlaybookDef（一意图一剧本——撞车在装载期即死）
        self._playbooks = {}                # 剧本 id → PlaybookDef

    async def load(self, dir) -> None:
        files = sorted(Path(dir).glob("*.yaml"))
        if not files:                       # 主干判断：目录空=剧本资产没随版本管理交付——装配缺失
            raise SemanticRegistryLoadError("playbooks 目录为空——剧本文件未交付")
        for path in files:
            raw = yaml.safe_load(path.read_text(encoding="utf-8"))
            # ↑ 官方调用序列与设计稿 22/35/36 逐字同款：safe_load 只构造标量/列表/字典，不实例化文件里的
            #   任意 Python 对象——剧本文件"是数据不是代码"的机制保证（剧本=任务知识，不是可执行逻辑）
            卡 = 六字段闸(raw, path)         # 任一不过 → SemanticRegistryLoadError(文件名, 字段)：
            #   公共：id/kind=playbook/object/owner/status/version 齐；status ∈ {approved}——playbooks/ 是权威目录，
            #     候选只住 m3 候选池（主干三），出现在此即拒绝装载（四域同款闸）
            #   六字段齐（卡 m16 注释逐字）：
            #     trigger_intent.pattern 非空 + features 非空；
            #     steps 非空且 no 连续；每步 tools ⊆ 公开面紧枚举 {指标模板, 选表, 生成, 只读查库}——
            #       声明了枚举之外的工具=装载期即死（设计范围边界红线"步骤内的执行仍走既有公开面"的资产侧对应：
            #       剧本在纸上就不能给步骤发未登记的武器）；
            #     missing_policy 每个默认值必须 annotate: true——无标注的默认值=静默口径，装载即拒
            #       （"不阻塞"不等于"不吭声"，主干六）；
            #     hitl_points[].at_step 必须指向已存在的步骤号——关卡不悬空；
            #     output_contract 必须含 结论/证据链/数据版本 三件（设定书 §7 步骤 5 合同形状）
            #   引用闭包（后登记重载二次对账，设计稿 38 CI L2 的装载期前置半边）：
            #     steps[].uses 的 metric 引用必须在指标域（m16 公开面）已登记——未登记=引用断裂，拒；
            #     台账/字段引用对照附录 A 数据字典（附录 A.4/A.5/A.8 等）
            #   一意图一剧本：pattern/aliases 与已装载剧本重叠=剧本打架，装配期即死（主干三冲突检测①的运行时对账）
            self._by_intent[卡.trigger_intent.pattern] = 卡
            self._playbooks[卡.id] = 卡
        await self._repo.save_audit("playbook_manifest", 序列化(生效清单))
        # 异常去向：SemanticRegistryLoadError 原样上抛——装配点拒绝启动（四域同款哲学：带病剧本宁可不上线）

    def register(self, 剧本草稿) -> 剧本 id:
        # 写半边（设计范围伪代码梳理范围点名）：冷启动 approve 的落域动作与治理者手工资产过闸共用——
        #   同一套六字段闸+引用闭包（不写第二份校验），过闸才写 playbooks/{id}.yaml → load 重载（进程内即时生效）
        #   → save_audit 决议行。卡面公开接口只点名 match_intent，register 是四域同款装载/写回语义的写半边，
        #   不新增任何查询面（越界自查有声明）
        六字段闸(剧本草稿)                   # 未过闸一个字节不落盘
        写 playbooks/{剧本草稿.id}.yaml(剧本草稿)
        await self.load(PLAYBOOKS_DIR)
        return 剧本草稿.id
```

### 主干二：match_intent——任务级命中先于参数级充分（卡 m16 查询签名；本节灵魂之一）

```text
伪代码 — app/semantics/playbook.py:PlaybookRegistry.match_intent（m16；签名=卡 m16 逐字；纯内存读，同步）

class PlaybookDef:              # 数据形状——match_intent 的全部产出（调用方只看它，不碰 YAML 细节——卡 m16 Seam 行）
    id / object: str            # "pb_production_decline" / "产量下滑归因"
    trigger_intent: dict        # 触发意图（pattern/aliases/features）
    steps: [dict]               # 步骤序（no/name/uses/tools/on_reject）
    missing_policy: dict        # 缺参策略（参数 → 默认值+标注 或 澄清）
    hitl_points: [dict]         # HITL 点（at_step/gate/level/trigger/mechanism）
    output_contract: [str]      # 输出合同（结论/证据链/数据版本）
    owner / version / status    # 治理字段（四域同款）

    def match_intent(self, intent) -> PlaybookDef | None:
        # 入参 intent = m7 clarify_intent 的抽槽位产物（卡 m7 State 行 intent 格：entities/missing/sufficient）
        特征 = 意图特征(intent)              # {点名, 指标类, 动向, 问式}——从 entities 与问式抽取
        for 剧本 in self._by_intent.values():
            if 特征.点名 in {剧本.trigger_intent.pattern, *剧本.trigger_intent.aliases}:
                return 剧本                  # 第 1 级：显式点名（"为什么下滑"原词/别名——设定书 §7 触发意图原文）
            if 特征.指标类/动向/问式 ⊇ 剧本.trigger_intent.features:
                return 剧本                  # 第 2 级：槽位特征全覆盖（产量+下滑+归因——问法千变，特征收敛）
        return None
        # 主干判断①：★missing 不参与命中判定——"渤海产量为什么下滑"缺时间窗照样命中剧本。任务级命中
        #   （这是不是我管的分析任务）先于参数级充分（参数够不够出数）：前者归剧本域，后者在剧本内走
        #   缺参策略（主干六）——若反过来先过设计稿 14 充分性闸，缺时间窗的问题会被反问闸拦住，缺参策略死在闸后，
        #   "缺参不阻塞主问"（验收 2）无从谈起。分岔段因此必须放在充分性闸之前（主干四）
        # 主干判断②：未命中返回 None 是正常业务态不是错误——诚实呈报，分岔交给调用方（四域同哲学：
        #   设计稿 22 lookup 零候选放行自由生成、设计稿 36 resolve_entity 零命中返回空列表）
        # 主干判断③：只答 0 或 1，不挑剧本——一意图一剧本在装载闸锁死（主干一），运行时无多候选歧义
        # 异常去向：查询面只读内存零副作用；本函数不执行任何步骤——执行是调用方（m7 剧本驱动子图，主干五）的事
```

### 主干三：冷启动闭环——候选→冲突检测→Owner 审批，第四个同构位（W-F19-4 同构；设计稿 36 钩子兑现）

```text
伪代码 — app/semantics/playbook.py:PlaybookCandidatePool（m16；冷启动四域同规——链同规抄设计稿 36 主干四形状，
         本主干只讲剧本域的差异点："剧本打架"查什么）

class PlaybookCandidate:        # 数据形状——AI 只产候选草稿（四域同款：候选不带证据不收）
    payload: dict               # 剧本六字段草稿
    source: str                 # "manual"（Owner 手工草案——设定书 §9 冷启动候选行设计替身）
                                # | "runtime"（问数链 miss 信号的剧本缺口候选——采集归设计稿 42 建议池，本域只收货）
    evidence: str               # 证据原文摘录（设定书 §7 草案节选 / Runtime miss 现场）

    def propose(self, candidate) -> proposal_id:
        if 指纹已待审(候选指纹(candidate)): return 既有 proposal_id      # 幂等（四域同款）
        await self._repo.save_snapshot(f"pb-proposal:{proposal_id}",
                                       序列化({**candidate, "status": "draft"}))
        # ↑ 候选住 m3 候选池快照——playbooks/ 权威目录一个字节不写：未审批不进权威域的物理保证
        return proposal_id                     # 状态机：draft → in_review（冲突检测过）→ approved/rejected

    def conflict_check(self, candidate) -> 过 | 打回(原因):
        # 剧本域的"冲突"：指标域=口径打架（设计稿 22）、术语域=语言打架（设计稿 35）、本体域=结构打架（设计稿 36）、
        # 剧本域=任务打架——四条检测：
        ① 触发意图撞车: 候选 pattern/aliases 与现有 approved 剧本重叠 → 挂 Owner 裁决（合并/改意图/精确化）
                    ——一意图一剧本是 match_intent"只答 0 或 1"的前提（主干二判断③）
        ② 步骤引用断裂: uses 的 metric 引用未在指标域登记 / 台账字段对照附录 A 对不上 → 打回
                    （与装载闸引用闭包同源——设计稿 38 CI L2 收编）
        ③ 关卡悬空: hitl_points.at_step 指向不存在的步骤号 / output_contract 缺结论·证据链·数据版本任一件 → 打回
        ④ 工具越界: steps[].tools 声明了公开面紧枚举之外的工具 → 打回——"步骤内的执行仍走既有公开面"
                    的候选侧闸：纸面上就不许给步骤发未登记的武器（与装载闸 tools 枚举同一条）
        四条全过 → in_review，按业务域路由 Owner：产量类剧本→开发室（§1 产量口径 Owner 行）；
        措施类剧本→采油工艺所（§1 措施口径 Owner 行——设定书 §7 剧本 2《注水井措施评估》是它的下一份候选，
        王飞 11 步压缩原文在设定书 §7/提取件三 §3.2）；跨口径剧本→阿强+数据管理岗（§1 语义 Owner）

    def approve(self, proposal_id, reviewer) -> PlaybookDef:
        # 🛡️ Owner 审批（四域同规）：人工修订定稿 → PlaybookRegistry.register(定稿)（主干一写半边：过闸→
        #   写 playbooks/{id}.yaml→load 重载→审计留痕）；rejected 同形留档
        # 装载闸在写回后再跑一遍（主干一）——批准的草稿若六字段不合规照样拒绝重载，双保险
```

**捣乱输入 B：Runtime 信号想收编"所有没人管的问题"——意图撞车闸**

```text
伪代码（时序推演，非代码）

t0  设计稿 42 建议池的 runtime 源送来候选：把"成本为什么超了"也立成剧本、trigger_intent.pattern 押
    "为什么"一个问式——证据是"最近此类问题自由发挥答得差"
t1  conflict_check 检测①：候选 pattern"为什么"与剧本 1 的 pattern"为什么下滑"以及别名面大面积重叠，
    且一个问式覆盖多指标类=一意图多剧本——match_intent 的"只答 0 或 1"从此破产 → 打回，
    原因="触发意图必须收窄到任务粒度（为什么+指标类+动向），宽问式候选先过 Owner 裁决再精确化"
t2  对照闸不在的后果：候选照登 → "为什么产量"与"为什么下滑"谁命中？——运行时挑剧本=把 Owner 该做的
    任务边界裁决偷偷交给匹配顺序，与设计稿 35"黑话复活闸"同构：闸挡正面、冲突检测挡背面
可观察行为：候选留档 rejected，playbooks/ 一个字节未动；match_intent 对既有两剧本行为不变
```

### 主干四：m7 接线——clarify_intent 消费 match_intent（分岔逻辑；未命中反断言的结构保证）

```text
伪代码 — app/agents/text2sql/nodes/intent.py:clarify_intent（m7；设计稿 37 接线=分岔段——本节在 m7 侧
         唯一改动点；设计稿 14 主干三既有行逐字保留，注释标"设计稿 14 原样"）

from langgraph.types import Command

async def clarify_intent(state) -> dict | Command:
    resp = await Gateway.chat(                       # 设计稿 14 原样（经 m2 网关，非流式）
        messages=[{"role": "system", "content": _INTENT_TEMPLATE},
                  {"role": "user", "content": state["question"]}],
        model_alias="petro-llm")
    intent = 解析 JSON(resp.content)                 # 设计稿 14 原样：{"entities", "missing", "sufficient"}
    # ═══ 设计稿 37 分岔段（本节唯一新增）——先判任务归属，再走参数充分性闸（主干二判断①）═══
    剧本 = PlaybookRegistry.match_intent(intent)     # m16 公开面（卡 m16 Seam 行点名 match_intent）
    if 剧本 is not None:
        return await _剧本驱动(intent, 剧本)          # 剧本驱动子图（节点内，主干五）——命中不进下方反问闸：
                                                     #   缺参由剧本缺参策略接管（主干六，验收 2）
    # ═══ 分岔段结束——以下与设计稿 14 主干三逐字一致（反断言的结构保证：验收 3）═══
    if intent.sufficient:                            # 设计稿 14 原样
        return {"intent": intent}
    反问 = "您想查哪口井？想看哪段时间的什么数据？（例如：上个月 N-2 井的日产油量）"   # 设计稿 14 原样
    return Command(update={"intent": intent,
                           "result": {"kind": "clarify", "text": 反问, "missing": intent.missing}},
                   goto=END)                         # 设计稿 14 原样：信息不足闸（W-F7-1）
    # 剧本域不吸收设计稿 14 的闸：未命中的模糊问题照旧反问（走查推演 3 对照段）——两道闸各管各的
    # 节点幂等（设计稿 14 原样注）：中断恢复整节点重跑——剧本模式下副作用=只读查询+快照写（幂等键，主干五）+
    #   interrupt 挂起恢复（设计稿 15 检查点纪律），重跑无副作用累积
    # 异常去向：GatewayError / SemanticRegistryLoadError 原样上抛（设计稿 07/装载闸语义）——本层不吞
```

> **为什么分岔段能收进一个节点**：LangGraph 的 `Command(update=…, goto=…)` 官方形状允许节点内合并"状态更新+路由"（设计稿 14 主干三的反问闸已是先例——闸的出口收进节点、图布线保持卡面原样）。剧本驱动子图是同一形状的放大：`goto=END` 的出口形状不变，只是到达终态前在节点内多走了几步声明好的任务步骤。六节点主干与反思回边一行未动——未命中问题"行为与 v2 一致"不是靠分支跳转保证的，是靠**根本没进剧本模式**保证的（反断言的结构含义，走查推演 3）。

### 主干五：剧本驱动子图——步骤循环、幂等键、HITL 点、输出合同（节点内数据驱动）

```text
伪代码 — app/agents/text2sql/nodes/intent.py:_剧本驱动（m7 模块私有——同文件私有件；只读 PlaybookDef 数据
         + 既有公开面；不含任何写死的剧本逻辑：加一份剧本 YAML，本函数一行不改）

async def _剧本驱动(intent, 剧本: PlaybookDef) -> Command:
    参数, 标注 = _补缺参(intent, 剧本.missing_policy)      # 缺参策略（主干六）——可能直接返回澄清 Command
    if 参数 is None:
        return 标注                                       # 无默认的关键参→澄清反问出图（主干六澄清半边）
    产物 = {}
    for 步骤 in 剧本.steps:                               # ★ 步骤序=PlaybookDef 数据驱动——剧本是资产不是代码
        已有 = await Repository.get_query_snapshot(幂等键(剧本.id, 步骤.no, 参数))
        if 已有 is not None:                              # HITL resume 整节点重跑的幂等键（设计稿 15 检查点纪律）：
            产物[步骤.no] = 已有                          #   已完成步骤读快照不重算——只读查询本幂等，快照省一轮
            continue
        步产物 = await _执行步骤(步骤, 参数)               # 步骤内的执行=既有公开面（见下）
        if 步产物.被拒:
            产物[步骤.no] = 剧本级处置(步骤, 步产物)        # on_reject 声明的处置档位（捣乱输入 A）——
                                                          #   不绕校验链、不自由发挥；未声明 on_reject 的步骤
                                                          #   默认=缺一节（报告该节置空注明原因——诚实留白）
        else:
            await Repository.save_query_snapshot(幂等键(步骤), 快照(步产物))
            产物[步骤.no] = 步产物                        # m3 快照公开面（设计稿 04；节点副作用，幂等）
        点 = 剧本.hitl_points 中 at_step == 步骤.no
        if 点 and 触发(点.trigger, 产物):
            决定 = interrupt(审批载荷(gate=点.gate, 候选=产物[步骤.no], level=点.level))
            # 🛡️ HITL：interrupt 暂停图→人工在审批台决定→Command(resume=决定) 恢复→整节点幂等重跑
            #   （锚 docs/tech-stack/langgraph.md 人在回路；设计稿 15 审批位同一机制同一形状——设计稿 14 主干八；审批台界面复用设计稿 15 卡片形状）
            if 决定 == 驳回:
                return Command(update={"result": {"kind": "playbook_report",
                                                  "text": 中止话术(已完步骤=产物)}}, goto=END)
            # 人工驳回=正常终态出图（转人工是用户该收到一句人话的正常结局——设计稿 14 同哲学）
    报告 = 按输出合同组装(剧本.output_contract, 产物, 标注)
    # 结论+证据链+数据版本（设定书 §7 步骤 5）；证据链含每步校验注记与处置记录；数据版本带批次水位与缺参标注
    return Command(update={"intent": {**intent, "playbook": {"id": 剧本.id, "version": 剧本.version}},
                           "result": {"kind": "playbook_report", "报告": 报告}},
                   goto=END)
    # intent 字段是 clarify_intent 的自有字段（卡 m7 State 行"澄清产物"）——剧本绑定住 intent 内，
    # State 七字段零增键（设计稿 40 升格 TypedState 时再搬家，头部"明确不讲的"）；goto=END 与反问闸同款出口形状，
    # 图布线零改动；State.attempts 轨迹不蹭——剧本每步留痕走快照与证据链，两个轨迹不混账

async def _执行步骤(步骤, 参数) -> 步产物:
    # 每步一腿，全程只走既有公开面（设计范围边界红线原话"步骤内的执行仍走既有公开面"）：
    #   指标模板 → m16 Lifecycle.template_for（设计稿 22 公开面：命中 verified metric 固定模板，不重新自由生成）
    #   选表     → m14 VectorStore.query（schema 集合——设计稿 14 主干四同款；设计稿 39 起换 Waterfall.retrieve 单出口）
    #   生成     → m2 Gateway.chat（冻结纪律——设计稿 14 主干五同款；步骤圈定的表与指标进提示词：
    #              剧本把开放题变成选择题——模型只在步骤声明的范围内填空，不出题）
    #   校验     → m17 GuardChain.validate(sql, user, metric_ref)（五段短路单出口——设计稿 24 既有；
    #              剧本问题与自由问数过同一道闸，无剧本豁免）
    #   执行     → m8 Executor.call（只读查生产库五步闭环——设计稿 12 既有）
    #   查什么层由 m7 既有选表纪律裁决（设计稿 32 边界：只认就绪层模型物）——剧本 uses 里的表/台账引用是
    #   业务事实登记（附录 A 原文），剧本域不代行选表
    sql = 模板(步骤) if 步骤.tools 含 指标模板 else 经 m2 生成(步骤圈定范围)
    verdict = await GuardChain.validate(sql, user, metric_ref=步骤.uses 指标)
    if verdict 拒绝:
        return 步产物(被拒, reason=verdict.reason, fix_hint=verdict.fix_hint, legal=verdict 附带路径)
    result = await Executor.call(构造调用("query_production_db", sql, 参数), user)
    return 步产物(行集=result.rows, 注记=verdict 注记)      # 校验注记随步产物走——证据链原料（设计稿 24 血缘半边）
    # 步骤内校验拒绝不回灌重生成——v2 反思回边的"自由修正"在剧本里不存在：怎么重试本身是剧本声明
    # （on_reject 可声明"按 fix_hint 修正一次重提校验"——重试也是声明内关卡，不是自由发挥）
```

### 主干六：缺参策略——澄清/默认值双半边，"不阻塞"不等于"不吭声"（验收 2；报告一）

```text
伪代码 — app/agents/text2sql/nodes/intent.py:_补缺参（m7 模块私有；策略内容=PlaybookDef 数据，机制=本函数）

def _补缺参(intent, policy) -> (参数, 标注) | Command:
    # 报告一（references/data-agent-research.md §5.6）原文："含义不明时主动提出澄清问题；
    # 用户不响应则套用合理默认值（如默认最近 7/30 天）不阻塞继续执行。"——双半边的官方范式
    参数, 标注 = {}, []
    for 参, 策略 in policy.items():
        if 参 in intent.entities:
            参数[参] = intent.entities[参]; continue       # 用户给了就用——剧本不覆盖用户
        if 策略.default is not None:
            参数[参] = 策略.default
            标注.append(f"{参}=默认{策略.default}")          # ★ 默认值必带标注——annotate 是装载闸强制位（主干一）：
                                                            #   无标注的默认=静默口径，与设计稿 22"默认口径出数并标注"同哲学
        else:
            # 无默认的关键参→澄清反问出图（设计稿 14 反问闸同款形状 goto=END；澄清不携带半参——
            #   一问一生、一图一轨迹，设计稿 14 捣乱 A t4 同款：用户补充=新一次提问重新命中剧本）
            反问 = f"请说明{参}（例如：……）"
            return None, Command(update={"result": {"kind": "clarify", "text": 反问}}, goto=END)
    return 参数, 标注
    # 剧本 1 两参全有默认（时间窗=最近30天、范围=全区块——设定书 §7 原文）→ 主问全绿零反问；
    # 剧本《注水井措施评估》的井号无默认（§7 剧本 2/提取件三 §3.2 步骤 1 原文"以单口注水井为研究目标"
    # ——井号是任务对象，替用户默认一口井=发明业务事实）→ 走澄清半边
```

**捣乱输入 A：剧本步骤内工具调用被执行前校验链拒绝——剧本级处置（设计范围伪代码梳理范围第 3 条）**

```text
伪代码（时序推演，非代码）

t0  老王问"渤海产量为什么下滑"，剧本 1 命中（走查推演 1 t0）；步骤 2"分解"要拆停产影响：
    自由生成段按常识拼出 FROM oil_production_daily p JOIN equip_status e ON e.设备号 = p.well_id
    ——"泵装在井上"业务上讲得通，但这层装配关系资产库没登记（设计稿 36 资产 4/9 结构空白声明——
    同一处空白，同一个闸）
t1  _执行步骤 调 GuardChain.validate(sql, user)——设计稿 24 五段短路链：剧本问题与自由问数过同一道闸，
    无剧本豁免；表对不在白名单、经已登记实体关系无一跳路径 → 默认拒绝（设计稿 36 主干三第 3 级），
    Verdict 带拒绝理由与合法路径
t2  剧本级处置（步骤 2 on_reject，资产 1/2 逐字）：不换未声明的数据面、不自造 join、不绕校验链——
    改用检修台账估算停产影响（附录 A.4 well_overhaul 的 affected_output），并标注"估算口径：
    各作业区估算口径不一（附录 A.4 原文脏特征）"；处置记录作为证据链一条留痕
    对照：若是 v2 自由链，此处走反思回边回灌重生成（设计稿 14 主干六/七）——剧本步骤没有这个自由，
    "怎么重试"必须声明在剧本里（on_reject 可声明按 fix_hint 修正一次重提校验——重试也是声明内关卡）
t3  步骤 2 带着降级结论继续——不阻塞步骤 3/4/5（剧本级失败策略与缺参策略同一立场：不阻塞主问，
    但诚实标注缺口）；报告"分解"节写明"设备级停产拆分缺装配关系数据，以检修台账估算"
可观察行为：校验链裁决零改动（拦得住）；剧本处置有声明可查（on_reject 字段）；证据链留痕可对账
```

**走查推演 1（验收 1+2：W-F19-3 全程）："渤海产量为什么下滑"命中剧本，六字段逐项可查**

```text
伪代码（时序推演，非代码）

t0  clarify_intent 抽槽位：entities={范围: 渤海油田}，missing=[时间窗]，问式=为什么+下滑
    → match_intent：特征覆盖剧本 1 features[指标类=产量, 动向=下滑, 问式=归因] → 命中 pb_production_decline
    （主干二判断①：missing 不参与命中——缺参问题直达剧本，不进反问闸）
t1  _补缺参：时间窗缺→默认最近 30 天+标注（设定书 §7 原文；报告一 默认半边）；
    范围用户已给（渤海油田=全域，附录 A.1 三区块）——主问零反问（验收 2"不阻塞"的可观察面）
t2  步骤 1 拉完成率与构成：完成率命中指标域 verified → 设计稿 22 template_for 固定模板（不自由生成）；
    构成三件（产油/开井数/时率——§7 步骤 1 原文）经校验链放行→执行器出数
t3  步骤 2 分解：新井贡献/老井递减/措施增油/停产影响（§7 步骤 2 原文"用指标 3/8/10"）；
    递减增油（§3 指标 10）带口径标注（§8 事故 7：一数多源争议之最）；设备级拆分被校验链拒→on_reject
    降级（捣乱输入 A t2）
t4  步骤 3 归因分支：生成三分支候选与置信度（地质=含水上升 §3 指标 5 / 工程=检泵停产 附录 A.4 /
    管理=配产调整 §3 指标 1 计划版本——§7 步骤 3 原文）；分支间置信度差距小于阈值 → HITL 点触发：
    interrupt 挂起（L2 档——提取件三 §1.6）→ 老王确认"工程分支优先下钻"→ Command(resume) 恢复→
    整节点重跑：步骤 1/2 快照命中跳过，interrupt 返回决定继续步骤 4（幂等键纪律，主干五）
t5  步骤 4 下钻受效关系与检修台账：受效下钻走设计稿 36 受效关系卡（产液×注水直连是受控 ✗——剧本步骤
    声明的就是受控路径，设定书 §5）；检修台账带跨月切割争议注记（附录 A.4 原文）
t6  步骤 5 生成归因报告——输出合同三件齐（§7 步骤 5 原文）：结论（工程主因+降级口径标注）+
    证据链（每步校验注记+处置记录+口径标注）+ 数据版本（批次水位+缺参标注）；goto=END 出图
    可观察行为（W-F19-3 断言）：步骤（t2–t6 五步对照资产 steps 字段）、工具（每步 tools 对照公开面枚举）、
    缺参策略（t1 对照 missing_policy）、HITL 点（t4 对照 hitl_points）、输出合同（t6 对照 output_contract）
    ——六字段逐项可查，非自由发挥
```

**走查推演 2（捣乱输入 A 全程）**：见上方"捣乱输入 A"时序块——校验链拒绝→on_reject 剧本级处置→降级续跑留痕，不绕闸不自由发挥。

**走查推演 3（验收 3 反断言）：未命中剧本的问题回退自由反思回边，行为与 v2 一致**

```text
伪代码（时序推演，非代码）——老王问"上个月 N-2 井的日产油"（设计稿 14 主干同款标准问）

t0  clarify_intent 抽槽位：entities={井号: N-2, 时间窗: 上个月, 指标: 日产油}, sufficient=true
t1  分岔段：match_intent——特征[指标类=日产油, 问式=取数]不覆盖剧本 1（产量+下滑+归因）也不覆盖
    剧本 2（完成率+体检）→ 返回 None（主干二判断②：未命中是正常业务态）
t2  反断言三连：
    ① 返回值形状：分岔段 None 短路后走设计稿 14 原样分支——返回 {"intent": intent}，intent 内无 playbook 键，
       与设计稿 14 主干三 sufficient 分支逐字一致
    ② 结构零改动：graph.py 的 State 七字段/六节点布线/route_after_verify 反思回边本节一行未动
       （接线边界声明）——回退不是"跳回主干"的分支，是"从未离开主干"
    ③ 轨迹逐站对照：选表（m14）→生成（m2 冻结前缀）→校验链（m17 五段）→执行（m8）→结果校验→
       反思回边——与设计稿 14 主干四/五/六/七逐站相同（W-F7-2 主干一生原样）
t3  对照段（剧本域不吸收设计稿 14 的闸）：老王问"那口井怎么样了"（设计稿 14 捣乱 A 原题）——
    match_intent 同样 None（指代问无特征无点名）→ 设计稿 14 信息不足闸照常触发：反问话术 goto=END，
    选表/生成/执行零执行——两道闸各管各的：剧本域管"任务归谁"，设计稿 14 闸管"信息够不够"
可观察行为（验收 3 断言）：未命中剧本的问题走自由反思回边，每一步可对照设计稿 14 逐字复现——
行为与 v2 一致
```

## 关键判断的取舍记录

1. **剧本驱动子图收进 clarify_intent 节点内，图布线零改动——数据驱动的子图，不是新布线**。备选：剧本子图落成 LangGraph 真子图挂父图新节点。否决理由：设计范围边界红线明文"m7 只动 clarify_intent 一处接线（不改状态机主干结构）"；更深一层——剧本是 YAML 资产，**"是数据不是代码"的终局形态就是：加一份剧本零图改动零代码**，子图的形状由 PlaybookDef 声明而不由图布线承载；再一层——反断言（验收 3）因此获得结构保证：六节点主干与反思回边一行未动，"行为与 v2 一致"不是测出来的，是没动过。代价：命中剧本的问题不走六节点主干（剧本子图自带步骤循环），图级机制（反思回边/熔断）不覆盖剧本步骤——但剧本步骤本来就不该自由重试（取舍 5）。换边条件：步骤需要图级循环机制（多轮修正回边）时升级真子图——那是设计稿 39/40 升级 Waterfall/TypedState 的语境，本节不预支。
2. **任务级命中先于参数级充分——match_intent 不看 missing，分岔段放在设计稿 14 充分性闸之前**。反事实：分岔放闸后，"渤海产量为什么下滑"缺时间窗会被反问闸拦住反问"想看哪段时间"——剧本 1 的缺参策略（§7 原文默认 30 天）死在闸后，验收 2"缺参不阻塞主问"落空。命中判定只答"这是谁的任务"（剧本域），参数够不够在任务内处理（缺参策略）——两层判据各归各，顺序不可换。代价：match_intent 的输入是未判充分的 intent，特征抽取要在毛槽位上工作（点名/特征两层匹配，主干二）。换边条件：无（本节灵魂，与取舍 1 配对）。
3. **缺参双半边：有默认走默认+强制标注，无默认走澄清；标注缺失装载即拒**。报告一 原文给了双半边（"主动提出澄清问题；用户不响应则套用合理默认值不阻塞"）；设定书 §7 给了剧本 1 的两个默认值。设计版把"不吭声的默认"立为装载期死罪（missing_policy 无 annotate: true 拒装）：默认值是 Owner 写进剧本资产的口径决定（§7 原文），用户有权知道这次出数用了它——与设计稿 22 Resolver"按默认口径出数并标注"同一哲学。澄清半边不携带半参（一问一生，设计稿 14 捣乱 A t4 同款）：成本是用户多打几个字，换来轨迹无隐式状态。换边条件：用户反复被同一缺参反问——那是会话上下文（设计稿 18）与剧本缺参策略的联动话题，机制不改。
4. **HITL 档位是 PlaybookDef 数据，机制只用 interrupt 一种**。"按 L1-L5 自主等级，机器建议占比与置信度决定人工确认档位"（设定书 §7 括号原文）落为 hitl_points 的 level+trigger 字段（档位定义=提取件三 §1.6）；人工介入的机制只有设计稿 15 既有 interrupt（设计范围框架红线明文"复用 LangGraph interrupt 既有机制，锚 docs/tech-stack/langgraph.md"）——档位决定"要不要拦"，机制决定"怎么拦"，一个数据一个机制不混淆。资产库只落 L2 档：剧本 1/2 各一个 HITL 点；L4/L5 自动档资产库无登记事实不造样例（取材锁——李欣 L1~L5 是行业框架，提取件三 §3.1 高智美"常规工况自动执行、异常工况人工确认"的分级授权是 L3/L4 的油田事实，属剧本资产扩容素材，不是本节两份 YAML 的内容）。换边条件：出现常规工况自动执行的剧本资产时，level 字段直接承载，机制零扩容。
5. **步骤工具=公开面紧枚举，校验拒绝的处置只有 on_reject 声明的档位——"非自由发挥"的机制含义**。设计范围 What-to-build 的反面是"自由发挥"：模型即兴选表、即兴 join、即兴重试。剧本域的三道闸把自由度收进声明内：装载闸验 tools⊆公开面枚举（纸面上不发未登记的武器）；执行时剧本问题与自由问数过同一道 GuardChain（无剧本豁免，捣乱输入 A t1）；拒绝后只有 on_reject 声明的处置档位（改道受控路径/降级标注/缺一节留白），连"重试一次"都得是声明内关卡。模型在剧本里的自由度=分支判断（选择题），不是路径发明（问答题）——"让模型做选择题"的载体（锚 DataBuddy 圆桌论断，AE 前沿方案报告 G3 行）。换边条件：无（边界红线的资产侧与执行侧配套，缺一即漏）。
6. **剧本域不写"这个该有剧本"的记忆，Runtime 缺口归设计稿 42 建议池**。哪些问题反复自由发挥答得差，是 Runtime 信号（设计稿 42 建议池 runtime 源的采集对象），剧本域的 conflict_check 只收建议池送来的候选（主干三 source="runtime"），不自己在问数链里蹲点统计——职责单一与四域互不代劳（设计稿 36 取舍 6 同谱系：语言/结构/口径/任务四域各答一层，经 id 解耦引用）。代价：剧本缺口发现慢一拍（要等建议池闭环）。换边条件：无。

## 锚点对照精要

**DataBuddy（AE 前沿方案报告 §⑤ 行 37）Playbook 六字段**：原文——4+1 能力域 "Playbook（触发意图/步骤/工具/缺参/HITL/输出合同）"。落点：PlaybookDef 六字段与两份资产 YAML 的六字段逐字对号；"六阶段冷启动 Pipeline"与"LLM 加规则统计产出的只是草稿……还要 Owner 审核"——主干三第四同构位（六阶段压缩为三拍，四域同款）。差异：DataBuddy 是企业 Agent Runtime 平台，设计版是 YAML+进程内注册表（与设计稿 22/35/36 同一深度）。

**DataBuddy（AE 前沿方案报告 ⑥ 任务托管三标准）输出合同的行业对照**：原文——"产物可定位（编号/版本/负责人/评审状态）、动作可回放（tool_call+HITL 在 Trace 可查）、结果可核验"。落点：输出合同"证据链"半边（每步校验注记+HITL 决定+处置记录随报告可查——动作可回放的设计落形）；"数据版本"半边对齐批次水位可核验。差异：产品级 Trace 平台 vs m3 快照+审计留痕。

**①《从人用数据，到 Agent 用数据》（AE 前沿方案报告 §1.1 与 B3 行）Data Agent 第三代=任务完成**：原文——三代演进"NL2SQL（翻译）→ ChatBI（交互）→ Data Agent（任务完成）"；金句 "Data Agent is not a chatbot over databases. It is a governed task execution system over enterprise data."（Data Agent 不是数据库上的聊天机器人，是企业数据上的受治理任务执行系统）；B3 行注"《从人用数据》六步任务工作流"为剧本的调研对照。落点：设计范围 What-to-build"问数状态机获得'剧本驱动子图'形态（Data Agent 第三代=任务完成的载体）"的行业锚——"governed task execution"两词正是本节结构：剧本=task 的声明（YAML 资产），闸与审批=governed 的执法（校验链+HITL+冷启动 Owner 审批）。

**报告一（references/data-agent-research.md §5.6，Inside our in-house data agent）缺参澄清与剧本原型**：原文——"含义不明时主动提出澄清问题；用户不响应则套用合理默认值（如默认最近 7/30 天）不阻塞继续执行"；附加能力 "workflows（把复现性分析固化为可复用指令集）"。落点：缺参策略双半边逐字对号（主干六，默认 7/30 天与剧本 1 默认 30 天同量级）；workflows 即 Playbook 的行业原型（复现性分析→固化→复用——设定书 §7 剧本草案正是产量下滑归因的固化指令集）。

**提取件三 §1.6（references/extracts/architecture-process.md，【李欣2026】L1~L5 自主等级）**：原文——L1（机器决策比例 0，仅监测报警）～L5（100% 全边界自主+自学习）；L2（20%~30%）"机器生成 1~2 套决策建议，无最终决策权，需人工确认后执行"。落点：剧本 1/2 的 HITL 点 level=L2 逐字对号（步骤 3 归因分支=生成候选建议待确认）；"机器建议占比与置信度决定人工确认档位"（设定书 §7 括号原文）落为 trigger 判据字段。差异：行业表覆盖 L1~L5 全档，资产库只落有业务事实支撑的 L2（取舍 4）。

**提取件三 §三（references/extracts/architecture-process.md，三个步骤化剧本）**：§3.1 高智美水驱调控"分级授权调控模式：常规工况自动执行、异常工况生成多套候选方案附带置信度由工程师确认"（HITL 分档的行业原型；"感知-分析-决策-反馈"闭环=剧本步骤化的行业原型）；§3.2 王飞注水井措施评估 11 步（设定书 §7 剧本 2 的流程源——定口径→有效性判定→技术指标→受效判断→劈分系数→增油核算→桶油成本→归档，其中"归档进 verified metric 证据"（设定书 §7 剧本 2 末步）接设计稿 22 指标域）。落点：剧本步骤的业务依据与行业对照素材；剧本 2 作为采油工艺所的下一份候选资产走主干三链路（本设计稿不落全样例）。

**LangGraph 技术栈档案（docs/tech-stack/langgraph.md，经设计稿 14 主干八既有形状）interrupt/Command(resume)/节点幂等**：原文——interrupt 暂停图等人工输入，`Command(resume=...)` 恢复，恢复后整节点幂等重跑，副作用必须设计为幂等。落点：HITL 点机制零发明（设计范围框架红线"复用 LangGraph interrupt 既有机制，锚 docs/tech-stack/langgraph.md"）——主干五的幂等键（剧本 id+步骤号+参数）就是"副作用设计为幂等"的剧本版落形；resume 重跑时已完成步骤读快照跳过。

**设定书取材对账**（取材锁）：§7 剧本 1 全文入第 0 步资产 1（触发意图/五步/缺参策略/HITL 括号原文/输出合同逐行）；§7 剧本 2 与 §9 对照行入主干三候选与冷启动 source 字段；§3 指标 1（完成率——两份剧本的口径主粮与粒度）、指标 3/8/10（§7 步骤 2 原文点名的三指标）、指标 5（含水——归因分支地质侧）、指标 11（商品量——体检对账）、指标 14（时率——构成三件）；§8 事故 7（递减增油一数多源——步骤 2 口径标注）、事故 13（一数四源——体检对账与仲裁归属）；§1 角色卡（开发室=产量口径 Owner、采油工艺所=措施口径、阿强+数据管理岗=语义 Owner——Owner 路由）；附录 A.1（井状态滞后脏特征——体检核验）、A.4（检修台账与跨月切割争议、affected_output 估算口径——步骤 2/4）、A.5（递减增油两作业区算法不一致——事故 7 注脚）、A.8（结算净重与井口口径天然不等——体检对账）；§5 白名单受控条目（产液×注水直连 ✗——步骤 4 受控路径声明，经设计稿 36 资产承接）；§10 锚点行（"设计稿 35/36/37：§6/§5/§7 草案"+"'为什么下滑'剧本引 §7"——本设计稿兑现 §7）。本设计稿业务事实全部落在上述清单内，无凭空发明；第二剧本名"月度完成率体检"为设计范围给定，其步骤内容逐条注源设定书 §3/§7/§8/附录 A。

## 越界自查（源：modules.md 边界规则表）

- **本节动过的文件面**：新增 `app/semantics/playbook.py`（PlaybookRegistry/PlaybookDef/PlaybookCandidatePool——纯内存伪代码，查询签名=卡 m16 逐字；register 为设计范围点名的写半边，不新增查询面）+ `app/semantics/playbooks/` 两份资产 YAML（设定书 §7 格式化+设计范围给定第二剧本）。落点对照卡 m16 目录行（playbook.py # PlaybookRegistry：任务剧本，m16/F19，设计稿 37）与 W-F19-3 走查路径（app/semantics/playbook.py:PlaybookRegistry.match_intent）。m7 侧只动 `app/agents/text2sql/nodes/intent.py` 一个文件（clarify_intent 分岔段 + 模块私有 _剧本驱动/_执行步骤/_补缺参——同文件私有件，未发明卡面之外的新公开接口）；`graph.py` 的 State 七字段/六节点布线/route_after_verify/checkpointer、其余五节点函数体全部零触碰。`registry.py`/`resolver.py`/`lifecycle.py`/`glossary.py`/`ontology.py`/`metrics/`/`glossary/`/`ontology/`（设计稿 22/35/36）零改动；`ossie.py`（设计稿 41）、`app/eval/`（设计稿 38/42/43）零触碰。
- **边界规则表逐行核对**：m7 主语行（绕过 m16/m17/m18 公开面直连内部实现）——m7 对 m16 只增 `match_intent` 一个调用点（卡 m16 Seam 行点名公开面；PlaybookDef 是其返回形状，读返回值≠读 YAML 细节），对 m17 只调 `GuardChain.validate` 单出口（设计稿 24 既有），对 m18 零触；语义资产文件行（v3 增补行：语义 YAML 只能经"Lifecycle 变更包+五级 CI+Owner 审批"变更）——playbooks/ 只经 register（approve 写回）+load 触达，冷启动候选住 m3 候选池，权威目录不直改；m3 行——只走 save_query_snapshot/get_query_snapshot/save_audit 公开面；m8 行——只调 Executor.call；m14 行——只调 VectorStore.query（schema 集合），零借 m6 检索器（第 2 行）；m20 行（问数消费只认 marts 层模型物）——剧本 uses 里的表/台账引用是业务事实登记（设定书/附录 A 原文），执行查什么层由 m7 既有选表纪律裁决（设计稿 32 边界），剧本域不代行选表；m2 行（模型流量唯一出口）——生成分支只走 Gateway.chat（设计稿 07 契约形状）。无其他行以本节模块为主语。
- **调用方与占位**：HITL 审批台界面复用设计稿 15 审批卡片形状（界面不在本节）；设计稿 39 换真位——_执行步骤 的选表半边（m14 直调）在设计稿 39 升级 Waterfall.retrieve 单出口时换真（m21 Seam 行明文）；设计稿 40 换真位——剧本绑定暂住 intent 字段，TypedState 五段升级时升格为 IntentSpec 字段；设计稿 42 对接口——conflict_check 的 runtime 候选来源（source="runtime"）由建议池采集供给，本节不蹲点。
- **明确不讲的零出现自查**：Waterfall/Anchor/S0–S8（设计稿 39）零出现；TypedState/IntentSpec 五段实装（设计稿 40）零出现（仅钩子提及）；OssieExport（设计稿 41）零出现；SemanticCI 门禁本体（设计稿 38）零出现（仅引用闭包前置半边声明）。
- **架构大图同步**：diagrams/petro-agent.html 按设计范围"图节点范围"C15 内新增 playbook_registry（任务剧本——普通节点，无 🛡️：卡 m16 PlaybookRegistry 无防护语义，剧本域的闸在冷启动与装载，管"任务怎么干"不管"数据放不放行"）+ 双向边两条（C5→playbook_registry 意图匹配、playbook_registry→C5 驱动子图）；节点明细表追加 1 行；防护清单表零追加（无防护节点）；图头部容器/节点/边计数**零改动**（架构大图统一维护）；`<script>` 区与既有 linkStyle 索引零改动，新边追加在边定义末尾、不带 linkStyle；图上无文件名/函数名/端口/路由（"任务剧本""意图匹配""驱动子图""缺参策略""人工确认点""输出合同"均为业务语言）。
- **零代码红线**：全文代码块均标注"伪代码"；YAML 是资产文本交付物（数据不是代码）；无 tests/、无 CI、无调度。

## 后续衔接

- **设计稿 38（五级语义 CI）**：剧本资产变更入 L2 引用一致性（步骤 uses 的指标 id/台账字段引用闭包查 m16 公开面——本节装载闸是它的装载期前置半边）+ L4 治理（触发意图撞车=高影响变更，Owner 审批与 MR 红线位）；CI 是语义资产变更的唯一放行出口，playbooks/ 从此与 metrics/glossary/ontology 同规。
- **设计稿 39（检索瀑布协议）**：m7 的选表半边升级 Waterfall.retrieve 单出口（m21 Seam 行明文）——本节 _执行步骤 的 m14 直调是它的换真位；剧本命中发生在 S0 固定边界之前的任务级路由，S1 显式锚定（@metric/@Entity）与剧本步骤的 uses 声明是天然的互相锚定素材。
- **设计稿 40（强类型中间态）**：IntentSpec→EvidencePack 五段——剧本子图的产物链（intent+步产物+报告）是五段的天然语料；本节剧本绑定暂住 intent 字段是换真位。
- **设计稿 41（Ossie 兼容导出）**：OssieExport.dump 语义资产导出四域齐活——剧本域是否入 Ossie 格（Dataset/Metric/Relationship/extensions 的 extensions 槽位）归设计稿 41 裁决，本节只保证 PlaybookDef 形状稳定可序列化。
- **设计稿 42（三源建议池与实体体检）**：runtime 源的剧本缺口信号（哪类问题反复自由发挥）是 PlaybookCandidate 的 runtime 供给方（主干三 source 字段留槽）——"自动化止于提案"，剧本域只收货不蹲点。
