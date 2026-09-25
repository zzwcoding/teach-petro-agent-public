# 设计稿 41：Ossie 兼容导出

> **红线声明**：本设计稿零真实可运行代码。全部代码块均为**伪代码**（块首标注"伪代码 — 文件:函数"或"伪代码（时序推演，非代码）"），公开签名取自模块卡 `m16` 逐字——`OssieExport.dump() -> ossie_yaml`（卡面注释锁死四构成：Dataset/Metric/Relationship/extensions）；目录落点=卡 `m16` 目录骨架行 `ossie.py  # OssieExport.dump：Ossie 兼容导出（m16/F23）`；`ossie_yaml` 为数据形状（同 MetricRef/gate_report 地位）。
> **框架红线**（设计范围）：Ossie 是 **YAML 格式规范的设计演绎**，不是框架依赖——不装包、不接平台、不做兼容认证。可对照的"规范结构"锚在开放语义层方案给到的两层：**构成清单**（Dataset/Relationship/Metric/Multi-dialect expressions/AI context，AE 前沿方案报告 开放语义层节原文）与**治理壳六件**（Stable ID·Owner·Role·Version·Certification·Audit）；段内字段命名取设计最小集，对照不到这两层的字段一律进 extensions——多一字段都是发明（映射表表头声明）。
> **接线边界**：本节活动范围**只在 m16 的 `ossie.py`**——三域资产（设计稿 22/35/36/37 交付物）**只读公开面**（get/lookup_term/resolve_entity 返回形状 + `m3` 快照面的三份生效清单，装载期存档）；门禁语义**只引用不重写**（approved 判据出处=装载闸+设计稿 38 发布门禁；导出口不做第二套 CI——判据单点，取舍 3）；`m7`/`m17`/`m18` 零触碰；无新框架、无导出端点（dump 是治理侧库函数，调用方=阿强的治理例行动作，设定书 §1 责任链"目录维护"行明示的消费方）。
> **stub 换真身声明**：`ossie.py` 本节即真身（三域公开面注入 + YAML 文本产物）；卡面 Adapter **FakeRegistry**（设计稿 22 登记的同签名替身）照例供后续走查指名注入，本设计稿不展开。
> **明确不讲的**（设计范围声明）：**导入**——只做设计演绎一段（"一条 import"拿得到什么、拿不到什么；对接与实装归使用方平台）；**Ossie 演进时间线**（OSI→2026-06 进 Apache 孵化器改名，方案节原文）不作展开；**合规认证与跨平台实测**（PRD F23"不做什么"行）；构成清单中的 **AI context** 段与实体卡/术语卡/剧本卡的导出（设计范围四构成外——实体卡不出门的取舍见取舍 4，concept alignment 是标准之外的生产事）；**约束卡（合法 Join 白名单）的映射**——它裁决的是本项目执行器怎么跑（m17 消费），不是消费方要带走的结构事实（边界声明段）。

## 实现清单

- [x] 导出产物含 Dataset/Metric/Relationship 三段且字段映射可对照规范结构（源：W-F23-1）✅ **主干二**（映射表 A 十一行逐字段 MetricDef→Ossie Metric，含 multi-dialect expressions 占位行；映射表 B 八行 关系卡→Relationship）+ **Dataset 油田样例**（marts 三件模型物，设计稿 32/33 交付物）+ **走查推演 1**（dump 全程与产物清单）
- [x] 本项目特有字段（修饰词/SQL 指纹/owner 中文职务）进 extensions，标准段不污染（源：W-F23-2）✅ **映射表落位列**（三件特有字段逐行落位）+ **走查推演 2**（污染反例对照：把修饰词塞进标准 description 的错误做法被映射表排除）
- [x] 导出只含 approved 状态资产，待审/废弃不出门（源：卡 `m16` OssieExport 行；Blocked by 设计稿 38 门禁语义）✅ **主干一**（三重闸：物理边界/状态过滤/双保险再验）+ **捣乱输入 A**（待审候选想出门被拒）+ **走查推演 1**（禁用词"老完成率"不在产物）
- [x] 越界引用为零（源：边界规则表）✅ **越界自查**

