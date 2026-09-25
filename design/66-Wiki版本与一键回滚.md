# 设计稿 66：Wiki 版本与一键回滚

> **红线声明**：本设计稿零真实可运行代码。全部代码块均为**伪代码**（块首标注"伪代码 — 文件:函数"或"伪代码（数据形状声明，非代码）"或"伪代码（对照声明，非代码）"或"伪代码（时序推演，非代码）"）——例外仅 WeKnora 生产代码**原注释/原查询投影引用块**（逐字照抄英文注释与 Go 原文，块首注文件行号与 commit 号，解释全在正文不混进引用块；块内"…"为行省略号，省略行不参与断言）。公开签名取自模块卡逐字：`Revisions.commit(page_id, edit, author) -> Rev`（卡 `m27`——卡面注释"编辑落 revision+diff；一键回滚 rollback(page_id, rev)"前半句即本函数合同）；`Revisions.rollback(page_id, rev) -> None`（卡 `m27`——卡面注释"回滚也是一次 commit（历史不可篡改只追加）"即本函数合同，一句话把 W-F52-2 的期望说尽）。消费既有签名零新增：`WikiWriter.write(full_text, kb) -> WikiPage`（卡 `m27`——设计稿 64 既有，产出的页是本节账本的户头，零重讲）；`Repository.get_chunks_by_ids(ids) -> list[ChunkMeta]`（卡 `m3`——含块原文的批查只读面，设计稿 10/64 同款调用，证据下钻的读位）；`Repository.list_chunk_meta(doc_id) -> list[ChunkMeta]`（卡 `m3`——块元数据查面，证据回链集合可复算的读位）。**框架红线：无新增**（设计范围声明——替身沿卡 `m27` FakeWiki（固定页与双版本）既有形状，零新替身零新 Adapter；"双版本"三字本节兑现）。**深度分档落点**：本节全机制档，主干伪代码到函数级——主干一版本账（revision 表形状与 diff 存法+`Revisions.commit` t①–t⑥）、主干二一键回滚（`Revisions.rollback` t①–t④——回滚=追加式实现）、主干三知识层/证据层分离成文（三层对照表+证据回链+m16 MR 纪律对照表），每步落"输入输出契约+主干判断"（设计范围的"伪代码梳理范围"前三条字面）。
> **接线边界（对既有设计只消费不重讲）**：对设计稿 64 **只消费页产物不重讲**——拼回/截断/重写/出页全程是设计稿 64 交付物，"页落库"从设计稿 64 起就是卡 `m27` 依赖行字面"页面与版本落库"的既有动作，本节接棒的是**落库之后的账本机制**（版本表归本节——卡依赖行后半句字面）；设计稿 64 的 `WikiPage` 生成侧形状零增改（不改既有设计稿），本节的"页账本行"是落库侧行族展开（主干一形状声明，两者不冲突——生成侧返回类型与落库行族是两种形状）。对设计稿 65 **兑领一处注记位**——"机器挂链不动版本号"（设计稿 65 取舍 5 与闸⑨只注记"版本账本机制设计稿 66 成文"）本节兑现：版本号只在真编辑时前进（主干一 t② 真编辑判定），机器挂链与纯台账写零版本位。对设计稿 46 **零重讲**——Wiki 路批扇出与页生成工单是既有管线，版本账在页落库之后，不碰扇出位。对 m16/m18/m43 **只对照零触碰**——语义资产的生命周期/五级 CI/MR 四红线是设计稿 22/38/43 交付物，本节只立"两套账两种物"的对照表（设计范围边界红线"版本表与 m16 生命周期不同管（对照不混用）"），零引用其签名零改动其设计稿。对设计稿 61 **注记同族不混用**——Action 层的独立变更区也是"只追加账本"，但记的是业务变更（谁改了哪口井的配注），本节版本账记的是文档版本（这页上一版长什么样），两处账本同构不同物（取舍 6 附注）。对 m1/m7 **零触碰**——版本与回滚是离线页编辑侧机制，不入问答/问数在线链路；版本账全程**零模型调用**（确定性机制，经网关零次——与设计稿 64/65 的模型半程成对照）。
> **行号与信源核对声明（WeKnora 信源纪律）**：本设计稿所引 WeKnora 源码均经真源码实测核对——`git clone --depth 1` 于 commit `33c0333`，`internal/application/repository/wiki_page.go`（:23-24 版本冲突错误、:98-100 乐观锁约定注释、:111-115 UpdateWithRevision 同事务注释、:121-123 并发快照幂等注释、:135-137 失败版本号恢复注释、:139-144 乐观锁比较写、:171-180 零行命中→查无此页或版本冲突、:184-187 历史列表轻投影列清单、:189-211 ListRevisions 倒序分页、:213-227 GetRevision 取单版全文、:229-253 两层保留修剪、:255-258 删页连带删快照注释、:268-273 机器挂链不动版本注释、:292-298 台账更新不进版本注释）逐行过目；`internal/application/service/wiki_page.go`（:111-120 版本号推进策略注释、:130-141 真编辑判定与快照先行、:169-189 真编辑走同事务双写否则只刷台账、:174-176 原子快照注释、:233-236 署名随版注释、:237-256 快照行装配、:258-275 两层保留窗口、:277-280 滚到现版是客户端错注释、:282-300 历史列表带现版号、:302-311 取单版全文、:313-342 回滚=普通编辑+内容字段拷贝+revert 署名）逐行过目；`internal/types/wiki_page.go`（:240-247 证据块回链注释、:254-259 版本号语义注释、:260-263 编辑来源随版旅行注释、:284-296 编辑来源四值 pipeline/agent/user/revert、:298-307 未知来源归 pipeline、:310-315 不可变快照注释、:316-341 revision 表形状与（页号,版本号）唯一索引、:343-360 两层保留常量与可修剪来源清单）；`internal/agent/prompts_wiki.go`（:251-258 引用认领 verbatim 纪律注释）；`internal/handler/wiki_page.go`（:622-627 回滚端点注释"Applied as a regular edit"、:639 路由行）。**漂移备案①**：卡面"编辑落 revision+diff"字面 vs WeKnora 实测——revision 行存**全文快照**不存 diff（`types/wiki_page.go:314` 字面"every historical version stays diffable and revertable"：可对比性来自快照在场，diff 是按需现算的投影不是存储物）；且 WeKnora 历史有**两层保留修剪**（`:343-360`，机器快照 50 条窗口、硬顶 200——DELETE 路径在保留窗口语义内在场）。这两个词的机制落位照勘误先例如实备案不硬凑："diff"落在本节 `Revisions.commit` 返回值 `Rev` 的 diff 投影列（现算不落盘）+"diffable"性质；"只追加不可篡改"落成"已落快照零改写路径"（INSERT-only 的写语义），保留窗口是存储边界注记位不是篡改口（取舍 1/2）。**漂移备案②**：源码地图 §5.1 对本节只给一句"wiki 页面版本存主库（`repository/wiki_page.go`，gorm）"——零行号零漂移，条目归属与实测一致；PRD F52 信源锚点"WeKnora（wiki 页面版本存主库 repository/wiki_page.go）"同句实测一致。**调研报告**（WeKnora 调研报告）实测：Wiki 模式条目字面"支持人工编辑、版本历史与一键回滚"（设计稿 64 已备案同句——本节是该句后半段的机制兑现位）。**书第三章**（书源）实测：`:511` 知识库当代码库纪律（PR/差异审查/版本历史/责任追溯/一键回滚+生产环境模型不得绕过审核直改主分支）；`:513` 提议者—审核者模式；`:520` 三层分离（原始证据层只增不改/知识层提炼可修订/服务层从已合入版本生成的检索索引）。双仓域（本体）与交互层域两稿本节零引用如实声明（无文档版本账语义）。
> **明确不讲的**（设计范围的"伪代码梳理范围"末条字面"明确不讲的：多人协同冲突合并"+PRD F52"不做什么"）：多人协同编辑冲突合并（单写者设计演绎——乐观锁只判"撞了"不合并"改了什么"，后到者拒绝重来零三方合并，取舍 6）；语义资产治理链细节（变更包/五级 CI/Owner 审批=设计稿 38/43 地盘——本节只对照不展开）；前置审核流（书的 PR 纪律与 WeKnora 现状的差异只作对照注记——petro 设计演绎落"账后可回滚"档与 WeKnora 同向，"该不该前置审"归治理课主题）；引用认领 pass 全管线（WeKnora chunk-citation 逐批 LLM 认领的编排——verbatim 纪律引用块在案即可，petro 落页级回链，论断级认领注记位）；删页连带清理（WeKnora DeleteRevisionsByPage——软删页的快照成死重，注记位）；文档删除级联（撤引用的下游=设计稿 09/51 既有级联语义，注记位）。

