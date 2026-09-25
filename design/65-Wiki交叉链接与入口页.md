# 设计稿 65：Wiki 交叉链接与入口页

> **红线声明**：本设计稿零真实可运行代码。全部代码块均为**伪代码**（块首标注"伪代码 — 文件:函数"或"伪代码（数据形状声明，非代码）"或"伪代码（对照声明，非代码）"或"伪代码（时序推演，非代码）"）——例外仅 WeKnora 生产代码**原注释/原模板/原查询投影引用块**（逐字照抄英文注释与 Go/模板原文，块首注文件行号与 commit 号，解释全在正文不混进引用块；块内"…"为行省略号，省略行不参与断言）。公开签名取自模块卡逐字：`Linkify.link(page, registry) -> LinkedPage`（卡 `m27`——本节唯一新签名，卡面注释三件事"实体词→站内链接；提示词明确要求'像 Wikipedia 一样建链接'；入口页=目录+最近更新"即本函数与入口页的合同）；消费既有签名零新增：`WikiWriter.write(full_text, kb) -> WikiPage`（卡 `m27`——设计稿 64 既有，产出的页是本节输入，零重讲）；`Gateway.chat(messages, model_alias, stream=False, tools=None) -> ChatResult | TokenStream`（卡 `m2`——入口页导语生成与标注路经网关既有面，零直连模型 API）。**框架红线：无新增**（设计范围声明——替身沿卡 `m27` FakeWiki（固定页与双版本）既有形状，零新替身零新 Adapter）。**深度分档落点**：本节全机制档，主干伪代码到函数级——主干一标注路（提示词明确要求半程五步）、主干二规则路（`Linkify.link` t①–t⑤ 逐步+注册表建表+禁改区四类）、主干三入口页（形状四件+生成两路+对照表），每步落"输入输出契约+主干判断"（设计范围前三条字面）。
> **接线边界（对既有设计只消费不重讲——边界红线"链接注册表自包含；不引站外链接"）**：对设计稿 64 **只消费页产物不重讲**——拼回/截断/重写/出页全程是设计稿 64 交付物（其头部声明字面"交叉链接与入口页是下游地盘，上游产出止于'一页结构化 Markdown'"），本节从"页已产出"接棒；设计稿 64 留的两处锚点本节兑领——WikiSummaryPrompt 的 wiki-link 规则行（设计稿 64"只注下游地盘、不解读"）与"页的检索入口是入口页与交叉链接（本节）"的承诺位（四管线吃法对照表读表法字面）。对设计稿 66 **零触碰**——版本历史/一键回滚/知识层证据层分离是设计稿 66 地盘，`Revisions.commit`/`Revisions.rollback` 双签名零引用；机器挂链不动版本号只有一处注记（取舍 5——WeKnora 同款机制在案，版本账本机制设计稿 66 成文）。实体页/概念页抽取**注记位零展开**（设计稿 64 预留"WeKnora `WikiKnowledgeExtractPrompt`——交叉链接的对端产物，设计稿 65 注记位"）：注册表条目"从哪来"一句话注记（站内页的标题与别名——实体页是别名的主要产地），抽取机制本身（两路抽取/slug 连续性规则）不在本节伪代码梳理范围，零展开。死链清理**注记位零展开**（WeKnora 与挂链同车道联动——`wiki_ingest_batch.go:1081-1082` 先清死链后挂新链；设计范围未列，只注联动位）。对 m1/m7 **零触碰**——交叉链接与入口页是离线投影管线的收尾段，不入问答/问数在线链路。
> **行号与信源核对声明（WeKnora 信源纪律）**：本设计稿所引 WeKnora 源码均经真源码实测核对——`git clone --depth 1` 于 commit `33c0333`，`internal/application/service/wiki_linkify.go`（:10-14 `linkRef` 注释、:16-19 `span` 禁改区注释、:25-34 `linkifyContent` 合同注释、:35 函数体、:40-41 长名优先注释、:50-55 单汉字不挂注释、:92-95 安全命中判据注释、:153-156 CJK 词边界注释、:207-218 禁改区清单注释）逐行过目；`internal/application/service/wiki_ingest.go`（:1794-1813 `injectCrossLinks` 注释块——:1796 "Pure text replacement, no LLM call."、:1806-1811 规模账与长尾取舍、:1814 函数体、:1838-1840 入口页跳过、:1859 挂链调用、:1876-1878 `collectLinkRefs` 注释与函数体、:2063-2081 `rebuildIndexPage` 目录史注释、:2083-2090 `indexIntroSummaryCap=200`、:2092-2103 生成两路注释、:2160 "showing %d most recent" 诚实框架行）；`internal/application/service/wiki_slug_handles.go`（:5-19 低熵把手注释、:25 `NewHandleTable("ref-", 0, 1)`、:41-44/:58-61 编解码注释）；`internal/application/service/wiki_page.go`（:426-433 `GetIndex` 默认页兜底、:443-447 目录页型清单、:451-456 `GetIndexView` 注释、:1848-1851 人工编辑路同款挂链注释、:1894-1906 目录出正文的废弃史、:206-209 机器挂链不动版本号注释）；`internal/application/repository/wiki_page.go`（:1002-1010 最近更新注释、:1027 `Select("slug", "title", "summary")` 轻投影、:1030 `Order("updated_at DESC")`）；`internal/application/service/wiki_ingest_batch.go`（:1069-1082 批收尾次序——先重建入口页导语、再清死链、后挂新链）；`internal/agent/prompts_wiki.go`（:60 `WikiSummaryPrompt`、:77 wiki-link 规则行、:406-419 `WikiIndexIntroPrompt` 及其"只写导语不写目录"行、:422-445 `WikiIndexIntroUpdatePrompt`）；`internal/types/wiki_page.go`（:761-764 目录条目轻投影注释、:787-791 目录响应注释）。**漂移备案①**：PRD 引号字样"像 Wikipedia 一样建链接"——书 `原书第三章:501` 实测字面为"正确的做法是把知识库组织得像 Wikipedia：每个条目在提及其他条目时都以链接指向它，再辅以入口页与索引页，让 Agent 能顺着链接从一个概念走到相关概念"；WeKnora 源码地图（§5.2）转述为"必须像 Wikipedia 建链接且写入提示词要明确要求"——PRD 引号是书纪律句的压缩转述，纪律内容（条目互链+入口页索引页+写入提示词明确要求）三方全对号，照勘误先例实测核对+日志备案，不硬凑。**漂移备案②**：源码地图 §5.1 对本节两文件只列名不给行号（"配套：`wiki_linkify.go`（交叉链接）、`wiki_slug_handles.go`"）——零行号零漂移，条目归属与实测一致；设计范围/断言/PRD/卡面四方零冲突（W-F51-1 走查栏 `app/wiki/linkify.py:Linkify.link` 与卡 m27 签名一致；W-F51-2"目录+最近更新"与卡面注释一致）。**调研报告**（WeKnora 调研报告）实测：§1.1"Agent 从原始文档自治生成**相互链接**的 Markdown 知识库…支持人工编辑、版本历史与一键回滚"（设计稿 64 已备案同句——"相互链接"三字是本节的调研口径位）；§4.2"Wiki 图谱可视化…是 Wiki 页面链接图，后者（Neo4j GraphRAG）是实体关系图"——交叉链接的图≠图谱投影，注记位。**原书第三章**（书源）实测：`:497` L0/L1/L2 三层按需加载（L0 摘要约 100 tokens 判断相关性/L1 概览约 2,000 tokens 供规划决策/L2 全文按需加载——"摘要常驻、按需取全文"）；`:501` 建链接纪律（**本节首引**，漂移备案①全文）。
> **明确不讲的**（设计范围末条字面"明确不讲的：人工审核流"+PRD F51"不做什么"）：人工审核流（PRD 字面"链接不做人工审核流（自动生成+可人工编辑）"——挂链全自动零人审；"可人工编辑"的编辑动作落页面编辑与版本账，归设计稿 66，本节零展开）；站外链接（设计范围边界红线"不引站外链接"——注册表自包含的镜像面，零出现）；版本历史与一键回滚（设计稿 66——只注"机器挂链不动版本号"衔接位）；实体页/概念页抽取机制（注记位——见接线边界）；死链清理机制（WeKnora 同车道联动注记位——设计范围未列）；多文档**内容**聚合（入口页是多文档的**导航**聚合——目录+列表零综合；PRD F50"不做多文档聚合（入口页是 F51 的事）"的分界：内容级跨文档综合零出现，F51 的入口页只有"有哪些页、最近动了哪些"）；Wiki 图谱可视化（调研报告 §4.2 注记位——设计稿 54 对照已备案，零展开）。

