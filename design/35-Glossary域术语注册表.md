# 设计稿 35：Glossary 域——术语/禁用词/有效期

> **红线声明**：本设计稿零真实可运行代码。全部代码块均为**伪代码**（块首标注"伪代码 — 文件:函数"或"伪代码（时序推演，非代码）"），公开签名取自模块卡 `m16`（`GlossaryRegistry.load(dir)` / `lookup_term(term) -> [GlossaryHit]`，冷启动同规"候选→冲突检测→Owner 审批"），函数体=输入输出契约+主干判断；术语资产 YAML 的业务内容全部取自设定书 §6 十条草案（逐条注源），本设计稿只负责"格式化为 YAML"（设定书边界声明：草案给业务内容，设计稿负责格式化）。
> **框架红线**（设计范围）：PyYAML——沿用设计稿 22 既有纪律，`yaml.safe_load` 装载 `glossary/*.yaml`（术语文件与口径文件同规："口径是数据不是代码"，术语资产同样**是数据不是代码**），官方调用序列在主干一给出，不许概念性提及。
> **接线边界**：本节活动范围**只在 m16 的 `glossary.py` + `glossary/` 资产目录**——`registry.py`/`resolver.py`/`lifecycle.py`/`metrics/`（设计稿 22 已交付）零改动；`ontology.py`/`playbook.py` 不动（设计稿 36/37）；`ossie.py` 不动（设计稿 41）；`m7` 只走 `lookup_term` 公开面（消费接线代码归消费侧后续设计稿，本设计稿以调用方占位推演）；`m3` 只走 save_snapshot/save_audit 公开面。术语域**不代行**指标裁决——指标绑定仍是设计稿 22 的 lookup/bind/template_for。
> **stub 换真身声明**：`glossary.py` 本节即真身（PyYAML + 文件系统 + `m3` 公开面）；卡面 Adapter **FakeRegistry**（设计稿 22 已登记，同签名覆盖 Glossary 半边）照例供后续设计稿走查指名注入，本设计稿不展开。
> **明确不讲的**（设计范围声明）：Ontology 实体关系与合法 Join 白名单（设计稿 36）；Playbook 任务剧本（设计稿 37）；Ossie 兼容导出（设计稿 41）；五级语义 CI 门禁本体（设计稿 38——本节只交付它要检查的资产与引用形状）；`m7` 消费接线代码与审批工作台界面（调用方占位）。

> **前端展示位注记**（2026-09-27）：术语有效期（到期机器判只标漂移照答——"有效期已届满，定义待 Owner 复核"；废弃人判；硬切换走审批版本加一）在原型 C1 术语账有"有效期"列与漂移标注演示卡（B5.1 / F60 改注）。

## 实现清单

- [x] 禁用词命中→拒答或替代建议，不静默映射（源：W-F19-1；卡 `m16` GlossaryRegistry 🛡️）✅ **主干二**（lookup 步序 0 号位=禁用词索引，先于一切解析）+ **捣乱输入 A**（"老完成率"全过程：闸拦下→替代帧→改口→正常出数）+ **走查推演 1**
- [x] 术语带有效期，过期术语命中触发"术语漂移"标注（源：卡 `m16` GlossaryRegistry 字段契约）✅ **主干一**（valid_until 字段入装载闸）+ **主干二**（过期判定：过期≠废弃，只标注不降级）+ **走查推演 2**（"躺井"过期命中全程）
- [x] AI 候选→冲突检测→Owner 审批闭环，未审批不进权威域（源：W-F19-4；卡 `m16` 冷启动共识）✅ **主干四**（候选来源/四条冲突检测/Owner 按业务域路由/approve 写回重载）+ **捣乱输入 B**（候选别名撞禁用词被打回）+ **走查推演 3**
- [x] 术语资产 YAML 交付物 ≥8 条（含禁用词与过期术语样例）（源：卡 `m16` 目录契约 glossary/）✅ **第 0 步**（设定书 §6 十条草案全量格式化为 10 份 YAML——第 1 份即禁用词样例、第 4 份即过期术语样例）
- [x] 越界引用为零（源：边界规则表）✅ **越界自查**

---

## 走查：从输入到验收行为

> **主角数据**（业务真数据样子，全部取自设定书 §6 草案与 §1/§3/§8，标注随行）：
> ① 老王在会话里问"上月渤海油田**老完成率**"——"老完成率"是 2024 年废弃的 v1 口径叫法，设定书 §6 禁用词行（W-F19-1 捣乱输入）；
> ② 老王改口"产量完成率"——现行叫法，设计稿 22 已注册指标（设定书 §3 指标 1，设计稿 22 走查推演 1 同题重演）；
> ③ 新同事问"N-6 是不是**躺井**了"——作业区黑话，设定书 §6"有效（限作业区语境）"，本设计稿装载时有效期届满（W-F19 验收 2 的过期样例）；
> ④ 聊天记录里高频出现"**桶油成本**"——采油工艺所与财务的缩写叫法（设定书 §3 指标 15 桶油增产成本），尚未进术语域，AI 从历史 SQL/聊天记录提出候选（W-F19-4）；
> ⑤ 阿强（语义 Owner，平台侧，设定书 §1）组织术语评审；开发室/采油工艺所/销售计量站按业务域当条目 Owner（设定书 §1 责任链）。
> **地图先行**（glossary.py 在 m16 与全图的位置，后续主干引用不重画）：

