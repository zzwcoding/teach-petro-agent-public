# 设计稿 36：Ontology 域——实体/关系/合法 Join 白名单

> **红线声明**：本设计稿零真实可运行代码。全部代码块均为**伪代码**（块首标注"伪代码 — 文件:函数"或"伪代码（时序推演，非代码）"），公开签名取自模块卡 `m16`（`OntologyRegistry.resolve_entity(term) -> [EntityDef]` / `joins_allowed(tables) -> bool | join_path` 两个查询签名；`load(dir)` 承自设计稿 22/35 三域同款装载纪律——卡面"冷启动共识：AI 只产候选草稿，冲突检测后必须 Owner 审批才入权威域（三域同规）"），函数体=输入输出契约+主干判断；实体卡/关系卡/白名单条目的业务内容全部取自设定书 §5 草案与附录 A/§1/§3/§4（逐条注源），本设计稿只负责"格式化为 YAML"（设定书边界声明：草案给业务内容，设计稿负责格式化）。
> **框架红线**（设计范围）：PyYAML——沿用 m16 既有纪律，`yaml.safe_load` 装载 `ontology/*.yaml`（本体文件与口径文件/术语文件同规：**是数据不是代码**），官方调用序列在主干一给出，不许概念性提及。
> **接线边界**：本节活动范围**只在 m16 的 `ontology.py` + `ontology/` 资产目录**——`registry.py`/`resolver.py`/`lifecycle.py`/`glossary.py`/`metrics/`（设计稿 22/35 已交付）零改动；`playbook.py`（设计稿 37）/`ossie.py`（设计稿 41）不动；`ossie.py` 导出消费三域是设计稿 41 的事；`m7` 与执行前校验链（设计稿 24 容器）**只以调用方占位推演**（消费接线代码归消费侧设计稿，本节只保证 `joins_allowed`/`resolve_entity` 两个公开面可答）；**join 白名单裁决只读公开面**（设计范围边界红线明文）；不做图数据库与自动本体推理（源：PRD F19"不做什么"行）。
> **stub 换真身声明**：`ontology.py` 本节即真身（PyYAML + 文件系统 + `m3` 公开面）；卡面 Adapter **FakeRegistry**（设计稿 22 已登记，同签名覆盖 Ontology 半边）照例供后续票走查指名注入，本设计稿不展开。
> **明确不讲的**（设计范围声明）：Playbook 任务剧本（设计稿 37——三域冷启动在它收口）；Ossie 兼容导出（设计稿 41）；五级语义 CI 门禁本体（设计稿 38——本节只交付它要收编的端点闭包与白名单键对账形状）；S5 受限图扩展（设计稿 39，PRD 明文"只做设计示意（白名单边 1–2 跳）"——本设计稿不做图扩展实装，只在取舍 5 留出处）；`m7`/执行前校验链的接入段位与改写动作（消费侧）。

> **前端展示位注记**（2026-09-27）：合法 Join 白名单拒绝帧给出路三样（一句业务原因／全部合法路径清单／扩容指引——无临时豁免只有正门）在原型 C1 对象与关系页签有对应演示卡（B5.2）。

## 实现清单

- [x] 白名单外的表对 join 被拒并给合法路径（源：W-F19-2；卡 `m16` OntologyRegistry 🛡️）✅ **主干三**（判定序：显式白名单 → 经基数推导 → 默认拒绝 fail-closed，被拒返回带 legal_paths 的裁决对象）+ **捣乱输入 A**（产液表×设备表直连被拒全过程）+ **走查推演 2**（受控 ✗ 条目：产液×注水日报直连被拒并给"经受效关系实体"路径）
- [x] 实体卡/关系卡字段契约齐（属性/有效时间/Action；基数/类型），资产 YAML ≥6 个对象（源：卡 `m16` 目录契约 ontology/）✅ **第 0 步**（设定书 §5 草案格式化为 9 份 YAML——5 实体卡（井/区块/油田/设备/计量点）+3 关系卡（隶属/计量/受效）+1 约束卡（合法 Join 白名单），字段形状=对象/属性/有效时间/Action；类型/端点/基数）+ **主干一**（装载闸按 kind 分道验收）
- [x] 实体候选冷启动闭环（候选→冲突检测→Owner 审批→入域）（源：W-F19-4；PRD F19 简化版声明）✅ **主干四**（候选来源/四条结构冲突检测/Owner 按域路由/approve 写回重载；M-Schema 模式吸收备案——《M-Schema 冷启动》独立设计稿已取消并入本节）+ **捣乱输入 B**（被拒 join 借 AI 候选"结构复活"被打回）+ **走查推演 3**（"化验样"实体入域全程）
- [x] 越界引用为零（源：边界规则表）✅ **越界自查**

---

## 走查：从输入到验收行为

> **主角数据**（业务真数据样子，全部取自设定书 §5 草案与 §1/§3/§4/附录 A，标注随行）：
> ① 老王问"上月各台电泵的产液情况"——设备视角问产液，自由生成把**产液表与设备表直连**（"电泵装在井上"是模型常识，讲得通但没登记——W-F19-2 的给定形态"生成的 SQL join 了白名单外的表对"）；
> ② 老王问"N-02 注水井上月注的水在哪几口油井见效"——自由生成把产液表与注水日报**同井号直连**（设定书 §5 受控 ✗ 条目：直连须经受效关系实体）；
> ③ 质检对账想拿化验值对当日计量——化验表 join 须**井号+取样日期双键+时间容差，经 intermediate 视图**（设定书 §5 条目 3；业务原因=§4 规则 4：计量与化验偏差≤5 个百分点、容差=取样时间窗）；
> ④ AI 从 fluid_test 的表名/字段清单/主外键提出实体候选"化验样"（M-Schema 模式吸收备案——《M-Schema 冷启动》独立设计稿已取消并入本节；设定书 §5 实体列本就圈了它——"Schema 是证据"的样例）；
> ⑤ 阿强（语义 Owner，平台侧，设定书 §1）组织本体评审；实体/关系标准审定=地质研究所（§1 技术支持行：标准编制、体检规则、术语审定，消费设计稿 36 明示）；受效类口径=采油工艺所（开发室联席）（§3 指标 10 Owner 列）。
> **地图先行**（ontology.py 在 m16 与全图的位置，后续主干引用不重画）：

```text
伪代码（总览，非代码）

问数链消费侧（占位推演，接线归消费侧设计稿）          语义层容器 C15 — m16（app/semantics/）

执行前校验位（设计稿 24 容器，图边"join 裁决"）：
  AST 段解析出的表对 ① joins_allowed([表A,表B]) ──→ ontology.py:OntologyRegistry.joins_allowed
                                                    第 1 级 显式白名单（✓ 放行给路径 /
                                                              受控 ✗ 拒绝并交代受控路径）
                                                    ↓ 未命中
                                                    第 2 级 经基数推导（已登记关系，一跳）
                                                    ↓ 未命中
                                                    第 3 级 默认拒绝 fail-closed（🛡️ 拒绝+合法路径，W-F19-2）
  选表/检索侧 ② resolve_entity(对象词) ────────→ ontology.py:OntologyRegistry.resolve_entity
                                                    → [EntityDef]（属性/有效时间/Action，主干二）
冷启动旁路（离线）：
  表名/字段注释/主外键、历史 SQL → 候选草稿 → conflict_check（四条结构打架，主干四）
  → Owner 审批 → 写回 ontology/*.yaml → load 重载生效（未审批候选住 m3 候选池，权威目录一个字节不写）
```

### 第 0 步：本体资产长什么样（交付物本体）