## 实现清单

- [x] 实体词自动链接+提示词纪律在案（源：W-F51-1）✅ **主干一**（标注路五步——注册表快照进提示词+低熵把手过桥+wiki-link 规则行逐字+经网关+解码回真页号）+ **主干二**（`Linkify.link` t①–t⑤——注册表建表/长名优先/禁改区/逐条挂链/出 LinkedPage）+ **走查推演 1**（报告页两路挂链全程——"渤中28-1-N2"全名先挂、别名 N-2 补挂、一页一名只挂一处）+ **捣乱路 1/2/3**
- [x] 入口页目录+最近更新；L0/L1/L2 对照在案（源：W-F51-2）✅ **主干三**（入口页形状四件——默认页兜底/目录轻投影三列/最近更新窗口/导语生成两路）+ **L0/L1/L2 对照表**（入口页三层=书的文件系统范式油田版）+ **走查推演 2**（小李打开报告库入口页全程）+ **捣乱路 4**
- [x] linkify 两路（源：设计范围"规则匹配（井号正则）vs LLM 标注"）✅ **主干一=LLM 标注路**（生成时，提示词明确要求——书纪律的提示词落位）+ **主干二=规则匹配路**（生成后，纯文本替换零模型调用——井号写法变体认领〔A.1 旧写法并存字面〕+注册表标题别名全名匹配）
- [x] 入口页生成形状（源：设计范围）✅ **主干三**（形状声明+生成两路——首生截顶喂摘要+诚实框架行，增量只吃变更描述）
- [x] WeKnora 对照：wiki_linkify.go/wiki_slug_handles.go（源：设计范围/WeKnora）✅ **引用块九处逐字**（linkifyContent 合同/禁改区 span/长名优先/单汉字/词边界/批收尾规模账/低熵把手/目录史/轻投影）+ **锚点对照精要**（行号实测，漂移备案①②）
- [x] 书 §OpenViking 纪律（源：PRD What to build"书 §OpenViking 纪律原文"）✅ **:501 建链接纪律正文短引+引用块**（条目互链+入口页索引页——漂移备案①）+ **:497 L0/L1/L2**（对照表底座）
- [x] 大图推进：C27 增节点交叉链接+入口页（源：设计范围图节点范围）✅ **越界自查·架构大图同步**（C27 增 1 节点 wiki_linkify+零新增边——设计范围未声明边，设计稿 58/60/62/63 先例；实测既有 179 条边 0–178 零漂移）
- [x] 越界引用为零（源：边界规则表）✅ **越界自查**

---

## 走查：从输入到验收行为

> **主角数据**（业务真数据样子——本节不新造业务事实，页样张/注册表行/角色全为既有行或替身声明见④⑤）：
> ① **消费主角**：**小李**（地质工程师，问答 Agent 主要用户——CONTEXT.md 角色表；设定书 §1 角色卡"质量管理员｜地质研究所（小李兼）"字面）——她读页的方式变了：设计稿 64 给她"一页读完一篇报告"，本节给她"从一篇顺链接走到下一篇"——读到"N-2 井的受效注水井"想深究时，点过去就是那口井的卡页，不再回检索框。
> ② **页主角（挂链对象）**：《N-2 井完井报告》Wiki 页（设计稿 64 推演 3 产出的同族替身——正文含设计稿 44 备案语料行"……N-2 井采用套管射孔完井，人工井底 2788 m……"与井名"渤中28-1-N2"，页上还有一段伪代码示例块与一张参数表——示例块是捣乱路 2 的靶子，替身声明见⑤）。
> ③ **注册表主角（链接的去处）**：报告库链接注册表替身行（全部 A.1 字面）——井卡页（标题"渤中28-1-N2"，别名 N-02/N-2/N2——well_id `N-02` 与"旧写法 N2/N-2 并存"字面）、区块页（标题"渤南"——block_name 字面）、油田页（标题"渤海油田"——field_name 字面）。注册表条目"从哪来"注记位：站内页的标题与别名——实体页是别名的主要产地（WeKnora `WikiKnowledgeExtractPrompt` 对端产物，设计稿 64 预留注记位，抽取机制零展开）。
> ④ **入口页主角**：报告库入口页样张（替身声明）——导语一段（"本库收录完井报告……"替身措辞）+目录（按页型分组：报告摘要页/井卡页/区块页——条目=页号+标题+一句话摘要）+最近更新列表（今天刚重写完的报告页在最上——设计稿 64 产物在最前的语义）。**业务事实零新增**：井名/别名/区块/油田全引 A.1 与设计稿 44/64 备案，本节零新造。
> ⑤ **替身口径**：页上伪代码示例块/参数表措辞=替身（设计稿 64 页样张同族）；"批"=同一次入库扇出产出的页集合（设计稿 46 扇出语义沿用）；机制真实，样张与数字为替身。**主角数据对照断言给定栏**：W-F51-1 给定"Wiki 页含实体词（井号/区块名）"=主角②页上的"渤中28-1-N2/N-2"（井号）与"渤南"（区块名）；W-F51-2 给定"知识库浏览"=主角①小李打开主角④。
> **地图先行**（Wiki 管线三站是设计稿 64 的图，本节在站二之后加"站二半"与"站四"——页内挂链接与库门口的入口页，后续主干引用不重画）：

```text
伪代码（Wiki 管线总览——交叉链接与入口页的两处落位，非代码）

入库半程与拼回/重写两站（既有面，零重讲——设计稿 46 扇出、设计稿 64 站一站二）
  报告 → dispatch 扇出（设计稿 46）→ 拼回重建 → 经网关重写出页（设计稿 64）
            → 页落库（m3 页面落库——卡 m27 依赖行字面）
── 本节两处落位（C27 同容器）─────────────────────────────────
  落位一 页内挂链接（交叉链接，两路先后接力——本节主干一/二）
    路 A 标注路（生成时）：页生成工单的提示词里就带着注册表快照，
        模型按"像 Wikipedia 一样建链接"的明确要求把实体词直接写成
        [[页号|显示名]]——模型管"该不该链"的语义判断        主干一
    路 B 规则路（生成后）：Linkify.link 对成页做一遍纯文本替换，
        注册表里漏网的表达式（别名/写法变体）补挂——规则管
        "挂得对不对"的格式确定性，零模型调用                主干二
  落位二 库门口的入口页（每知识库一个，本节主干三）
    导语（首生截顶/增量只吃变更描述）+目录（轻投影三列分组）
    +最近更新（按更新时间倒序的窗口）
一句话：链接与入口页回答的是"页怎么被找到"——Wiki 页不在检索索引里
       （设计稿 64 单向投影闸），导航就是它唯一的被找到之路（书 :501：
       "再辅以入口页与索引页"，设计稿 65 兑现这半句）
```