```text
伪代码（总览，非代码）

问数状态机容器 C5（m7，设计稿 22 已接查口径）        语义层容器 C15 — m16（app/semantics/）

m7 指标词两段查（消费侧只走公开面）：
  ① lookup_term(词) ────────────────→ glossary.py:GlossaryRegistry.lookup_term
                                        禁用词索引先查（🛡️ 命中→拒答/替代帧，链路止步）
                                        ↓ 非禁用
                                        术语/别名/缩写解析（过期判定挂"术语漂移"标注）
                                        ↓ 语言解析通过
  ② MetricRegistry.lookup/bind ─────→ registry.py/resolver.py（设计稿 22 既有，零改动）
                                        （指标模板仍走设计稿 22 template_for——术语域不代行）
冷启动旁路（离线）：
  历史SQL/报表/聊天记录 → 候选草稿 → conflict_check → Owner 审批 → 写回 glossary/*.yaml
  → GlossaryRegistry.load 重载生效（未审批候选住 m3 候选池，权威目录一个字节不写）
```

### 第 0 步：术语资产长什么样（交付物本体）

> 业务语言显性化：术语域登记的是**语言事实**（这个词指什么、废弃没有、谁负责、关联哪些指标），不是口径事实（怎么算——那是指标域的事，设计稿 22）。十条 YAML 全部来自设定书 §6 草案逐行格式化；字段设计对齐卡 `m16` GlossaryRegistry 契约（术语/同义词/缩写/禁用词/有效期/Owner/状态）与治理标准五要素（定义/格式/采集规范/管理责任/质量控制要求——提取件四 §2.3：术语标准也是标准）。类型是机器判的紧枚举（banned/alias/abbreviation/term），设定书 §6 类型列的原文标签存 genre 字段人读。

```yaml
伪代码 — app/semantics/glossary/gl_old_completion_rate.yaml（术语资产 1/10——禁用词样例）

# 老完成率：v1 口径（不含自用油折算），2024 年废弃（设定书 §6 禁用词行）——W-F19-1 的闸级条目
id: gl_old_completion_rate               # glossary_id：术语编号，与指标域解耦引用的键（主干三）
term: 老完成率
type: banned                             # 机器枚举：banned/alias/abbreviation/term——主干二只对 banned 特判
genre: 禁用词                             # 设定书 §6 类型列原文（人读标签）
definition: v1 产量完成率口径（不含自用油折算），2024 年废弃   # 设定书 §6 定义列
replacement: 产量完成率                    # 替代叫法（现行叫法文本）——替代帧的原材料；装载闸校验它
                                         #   必须能对上现行登记（指标同义词或术语条目），否则拒绝装载
synonyms: []                             # 禁用词不收同义词——防止替代叫法被本条目反查误伤；
                                         #   变体增补须走 Owner 审批（闸的扩散面受治理，主干四）
related_metrics: [production_completion_rate]   # 解耦引用：只持指标 id，口径本体在设计稿 22 指标域
owner: 开发室                             # 设定书 §6 Owner 列（§1 产量口径 Owner）
status: deprecated                       # 废弃=治理决议（2024，§6）——闸级条目的既成终态
valid_until: null                        # 禁用词不带有效期：废弃是终态，不因时间流逝自动解除（取舍 2）
version: 1
```

```yaml
伪代码 — app/semantics/glossary/gl_tijian_output.yaml（术语资产 2/10——别名条目）

# 剔检产量：别名→净产量，剔除检修井口径（设定书 §6 别名行）
id: gl_tijian_output
term: 剔检产量
type: alias                              # 别名条目：语言归一——把口语说法指到现行叫法
genre: 别名→净产量                        # 设定书 §6 类型列原文
definition: 剔除检修井口径                # 设定书 §6 定义列
canonical: 净产量                         # 现行叫法（设计稿 22 指标 net_oil_output 的登记名，设计稿 22 第 0 步示例 3）
synonyms: []                             # 别名条目自身不再挂别名——链式别名是装载闸拒绝的形状（主干一）
related_metrics: [net_oil_output]        # 与设计稿 22 指标同名同指：语言层与口径层各登各的（取舍 3）
owner: 开发室
status: approved
valid_until: null
version: 1
```

```yaml
伪代码 — app/semantics/glossary/gl_effective_output.yaml（术语资产 3/10——一词两译）

# 有效产量：一词两译，需修饰词消歧（开井日历/剔检）（设定书 §6 一词两译行）
id: gl_effective_output
term: 有效产量
type: term
genre: 一词两译                           # 设定书 §6 类型列原文——一条术语挂两支指标=多对多的最小样例
definition: 需修饰词消歧（开井日历口径/剔除检修井口径）   # 设定书 §6 定义列
related_metrics: [effective_output, net_oil_output]   # 两支指标（设计稿 22 第 0 步示例 2/3）——
                                         #   口径裁决归设计稿 22 澄清帧，术语域只交代语言现实（主干三）
owner: 开发室
status: approved
valid_until: null
version: 1
```

```yaml
伪代码 — app/semantics/glossary/gl_tang_well.yaml（术语资产 4/10——过期术语样例）

# 躺井：黑话→停产待检泵，作业区口语（设定书 §6 黑话行）——W-F19 验收 2 的过期样例
id: gl_tang_well
term: 躺井
type: term
genre: 黑话→停产待检泵                    # 设定书 §6 类型列原文
definition: 停产待检泵的作业区口语         # 设定书 §6 定义列
context_note: 限作业区语境                # 设定书 §6 状态列"有效（限作业区语境）"——语境登记不过闸（取舍 5）
related_metrics: []                      # 黑话不挂指标：不是每个术语都对应可算的数（语言 ≠ 指标）
owner: 采油工艺所
status: approved
valid_until: 2026-08-31                  # 有效期字段（卡 m16 契约）。★该日期为工程样例值——演示"已过期"
                                         #   语义用；设定书 §6 只给"限作业区语境"未给日期，定义/Owner 取 §6
version: 1
```

