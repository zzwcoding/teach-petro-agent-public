# 设计稿 64：文档到 Wiki 页

> **红线声明**：本设计稿零真实可运行代码。全部代码块均为**伪代码**（块首标注"伪代码 — 文件:函数"或"伪代码（数据形状声明，非代码）"或"伪代码（对照声明，非代码）"或"伪代码（时序推演，非代码）"）——例外仅 WeKnora 生产代码**原注释/原模板引用块**（逐字照抄英文注释与 Go/模板原文，块首注文件行号与 commit 号，解释全在正文不混进引用块；块内"…"为行省略号，省略行不参与断言）。公开签名取自模块卡逐字：`Reconstructor.rebuild(doc_id) -> FullText` / `WikiWriter.write(full_text, kb) -> WikiPage`（卡 `m27`——本节两签名，卡面注释即两函数合同；卡 m27 另两签名 `Linkify.link`/`Revisions.commit`/`Revisions.rollback` 归设计稿 65/66，本节零触碰）；`PostProcess.dispatch(doc_id, strategy) -> None`（卡 `m22`——设计稿 46 既有函数，本节只消费其 Wiki 路扇出位）；`Gateway.chat(messages, model_alias, stream=False, tools=None) -> ChatResult | TokenStream`（卡 `m2`——重写走网关既有面，零新增网关能力）；`Repository.list_chunk_meta(doc_id) -> list[ChunkMeta]` / `Repository.get_chunks_by_ids(ids) -> list[ChunkMeta]`（卡 `m3`——设计稿 46/50 同款只读调用）。**框架红线：无新增**（设计范围声明——重写经 m2 网关既有 chat 面；替身沿卡 `m22` FakePostProcess（固定扇出轨迹）与卡 `m27` FakeWiki（固定页与双版本）既有形状，零新替身零新 Adapter）。**深度分档落点**：本节全机制档，主干伪代码到函数级——主干一拼回（t①–t⑤ 逐步+去重件四步）、主干二回读（回读顺序五步）、主干三重写（t①–t⑤ 逐步），每步落"输入输出契约+主干判断"（设计范围伪代码梳理清单前三条字面）。
> **接线边界（对既有设计稿只消费不重讲——设计范围边界红线"Wiki 只读 m14/m3 chunk 公开面、不回写索引（版本 4 边界规则：投影方向单向 chunk→页）"）**：对设计稿 46 **只消费扇出位不重讲**——四开关/挑选闸/计数收敛/扇出唯一出口全是设计稿 46 交付物，本节走的是 dispatch 的 Wiki 路（`if strategy.Wiki: 工单数 += 1` 既有行），消费端（本节两函数）零重讲枢纽内部；对设计稿 50 **只读材料半边不重讲**——caption/ocr 子块落账在库是设计稿 50 交付的"材料半边"（设计稿 50 头部接线边界字面"enriched 重建的回读动作是设计稿 64 地盘，本节兑现'caption/ocr 材料在库'半边"），本节兑现**回读动作半边**，VLM 双调/空产闸/两级链零重讲；对设计稿 44 **只复用形状不重讲**——chunk 契约（块号规则/父子两级/重叠窗参数/父块不索引 INV）全是设计稿 44 交付物，本节是"第四条管线的吃法"（CONTEXT.md"chunk 契约"词条：四条管线吃法不同，原料都是它）；对设计稿 49/51 **零触碰**——FAQ/摘要/问题块是检索替身（本节拼回把它们排除在外，主干一 t② 判据）；对设计稿 65/66 **明确不讲**——交叉链接与入口页（linkify）、版本历史与一键回滚（revisions）是设计稿 65/66 地盘，本节产出止于"一页结构化 Markdown"（设计范围伪代码梳理清单末条字面）。对 m1/m7 **零触碰**——Wiki 是离线投影管线，不入问答/问数在线链路。
> **行号与信源核对声明（WeKnora 信源纪律）**：本设计稿所引 WeKnora 源码均经真源码实测核对——`git clone --depth 1` 于 commit `33c0333`（与设计稿 44–50/63 同 commit），`internal/application/service/wiki_ingest.go`（:39-40 `maxContentForWiki = 32768` 常量与注释、:2859-2877 `reconstructContent` 注释与函数体、:2879-2935 `reconstructEnrichedContent` 注释与函数体、:3178 `hasSufficientTextContent`）、`internal/application/service/wiki_ingest_batch.go`（:1199-1204 enriched 调用+截断+日志行、:1207-1219 真文本闸注释与调用）、`internal/searchutil/chunkmerge.go`（:12-17 JoinChunkContent 保守回退注释、:72-86 按文本匹配中文注释、:88-94 最短匹配长度常量、:100-110 位置无重叠直接拼接注释、:178-226 MergeTextChunks）、`internal/searchutil/imageinfo.go`（:55+ CollectImageInfoByChunkIDs、:270-274 EnrichContentWithImageInfo 注释）、`internal/agent/prompts_wiki.go`（:52-58 文件名不进提示词注释、:60-85 WikiSummaryPrompt）逐行过目。**漂移备案①**：WeKnora 复刻稿源码地图 §5.1 记 `reconstructContent:2865`/`reconstructEnrichedContent:2883`——实测函数体分别在 :2867/:2885（注释块起点 ：2859/:2879），条目归属与机制描述全对、行号差 2 格，照勘误先例实测核对+日志备案，不硬凑（maxContentForWiki:40 实测相符）。**《WeKnora 调研》报告**实测：§3.4 编排行"…+ Wiki 生成，原子计数器 pending_subtasks_count 收敛"与真源码对上（设计稿 46 已备案同节）；§1.1"自动 Wiki 生成——Agent 从原始文档自治生成相互链接的 Markdown 知识库…支持人工编辑、版本历史与一键回滚"为 F50–F52 全线的调研口径位；§4.2 注记"Wiki 图谱可视化…与 Neo4j GraphRAG 是两回事"（设计稿 54 地盘对照，本节只注锚）。**原书第三章**实测：`:499` Markdown 范式——**本节首引**（"产出是文档不是索引"的书侧判据，正文短引）。**漂移备案②**：设计范围/断言/PRD/卡面四方零冲突（设计范围 What to build 与 W-F50-1/2/3 逐句对得上；卡 m27 注释 maxContentForWiki=32768 与真源码 ：40 实测同值；图节点范围容器 C27 为新增，与大图实测 C22–C26 既有序列无冲突——新容器按序追加）。
> **明确不讲的**（设计范围伪代码梳理清单末条字面"明确不讲的：交叉链接与版本（设计稿 65/66）"+PRD F50"不做什么"）：交叉链接 linkify 与入口页（设计稿 65——卡 m27 `Linkify.link` 签名零引用零展开；WeKnora WikiSummaryPrompt 里的 wiki-link 规则行只注"设计稿 65 地盘"不解读）；版本历史与一键回滚（设计稿 66——`Revisions.commit/rollback` 签名零引用；知识层/证据层分离成文归设计稿 66，本节只注记位）；多文档聚合（入口页是多文档的事——PRD F50"不做什么"字面）；改原始报告库（PRD 字面——本节对报告库零写位）；实体页/概念页抽取（WeKnora `WikiKnowledgeExtractPrompt`——交叉链接的对端产物，设计稿 65 注记位）；Wiki 图谱可视化（WeKnora §4.2 注记"与 Neo4j GraphRAG 是两回事"——设计稿 54 已对号，本节零展开）；多模态子块生产（设计稿 50 地盘——本节只消费其落账产物）。

## 实现清单