### 主干一：路 A 标注路——提示词明确要求"像 Wikipedia 一样建链接"（W-F51-1 的提示词半边）

设计稿 64 引用 WikiSummaryPrompt 时，wiki-link 规则行只注锚不解读——本节兑领。WeKnora 原文（引用主位——逐字；`internal/agent/prompts_wiki.go:77`，commit 33c0333 实测；行在 `WikiSummaryPrompt` 模板 `<instructions>` 段内）：

```text
5. **Wiki-link rule**: The available_wiki_pages list above maps slugs to display names and their aliases (format: "[[slug]] = display name (Aliases: a, b)"). Whenever you mention a name or alias that matches a listed entry, you MUST write it as [[slug|display name]] (e.g. [[entity/zhong-guo|中国]]), NOT as bold (**name**) or bare [[slug]]. Use the EXACT slugs provided — do NOT invent new slugs.
```

正文解释：这条规则行就是 PRD F51 那句"且**写入提示词时明确要求**——书的原话纪律"的机制位：建链接不是事后补救，是**生成那一刻的硬性输出格式**——三处"明确"都在字面里（MUST 写成 `[[slug|显示名]]`、NOT 加粗、NOT 裸页号；Use the EXACT slugs provided——不许发明页号）。喂给模型的 `available_wiki_pages` 就是注册表快照（主角③的行族：页号=显示名=别名清单）。但直接把真页号喂进去有个坑：页号若带高熵串（WeKnora 摘要页页号形如 `summary/<知识库ID>`），模型抄写时容易抄错一位十六进制——WeKnora 的对策是不让高熵页号进提示词，过一道低熵把手桥（引用块逐字，`internal/application/service/wiki_slug_handles.go:5-11`，commit 33c0333 实测）：

```text
// wikiSlugHandles maps real wiki slugs to short, low-entropy model handles
// (ref-1, ref-2, …) so the ingest editor LLM never has to reproduce a
// high-entropy slug verbatim — most importantly the UUID-based summary slugs
// (summary/<knowledgeID>) that models routinely mangle by inserting or
// dropping hex digits. The model copies the tiny handle; we translate handles
// back to real slugs on output.
//
// This is the generation-stage counterpart to wiki_write_page's slug
// validation: rather than repairing a mangled slug after the fact, it removes
// the opportunity to mangle at the source. …
```

正文解释（续）："在源头取消抄错的机会"——这句是本节与设计稿 33（引用别名 cN fail-closed 展开）同族的第三处实例：**模型经手的标识符越短越老实**。把手表是请求内私有的（`NewHandleTable("ref-", 0, 1)`——:25 实测），出页后把手解码回真页号，模型没见过的真页号就抄不错。petro 侧照搬这套过桥，落成标注路五步：

```text
伪代码 — app/wiki/linkify.py:模块内标注路 _annotate_route（私有件——WeKnora prompts_wiki.go:77
         规则行 + wiki_slug_handles.go 设计演绎对应，非卡面公开签名，头部声明备案；
         落位=页生成工单内、WikiWriter 装配提示词的一步——设计稿 64 t③ 的本节解读）

标注路（生成时半程，与设计稿 64 主干三 t③/t④ 合流）：
  ① 取注册表快照：站内非系统页的（页号, 标题, 别名清单）收成喂词条列
     （入口页自身不入列——它没有"被链接"的正文语义，WeKnora collectLinkRefs
     同款排除，锚点对照 3；快照=主角③行族）
  ② 低熵把手编码：真页号 → ref-1、ref-2…（WeKnora wikiSlugHandles 同构——
     高熵页号不进提示词，抄错机会在源头取消）；喂词条列里的页号全部换把手
  ③ 装配提示词：wiki-link 规则行进模板（引用块逐字——"你提到列内名字或
     别名时必须写成 [[页号|显示名]]，用给定的页号，不许发明"）+
     available_wiki_pages=把手表后的词条列 + 语言=中文（设计稿 64 既有语言位）
  ④ 经网关生成（m2 唯一出口——Gateway.chat 卡面签名逐字；设计稿 64 t④ 同款
     调用，本节零新增网关能力）：模型写到页内实体词时按规则行自标
     [[ref-3|渤中28-1-N2]]
  ⑤ 解码回真页号：出页把 [[ref-3|…]] 换回 [[井卡页号|…]]（WeKnora
     decodeContent 同构——"没映射的把手原样放行，走后续死链清理"；
     petro 演绎：没映射的自造标记在规则路被禁改区外零登记——捣乱路 1）
  合同：模型管语义判断（这个词是不是在说那页）——规则行只约束格式，
  "渤中28-1"在这句里指井还是指区块，模型按上下文选页号
```

### 主干二：路 B 规则路——Linkify.link 纯文本替换（W-F51-1 的规则半边）

WeKnora 原注释（引用主位——逐字；`internal/application/service/wiki_linkify.go:25-34`，commit 33c0333 实测）：

```text
// linkifyContent injects [[slug|matchText]] cross-links into content for each
// ref, skipping occurrences that fall inside code or existing links and
// requiring word boundaries for ASCII-letter matchTexts.
//
// For every ref, at most the FIRST eligible occurrence is wrapped. Refs that
// are already linked to their slug (either [[slug]] or [[slug|...]]) are
// skipped entirely. Refs pointing at selfSlug are skipped.
//
// Returns the possibly-updated content and a bool indicating whether any
// change was made. The input ref slice is not mutated.
```

```text
伪代码 — app/wiki/linkify.py:Linkify.link（m27；签名按卡逐字：
         Linkify.link(page, registry) -> LinkedPage；
         卡面注释"实体词→站内链接；提示词明确要求'像 Wikipedia 一样建链接'；入口页=目录+最近更新"
         是本函数合同——前半句在本主干（标注路的提示词半边见主干一），后半句见主干三）

def link(self, page, registry) -> LinkedPage:
    # t① 建候选条目表（注册表自包含——设计范围边界红线字面：候选只来自入参
    #   registry，函数内零扫库零站外取数；WeKnora collectLinkRefs 同构：
    #   非系统页的标题+别名各成一条（页号, 匹配词）——主角③；
    #   井号写法变体走别名行认领：注册表井卡页别名 {N-02, N-2, N2}
    #   =A.1"旧写法 N2/N-2 并存"字面——"井号正则"的设计落位是
    #   把页内 N-××写法先归一成候选表达式再查表，正则只认写法不猜目标，
    #   目标永远以注册表命中为准——正则命中注册表外=零链接，不发明）
    # t② 长名优先排序：匹配词按字符数降序（WeKnora 同款注释逐字——
    #   "sorted by matchText length … so longer names win over their
    #   substrings"，:40-41 实测）——"渤中28-1-N2"（8 字）排在
    #   "渤中28-1"（6 字，若在册）前面，全名先认领，子串进不了
    # t③ 禁改区扫描：正文里四类区段先圈出来不许碰（WeKnora span 注释同构，
    #   引用块见下；①代码块与行内代码 ②已有的 [[…]] 链接与 Markdown
    #   链接/图片 ③自链页号入已用集 ④引用定义行）——标注路已挂的
    #   链接（主干一产物）全在禁改区里，规则路不重挂不嵌套
    禁改区, 已用页号 = _forbidden_spans(page.正文)
    # t④ 逐条目挂链（t② 序）：
    for (目标页号, 匹配词) in 条目表（按字长降序）:
        if 目标页号 == page.页号:  continue        # 自链跳过（WeKnora selfSlug 同款）
        if 目标页号 in 已用页号:   continue        # 该页号已挂过——一页一名只挂一处
        if 字符数(匹配词) == 1 and 是汉字(匹配词):  continue
                                                   # 单汉字不挂（WeKnora 同款：无词边界
                                                   # 可言，"风沙/栏目/核心"会碎成坏链）
        位置 = _safe_first_hit(page.正文, 匹配词, 禁改区)
        if 位置 < 0:               continue        # 首个合格命中不存在→本条放弃
        page.正文 = 在位置处把匹配词包成 "[[" + 目标页号 + "|" + 匹配词 + "]]"
        禁改区 = 平移并追加（新链接区段入禁改区——后续条目嵌不进去）
        已用页号.add(目标页号)
    # t⑤ 出页：return LinkedPage(页=page, 变更=挂了没有, 链接清单=挂了哪些)
    # ★ 附带注记位：机器挂链不进版本账（WeKnora UpdateAutoLinkedContent 注释
    #   "without bumping `version`"——挂链接是格式修饰不是内容变更；
    #   版本账本机制归设计稿 66 成文，本节注记即止）
```