```yaml
伪代码 — app/semantics/glossary/gl_shilv.yaml（术语资产 5/10——缩写条目）

# 时率：缩写→抽油机时率（设定书 §6 缩写行）
id: gl_shilv
term: 时率
type: abbreviation
genre: 缩写→抽油机时率                    # 设定书 §6 类型列原文
definition: 见指标 14（抽油机时率，Σ开井天数/Σ日历天×100%）   # 设定书 §6 定义列+§3 指标 14
expansion: 抽油机时率                     # 缩写展开（现行叫法）——缩写与别名同构，方向相反：别名收口语、
                                         #   缩写收全称的短形；装载闸同查 expansion 可对上现行登记
related_metrics: [rod_pump_time_rate]    # 设定书 §3 指标 14（指标 id 为 §3 卡片的工程命名，设计稿 39/40 消费面）
owner: 采油工艺所
status: approved
valid_until: null
version: 1
```

```yaml
伪代码 — app/semantics/glossary/gl_water_flooded_zone.yaml（术语资产 6/10——纯概念术语）

# 水淹层：驱替前沿到达的高含水层段（设定书 §6 术语行）
id: gl_water_flooded_zone
term: 水淹层
type: term
genre: 术语
definition: 驱替前沿到达的高含水层段       # 设定书 §6 定义列
related_metrics: []                      # 地质概念术语——纯语言资产，问数里做解释不改数
owner: 地质研究所
status: approved
valid_until: null
version: 1
```

```yaml
伪代码 — app/semantics/glossary/gl_decline_increment.yaml（术语资产 7/10——带争议注记）

# 递减增油：见指标 10（含口径争议注记）（设定书 §6 术语行）
id: gl_decline_increment
term: 递减增油
type: term
genre: 术语
definition: 见指标 10（受效油井实际产油−按递减率拟合基线；多井受效按劈分系数 Σ=1 分摊）
                                         # 设定书 §6 定义列+§3 指标 10
dispute_note: 一数多源争议之最（事故 7，设定书 §3 指标 10/§A.5），待联席裁决——术语域只登记
              "这个词有争议"的语言事实，裁决动作归指标域变更包（设计稿 38 门禁）
related_metrics: [decline_incremental_oil]   # 设定书 §3 指标 10
owner: 采油工艺所（开发室联席）            # 设定书 §3 指标 10 Owner 列
status: approved                         # §6 状态列"有效（待联席裁决）"——有效照登，争议走注记不降状态
valid_until: null
version: 1
```

```yaml
伪代码 — app/semantics/glossary/gl_water_retention.yaml（术语资产 8/10）

# 存水率：注入水留存地层比例（物质平衡用）（设定书 §6 术语行）
id: gl_water_retention
term: 存水率
type: term
genre: 术语
definition: 注入水留存地层比例（物质平衡用）   # 设定书 §6 定义列；§4 规则 12 物质平衡约束的消费方
related_metrics: []
owner: 开发室
status: approved
valid_until: null
version: 1
```

```yaml
伪代码 — app/semantics/glossary/gl_injection_qualification.yaml（术语资产 9/10）

# 配注合格率：分层实注/配注 达标井次占比（设定书 §6 术语行）
id: gl_injection_qualification
term: 配注合格率
type: term
genre: 术语
definition: 分层实注/配注 达标井次占比     # 设定书 §6 定义列
related_metrics: []
owner: 采油工艺所
status: approved
valid_until: null
version: 1
```

```yaml
伪代码 — app/semantics/glossary/gl_san_duo_si_nan.yaml（术语资产 10/10——治理热词）

# 三多四难：数据库多平台多孤立应用多/共享难复用难开发难协同难（设定书 §6 治理热词行）
id: gl_san_duo_si_nan
term: 三多四难
type: term
genre: 治理热词                           # 设定书 §6 类型列原文
definition: 数据库多、平台多、孤立应用多/共享难、复用难、开发难、协同难   # 设定书 §6 定义列 [3]
source_note: 引用马涛（设定书 §6）——治理热词登记出处，防口号无据
related_metrics: []
owner: 阿强+数据管理岗                    # 设定书 §6 Owner 列"语义 Owner"（§1 平台侧角色）
status: approved
valid_until: null
version: 1
```

### 主干一：注册表装载——术语文件与口径文件同规的 yaml.safe_load 调用序列（装载闸）