> 业务结构显性化：本体域登记的是**结构事实**（业务对象是什么、参与哪些动作、对象间什么关系、哪些表对能 join），不是口径事实（怎么算——设计稿 22）也不是语言事实（叫什么——设计稿 35）。九份 YAML 全部来自设定书 §5 草案逐行格式化+附录 A 字典的字段级落点；字段设计对齐卡 `m16` 实体括号字段（属性/有效时间/Action）与关系示例（隶属/计量/替代+基数）及 DataBuddy Operational Ontology 六字段（业务对象/属性/关系/约束/有效时间/Action，DataBuddy）。kind 是机器判的紧枚举（entity/relation/constraint），一对象一卡。

```yaml
伪代码 — app/semantics/ontology/ent_well.yaml（本体资产 1/9——实体卡：井）

# 井：生产主体（设定书 §5 实体列"井（well_id/井别/投产日/状态机）"；字段级落点=附录 A.1 井档案）
id: ent_well
kind: entity                             # 机器枚举：entity/relation/constraint——装载闸按 kind 分道（主干一）
object: 井
aliases: [油井, 注水井]                   # 井别的口语面（附录 A.1 well_type：EW 采油·IW 注水）——resolve_entity 别名层
definition: 一井一行的生产主体档案，采油井与注水井的总称   # 附录 A.1（§1：采油 86/注水 34）
attributes:                              # 属性=卡 m16 实体括号字段之一；§5 给四件，附录 A.1 给字段级
  - well_id（主键，N-02 规范形；旧写法 N2/N-2 并存——归一化素材，设计稿 32 消费）
  - 井别 well_type（EW 采油·IW 注水；个别改型未留版本——附录 A.1 原文脏特征）
  - 投产日 first_prod_date
  - 状态 current_status（生产中·停产·检修·待弃置——状态机；N-11 已停仍"生产中"=状态滞后样例）
  - 平台 platform（CEP-A/B）、区块 block_name（渤南/渤中/渤西）、油田 field_name（行内冗余=反规范化样例）
valid_time:                              # 有效时间=卡 m16 实体括号字段之二
  grain: 单井档案，一井一行（附录 A.1 PK well_id）
  from: first_prod_date（投产日起生效）
  to: 状态终态（待弃置）——状态滞后是已知脏特征，本体只登记"状态字段是有效时间的载体"，修数归设计稿 34
actions:                                 # Action=卡 m16 实体括号字段之三：对象参与的业务动作+事实落点
  - 计量 → oil_production_daily（一井一日，PK well_id+prod_date——附录 A.2 核心事实源）
  - 注水 → water_injection_daily（注水井侧，井号+日期——附录 A.3）
  - 检修 → well_overhaul（井号+起止，跨月切割争议源——附录 A.4）
  - 措施 → well_measures（压裂/酸化/补孔/调剖——附录 A.5）
physical_anchors:                        # 物理锚：实体落在哪些表.哪些键（附录 A 主外键事实）——主干三推导层原料
  - {table: well_info, keys: [well_id]}
  - {table: oil_production_daily, keys: [well_id]}
  - {table: water_injection_daily, keys: [well_id]}
  - {table: well_overhaul, keys: [well_id]}
  - {table: well_measures, keys: [well_id]}
  - {table: fluid_test, keys: [well_id]}    # 化验表锚着井号也照样被受控 ✗ 拦——显式条目优先于推导（主干三铁律）
owner: 开发室（业务 Owner）；标准审定 地质研究所   # §1 产量口径 Owner+技术支持行（消费设计稿 36 明示）
status: approved
version: 1
```

```yaml
伪代码 — app/semantics/ontology/ent_block.yaml（本体资产 2/9——实体卡：区块）

# 区块：产量与结算的聚合轴（附录 A.1 block_name 渤南/渤中/渤西；§3 指标 1 粒度"月/区块·油田"）
id: ent_block
kind: entity
object: 区块
aliases: [作业区块]
definition: 产量完成率与月度结算的聚合单元（§3 指标 1 粒度列；附录 A.1 block_name 三值）
attributes:
  - 区块名 block_name（渤南/渤中/渤西——附录 A.1）
  - 隶属油田 field_name（经关系卡出边，不在卡内复制层级——结构一份，主干三）
valid_time:
  grain: 区块月聚合（§3 指标 1 统计周期"月/区块·油田"）
  from: 结算月起算（附录 A.8 区块+结算月）
  to: null（现行区块，无登记的退役事实）
actions:
  - 配产 → 配产计划（§3 指标 1 计划配产，配产版本切换日双值行=附录 A.2 plan_output 脏特征）
  - 结算 → monthly_settlement（block_name+settle_date，净重扣自用油与输差——附录 A.8）
physical_anchors:
  - {table: monthly_settlement, keys: [block_name]}   # well_info.block_name 是行内冗余非主外键，不作锚（附录 A.1）
owner: 开发室（业务 Owner）；标准审定 地质研究所
status: approved
version: 1
```

```yaml
伪代码 — app/semantics/ontology/ent_field.yaml（本体资产 3/9——实体卡：油田）

# 油田：顶层业务对象（附录 A.1 field_name"渤海油田"；§1 渤海油田分公司：3 作业区/120 口在产井/5 平台）
id: ent_field
kind: entity
object: 油田
aliases: [分公司]
definition: 渤海油田——推演设定唯一的顶层油田对象（附录 A.1 field_name 单值；§1 组织卡）
attributes:
  - 油田名 field_name（行内冗余在井行=反规范化样例——附录 A.1；本体对象不要求一一对应物理表）
valid_time:
  grain: 组织级常量（§1 推演设定）
  from: null
  to: null
actions: []                              # 显式空：顶层对象无登记的台账动作——空也必须显式写（装载闸验形状）
physical_anchors: []                     # 无独立物理表——field_name 是井行冗余（附录 A.1），推导层对它零贡献
owner: 开发室（业务 Owner）；标准审定 地质研究所
status: approved
version: 1
```

```yaml
伪代码 — app/semantics/ontology/ent_equipment.yaml（本体资产 4/9——实体卡：设备）

# 设备：机采与站库装备（附录 A.7 设备状态台账；主数据行业锚=提取件二 §2.5 李颜"主数据示例为设备编号、井位坐标等"）
id: ent_equipment
kind: entity
object: 设备
aliases: [电泵机, 螺杆泵, 加热炉]         # equip_type 三值（附录 A.7）
definition: 机采与站库装备，按设备号登记状态事件（附录 A.7 设备号+时间戳）
attributes:
  - 设备号（主键——附录 A.7）
  - 设备类型 equip_type（电泵/螺杆泵/加热炉——附录 A.7）
  - 负荷/电流 load/current（附录 A.7）
  - 停机原因码 stop_reason_code（新旧编码并存：旧 R3=皮带断，新 BELT——归一化素材，设计稿 32 消费）
valid_time:
  grain: 状态事件流（设备号+时间戳——附录 A.7）
  from: 事件时间戳
  to: 后一事件覆盖（状态行式有效期）
actions:
  - 停机 → equip_status（stop_reason_code 登记原因——附录 A.7）
physical_anchors:
  - {table: equip_status, keys: [设备号]}
# ★结构空白声明：设备与井的装配关系（哪台泵装在哪口井）样例库未登记——这是捣乱输入 A 被默认拒绝的
#   白名单空白来源（主干三）；真要补，走冷启动提候选（主干四），不走推导层放行
owner: 采油工艺所（措施口径 Owner，§1）；标准审定 地质研究所
status: approved
version: 1
```