---

## 走查：从输入到验收行为

> **主角数据**（业务真数据样子，沿设计稿 22/35/36 同一批资产延续）：
> ① 阿强（语义 Owner，平台侧——设定书 §1 责任链"目录维护"行明示的消费方）季度末要给集团数据平台出一版语义资产交换包；
> ② 权威域现状：五支指标（设计稿 22 五份 YAML）、十条术语含禁用词"老完成率"（status=deprecated，设计稿 35 资产 1/10、设定书 §6）、九件本体卡含受效关系（设计稿 36 资产 6–8/9、设定书 §5）、marts 三件模型物 dim_well/dim_date/fct_daily_metering（设计稿 32/33 交付物）；
> ③ 待审候选 pr-20260914-07"检修产量"仍住 `m3` 候选池（设计稿 22 走查推演 3 的同一支，status=in_review）；
> ④ 集团侧同事问："导出的东西我们平台能直接算数吗？"——interchange ≠ production service 的现场（边界声明段）。
> **地图先行**（ossie.py 在 C15 的位置与出边界方向，后续主干引用不重画）：

```text
伪代码（总览，非代码）

语义层容器 C15 — m16 三域权威源（设计稿 22/35/36/37 交付物，只读公开面）
        │ 生效清单清点（m3 快照面读侧：registry_manifest / glossary_manifest / ontology_manifest
        │   ——三域装载期已存档，设计稿 22/35/36 同款纪律）
        ↓
ossie.py:OssieExport.dump() ── 门禁半边：approved 才出门（主干一）
        │ 组装四构成：Dataset / Metric / Relationship / extensions（主干二映射表 A/B + Dataset 样例）
        ↓
   ossie_yaml ═════════虚线出边界（Ossie 语义合约）═════════→ 外部消费方（BI/数据平台/Agent）
                                        一条 import 对齐的是认知不是能力；
                                        口径执行/权限/术语对齐/Agent 安全仍在各平台（边界声明段）
```

### 主干一：dump 骨架与导出门禁——approved 才出门（Blocked by 设计稿 38 的兑现）

```text
伪代码 — app/semantics/ossie.py:OssieExport（m16；签名=卡 m16 逐字）

class OssieExport:
    def __init__(self, 指标注册表, 术语注册表, 本体注册表, repository):
        # 依赖全部是公开面注入：三域注册表（get/lookup_term/resolve_entity 的返回形状——只读，
        #   防环纪律与设计稿 38 CI 的 L2/L4 同款：只读 m16 公开面，YAML 细节零触碰）；
        #   m3（get_snapshot 读侧——三份生效清单是装载期存档的既有资产，本节只消费不新写）

    def dump(self) -> ossie_yaml:
        # ★ 签名零参数：没有"带上待审/带上废弃"的开关——夹带在接口上不可表达
        #   （设计稿 38 捣乱 B"跳级在接口上不可表达"同款论证法，捣乱输入 A 的结构半边）
        产物 = {datasets: [], metrics: [], relationships: [], extensions: {}}
        出门拒绝登记 = []

        # ── 门禁半边：approved 才出门（设计稿 38 衔接——五级 CI 放行 + Owner 审批写回重载的，才是权威域资产；
        #    设计稿 38 原话："导出的资产必然已过五级安检……消费顺序天然成立"）──
        for 资产 in 生效清单清点(repository):            # 三份 manifest——权威目录的清点入口：
            d = 公开面读取(资产)                        #   候选池（m3 候选快照）不在清单上——待审候选
                                                        #   物理上数不到（设计稿 22 主干六：权威目录一个字节没写）
            if d.status != "approved":                  # 双保险再验（template_for 非 approved 零出模板的
                出门拒绝登记.append(资产, d.status)      #   同款防御闸先例，设计稿 22 主干六）：
                continue                                #   glossary 权威目录本就是 {approved, deprecated}
                                                        #   两态（设计稿 35 装载闸）——"老完成率"在此被滤；
            产物[分段(资产)] += 映射(d)                  #   其余两域权威目录只装 approved，再验是双保险
                                                        #   不是必需闸（判据单点维护，取舍 3）
        产物.extensions = 特有字段抽屉(产物)            # 修饰词/同义词/owner 中文职务/SQL 指纹——
                                                        #   按 stable_id 索引（主干二映射表落位列）
        # 产物落盘为 YAML 文本：序列化只含数据形状——与装载闸 safe_load"是数据不是代码"对称；
        #   导出物是**派生物**：真源永远是版本管理里的三域 YAML——修口径改真源再重导，
        #   不手改派生物（设计稿 43 四红线钩子；重导即新鲜，没有"改导出文件"这条捷径）
        # 异常去向：注册表未装载 → 结构化上抛（装配缺失非导出错误）；某域零 approved → 空段合法导出
        #   （空权威域导空包不是错误——诚实比凑数强）
        return 产物
```