```text
伪代码 — app/semantics/glossary.py:GlossaryRegistry（m16；签名=卡 m16）

import yaml                                 # PyYAML——与设计稿 22 MetricRegistry 同一纪律

class GlossaryRegistry:
    def __init__(self, repository):
        self._repo = repository             # m3 公开面注入（save_snapshot 落生效清单）——零引擎内部触碰
        self._banned = {}                   # 归一化禁用词 → 禁用条目（0 号位索引——闸的物理形态）
        self._by_term = {}                  # 归一化术语名 → GlossaryHit（精确层）
        self._aliases = {}                  # 归一化别名/缩写/展开 → [glossary_id]（同义词倒排层）

    async def load(self, dir) -> None:
        files = sorted(Path(dir).glob("*.yaml"))
        if not files:                       # 主干判断：目录空=术语资产没随版本管理交付——装配缺失
            raise SemanticRegistryLoadError("glossary 目录为空——术语文件未交付")
        banned, by_term, aliases = {}, {}, {}
        for path in files:
            raw = yaml.safe_load(path.read_text(encoding="utf-8"))
            # ↑ 官方调用序列与设计稿 22 逐字同款：safe_load 只构造标量/列表/字典，不实例化文件里的
            #   任意 Python 对象——术语文件"是数据不是代码"的机制保证
            校验术语结构(raw, path)          # 装载闸（任一不过 → SemanticRegistryLoadError(文件名, 字段)）：
            #   必备字段齐（id/term/type/definition/owner/status/version）
            #   owner 非空——无主术语不得生效（设计稿 22 同款闸；提取件四 §一 数据所有者=业务专家认责）
            #   status ∈ {approved, deprecated}——glossary/ 是权威目录，draft/in_review 候选只住
            #     m3 候选池（主干四），出现在此即拒绝装载（未审批不进权威域的物理半边）
            #   type=banned 必须带 replacement 且 replacement 不在本目录任何 banned 条目、
            #     能对上现行登记（术语条目或指标同义词）——替代叫法本身失效的禁用词闸=死闸
            #   type=alias 必须带 canonical；type=abbreviation 必须带 expansion——指不到现行
            #     叫法的别名是断链语言，比没有更坏
            #   synonyms 链式别名（别名条目再挂别名）拒绝——语言归一只走一跳，多跳查不动了
            #   同 term 两份=语言打架，装配期即死（"有效产量"这种一词两译登记成一条挂两指标的
            #     条目，不是两条同名条目——主干三）
            条目 = GlossaryEntry(**raw)
            归一 = 归一化(条目.term)          # 数据变形：去空格、全角转半角——沿用设计稿 22 归一化纪律
            if 条目.type == "banned":
                banned[归一] = 条目           # 0 号位索引：禁用词先查的物理前提（主干二）
            else:
                by_term[归一] = 条目
                for 别名 in 条目.synonyms + ([条目.expansion] if 条目.type == "abbreviation" else []):
                    aliases.setdefault(归一化(别名), []).append(条目.id)
        # 数据变形收尾：三层索引就绪（banned 先查 → 精确 → 倒排）
        self._banned, self._by_term, self._aliases = banned, by_term, aliases
        await self._repo.save_snapshot("glossary_manifest", 序列化(生效清单))
        # 异常去向：SemanticRegistryLoadError 原样上抛——装配点拒绝启动（设计稿 22 同款哲学：
        #   带病资产宁可不上线，也不带病接流量）
```

### 主干二：lookup_term——禁用词先查，先于一切解析（W-F19-1 的本体）

```text
伪代码 — app/semantics/glossary.py:GlossaryRegistry.lookup_term（m16；签名=卡 m16；纯内存读，同步）

class GlossaryHit:              # 数据形状——语言解析的全部产出（调用方只看它，不碰 YAML 细节）
    glossary_id: str            # "gl_old_completion_rate"——与指标域解耦引用的键
    term: str                   # "老完成率"
    type: str                   # banned / alias / abbreviation / term
    status: str                 # approved / deprecated（权威目录只含这两态）
    expired: bool               # True = approved 但 valid_until < 今天——"术语漂移"标注的来源
    drift_note: str | None      # expired=True 时的话术全文（见走查推演 2）
    action: str                 # "replace"（禁用词命中给替代）/ "reject"（禁用词无替代，理论态）
                                #   / "resolve"（正常解析）
    replacement: str | None     # 替代叫法文本（banned 条目的 replacement 原样带出）
    definition: str             # 术语定义——解释链与替代帧展开用
    owner: str                  # 语言事实的负责人
    related_metrics: [str]      # 关联指标 id 清单——指标域的入口键（主干三）

    def lookup_term(self, term) -> [GlossaryHit]:
        term = 归一化(term)                     # 输入毛刺不丢命中（设计稿 22 同款）
        if term in self._banned:                # ── 第 0 位：禁用词索引，先于一切解析（取舍 1）──
            条目 = self._banned[term]
            if 条目.replacement:                # W-F19-1：给替代叫法（捣乱输入 A 的主路径）
                return [GlossaryHit(action="replace", replacement=条目.replacement, ...)]
            return [GlossaryHit(action="reject", ...)]   # 无替代的禁用词：拒答（W-F19-1 的另一半）
            # 铁律：禁用词命中后不再走 2/3 层——"不静默映射"的机制保证：
            #   若放行到同义词/模糊层，"老完成率"可能被兜底召回现行指标并静默出数，
            #   数与用户认知对不上还没有任何说明——闸形同虚设（取舍 1）
        hits = []
        if term in self._by_term:               # ── 第一层：术语名精确 ──
            hits = [self._by_term[term]]
        elif term in self._aliases:             # ── 第二层：别名/缩写倒排（含 alias→canonical 的一跳）──
            hits = [取条目(gid) for gid in self._aliases[term]]
        # 主干判断：术语域允许多命中并全量返回——语言现实是"一个说法可能牵多个词条"，
        #   术语域没有"替用户挑口径"的职责（那是设计稿 22 澄清帧的事），诚实呈报即可
        for h in hits:
            if h.status == "approved" and h.valid_until and h.valid_until < 当天:
                h.expired = True                # ── 过期判定：日期事实机器判（取舍 2）──
                h.drift_note = (f"术语漂移：「{h.term}」有效期已届满（{h.valid_until}），"
                                f"定义待 Owner {h.owner} 复核——现行定义照旧返回，不自动废弃")
            # 过期 ≠ 废弃：deprecated 是治理决议（Owner 判），valid_until 是日历事实（时钟判）——
            #   时钟永远没有资格替 Owner 做治理动作（取舍 2）
        return hits
        # 异常去向：零命中返回空列表——"没收录"是正常业务态不是错误；语言候选走冷启动（主干四），
        #   指标未命中走设计稿 22 送审——两条未命中路径各回各域，术语域不越界代劳
```

**捣乱输入 A：老王问"上月渤海油田老完成率"——禁用词闸拦下→替代帧→改口→正常出数（W-F19-1 全过程，走查推演 1）**