- [x] 重叠去重后全文通顺无重复段（源：W-F50-1）✅ **主干一**（只取 text 块拼回 t①–t⑤+去重件 `_merge_text_chunks` 四步：位置窗估算→文本对齐裁剪→不命中原样接→完全包含整块跳）+ **走查推演 1**（重叠窗对齐裁一份/空隙页直接接/覆盖块整块跳三情形全程）+ **捣乱路 1/2**
- [x] 纯图片文档 enriched 重建非空对照成立（源：W-F50-2，与 W-F36-3 联查）✅ **主干二**（回读顺序五步——拼回先行、正文块收号、按父块号查 caption/ocr 子块、图信息按图引用合并、内联正文+尾部追加）+ **走查推演 2**（图册两分支对照：不回读→空页注记成立；回读→非空出页）+ **捣乱路 3**；W-F36-3 半边兑现（设计稿 50 材料在库半边+本节回读动作半边=对照两侧在案）
- [x] 32K 截断纪律+结构化页形状+"重写≠检索"论断在案（源：W-F50-3）✅ **主干三**（t① 截 32768+注记随页走/t③ 结构化提示词/t⑤ WikiPage 形状零索引字段）+ **走查推演 3**（4.1 万字截断演示+索引行数零变化观察位）+ **捣乱路 4** + **取舍 5**
- [x] 重叠去重算法（相邻块重叠区对齐）（源：设计范围伪代码梳理清单）✅ **主干一去重件**（`_append_with_overlap` 四步逐条；WeKnora chunkmerge.go 逐条同构——锚点对照 1）+ 取舍 1/2
- [x] enriched 重建的回读顺序（源：设计范围伪代码梳理清单）✅ **主干二**（五步序：先拼回后回读——重叠去重在正文半程做，图信息内联不参与重叠裁剪；回读只读子块账本不重调 VLM——取舍 3）
- [x] WeKnora 对照：reconstructContent/reconstructEnrichedContent/maxContentForWiki=32768（源：设计范围伪代码梳理清单/WeKnora）✅ **主干一/二/三引用块四处逐字**（reconstructContent 注释与函数体/enriched 注释/截断常量与日志行/真文本闸注释）+ **锚点对照精要**（漂移备案①行号实测）
- [x] Wiki 扇出按开关（源：设计范围 Touches modules m22）✅ **主干零消费位**（dispatch Wiki 路既有行——设计稿 46 主干二 `if strategy.Wiki: 工单数 += 1`+`发 Wiki 生成工单` 两行只注位零重讲；关=管线不存在，设计稿 46 语义沿用）
- [x] 重写走网关（源：设计范围 Touches modules m2）✅ **主干三 t④**（`Gateway.chat` 卡面签名逐字——模型流量唯一出口既有红线照守）
- [x] 大图推进：新增容器 C27 Wiki 管线+节点与边（源：设计范围图节点清单）✅ **越界自查·架构大图同步**（C27 增 2 节点+3 条边=枢纽→Wiki 扇出+chunk 只读面→拼回+拼回→重写页——设计范围边声明按箭头逐条落图；实测既有 176 条边 0–175 零漂移，落图后 179 条 0–178）
- [x] 越界引用为零（源：边界规则表）✅ **越界自查**

---

## 走查：从输入到验收行为

> **主角数据**（业务真数据样子——本节不新造业务事实，语料/角色/参数全为既有行或替身声明见④⑤）：
> ① **消费主角**：**小李**（地质工程师，问答 Agent 主要用户——CONTEXT.md 角色表；设定书 §1 角色卡"质量管理员｜地质研究所（小李兼）"字面）——PRD F50 业务逻辑要点字面"小李 5 分钟读完要点"的"小李"即她；她不调管线，管线离线替她读完了 200 页。
> ② **语料主角 A（重叠分块报告）**：Volve 完井报告 `volve-completion-01`（F6 既有语料——PRD 取材声明字面"报告语料沿用 Volve 报告库（F6 既有）"；设计稿 44 备案语料：报告号/父子分块参数/语料行全沿用）——**200 页英文**（PRD F50 目标句字面），入库走父子分块（设计稿 44 既有：子块 256–1024 token、重叠 10–20%），正文子块带 chunk_type=child+parent_id+页码（设计稿 44 形状）；语料样张行沿用设计稿 44 备案字面"……N-2 井采用套管射孔完井，人工井底 2788 m……"。
> ③ **语料主角 B（纯图片对照）**：完井附图册（扫描件 PDF——设计稿 50 既有《N-2 井完井附图册》同族；"扫描成每页一图、正文零文本块"属走查注入替身，声明见⑤）；图册在设计稿 50 已走过多模态扇出，image_caption/image_ocr 子块落账在库（设计稿 50 主干二判⑤交付物）。
> ④ **重写产物样张（替身声明）**：中文 Wiki 页样张——《N-2 井完井报告》页：一句话索引摘要+正文（二级标题章节+关键参数表：完井方式=套管射孔完井、人工井底 2788 m〔设计稿 44 备案语料行字面〕+结尾要点清单）+井号 渤中28-1（A.1 well_name 字面）；"中文"与"5 分钟"=PRD F50 字面，页的形状=卡 m27 `WikiPage` 返回类型的展开（数据形状声明见主干三）。
> ⑤ **计数/替身口径**：32K=**32768 字符**（WeKnora `maxContentForWiki` 字面——字符数按 rune 计，取舍 4）；推演 3 的"raw 4.1 万字符"=200 页报告正文量级的**替身数字**（PRD 只给页数不给字数，超出 32768 即触发截断演示）；图册"每页一图零文本块"=替身声明；机制真实，数字与样张为替身。**业务事实零新增**：井名/井型/语料行全引 A.1 与设计稿 44/50 备案，本节零新造。
> **地图先行**（Wiki 管线三站——扇出位是设计稿 46 的、拼回与重写是本节的、页的去处注设计稿 66，后续主干引用不重画）：

```text
伪代码（Wiki 管线总览——第三种投影的一生，非代码）

入库半程（既有面，零重讲）
  报告 → m6 分块（设计稿 44/09）→ 双写双索引+块账本（设计稿 08/44）
       → PostProcess.dispatch（设计稿 46 枢纽——扇出唯一出口，边界规则行字面）
            if strategy.Wiki: 工单数 += 1                          〔设计稿 46 既有行〕
            发 Wiki 生成工单(doc_id)                               〔设计稿 46 既有行〕
── Wiki 管线（本节 C27）──────────────────────────────────────
  站一 拼回   Reconstructor.rebuild(doc_id) -> FullText        〔卡 m27 逐字〕主干一
              只取正文块按原文次序拼回；相邻块重叠区按文本对齐去重
              enriched 分支回读 caption/ocr 子块内联（纯图片文档防空白）   主干二
  站二 重写   WikiWriter.write(full_text, kb) -> WikiPage      〔卡 m27 逐字〕主干三
              超 32768 字截断并注记 → 经网关重写成结构化 Markdown 页
              产出是文档不是索引——页不在双索引里（零索引写位）          主干三
  站三 去处   页落库（m3 页面与版本落库——卡 m27 依赖行字面；版本与回滚=设计稿 66，
              本节注记即止）
一句话：向量/倒排投影为"被命中"而生（吃碎块），Wiki 投影为"被人读"而生
       （吃拼回的整篇）——同一份 chunk 契约的第四种吃法，投影方向单向 chunk→页
```

### 主干一：Reconstructor.rebuild——只取 text 块拼回+重叠去重（W-F50-1 的本体）

WeKnora 原注释（引用主位——逐字；`internal/application/service/wiki_ingest.go:2859-2866`，commit 33c0333 实测）：

```text
// reconstructContent rebuilds document text from chunks.
//
// This only concatenates text-type chunks — image OCR / caption information is
// stored on image_ocr / image_caption child chunks (see image_multimodal.go),
// not on the parent text chunk's ImageInfo field. Callers that need the full
// enriched content (with OCR / captions inlined) should call
// reconstructEnrichedContent instead so image info is fetched from child
// chunks and embedded alongside Markdown image links.
```