**捣乱输入 A：待审候选想出门——三重否决**

```text
伪代码（时序推演，非代码）

t0  集团侧同事说："那个'检修产量'候选不是快批了吗？一起导过去，我们平台先跑着。"
t1  三重否决：
    物理层：pr-20260914-07 status=in_review，住 m3 候选池——metrics/ 权威目录一个字节没有它
            （设计稿 22 主干六的物理保证），生效清单清点根本数不到它；
    门禁层："过五级 CI 才算 approved"（设计稿 38 放行双条件：五级全绿 + Owner 审批）——候选连 L1 都
            没送过，没有出门资历；导出口认权威域状态字段，不认"快批了"的口头资历；
    接口层：dump() 零参数——"夹带候选"在接口上不可表达，想带也无处落参
t2  对照闸不在的后果：待审口径出门 → 外部平台拿 AI 草稿当权威口径做报表对账——
    口径事故跨组织传染（设定书 §8 事故 13 的跨组织版）
可观察行为：候选零出门；出门拒绝登记留痕（谁想带什么、什么状态、为何被滤——审计可查）
```

**门禁不是第二套 CI**：导出门禁=**状态过滤**，不是发布裁决的第二次执行——CI 是发布闸（拦"能不能进权威域"，modules.md 边界规则表 v3 行"生产路径只认门禁"），导出闸是搬运闸（拦"权威域里什么能出门"）。导出口不重跑五级检查：在导出口抄第二份门禁判据，两处漂移之日就是"导出绿了发布红着"之时（设计稿 38 取舍 2"判据不写第二份"同款论证）。approved 的判据因此只有一处出处：装载闸"权威目录只收 approved"（设计稿 22/36）+ glossary 两态目录（设计稿 35）+ 准入生产路径=五级 CI 放行（设计稿 38）。

### 主干二：三段字段映射——可对照规范结构（W-F23-1）+ extensions 落位（W-F23-2）

> **对照粒度声明**（取材锁）：映射可对照的规范结构=AE 前沿方案报告 原文给到的两层——构成清单（Dataset/Relationship/Metric/Multi-dialect expressions/AI context）与治理壳六件（Stable ID·Owner·Role·Version·Certification·Audit）；**段内字段命名是设计演绎最小集**，逐行落位对照这两层，对照不到的字段一律进 extensions。

**映射表 A：MetricDef → Ossie Metric**（左列=设计稿 22 第 0 步八字段逐字 + 设计范围点名两件）