```yaml
伪代码 — app/semantics/ontology/ent_meter_point.yaml（本体资产 5/9——实体卡：计量点）

# 计量点：本设计稿给定的样例对象（"计量点-计量-井（一对多）"）；行业锚=petro-it-refs.md §2 条目 12 PRODML 生产链
#   "从储层-井筒边界到交接计量点"。★替身声明：样例库 8 表无独立计量点表，日产计量记录（附录 A.2）
#   是其替身——本体卡登记业务对象，不要求一一对应物理表（诚实纪律，设定书 §9 对照表同款声明）
id: ent_meter_point
kind: entity
object: 计量点
aliases: [交接计量点]
definition: 生产链上对井实施计量的交接点（行业锚 petro-it-refs.md §2 条目 12 PRODML；替身=附录 A.2 日产计量记录）
attributes:
  - 计量点标识（替身下=附录 A.2 的井号+日期联合标识）
  - 计量流（液量/油量——附录 A.2 liquid_output/oil_output 字段的计量语义）
valid_time:
  grain: 计量事件（一井一日——附录 A.2 PK well_id+prod_date）
  from: prod_date
  to: null（日切事件，无区间）
actions:
  - 计量 → oil_production_daily（班次手抄汇总：同井同日 A/B 两行=附录 A.2 脏特征，设计稿 32 清洗）
physical_anchors:
  - {table: oil_production_daily, keys: [well_id, prod_date]}
owner: 销售计量站（经营口径 Owner，§1——计量与结算同侧）；标准审定 地质研究所
status: approved
version: 1
```

```yaml
伪代码 — app/semantics/ontology/rel_affiliation.yaml（本体资产 6/9——关系卡：隶属）

# 井—隶属→区块—隶属→油田：链式多对一（设定书 §5 关系列"井—隶属→区块—隶属→油田"逐字）
id: rel_affiliation
kind: relation
type: 隶属                               # 关系类型（卡 m16 关系示例"隶属/计量/替代"之首；§5 原文）
segments:                                # 链状关系=同型两段一张卡（同型同 Owner 同基数形状，拆两卡是纯重复）
  - {from: 井, to: 区块, cardinality: N:1}   # 一口井恰属一个区块——附录 A.1 一井一行 block_name 单值
  - {from: 区块, to: 油田, cardinality: N:1} # 三个区块属一个油田——附录 A.1 三值 field_name 单值
definition: 行政隶属层级——井归区块管、区块归油田管（§5 原文）
materialization: 井行的 block_name/field_name 行内冗余（附录 A.1）——维度拍平井→平台→区块→油田
              就是本卡的物化落点（设计稿 33 井维度），结构与物化各登各的，两处对账归设计稿 38 CI L2
owner: 开发室（业务 Owner）；标准审定 地质研究所
status: approved
version: 1
```

```yaml
伪代码 — app/semantics/ontology/rel_metering.yaml（本体资产 7/9——关系卡：计量）

# 计量点—计量→井：一对多（本设计稿给定样例基数；行业锚 petro-it-refs.md §2 条目 12）
id: rel_metering
kind: relation
type: 计量                               # 卡 m16 关系示例第二类
segments:
  - {from: 计量点, to: 井, cardinality: 1:N}   # 设计范围给定样例基数
definition: 计量点对井实施计量——日产计量记录是它在样例库的事实落点（附录 A.2；petro-it-refs.md §2 条目 12 PRODML
            "从储层-井筒边界到交接计量点"的行业原型）
materialization: oil_production_daily 一井一日（附录 A.2 PK well_id+prod_date——计量事件表）
owner: 销售计量站（经营口径 Owner，§1）；标准审定 地质研究所
status: approved
version: 1
```

```yaml
伪代码 — app/semantics/ontology/rel_effect.yaml（本体资产 8/9——关系卡：受效）

# 注水井—受效→油井：多对多，带属性（设定书 §5 实体列"受效关系（注水井→受效油井，多对多，属性=劈分系数
#   Σ=1、响应起始日——由王飞系数劈分 [6] 强制要求，业务规则驱动建模的实证）"+关系列"注水井—受效→油井"；
#   [6]=petro-it-refs.md §2 条目 10 海上油公司措施评估真实口径）
id: rel_effect
kind: relation
type: 受效
segments:
  - {from: 注水井, to: 油井, cardinality: N:N}   # §5 原文 multi-to-multi；端点=井实体按井别的角色视图
                                                #   （附录 A.1 well_type IW/EW），不另立两个实体——结构打架检测盯它
attributes:                              # 带属性的关系=关联对象形状：§5 把受效关系列在实体清单（带属性的关联对象），
                                         #   本设计落成"带属性的关系卡"——同一业务事实一张卡，不复制两份
  - 劈分系数（Σ=1——§5 原文；多井受效按劈分系数分摊=§3 指标 10 递减增油的核算前提）
  - 响应起始日（§5 原文）
definition: 注水井对受效油井的见效对应关系——§3 指标 10（递减增油）与指标 6（注采比）的数据源之一
owner: 采油工艺所（开发室联席）            # §3 指标 10 Owner 列逐字
status: approved
version: 1
# ★物理落点声明：8 表里没有受效关系表——受效是登记在本卡里的业务事实，不是任何两张日报表的等值连接键。
#   这正是设定书 §5 白名单"产液×注水直连 ✗（须经受效关系实体）"的根源（走查推演 2）
```

```yaml
伪代码 — app/semantics/ontology/join_whitelist.yaml（本体资产 9/9——约束卡：合法 Join 白名单）

# 合法 Join 白名单（默认拒绝）——设定书 §5 白名单四条逐字格式化；"哪些表能 join"从模型常识变成显式治理对象
id: join_whitelist_core
kind: constraint
object: 合法 Join 白名单（产液表为枢纽的裁决集）
default: deny                            # fail-closed——设计范围判定序第三级；显式条目之外的表对一律拒（取舍 1）
entries:
  - pair: [oil_production_daily, well_info]
    verdict: allow                       # 设定书 §5 原文 ✓
    keys: [well_id]                      # 井号——附录 A.1 PK / 附录 A.2 FK
    note: 产液表只能 join 井档案（井号）——设计范围"产液表只能 join 井 dim"式裁决的档案表侧；
          星型模型井维度侧由设计稿 33 模型物承载（维度拍平=rel_affiliation 的物化）
  - pair: [oil_production_daily, date_dim]
    verdict: allow                       # 设定书 §5 原文 ✓
    keys: [prod_date]                    # 日期——设计稿 33 日期维度辐条
  - pair: [oil_production_daily, fluid_test]
    verdict: deny_controlled             # 设定书 §5 原文 ✗（受控）
    required: 井号+取样日期双键+时间容差，经 intermediate 视图   # §5 原文受控路径
    why: 化验与计量是两个口径（§4 规则 4：计量水_cut vs 化验偏差≤5 个百分点，容差=取样时间窗）——
         单键等值直连把不同取样时点的化验值焊到当日计量行上，打架被焊死成假一致
  - pair: [oil_production_daily, water_injection_daily]
    verdict: deny_controlled             # 设定书 §5 原文 ✗（直连受控）
    required: 经受效关系实体（rel_effect）   # §5 原文受控路径
    why: 受效是登记在受效关系卡里的多对多业务事实（劈分系数 Σ=1，§5）——同井号等值连接表达不了
         "哪口注水井对哪口油井、各分摊多少"；直连只在改型井的双身份行上偶然命中（附录 A.1 改型未留版本），
         错配成假受效
owner: 阿强+数据管理岗                     # 语义 Owner（§1 平台侧角色）——白名单是跨口径的结构裁决，归平台语义侧
status: approved
version: 1
```

### 主干一：注册表装载——按 kind 分道的 yaml.safe_load 调用序列（装载闸）