```text
伪代码 — app/wiki/reconstruct.py:Reconstructor.rebuild（m27；签名按卡逐字：
         Reconstructor.rebuild(doc_id) -> FullText；
         卡面注释"只取 text 块拼回+重叠去重；enriched 版回读 image_ocr/caption（纯图片文档防空白）"
         是本函数合同——t② 是"只取 text 块"的机制位，t④ 是"重叠去重"的机制位，enriched 见主干二）

def rebuild(self, doc_id) -> FullText:
    # t① 读块清单——只读公开面（m3 既有面，设计稿 46/50 同款调用；零直连 Chroma/rank_bm25 对象
    #   ——边界规则"m14 消费方"行同款守法；本函数对 m14 六函数零调用，捣乱路 4 判据半边）
    块清单 = await Repository.list_chunk_meta(doc_id)          # 卡 m3 签名逐字
    # t② 只取正文块——WeKnora 注释"This only concatenates text-type chunks"的设计落位：
    #   chunk_type ∈ {text, child} 入选（设计稿 44 行族的正文子块；F6 语料默认父子档）；
    #   parent（回捞用全文段，设计稿 44）/summary/question（检索替身，设计稿 51）/
    #   faq（问答对，设计稿 49）/image_caption/image_ocr（图信息载体，设计稿 50）全不入选——
    #   它们进拼回，就是把"检索加工物"混进"原文重建物"：摘要块会把模型的话
    #   冒充成报告原文，caption 块会把图说明重复算正文
    正文块号 = [块.号 for 块 in 块清单 if 块.chunk_type in ("text", "child")]
    正文块清单 = await Repository.get_chunks_by_ids(正文块号)   # 卡 m3 签名逐字（含块原文与位置）
    # t③ 恢复原文次序——块号规则"报告号#页码#块序"（设计稿 44 既有）直读出（页码, 块序）次序键；
    #   零新形状：拼回只要"阅读次序"，账本里已有
    正文块清单.sort(key=(页码, 块序))
    # t④ 逐块拼接+重叠去重（模块内私有件 _merge_text_chunks——WeKnora MergeTextChunks 同构，
    #   锚点对照 1；去重件四步见下方展开）
    全文 = _merge_text_chunks(正文块清单)
    return FullText(报告号=doc_id, 正文=全文, 正文块数=len(正文块清单), 图信息内联=False)
    #   FullText 为卡面返回类型的数据形状（主干三前声明）；图信息内联=False 是普通版，
    #   enriched 版（主干二）同函数另一分支翻 True——卡面注释"enriched 版"的开关位
```

```text
伪代码 — app/wiki/reconstruct.py:模块内私有件 _merge_text_chunks/_append_with_overlap
         （去重件四步——设计范围伪代码梳理清单"重叠去重算法（相邻块重叠区对齐）"本体；
          私有件命名对应 WeKnora searchutil.MergeTextChunks/AppendWithOverlap 设计演绎，
          非卡面公开签名——头部声明备案）

def _merge_text_chunks(正文块清单) -> str:
    已拼 = ""
    for 下块 in 正文块清单（按 t③ 次序）:
        已拼 = _append_with_overlap(已拼, 下块.原文, 位置重叠=相邻块重叠窗估算)
    return 已拼

def _append_with_overlap(已拼, 下块, 位置重叠) -> str:
    # 步 a（空与间隙）：已拼空→直接取下块；位置重叠≤0（跨页有间隙/位置缺失）→
    #   直接拼接**不做重叠裁剪**——WeKnora 同款守则（锚点对照 1c：位置上严格相邻或
    #   不相交时硬找重叠，会把下块开头误判成补写头整段删掉，不可逆丢内容）
    # 步 b（对齐裁剪）：位置重叠只用来定搜索窗宽（设计稿 44 分块参数：同一父块内相邻
    #   子块共享 10–20% 重叠窗——窗宽已知，WeKnora"位置信息仅用于估算搜索窗口大小"同构）；
    #   真正的裁剪按**文本匹配**：k 从窗宽上限降到下限 12 字，
    #   找"已拼文本的最后 k 字 == 下块开头 k 字"的最长 k → 下块跳过前 k 字再接上
    #   （相邻块重叠区对齐——重叠只裁一份，全文通顺无重复段的机制位）
    # 步 c（保守回退）：找不到文本重叠 → 原样拼接，宁重复不丢内容
    #   （WeKnora 同款注释"This conservative fallback intentionally prefers small
    #   duplication over silently dropping edited content"——锚点对照 1a；取舍 2）
    # 步 d（完全包含）：下块（≥12 字）已被已拼文本完整包含 → 整块跳过零新增
    #   （WeKnora ContainsChunkContent 同构；重复上传段/整块重复在此收敛）
    # 最短匹配长度闸（步 b 的下限为什么是 12）：太短的公共片段（表格分隔行
    #   "|---|"、常词标点）不是重叠证据，拿来对齐会误裁真实内容——WeKnora 字面
    #   "太短（如表格分隔行 |---|）容易误匹配，因此忽略"（锚点对照 1b；捣乱路 2）
```

正文解释：拼回这件事的反直觉处在于**它不是把块接起来就完事**——分块时的重叠（设计稿 44：10–20%）是给检索保上下文用的，检索无所谓重复，Wiki 页通顺与否人眼一看便知，所以"第四条管线"必须把重叠再裁掉。裁法上有一个关键选择：**按坐标裁还是按文本裁**。WeKnora 在这条路上真实翻过车（引用块逐字，`internal/searchutil/chunkmerge.go:72-86`，commit 33c0333 实测）：

```text
// 这里实现 chunk 内容的「重叠拼接」公共逻辑，供文档重建（reconstructContent）、
// 知识图谱内容合并（graph mergeChunkContents）等路径复用。聊天检索链路允许
// 用户编辑 Chunk，使用上面的 JoinChunkContent，避免依赖原文位置坐标。
//
// 历史上各处都用「按位置」的公式裁剪重叠（offset = len(content) - (EndAt -
// lastEndAt) 之类），它默认 len([]rune(Content)) == EndAt-StartAt。但有两类
// 数据会破坏这个不变式，导致拼接错位、丢字或重复：
//  1. 父子分块器会给被拆开的表格「补写表头」，补进去的表头是零宽度的
//     （start == end），位置坐标无法表达它，content 比 EndAt-StartAt 更长；
//  2. content 里可能保留 HTML 实体（如 &#34; / &gt;），其字符数比原文区间长。
//
// 因此这里改为「按文本」匹配重叠：在下一段开头的窗口里查找已合并文本的后缀首次
// 出现的位置，从该位置之后接上。位置信息（StartAt/EndAt）仅用于估算搜索窗口
// 大小，不再用于裁剪。
```

正文解释（续）：这段注释是**"坐标可信"这个假设的验尸报告**——两类日常数据（表格补写头、HTML 实体）就能让"字符数==坐标差"不成立，按公式裁就是拼接错位、丢字或重复。petro 设计演绎直接吸收结论：位置只定窗宽，裁剪按文本对齐（取舍 1）。t② 的排除清单也值得读一遍：**拼回的原料越"纯"越好**——凡是模型加工过的块（摘要/问题/FAQ）和图说明块（caption/ocr）都不算"原文"，这是"重建物"与"检索加工物"的分界线；把这条分界线读反了（"多喂点料给模型总没错"），Wiki 页就会把平台自己的话当成报告的话写进去（捣乱路 3 的根）。

### 主干二：enriched 回读顺序——纯图片文档防空白（W-F50-2 的本体，W-F36-3 联查）

WeKnora 原注释（引用主位——逐字；`wiki_ingest.go:2879-2884`，commit 33c0333 实测）：

```text
// reconstructEnrichedContent rebuilds document text and inlines image_info
// (OCR text + caption) pulled from image_ocr / image_caption child chunks.
//
// Without this enrichment, image-heavy documents (e.g. a scanned PDF or a
// standalone .jpg) reach the LLM as bare Markdown image links, causing
// extraction / summarization to produce empty or "no textual content" output.
```