WeKnora 禁改区清单与两道判据（引用主位——逐字三处；`wiki_linkify.go:16-19`、`:50-55`、`:153-156`，commit 33c0333 实测）：

```text
// span is a half-open byte range [start, end) inside the content that must not
// be touched by linkification. It covers fenced code blocks, inline code,
// existing [[...]] wiki links, markdown links [text](url), and image
// ![alt](url) forms.
```

```text
		// A single Han character has no reliable token boundary in unsegmented
		// Chinese prose. Substring-linking it would turn words such as 风沙、
		// 栏目 and 核心 into broken links. Keep one-character Wiki pages and
		// any explicit [[...]] links authored by the generator, but never
		// inject a new cross-link for such a surface form.
```

```text
// hasWordBoundary checks that the characters immediately before pos and at end
// are not ASCII word runes (letters/digits/underscore). Non-ASCII runes (e.g.
// CJK) are treated as boundaries so "北京" embedded in "北京邮电大学" still
// matches — length-descending ordering handles that conflict separately.
```

正文解释：规则路最难的不是"找到实体词"，是**"别把不是实体词的地方当成实体词"**——三道判据各防一种误挂。**禁改区**防"改坏格式"：代码块里的 `N-2` 是示例文本不是井号引用，挂了链接示例就跑不成了；标注路刚挂好的链接若不在禁改区，规则路会在链接显示名里再嵌一层 `[[…[[…]]…]]`，Markdown 直接解析失败。**单汉字闸**防"碎词误挂"：中文没有空格分词，单字没有可靠的"词边界"——给"核心"的"心"挂链接，整句就毁了。**词边界闸**防"连字误挂"：ASCII 词（井号 `N-02`）前后不能紧贴字母数字；纯中文串反之——"渤中28-1"嵌在"渤中28-1-N2"里照样命中（CJK 视作边界），这种冲突不靠边界闸、靠 t② 的长名优先：全名先认领、子串再进来时位置已落禁改区。WeKnora 批收尾的规模账也是规则路的存在理由（引用块逐字，`internal/application/service/wiki_ingest.go:1794-1813` 节选，commit 33c0333 实测）：

```text
// injectCrossLinks scans the batch's affected pages and injects
// `[[wiki-links]]` for mentions of other wiki page titles / aliases
// in the content. Pure text replacement, no LLM call.
//
// Scope is intentionally limited to two slug sets:
// …
// At 4w-document scale this is the difference between loading 100K+
// pages just to find link candidates vs O(batch-size) lookups. We
// trade off some long-tail recall (a brand new entity in this batch
// won't be linkified into pages from previous batches until they get
// re-edited), but lint AutoFix is the right place for that.
```

正文解释（续）："纯文本替换、零模型调用"是账——四万文档的库里，逐词问模型"这词要不要挂链"等于把全库重读一遍；规则路的候选只来自本批affected页的既有出链+本批新页（O(批大小)查表），代价是**长尾召回让渡**（老页要等下次被编辑才补挂新实体的链——WeKnora 注释把补挂的归宿交给 lint AutoFix）。两路分工就此成立：**标注路管语义（该不该链、链到哪页），规则路管格式确定性（挂得对、不重挂、不误挂）**——这也是"linkify 两路"（设计范围字面）的读法：不是两套竞争方案，是同一件事的语义半程与格式半程接力。

### 主干三：入口页——目录+最近更新+导语（W-F51-2 的本体）

WeKnora 原注释（引用主位——逐字两处；`internal/application/service/wiki_ingest.go:2063-2069` 与 `internal/types/wiki_page.go:761-764`，commit 33c0333 实测）：

```text
// rebuildIndexPage refreshes the LLM-generated intro that sits on the
// index wiki_pages row.
//
// History: the index page used to store "intro + full directory listing" as
// a single multi-MB markdown blob in content. Every ingest batch rewrote
// the whole column, which on KBs with tens of thousands of pages caused
// O(N) TOAST writes per batch. The directory was lifted out into the
// structured GET /wiki/index endpoint (see wikiPageService.GetIndexView),
// and this method now only maintains the intro.
```

```text
// WikiIndexEntry is a single row in the structured wiki index response.
// Only the columns needed to render a clickable directory entry are
// carried — the backend projects SELECT slug, title, summary so a 40k-
// page KB does not pay for TEXT content transport on every index open.
```

```text
伪代码（数据形状声明，非代码——LinkedPage/入口页为卡面返回类型与卡面注释
       "入口页=目录+最近更新"的设计演绎展开）

LinkedPage: { 页, 变更: bool, 链接清单: [(匹配词, 目标页号, 首处位置)] }
入口页:     { 页号="index", 导语: str, 目录: [页型组(页型, 总数,
              条目[页号, 标题, 一句话摘要])], 最近更新: [同款条目],
              生成说明: 首生 | 增量(变更描述) | 兜底占位 }
            # ★ 目录条目零正文字段——形状里没有 content：目录是"门牌"不是
            #   "藏书"（WeKnora 轻投影注释字面"4 万页的库不为开一次目录付正文
            #   传输"）；页型=报告摘要页/井卡页/区块页（主角④替身分组）
```

```text
伪代码 — app/wiki/linkify.py:模块内入口页件 _build_entry_page（私有件——WeKnora
         GetIndex/rebuildIndexPage/GetIndexView/ListByTypeRecent 设计演绎对应，
         非卡面公开签名，头部声明备案；卡面注释"入口页=目录+最近更新"是形状合同）

def _build_entry_page(self, kb) -> 入口页:
    # t① 默认页兜底：库还没有入口页→建占位页（WeKnora GetIndex 同款："It will
    #   be automatically updated as pages are added"——空库也有门口，
    #   兜底文案如实说"随入库自动更新"，不装已有内容）
    # t② 目录轻投影：按页型分组，每组只投影（页号, 标题, 一句话摘要）三列
    #   （WeKnora ListByTypeLight/Select("slug","title","summary") 同构——
    #   PostgreSQL 方言设计演绎：SELECT 页号, 标题, 一句话摘要 FROM 页表
    #   WHERE 库号=? AND 页型=? AND 状态<>'已归档' LIMIT 窗宽）；
    #   每组带总数，超窗给续读游标（WeKnora GetIndexView 分页语义同构）
    # t③ 最近更新：全库按更新时间倒序取窗口（WeKnora ListByTypeRecent 同构——
    #   "ordered by updated_at DESC"；窗口截断，列表尾注"显示最近 N 条"）
    # t④ 导语生成两路（经网关——m2 唯一出口，Gateway.chat 卡面签名逐字）：
    if 首生（导语空）:
        喂料 = 库内页的一句话摘要按更新时间倒序截顶（上限 200 条——WeKnora
               indexIntroSummaryCap=200 同构；截顶要说话：喂料头带
               "显示最近 N 条/共 M 条"诚实框架行——WeKnora :2160 同款）
        导语 = Gateway.chat(导语模板[只写标题+两三句，明确不许生成目录
               与页链接——WeKnora WikiIndexIntroPrompt 同款约束])
    else 增量:
        导语 = Gateway.chat(增量模板[只给现有导语+本批变更描述——
               摘要全集故意不再喂：变更描述已编码"这批落了什么"，
               提示词规模与库大小解耦——WeKnora 增量路注释同构])
    #   生成失败→兜底：沿用现有导语/硬编码占位（WeKnora 同款——导语是
    #   "开场白"不是"账本"，生成失败不拦目录与最近更新的装配）
    # t⑤ 装配出页：导语+目录+最近更新（目录与最近更新是查询时按需装配——
    #   不存进页正文：WeKnora 目录史引用块的同款教训，取舍 4）
```