```text
伪代码 — app/semantics/ontology.py:OntologyRegistry（m16；签名=卡 m16；装载纪律=设计稿 22/35 三域同款）

import yaml                                 # PyYAML——与设计稿 22 MetricRegistry/设计稿 35 GlossaryRegistry 同一纪律

class OntologyRegistry:
    def __init__(self, repository):
        self._repo = repository             # m3 公开面注入（save_snapshot 落生效清单）——零引擎内部触碰
        self._by_object = {}                # 归一化对象名 → EntityDef（实体解析层，主干二）
        self._anchors = {}                  # 表名 → [(实体 id, 键清单)]（物理锚倒排——主干三推导层的原料）
        self._relations = {}                # 冻结端点对(实体 id 对) → [关系卡]（一跳推导的边）
        self._join_pairs = {}               # 冻结表对 → 白名单条目（显式层：allow / deny_controlled）
        self._default = "deny"              # fail-closed 闸位（约束卡 default 字段装载进来，本设计只认 deny）

    async def load(self, dir) -> None:
        files = sorted(Path(dir).glob("*.yaml"))
        if not files:                       # 主干判断：目录空=本体资产没随版本管理交付——装配缺失
            raise SemanticRegistryLoadError("ontology 目录为空——本体文件未交付")
        by_object, anchors, relations, join_pairs = {}, {}, {}, {}
        for path in files:
            raw = yaml.safe_load(path.read_text(encoding="utf-8"))
            # ↑ 官方调用序列与设计稿 22/35 逐字同款：safe_load 只构造标量/列表/字典，不实例化文件里的
            #   任意 Python 对象——本体文件"是数据不是代码"的机制保证
            卡 = 校验分道(raw, path)         # 装载闸按 kind 分道（任一不过 → SemanticRegistryLoadError(文件名, 字段)）：
            #   公共：id/kind/object/owner/status/version 齐；owner 非空——无主对象不得生效（三域同款闸；
            #     提取件四 §一 数据所有者=业务专家认责）；status ∈ {approved}——ontology/ 是权威目录，
            #     draft/in_review 候选只住 m3 候选池（主干四），出现在此即拒绝装载
            #   kind=entity：attributes/valid_time/actions 三字段齐（卡 m16 实体括号字段）——空也必须显式 []
            #     （"设备参与什么动作"登记不出≠可以不登记，显式空才对账得动）
            #   kind=relation：type ∈ 枚举{隶属,承载,计量,受效,作用于,取样自,替代}（§5 关系列全覆盖+卡 m16
            #     示例"替代"留槽——样例库无替代类登记事实，枚举留槽不造样例，取材锁）；端点段齐；
            #     基数 ∈ {1:1,1:N,N:1,N:N}；每段端点必须指向已登记实体（引用闭包——后登记文件补边时
            #     随重载二次对账，设计稿 38 CI L2 引用一致性的装载期前置半边）
            #   kind=constraint：default ∈ {deny,allow}（本设计只认 deny——fail-closed 是本节灵魂）；
            #     条目 verdict ∈ {allow,deny_controlled} 且带 keys；deny_controlled 必须带 required
            #     受控路径声明——拒了不给路是死闸，死闸比没闸更坏（W-F19-2 的"并给合法 join 路径"）
            #   同 object / 同表对 两份=结构打架，装配期即死（设计稿 22 同 id 闸同款："有效产量"两支口径
            #     是一条卡挂多指标，本体同理——一张卡讲一个结构事实）
            if 卡.kind == "entity":
                by_object[归一化(卡.object)] = 卡
                for 锚 in 卡.physical_anchors:
                    anchors.setdefault(锚.table, []).append((卡.id, 锚.keys))
            elif 卡.kind == "relation":
                for 段 in 卡.segments:
                    relations.setdefault(冻结对(段.自实体 id, 段.至实体 id), []).append(卡)
            else:
                for 条目 in 卡.entries:
                    join_pairs[冻结对(条目.pair)] = 条目
        # 数据变形收尾：四层索引就绪（显式表对 → 物理锚 → 关系边 → 实体名）
        self._by_object, self._anchors = by_object, anchors
        self._relations, self._join_pairs = relations, join_pairs
        await self._repo.save_snapshot("ontology_manifest", 序列化(生效清单))
        # 异常去向：SemanticRegistryLoadError 原样上抛——装配点拒绝启动（设计稿 22/35 同款哲学：
        #   带病本体宁可不上线——错的白名单比没有白名单更危险）
```

### 主干二：resolve_entity——实体解析，答"物是什么、能做什么"（卡 m16 查询签名一）

```text
伪代码 — app/semantics/ontology.py:OntologyRegistry.resolve_entity（m16；签名=卡 m16；纯内存读，同步）

class EntityDef:                # 数据形状——实体解析的全部产出（调用方只看它，不碰 YAML 细节）
    entity_id: str              # "ent_well"
    object: str                 # "井"
    definition: str             # 结构事实的定义（附录 A.1/§5 逐条注源）
    attributes: [str]           # 属性清单（含脏特征注记——结构事实与数据现实同卡登记）
    valid_time: dict            # 有效时间（粒度/起/讫——卡 m16 括号字段）
    actions: [dict]             # Action 清单（动作→台账落点）
    owner / version / status    # 治理字段（三域同款）

    def resolve_entity(self, term) -> [EntityDef]:
        term = 归一化(term)                     # 输入毛刺不丢命中（设计稿 22 同款）
        if term in self._by_object:             # 第一层：对象名精确——"井""区块"点名
            return [self._by_object[term]]
        hits = [e for e in self._by_object.values() if term in e.aliases]
        return hits                             # 第二层：别名层（油井/注水井=井别口语面，资产 1/9）
        # 主干判断：多命中全量返回——本体域不替用户挑对象（与设计稿 22 lookup/设计稿 35 lookup_term 的
        #   诚实呈报同哲学）；"油井/注水井"若同词多义，语义消歧是术语域+澄清帧的事（设计稿 35/22）
        # 异常去向：零命中返回空列表——"没收录"是正常业务态不是错误；对象候选走冷启动（主干四），
        #   与术语域互不代劳（取舍 3：语言归设计稿 35，结构归本域）
```

### 主干三：joins_allowed——显式白名单 → 经基数推导 → 默认拒绝（W-F19-2 的本体，🛡️ 本节灵魂）