## 实现清单

- [x] 编辑落 revision+diff、历史只追加（源：W-F52-1）✅ **主干一**（revision 表形状——不可变快照行+（页号,版本号）唯一+diff 存法=现算投影不落盘；`Revisions.commit` t①–t⑥——读现版/真编辑判定/快照先行/同事务双写/乐观锁撞号拒绝/diff 投影）+ **走查推演 1**（编辑两次各落一版，错版留痕在账）+ **捣乱路 1/4**
- [x] 回滚可再滚回（源：W-F52-2）✅ **主干二**（`Revisions.rollback` t①–t④——同版守闸/取快照/只拷内容字段/回滚当普通编辑过账+revert 署名——回滚=追加式实现）+ **走查推演 2**（2788 回归全程+可再滚回的机械保证）+ **捣乱路 2/3**
- [x] 论断回链证据 chunk、三层分离对照在案（源：W-F52-3；书 §知识更新）✅ **主干三**（三层对照表——证据层/知识层/服务层；页账本证据回链列+撤证注记；verbatim 纪律引用块）+ **走查推演 3**（主任两问全程——查旧版+下钻证据原文）
- [x] 与 m16 生命周期/MR 纪律对照（源：PRD What to build/W-F52-3；边界红线"对照不混用"）✅ **主干三对照表**（两套账两种物六维对照+设计稿 43 指针回拨/设计稿 61 变更区同族辨析）
- [x] revision 表形状与 diff 存法（源：设计范围的"伪代码梳理范围"）✅ **主干一形状声明**+**取舍 1**（快照式 vs 链式 diff）
- [x] 回滚=追加式实现（源：设计范围的"伪代码梳理范围"）✅ **主干二**+**取舍 3**（追加式 vs 指针回拨——与设计稿 43 的分界）
- [x] WeKnora wiki 版本存主库（源：设计范围的"伪代码梳理范围"/WeKnora）✅ **引用块八处逐字**（同事务/并发幂等/失败恢复/轻投影/机器挂链不动版本/不可变快照/两层保留/回滚=普通编辑）+ **锚点对照精要**（行号成稿前实测，漂移备案①②）
- [x] 书 §知识更新：三层分离/PR 模式/Proposer-Reviewer（源：设计范围的"伪代码梳理范围"）✅ **:520 三层对照表底座**+**:511 PR 纪律正文短引**（Proposer-Reviewer 对照注记位）
- [x] 大图推进：C27 增节点版本历史（源：设计范围图节点范围）✅ **越界自查·架构大图同步**（C27 增 1 节点 wiki_revision+零新增边——设计范围未声明边，设计稿 58/60/62/63/65 先例；实测既有 179 条边 0–178 零漂移）
- [x] 越界引用为零（源：边界规则表）✅ **越界自查**

---

## 走查：从输入到验收行为

> **主角数据**（业务真数据样子——本节不新造业务事实，页样张/版本号/角色全为既有行或替身声明见④⑤）：
> ① **改错的主角**：**小李**（地质工程师，问答 Agent 主要用户——CONTEXT.md 角色表；设定书 §1 角色卡"质量管理员｜地质研究所（小李兼）"字面）——设计稿 64 给她"一页读完一篇报告"，设计稿 65 给她"顺链接走到下一篇"，本节给她"改错了找得回"：页编辑不再是一锤子买卖，每次编辑都过账，一键滚回。
> ② **审计追问的主角**：**主任**（汇报人——CONTEXT.md 角色表字面）——汇报前核查页上论断：这句话哪来的、这页上周长什么样。两个问题分别打在证据回链与版本账两个机制位上（推演 3）。
> ③ **页主角（账本的户头）**：《N-2 井完井报告》Wiki 页（设计稿 64 推演 3 产出的同族替身，设计稿 65 挂链后的同族页）——正文含设计稿 44 备案语料行"……N-2 井采用套管射孔完井，人工井底 2788 m……"，初版落库即版本 1（编辑来源=管线生成）。
> ④ **版本账主角（账上行族）**：同一页的账本替身——v1 初版（管线）→ v2 小李修措辞 → v3 小李手滑把"2788 m"写成"2888 m"（走查注入的错版替身）→ v4 回滚后（内容=v2，编辑来源=回滚）。**业务事实零新增**：井名/语料行全引 A.1 与设计稿 44/64/65 备案，错版数值与编辑动作=走查注入替身。
> ⑤ **替身口径**：错版"2888 m"/编辑时间/批次措辞=替身（设计稿 64/65 页样张同族）；"真编辑"=用户可见内容字段真变了（标题/正文/索引摘要/页型/状态/别名六字段——主干一 t② 的判定面）；机制真实，样张与数字为替身。**主角数据对照断言给定栏**：W-F52-1 给定"编辑 Wiki 页两次"=主角④ v1→v2→v3 两次编辑；W-F52-2 给定"回滚到上一版"=v3 错版滚回 v2；W-F52-3 给定"审计追问某论断出处"=主角②主任问"2788 m 哪来的"。
> **地图先行**（Wiki 管线四站是设计稿 64/65 的图，本节在站四之后立"账本位"——页落库之后的版本账，后续主干引用不重画）：

```text
伪代码（Wiki 管线总览——版本账与证据回链的落位，非代码）

入库半程与三站（既有面，零重讲——设计稿 46 扇出、设计稿 64 站一站二、设计稿 65 站二半与站四）
  报告 → dispatch 扇出（设计稿 46）→ 拼回重建 → 经网关重写出页（设计稿 64）
        → 页内挂链接+入口页（设计稿 65）→ 页落库（m3 页面落库——卡 m27 依赖行前半句）
── 本节落位（C27 同容器，账本位）─────────────────────────────────
  落位一 版本账（每次真编辑过账——本节主干一/二）
    编辑（人或管线）→ Revisions.commit：被替代版先落快照行，
        页行再更新、版本号加一——同一事务，撞版本号拒绝
    回滚 → Revisions.rollback：旧版内容当一次新编辑过账——
        回滚自己也进账，版本号继续前进，可再滚回      主干二
  落位二 证据回链（页账本行上的回链列——本节主干三）
    页账本行带"证据块回链"列（来源文档的正文块号集合）——
    页上论断可下钻到分块原文；页不在双索引里，索引从
    chunk 生成——证据/知识/服务三层各是各的账
一句话：版本账回答"这页以前长什么样、改错了怎么找回"——知识层
       （页）的 Git；证据回链回答"页上这句话哪来的"——下钻到
       证据层（chunk）的通道（书 :520 三层分离，设计稿 66 兑现成文）
```

### 主干一：版本账——revision 表形状与 Revisions.commit（W-F52-1 的本体）

WeKnora 不可变快照注释（引用主位——逐字；`internal/types/wiki_page.go:310-315`，commit 33c0333 实测）：

```text
// WikiPageRevision is one immutable snapshot of a superseded page version.
// The current version lives only in wiki_pages; when an edit replaces
// version V the pre-edit state is inserted here as (page_id, V) inside the
// same transaction, so every historical version stays diffable and
// revertable. Rows are pruned per WikiRevisionPruneRequest to bound storage
// on hot pipeline pages.
```

正文解释：这五行注释把版本账的三条铁律说尽。**其一，现行版只住主行**——"The current version lives only in wiki_pages"：页表永远只有一条现行版，历史全在快照表，"这页现在长什么样"零歧义。**其二，被替代版先落快照**——编辑把版本 V 换掉时，落快照的是 V（编辑前的状态）不是新状态：账上记"被改掉的样子"，新样子住主行。**其三，同一事务**——"inside the same transaction"：快照插入与主行更新要么都成要么都不成，历史才可信（repo 侧同款注释见下）。落成 petro 设计演绎的表形状与 diff 存法：