| MetricDef 字段 | 落位 | Ossie 段落点（设计最小集） | 出处/理由 |
|---|---|---|---|
| id | 标准 | Metric.stable_id | 治理壳 Stable ID（开放语义层方案） |
| name | 标准 | Metric.name | — |
| definition | 标准 | Metric.description | 策展口径描述（curated descriptions，设计稿 22 锚点） |
| unit | 标准 | Metric.unit | 设计最小集 |
| version | 标准 | Metric.version | 治理壳 Version（开放语义层方案） |
| status=approved | 标准 | Metric.certification | 治理壳 Certification——出门资产必带认证态；非 approved 在主干一已被滤，到不了映射表 |
| sql_template | 标准（**占位**） | Metric.expressions 占位条目 | **multi-dialect expressions 占位设计演绎**（设计范围）：只登记单方言整句模板 + 占位注记，不做多方言编译——编译=metric execution（方案四件生产事之一，边界声明段）；编造其他方言版本=发明业务事实（走查推演 2 第三行） |
| modifiers | **extensions** | extensions.metrics[stable_id].modifiers | 设计范围点名特有字段：本项目默认口径判据的机制字段（修饰词最少=基础口径，设计稿 22 主干三）——外部平台无此判据，直写标准段即污染（走查推演 2） |
| synonyms | **extensions** | extensions.metrics[stable_id].synonyms | 本项目三级匹配的机制输入（设计稿 22 主干二）；跨平台叫法对齐=concept alignment（开放语义层方案），取舍 2 |
| owner | **extensions**（原文）+ 标准只留角色槽 | extensions.metrics[stable_id].owner_cn="地质研究所·开发室"；标准段角色槽=业务口径 Owner（治理壳 Role） | 设计范围点名"owner 中文职务"：职务词典各平台无法解析——extensions 保真是 round-trip，不是给外人懂 |
| （模板指纹） | **extensions** | extensions.metrics[stable_id].sql_fingerprint | 设计范围点名"SQL 指纹"：导出时对 sql_template 现算，与门禁审计幂等键同源（设计稿 22 propose 幂等 / `m3` 审计"幂等键=会话：轮次：SQL指纹"）——消费方对账"同一版吗" |

**映射表 B：ontology 关系卡 → Ossie Relationship**（左列=设计稿 36 关系卡字段逐字）

| 关系卡字段 | 落位 | Ossie 段落点 | 出处/理由 |
|---|---|---|---|
| id | 标准 | Relationship.stable_id | 治理壳 Stable ID |
| type（隶属/计量/受效） | 标准 | Relationship.type | 直传（结构事实，各平台可读；类型枚举=设计稿 36 装载闸紧枚举） |
| segments 端点（from/to） | 标准 | Relationship.source→target | 端点=实体 stable_id；对象名注记进 extensions（实体卡整卡不出门，取舍 4） |
| cardinality（N:1 / 1:N / N:N） | 标准 | Relationship.cardinality | 设定书 §5 原文基数（隶属链 N:1、计量 1:N、受效 N:N） |
| attributes（受效：劈分系数 Σ=1、响应起始日） | **extensions** | extensions.relationships[stable_id].attributes | 油田业务语义（§5 系数劈分强制要求）——交换格式搬得走"谁连谁"，搬不走"这是什么业务"；标准段只留连接形状 |
| owner 中文职务 | **extensions** | extensions.relationships[stable_id].owner_cn | 同映射表 A owner 行（§3 指标 10 Owner"采油工艺所（开发室联席）"） |
| materialization（物化落点） | 不设字段 | 以 Dataset.stable_id 引用表达 | 结构一份：物化锚在 Dataset 段（引用不复制） |
| status / version | 标准 | certification / version | 同映射表 A 对应行 |

**Dataset 段油田样例**（模型物=设计稿 32/33 交付物，粒度=设计稿 33 GrainSpec）：

```yaml
伪代码 — ossie_yaml 产物片段：datasets 段（油田样例）

datasets:
  - stable_id: fct_daily_metering
    name: 日产计量事实
    description: 一井一日一行的计量事实——产液（方）/产油（吨）/油压（MPa）三度量
    grain: [well_id, prod_date]          # 井×日原子粒度（设计稿 33 粒度协议"声明先于维度与事实"；
                                         #   设定书 §A.2 一井一日 PK）
    certification: approved              # 门禁放行的就绪层模型物（设计稿 34 分层测试闸 / 设计稿 38 出厂资历）
  - stable_id: dim_well
    name: 井维度
    description: 井→平台→区块→油田层级拍平的维度表（设定书 §A.1 字段；代码配可读文本）
  - stable_id: dim_date
    name: 日期维度
    description: 聚合轴维度——产量完成率粒度"月/区块·油田"（设定书 §3 指标 1）的日期半边
```