```text
伪代码 — app/semantics/ontology.py:OntologyRegistry.joins_allowed（m16；签名=卡 m16；纯内存读，同步）

class JoinPath:                 # 放行凭据（真值对象）
    tables: [str]               # ["oil_production_daily", "well_info"]
    keys: [str]                 # ["well_id"]——join 键与方向
    origin: str                 # "whitelist"（显式 ✓ 条目）| "derived"（经基数推导）
    note: str                   # 出处注记（设定书 §5 条目 / 推导依据的实体与基数）

class JoinDenied:               # 拒绝凭据（假值对象——可当 False 用，取舍 3）
    allowed: False
    reason: str                 # 为什么拒（结构层原因，给消费侧拼话术）
    legal_paths: [str]          # 合法 join 路径清单——W-F19-2"拒绝并给合法路径"的兑现位
    hint: str                   # 扩容指引（走冷启动，没有临时豁免）

    def joins_allowed(self, tables) -> bool | join_path:
        if len(tables) != 2:
            raise ValueError("joins_allowed 只裁一对表")   # 三表组合由调用方按 join 树逐边拆问
        pair = 冻结对(tables)
        条目 = self._join_pairs.get(pair)            # ── 第 1 级：显式层（✓ 与受控 ✗ 同在白名单卡里）──
        if 条目:
            if 条目.verdict == "allow":
                return JoinPath(origin="whitelist", keys=条目.keys, note=条目.note)
            return JoinDenied(reason=条目.why, legal_paths=[条目.required])
            # 铁律：显式受控 ✗ 优先于推导——白名单是治理决议（设定书 §5 逐条登记），推导只是结构常识，
            #   常识推翻不了决议（化验表锚着井号也照样走受控路径，取舍 2）
        路径 = self._推导一跳(pair)                   # ── 第 2 级：经基数推导（只走已登记结构，一跳）──
        if 路径:
            return JoinPath(origin="derived", keys=路径.keys,
                            note=f"推导：两表键都落到已登记实体「{路径.hub}」（{路径.基数}）——非显式条目，变更须过门禁")
        # ── 第 3 级：默认拒绝 fail-closed（W-F19-2 的本体）──
        return JoinDenied(
            reason=f"{pair[0]} × {pair[1]} 不在合法 Join 白名单，经已登记实体关系也无一跳路径——默认拒绝",
            legal_paths=[放行条目路径话术(self._join_pairs), 受控条目路径话术(self._join_pairs)],
            hint="业务确需此 join：走本体冷启动提候选（候选→冲突检测→Owner 审批）扩白名单——没有临时豁免")
        # 异常去向：查询的表未在任何物理锚登记 → 同样落默认拒绝——fail-closed 对"本体不知道的表"一视同仁：
        #   不知道 ≠ 允许（样例库 8 表全登记；生产扩表时漏登记的表天然被闸住，宁可误拦去补登记）
        # 调用边界：本函数只读内存索引零副作用——join 白名单裁决只读公开面（设计范围边界红线明文）；
        #   拒绝后的改写/重生成动作归消费侧，本域不代行

    def _推导一跳(self, pair):
        a锚, b锚 = self._anchors.get(pair[0], []), self._anchors.get(pair[1], [])
        共同 = [x for x in a锚 if x.实体 id in {y.实体 id for y in b锚}]
        if not 共同:
            return None
        hub = 共同[0]                    # 一跳定义：两端各一跳落到同一实体枢纽即放行——不做两跳/传递闭包：
                                         #   传递闭包是自动本体推理，PRD F19 明文不做（取舍 5）；多跳需求
                                         #   走白名单显式登记，或 S5 受限图扩展（设计稿 39，只做设计示意，本节不预支）
        return 推导路径(hub=实体名, keys=hub.键, 基数=关系卡基数(hub))
```

**捣乱输入 A：老王问"上月各台电泵的产液情况"——产液表×设备表直连被拒全过程（W-F19-2，走查推演 1）**

```text
伪代码（时序推演，非代码）——执行前校验位为调用方占位（设计稿 24 容器；接入段位与接线归消费侧设计稿，图边"join 裁决"）

t0  意图闸放行（指标位="产液情况"、范围=按电泵机分组——§1 120 口在产井的机采装备视角）
t1  指标词未命中任何 verified 模板（"按设备统计产液"不是 §3 十五条之一）→ 自由生成路径：
    模型按常识生成 FROM oil_production_daily p JOIN equip_status e ON e.设备号 = p.well_id
    ——"电泵装在井上"业务上讲得通，但这层装配关系样例库没登记（资产 4/9 结构空白声明），
    模型是在拿常识补结构——正是"哪些表能 join"不能交给模型常识的原因（取舍 2）
t2  执行前校验位解析出表对，逐对问公开面：OntologyRegistry.joins_allowed(
        ["oil_production_daily", "equip_status"])
t3  判定序走完全程：
    第 1 级显式层：白名单卡（资产 9/9）无此对——既无 ✓ 也无受控 ✗ → 未命中
    第 2 级推导：产液表锚=井（well_id），设备表锚=设备（设备号）——已登记实体/关系里
                没有连接井与设备的边 → _推导一跳 返回 None → 未命中
    第 3 级 fail-closed：JoinDenied(
        reason="不在合法 Join 白名单，经已登记实体关系也无一跳路径——默认拒绝",
        legal_paths=["oil_production_daily ⋈ well_info（井号）——设定书 §5 ✓",
                     "oil_production_daily ⋈ date_dim（日期）——设定书 §5 ✓",
                     "受控：oil_production_daily ⋈ fluid_test（双键+时间容差，经 intermediate）",
                     "受控：oil_production_daily ⋈ water_injection_daily（经受效关系实体）"],
        hint="业务确需按设备统计：先补装配关系登记（冷启动候选→Owner 审批），白名单显式扩条目")
t4  校验位按拒绝裁决短路出图（设计稿 24 Verdict 语义：拒绝带段与改法）——话术素材即 legal_paths，
    消费侧拼装；不做静默改写（改写归消费侧，本体域只裁决）
    可观察行为（W-F19-2 断言）：白名单外的表对 join 被拒，拒绝同时给全部合法 join 路径——
    "哪些表能 join"有显式裁决者，模型常识没有投票权
```

**走查推演 2（验收 1 另一半）：受控 ✗ 条目的拒绝——N-02 注水井的见效分析**

```text
伪代码（时序推演，非代码）——老王问"N-02 注水井上月注的水在哪几口油井见效"

t0  自由生成（见效分析不是已注册指标）：模型生成 oil_production_daily p JOIN water_injection_daily w
        ON p.well_id = w.well_id——同井号直连，直觉上"两边都有井号所以能连"
t1  joins_allowed(["oil_production_daily", "water_injection_daily"])：
    第 1 级显式层命中受控 ✗ 条目（资产 9/9 第 4 条，设定书 §5 原文）——注意：即使推导层
    能靠"两表都锚着井实体"给出一路径，也轮不到它（显式 ✗ 优先于推导，主干三铁律）
t2  JoinDenied(reason="受效是登记在受效关系卡里的多对多业务事实（劈分系数 Σ=1）——同井号等值连接
        表达不了哪口注水井对哪口油井、各分摊多少；直连只在改型井的双身份行上偶然命中，错配成假受效",
        legal_paths=["经受效关系实体 rel_effect（注水井—受效→油井，N:N，属性：劈分系数/响应起始日）"])
t3  业务对照：§3 指标 10 递减增油的核算正是"受效油井实际产油−拟合基线、多井受效按劈分系数（Σ=1）
    分摊"——受效对应关系连同分摊比例是 Owner 审定的业务事实（§5：王飞系数劈分强制要求），
    不是 join 键的巧合；若按直连跑，注水井自身的产液行（注水井也有日报行）会冒充受效油井
t4  消费侧用 legal_paths 拼拒绝话术出图；老王要走见效分析 → 那是设计稿 37 剧本《注水井措施评估》
    的领地（§7 剧本 2），本节只负责把"不能直连、正确路径是什么"裁决清楚
    可观察行为：受控条目拒绝时交代的是"为什么要受控+受控路径是什么"——拒绝可解释、路径可走通
```

### 主干四：冷启动闭环——候选→冲突检测→Owner 审批，未审批不进权威域（W-F19-4）