```text
伪代码（数据形状声明，非代码——revision 表与页账本行为卡 m27 依赖行
       "页面与版本落库（m3）"的设计演绎展开；WeKnora WikiPageRevision
       同构，列名业务化）

页账本行（落库行族——与设计稿 64 生成侧 WikiPage 形状不冲突）:
  { 页号, 知识库 ID, 来源文档号, 标题, 索引摘要, 正文, 页型, 状态,
    别名, 证据块回链: [块号],        # ← 本节 W-F52-3 机制位（WeKnora
                                    #   chunk_refs 同构，主干三）
    版本号, 编辑来源, 编辑人, 更新时间 }

revision 行（版本账——一张页一个小账本）:
  { 页号, 版本号,          # （页号, 版本号）唯一——同一页同一版本号
                          # 只许一条快照（WeKnora 唯一索引同款）
    标题, 正文快照, 索引摘要, 页型, 状态, 别名快照,
                          # ★ 存全文快照不存 diff——"diffable"靠快照
                          #   在场（WeKnora :314 字面，漂移备案①）；快照
                          #   是"被替代那一版"的完整样子，行零改写
    编辑来源,             # 那一版的作者是谁：管线|助手|用户|回滚
    编辑人, 落账时间 }    # ★ 署名随版走——记的是"这一版当时的作者"，
                          #   不是"把它替换掉的那次写"（WeKnora 同款注释）
Rev（commit 的返回值）:
  { 版本号, 编辑来源, 编辑人, 落账时间,
    diff 投影: [增删行] }  # ★ diff 存法的答案：不落表列，与上一版
                          #   正文现算的行级差异随返回值走——账本存
                          #   快照，diff 是读时投影（取舍 1）
```

WeKnora 同事务与乐观锁注释（引用主位——逐字三处；`internal/application/repository/wiki_page.go:111-115`、`:121-123`、`:135-137`，commit 33c0333 实测）：

```text
// UpdateWithRevision snapshots the version being superseded and applies the
// update atomically. Doing both in one transaction is what makes the history
// trustworthy: a failed update can no longer leave behind a snapshot of a
// version that is still current, which would show up twice in the history
// and be un-revertable.
```

```text
			// An already-present (page_id, version) pair means a concurrent
			// writer snapshotted the same version first; its copy is
			// identical, so leaving it alone is correct.
```

```text
// updateWikiPageRow performs the versioned page write on the given handle
// (plain connection or transaction). On failure page.Version is restored so
// the caller never observes a bumped version for a write that did not land.
```

正文解释：三段注释各守一个"历史可信"的角落。**同事务**守的是"影子快照"——快照插入与主行更新拆开写，失败的更新会留下一条"还现行着的版本的快照"，同一版在历史里出现两次、且滚不回去（"un-revertable"）——先落快照后更新主行必须是原子的。**并发幂等**守的是撞车——两个写者同时给同一版落快照，快照内容相同（同一版的复制），（页号，版本号）撞上时后到者放弃插入即可，不算错。**失败恢复**守的是虚账——写失败时版本号回拨，调用方永远看不到"一次没落地的写把版本号抬走了"。版本号的推进策略（引用主位——逐字；`internal/application/service/wiki_page.go:111-120`，commit 33c0333 实测）：

```text
// UpdatePage updates an existing wiki page.
//
// Version bump policy: the `version` column is intended to track the user-
// visible content revision, not every row rewrite. We therefore bump it only
// when at least one of the user-facing fields actually changes — title,
// content, summary, page_type, or status. Bookkeeping-only writes (refreshing
// source_refs after re-ingest when the body is identical, rebuilding the index
// page with the same directory, cross-link injection that ends up replacing
// nothing, etc.) still persist through `UpdateMeta` but leave `version`
// untouched so consumers can treat a bump as a real edit signal.
```

正文解释："版本号是**真编辑信号**，不是行写计数"——机器挂链（设计稿 65 的两路挂链）、同内容重入库、状态同步这些台账写照常落库，但版本号不动；消费方看到版本号 +1 就知道"有人真改了内容"。这条是设计稿 65 取舍 5"机器挂链不动版本号"注记位的机制成文：挂链是格式修饰不是内容变更，进版本账会把"谁改了内容"的审计信号稀释进机器噪音。落成 commit 主干：

```text
伪代码 — app/wiki/revisions.py:Revisions.commit（m27；签名按卡逐字：
         Revisions.commit(page_id, edit, author) -> Rev；
         卡面注释"编辑落 revision+diff"是本函数合同——落 revision 见
         t③t④，diff 见 t⑥ 返回值投影）

def commit(self, page_id, edit, author) -> Rev:
    # t① 读现版：按页号取页账本行（现行版只住主行——引用块一字面）；
    #    页不在 → 查无此页拒绝（账本不为幽灵页开户）
    现版 = _按页号取页行(page_id)
    # t② 真编辑判定：edit 的六字段（标题/正文/索引摘要/页型/状态/别名）
    #    与现版逐一对比——全同 → 纯台账写：其余字段照刷、版本号不动、
    #    零快照零 diff（WeKnora 版本推进策略逐字——版本号是真编辑信号；
    #    设计稿 65 机器挂链不动版本号的注记位在本步兑现）
    if 六字段全同(现版, edit):  return _只刷台账(现版, edit)   # 版本号不动
    # t③ 快照先行：把"被替代的现版"装配成 revision 行——六字段全文
    #    快照+编辑来源/编辑人（现版自己的署名随行入账，不是本次写者）+
    #    （页号, 现版.版本号）账位
    快照行 = _装配快照(现版)
    # t④ 同事务双写：一个事务里①插快照行（账位已占用 → 并发写者已
    #    落过同版快照，内容相同，放弃插入不算错——WeKnora 并发幂等逐字）
    #    ②更新页主行（edit 六字段+版本号=现版+1， WHERE 页号=?
    #    AND 版本号=现版.版本号——乐观锁：行数零命中=别人先改了，
    #    版本冲突拒绝；写失败版本号恢复原值，不虚加——WeKnora 失败恢复逐字）
    _同事务双写(快照行, 页主行更新)
    #    ★ 写语义红线：revision 行 INSERT-only——已落快照零 UPDATE 零
    #      改写路径；保留窗口是另一件事（注记位见 t⑥，取舍 2）
    # t⑤ 保留窗口注记（设计演绎零展开——WeKnora 两层保留同款在案：机器
    #    来源快照留最近 50 条、全部快照硬顶 200 条，超窗修剪是存储
    #    边界不是篡改口；"谁的快照可修剪"按编辑来源分层，取舍 2）
    # t⑥ 出账：return Rev(版本号=新版本号, 编辑来源=author 的来源档,
    #    编辑人=author, 落账时间=现在,
    #    diff 投影=_diff_行级(现版.正文, edit.正文))   # 现算不落盘
```

WeKnora 历史列表轻投影（引用主位——逐字两处；`internal/application/repository/wiki_page.go:184-187` 与 `:189-204`，commit 33c0333 实测）：

```text
// wikiRevisionListColumns is the projection for revision listings — every
// column except the potentially multi-hundred-KB content body.
```

```text
// ListRevisions returns snapshots for a page newest-first, content omitted.
```

正文解释：历史列表是"账目页"不是"文库"——列清单里**没有正文列**（多百 KB 量级的正文快照不进列表传输），只有版本号/标题/页型/状态/摘要/别名/编辑来源/编辑人/两个时间；要看某一版全文，走取单版读面（GetRevision——按（库号, 页号, 版本号）精确取一行带正文）。列表按版本号倒序并带现版号——"这页改到第几版了"和"每一版是谁什么时候改的"一屏读完，正文按需下钻（PostgreSQL 方言设计演绎：`SELECT 页号, 版本号, 标题, 页型, 状态, 索引摘要, 别名, 编辑来源, 编辑人, 落账时间 FROM 版本账 WHERE 库号=? AND 页号=? ORDER BY 版本号 DESC LIMIT ? OFFSET ?`——列清单零正文列）。