```text
伪代码（时序推演，非代码）——m7 为调用方占位（只走 lookup_term 公开面，接线代码归消费侧票）

t0  意图闸三要素齐备（时间=上月 / 范围=渤海油田 / 指标=老完成率）→ 放行
t1  m7 指标词两段查的第一段：GlossaryRegistry.lookup_term("老完成率")
      第 0 位禁用词索引：归一化后全等命中 gl_old_completion_rate（第 0 步资产 1/10）
      → GlossaryHit(action="replace", replacement="产量完成率",
                     definition="v1 产量完成率口径（不含自用油折算），2024 年废弃",
                     owner="开发室")          # 链路在闸止步——第 2 层指标查询根本不发生
t2  m7 出替代帧（不静默映射的可观察形态）：
      "『老完成率』已于 2024 年废弃（v1 口径，不含自用油折算，设定书 §6）。
       现行叫法是『产量完成率』——是否按现行口径出数？"
      为什么不静默：v1 与现行口径数值不同（分子含不含自用油折算），老王拿着废弃口径的认知
      对账，静默换算出来的数他看不出错在哪——替代帧把"叫法变了"显式交代，选择权交还用户
t3  老王改口"产量完成率" → lookup_term("产量完成率") 二次调用：禁用词索引零命中 → 术语域
      放行（现行叫法在指标域登记为指标同义词，术语域对它的责任在装载闸已验——资产 1/10 的
      replacement 校验）→ 指标词交给第二段
t4  MetricRegistry.lookup("产量完成率")（设计稿 22 既有）→ 同义词全等命中 production_completion_rate
      → 唯一确信直绑 → template_for 出固定模板 → 参数化出数（设计稿 22 走查推演 1 全程重演，零改动）
    可观察行为（W-F19-1 断言）：禁用词命中→给替代叫法，不静默映射——闸拦下的那一问
      没有出任何数；出数只发生在用户显式改口之后
```

**走查推演 2（验收 2）：过期术语命中触发"术语漂移"标注**

```text
伪代码（时序推演，非代码）——新同事问"N-6 是不是躺井了"（2026-09-15，valid_until=2026-08-31 已过）

t0  意图闸放行（黑话在指标位：指标="躺井"）
t1  lookup_term("躺井")：禁用词索引零命中 → 术语名精确命中 gl_tang_well（资产 4/10）
t2  过期判定：status=approved 且 valid_until(2026-08-31) < 今天 → expired=True，
    drift_note = "术语漂移：「躺井」有效期已届满（2026-08-31），定义待 Owner 采油工艺所复核
                  ——现行定义照旧返回，不自动废弃"
t3  GlossaryHit(action="resolve", expired=True, drift_note=…, definition=…) 返回；
    定义照常解析（黑话翻译照做：躺井→停产待检泵），答案带漂移标注（消费侧拼进解释链，
    与设计稿 24 血缘标注同形——本节只交付字段与话术，拼接归消费方）
t4  治理半边：Owner 复核两条路都走审批——延期（approve 新 valid_until，版本+1）或废弃
    （deprecated，带 replacement）；复核提醒进建议池归设计稿 42 三源（本节不做提醒）
    可观察行为（卡 m16 字段契约断言）：过期术语命中照常解析但带"术语漂移"标注——
    不静默（数照出但交代语言过期）、不拒答（黑话没禁用）、不自动废弃（时钟不判治理）
```

### 主干三：术语↔指标解耦引用——glossary_id 多对多，两域各管一层

```text
伪代码 — app/semantics/glossary.py:GlossaryRegistry.指标关联回读（m16；解耦引用的形状，非新公开签名）

# 关联登记只在术语侧（related_metrics 字段）——指标域 metrics/*.yaml 零改动：
#   多对多在单侧登记即完备：一条术语可挂多支指标（"有效产量"→effective_output + net_oil_output，
#   资产 3/10），一支指标可被多条术语指（"有效产量"术语与"剔检产量"别名都指 net_oil_output）
def 关联指标定义(self, hit) -> [MetricDef]:
    # 展示/解释链消费时才跨域：经设计稿 22 MetricRegistry.get 公开面回读（m7 只走公开面的同款边界），
    #   术语域绝不复制 sql_template/口径定义——解耦的物理含义：
    #   口径一份（指标域）、语言一份（术语域）、关联一行（glossary_id）
    return [MetricRegistry.get(mid) for mid in hit.related_metrics]
    # 异常去向：related_metrics 指向未登记指标 → 装载闸与冷启动冲突检测两道都拦（主干一/四）；
    #   指标中途废弃 → CI 的 L2 引用闭包按 glossary_id 对账报出（设计稿 38，查 m16 公开面）
# 两域分工一句话：术语域答"这个词指什么、还能不能用"；指标域答"这个数怎么算、哪版口径"——
#   变更也独立：术语改名不动口径（related_metrics 重对账即可），口径改版不动术语定义（取舍 3）
```

### 主干四：冷启动闭环——候选→冲突检测→Owner 审批，未审批不进权威域（W-F19-4）