正文解释：入口页三个部件各有一句要读准的话。**目录**的纪律是"轻投影"——WeKnora 用一行 `SELECT slug, title, summary` 把"开一次目录"的成本从"搬全库正文"压到"搬门牌"；教训是真实翻过车的（目录曾在正文列里存成多 MB 大字段，每批入库整列重写，注释里的 O(N) TOAST 写就是验尸报告——取舍 4）。**最近更新**的纪律是"窗口"：列表回答"库还活着吗、最近在动什么"，不回答"全库有什么"（那是目录的事）——按更新时间倒序截窗，尾注显示条数。**导语**的纪律是"两路+诚实"：首生只喂截顶摘要且明说"显示 N of M"（不许模型把样本说成全貌），增量只吃变更描述（提示词规模与库大小解耦——四万文档的库也不能每批重喂全量摘要）；且导语模板明确"不许生成目录与页链接"——目录是结构化查询装配的，模型手写目录必漂。L0/L1/L2 对照（W-F51-2 后半句合同——书的文件系统范式油田版）：

```text
伪代码（对照声明，非代码——入口页三层 × 书 :497 OpenViking L0/L1/L2；
       每层注"加载什么/回答什么/Token 量级"，量级=书字面替身）

 ─────────────────────────────────────────────────────────────────────
 层            │ 入口页对应物        │ 回答什么           │ 量级（书 :497）
 ─────────────────────────────────────────────────────────────────────
 L0 摘要       │ 导语一段            │ 这库是什么          │ 约 100 tokens
 L1 概览       │ 目录条目行（标题+   │ 有没有我要的那页    │ 约 2,000 tokens
               │ 一句话摘要）        │                    │ 级内可判
 L2 全文       │ 点进页正文          │ 这页到底说了什么    │ 按需加载
 ─────────────────────────────────────────────────────────────────────
 读表法："摘要常驻、按需取全文"（书 :497 字面）——小李在 L0 判定
 这库不对口就不进；在 L1 找到"渤中28-1-N2 井卡"才点 L2。三层都是
 同一批页的不同投影，不是三份拷贝——与四管线吃法对照表（设计稿 64）
 同构：同原料、不同吃法、为不同的"第一眼"而生
```

### 捣乱输入：四路——"自由发明链接、禁改区硬挂、子串碎词误挂、入口页整库罗列"

```text
伪代码（时序推演，非代码——捣乱打的是挂链与入口页的误用位；判据全部在案）

路1  自由发明链接："模型写页时顺手造个站外链接/自创页号，看着更丰满"——
     🛡️ exact 页号闸拦（提示词规则行逐字"Use the EXACT slugs provided —
        do NOT invent new slugs"）+ 🛡️ 注册表自包含闸拦（设计范围边界红线
        "不引站外链接"字面：Linkify.link 候选只来自入参 registry，
        函数内零扫库零站外取数——注册表外的表达式零链接）：
        发明的页号点开是死链——读者被带出库或撞 404；WeKnora 死链清理
        （cleanDeadLinks 与挂链同车道先清后挂，批收尾次序实测
        wiki_ingest_batch.go:1081-1082）是兜底不是许可，注记位零展开
路2  禁改区硬挂："代码示例里的 N-2 也是井号，一起挂了才全"——
     🛡️ 禁改区闸拦（主干二 t③ 四类区段——WeKnora span 注释逐字"fenced
        code blocks, inline code, existing wiki links, markdown links,
        image forms must not be touched"）：
        硬挂的两种翻车：示例代码被嵌进 [[…]] 跑不成；已挂链接的显示名
        里再嵌一层 [[…]]，Markdown 解析直接碎——挂链接是修路，
        不是把路面上每块砖都刻上字
路3  子串碎词误挂："渤中28-1 在册，页里'渤中28-1-N2'中段也该挂"——
     🛡️ 长名优先闸拦（t② 字长降序：全名先认领，位置落禁改区，子串
        再进来时命中已在禁改区→跳过——WeKnora"longer names win over
        their substrings"逐字）+ 🛡️ 词边界闸拦（ASCII 词前后不贴
        字母数字——N-02 后面跟汉字才算独立词）+ 🛡️ 单汉字闸拦
        （单汉字无词边界，"核心/风沙"碎成坏链——WeKnora 注释逐字）+
        🛡️ 一页一挂闸拦（同页号已挂即跳过——首处挂一条够导航，
        满页蓝字是灾难，WeKnora"at most the FIRST eligible occurrence"逐字）
路4  入口页整库罗列："目录干脆把全库页正文都列上，一步到位"——
     🛡️ 轻投影闸拦（目录条目零正文字段——形状里没有 content，
        WeKnora"40k-page KB does not pay for TEXT content transport"逐字）
     + 🛡️ 窗口截断闸拦（每组带总数+续读游标，最近更新倒序窗口+
        尾注条数——不一次摊全库）+ 🛡️ 增量导语闸拦（导语更新只吃
        变更描述，摘要全集不再重喂——提示词规模与库大小解耦，
        WeKnora 增量路注释同构）：
        翻车样即 WeKnora 目录史引用块：目录存正文列里成多 MB 大字段，
        每批入库整列重写——门牌做成藏书，搬一次家搬一次楼
可观察行为：四路全拦后交叉链接与入口页的承诺只剩两句——页上每条
     链接都指向注册表内的活页（自包含，点出去还在库里），库门口
     三层导览各答各的问题（L0 判对口、L1 找到页、L2 读全文——
     推演 2 全程）
```

闸在哪：①**提示词明确要求闸**（wiki-link 规则行——建链接是生成时格式合同，书 :501 纪律的提示词落位）；②**exact 页号闸**（do NOT invent new slugs——发明页号=死链，路 1 判据）；③**低熵把手闸**（ref-N 过桥——高熵页号不进提示词，抄错机会在源头取消）；④**注册表自包含闸**（候选只来自入参 registry+站外零链接——设计范围边界红线主判据）；⑤**长名优先闸**（字长降序——全名认领子串进不去，路 3 主判据）；⑥**禁改区闸**（代码块/已有链接/图链/引用定义四类不碰——路 2 判据）；⑦**词边界+单汉字闸**（ASCII 词边界+单汉字不挂——碎词误拦判据）；⑧**一页一挂闸**（首处一挂+已挂跳过+自链跳过）；⑨**机器挂链不动版本闸**（挂链是格式修饰——版本账本设计稿 66 衔接注记）；⑩**轻投影+窗口截断闸**（目录三列零正文+总数+游标+倒序窗口，路 4 判据）；⑪**增量导语闸**（只吃变更描述+截顶诚实框架行——规模与库大小解耦）。拦完数据去哪：页正文只多出 `[[…]]` 标记（禁改区外零改写），版本账零新增（⑨注记位），入口页是查询时装配的视图（页正文只有导语——目录不落盘，取舍 4）；推演全程零新业务事实（注册表行全 A.1 字面，主角数据⑤）。

### 走查推演 1（W-F51-1）：报告页的两路挂链——从提示词到补挂