### 主干二：一键回滚——Revisions.rollback（W-F52-2 的本体：回滚=追加式实现）

WeKnora 回滚注释与守闸（引用主位——逐字两处；`internal/application/service/wiki_page.go:313-317` 与 `:277-280`，commit 33c0333 实测）：

```text
// RevertPageToVersion rolls the page back to a stored revision by applying
// that revision's content fields as a regular edit: the pre-revert state is
// snapshotted, version advances, links are re-parsed. Placement (folder,
// sort order) and provenance refs keep their current values — a revert is
// about content, not about undoing directory moves.
```

```text
// ErrWikiRevertToCurrentVersion is returned when a revert targets the version
// the page is already on — a client-side mistake (usually a stale history
// list), not a server fault, so handlers map it to 400.
```

WeKnora 回滚端点注释（引用主位——逐字；`internal/handler/wiki_page.go:622-627`，commit 33c0333 实测）：

```text
// @Summary      Revert a wiki page to an earlier revision
// @Description  Rolls the page (slug in the body, like move-page) back to
// @Description  the content of the given stored revision. Applied as a
// @Description  regular edit: the pre-revert state is snapshotted and the
// @Description  version advances.
```

正文解释：WeKnora 的回滚没有第二条写路径——它把"回滚"翻译成"一次内容为旧版的普通编辑"再走 commit（"Applied as a **regular edit**"逐字）：回滚前的状态先落快照（错版入账不是被抹掉）、版本号继续前进、出链接照重解析。这个翻译一次性买到三件事：**历史不可篡改**（回滚也是追加，账上没有"改历史"这个动作）、**回滚可审计**（那一版的编辑来源=revert——账本自己记得"这是一次回滚"）、**可再滚回**（被滚掉的状态刚落了快照，滚回去合法）。守闸也有话说：回滚目标=现版不是服务端的错，是客户端拿着过期的历史列表点了"回到当前版"——按客户端错处理（400 档），不装成故障。落成 rollback 主干：

```text
伪代码 — app/wiki/revisions.py:Revisions.rollback（m27；签名按卡逐字：
         Revisions.rollback(page_id, rev) -> None；
         卡面注释"回滚也是一次 commit（历史不可篡改只追加）"是本函数
         合同——实现体就是把回滚翻译成 commit 的四步）

def rollback(self, page_id, rev) -> None:
    # t① 同版守闸：目标版本号 == 页现版版本号 → 拒绝（WeKnora 同款——
    #    客户端陈旧历史列表的错，不是服务端故障；已在此版上还"滚"什么）
    现版 = _按页号取页行(page_id)
    if rev.版本号 == 现版.版本号:  raise 滚到现版拒绝
    # t② 取快照：按（页号, 目标版本号）查版本账——查无此版 → 拒绝
    #    （账上没有的版本滚不回去；快照行带全文，无需回放拼装——取舍 1）
    目标快照 = _按版本号取快照(page_id, rev.版本号)
    # t③ 只拷内容字段：把目标快照的六字段（标题/正文/索引摘要/页型/
    #    状态/别名）装进一次编辑——页此刻在哪个分组、排序几点、
    #    来源文档号与证据块回链，全部保留现值（WeKnora 逐字："a revert
    #    is about content, not about undoing directory moves"——回滚
    #    是内容的事，不是把目录搬家也撤回）
    编辑 = _内容字段自快照(目标快照)
    # t④ 回滚当普通编辑过账：走 Revisions.commit 同一条路（主干一
    #    t①–t⑥）——被滚掉的现版先落快照（错版入账）、版本号+1、
    #    编辑来源=回滚、编辑人=发起回滚的人
    self.commit(page_id, 编辑, author=发起人(来源档=回滚))
    # ★ 可再滚回的机械保证：t④ 把回滚前的状态刚落了快照——账上
    #   每个历史状态都在，再滚回任何一个都过 t①/t② 同样的闸
    # ★ 机器侧联动注记：回滚出的新正文重挂链接走设计稿 65 既有挂链路
    #   （格式修饰零版本位）——版本账只记内容账，链接账零混入
```

### 主干三：知识层/证据层分离成文——三层对照、证据回链与 m16 MR 纪律对照（W-F52-3）

WeKnora 证据回链注释与 verbatim 纪律（引用主位——逐字两处；`internal/types/wiki_page.go:240-247` 与 `internal/agent/prompts_wiki.go:251-254`，commit 33c0333 实测）：

```text
	// ChunkRefs records the specific source-document chunks this page was
	// built from — one UUID per cited chunk. Populated during ingest from
	// the chunk-citation pass; refreshed wholesale whenever the page is
	// re-materialized. Empty for summary pages (they are document-level
	// synopses and don't carry chunk-level citations). Use this when you
	// need to surface the underlying evidence for a wiki page, or to
	// retract citations when a source document is deleted.
```

```text
// WikiChunkCitationPrompt (Pass 1..N of the chunk-cited pipeline) asks the
// LLM to read a batch of chunks and, for each candidate entity/concept, list
// the chunk IDs that substantively discuss it. This keeps per-slug "facts" in
// their verbatim form (the chunk text) instead of asking the LLM to paraphrase.
```

正文解释：知识层/证据层分离不是口号，是页账本行上的一列。**页=知识层**：提炼过、可持续修订的 Markdown（每改一次过账）；**chunk=证据层**：只增不改的原文块（设计稿 44 父子分块落账的块行族）；**回链列**把两层缝起来——页账本行的"证据块回链"记录这页由哪些证据块筑成（WeKnora chunk_refs 同构：一UUID 一块），用途注释说两件事：审计要下钻"这页的底层证据"时用它；源文档删除要撤引用时也用它。petro 设计演绎的回链来源取**确定性半边**：证据块回链=来源文档的正文块号集合（设计稿 64 拼回取材的那批 text 块——经 `Repository.list_chunk_meta(doc_id)` 公开面可复算，零新模型调用）；WeKnora 还有精细半边（chunk-citation pass：逐批问模型哪些块**实质讨论了**候选实体——"实质"=至少一条具体事实/属性/步骤/日期/数字/关系），其纪律句值得原文记：论断的事实形态保真在**块的原文**里，不让 LLM 转述（"verbatim form … instead of … paraphrase"逐字）——页级回链保证"页上每个论断至少能下钻到筑页的原文集合"，论断级精细认领是换边条件里的增强位（取舍 5）。三层对照（书 ：520 的油田版）：

```text
伪代码（对照声明，非代码——书 :520 三层分离 × petro 三层落位；
       每层注"存什么/可变性/本节机制位"）

 ────────────────────────────────────────────────────────────────────────
 层            │ petro 落位        │ 存什么           │ 可变性
 ────────────────────────────────────────────────────────────────────────
 原始证据层    │ 报告 chunk（m3    │ 原文块（含父子   │ 只增不改——审计
 （书:520字面  │ 块行族，设计稿44）│ 分块的账）       │ 下钻的基石
  "只增不改"） │                   │                  │
 知识层        │ Wiki 页+版本账    │ 提炼的 Markdown  │ 可持续修订——
 （"提炼、可   │ （本节）          │ 页（每版带署名） │ 每改一次过账，
  持续修订"）  │                   │                  │ 改错可滚回
 服务层        │ 双路索引（m14）   │ 从 chunk 生成的  │ 可重建的派生物
 （"从已合入   │                   │ 检索索引         │ ——页不在索引
  版本生成"）  │                   │                  │ 里（设计稿 64 闸）
 ────────────────────────────────────────────────────────────────────────
 读表法：证据层是"发生了什么"的原始账（断言观的 is 域原料），知识层
 是"读起来像人话"的加工账（修订权在知识层，原文权在证据层），服务层
 是"查得快"的投影账（索引坏了可从 chunk 重建——设计稿 08 快照装载同族）。
 版本账是知识层自己的 Git：每次修订过账、可滚回（书 :511 把知识变更
 当 PR 的最小兑现面）；证据回链是知识层通向证据层的审计通道
```