```text
伪代码 — app/semantics/glossary.py:GlossaryCandidatePool（m16；冷启动同规——与设计稿 22 Lifecycle 同一条链，
         机制引用设计稿 22 主干六不重复展开，本主干只讲术语域的差异点：候选来源与冲突检测查什么）

class GlossaryCandidate:        # 数据形状——AI 只产候选草稿（DataBuddy：LLM 产出只是草稿）
    term / type / definition / synonyms / related_metrics   # 内容四件
    source: str                 # "history_sql" | "report" | "chat" | "manual"——候选来源
                                #   （历史 SQL/报表/聊天记录，DataBuddy 元信息路；替身=手工草案+
                                #   事故簿驱动，设定书 §9 冷启动候选行）
    evidence: str               # 证据原文摘录（出处可查——候选不带证据不收，同设计稿 22 前置闸）

    def propose(self, candidate) -> proposal_id:
        if 指纹已待审(候选指纹(candidate)):     # 幂等：同一未收录词反复出现不重复入库（设计稿 22 同款）
            return 既有 proposal_id
        await self._repo.save_snapshot(f"gl-proposal:{proposal_id}",
                                       序列化({**candidate, "status": "draft"}))
        # ↑ 候选住 m3 候选池快照——glossary/ 权威目录一个字节不写：
        #   "未审批不进权威域"的物理保证与设计稿 22 同构（生产真源里根本没有这个文件）
        return proposal_id                     # 状态机：draft → in_review（冲突检测过）→
                                               #   approved/rejected（只能 Owner 决议触达）

    def conflict_check(self, candidate) -> 过 | 打回(原因):
        # 术语域的"冲突"与指标域不同物：指标冲突=口径打架，术语冲突=语言打架——四条检测：
        ① 同名冲突: term 与现有 approved 术语重名且定义不同 → 不收新条目，升级一词两译评审
                    （按资产 3/10 的形状挂多指标，不是并存两条同名条目）
        ② 禁用词撞车: 候选 term/synonyms 命中禁用词索引 → 打回——黑话复活闸（捣乱输入 B）
        ③ 定义冲突: 同 term 已有 approved 定义、新定义与之矛盾 → 挂 Owner 联席裁决，不自动覆盖
                    （提取件四 §2.3 标准一致性检查的朴素版；行业用知识图谱一致性判别，
                      本设计规则比对就够——F19"不做图数据库"）
        ④ 引用断裂: related_metrics 指向未登记指标 → 打回（与设计稿 38 CI L2 引用闭包同源语义，
                      CI 是语义资产变更的唯一放行出口——modules.md 边界规则表 v3 增补行）
        四条全过 → in_review，按业务域路由 Owner：产量口径→开发室 / 措施→采油工艺所 /
        经营→销售计量站 / 平台语义→阿强+数据管理岗（设定书 §1 责任链逐行对号）

    def approve(self, proposal_id, reviewer) -> GlossaryEntry:
        # 🛡️ Owner 审批（与设计稿 22 Lifecycle.approve 同规）：人工修订定稿 → status=approved/
        #   version 判版 → 写回 glossary/{id}.yaml → GlossaryRegistry.load 重载（进程内即时生效）
        #   → save_audit 决议行；rejected 同形留档——拒了也是治理记录
        # 装载闸在写回后再跑一遍（主干一）——批准的草稿若结构不合规照样拒绝重载，双保险
```

**捣乱输入 B：AI 候选的别名撞上禁用词——黑话复活闸**

```text
伪代码（时序推演，非代码）

t0  AI 从历史 SQL 归纳出候选：term="v1 口径完成率"，synonyms=["老完成率"]，source=history_sql
    （历史报表 SQL 里确实出现过旧叫法——AI 学得没错，但学来的东西恰恰是治理废弃的）
t1  conflict_check 检测②：synonyms 逐个查禁用词索引 → "老完成率"命中 gl_old_completion_rate
    → 打回，原因="候选别名是已废弃禁用词——术语不能借 AI 之手复活（设定书 §6）"
t2  对照闸不在的后果：候选照登 → glossary/ 出现两套叫法并存的"权威"语言 → 禁用词闸在第 0 位
    照样拦住提问，但候选池/审批台/导出物里黑话复活——语言资产自相矛盾，治理公信力破产
    可观察行为：候选留档 rejected，glossary/ 一个字节未动；lookup_term 行为不变
```

**走查推演 3（W-F19-4）：候选→冲突检测→Owner 审批，全程可追溯**

```text
伪代码（时序推演，非代码）——候选"桶油成本"（采油工艺所与财务的缩写叫法）

t0  来源：聊天记录+报表表头高频出现"桶油成本"（设定书 §3 指标 15 桶油增产成本的口语短形）
    AI 候选草稿：term=桶油成本 / type=abbreviation / expansion=桶油增产成本 /
    related_metrics=[桶油增产成本] / source=chat / evidence=聊天摘录
t1  propose → gl-pr-20260915-02，status=draft 住 m3 候选池；lookup_term("桶油成本") 此刻
    零命中——未审批候选对语言解析零响应（物理保证：glossary/ 没有这个文件）
t2  conflict_check 四条：①无同名 ②别名不撞禁用词 ③无定义冲突 ④related_metrics 指向
    §3 指标 15 已登记 → 过 → in_review，Owner 路由=采油工艺所+财务联席（§3 指标 15 Owner）
t3  阿强（语义 Owner，§1）组织评审；Owner 修订定稿 definition（对齐指标 15 公式，6.29 桶/m³）
    → approve(reviewer=联席) → 写 glossary/gl_cost_per_barrel.yaml → load 重载 → 审计留痕
t4  后续提问"渤海 8 月桶油成本"：lookup_term 第一/二层倒排命中（缩写→展开）→ resolve，
    related_metrics 把问数引到指标 15 的口径——语言入口打通，口径本体仍一份（主干三）
    可观察行为（W-F19-4 断言）：未审批候选不进权威域（t1 零命中）；审批后入域并带
    Owner/版本（t3 写回重载）；候选→冲突检测→Owner 审批三拍齐全可追溯
```

## 关键判断的取舍记录