```text
伪代码 — app/wiki/reconstruct.py:Reconstructor.rebuild 的 enriched 分支（设计范围伪代码梳理清单
         "enriched 重建的回读顺序"本体；卡 m27 注释"enriched 版回读 image_ocr/caption"字面）

enriched 分支（主干一 t④ 拼回完成后继续）：
  ★ 回读顺序五步（次序是合同——先拼回后回读）：
  ① 拼回正文先行：主干一 t①–t④ 原样跑完（重叠去重只发生在正文半程——
     图信息内联是"插入说明"，不参与重叠裁剪；顺序反了会把 caption 文字
     当正文重叠误裁）
  ② 收宿主号：正文块清单逐块的 parent_id 收成宿主父块号集
     （设计稿 50 两级链：caption/ocr 子块的 parent_id 直指宿主父块行——零改动对上）
  ③ 按父块号查图片子块：Repository.get_chunks_by_ids(宿主父块号集) 的账本行里
     收 chunk_type ∈ {image_caption, image_ocr} 的子块
     （只读账本——**不重调 VLM**：设计稿 50 入库时已花过钱，重调=同图重复计费，取舍 3）
  ④ 图信息合并：同一张图的 caption 与 ocr 按图引用对齐合并成一条图信息
     （WeKnora CollectImageInfoByChunkIDs 按图 URL 聚合同构；多块同图去重）
  ⑤ 内联落位：正文里每处图片占位标记，替换成"图片块"（占位原样保留+图说明+
     识别文字随后）；正文找不到占位的图信息**追加在全文尾部**（不丢弃——
     WeKnora EnrichContentWithImageInfo 注释"images not found in content are
     appended as <image> blocks"同构，锚点对照 2）
  return FullText(正文=内联后全文, 图信息内联=True, …)
  ★ 对照的另一半（真文本闸，与主干三 t② 同一道闸提前宣讲）：enriched 也不是
     万能——扫描件 OCR 颗粒无收（VLM 空产，设计稿 50 空产闸不建块）时，内联完
     真文本仍不足 → 止步空页注记，不逼模型编（WeKnora 真文本闸同构——锚点对照 3）
```

正文解释：W-F50-2 的断言词是"**对照成立**"——不是"enriched 很好用"，是"不回读则产出空 Wiki 页"这件事作为对照在案。对照的两侧各有一半交付物：材料半边是设计稿 50 的（caption/ocr 子块落账在库），动作半边是本节的（回读五步）；W-F36-3 联查位（walkthroughs F36 行"m27 enriched 重建（W-F50-2 联查）——回读 caption/ocr 后内容非空"）在两稿合读时闭合。读这段还要防一个误读：**enriched 回读是"读子块"，不是"读图"**——图本体在对象存储（m5 既有面），管线里流动的是设计稿 50 已经看图说话过的文字；Wiki 管线对 VLM 零调用，这是"材料在库"四字的全部含金量（重调 VLM 的账见取舍 3）。空页分支也照实立着：真文本不足就出"无可提取文本"的注记页——空页如实、编造可耻（WeKnora 模板空内容规则"do NOT invent a topic"字面，锚点对照 3；设计稿 50 空产闸同族纪律——没有就注记，不编造）。

### 主干三：WikiWriter.write——32K 截断纪律+结构化页+重写≠检索（W-F50-3 的本体）

WeKnora 原文（引用主位——逐字两处；`wiki_ingest.go:39-40` 与 `wiki_ingest_batch.go:1199-1204`，commit 33c0333 实测）：

```text
	// maxContentForWiki limits the document content sent to LLM for wiki generation
	maxContentForWiki = 32768
```

```text
	content := reconstructEnrichedContent(ctx, s.chunkRepo, payload.TenantID, chunks)
	rawRuneCount := len([]rune(content))
	if len([]rune(content)) > maxContentForWiki {
		content = string([]rune(content)[:maxContentForWiki])
	}
	logger.Infof(ctx, "wiki ingest: doc %s chunks=%d content_len(raw=%d,truncated=%d)", knowledgeID, len(chunks), rawRuneCount, len([]rune(content)))
```

```text
伪代码（数据形状声明，非代码——FullText/WikiPage 为卡面返回类型的设计演绎展开）

FullText:  { 报告号, 正文: str, 正文块数, 图信息内联: bool }
WikiPage:  { 页号, 知识库 ID, 来源文档号, 标题, 索引摘要: 一句话,
             正文: Markdown（二级标题章节/关键参数表/结尾要点清单）,
             截断注记: None | {原始字数, 截后字数}, 生成模型别名, 生成时间 }
           # ★ 形状里没有 embedding/tokens 字段——"重写≠检索"的形状半边：
           #   页想进双索引，WikiPage 里没有可写的位置（与设计稿 63"出口形状闸"、
           #   设计稿 44"父块想索引没表达位"同款论证——结构属性，不是运行时禁令）
```

```text
伪代码 — app/wiki/writer.py:WikiWriter.write（m27；签名按卡逐字：
         WikiWriter.write(full_text, kb) -> WikiPage；
         卡面注释"LLM 重写结构化 Markdown；32K 截断纪律；重写≠检索（产出是文档不是索引）"
         是本函数合同——t① 是"32K 截断纪律"，t③ 是"结构化 Markdown"，t⑤ 是"重写≠检索"）

def write(self, full_text, kb) -> WikiPage:
    # t① 截断纪律——WeKnora maxContentForWiki=32768 同构（引用块上方两处）：
    重写料 = full_text.正文
    原始字数 = 字符数(重写料)                                # 按 rune 计不按字节（取舍 4）
    截断注记 = None
    if 原始字数 > 32768:
        重写料 = 重写料[:32768]
        截断注记 = {原始字数, 截后: 32768}                   # 截了要说话——注记随页走，
                                                            #   不静默吞（W-F50-3"截断纪律
                                                            #   生效并注记"字面；WeKnora 日志行
                                                            #   raw/truncated 双记同构）
    # t② 真文本闸（主干二已宣讲的对照另一半——材料不够就止步）：
    if 真文本字数(剥图标记(重写料)) < 下限:
        return WikiPage(索引摘要="无可提取文本", 正文=空页注记(不编造主题))
    #   WeKnora hasSufficientTextContent 同构——真源码注释（锚点对照 3）：
    #   没这道闸"LLM would have only image markup left and would happily
    #   fabricate entities/concepts"（只有图标记时模型会开心地编）
    # t③ 装配提示词（WeKnora WikiSummaryPrompt 同构——锚点对照 4；主角④：语言=中文）：
    提示词 = wiki 编辑者模板(
        内容=重写料,
        要求=[首行一句话索引摘要（供页清单列示）,
              关键事实/论断/结论全收，
              标题层级（二级=章节，三级=小节），
              结尾"要点回顾"清单，
              空内容规则=无实质信息就如实说无可提取，不编主题、不猜])
    #   摘要模型别名=kb 库级配置（设计稿 51 既有配置位——同一库级摘要模型族）
    # t④ 经网关重写（m2 唯一出口——设计范围 Touches modules"m2（重写走网关）"字面；
    #   模型流量唯一出口既有红线照守，零直连模型 API）：
    回复 = await Gateway.chat(messages=[系统=提示词, 用户=重写料],
                              model_alias=kb.摘要模型别名)      # 卡 m2 签名逐字
    # t⑤ 出页——产出是文档不是索引（卡面注释字面）：
    return WikiPage(标题与摘要=解析回复首行, 正文=回复.Markdown,
                    截断注记=截断注记, 生成模型别名=kb.摘要模型别名)
    # ★ 结构守法观察位：本函数体零 m14 表达式——没有 upsert 也没有 build，
    #   "重写≠检索"不是靠一句注释守着，是函数里根本没有那条代码线
    #   （设计稿 44 主干二"无写入路径三层守法"同款；捣乱路 4）
    # ★ 页的去处：m3 页面与版本落库（卡 m27 依赖行"m3（页面与版本落库）"字面；
    #   版本与一键回滚=设计稿 66 地盘，本节注记即止——"明确不讲的"）
```

WeKnora 原模板（引用主位——逐字节选；`internal/agent/prompts_wiki.go:60`、`:75-76`、`:80`、`:82`，commit 33c0333 实测；模板中 wiki-link 规则行为设计稿 65 地盘只注锚零解读）：