与 m16 生命周期/MR 纪律对照（设计范围边界红线"版本表与 m16 生命周期不同管（对照不混用）"）：

```text
伪代码（对照声明，非代码——m27 版本账 × m16 生命周期六维对照；
       m16 机制面=卡 m16 公开接口字面（propose/approve/版本+1 写回），
       设计稿 43 MR 四红线与设计稿 61 变更区只作辨析注记）

 ────────────────────────────────────────────────────────────────────────
 维度       │ m16 生命周期（语义资产）    │ m27 版本账（文档知识，本节）
 ────────────────────────────────────────────────────────────────────────
 管什么     │ 指标/术语/本体/剧本 YAML    │ Wiki 页 Markdown（is 域知识层）
            │ （ought/means 域）          │
 变更入口   │ Lifecycle.propose 变更包    │ Revisions.commit 直接过账
 审在哪     │ 合入前：五级 CI+负责人审批  │ 账后：每版可查+一键滚回
            │ （未审零出模板）            │ （书 :511 前置审纪律=对照注记位）
 版本语义   │ 注册表条目版本号——审批通过  │ 页级 revision——被替代版落快照、
            │ 才版本+1 写回               │ 版本号随真编辑自增
 回滚       │ 版本指针回拨走同一审批席    │ 追加式回滚=一次 commit（revert
            │ （设计稿 43——回拨管源）     │ 署名）——回滚管页、零审批位
 谁在用     │ 问数链（命中即固定模板）    │ 人读页（小李/主任）与页编辑
 ────────────────────────────────────────────────────────────────────────
 对照不混用（边界红线）：两套账两种物——语义资产的变更包不进版本账
 （它有自己的门禁链），文档页的编辑不经五级 CI（它有版本账兜底）。
 同族辨析：设计稿 43 的"指针回拨"与设计稿 61 的"变更区只追加"都和本节账本
 同构不同物——语义仓回拨的是 Git 源指针、Action 记的是业务变更、
 本节记的是文档版本；三处"只追加/可回退"各管各的资产（取舍 6 附注）
```

### 捣乱输入：四路——"抹账、乱滚、搬家滚、并发撞"

```text
伪代码（时序推演，非代码——捣乱打的是版本账的误用位；判据全部在案）

路1  抹账："2888 错版太难看，把账上那条删了当没发生"——
     🛡️ 只追加闸拦（revision 行 INSERT-only——已落快照零 UPDATE 零
        改写路径；错版在账恰是"不可篡改"的可观察面：2788→2888 的
        变更双方都查得到，抹账动作在账本结构上不可表达）：
        翻车样=WeKnora 同事务注释的反面——能改历史的历史就不可信
        （"show up twice in the history and be un-revertable"的
        根源就是账不干净）；保留窗口只按"编辑来源分层"修剪
        存储量，人的账活到硬顶（取舍 2）——窗口是存储边界，
        不是给你删证据的口子
路2  乱滚："历史列表是昨天打开的，点'回到当前版'"（目标=现版）——
     🛡️ 同版守闸拦（主干二 t①——WeKnora ErrWikiRevertToCurrentVersion
        同款：客户端陈旧列表的错按客户端错回，不装服务端故障）；
     变体"滚到账上没有的版本号"——🛡️ 查无此版闸拦（t② 取不到
        快照即拒——账上没有的版本滚不回去，快照式让这一步就是
        一次精确查表，零回放零猜测）
路3  搬家滚："页面昨天被移进了新区块分组，回滚顺便回到旧分组"——
     🛡️ 内容字段闸拦（主干二 t③——WeKnora 逐字"a revert is about
        content, not about undoing directory moves"：回滚只拷六
        内容字段，分组/排序/来源文档号/证据回链全保留现值）：
        回滚 undo 的是内容，不是目录操作史——搬家没有进版本账
        （它不是真编辑，主干一 t② 判定），回滚自然也不撤它
路4  并发撞："小李在改这页，管线重写同批也写了这页"——
     🛡️ 乐观锁闸拦（主干一 t④——WHERE 版本号=期望值，后到者行数
        零命中→版本冲突拒绝，不静默覆盖先到者；失败方版本号恢复
        原值不虚加——WeKnora 失败恢复逐字）+ 🛡️ 并发快照幂等闸拦
        （两边给同一版落快照，内容相同，（页号,版本号）唯一约束下
        后到者放弃插入不算错——WeKnora 逐字"its copy is identical,
        so leaving it alone is correct"）：
        撞了就是撞了——后到者带着冲突信息重来（重读现版再改），
        不做三方合并（设计范围明确不讲，取舍 6）
可观察行为：四路全拦后版本账的承诺只剩两句——账上每个历史状态
     原文可查、现行版永远只有一条且改错了找得回（推演 1/2 全程）；
     页上每个论断能下钻到筑页的证据块原文（推演 3）
```

闸在哪：①**只追加闸**（revision 行 INSERT-only——抹账不可表达，路 1 判据）；②**同事务闸**（快照与主行更新原子——失败不留影子快照，历史可信的根）；③**乐观锁闸**（WHERE 版本号=期望值——撞号拒绝+失败恢复，路 4 判据）；④**并发快照幂等闸**（同版同内容放弃插入不算错——WeKnora 逐字）；⑤**真编辑闸**（六字段对比——版本号是真编辑信号，机器挂链零版本位，设计稿 65 注记位兑领）；⑥**同版守闸**（滚到现版按客户端错回——路 2 判据）；⑦**查无此版闸**（账上没有的滚不回——快照式查表即判）；⑧**内容字段闸**（回滚只拷六字段——目录搬家不撤，路 3 判据）；⑨**轻投影闸**（历史列表零正文列——多百 KB 快照不进列表传输）；⑩**证据回链闸**（页账本带证据块回链——论断可下钻到 chunk 原文，撤证随源删）；⑪**对照不混用闸**（版本表与 m16 生命周期两套账两种物——设计范围边界红线主判据）。拦完数据去哪：页主行只有一条现行版（版本号=真编辑次数+1），版本账上是全部被替代版的全文快照（零改写），diff 随每次 commit 返回值现算不落盘，回滚出的新状态也是账上一行；证据回链列指向来源文档的正文块集合（撤证注记位：源文档删除级联——设计稿 09/51 既有语义）；推演全程零新业务事实（页语料行全设计稿 44 备案字面，主角数据④⑤）。

### 走查推演 1（W-F52-1）：编辑两次——每版过账，错版留痕

```text
伪代码（时序推演，非代码——给定栏"编辑 Wiki 页两次"；主角①③④⑤）

t0 页到位：《N-2 井完井报告》页落库（设计稿 64 产出，设计稿 65 挂链后）——
   版本号 1，编辑来源=管线生成，证据块回链=来源文档正文块集合
t1 编辑一（小李修措辞）："要点回顾"节补一句说明 → commit（页号,
   编辑, 小李）：
   t② 真编辑判定——正文变了 ✓
   t③ 快照先行——v1 全文（管线版）装配成 revision 行
   t④ 同事务双写——插快照行（页号,版本 1）+ 页主行更新、版本号 2
   t⑥ 出账——Rev(版本 2, diff 投影=[+要点回顾补句一行])
t2 编辑二（小李手滑）：正文里"人工井底 2788 m"写成"2888 m" →
   commit → 同路：v2 快照入账、页到版本 3、
   Rev(版本 3, diff 投影=[~人工井底 2788 m→2888 m 一行])
t3 看账：历史列表（轻投影闸⑨——零正文列）倒序=版本 2（小李·用户
   来源）/版本 1（管线来源），现版号=3——两次编辑各落一版，
   每版带自己的署名（署名随版闸⑤）
可观察行为（W-F52-1 断言全句成立）："每次编辑落 revision+diff"=
   t1/t2 两版各落快照行+Rev 带 diff 投影（现算不落盘——漂移备案①
   的落位）；"历史只追加不可篡改"=账上 v1/v2 快照 INSERT-only 零
   改写路径，且错版 2888 也留痕在账（想抹账→捣乱路 1 只追加闸拦）
```