```text
伪代码（时序推演，非代码——给定栏"Wiki 页含实体词（井号/区块名）"；主角②③⑤）

t0 页到位：《N-2 井完井报告》页生成工单（设计稿 64 主干三 t③ 的本节续拍）——
   注册表快照过把手桥（ref-1=油田页/ref-2=区块页渤南/ref-3=井卡页
   渤中28-1-N2 别名 N-02/N-2/N2——主角③字面）
t1 标注路：模型写到完井方式节"渤中28-1-N2 井采用套管射孔完井"（设计稿 44
   备案语料行字面）→ 按规则行自标 [[ref-3|渤中28-1-N2]] → 经网关出页 →
   解码回 [[井卡页号|渤中28-1-N2]]（主干一 ③④⑤）
   ★ 此处全名已被链接占位——规则路视作已有链接区
t2 规则路 t①–t③：候选条目表按字长降序=渤中28-1-N2(8)/N-02(4)/N-2(3)/
   渤南(2)/N2(2)/渤海油田(4)→重排后渤中28-1-N2 最先；禁改区扫描圈出
   伪代码示例块（主角②替身）与 t1 已挂链接区
t3 规则路 t④ 逐条目：
   渤中28-1-N2 → 已用页号命中（t1 已挂）→ 整条跳过
   渤海油田(4 字) → 页内"渤海油田分公司"句命中且边界合格（前"经"后"分"
   均非 ASCII 词符）→ 挂 [[油田页号|渤海油田]]
   N-02 → 页内无此写法（报告原文用旧写法）→ 无命中放弃
   N-2(3 字) → 正文"……N-2 井采用……"前半句命中——但 t1 已挂同一页号
   （井卡页）→ 已用页号跳过；示例块里的 N-2 → 禁改区跳过（双闸各拦一头）
   渤南(2 字) → "区块属渤南"句命中 → 挂 [[区块页号|渤南]]
   N2(2 字) → 正文已无裸 N2（全名处已链接）→ 无合格命中放弃
t4 出页：LinkedPage(变更=True, 链接清单=[渤海油田→油田页, 渤南→区块页])
   ——井卡页在标注路已挂，规则路零重复；版本账零变化（闸⑨注记位）
可观察行为（W-F51-1 断言全句成立）："实体词→站内链接"=t1 标注路
   [[井卡页号|渤中28-1-N2]]+t3 渤海油田/渤南两挂——页内三个实体词三种
   表达式（全名/区块名/油田名）各挂对各的页；"提示词'像 Wikipedia 一样
   建链接'的明确要求在案"=t0 规则行进模板（主干一引用块逐字）+
   书 :501 纪律对号（漂移备案①）——两路接力，语义与格式各守一半
```

### 走查推演 2（W-F51-2）：小李打开报告库入口页——三层导览全程

```text
伪代码（时序推演，非代码——给定栏"知识库浏览"；主角①④⑤）

t0 小李点开报告库：入口页装配（主干三 t①–t⑤）——库已有页（设计稿 64 批
   产出的报告摘要页+井卡/区块/油田页），入口页导语非空
t1 导语（L0）：首生早已完成——"本库收录渤南区块完井报告……"（替身措辞，
   喂料头带"显示最近 200 条/共 M 条"诚实框架行——主角④）
t2 目录（L1）：按页型分组轻投影——报告摘要页组（总数 N 条目=页号+标题+
   一句话摘要）、井卡页组、区块页组（每组超窗给续读游标）；
   全程零正文字段（轻投影闸——条目行只有门牌）
t3 最近更新：倒序窗口置顶=《N-2 井完井报告》页（设计稿 64 推演 3 刚重写完
   ——updated_at 最新语义；尾注"显示最近 10 条"替身）
t4 小李的读法（L0→L1→L2 全程不回检索框）：
   L0 导语判定对口（5 秒）→ L1 目录扫到井卡页组"渤中28-1-N2"条目
   （一句话摘要："N-02 井基础档案与完井参数"——A.1 字面替身）→
   点进 L2 井卡页正文 → 页内 [[区块页号|渤南]] 再点去区块页——
   顺着链接从井走到区块（书 :501"顺着链接从一个概念走到相关概念"
   字面兑现）
t5 对照位：若不建链接不立入口页——同一批页在库里互为孤岛，小李只能
   逐页全文扫描或回向量检索（书 :501"这堆零散文件反而越难检索"字面）
   ★ 联查：页不在检索索引里（设计稿 64 单向投影闸）→ 导航是页唯一的
   被找到之路——本节两落位就是这条路的路面
可观察行为（W-F51-2 断言全句成立）："目录+最近更新列表"=t2 分组轻投影
   +t3 倒序窗口（卡面注释"入口页=目录+最近更新"字面）；"L0 摘要/L1 概览/
   L2 全文按需加载范式对照在案"=主干三对照表+t4 小李三层读法——
   摘要常驻按需取全文，Token 花在刀刃上（书 :497 字面）
```

## 关键判断的取舍记录

1. **两路接力，不是二选一。** 备选"只留标注路（模型一次性挂好，少一道后处理）"：否决——生成时挂链的召回受限于提示词喂得的注册表快照，且模型漏挂无兜底；只留规则路则语义判断缺失（代词/转述/上下文歧义——"渤中28-1"指井还是指区块，查表查不出语境）。WeKnora 两路在案且分工明确（标注路=提示词规则行+把手过桥；规则路=批收尾纯文本替换——"Pure text replacement, no LLM call"逐字）。落定：标注路管语义、规则路管格式确定性，先后接力（推演 1 t1/t3 实演）。换边条件：无（与 WeKnora 同向）。
2. **规则路只挂首个合格命中，一页一名一挂。** 备选"每处命中都挂（不漏一次导航机会）"：否决——满页蓝字等于没有链接（视觉噪声淹没导航信号）；且重复挂同页的跳转语义零增益。WeKnora"at most the FIRST eligible occurrence"+已挂整条跳过逐字在案。落定：首处一挂+已用页号集跳过+自链跳过（闸⑧）。换边条件：无。
3. **高熵页号不进提示词，低熵把手过桥。** 备选"直接喂真页号+事后校验修补抄错"：否决——WeKnora 注释把话说死（"rather than repairing a mangled slug after the fact, it removes the opportunity to mangle at the source"）——修补是追认错误，取消机会才是防错；与设计稿 33 引用别名 cN、设计稿 63 出口形状闸同族论证。落定：请求内把手表（ref-N）编码/解码一对（主干一 ②⑤）。换边条件：若 petro 页号生成为低熵短串（设计演绎 slug），把手桥可省——改动收在标注路 ② 一处。
4. **目录不存进入口页正文，查询时按需装配。** 备选"目录随批写进入口页正文（一次生成处处读）"：否决——WeKnora 真实翻车史在案（目录史引用块：intro+全目录曾同存一个多 MB 大字段，每批整列重写 O(N) TOAST 写）；门牌是高频读低频变的视图，存正文=每批为没变的门牌付整列写。落定：页正文只存导语，目录与最近更新查询时轻投影装配（主干三 t②/t③）。换边条件：无（与 WeKnora 同向）。
5. **机器挂链不动版本号。** 备选"挂链也走版本账（任何正文改动都留痕）"：否决——挂链接是格式修饰不是内容变更（论断零增删），进版本账会把"谁改了内容"的审计信号稀释进机器噪音；WeKnora UpdateAutoLinkedContent 注释逐字（"persists content produced by machine-only link decorators … without bumping `version`"——出链接与入链接台账照刷，只保人读的版本计数不动）。落定：机器挂链零版本位+链接台账照刷（注记位——版本账本机制设计稿 66 成文）。换边条件：人工编辑后补挂（WeKnora wiki_page.go:1848-1851 同款路——同一套禁改区与边界规则两条路共用），那次编辑本身进版本账。
6. **导语增量更新只吃变更描述，不重喂摘要全集。** 备选"每批全量重生成导语（口径最稳）"：否决——WeKnora 增量路注释同构（摘要全集每批重喂=提示词规模随库线性涨，四万文档即爆上下文；变更描述已编码"这批落了什么"）；且首生已有诚实框架行兜"样本≠全貌"。落定：首生截顶（上限 200+N of M 框架行）、增量只吃变更描述、失败沿用现导语（主干三 t④）。换边条件：库规模恒小（替身库十页级）时全量重生成可行——改动收在 t④ 分支一处。