```text
const WikiSummaryPrompt = `You are a wiki editor. Given the following document content, create a structured wiki summary page in Markdown format.
…
3. Include the key facts, arguments, and conclusions.
4. Use proper heading hierarchy (## for sections, ### for subsections).
…
8. Write in {{.Language}}.
…
10. **Empty content rule**: If the <content> block above is empty, contains only image references with no extracted text, or otherwise carries no substantive information, output exactly: "SUMMARY: No textual content was extractable from this document." followed by a brief note explaining that the document could not be summarised. Do NOT invent a topic, do NOT guess from any other clue.
```

正文解释：三件事各有一句要读准的话。**截断纪律**的关键词是"并注记"——截断本身一行切片代码，要点全在注记：页上留着"原始 4.1 万字、送写 3.27 万字"，读者知道页尾可能缺章节（推演 3 的样张注记位）；WeKnora 那行日志 raw/truncated 双记是同构的诚实——截可以，偷偷截不行。**结构化页**的边界是"这页是给小李读的"：一句话摘要（5 分钟里先看的 10 秒）、标题层级（跳读的锚点）、关键参数表（完井方式/人工井底一见表收）、要点清单（读完带走的三五句）——这四样全是"文档的形状"，没有一样是"索引的形状"。**重写≠检索**是本节的核心认知（CONTEXT.md"Wiki 管线"词条字面"重写≠检索，产出是文档不是索引"），收口成四管线吃法对照：

```text
伪代码（对照声明，非代码——同一份 chunk 契约，四条管线四种怕（WeKnora 源码地图 §前言字面
       "向量怕缺上下文…图谱怕没实体…Wiki 怕拼不回全文…父块不索引只做命中后上下文扩展"
       的 petro 对号表；每行注交付设计稿，零新机制）

 ─────────────────────────────────────────────────────────────────────────
 管线        │ 怕什么         │ 对策（既有交付物）                │ 为谁而生
 ─────────────────────────────────────────────────────────────────────────
 向量投影    │ 缺上下文       │ 面包屑前缀（设计稿 45）               │ 被命中（机器）
 关键词投影  │ 同上族         │ 同一份组装料（设计稿 45）             │ 被命中（机器）
 图谱投影    │ 没实体         │ 挑选闸滤无正文块（设计稿 46/54）      │ 被遍历（机器）
 Wiki 投影   │ 拼不回全文     │ 重叠去重+图片回读（本节）         │ 被人读（小李）
 （父块      │ 不进索引       │ 只入账本命中后回捞（设计稿 44）       │ 垫上下文）
 ─────────────────────────────────────────────────────────────────────────
 读表法：四种怕各不相同，所以四种吃法互不可替代——Wiki 管线不是"第四个
 检索通道"，是报告库的可读化投影；页的检索入口是入口页与交叉链接（设计稿 65），
 不是把自己塞回向量库（捣乱路 4）
```

书侧同构（原书第三章:499，本节首引，正文短引）："**选择 Markdown 纯文本而非专用数据库作为知识的底层表达**，是一个看似反直觉但深思熟虑的工程决策。纯文本意味着用户可直接阅读、编辑和修正 Agent 的知识"——"可直接阅读"正是重写投影的立身之本：向量库里的小李什么都读不了，Markdown 页里她 5 分钟读完要点（PRD F50 字面）。

### 捣乱输入：四路——"按坐标硬裁、短重叠误裁、纯图片硬重写、顺手回写索引"

```text
伪代码（时序推演，非代码——捣乱打的是拼回与重写的误用位；判据全部在案）

路1  按坐标硬裁："重叠量不用文本匹配了吧——页码×块序算偏移差，一刀切掉就行"——
     🛡️ 按文本对齐闸拦（主干一去重件步 b：位置只定窗宽、裁剪按文本匹配——
        WeKnora 历史注释为判据：表格补写头是零宽度的、HTML 实体字符数超区间，
        "位置公式裁剪重叠…导致拼接错位、丢字或重复"逐字在案）：
        坐标裁的翻车样：补写表头的块被裁走真实正文/实体串被裁半截——
        错位不可逆，页面上少一段没人发现
路2  短重叠误裁："两块开头都是'|---|---|'，当重叠裁掉省事"——
     🛡️ 最短匹配长度闸拦（主干一步 b 下限 12 字：WeKnora 字面"太短（如表格分隔行
        |---|）容易误匹配，因此忽略"）+ 🛡️ 保守回退闸（步 c：找不到文本重叠
        原样拼接——WeKnora"prefers small duplication over silently dropping
        edited content"逐字；宁页上一句重复，不替读者丢一句原文，取舍 2）
路3  纯图片文档硬重写："图册也直接调模型写页——图链喂进去，模型自己看"——
     🛡️ enriched 回读闸+真文本闸双拦（主干二五步+主干三 t②：图链裸喂的
        实测结局=WeKnora 注释字面"produce empty or 'no textual content' output"；
        真文本仍不足时空页注记收场——WeKnora 模板空内容规则"Do NOT invent a
        topic"字面；设计稿 50 空产闸同族纪律）：
        双拦的次序要读准：先给机会（回读子块——设计稿 50 的钱不白花），再谈放弃
        （真不足才空页）——直接放弃是偷懒，直接硬写是造谎
路4  顺手回写索引："页写得这么好，也进向量库让检索命中它不是更好？"——
     🛡️ 单向投影闸拦（设计范围边界红线字面"Wiki 只读 m14/m3 chunk 公开面、不回写
        索引"+边界规则表版本 4 增补行"m27 Wiki 管线写 m14 索引…投影方向单向：
        chunk→页"——理由栏"防'改了 Wiki 页却污染检索索引'的隐性回路"）：
        结构半边：write 函数体零 m14 表达式、WikiPage 形状零索引字段（主干三
        t⑤+形状声明）——想写写不进（设计稿 44 同款守法）；语义半边：页被找到的
        合法路=入口页与交叉链接（设计稿 65 地盘），页混进索引=模型加工的话反过来
        当"报告原文"被引用——引用链被污染（检索引用要求可回链原文位置，
        设计稿 10/47 既有面），一页"写得太好的二手转述"恰恰是最危险的索引原料
可观察行为：四路全拦后 Wiki 投影的承诺只剩两句——拼回的每一段都能回链账本
     （正文块号在账本可查，页是重建物不是造物），页始终在索引之外
     （入库前后双索引行数零变化，推演 3 观察位）
```

闸在哪：①**开关闸**（strategy.Wiki——设计稿 46 既有，关=管线不存在零调用零开销）；②**账本只读面闸**（list_chunk_meta/get_chunks_by_ids 公开面——零直连索引对象，主干一 t①）；③**原料纯度闸**（t② 只取 text/child——检索加工物与图说明块不入拼回）；④**按文本对齐闸**（去重件步 b——位置定窗宽文本做裁剪，路 1 判据）；⑤**最短匹配+保守回退闸**（12 字下限+不命中原样接，路 2 判据）；⑥**enriched 回读闸**（先回读后放弃的次序合同，路 3 前半判据）；⑦**真文本闸**（不足止步空页注记不编造，路 3 后半判据）；⑧**截断注记闸**（32768 截断双记 raw/truncated）；⑨**网关闸**（m2 唯一出口——Gateway.chat）；⑩**单向投影闸**（零 m14 表达式+形状零索引字段，路 4 判据）。拦完数据去哪：正文块/子块账本零改动（只读），页落 m3 页面与版本落库（卡 m27 依赖行；版本机制设计稿 66）；推演全程零数字进页（样张参数全为设计稿 44 备案语料行字面，主角数据④）。主干一大图为后续场景化交付的第四投影站素材——同一份 chunk 的四种怕对照表就是那一幕的对账地图；四管线吃法对照表与"重写≠检索"论断是知识库产品化讨论的答法骨架。

### 走查推演 1（W-F50-1）：200 页报告的拼回——重叠去重全程

```text
伪代码（时序推演，非代码——给定栏"重叠分块的文档"；主角②，设计稿 44 备案语料沿用）

t0 工单到位：volve-completion-01 入库时 Wiki 开=开（策略档替身——默认档 Wiki 关，
   设计稿 46 既有；本报告按阿强显式开的库走查，主角数据⑤），dispatch 发 Wiki 生成工单
t1 读账本：list_chunk_meta(volve-completion-01) → 全量块行
   （正文子块 child 若干+父块 parent 若干+摘要 1+问题块若干——设计稿 44/51 产物在库）
t2 只取正文：child 入选；父块/摘要/问题块全排除（主干一 t② 清单——摘要块若混入，
   拼回文里会多出"本报告概述了…"的模型转述段，原文重建物被污染）
t3 排序：（页码, 块序）恢复阅读次序——p13→p15 的"完井方式"节各子块归位
t4 重叠去重三情形（主干一去重件四步各对一情形）：
   情形 A（同父块相邻子块）：c3 末尾与 c4 开头共享重叠窗（设计稿 44 参数 10–20%，
   窗宽替身取 15%×块长，主角数据⑤）——步 b 文本对齐命中 k=窗内最长公共段
   （样张行"……套管射孔完井，人工井底 2788 m"在窗内逐字相同）→ 裁一份接上；
   ★ 通顺判据：拼回文该句只出现一次，前后文衔接无断口
   情形 B（跨页有间隙）：全页图表页零文本块（页码跳号）→ 步 a 位置重叠≤0
   → 直接拼接不裁剪（页间自然分节，硬找重叠反而危险——路 2 同源）
   情形 C（重复上传段）：同一段整块重复（v1 残留块示例）→ 步 d 完全包含
   → 整块跳过零新增
t5 产出：FullText(正文=通顺无重复段全文, 图信息内联=False)
可观察行为（W-F50-1 断言全句成立）："只取 text 块拼回"=t2 排除清单+"重叠部分
   去重后全文通顺无重复段"=t4 情形 A 裁一份+情形 C 收重复——三情形全过，
   拼回文交到小李手里读得下去
```

### 走查推演 2（W-F50-2）：纯图片图册两分支对照——回读与不回读

```text
伪代码（时序推演，非代码——给定栏"纯图片文档"；主角③图册（替身声明⑤），
       走查栏"enriched 重建回读 image_ocr/caption"；W-F36-3 联查）

分支 A（对照侧——不回读，WeKnora 不设 enriched 的世界）：
  a1 主干一 t② 后正文块清单为空（扫描件零文本块）→ 全文=空
  a2 重写料空 → 真文本闸命中 → 空页注记"无可提取文本"
  ★ 对照成立：不回读则产出空 Wiki 页——图的信息明明在库（设计稿 50 caption/ocr
     子块落账），页上却一个字没有
分支 B（enriched 侧——本节机制，主干二五步）：
  b1 拼回正文先行（空正文照走——五步次序不因内容空而跳步）
  b2 收宿主号：正文块空的图册走父块直查（宿主父块号集=图册各页父块，
     设计稿 50 两级链既有形状）
  b3 查图片子块：get_chunks_by_ids → image_caption/image_ocr 行族命中
     （设计稿 50 交付物：每图两类子块、空产不建块——图 1 岩性柱状图的说明文字在库）
  b4 合并：同图 caption+ocr 对齐成一条图信息
  b5 内联：全文尾部追加图信息块（正文无占位可挂——步⑤"找不到占位追加尾部"
     正是纯图片文档的主路径）
  → FullText(正文=图说明+识别文字汇编, 图信息内联=True)
  b6 重写：真文本闸放行（caption/ocr 是真文本）→ Gateway.chat → 图册页
     （样张：每图一段"图 X：岩性柱状图，标注…"——主角④同族替身）
可观察行为（W-F50-2+W-F36-3 断言全句成立）："回读 caption/ocr 后内容非空"=
   b3–b5 非空全文；"不回读则产出空 Wiki 页的对照成立"=分支 A 全程——
   两分支同一份库账，唯一差一步回读：材料半边（设计稿 50）+动作半边（本节），
   对照两侧在案闭合
```

### 走查推演 3（W-F50-3）：4.1 万字符报告截断+重写出页——重写≠检索观察位

```text
伪代码（时序推演，非代码——给定栏"超长文档（>32K）"；主角②+替身数字⑤）

t0 拼回完成：FullText 正文 raw=41000 字符（替身数字——200 页英文报告正文量级，
   PRD 只给页数）
t1 截断：41000 > 32768 → 重写料=前 32768 字符，截断注记={原始: 41000, 截后: 32768}
   （主干三 t①——注记随页走，页脚可见"本页由前 32768/41000 字生成，
   尾段未入写"——推演样张注记位，替身措辞）
t2 真文本闸：正文充足 → 放行
t3 提示词装配：wiki 编辑者模板+语言=中文（主角④——PRD F50"中文结构化 Wiki"字面）
t4 经网关：Gateway.chat(messages=[系统=提示词, 用户=重写料],
   model_alias=kb.摘要模型别名)（设计稿 51 既有配置位；m2 记账/冷却/重试既有面零重讲）
t5 出页：WikiPage 样张（主角④）——
   索引摘要："N-2 井完井方式与关键参数报告的中文结构化摘要页"（一句话替身）
   正文：## 完井方式（套管射孔完井——设计稿 44 备案语料行字面）
         ## 关键参数（人工井底 2788 m 同上行；井型 EW 采油——A.1 字面）
         ## 要点回顾（三五条替身要点）
   截断注记={41000, 32768}
   ★ "5 分钟读完要点"的兑现读法：200 页→一页的压缩不是摘要算法压缩，
     是重写投影的形状压缩——小李读的是"页"，检索命中的才是"块"
t6 重写≠检索观察位：入库前后 m14 双索引行数零变化（页不在向量库也不在倒排——
   WikiPage 形状零索引字段+write 函数体零 m14 表达式，路 4 结构半边）；
   页本体在 m3 页面落库行可查（卡 m27 依赖行）
可观察行为（W-F50-3 断言全句成立）："截断纪律生效并注记"=t1 双记+页脚注记位；
   "产出结构化 Markdown 页（摘要/关键参数/表格）"=t5 样张四件套；
   ""重写≠检索"论断在案"=t6 零变化观察位+主干三对照表+CONTEXT.md 词条字面
```

## 关键判断的取舍记录

1. **重叠裁剪按文本对齐，不按坐标公式。** 备选"按页码×块序推坐标差直接裁（少一次文本匹配，快）"：否决——WeKnora 真实翻车史在案（主干一引用块：位置公式默认"字符数==坐标差"，表格补写头零宽度、HTML 实体超长两类日常数据即破坏不变式，"拼接错位、丢字或重复"）；petro 语料是 PDF 解析产物（表格/实体同样存在），坐标可信假设立不住。落定：位置只定窗宽（设计稿 44 重叠窗参数已知，窗宽免费），裁剪按文本对齐（12 字下限防误匹配）。换边条件：若 petro 分块器升级为坐标强契约（逐块校验字符数==坐标差），可换坐标直裁省一次匹配——改动收在 `_append_with_overlap` 步 b 一处。
2. **匹配失败宁重复不丢内容。** 备选"匹配失败按窗宽上限硬裁（看起来更干净）"：否决——硬裁=拿猜测当事实删原文，错裁不可逆且无人发现（页面上少一段没人知道）；WeKnora 同款保守回退注释逐字在案（"intentionally prefers small duplication over silently dropping edited content"）。落定：失败原样拼接，页上留重复是可修的瑕疵（人工编辑——设计稿 66 地盘注记），丢原文是不可修的事故。换边条件：无（与 WeKnora 同向）。
3. **enriched 回读只读子块账本，不重调 VLM。** 备选"拼回时图信息缺失就现调 VLM 补看（数据更新鲜）"：否决——caption/ocr 在设计稿 50 入库时已生成落账，重调=同图重复计费（设计稿 46 挑选闸"防重复计费"同款账）；且管线产出不确定性增加（两次看图说法可不同——页与子块账本对不上）。落定：只读账本，缺失按缺失处理（真文本闸兜底空页注记）。换边条件：入库时多模态路未跑（开关后补开）的存量文档需要 Wiki 时，走补跑多模态扇出的既有路（设计稿 46 dispatch 重发），不在 Wiki 管线内私调模型。
4. **截断按字符（rune）计数，不按字节。** 备选"按字节数截 32768（与 WeKnora 常量同数字）"：否决——32768 在 WeKnora 是 rune 数（`len([]rune(content))` 逐字在案），中文 UTF-8 每字 3 字节，按字节截会把送写的实际内容砍到约三分之一且可能截出半截字；"32K"的设计口径是"3.2 万字"不是"3.2 万字节"。落定：按字符计数（取舍与 WeKnora 同口径，主角数据⑤备案）。换边条件：无。
5. **"重写≠检索"落成结构，不落成运行时禁令。** 备选"加一道'页入索引检查闸'，发现页被 upsert 就报警"：否决——与设计稿 63 取舍 2、设计稿 44 主干二同款论证：结构上没有写入路径（write 函数体零 m14 表达式+WikiPage 形状零索引字段）时，检查闸防的是一个不存在的动作，白付一处审计成本；"产出是文档不是索引"是形状属性不是运行时约定。落定：单向投影闸=形状与代码线双半边（主干三 t⑤+形状声明），捣乱路 4 只推演诱惑不设闸位。换边条件：无。
6. **重写语言按库配置走，模板带语言参数。** 备选"固定中文（平台用户就是中文人）"：否决——F6 语料本身是英文报告，语言是库的消费属性不是平台属性（上级单位/外协场景的库可能是英文页）；WeKnora 模板 `Write in {{.Language}}` 同构（锚点对照 4）。落定：kb 库级配置带语言位（主角④按 PRD 字面取中文），模板参数化。换边条件：无。

## 锚点对照精要

**WeKnora 真源码（commit 33c0333，实测——本节引用主位）**：① `wiki_ingest.go:2859-2877` reconstructContent 注释与函数体（"This only concatenates text-type chunks…Callers that need the full enriched content…should call reconstructEnrichedContent"——主干一 t② 排除清单与 enriched 分流的原判据；函数体三行：text 过滤+`searchutil.MergeTextChunks(textChunks, "\n")`）；② `wiki_ingest.go:2879-2935` reconstructEnrichedContent（"Without this enrichment, image-heavy documents…produce empty or 'no textual content' output"——W-F50-2 对照的 WeKnora 原话；函数体顺序=先 reconstructContent 后查子块内联，主干二五步的同构源）；③ `wiki_ingest.go:39-40` maxContentForWiki=32768 与 `wiki_ingest_batch.go:1199-1204` 截断+`content_len(raw=%d,truncated=%d)` 日志行（W-F50-3"截断纪律生效并注记"的 WeKnora 原话——双记即注记）；④ `wiki_ingest_batch.go:1207-1219`+`wiki_ingest.go:3178` hasSufficientTextContent（"Refuse to run LLM-based extraction when the document carries no real text…would happily fabricate entities/concepts"——真文本闸原判据）；⑤ `searchutil/chunkmerge.go:12-17/:72-86/:88-94/:100-110`（保守回退/按文本匹配中文注释/12 字下限/位置≤0 直接拼——主干一去重件四步的逐条同构源）；⑥ `searchutil/imageinfo.go:55+/:202+/:270-274`（按块号收图信息/合并/内联+尾部追加——主干二 ③④⑤ 同构源）；⑦ `agent/prompts_wiki.go:52-85`（文件名不进提示词注释——"feeding such filenames to the model invites hallucinated summaries"，防幻觉细节注记位；WikiSummaryPrompt 开场句/关键事实/标题层级/语言参数/空内容规则——主干三 t③ 模板同构源；其中 wiki-link 规则行=设计稿 65 地盘只注锚）。**WeKnora 复刻稿源码地图** §前言"四种吃法/四种怕"（四管线对照表的字面源）+§5.1 Wiki 条目（行号漂移备案①：2865→实测 2867、2883→实测 2885，maxContentForWiki:40 相符）。**调研报告**：§3.4 编排行（Wiki 一路在枢纽编排列——设计稿 46 已备案同节）、§1.1"自动 Wiki 生成…Markdown 知识库…人工编辑、版本历史与一键回滚"（F50–F52 全线口径位）、§4.2"Wiki 图谱可视化…与 Neo4j GraphRAG 是两回事"（设计稿 54 对照注记位）。
**原书第三章（本节首引）**：`:499` Markdown 范式——"选择 Markdown 纯文本而非专用数据库作为知识的底层表达…纯文本意味着用户可直接阅读、编辑和修正 Agent 的知识"（正文短引）="产出是文档"的书侧总判据（可读可编辑；Git 版控半句归设计稿 66 注记）。外部参考仓零引用如实声明（本体域无文档投影语义、交互层域 F50 属报告库投影）。
**CONTEXT.md 词条（版本 4 增补术语，零新增）**：①"Wiki 管线"——"报告→拼回全文（重叠去重+图片回读）→LLM 重写 Markdown 页→自动交叉链接→版本回滚；重写≠检索，产出是文档不是索引"——本设计稿全稿是该词条前半段（拼回+重写）的机制展开；②"chunk 契约"——"四条管线各自投影的同一份知识卡片，吃法不同原料都是它"——四管线对照表的词条底座；③"四开关"（扇出位的开关闸）；④"父子分块"（拼回原料的形状来源）；⑤"断言观（is/ought/means）"（页是 is-记录的可读化知识层表达、chunk 是证据层——分离成文归设计稿 66，本节注记位）。
**PRD F50（docs/prd.md）**："做什么"逐条对齐——chunk 拼回重叠去重（主干一）、图片信息回读防空（主干二+推演 2）、LLM 重写结构化 Markdown 页摘要/关键参数/井号（主干三 t③/t5 样张——井号链接的"链接"半边归设计稿 65，本节页上只有井号字面）、32K 截断纪律成文（主干三 t①）、重写≠检索（对照表+t6 观察位）；"不做什么"对齐——不做多文档聚合（入口页归设计稿 65）、不改原始报告库（只读账本+页落 m3 独立落库）；业务逻辑要点（"200 页英文 Volve 完井报告→一页中文结构化 Wiki，小李 5 分钟读完要点"=推演 3 全程逐拍字面）；信源锚点（WeKnora 三件+原书第三章 §OpenViking Markdown 范式）实测兑现。
**模块卡 m27/m22/m2/m3/m14（签名唯一来源+兑现位）**：卡 m27 两签名与卡面注释逐字（主干一/三块首）、目录 `app/wiki/`（reconstruct.py、writer.py——本节两文件落点；linkify.py、revisions.py 归设计稿 65/66 零触碰）、依赖行"m2（重写走网关）、m3（页面与版本落库）、m14（读 chunk 公开面，不回写索引）"（主干三 t④/t6 与越界自查主判据）、Adapter FakeWiki（头部声明）；卡 m22 dispatch 签名与 Wiki 路两行（主干零消费位——设计稿 46 既有）；卡 m2 Gateway.chat 签名（主干三 t④）；卡 m3 list_chunk_meta/get_chunks_by_ids 签名（主干一 t①）；卡 m14 扩容注释"FAQ 块/摘要块/问题块/图片子块复用同一六函数双写，metadatas 带 chunk_type 区分"（t② 排除清单的类型依据）与"父块表只入不索引"行（单向投影的同族先例）。边界规则两行（版本 4 增补）："m27 Wiki 管线写 m14 索引…投影方向单向：chunk→页"（越界自查主语行）+"图谱/Wiki 后处理绕过 m22 分发枢纽自行挂接入库管线（扇出唯一出口=PostProcess.dispatch）"（主干零消费位判据）。
**设计稿 44/46/50/09/51（只消费不改动）**：设计稿 44（父子分块形状全family——块号规则/重叠窗参数/chunk_type 行族/父块不索引 INV/语料行"套管射孔完井，人工井底 2788 m"备案字面——主角②与推演 1 原料；"无写入路径三层守法"同款论证——捣乱路 4 结构半边）；设计稿 46（四开关/dispatch 扇出/挑选闸防重复计费——扇出位与取舍 3 计费账；"关=管线不存在"语义）；设计稿 50（caption/ocr 子块落账=材料半边/两级链 parent_id 形状/空产闸=真文本闸同族/"enriched 回读动作是设计稿 64 地盘"头部声明的兑现——主干二全程）；设计稿 09（解析分块件——拼回原料的上游，零重讲）；设计稿 51（摘要/问题块=检索替身——t② 排除对象与库级摘要模型配置位）。
**设定书（取材锚——业务事实零新增）**：§1（渤海油田分公司组织字面+角色卡"质量管理员｜地质研究所（小李兼）"——消费主角锚）；附录 A.1（N-02/well_name 渤中28-1-N2/well_type EW 采油——样张参数字面；"旧写法 N2/N-2 并存"字面=页上井号写法的注记位）；§2/§3/§4/§5/§6/§7/§8/附录 A 其余零新引。版本 4 业务事实零新增——图册扫描替身/字数替身/页样张=走查注入替身（主角数据③④⑤逐项声明）；语料本身=F6 既有（PRD 取材声明字面）。
**walkthroughs F50（验收合同）**：W-F50-1（给定"重叠分块的文档"/走查"`app/wiki/reconstruct.py:Reconstructor.rebuild`"/期望"只取 text 块拼回；重叠部分去重后全文通顺无重复段"=主干一 t②–t④+推演 1 三情形合同原文——逐句兑现）；W-F50-2（给定"纯图片文档"/走查"enriched 重建回读 image_ocr/caption"/期望"内容非空；不回读则产出空 Wiki 页的对照成立（W-F36-3 联查）"=主干二五步+推演 2 两分支合同原文——对照两侧闭合）；W-F50-3（给定"超长文档（>32K）"/走查"`writer.py:WikiWriter.write`"/期望"截断纪律生效并注记；产出结构化 Markdown 页（摘要/关键参数/表格）；'重写≠检索'论断在案"=主干三 t①/t③/t⑤+推演 3 合同原文——逐句兑现）——三条断言全句兑现，幽灵断言 0。

## 越界自查（源：modules.md 边界规则表）

- **设计范围边界红线"Wiki 只读 m14/m3 chunk 公开面、不回写索引（投影方向单向 chunk→页）"**：全稿对 m14 六函数零调用（rebuild 读 m3 账本公开面、write 无存储调用——页落库注记为 m3 依赖行字面）；捣乱路 4（回写索引拦）+取舍 5（结构属性不设运行时闸）+推演 3 t6 零变化观察位；WikiPage 形状零索引字段。
- **图谱/Wiki 后处理绕过 m22 分发枢纽自行挂接入库管线（扇出唯一出口=PostProcess.dispatch）（版本 4 增补行）**：本节消费位=dispatch 的 Wiki 路（设计稿 46 既有两行只注位）；管线内零二次挂接零主动扫库——rebuild 只被工单驱动（推演 1 t0），入口唯一。
- **m2 唯一出口（既有行）**：重写调用=Gateway.chat 卡面签名逐字（主干三 t④）；enriched 回读零模型调用（取舍 3——读账本不读图）；全稿零直连模型 API。
- **m14 消费方直接操作 Chroma/rank_bm25 对象（既有行）**：本节对双索引对象零触碰——连读都不经 m14（读的是 m3 账本，比"只走六函数"更退一步）。
- **父块进 m14 双索引（既有 INV 行）**：本节零索引写入位（与上条同源）；拼回把父块也排除在原料外（t②——父块是回捞件不是原文件，设计稿 44 语义沿用）。
- **明确不讲的零出现自查**：交叉链接/入口页/linkify 零展开（设计稿 65——WeKnora 模板 wiki-link 规则行只注锚零解读；Linkify.link 签名零引用）；版本/回滚/知识层证据层分离零成文（设计稿 66——只注记"页落 m3 版本落库"依赖位；Revisions 双签名零引用）；多文档聚合零出现（入口页零提及为产物）；改原始报告库零出现（全稿对报告库只读）；实体页/概念页抽取零展开（WikiKnowledgeExtractPrompt 只注锚）；Wiki 图谱可视化零展开（§4.2 只注锚）；多模态子块生产零重讲（设计稿 50——只消费落账产物）。
- **签名纪律**：全稿公开签名五件且零自造——`Reconstructor.rebuild(doc_id) -> FullText`/`WikiWriter.write(full_text, kb) -> WikiPage`（卡 m27）+`PostProcess.dispatch(doc_id, strategy) -> None`（卡 m22）+`Gateway.chat(messages, model_alias, stream=False, tools=None) -> ChatResult | TokenStream`（卡 m2）+`Repository.list_chunk_meta(doc_id) -> list[ChunkMeta]`/`Repository.get_chunks_by_ids(ids) -> list[ChunkMeta]`（卡 m3）。`_merge_text_chunks/_append_with_overlap/enriched 分支五步/真文本闸/空页注记`（模块内私有件与内联判断——WeKnora MergeTextChunks/AppendWithOverlap/reconstructEnrichedContent/hasSufficientTextContent 设计演绎对应，头部声明与取舍备案，非公开签名发明）；`FullText/WikiPage 形状/四管线吃法对照表/三情形推演/两分支对照/页样张`（数据形状与走查叙述件逐项声明）。框架红线"无新增"履行（零新替身零新 Adapter——FakePostProcess/FakeWiki 卡面既有）。
- **取材红线自查**：全稿业务事实仅三类且全为既有——角色（§1 小李字面+CONTEXT.md 角色表）、语料（F6 既有 Volve 报告库——PRD 取材声明字面；样张行=设计稿 44 备案字面；井名井型=A.1 字面）、对象（图册=设计稿 50《N-2 井完井附图册》同族替身）；字数/重叠窗取值/页样张措辞=替身（主角数据⑤声明）；技术口径（WeKnora 源码七处引用块、卡面注释、原书第三章 :499、源码地图、调研报告三处）全部注锚（实测核对——漂移备案①行号差 2 格如实备案，maxContentForWiki 数值实测相符；外部参考仓零引用如实声明）。
- **架构大图同步**：diagrams/petro-agent.html 按设计范围图节点清单推进——**新增容器 C27 Wiki 管线**（容器头"进入： 枢纽扇出的分块账本 · 节拍： 离线入库驱动 · 退出： 结构化 Wiki 页"）+**2 节点**（wiki_reconstruct 拼回重建：只取正文块按原文次序拼回+相邻块重叠区按文本对齐去重宁保留不误删+纯图片文档回读图片描述与图内文字子块内联防空白页；🛡️ wiki_writer Wiki 重写页：超三万二千字截断并注记+经网关重写成结构化 Markdown 页摘要/关键参数/表格+产出是文档不是索引+只读分块账本零回写检索索引投影方向单向 chunk→页）+**3 条边**（设计范围边声明"枢纽→Wiki 扇出、chunk→拼回→Wiki 页"按箭头逐条落图：①post_process_hub→wiki_reconstruct 实线扇出（设计稿 50/51/54 扇出边同族）②repository→wiki_reconstruct 虚线只读面（chunk 账本落库在 C8 实际容器——设计稿 59/61"设计范围字面落实际容器"先例）③wiki_reconstruct→wiki_writer 实线站间流）；落图前后实测既有 176 条边（0–175=62 实线+114 虚线，设计稿 63 落账一致）零漂移，落图后 179 条（0–178）；新边追加在边序列末尾防 linkStyle 序号漂移，linkStyle 最大 101 零触碰；节点明细表增 2 行（wiki_reconstruct/wiki_writer——插 os_dual_channel 行后与图序一致）；防护清单表增 1 行（设计稿 64｜wiki_writer——🛡️ 语义"防超长打爆上下文与费用+防改页污染检索"为本节新登记，设计稿 44 parent_chunk_table 盾行先例：INV 语义节点登记盾行，此前 C22–C26 机制节点零重复登记先例不适用于本节——Wiki 单向投影无既有盾行承载）；既有节点/边/表行/图头部计数文字（历史陈货）零改动；编辑用唯一锚点定点插入四处（容器/边/两表），零批量正则（防全文件污染纪律）；标签全角引号零裸引号校验零失衡；图上零文件名/零函数名/零端口/零路由。
- **零代码红线**：全文代码块均标注"伪代码"；无 tests/、无 CI 内容；零 SQL 语句（读账本走 Repository 公开面函数，零裸 SQL）；零服务端搭建。