### 走查推演 2（W-F52-2）：一键滚回——2788 回归，可再滚回

```text
伪代码（时序推演，非代码——给定栏"回滚到上一版"；主角①③④⑤）

t0 发现错版：小李自查发现版本 3 把 2788 写成了 2888 →
   rollback(页号, 版本 2)
t1 守闸（主干二 t①）：目标 2 ≠ 现版 3 ✓ 放行（若点的是"回到当前
   版"→ 捣乱路 2 同版守闸拦）
t2 取快照（t②）：（页号, 版本 2）精确查表命中——v2 全文快照在场
t3 只拷内容字段（t③）：六字段自 v2 快照装进一次编辑；页所在的
   分组/排序/来源文档号/证据块回链保留现值（捣乱路 3 拦在结构里）
t4 过账（t④）：走 commit 同一条路——v3 错版先落快照（错版入账，
   不是被覆盖！）、页主行更新为 v2 内容（"人工井底 2788 m"回归）、
   版本号 4、编辑来源=回滚、编辑人=小李
t5 看账：历史列表现版号=4；账上 v1/v2/v3 三条快照全在——v3 的
   编辑来源=用户（小李），v4 的编辑来源=回滚——谁改的、哪次是
   回滚，账面自答
t6 可再滚回（机械保证）：若小李改主意认定 2888 才对——
   rollback(页号, 版本 3) 合法（t① 守闸：3≠4 ✓；t② v3 快照在账 ✓）
   ——账本只保证"每个状态找得回"，不裁决内容对错；每一次回滚
   本身又是一次 commit（版本号继续前进），历史永远只追加
可观察行为（W-F52-2 断言全句成立）："页面回到旧版"=t4 页主行
   内容=v2（2788 回归，推演 1 的错版被撤下但留痕在账）；"回滚本身也是
   一次 commit（可再滚回）"=t4 v3 快照入账+版本号 4+t6 再滚合法
   ——卡面注释"回滚也是一次 commit（历史不可篡改只追加）"逐拍兑现
```

### 走查推演 3（W-F52-3）：主任审计两问——查旧版+下钻证据

```text
伪代码（时序推演，非代码——给定栏"审计追问某论断出处"；主角②③⑤）

t0 主任汇报前打开《N-2 井完井报告》页，两问——
t1 问一"这页上周长什么样"：历史列表（主干一轻投影——版本号/标题/
   页型/摘要/编辑来源/编辑人/时间，零正文列）→ 点版本 2 →
   取单版读面按（库号,页号,版本 2）取出全文快照——上周正文
   原文逐字可查（不是摘要不是转述，是快照全文）
t2 问二"'人工井底 2788 m'这句哪来的"：页账本行读证据块回链列
   （来源文档正文块号集合——确定性可复算，list_chunk_meta 公开面）
   → get_chunks_by_ids 取块原文 → 设计稿 44 备案语料行"……N-2 井采用
   套管射孔完井，人工井底 2788 m……"字面在场——论断下钻到证据
   层原文，出处可答（verifiable 的"据"在 chunk，不在页）
t3 三层对答（主干三对照表读表法）：主任看到的是知识层（页，v4
   现行版）；论断的"据"在证据层（chunk，只增不改）；上周的样子
   在知识层自己的版本账（v2 快照）——三问三账各答各的，不混
t4 对照位（边界红线）：若这是语义资产（比如"人工井底"相关口径
   要改）——走的不是本节版本账，是 m16 变更包+五级 CI+负责人
   审批（对照表）；页编辑零审批位但有账后兜底（可查可滚回），
   两套账两种物（对照不混用闸⑪）
可观察行为（W-F52-3 断言全句成立）："页上论断回链证据 chunk"=
   t2 证据回链列→块原文下钻全程（备案语料行字面兑现）；"三层
   分离（证据/知识/服务）在案"=主干三对照表+t3 对答；"与 m16
   MR 纪律对照在案"=主干三对照表+t4——逐句兑现
```

## 关键判断的取舍记录

1. **快照式存版本，diff 是读时投影。** 备选"链式 diff——账上只存相邻两版的差异，读任意版从头回放"：否决——省的存储 WeKnora 用两层保留窗口就管住了（机器快照 50 条窗口/硬顶 200），链式却把"读 v1"变成"回放 N 次 diff"、把"任一 diff 损坏"变成"其后全链失效"；且回滚要的是整版内容（主干二 t③ 拷六字段），快照一次查表即得，回放式要先拼装。WeKnora 快照式逐字在案（"every historical version stays diffable and revertable"——diffable 靠快照在场）。落定：revision 行存全文快照，diff 不落盘、随 `Revisions.commit` 返回值现算（主干一 t⑥——漂移备案①的"diff"落位）。换边条件：单页正文体量大且版本数极多时，先抄 WeKnora 的保留窗口（取舍 2），仍不动快照式。
2. **只追加与保留窗口并存——不可篡改是"零改写路径"，保留是"存储边界"。** 备选"绝对只追加，账只进不出"：否决——热页每批入库都被管线重写，机器快照会按批淹没人的编辑（WeKnora 两层保留注释逐字在案："machine snapshots would otherwise crowd out the handful of human/agent edits this feature exists to protect"）；账的诚信在"已落内容零改写"，不在"永不释放存储"。落定：INSERT-only 写语义+按编辑来源分层的修剪窗口注记位（机器来源先出局、人的账活到硬顶——WeKnora 可修剪来源清单同款）；petro 设计演绎主干零 DELETE 表达式，窗口只在注记与取舍层在场。
3. **回滚=追加式实现，不设第二条写路径。** 备选"版本指针回拨——页主行不动，HEAD 指回旧版快照"：否决——指针回拨后"现行版"与"页主行"分离，所有读页方都要先解指针；且回滚不进账=回滚动作本身不可审计（谁几点滚回了什么，账上没有）。WeKnora 的翻译（回滚=内容为旧版的一次普通编辑）让回滚自动继承 commit 的全部纪律：同事务、乐观锁、真编辑判定、署名随版——revert 编辑来源就是回滚的审计签名。落定：`Revisions.rollback` 内部走 `self.commit`（主干二 t④）。对照不混用：设计稿 43 语义仓的"版本指针可回滚"是 Git 源侧的回拨（回拨管源、重载重建管影），与本节页侧追加式回滚是两族机制各管各的资产——同一句"可回滚"在两处账本上是两种实现。
4. **版本号只在真编辑时前进。** 备选"任何行写都 +1（最保守的变更计数）"：否决——机器挂链/同内容重入库/状态同步会让版本号狂涨，"版本 47"里 40 多次是格式修饰，版本号就不再是"改了内容"的信号（WeKnora 版本推进策略逐字："consumers can treat a bump as a real edit signal"）；且设计稿 65 已备案同款机制（机器挂链不动版本号）。落定：六字段真编辑判定守在 commit t②（本节兑领设计稿 65 取舍 5 注记位）；台账写照常落库零版本位。
5. **证据回链落页级，论断级认领是增强位。** 备选"一步到位做论断级回链——每条论断精确到块号"：WeKnora 精细半边在案（chunk-citation pass 逐批让模型认领"哪些块实质讨论了该实体"——verbatim 纪律引用块逐字），但那是一条 ingest 侧 LLM 管线；petro 设计演绎先落确定性半边——证据块回链=来源文档正文块集合（设计稿 64 拼回取材的同批块，`list_chunk_meta` 可复算，零新模型调用零新计费），页上每个论断至少能下钻到筑页原文集合。落定：页级回链进页账本行（主干三），论断级认领注记 verbatim 纪律不展开管线。换边条件：审计要求"逐句对块"时，引 WeKnora chunk-citation pass 形状做增强——改动收在页落库装配一步。
6. **乐观锁只判撞，不合并。** 备选"撞号后自动三方合并（base/ theirs / mine 归一）"：否决——设计范围明确不讲多人协同冲突合并（PRD F52 字面"单写者设计演绎"）；合并语义要有"哪些字段谁赢"的裁决表，单写者演绎里没有第二个真人是它的使用前提；WeKnora 同款——冲突就是错误返回（ErrWikiPageConflict），没有合并路径。落定：后到者带冲突信息重来（重读现版再改），快照幂等闸保证撞车时账不脏（主干一 t④ 注释）。附注：设计稿 61 变更区/设计稿 43 语义仓与本节三处"只追加账本"同构不同物——Action 记业务变更、语义仓记资产演进、本节记文档版本，资产不同账不同，互不代管。