**走查推演 1（W-F23-1）：阿强季度末跑一次 dump，产物全貌**

```text
伪代码（时序推演，非代码）

t0  清点：三份生效清单（m3 快照面读侧）——metrics 5 支 / glossary 10 条 / ontology 9 卡
    （设计稿 22/35/36 交付物资产数）；剧本域零清点——四构成外（明确不讲的）
t1  逐资产公开面读取 + status 再验：
    metrics 5 支全 approved（装载闸保证）→ 全数进映射表 A；
    glossary 10 条中"老完成率"status=deprecated（2024 年废弃禁用词，设定书 §6）→ 出门拒绝登记，
    不进产物；其余 9 条 approved 照出；
    ontology 9 卡中约束卡（合法 Join 白名单）不映射（明确不讲的）——3 张关系卡进映射表 B
t2  待审候选 pr-20260914-07 不在清单（捣乱输入 A）；指标历史版本不在（注册表只保 approved
    最新版，设计稿 22 get："latest=当前生产版"）
t3  组装产物：metrics×5 / datasets×3（marts 模型物）/ relationships×3（隶属/计量/受效）/
    extensions（修饰词·同义词·owner_cn·SQL 指纹·受效 attributes·端点对象名，按 stable_id 索引）
可观察行为（W-F23-1 断言）：Dataset/Metric/Relationship 三段齐、extensions 第四段，逐字段
    可对照两张映射表与构成清单+治理壳——产物即"可验证发布物"的延长线（设计稿 38 钩子）
```

**走查推演 2（W-F23-2）：污染反例对照——标准段不污染**

| 特有字段 | ❌ 污染落位（被映射表排除） | ✅ 正确落位 | 为什么是污染 |
|---|---|---|---|
| modifiers | 标准段 description 拼接："剔除统计期内……【修饰词：剔除检修井｜开井日历折算】" | extensions.metrics[net_oil_output].modifiers | description 是人读策展描述（curated descriptions）；修饰词是机器判据（默认口径判据，设计稿 22 主干三）——两种消费方共居一字段，人读到结构噪音、机器要解析自然语言，双双失真 |
| owner 中文职务 | 标准段 owner 直写"地质研究所·开发室" | extensions.owner_cn + 标准段角色槽（Role） | 职务词典是本项目组织语言（设定书 §1）——外部平台当用户名/角色去解析必失败；round-trip 保真才是 extensions 的义务，不是让外人看懂 |
| sql_template 整句 | 冒充 expressions 多方言条目×N（替消费方编造其他方言版本） | expressions 单方言**占位**条目 + extensions.sql_fingerprint | 编造方言版本=发明业务事实（取材锁）；真多方言编译=metric execution（开放语义层方案），归平台侧 |
| 受效 attributes | 塞进标准段 type 串（"受效（劈分系数 Σ=1）"） | extensions.relationships[rel_effect].attributes | type 是可枚举的结构事实，拼上业务参数后枚举闸失效（设计稿 36 装载闸紧枚举白登了） |

### 边界声明：interchange ≠ production service——导出的是可移植模型，不是可运行服务

> AE 前沿方案报告 开放语义层节原话："每个平台一条 import + 一条 export；**但 interchange ≠ production service**——标准之外还有四件生产的事"。导出物对齐的是认知，不是能力：