1. **禁用词先查、先于一切解析——闸的语义是"做不了"不是"建议别做"**。备选：先走同义词/模糊解析、解析结果再对禁用名单核对。否决理由：模糊兜底层（设计稿 22 第三级的同款机制）按字符相似召回，"老完成率"很可能被拽到现行"产量完成率"并静默出数——事后核对拦得住"命中禁用词"拦不住"已经把数算完"，闸必须放在解析**之前**（第 0 位索引，主干二铁律段）。与只读安全闸（设计稿 15）、意图澄清（设计稿 14）同一哲学：提示词是建议，闸是结构。代价：每问多一次哈希查（可忽略）。换边条件：无（本节灵魂，🛡️ 所在）。
2. **过期 ≠ 废弃：有效期机器判，deprecated 是 Owner 的治理决议**。备选：valid_until 到期自动转 deprecated。否决理由：自动废弃会让依赖该词的报表与话术突然解析失败——治理动作（语言退休）不可由时钟代行，正如口径发布不可由 CI 代行（设计稿 38：CI 全绿还要 Owner 审批）；过期只触发"术语漂移"标注（走查推演 2），留出复核窗。行业锚：漂移五型里 Business Drift（字段变了旧口径还在用）的处置是人审闭环（提取件五 §2 行 28），不是自动下线。换边条件：过期未复核条目积压成灾——复核提醒进设计稿 42 三源建议池，仍不是自动废弃。
3. **语言与口径分家：术语域登记语言事实，glossary_id 关联不复制口径**。备选：术语 YAML 内嵌指标定义与 SQL，一份数据两处全量。否决理由：设计稿 22 "口径一处定义处处复用"是引用结构上的成立（不存在旧副本）——术语域再抄一份口径，两处真源迟早漂移；关联只登记 related_metrics 一行，展示时经 MetricRegistry.get 公开面现读（主干三）。代价：解释链要跨域一次回读。收益：术语改名不动口径、口径改版不动术语（两域变更独立），CI 的 L2 引用闭包按 glossary_id 一处对账（设计稿 38）。换边条件：术语需要脱指标独立交换（Ossie 概念对齐域）——那是设计稿 41 导出按引用展开的事，不是现在复制。
4. **冷启动与指标域同链不同检测：同一条"候选→冲突检测→Owner 审批"，术语域查语言打架**。DataBuddy 原话："LLM 加规则统计产出的只是草稿。冲突检查、去重聚类之后，还要 Owner 审核，才能进权威语义资产。"——链同规（三域同规，modules.md m16 卡面），但"冲突"两域不同物：指标域是口径打架（重名重义/SQL 指纹），术语域是语言打架（同名/别名撞禁用/定义矛盾/引用断裂，主干四四条）。设计上这恰是重点：复用的是**治理结构**，不复制的是**检测内容**——抄形状不抄内涵，新域才不会变成旧域改名。换边条件：无。
5. **语境与争议只登记不过闸**。"躺井"限作业区语境（context_note）、"递减增油"待联席裁决（dispute_note）——登记成注记字段，不做成解析期过滤：语境过滤需要用户组织信息（设计稿 22 lookup 的 user 入参同款预留），争议裁决是指标域变更包的事（设计稿 38）。术语域的职责边界=交代语言现实，不是替用户做语境判断。换边条件：语境误用成为评估数据里的高频错因——再议作用域化词表（agent 作用域同义词条的扩展位，lookup 接口已预留 user 形状）。

## 锚点对照精要

**DataBuddy 冷启动与治理链**：原文——冷启动两条路："从元信息来，表结构、字段注释、主外键、历史 SQL、BI 配置和血缘；从业务文档来，数据字典、Wiki、PRD 和口径说明"；"但有一条线不能越：LLM 加规则统计产出的只是草稿。冲突检查、去重聚类之后，还要 Owner 审核，才能进权威语义资产。DataBuddy 降的是人工录入的成本，不是人工治理本身"；治理链"去重 → 冲突检查 → Owner 审核 → 版本控制 → 可回滚发布"。落点：主干四候选来源（历史 SQL/报表/聊天记录）与"未审批不进权威域"的物理隔离（候选住 m3 候选池，glossary/ 不写）；差异：DataBuddy 另有"信任低谷/记忆分层"叙事，本设计只取候选→审批两拍（W-F19-4 走查断言的给定范围）。

**Gravitino 四对象之 Glossary term：语义层 ≠ 只有指标**：原话（Datastrato 讲稿摘要）——"四个被治理对象：Domain（业务域）/ Glossary term（规范术语）/ Semantic view / Data asset，每个套 Governance Envelope（Stable ID·Owner·Role·Version·Certification·Audit）"。落点：术语 YAML 的 id（Stable ID）/owner（Owner）/version+status（Version·Certification）/审计留痕（Audit）逐字段对号；owner 字段不是装饰——装载闸"无主术语不得生效"把它做成结构（主干一）。差异：Gravitino 是平台级元数据件，本设计是 YAML+进程内注册表（与设计稿 22 指标域同一深度）。

**提取件四 §一（治理组织与角色清单，references/extracts/governance-quality.md）**：原文——联邦组织"五位一体"；"数据所有者（业务专家）：数据认责、定义质量规则的业务口径"（陈绍凯）；数据治理委员会"牵头修订"标准（孙华）。落点：Owner 按业务域路由（主干四 conflict_check 末段）与 §1 角色卡逐行对号——开发室（产量口径）/采油工艺所（措施）/销售计量站（经营）/阿强+数据管理岗（平台语义 Owner）；approve 的 reviewer 身份由调用方传入不鉴权（设计稿 22 Seam 同款）。

**提取件四 §二（数据资产目录与标准体系）**：原文——数据标准五要素"定义、格式、采集规范、管理责任、质量控制要求"（孙福街）；"某油田针对'油井产量'这一指标，明确定义其计算口径……以吨为计量单位，也规定了统计周期与计算方法"（孙华）；"知识图谱一致性判别技术……实现了多专业融合的标准一致性检查"（孙福街）。落点：术语条目字段设计（definition/owner/version=管理责任的条目化，主干一装载闸）；conflict_check ③ 定义冲突=标准一致性检查的朴素版（取舍 4 注明本设计规则比对，F19 不做图数据库）。