## 锚点对照精要

**WeKnora 真源码（commit 33c0333，成稿前实测——本节引用主位）**：① `internal/types/wiki_page.go:310-315` 不可变快照注释（"one immutable snapshot of a superseded page version…The current version lives only in wiki_pages…inserted here as (page_id, V) inside the same transaction, so every historical version stays diffable and revertable"——主干一三条铁律的原话）+`:316-341` revision 表形状（（页号,版本号）唯一索引/Content 全文/EditSource/EditedAt 字段族）+`:240-247` 证据块回链注释（"records the specific source-document chunks this page was built from…Use this when you need to surface the underlying evidence for a wiki page, or to retract citations when a source document is deleted"——主干三回链列与撤证的原话）+`:254-259` 版本号语义+`:260-263` 署名随版+`:284-296` 编辑来源四值（pipeline/agent/user/revert——回滚有自己的署名档）+`:343-360` 两层保留（注释"two-tiered…machine snapshots would otherwise crowd out the handful of human/agent edits"+`WikiMaxRevisionsPerPage=50`/`WikiMaxRevisionsHardCap=200`/可修剪来源清单——取舍 2 的原话）；② `internal/application/repository/wiki_page.go:111-115` 同事务注释（"a failed update can no longer leave behind a snapshot of a version that is still current, which would show up twice in the history and be un-revertable"——同事务闸的原话）+`:121-123` 并发快照幂等（"its copy is identical, so leaving it alone is correct"）+`:135-137` 失败版本号恢复+`:139-144` 乐观锁比较写（`Where("id = ? AND version = ?", expectedVersion)`）+`:171-180` 零行命中→查无此页或版本冲突+`:184-187` 轻投影列清单（"every column except the potentially multi-hundred-KB content body"）+`:189-211` ListRevisions（"newest-first, content omitted"+Order version DESC）+`:213-227` GetRevision 取单版全文+`:229-253` 修剪实现+`:255-258` 删页连带删快照（软删页快照成死重——注记位）+`:268-273` 机器挂链不动版本（设计稿 65 注记位的仓库侧同款）；③ `internal/application/service/wiki_page.go:111-120` 版本推进策略（"the `version` column is intended to track the user-visible content revision, not every row rewrite…consumers can treat a bump as a real edit signal"——真编辑闸的原话）+`:130-141` 真编辑判定与快照先行（"Keep an unmutated copy of the version being replaced: it becomes the revision snapshot"）+`:174-176` 原子快照注释（"so the content of every past version is preserved and a failed update leaves no snapshot behind"）+`:233-236` 署名随版注释（"EditSource on the snapshot is the author of THAT version…not whoever is performing the write that supersedes it"）+`:258-261` 修剪窗口语义+`:277-280` 滚到现版是客户端错（"a client-side mistake (usually a stale history list), not a server fault, so handlers map it to 400"）+`:282-300` 历史列表带现版号+`:313-342` 回滚主干（"applying that revision's content fields as a regular edit: the pre-revert state is snapshotted, version advances…a revert is about content, not about undoing directory moves"+守闸+六字段拷贝+`UpdatePage(WithWikiEditSource(ctx, "revert"))`）；④ `internal/handler/wiki_page.go:622-627/:639` 回滚端点注释与路由（"Applied as a regular edit: the pre-revert state is snapshotted and the version advances"——主干二 epigraph）；⑤ `internal/agent/prompts_wiki.go:251-258` 引用认领 verbatim 纪律（"This keeps per-slug 'facts' in their verbatim form (the chunk text) instead of asking the LLM to paraphrase"——主干三精细半边注记的原话）。**WeKnora 源码地图**：§5.1"wiki 页面版本存主库（`repository/wiki_page.go`，gorm）"（零行号零漂移——漂移备案②）；§5.2 知识更新条目"证据层/知识层/服务层三层分离"与书侧对号。**调研报告**：Wiki 模式条目"支持人工编辑、版本历史与一键回滚"（设计稿 64 已备案同句——本节机制兑现位）。
**书第三章（本节首引 ：511/:520）**：`:511` 把知识库当代码库——"把知识库当成代码库，把每次知识变更当成一个 Pull Request（PR）……获得差异审查、版本历史、责任追溯和一键回滚能力。生产环境不应让任何一个模型绕过审核，直接改主分支或线上向量库"（正文短引——版本账+回滚=该纪律的最小兑现面；前置审纪律=与 WeKnora 现状的对照注记位）；`:513` 提议者—审核者双角色（Proposer-Reviewer——对照注记位，设计范围"梳理范围"字面）；`:520` 三层分离——"原始证据层保存只增不改的对话、轨迹和原始文档；知识层保存经过提炼、可持续修订的 Markdown 或代码；服务层保存从特定已合入版本生成的检索索引"（三层对照表底座，逐层注 petro 落位）。双仓域（本体，无文档版本账语义）与交互层域本节零引用，如实声明。
**CONTEXT.md 词条（版本 4 增补术语，零新增）**：①"Wiki 管线"——"报告→拼回全文→LLM 重写 Markdown 页→自动交叉链接→**版本回滚**；重写≠检索"——本设计稿是该词条末环"版本回滚"的机制展开，词条就此全链兑现；②"chunk 契约"（四管线吃同一份块账——证据回链的下钻终点在块账上）；③"断言观（is/ought/means）"（页是 is-记录的知识层可修订表达、chunk 是证据层只增不改、语义资产是 ought/means 归 m16 门禁——三层分离与对照不混用的词条底座）；④"治理本体仓"（"进仓必过 MR+语义 CI"——对照表的 m16/m43 侧词条）。
**PRD F52（docs/prd.md）**："做什么"逐条对齐——编辑落 revision（版本历史+diff）+一键回滚（主干一/二）、知识层/证据层分离成文（页=知识层、chunk=证据层、页上论断可回链证据块——主干三回链列+推演 3）、与 m16 生命周期/MR 纪律对照——文档知识的"PR 思想"（Proposer-Reviewer 双角色在文档知识上的形态——主干三对照表+:511/:513 注记）；"不做什么"对齐——不做多人协同编辑冲突合并（单写者设计演绎——取舍 6）；信源锚点（WeKnora wiki 页面版本存主库 repository/wiki_page.go+书 §知识更新三层分离/增量=PR）实测兑现；业务逻辑要点（"小李改 Wiki 页改错了→一键滚回"=推演 2 全程；"审计问'这页上周长什么样'→revision 可查"=推演 3 t1 逐拍字面）。
**模块卡 m27/m3（签名唯一来源+兑现位）**：卡 m27 `Revisions.commit(page_id, edit, author) -> Rev` 与 `Revisions.rollback(page_id, rev) -> None` 双签名逐字（主干一/二块首）、卡面注释两句即两函数合同（"编辑落 revision+diff；一键回滚 rollback(page_id, rev)"/"回滚也是一次 commit（历史不可篡改只追加）"——推演 2 t6 逐拍兑现后半句）、目录 `app/wiki/revisions.py`（本节文件落点；W-F52-1 走查栏字面）、依赖行"m3（页面与版本落库）"（页账本行与 revision 表的落库落点——落库动作设计稿 64 起既有，账本机制本节交付）、依赖行"m14（读 chunk 公开面，不回写索引）"（证据下钻只读位——零索引写）、Seam 行"版本表与 m16 生命周期纪律对照（PR 思想）但不同管"（主干三对照表的卡面字面）、Adapter FakeWiki"固定页与**双版本**"（本节兑现"双版本"三字）；卡 m3 只读面 `Repository.get_chunks_by_ids/list_chunk_meta`（证据下钻与回链复算，设计稿 10/64 同款调用零新增）。边界规则行（版本 4 增补）："m27 Wiki 管线写 m14 索引…投影方向单向：chunk→页"（本节零索引写位——版本账与证据回链全在 m3 页面侧，零 m14 表达式）。
**设计稿 64/65/46/44/61/43（只消费不改动）**：设计稿 64（页产物=账本的户头/页落库动作既有/"重写≠检索"与三层分离同族论证——两层账两种义务）；设计稿 65（机器挂链不动版本号注记位=本节真编辑闸兑领/挂链路在回滚后照走——格式修饰零版本位）；设计稿 46（批与扇出语义零重讲——版本账在页落库之后不碰扇出位）；设计稿 44（父子分块块行族=证据层的落账形状/备案语料行=推演证据原文）；设计稿 61（变更区只追加同族辨析——取舍 6 附注）；设计稿 43（版本指针回拨=对照侧——取舍 3 两族机制分界）。
**设定书（取材锚——业务事实零新增）**：§1（角色卡"质量管理员｜地质研究所（小李兼）"——消费主角锚；主任=汇报人 CONTEXT.md 角色表字面——审计追问主角锚）；附录 A.1（N-02/渤中28-1-N2——页主角与语料行的字面来源）；§3（is/ought 域分界的业务底座——报告库记 is、语义层管 ought/means，对照表的域分界）；§2/§4/§5/§6/§7/§8/附录 A 其余零新引。版本 4 业务事实零新增——错版数值"2888 m"/编辑时间/版本条数=走查注入替身（主角数据④⑤声明）。
**walkthroughs F52（验收合同）**：W-F52-1（给定"编辑 Wiki 页两次"/走查"`app/wiki/revisions.py:Revisions.commit`"/期望"每次编辑落 revision+diff；历史只追加不可篡改"=主干一 t①–t⑥+推演 1 合同原文——逐句兑现，diff 落位照漂移备案①）；W-F52-2（给定"回滚到上一版"/走查"`Revisions.rollback`"/期望"页面回到旧版；回滚本身也是一次 commit（可再滚回）"=主干二 t①–t④+推演 2 合同原文——逐句兑现）；W-F52-3（给定"审计追问某论断出处"/走查"知识层/证据层分离"/期望"页上论断回链证据 chunk；三层分离（证据/知识/服务）与 m16 MR 纪律对照在案"=主干三对照表+回链列+推演 3 合同原文——逐句兑现）——三条断言全句兑现，幽灵断言 0。