| 方案四件生产事（原文） | 本项目的落点（导出物不带走） |
|---|---|
| metric execution（编译到各引擎） | 模板执行归 m7 命中路径 / m17 校验链——外部平台拿到的是 expressions 占位条目，编译归它们自己的引擎 |
| semantic service（registry/versioning/access control） | 注册表与版本归 m16 装载闸+审批写回重载；权限归 m8 权限闸 / m17 策略闸——导出物不带权限语义 |
| concept alignment（domain/glossary/ontology graph） | 术语/本体/剧本三域归 m16 自身治理——导出物只带关系连接形状与口径文本，叫法对齐是各平台的事（取舍 2/4） |
| agent safety（verified context + policy checks） | verified 证据归 m18 金标册子；上下文安全归 m19 打标 / m21 回读权威源——导出物不是可信上下文，消费方 own 自己的闸 |

**导入设计演绎**（设计范围"导入只做设计演绎一段"；无 import 函数、无格式回读校验，本段是推演不是实装）：

```text
伪代码（设计演绎推演，非代码）——集团平台一条 import 本产物之后

拿得到：完成率的权威定义文本、单位与版本（报表对账时"你们完成率怎么算的"有了可引用的答案）、
        关系连接形状（井—隶属→区块—隶属→油田的 N:1 链，设定书 §5）、Dataset 粒度声明
        （井×日——防双算的对照锚）；
拿不到：能直接跑的 SQL（方言不同，expressions 是占位）、禁用词闸（"老完成率"没出门，集团侧本就
        没有这个词的历史包袱）、权限与审批流（semantic service 归平台自己）。
一句话：import 对齐的是认知，不是能力——能力四件（上表）各平台自建。
```

## 关键判断的取舍记录

1. **extensions 是顶层第四段、按资产类型+stable_id 索引——不嵌进标准条目内部。** 备选：每个标准条目内挂 extensions 子对象。落顶层段的理由：污染检查可机械化——标准三段整体对照不到特有字段名（modifiers/owner_cn/sql_fingerprint），"标准段不污染"从纪律变成可对照的结构事实（W-F23-2 的走查就查这个）；嵌进条目则每条目都要查、漏一处即破防。代价：extensions 与标准条目靠 stable_id 关联，round-trip 要多一次按 id 拼装。换边条件：无（设计范围四构成即此形状——卡面注释"Dataset/Metric/Relationship/extensions"锁死）。
2. **同义词进 extensions，不进标准段。** 备选：同义词作为标准词汇字段出门，外部平台拿来就能配自己的同义词。否决：同义词在本项目是三级匹配的机制输入（设计稿 22 主干二），"命中即直绑/成组即澄清"的语义绑死本项目裁决器——裸把词表给出去，外部平台拿它匹配出什么行为，本项目不背书也不可知；跨平台叫法对齐是 concept alignment 的地盘（方案四件生产事）。落 extensions 保 round-trip：导回去机制照旧。代价：外部平台要自己配同义词——本来就该它自己配。换边条件：出现集团级统一词表治理——那是治理组织问题（另立设计稿），不是格式问题。
3. **废弃语义不随交换格式走；导出口不重跑 CI。** 两个连着的决定：a)"老完成率"不出门——外部平台拿到的都是活着的口径，"什么死了"的知识没有交换形状（禁用词闸是本项目 semantic service 的半边）；本项目 banned 带 replacement 的替代链（设计稿 35）保的是内部提问侧，不是交换侧。b) 导出只做状态过滤、不重跑五级检查——CI 是发布闸、导出是搬运闸，判据单点维护（主干一门禁段）。代价：极端场景——权威域资产经手工应急通道上线（边界规则表例外行）后立即导出，导出物只带 approved 态、不带"未经 CI"注记。接受：例外行本身要求 Registry.load 全量校验+事后补包（设计稿 38 对照段），出厂资历的瑕疵记在审计不在导出物——导出物不携带治理过程的叙事，只携带结果状态。换边条件：消费方要求"认证链可见"——certification 扩成对象（谁批/哪版/哪次门禁），形状不变字段变厚。
4. **实体卡整卡不出门，关系端点只带 stable_id+对象名注记。** 备选：实体属性/有效时间/Action 随 Relationship 段附带出门（结构事实给足）。否决：实体卡是 concept alignment 的本体半边（方案把 domain/glossary/ontology graph 列为标准之外的生产事）——实体卡的业务细节（Action 台账落点/受效劈分语义）是本项目执行器的裁决依据，不是交换必需品；设计范围四构成也没有实体段。落点：端点=实体 stable_id，对象名（井/区块/油田）注记进 extensions 保 round-trip 可读。代价：外部平台看到的本体是"关系骨架"不是"实体全卡"。换边条件：消费方要做跨平台血缘对账——映射范围扩实体卡是另立设计稿的合同变更，不在本节。