```text
伪代码 — app/semantics/ontology.py:OntologyCandidatePool（m16；冷启动同规——与设计稿 22 Lifecycle/设计稿 35 术语池
         同一条链，机制引用前两稿不重复展开，本主干只讲本体域的差异点：候选来源与"结构打架"查什么）

class OntologyCandidate:        # 数据形状——AI 只产候选草稿（DataBuddy：LLM 产出只是草稿）
    kind: str                   # entity / relation / constraint 条目——候选也分道
    payload: dict               # 卡内容草稿（对象/属性/有效时间/Action 或 端点/基数）
    source: str                 # "schema"（表名/字段注释/主外键——M-Schema 模式，备案见下）
                                #   | "history_sql"（含被拒 SQL——模型常识补结构的现场）
                                #   | "manual"（手工草案——替身，设定书 §9 冷启动候选行）
    evidence: str               # 证据原文摘录（出处可查——候选不带证据不收，同设计稿 22/35 前置闸）

    def propose(self, candidate) -> proposal_id:
        if 指纹已待审(候选指纹(candidate)):     # 幂等：同一候选反复出现不重复入库（设计稿 22 同款）
            return 既有 proposal_id
        await self._repo.save_snapshot(f"ot-proposal:{proposal_id}",
                                       序列化({**candidate, "status": "draft"}))
        # ↑ 候选住 m3 候选池快照——ontology/ 权威目录一个字节不写：未审批不进权威域的物理保证
        return proposal_id                     # 状态机：draft → in_review（冲突检测过）→
                                               #   approved/rejected（只能 Owner 决议触达）

    def conflict_check(self, candidate) -> 过 | 打回(原因):
        # 本体域的"冲突"与前两域不同物：指标域=口径打架，术语域=语言打架，本体域=结构打架——四条检测：
        ① 实体撞车: 候选 object 与现有 approved 对象同名且定义不同 → 挂 Owner 评审（不自动覆盖）；
                    或同义对象该合不分（候选把"油井""水井"立成两实体 vs 井实体+井别属性——§5"井（井别）"
                    的形状）→ 提示合并候选，裁决归 Owner（提取件二 §2.3 标准一致性检查的朴素版；
                    行业用知识图谱一致性判别，本设计规则比对就够——PRD F19 不做图数据库）
        ② 关系打架: 候选端点/基数与已登记关系矛盾（候选"井—隶属→油田"跳过区块 vs 已登记链式隶属
                    rel_affiliation）→ 打回或挂评审——同型结构只能有一份真相
        ③ 白名单越界复活: 候选关系/实体把 default=deny 覆盖的表对实体化——每条已登记关系都是推导层
                    的边，实体化即借 AI 之手改白名单 → 打回（捣乱输入 B）
        ④ 引用断裂: 端点指向未登记实体 / 物理锚键在附录 A 字典对不上 → 打回（与装载闸端点闭包同源，
                    CI 的 L2 引用一致性收编它——设计稿 38，查 m16 公开面）
        四条全过 → in_review，按域路由 Owner：实体/关系/约束标准→地质研究所（§1 技术支持行：
        标准编制、体检规则、术语审定，消费设计稿 36 明示）+口径归属联席（受效类→采油工艺所（开发室联席），
        §3 指标 10 Owner 列）；白名单条目变更→阿强+数据管理岗（资产 9/9 owner 列——语义 Owner）

    def approve(self, proposal_id, reviewer) -> EntityDef | 关系卡:
        # 🛡️ Owner 审批（三域同规）：人工修订定稿 → status=approved/version 判版 → 写回 ontology/{id}.yaml
        #   → OntologyRegistry.load 重载（进程内即时生效）→ save_audit 决议行；rejected 同形留档
        # 装载闸在写回后再跑一遍（主干一）——批准的草稿若结构不合规照样拒绝重载，双保险
```

> **M-Schema 模式吸收备案**（设计范围伪代码梳理范围明文要求）：《M-Schema 冷启动》独立设计稿已取消并入本节（DataBuddy 备案："schema 注释草稿+人工审"与 Ontology 实体发现冷启动是同一模式，重复立稿）——本节候选来源的"表名/字段注释/主外键"即 DataBuddy 元信息路（"从元信息来，表结构、字段注释、主外键、历史 SQL、BI 配置和血缘"）里最便宜的三个；替身按设定书 §9 对照行声明（真实企业从 BI 配置/历史 SQL/血缘自动生成覆盖 70-80%，本设计=手工草案+事故簿驱动）。

**捣乱输入 B：AI 从被拒 SQL 归纳候选关系——"结构复活闸"**

```text
伪代码（时序推演，非代码）

t0  AI 从历史 SQL 池里那条被拒的产液×设备 join 归纳候选：kind=relation，type=装配，
    端点=井↔设备，source=history_sql，evidence=被拒 SQL 摘录
    （AI 学得没错——泵确实装在井上；但学来的东西恰恰是治理上没登记、白名单默认拒绝的）
t1  conflict_check 检测③：候选端点的物理锚对 = [oil_production_daily × equip_status]，
    落在约束卡 default=deny 覆盖且无显式条目的表对——候选一旦登记，_推导一跳从此放行该表对，
    等于把白名单的默认拒绝从推导层背面拆掉 → 打回，
    原因="被默认拒绝的 join 不能借 AI 候选洗白成已登记关系（取舍 2：推导不能推翻治理决议，
    也不能绕开它）"
t2  对照闸不在的后果：候选照登 → 产液×设备走推导层放行 → 白名单闸还挂着、闸门却被候选池
    从背面焊开——结构资产自相矛盾，与设计稿 35"黑话复活闸"同构：闸挡正面，冲突检测挡背面
t3  治理正道：业务真要"按电泵机统计产液"——先把装配关系（哪台泵装哪口井）作为台账事实补齐
    （源头在 §2.1 采集链路与附录 A.7 设备台账的采集现场），Owner 审批后白名单显式扩条目——
    治理前置到事实登记，不让推导层替业务背书
    可观察行为：候选留档 rejected，ontology/ 一个字节未动；joins_allowed 对该表对行为不变
    （仍默认拒绝）
```

**走查推演 3（W-F19-4）：候选→冲突检测→Owner 审批，"化验样"入域全程可追溯**

```text
伪代码（时序推演，非代码）——AI 从 fluid_test 的表名/字段/主外键提出实体候选（M-Schema 模式，备案见上）

t0  来源：表名 fluid_test + 字段清单（water_cut_lab/density/api_gravity）+ 主外键（井号+取样日期，
    附录 A.6）——AI 读出"这是一个按井、按取样日期登记的化验事实"：候选实体"化验样"+候选关系
    "化验样—取样自→井"（设定书 §5 实体列/关系列本就圈了它们——Schema 证据与 Owner 草案指向
    同一对象，正是 DataBuddy"Schema 与历史 SQL 是证据，不是最终业务权威"的正面样例：证据找对象，
    Owner 定定义）
t1  propose → ot-pr-20260915-01，status=draft 住 m3 候选池；resolve_entity("化验样") 此刻零命中
    ——未审批候选对结构解析零响应（物理保证：ontology/ 没有这个文件）
t2  conflict_check 四条：①无同名撞车（井筒≠化验样——§5 实体列各归各）②无关系打架（取样自
    与已登记关系无端点冲突）③非白名单复活（取样自是台账关系，不是被拒表对的实体化——产液×化验
    的受控 ✗ 条目原样保留）④端点"井"已登记、锚键与附录 A.6 对得上 → 过 → in_review，
    Owner 路由=地质研究所（质量管理员兼，§1——化验属质量数据）
t3  阿强（语义 Owner，§1）组织评审；Owner 修订定稿属性清单（water_cut_lab/density/api_gravity
    逐字段，附录 A.6）→ approve(reviewer=地质研究所) → 写 ontology/ent_lab_sample.yaml +
    rel_sampling.yaml → load 重载（端点闭包二次对账过闸）→ 审计留痕
t4  后续：resolve_entity("化验样") 命中；产液×化验的受控 ✗ 条目仍在（治理决议不因实体登记而松动），
    但受控路径"双键+时间容差"如今有实体卡对照讲清键的语义（取样日期=§4 规则 4 容差窗的锚）
    可观察行为（W-F19-4 断言）：未审批候选不进权威域（t1 零命中）；审批后入域并带 Owner/版本
    （t3 写回重载）；候选→冲突检测→Owner 审批三拍齐全可追溯
```