## 锚点对照精要

**WeKnora 真源码（commit 33c0333，实测——本节引用主位）**：① `wiki_linkify.go:25-34` linkifyContent 合同注释（"injects [[slug|matchText]] cross-links…skipping occurrences that fall inside code or existing links…For every ref, at most the FIRST eligible occurrence is wrapped…Refs pointing at selfSlug are skipped"——主干二 t③/t④ 全部判据的原话；函数体 ：35-90：过滤空条目与自链→单汉字过滤→字长降序→逐条安全命中→包装+禁改区平移）；② `wiki_linkify.go:16-19/:207-218` 禁改区 span 注释与 computeForbiddenSpans 清单（围栏代码块/行内代码/已有 wiki 链接/Markdown 链接与图片/引用式链接与定义行/自动链接——主干二 t③ 四类的展开源）；③ `wiki_linkify.go:40-41` 长名优先（"sorted by matchText length (rune count) descending so longer names win over their substrings"）+`:50-55` 单汉字不挂（"风沙、栏目 and 核心 into broken links"——中文无空格分词的原判据）+`:92-95` 安全命中双判据+`:153-156` CJK 词边界（"北京"嵌"北京邮电大学"照样命中，冲突交给长名排序——推演 1 t3 与捣乱路 3 的原判据）；④ `wiki_ingest.go:1794-1813` injectCrossLinks 注释（:1796"Pure text replacement, no LLM call."+:1806-1811 四万文档规模账与长尾召回让渡——两路分工的存在理由；:1838-1840 入口页不入挂链；:1876-1878 collectLinkRefs=标题+别名建表同构源）；⑤ `wiki_slug_handles.go:5-19` 低熵把手（"models routinely mangle…removes the opportunity to mangle at the source"+与设计稿 33 chunk-handle c000/c001 同族的出处句）+:25 `NewHandleTable("ref-", 0, 1)`+:41-61 编解码；⑥ `prompts_wiki.go:77` wiki-link 规则行（MUST/NOT/EXACT 三处"明确"——提示词明确要求的原话）+:406-419 WikiIndexIntroPrompt（"Output ONLY the title and introduction paragraph. Do NOT generate any directory listings or page links."——导语不许手写目录）+:422-445 增量导语模板；⑦ `wiki_ingest.go:2063-2103` 目录史（多 MB 大字段+O(N) TOAST 写+目录出正文——取舍 4 的验尸报告）+`:2083-2090` indexIntroSummaryCap=200+`:2160` "showing %d most recent of %d total documents" 诚实框架行；⑧ `wiki_page.go:426-433` GetIndex 默认页兜底+:451-456 GetIndexView 轻投影分页（"reads stay O(page_size) rather than O(total pages in the KB)"）+:1848-1851 人工编辑路同款挂链（同一套禁改区规则两路共用）+:1894-1906 RebuildIndexPage 出正文废弃史+:206-209 机器挂链不动版本号；⑨ `repository/wiki_page.go:1002-1039` ListByTypeRecent（updated_at DESC+`Select("slug","title","summary")`——最近更新窗口与轻投影的原查询）+`types/wiki_page.go:761-764`（40k 页不付正文传输）+`:787-791`（重目录大字段已死，查询时装配）。**批收尾次序**：`wiki_ingest_batch.go:1069-1082`（先重建入口页导语→清死链→挂新链——死链清理注记位的实测坐标）。**WeKnora 源码地图**：§5.1"配套：wiki_linkify.go（交叉链接）、wiki_slug_handles.go"（零行号零漂移）；§5.2"OpenViking…必须像 Wikipedia 建链接且写入提示词要明确要求"（漂移备案①的转述位）。**调研报告**：§1.1"相互链接的 Markdown 知识库"（本节口径位）；§4.2"Wiki 图谱可视化…是 Wiki 页面链接图，后者是实体关系图"（交叉链接的图≠图谱投影——设计稿 54 对照已备案，本节注记位）。
**原书第三章（本节首引 :501）**：建链接纪律——"正确的做法是把知识库组织得像 Wikipedia：每个条目在提及其他条目时都以链接指向它，再辅以入口页与索引页，让 Agent 能顺着链接从一个概念走到相关概念——这相当于用轻量的文件链接，实现了 GraphRAG 实体关系图谱的一部分导航能力"（正文短引+漂移备案①）——条目互链=主干一/二，入口页索引页=主干三，"轻量链接≈图谱的一部分导航能力"=交叉链接与图谱投影边界的书侧判据；`:497` L0/L1/L2（L0 约 100 tokens/L1 约 2,000 tokens/L2 全文按需加载+"摘要常驻、按需取全文"——对照表底座）。双仓域（本体，无文档投影语义）与交互层域本节零引用，如实声明。
**CONTEXT.md 词条（版本 4 增补术语，零新增）**：①"Wiki 管线"——"报告→拼回全文→LLM 重写 Markdown 页→自动交叉链接→版本回滚；重写≠检索"——本设计稿兑现"自动交叉链接"一环与导航承诺；②"chunk 契约"（零直引——本节不吃块只吃页）；③"断言观"（页是 is-记录的知识层，链接是知识层内部导航——证据层 chunk 不参与链接图，注记位）；④"注入防御层"零交叉（注册表是站内页账本不是外源内容——路 1 站外链接闸的同族边界）。
**PRD F51（docs/prd.md）**："做什么"逐条对齐——自动交叉链接识别页内实体词挂站内链接（主干二）、"必须像 Wikipedia 一样建链接"且写入提示词时明确要求（主干一引用块+漂移备案①）、每知识库一个入口页目录+最近更新（主干三）、L0/L1/L2 按需加载范式对照讲法（对照表）；"不做什么"对齐——链接不做人工审核流（自动生成+可人工编辑：自动半边本节全程，人工编辑半边归设计稿 66 注记）、不做站外链接（注册表自包含闸）；业务逻辑要点（"Wiki 页里'渤中28-1'自动变链接跳井卡"=推演 1 t1/t3 逐拍字面；"入口页=报告库自动生成的首页"=主干三全程）；信源锚点（WeKnora 两文件+书 §OpenViking）实测兑现。
**模块卡 m27/m2（签名唯一来源+兑现位）**：卡 m27 `Linkify.link(page, registry) -> LinkedPage` 签名与卡面注释三件事逐字（主干二块首/主干一提示词半边/主干三形状合同）、目录 `app/wiki/linkify.py`（本节文件落点；revisions.py 归设计稿 66 零触碰）、依赖行"m2（重写走网关）"（主干一 ④/主干三 t④ Gateway.chat 卡面签名逐字）、Seam 行"入口页与链接注册表是自包含的"（主干二 t① 与越界自查主判据）、Adapter FakeWiki（头部声明——固定页与双版本）；卡 m27 首段职责"自动交叉链接（linkify，像 Wikipedia 建链接）+ 入口页"（本节两落位的卡面字面）。边界规则行（版本 4 增补）："m27 Wiki 管线写 m14 索引…投影方向单向：chunk→页"（本节零索引写位——链接与入口页全在 m3 页面落库与查询装配侧，零 m14 表达式）。
**设计稿 64/46/33/30（只消费不改动）**：设计稿 64（页产物=本节原料/页样张与语料行备案字面——主角②/wiki-link 规则行与"页的检索入口是入口页与交叉链接"两处锚点的预留方/单向投影闸——导航承诺的前提）；设计稿 46（批与扇出语义——"批"字口径）；设计稿 33（cN 引用别名 fail-closed——低熵把手过桥的同族先例，取舍 3）；设计稿 30（协议暴露零越界——交叉链接是页间导航不是对外接口，零触碰）。
**设定书（取材锚——业务事实零新增）**：§1（角色卡"质量管理员｜地质研究所（小李兼）"——消费主角锚）；附录 A.1（N-02/well_name 渤中28-1-N2/旧写法 N2/N-2 并存=井卡页别名行的字面来源/block_name 渤南/field_name 渤海油田——注册表三行全 A.1 字面）；§3（井—隶属→区块—隶属→油田——链接图的业务关系底座：井卡→区块页→油田页的跳转链就是这条隶属链的导航化）；§2/§4/§5/§6/§7/§8/附录 A 其余零新引。版本 4 业务事实零新增——页样张/入口页措辞/条数替身=走查注入替身（主角数据④⑤声明）。
**walkthroughs F51（验收合同）**：W-F51-1（给定"Wiki 页含实体词（井号/区块名）"/走查"`app/wiki/linkify.py:Linkify.link`"/期望"实体词→站内链接；提示词'像 Wikipedia 一样建链接'的明确要求在案（书 §OpenViking 纪律）"=主干一提示词半边+主干二规则半边+推演 1 合同原文——逐句兑现）；W-F51-2（给定"知识库浏览"/走查"入口页"/期望"目录+最近更新列表；L0 摘要/L1 概览/L2 全文按需加载范式对照在案"=主干三 t②/t③ 形状+对照表+推演 2 合同原文——逐句兑现）——两条断言全句兑现，幽灵断言 0。