## 锚点对照精要

**开放语义层 §Ossie（AE 前沿方案报告）**：原文——"Apache Ossie（OSI 于 2026-06 进 Apache 孵化器后改名）：YAML/JSON 可移植语义模型（Dataset/Relationship/Metric/Multi-dialect expressions/AI context），每个平台一条 import + 一条 export；**但 interchange ≠ production service**——标准之外还有四件生产的事：metric execution（编译到各引擎）、semantic service（registry/versioning/access control）、concept alignment（domain/glossary/ontology graph）、agent safety（verified context + policy checks）"；治理壳——"每个套 Governance Envelope（Stable ID·Owner·Role·Version·Certification·Audit）"。落点：设计范围四构成与三段命名逐字对号（构成清单的 Multi-dialect expressions 收进 Metric 段占位、AI context 不在本节——映射表 A/B 表头声明）；映射的可对照层=构成清单+治理壳六件；边界声明段=四件生产事逐件对号本项目落点。差异：方案讲平台级双向交换愿景，本设计稿只有 export 半边（import 演绎一段）且零对接零认证（PRD F23"不做什么"）；演进时间线不作展开。

**设定书取材对账**（取材锁）：§1 责任链（阿强 语义 Owner"目录维护"——主角与 dump 调用方，即本设计稿的消费方）；§3 指标 1（粒度"月/区块·油田"→dim_date 样例描述）；§5（受效关系 N:N、劈分系数 Σ=1、响应起始日→Relationship 样例 extensions；隶属链/计量/受效基数三值→映射表 B cardinality 行）；§6（"老完成率"禁用词 2024 废弃→走查推演 1 被滤样例）；§8 事故 13（捣乱输入 A t2 的"跨组织传染"对照——口径争议之最的行业底色）。本设计稿业务事实全部落在上述清单与前稿交付物内，无凭空发明；Ossie 段内字段命名按表头声明为设计演绎最小集。

**设计稿 22（MetricDef 供给方）**：五份 YAML 与 MetricDef 字段（第 0 步）是映射表 A 左列的逐字来源；template_for 非 approved 零出模板的防御闸（主干六）是本节 status 再验的先例；"修饰词最少=基础口径"判据（主干三）是"修饰词是机器判据"的出处；捣乱候选 pr-20260914-07 复用走查推演 3 同一支（in_review 的那一支）。

**设计稿 35/36（glossary/ontology 供给方）**：glossary 两态目录 {approved, deprecated}（装载闸）是"废弃不出门"的真实过滤点；关系卡三件（隶属/计量/受效）与字段形状是映射表 B 左列；白名单约束卡不映射的边界在"明确不讲的"；三份 manifest（registry/glossary/ontology_manifest，各稿装载段）是导出清点的既有存档。

**设计稿 38（Blocked by 门禁前置）**：Blocked by 语义兑现——"导出的资产必然已过五级安检"（设计稿 38 原话）；approved 判据出处=放行双条件（五级全绿+Owner 审批）+生产路径只认门禁（边界规则表 v3 行）；"判据不写第二份"（其取舍 2）升格为本节"导出口不做第二套 CI"（取舍 3b）。对称纪律：设计稿 38 越界自查"OssieExport 零出现"——本节同样零触碰 `app/eval/`，防环双向成立。

**设计稿 32/33（Dataset 供给方）**：marts 三件模型物（dim_well/dim_date/fct_daily_metering）与 GrainSpec（井×日）是 Dataset 段样例的交付物来源；就绪层只进业务逻辑的分层纪律（设计稿 32）由 m7/m16 消费侧执行，导出侧只做元数据引用不代行选表。