## 关键判断的取舍记录

1. **joins_allowed 默认拒绝（fail-closed）——闸的语义是"做不了"不是"建议别做"**。备选：默认放行+可疑表对告警。否决理由：告警是提示词哲学的延续（"建议别 join"），而提示词是建议、闸是结构（设计稿 15 只读闸/设计稿 35 禁用词第 0 位同一谱系）；产液×设备的直连一旦放行，错数已经算完再告警，拦得住"记一笔"拦不住"已经出了数"。默认拒绝的代价是误拦——样例库 8 表全登记所以零误拦，生产扩表时误拦的去向也是"补登记"而不是"开豁免"（fail-closed 对未登记表一视同仁，主干三异常去向）。换边条件：无（本节灵魂，🛡️ 所在）。
2. **白名单是治理对象，不是模型常识——显式条目（✓ 与受控 ✗）优先于推导，推导也不能被候选绕开**。设计范围 What-to-build 原话："哪些表能 join"从模型常识变成显式治理对象。显式 ✗ 优先于推导的原因：受控条目（化验双键+时间容差、注水经受效关系）登记的是口径与业务规则（§4 规则 4、§5 受效关系），推导层只有结构常识，常识不知道"同井号直连会错配成假受效"；候选侧同理由 conflict_check ③ 封死（捣乱输入 B）——闸挡正面、冲突检测挡背面，白名单才是一个闭合的治理对象。代价：白名单条目要人维护。收益：每条路径有出处（设定书 §5 条目号随 note 带出），拒绝可解释。换边条件：白名单条目规模大到人维护不动——那是设计稿 39 S5 受限图扩展与设计稿 38 CI 的语境，不是现在改默认。
3. **拒绝侧返回"可当 False 用的裁决对象"——卡面签名 bool | join_path 的工程化**。卡 `m16` 给的签名是 `joins_allowed(tables) -> bool | join_path`：放行侧返回 JoinPath（真值，带键与出处）；拒绝侧若返回裸 False，"拒绝并给合法路径"（W-F19-2）就没处落——话术素材不能靠调用方自己重新遍历白名单（那等于把裁决知识复制到消费侧，真源就分叉了）。本设计稿拒绝侧返回 JoinDenied：布尔语义上等于 False（调用方 `if not verdict` 判拒），结构上携带 reason/legal_paths/hint——一个返回值两全。代价：调用方要懂两种形状（数据形状已入主干三）。换边条件：消费侧出现多语言调用面（m21 强类型中间态）时，把 union 固化成 TypedState 的 Verdict 联合类型——形状不变，只是搬家。
4. **冷启动三域同链不同检测：抄形状不抄内涵**。DataBuddy："Schema 与历史 SQL 是证据，不是最终业务权威"；"LLM 加规则统计产出的只是草稿……还要 Owner 审核，才能进权威语义资产"。链同规（候选→冲突检测→Owner 审批，卡 `m16` 三域同规），但"冲突"三域不同物：指标域=口径打架（重名重义/SQL 指纹，设计稿 22）、术语域=语言打架（同名/撞禁用词/定义矛盾，设计稿 35）、本体域=结构打架（实体撞车/关系打架/白名单越界/引用断裂，主干四四条）。设计上这恰是重点：复用的是治理结构，不复制的是检测内容——抄形状不抄内涵，第三个域还在证明这一点，说明结构真的长在了接缝上。M-Schema 备案随行：《M-Schema 冷启动》独立设计稿已取消并入本节（"schema 注释草稿+人工审"与实体发现冷启动是同一模式，DataBuddy 备案）。换边条件：无。
5. **推导只走一跳，不做传递闭包——图数据库与自动本体推理都在 PRD"不做什么"行里**。备选：推导做 N 跳路径搜索（表→实体→关系→实体→表）。否决理由：传递闭包是自动本体推理（PRD F19 明文不做），而且 N 跳放行的每条多跳路径都等价于一次隐式白名单扩容——治理对象被推导层架空（与取舍 2 同根）。一跳（两端共一个实体枢纽）是"结构常识"的最后一档：它只复述已登记的物理锚事实，不发明新路径；多跳需求两个出口——白名单显式登记（治理决议），或 S5 受限图扩展（PRD F21 明文"白名单边 1–2 跳，只做设计示意"——实装归设计稿 39，本设计稿连边的数据来源（joins_allowed+关系卡）都不预支给它）。换边条件：分析类问题的高频多跳需求成为评估数据里的主要错因——带着评估数据再议 S5 实装，不是现在。
6. **语言、结构、口径三域各答一层，互不代劳**。resolve_entity 不调 GlossaryRegistry（尽管技术上可以）：术语域答"这个词指什么"（设计稿 35），本体域答"这个物是什么、参与什么动作、怎么连"（本设计稿），指标域答"这个数怎么算"（设计稿 22）——三域经 id 解耦引用（glossary_id/实体 id/metric_id），展示时由消费侧跨域回读（设计稿 35 主干三同款哲学：关联一行，本体各一份）。若本体域内嵌术语解析，两域真源迟早漂移，且 ontology.py 的边界红线（只在自身范围活动）也不允许。代价：消费侧要多问一次。换边条件：对象叫法消歧成为评估错因高频项——消费侧把 lookup_term 与 resolve_entity 串成两段查（接线归消费侧设计稿），仍然不动两域。

## 锚点对照精要

**DataBuddy（Operational Ontology 与本体先行）**：原文——4+1 能力域中 Operational Ontology 字段清单"业务对象/属性/关系/约束/有效时间/Action"；"本体先行，映射后置：Schema 与历史 SQL 是证据，不是最终业务权威"；冷启动"允许从 Schema/SQL/报表/文档抽候选，业务 Owner 决定最终定义"；六阶段冷启动 Pipeline（本体草稿→确认发布→范围过滤→候选生成→精评决策→激活治理）。落点：实体卡三字段（attributes/valid_time/actions）与约束卡（白名单）逐字段对号；主干四候选来源与"Owner 出裁决"两拍（六阶段压缩为三拍，W-F19-4 走查断言的给定范围）；捣乱输入 A 是"历史 SQL 是证据不是权威"的反面教材（证据里学来的结构也得过治理）。差异：DataBuddy 是企业 Agent Runtime 平台，本设计是 YAML+进程内注册表（与设计稿 22/35 同一深度）。

**DataBuddy 五级语义 CI：L2 引用与本体一致性**：原文——L2 引用与本体一致性。落点：装载闸端点闭包（关系端点必须指向已登记实体）与 conflict_check ④ 是 L2 的装载期前置半边，设计稿 38 收编为 CI 检查项（查 m16 公开面对账）；白名单键与附录 A 字典的对账同源。差异：CI 本体归设计稿 38，本设计稿只交付形状。

**Gravitino 四对象之 Domain**：原文（设计稿 35 同源）——四个被治理对象套 Governance Envelope（Stable ID·Owner·Role·Version·Certification·Audit）。落点：实体/关系/约束卡的 id/owner/version/status 逐字段对号——三张卡同一治理壳，三域同规的物理基础。差异：平台级元数据件 vs YAML+进程内注册表（设计稿 35 已述，不再展开）。

**提取件二 §2.4（POSC 建模，references/extracts/governance-quality.md）**：原文——"在数据建模方面，借鉴 POSC 标准建模方法，基于多对象关系提取数据属性，创新维度建模和关系建模的融合优化技术，有效提升了数据模型的一致性和易用性"；背景——国际上游数据模型源流为 POSC 与 PPDM，中国石油 1989–1991 年制定 9 大类数据统一标准形成 EPDM 模型。落点：实体卡+关系卡正是"多对象关系提取数据属性"的落地（提取件二 §2 是本设计稿实体/关系建模的行业原型）；"维度建模和关系建模融合"的融合点=rel_affiliation 与设计稿 33 井维度的拍平关系（隶属链是层级维度的结构事实，物化在维度表里——各登各的，对账归 CI）。