## 越界自查（源：modules.md 边界规则表）

- **设计范围边界红线"链接注册表自包含；不引站外链接"**：Linkify.link 候选只来自入参 registry（主干二 t①——函数内零扫库零站外取数）；提示词喂的 available_wiki_pages=同源快照（主干一 ①）；exact 页号闸（do NOT invent new slugs 逐字）+注册表外表达式零链接（捣乱路 1 判据）；入口页目录/最近更新全查本库页账（主干三 t②/t③ WHERE 库号=?）；全稿零站外 URL 零站外取数。
- **m27 Wiki 管线写 m14 索引（投影方向单向 chunk→页）（版本 4 增补行）**：本节全稿零 m14 表达式——挂链改的是页正文、入口页是查询装配视图，产物全落 m3 页面侧与内存形状；LinkedPage/入口页形状零索引字段（与设计稿 64 WikiPage 形状闸同款论证）。
- **图谱/Wiki 后处理绕过 m22 分发枢纽自行挂接入库管线（扇出唯一出口=PostProcess.dispatch）（版本 4 增补行）**：本节零新挂接——触发位是设计稿 46 扇出的 Wiki 路批收尾段（页已落库之后），管线入口唯一照旧；标注路寄生在设计稿 64 页生成工单的提示词装配步内，零独立管线。
- **m2 唯一出口（既有行）**：标注路与导语生成的模型调用=Gateway.chat 卡面签名逐字（主干一 ④/主干三 t④）；规则路零模型调用（"Pure text replacement, no LLM call"逐字——WeKnora 与 petro 同款，两路分工的账面）；全稿零直连模型 API。
- **明确不讲的零出现自查**：人工审核流零展开（设计范围字面——挂链全自动，"可人工编辑"只注归设计稿 66 的衔接位）；站外链接零出现（上条红线）；版本/回滚/知识层证据层分离零成文（设计稿 66——Revisions 双签名零引用，机器挂链不动版本只注记）；实体页/概念页抽取机制零展开（注记位——注册表条目"从哪来"一句话）；死链清理零展开（批收尾次序注记位——先清后挂的实测坐标在案）；多文档内容聚合零出现（入口页只有导航级目录+列表，零跨文档内容综合——PRD F50 分界注记在案）；Wiki 图谱可视化零展开（§4.2 注记位）。
- **签名纪律**：全稿公开签名三件且零自造——`Linkify.link(page, registry) -> LinkedPage`（卡 m27 本节签名）+`WikiWriter.write(full_text, kb) -> WikiPage`（卡 m27 设计稿 64 既有，输入位）+`Gateway.chat(messages, model_alias, stream=False, tools=None) -> ChatResult | TokenStream`（卡 m2）。`_annotate_route/_forbidden_spans/_safe_first_hit/_build_entry_page/标注路五步/入口页四件`（模块内私有件与内联判断——WeKnora wikiSlugHandles/computeForbiddenSpans/findFirstSafeMatch/GetIndex+rebuildIndexPage+GetIndexView+ListByTypeRecent 设计演绎对应，头部声明与锚点对照备案，非公开签名发明）；`LinkedPage/入口页形状/两路接力/三层对照表/四路推演/推演两则`（数据形状与走查叙述件逐项声明）。框架红线"无新增"履行（零新替身零新 Adapter——FakeWiki 卡面既有）。
- **取材锁自查**：全稿业务事实仅三类且全为既有——角色（§1 小李字面+CONTEXT.md 角色表）、注册表行（A.1 字面：井名/别名=旧写法并存字面/区块/油田）、关系（§3 井—隶属→区块—隶属→油田——链接跳转链的业务底座）；页样张/入口页措辞/条数/字长值=替身（主角数据⑤声明）；技术口径（WeKnora 九处引用块、卡面注释、book :497/:501、源码地图两节、调研报告两处）全部注锚（实测核对——漂移备案①PRD 引号系书句压缩转述如实备案；漂移备案②源码地图零行号零漂移；相关域零引用如实声明）。
- **架构大图同步**：diagrams/petro-agent.html 按设计范围图节点范围推进——**C27 增 1 节点** wiki_linkify（🛡️ 交叉链接与入口页：页内实体词自动挂站内链接——注册表里最长的名先挂、一页一名只挂一处、代码块与已有链接区不碰、自页不自链、注册表外的词零链接站外零链接；每知识库一个入口页=导语+目录+最近更新——目录只投影页号标题一句话摘要三列零正文，导语首生截顶增量只吃变更描述；页不在检索索引里，链接与入口页就是页被找到的唯一路（设计稿 65））+**零新增边**（设计范围未声明边——设计稿 58/60/62/63 先例：实测既有 179 条边 0–178=64 实线+115 虚线，设计稿 64 落账一致零漂移）；linkStyle 最大 101 零触碰；节点明细表增 1 行（wiki_linkify——插 wiki_writer 行后与图序一致）；防护清单表增 1 行（设计稿 65｜wiki_linkify——🛡️ 语义"防死链与站外链（注册表自包含：只挂注册表内活页）+防挂链改坏正文格式（禁改区四类零触碰）"为本节新登记，设计稿 64 wiki_writer 盾行先例：本节边界红线语义无既有盾行承载）；既有节点/边/表行/图头部计数文字（历史陈货）零改动；编辑用唯一锚点定点插入三处（容器内节点行/节点明细表/防护清单表），零批量正则；标签全角引号零裸引号校验零失衡；图上零文件名/零函数名/零端口/零路由。
- **零代码红线**：全文代码块均标注"伪代码"；无 tests/、无 CI 内容；SQL 仅一处 PostgreSQL 方言设计演绎（目录轻投影 SELECT 三列——注释标设计演绎，对应 WeKnora gorm 投影逐字引用块）；零服务端搭建。