## 越界自查（源：modules.md 边界规则表）

- **设计范围边界红线"版本表与 m16 生命周期不同管（对照不混用）"**：主干三对照表六维在案——语义资产走变更包+五级 CI+负责人审批（设计稿 38/43 交付物，本节零引用其签名零改动其设计稿），文档页走版本账（本节交付）；两套账两种物，语义资产变更包不进版本账、页编辑不经五级 CI；设计稿 43 指针回拨/设计稿 61 变更区与本节账本同构不同物（取舍 3/6 附注辨析）。
- **m27 Wiki 管线写 m14 索引（投影方向单向 chunk→页）（版本 4 增补行）**：本节全稿零 m14 写表达式——版本账、证据回链、diff 投影全在 m3 页面侧与版本账表；读 m14 面零次（证据下钻走 m3 块元数据只读面 `get_chunks_by_ids`，设计稿 10/64 同款）；回滚后的挂链联动走设计稿 65 既有挂链路（零新挂接）。
- **图谱/Wiki 后处理绕过 m22 分发枢纽自行挂接入库管线（扇出唯一出口=PostProcess.dispatch）（版本 4 增补行）**：本节零新挂接——版本账在页落库之后（设计稿 64 交付位之后），触发位是页编辑/回滚的人工与管线操作，不入库管线扇出。
- **m2 唯一出口（既有行）**：本节**零模型调用**——版本账是确定性机制（快照/事务/乐观锁/diff 现算全是代码账），经网关零次，如实声明；与设计稿 64/65 的模型半程（重写/导语）成对照。
- **明确不讲的零出现自查**：多人协同冲突合并零展开（设计范围字面——乐观锁只判撞不合并，取舍 6）；语义资产治理链细节零展开（设计稿 38/43 地盘——只对照）；前置审核流零展开（对照注记位——:511 纪律短引即止）；引用认领 pass 管线零展开（verbatim 纪律引用块在案，论断级认领是换边条件）；删页连带清理零展开（注记位）；文档删除级联零展开（设计稿 09/51 既有语义注记位）。
- **签名纪律**：全稿公开签名两件且零自造——`Revisions.commit(page_id, edit, author) -> Rev` 与 `Revisions.rollback(page_id, rev) -> None`（卡 m27 本节双签名）+消费既有三件零新增：`WikiWriter.write(full_text, kb) -> WikiPage`（卡 m27 设计稿 64 既有）、`Repository.get_chunks_by_ids(ids) -> list[ChunkMeta]`/`Repository.list_chunk_meta(doc_id) -> list[ChunkMeta]`（卡 m3 既有）。`_按页号取页行/_只刷台账/_装配快照/_同事务双写/_diff_行级/_按版本号取快照/_内容字段自快照/真编辑判定/回滚四步`（模块内私有件与内联判断——WeKnora GetBySlug/UpdateMeta/revisionFromPage/UpdateWithRevision/diffable 现算/GetRevision/RevertPageToVersion 字段拷贝设计演绎对应，头部声明与锚点对照备案，非公开签名发明）；`页账本行/revision 行/Rev/三层对照表/m16 对照表/四路推演/推演三则`（数据形状与走查叙述件逐项声明）。框架红线"无新增"履行（零新替身零新 Adapter——FakeWiki"固定页与双版本"卡面既有）。
- **取材锁自查**：全稿业务事实仅三类且全为既有——角色（§1 小李字面+CONTEXT.md 主任/小李角色表）、页与语料行（A.1+设计稿 44/64/65 备案字面）、域分界（§3 报告库记 is/语义层管 ought/means——对照表的域底座）；错版数值/编辑动作/版本条数=替身（主角数据④⑤声明）；技术口径（WeKnora 八处引用块、卡面注释、书 :511/:513/:520、源码地图一句、调研报告一句）全部注锚（成稿前实测核对——漂移备案①卡面"revision+diff"与 WeKnora 快照式的落位差异如实备案不硬凑；漂移备案②源码地图零行号零漂移；相关域零引用如实声明）。
- **架构大图同步**：diagrams/petro-agent.html 按设计范围图节点范围推进——**C27 增 1 节点** wiki_revision（🛡️ 版本历史与一键回滚：真编辑先给被替代版落一条只追加的版本快照再更新页、版本号加一——改错的旧版留痕在账零改写，撞版本号拒绝不静默覆盖；一键回滚把旧版内容当一次新编辑过账——回滚自己也进账可再滚回；页上论断带证据块回链可下钻到分块原文，历史列表零正文多百 KB 快照不进传输（设计稿 66））+**零新增边**（设计范围未声明边——设计稿 58/60/62/63/65 先例：实测既有 179 条边 0–178=64 实线+115 虚线，设计稿 65 落账一致零漂移）；linkStyle 最大 101 零触碰；节点明细表增 1 行（wiki_revision——插 wiki_linkify 行后与图序一致）；防护清单表增 1 行（设计稿 66｜wiki_revision——🛡️ 语义"防改错丢底与历史篡改（真编辑先落快照再更新页，改坏的历史上找得回，版本账只追加零改写）+防论断无据可查（页带证据块回链可下钻到分块原文）"为本节新登记，设计稿 64/65 盾行先例：本节边界红线"对照不混用"是账本分界纪律无运行时盾形，节点盾行按节点自身防语义登记）；既有节点/边/表行/图头部计数文字（历史陈货）零改动；编辑用唯一锚点定点插入三处（容器内节点行/节点明细表/防护清单表），零批量正则；标签全角引号零裸引号校验零失衡；图上零文件名/零函数名/零端口/零路由。
- **零代码红线**：全文代码块均标注"伪代码"；无 tests/、无 CI 内容；SQL 仅一处 PostgreSQL 方言设计演绎（历史列表轻投影 SELECT 列清单——注释标设计演绎，对应 WeKnora 轻投影逐字引用块）；零服务端搭建。