**Energistics 上游数据标准（references/petro-it-refs.md §2 条目 12）**：原文——Energistics 三大上游数据标准 WITSML（钻完井/井下作业）、PRODML（"从储层-井筒边界到交接计量点"的生产链）、RESQML（储层/地质建模）。落点：计量点实体的行业锚（资产 5/9）——计量点不是发明的对象，是生产链交接环节的标准对象；替身显式声明（8 表无独立计量点表）。

**提取件二 §2.5（主数据与安全，references/extracts/governance-quality.md）**：原文——李颜：主数据示例为"设备编号、井位坐标等"；生命周期四阶段"数据采集、数据存储、数据使用和数据销毁"。落点：设备实体卡（资产 4/9）=主数据的本体落点（设备号是主数据的行业例证，不是虚构）；设备卡的 valid_time 按状态事件流登记与生命周期四阶段中的"存储/使用"段对齐。

**提取件二 §2.3（标准一致性检查，references/extracts/governance-quality.md）**：原文——"在数据标准制定过程中，采用知识图谱一致性判别技术和业务活动五维度描述方法，实现了多专业融合的标准一致性检查"。落点：conflict_check ①②（实体撞车/关系打架）=标准一致性检查的朴素版（本设计规则比对就够，PRD F19 不做图数据库——取舍 4 随行声明）。

**设定书取材对账**（取材锁）：§5 实体列全量入第 0 步（井/区块/油田/设备/受效关系逐字；井筒/平台/措施/化验样/配注层中，化验样走冷启动走查推演 3、井筒/平台/措施/配注层为样例库暂不落卡的登记位——§5 草案范围大于第 0 步样例集，落卡节奏由 Owner 治理节奏定）；§5 关系列全量（隶属两段/受效落卡，计量=设计范围样例+petro-it-refs.md §2.12，承载/作用于/取样自枚举留槽）；§5 白名单四条逐字入约束卡（资产 9/9）；§3 指标 1（粒度"月/区块·油田"——区块卡 valid_time）、指标 6/10（受效关系卡的消费锚与 Owner 联席）；§1（角色卡：技术支持=地质研究所消费设计稿 36 明示行——Owner 路由；语义 Owner=阿强+数据管理岗——白名单 owner 与评审组织）；§4 规则 4（化验 vs 计量容差——受控条目 why 字段）；附录 A.1/A.2/A.3/A.6/A.7/A.8（字段级落点与脏特征注记）；§9 冷启动候选对照行（"手工草案+事故簿驱动"替身——主干四 source 字段）；§5 关系样例与 §6/§7 草案联动兑现。本设计稿业务事实全部落在上述清单内，无凭空发明；"计量点-计量-井（一对多）"样例基数按设计范围兑现并以 petro-it-refs.md §2.12 锚行业原型。

## 越界自查（源：modules.md 边界规则表）

- **本节动过的文件面**：新增 `app/semantics/ontology.py`（OntologyRegistry/EntityDef/JoinPath/JoinDenied/OntologyCandidatePool——纯内存伪代码，签名=卡 m16）+ `app/semantics/ontology/` 九份资产 YAML（设定书 §5 格式化）。落点对照卡 m16 目录行（ontology.py # OntologyRegistry：实体/关系/合法 Join 白名单，设计稿 36）与 W-F19-2 走查路径（app/semantics/ontology.py:OntologyRegistry.joins_allowed）。`registry.py`/`resolver.py`/`lifecycle.py`/`glossary.py`/`metrics/`（设计稿 22/35）零改动；`playbook.py`（设计稿 37）、`ossie.py`（设计稿 41）、`app/eval/`（设计稿 38/42/43）、`m7`、`m17` 全部零触碰。
- **边界规则表逐行核对**：m7 主语行（绕过 m16/m17/m18 公开面）——本节给消费方的面只有 `resolve_entity`/`joins_allowed` 两个公开签名（设计范围边界红线：join 白名单裁决只读公开面），YAML 细节零触碰；语义资产文件行（v3 增补行：ontology YAML 只能经"Lifecycle 变更包+五级 CI+Owner 审批"变更）——本设计稿冷启动全程候选池→审批→写回，ontology/ 只经 approve 写回+load 重载触达，治理者手工改文件+立即重载是边界规则表保留的对照路径、须走 Registry.load 全量校验（主干一闸即该校验）；m3 行——只走 save_snapshot/save_audit 公开面；m20 行（问数消费只认 marts 层模型物）——白名单表名沿用设定书 §5 原文（结构事实登记），选表与指标绑定只认就绪层的纪律由 m7/m16 消费侧执行，本体域不代行选表；m18 行（CI 的 L2 走 m16 公开面）——本节是端点闭包与白名单键对账的供给侧，CI 本体归设计稿 38 不展开。无其他行以本节模块为主语。
- **调用方占位**：joins_allowed 的调用方=问数链执行前校验位（设计稿 24 容器，图边"join 裁决"；接入段位与接线归消费侧设计稿，本设计稿捣乱 A 以公开面调用推演）；resolve_entity 的调用方=选表/检索侧（设计稿 39 S1 @entity 锚定与 S2 对象装配是它的强型消费面，本设计稿不预支）；propose/approve 的调用方=候选采集旁路与 Owner 评审台（界面不在本节）；FakeRegistry 供后续票指名注入，本设计稿不展开。
- **架构大图同步**：diagrams/petro-agent.html 按设计范围"图节点范围"C15 内新增 ontology_registry（🛡️ 本体注册表：实体/关系/Join 白名单闸）一节点+跨容器边 本体注册表→执行前校验链（join 裁决，设计稿 36）；防护清单表追加 1 行（设计稿 36/ontology_registry）；节点明细表追加 1 行；图头部计数**零改动**；`<script>` 区与既有 linkStyle 索引零改动，新边追加在边定义末尾、不带 linkStyle；图上无文件名/函数名/端口/路由（"本体注册表""Join 白名单闸""受控路径"均为业务语言）。
- **零代码红线**：全文代码块均标注"伪代码"；YAML 是资产文本交付物（数据不是代码）；无 tests/、无 CI、无调度、无图数据库。

## 后续设计稿钩子

- **设计稿 37（Playbook 域）**：三域冷启动在 Playbook 收口（候选→冲突检测→Owner 审批的第四个同构位）；剧本《产量下滑归因》步骤 4"下钻受效关系与检修台账"（设定书 §7 剧本 1 原文）消费的正是本节受效关系卡与井 Action 台账落点——实体/关系是剧本步骤的骨架，"为什么下滑"由剧本驱动（F19 依赖增补行：m7 clarify_intent 消费 match_intent）。
- **设计稿 38（五级语义 CI）**：L2 引用与本体一致性收编本节两件形状——关系端点闭包（装载闸）与白名单键对账（锚键 vs 附录 A 字典）；白名单条目变更走 L4 治理（跨口径结构裁决属高影响变更）；CI 是语义资产变更的唯一放行出口（modules.md 边界规则表 v3 增补行）。
- **设计稿 39（检索瀑布协议 S5）**：S5 受限图扩展"白名单边 1–2 跳"只做设计示意（PRD F21 不做什么行）——本节的 joins_allowed 放行路径与已登记关系卡是 S5 白名单边的天然来源，但实装（扩展遍历）归设计稿 39，本设计稿取舍 5 明文不预支。