**提取件五（datastrato-trusted-dataagent-notes.md）语义映射与漂移**：原文——"用户说黑话（有效销售额/大盘转化/老客复购），系统无同名字段；文档能召回解释但不能裁决生产口径 → 必须人工 double check"（行 25，黑话→受治理的语义对象）；漂移五型含 Business Drift"字段变了旧口径还在用"（行 28）；"Agent 要的元数据……生产废弃状态"（行 32）。落点：术语域的存在理由——禁用词/废弃状态是"Agent 要的元数据"里语言侧的那几列；"术语漂移"标注=废弃状态进解释链的落点（走查推演 2）；人工 double check=Owner 审批闸（主干四）。

**设定书取材对账**（取材锁）：§6 十条草案全量入第 0 步（逐文件头注"设定书 §6"——禁用词/别名/一词两译/黑话/缩写/术语×4/治理热词的定义、类型、Owner、状态全取原文；躺井 valid_until 为声明过的工程样例值，定义/Owner 取 §6）；§1（Owner 角色卡与责任链——主干四路由、走查推演 3 阿强评审）；§3 指标 1（产量完成率——资产 1/10 replacement 校验对象与捣乱 A t4）、指标 10（递减增油争议注记——资产 7/10）、指标 14（抽油机时率——资产 5/10）、指标 15（桶油增产成本 6.29 桶/m³——走查推演 3 候选素材）；§4 规则 12（物质平衡——资产 8/10 定义注）；§8 事故 13 与 §3 指标 10 事故 7（争议注记的语言侧素材）；§9 冷启动候选行（"手工草案+事故簿驱动"替身——主干四 source 字段）；§6 草案已全量格式化入第 0 步。本设计稿业务事实全部落在上述清单内，无凭空发明。

## 越界自查（源：modules.md 边界规则表）

- **本节动过的文件面**：新增 `app/semantics/glossary.py`（GlossaryRegistry/GlossaryHit/GlossaryEntry/GlossaryCandidatePool——纯内存伪代码，签名=卡 m16）+ `app/semantics/glossary/` 十份资产 YAML（设定书 §6 格式化）。落点对照卡 m16 目录行（glossary.py # GlossaryRegistry：术语/禁用词/有效期，设计稿 35）与 W-F19-1 走查路径（app/semantics/glossary.py:GlossaryRegistry.lookup_term）。`registry.py`/`resolver.py`/`lifecycle.py`/`metrics/`（设计稿 22）零改动；`ontology.py`/`playbook.py`（设计稿 36/37）、`ossie.py`（设计稿 41）、`app/eval/`（设计稿 38/42/43）、`m7` 全部零触碰。
- **边界规则表逐行核对**：m7 主语行（绕过 m16/m17/m18 公开面）——本节给 m7 的面只有 `lookup_term` 一个公开签名（设计范围边界红线明文），指标绑定仍走设计稿 22 lookup/bind/template_for，YAML 细节零触碰；m18/m16 行（CI 的 L2/L4 走 m16 公开面）——本节是资产与引用形状的供给侧，门禁本体归设计稿 38 不展开；边界规则表 v3 增补行（语义资产文件绕过"Lifecycle 变更包+五级 CI+Owner 审批"被直接修改）——本设计稿冷启动全程走候选池→审批→写回，glossary/ 只经 approve 写回+load 重载触达；m3 行——只走 save_snapshot/save_audit 公开面；m20 行（指标绑定只认 marts 模型物）——术语域不碰模型物，related_metrics 只持指标 id。无其他行以本节模块为主语。
- **调用方占位**：lookup_term 的调用方=m7 指标词第一段查（消费接线归消费侧后续设计稿，本设计稿捣乱 A 以公开面调用推演）；propose/approve 的调用方=候选采集旁路与 Owner 评审台（界面不在本节）；FakeRegistry 供后续设计稿指名注入，本设计稿不展开。
- **架构大图同步**：diagrams/petro-agent.html 按设计范围"图节点范围"C15 内新增 glossary_registry（🛡️ 术语注册表，含禁用词闸）一节点+边 术语注册表→问数状态机（禁用词裁决回问数状态机：拒答/替代叫法，设计稿 35）；防护清单表追加 1 行（设计稿 35/glossary_registry）；节点明细表追加 1 行；图头部计数**零改动**；`<script>` 区与既有 linkStyle 索引零改动，新边追加在边定义末尾、不带 linkStyle；图上无文件名/函数名/端口/路由（"术语注册表""禁用词闸""替代叫法"均为业务语言）。
- **零代码红线**：全文代码块均标注"伪代码"；YAML 是资产文本交付物（数据不是代码）；无 tests/、无 CI、无调度。

## 后续设计稿钩子

- **设计稿 36（Ontology 域）**：术语域管"词"，本体域管"物"——实体/关系/合法 Join 白名单（"产液表只能 join 井 dim"）；冷启动同规（候选→冲突检测→Owner 审批），conflict_check 的差异点将是"实体撞车/关系打架/Join 白名单越界"，与本设计稿主干四同构对照着讲；受效关系（设定书 §5 劈分系数 Σ=1）是它的招牌素材。
- **设计稿 37（Playbook 域）**："为什么下滑"类分析任务由剧本驱动（触发意图/步骤/工具/缺参策略/HITL 点/输出合同，设定书 §7 三剧本）——三域冷启动同规在 Playbook 收口，m7 clarify_intent 消费 match_intent（F19 依赖增补行）。
- **设计稿 38（五级语义 CI）**：本节交付的 glossary_id 引用形状（related_metrics/replacement/canonical 可对上现行登记）是 L2 引用一致性闭包的检查对象——CI 是语义资产变更的唯一放行出口（modules.md 边界规则表 v3 增补行），术语域变更包走同一门禁。