## 越界自查（源：modules.md 边界规则表）

- **本节动过的文件面**：新增 `app/semantics/ossie.py`（OssieExport——纯内存伪代码，签名=卡 m16 逐字 `OssieExport.dump() -> ossie_yaml`）。落点对照卡 `m16` 目录骨架行（ossie.py # OssieExport.dump：Ossie 兼容导出，m16/F23）与公开接口行（OssieExport.dump 一行）。`registry.py`/`resolver.py`/`lifecycle.py`/`glossary.py`/`ontology.py`/`playbook.py` 与三域资产目录（设计稿 22/35/36/37 交付物）零改动；`app/eval/`（设计稿 38/42/43）零触碰；`m7`/`m17`/`m20` 零触碰。
- **边界规则表逐行核对**：`m7` 主语行——本节与问数链零接线（dump 是治理侧库函数，调用方=阿强治理例行动作，设定书 §1）；语义资产文件行（v3 增补行）——本节对三域资产**只读**：生效清单清点+公开面读取，权威目录零写、零重载触发（导出是搬运不是发布，发布动作独占归 m16 生命周期+设计稿 38 门禁）；`m3` 行——只走 get_snapshot 读侧公开面（三份装载期存档的 manifest）；`m18`/`m16` 防环（卡 m18 依赖行"CI 的 L2/L4 走 m16 公开面，不反向依赖"）——导出口不调 CI、CI 不知导出，与设计稿 38 越界自查"OssieExport 零出现"双向对称；`m20` 行（问数消费只认 marts 模型物）——Dataset 样例引用 marts 模型物是元数据引用，消费纪律由 m7/m16 消费侧执行，导出侧不代行选表；`m19` 行——零外发类工具涉及（导出是文件派生物，不经工具执行器）。无其他行以本节模块为主语。
- **签名纪律**：dump() 零参数逐字；OssieExport 构造注入与 ossie_yaml 为数据形状（备案：ossie_yaml 顶层四段 + extensions 按 stable_id 索引——卡面注释"Dataset/Metric/Relationship/extensions"未展开结构，本设计稿按最小必要给出）；导出清点走 manifest+公开面返回形状，YAML 细节零触碰。
- **架构大图同步**：diagrams/petro-agent.html 按设计范围"图节点范围"C15 内新增 ossie_export（Ossie 导出口）一节点 + 容器外外部节点 ossie_consumers（外部语义消费方——wanx_draw_service 同款先例）+ 出边界虚线边一条（Ossie 语义合约导出）；节点明细表追加 1 行；防护清单表**零追加**（本节无 🛡️ 节点——导出口是搬运闸不是防护闸，防带病资产出门的防护语义归设计稿 38 五级语义 CI 节点）；图头部完成计数**零改动**（diagrams/petro-agent.html 侧统一维护）；`<script>` 区与既有 linkStyle 索引零改动，新边追加在边定义末尾、不带 linkStyle；图上无文件名/函数名/端口/路由（"Ossie 导出口""语义合约""扩展段""审定资产"均为业务语言）。
- **零代码红线**：全文代码块均标注"伪代码"；无导入实装、无兼容认证、无跨平台实测、无框架依赖；Ossie 全程以"YAML 格式规范设计演绎"出现。

## 后续衔接

- **设计稿 43（Agent 只提 MR 四红线）**：导出物是**派生物**——"不手改派生物"红线在这里有了第三个对象（前两个：主干/评审物）；修口径改真源再重导，重导即新鲜；发布合并（MrFlow）之后的例行导出挂治理节奏，本节只认权威域现状。
- **concept alignment 实装（远期）**：取舍 2/4 的换边条件——集团级词表治理或跨平台血缘对账需求出现时，映射范围扩术语卡/实体卡另立设计稿；本节的四构成与 extensions 索引形状不变，只加段。
