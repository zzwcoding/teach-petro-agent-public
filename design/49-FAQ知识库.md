# 设计稿 49：FAQ 知识库

> **红线声明**：本设计稿零真实可运行代码。全部代码块均为**伪代码**（块首标注"伪代码 — 文件:函数"或"伪代码（时序推演，非代码）"）——例外仅 WeKnora 生产代码**原注释引用块**（逐字照抄原文，块首注文件行号与 commit 号，解释全在正文不混进引用块；块内"…"为行省略号，省略行不参与断言）。公开签名取自模块卡逐字：`FaqRegistry.upsert(qa_pair) -> None` / `FaqRegistry.search(query, top_k) -> [FaqHit]`（卡 `m6`——卡面注释"FAQ 一等知识：一条问答对一个 chunk 直入索引、不走解析管线；相似问合并/负例问题不索引/召回不足迭代扩检≤5 轮翻倍（F35）"与"与 m18 golden 问答对分账：golden=评估资产，FAQ=服务资产，可互转不混用"是本节结构合同）；既有签名按字引用即止：`VectorStore.upsert / Bm25Index.build / …六函数`（卡 `m14`，设计稿 08 地盘）、`Repository.save_chunk_meta(meta)` / `Repository.get_chunks_by_ids(ids)`（卡 `m3`，设计稿 09 地盘）、`Retriever.search / Ranker.rerank / Generator.answer`（卡 `m6`，设计稿 10 地盘）。**框架红线：无新增**（设计范围声明——不做 FAQ 自动挖掘故 upsert 零生成调用，嵌入走 m2 既有 embed 面；替身沿卡 `m6` FakeRag/FakeEmbedder 与卡 `m14` FakeIndex 既有形状，零新替身）。
> **两条索引选项轴（选项制词条，CONTEXT.md）**：FAQ 块入索引前有**两根旋钮**——①**问答轴**（答案进不进索引内容：question_only / question_answer）与②**问题轴**（标准问与相似问合并成一条索引项，还是每问一条独立索引项：combined / separate）。缺省=question_answer+combined（WeKnora `EnsureDefaults` 同构实测）。两轴都在**入库期**定形状（主干一⑥），检索期只按形状兑现——W-F35-2"合并命中同一条 FAQ；分离索引选项可对照"的机制底座：合并档靠"索引内容拼装"，分离档靠"chunk_id 归并保最高分"（主干二④），殊途同归到**一条 FAQ 在融合池里只占一个坑**。
> **边界红线落位（设计范围合同）**："FAQ 不经 m6 Indexer 解析管线（独立入库面）"落成结构位：upsert **直造 chunk 直写索引**（主干一⑤⑥——没有解析、没有分块、没有父子两层，一问一答一个 chunk 即检索单元）；同时**不经设计稿 46 分发枢纽**——C22 枢纽管"入库分块产物"的后处理四路（摘要/问题/图谱/Wiki），FAQ 没有分块产物可后处理，是入库面的平行入口不是第四路（越界自查详）。"检索侧复用 m14 六函数"落成结构位：FAQ 块与报告块**同索引同融合池**（主干二②），负例否决与迭代扩检是 FAQ 块的检索期后处理，不是第二条检索管道。
> **指纹口径（两层数据纪律，取舍 1）**：导入去重的 SHA256 指纹**算在归一化副本上、库存的是原始串**——问句走七步归一化（去首尾空白/去 URL/转小写/去首尾标点/繁转简/全角转半角/智能空格），答案只做去空白去重**不归一化**（答案是要原样展示的成文，不是匹配键）；指纹串=标准问|相似问（排序后）|负例（排序后）|答案（排序后），数组排序保证"同内容不同顺序"同指纹（WeKnora `CalculateFAQContentHash` 注释逐字，主干一引用块）。
> **负例语义（本节最反直觉的判断，取舍 2）**：负例问题**只登记不进索引内容**（WeKnora 原注释"负例不应该包含在 Content 中，因为它们不应该被索引"——主干一引用块）；"检索不可达"的落点是**命中否决**——查询问句与某条负例**归一化后全等**才否决（本设计稿判据；WeKnora 实测是 TrimSpace+ToLower 后全等，连问号都不剥——本设计稿用与指纹同刻度的七步归一化堵住"多一个问号就漏拦"的变体口子，取舍 2）。**全等不是相似**：一字之差放行（捣乱输入 B 路 1 如实演）——负例是"点名豁免"不是"语义豁免"。
> **接线边界**（对既有设计稿只调用不重讲）：对设计稿 10 **零改动**——FAQ 块走既有混合检索/RRF 融合/精排/生成/无据拒答闸全链，FAQ 候选同池同闸（闸判据"候选空或全低分"零改动）；对设计稿 44 **零冲突**——FAQ chunk 无父子两层（一问一答即检索单元），"父块不索引"INV 不涉及；对设计稿 45 **零触碰**——FAQ 不走组装器（直造内容即索引输入，对照位一句话）；对设计稿 46 **零触碰**——不经分发枢纽（边界红线落位见上）；对设计稿 47 **衔接不重讲**——负例否决后空集与扩检不足额的收场落既有 `answer_or_fallback` 分岔位，零新增信号类型；对设计稿 48 **零展开**——复合重排留的 chunk_type 判定位本节仍不启用（FAQ 分数加成 WeKnora 有、PRD F35 未纳，取舍 6）；对设计稿 23 **零调用**——golden 分账是声明不是接线，本节零 `GoldenStore` 调用。
> **行号核对声明（WeKnora 信源纪律）**：本设计稿所引 WeKnora 源码均经真源码实测核对——`git clone --depth 1` 于 commit `33c0333`（与设计稿 44-48 同 commit），`internal/application/service/knowledge_faq.go`（全 2005 行过目：创建直入索引 ：115-244、负例不进 Content 注释 ：1642-1643、问答对冲突校验 ：1656-1753、chunk 内容拼装 ：1633-1651、索引内容拼装 ：1890-1904、合并/分离索引项 ：1907-2004）、`internal/application/service/knowledge_faq_import.go`（全 2917 行过目：四阶段校验注释 ：475-484、批内标准问去重 ：529-560、合并候选与指纹不变即跳过 ：1066-1090、replace 模式指纹批筛 ：1178-1258、`indexFAQChunks` 直入索引 ：2013-2079）、`internal/application/service/knowledgebase_search_faq.go`（全 316 行逐行过目：后处理分岔 ：24-55、迭代扩检全函数 ：73-223、负例过滤非迭代路径 ：226-296、负例全等判据 ：300-316）、`internal/application/service/knowledgebase_search.go`（:287-289 检索调用位）、`internal/application/service/knowledgebase_search_fusion.go`（:68-72 chunk 级归并）、`internal/application/service/chat_pipeline/merge_faq.go`（全 134 行：答案回填 ：11-97、答案内容拼装 ：100-134）、`internal/types/faq.go`（全 775 行：元数据五件套 ：17-25、Sanitize/Normalize 两层 ：114-144、ContentHash 计算 ：185-248、七步归一化 ：576-608、查询归一化 ：766-770、答案策略 ：250-258）、`internal/application/service/knowledge_faq_create_guard.go`（全 89 行：并发创建守卫）、`internal/types/knowledgebase.go`（:38-56 两轴枚举、:713-767 FAQConfig 缺省）、`internal/application/service/chat_pipeline/rerank.go`（:205-217 FAQ 加成）。**漂移备案**：PRD F35 记"knowledge_faq.go：……迭代扩检最多 5 轮"——实测迭代扩检在 `knowledgebase_search_faq.go`（knowledge_faq.go 是登记/校验/索引形状侧），照设计稿 45/47/48 勘误先例如实备案不硬凑旧行号，机制描述不作废。
> **明确不讲的**（设计范围·伪代码梳理范围 + PRD F35"不做什么"）：FAQ 自动挖掘（设计范围——问题从哪来是人工/审核入库的事，本节零生成调用，书 §3.3 提炼论对照见锚点对照）；FAQ 分数加成（WeKnora `rerank.go:205-217` 实测在位——`min(score×boost, 1.0)` 乘法放大，PRD F35 未纳、本设计稿不收，取舍 6 一句划界）；golden 问答对机制本体（m18 `GoldenStore`/`ResultGrader` 是设计稿 23 地盘，本节只做分账声明）；答案策略 random/all（WeKnora `AnswerStrategy` 实测在位——本设计稿取 all 一档）；并发创建守卫（WeKnora `faqCreateGuard` 实测在位——标准问哈希占位防并发重复建块，本设计稿单窗口零并发，锚点对照留一句）。

## 实现清单

- [x] 一条问答对一个 chunk 直入索引、不经过解析/分块管线、导入归一化 SHA256 去重（源：W-F35-1）✅ **主干一**（直造 chunk 直写双路索引+七步归一化+SHA256 指纹+批内/库内两道去重闸）+ **走查推演 1**（3 条导入：1 跳过+1 入库+1 失败册）+ **捣乱输入 A**
- [x] 相似问合并命中同一条 FAQ；分离索引选项可对照（源：W-F35-2）✅ **主干一⑥两轴索引形状**（合并档=索引内容拼装；分离档=每问一条索引项、chunk_id 仍指同一 chunk）+ **主干二④**（chunk_id 归并保最高分）+ **走查推演 2**（两问两库对照：同一条 FAQ top-1）
- [x] 负例标记的问答对不参与索引、检索不可达（源：W-F35-3）✅ **主干一⑤**（负例不进索引内容只进元数据——WeKnora 原注释引用块）+ **主干二③**（归一化全等否决）+ **走查推演 2 t4**（"老完成率怎么算"点查被否决）+ **捣乱输入 B 路 1**（一字之差放行的边界如实演）
- [x] 召回不足最多 5 轮翻倍后停（源：W-F35-4 前半）✅ **主干三**（轮次上限 5+种子池×3+翻倍进位+四早停：空结果/凑够/捞尽/到顶）+ **走查推演 3**（2 轮凑够停；捞尽分岔与跑满分岔）+ **捣乱输入 B 路 3**（池深疯长闸）
- [x] 与 m18 golden 问答对分账声明在案（源：W-F35-4 后半；卡 m6 签名注释第二行）✅ **主干四**（评估资产 vs 服务资产对照表+两混用病灶+互转闸）
- [x] FAQ 块双写带 chunk_type=faq、删除按知识 ID 级联（源：设计范围 Touches modules m14；卡 m14 扩容注释"FAQ 块……复用同一六函数双写，metadatas 带 chunk_type 区分……删除按知识 ID 级联（先清后写守幂等）"）✅ **主干一⑤⑥**（元数据带 chunk_type=faq+负例清单+指纹；先清后写）
- [x] 明确不讲的留好接口位：FAQ 自动挖掘零出现（源：设计范围·伪代码梳理范围）✅ 头部"明确不讲的"+取舍 6
- [x] 越界引用为零（源：modules.md 边界规则表）✅ **越界自查**

---

## 走查：从输入到验收行为

> **示例数据**（业务真数据样子，沿设计稿 44-48 同一份语料延续）：
> ① 提问示例：主任（汇报人——CONTEXT.md 角色表）晨会前问**"月度产量完成率的口径是什么"**（PRD F35 业务逻辑要点原句"主任常问的'月度完成率口径'进 FAQ 秒回，不再检索报告库"的具象化）；相似问示例：小李（地质工程师——CONTEXT.md 角色表）换问法**"完成率公式"**（W-F35-2 给定条件"产量完成率怎么算"/"完成率公式"的具象化——同一口径的两个问法必须撞同一条 FAQ）；
> ② FAQ 语料示例（走查注入替身样本——FAQ 条目是人工登记产物，业务内容逐项注源，语料事实零新增）：**FAQ-001**：标准问="月度产量完成率的口径是什么"；相似问=["产量完成率怎么算","完成率公式"]；负例=["老完成率怎么算","产量完成率为什么下滑"]；答案=["Σ实际产油 ÷ Σ计划配产 × 100%；按月、按区块·油田统计；口径 Owner=开发室；数据源=2.2 表+配产表；计划版本切换日出新旧双值"]（答案逐项=设定书 §3 指标 1 的公式/粒度/Owner/数据源/争议注记五列）；负例一注源=设定书 §6"老完成率"禁用词条目（v1 口径 2024 废弃，替代=产量完成率——禁用词的正式裁决在语义层 m16 既有闸，设计稿 35 地盘，FAQ 负例是知识库侧双保险不是替代）；负例二注源=设定书 §7 剧本 1《产量下滑归因》（触发意图"为什么下滑"——归因走剧本，口径 FAQ 答不了归因）；
> ③ 批量导入示例（走查推演 1 的输入替身）：开发室新到 3 条——行 1=FAQ-001 全文变体重发（Markdown 复制带出首尾空格+全角问号）；行 2=新条目"产量完成率数据从哪来"（答案="2.2 表+配产表，Owner 开发室"——设定书 §3 指标 1 数据源列）；行 3=标准问"完成率公式"（撞库内 FAQ-001 的相似问）；
> ④ 配置示例：阿强（平台运维——CONTEXT.md 角色表）给问答 Agent 报告库配 FAQ 两轴——A 库=question_answer+combined（缺省），B 库=question_answer+separate（分离对照库，设计稿 45 A/B 双库先例同款）；
> ⑤ 扩检示例（走查推演 3 的计数替身）：B 库 22 条问答对、分离档索引项 53 条（推演样本计数——设计稿 46 计数示例同款先例，版本 4 业务事实零新增）；top_k=5；
> ⑥ 块元数据示例：FAQ-001 的 chunk 行 `faq-001`，元数据 {chunk_type: "faq", 标准问, 相似问[], 负例[], 答案[], 指纹: "sha256:…"}——chunk_type 沿设计稿 44 行族既有字段，指纹与负例清单随块元数据落 m3 既有 `save_chunk_meta` 面（设计稿 45 前缀摘要入库定型同款先例——零新表零新 Repository 签名）。
> **地图先行**（FAQ 一生的入库半程与检索半程，后续主干引用不重画）：

```text
伪代码（FAQ 知识库总览，非代码）

入库半程（独立入库面——不经解析分块、不经四开关枢纽）
   人工登记问答对（标准问+相似问+负例+答案）
      │
   载入校验闸（反例正例互斥）                                主干一②
      │
   归一化+SHA256 指纹（库存原始/指纹算归一化副本）            主干一③
      │
   批内去重闸 → 库内去重闸（撞标准问=合并候选/撞相似问=失败册） 主干一④
      │
   一问一 chunk（负例不进内容只进元数据，chunk_type=faq）      主干一⑤
      │
   直入双路索引（两轴索引形状，m14 六函数既有面）              主干一⑥

检索半程（复用既有管道——FAQ 块与报告块同池同闸）
   查询问句 → 七步归一化（与指纹同刻度）                      主干二①
      │
   m14 双路召回（既有混合检索，报告块与 FAQ 块同出）           主干二②
      │
   负例否决（归一化全等命中 → 该块出局）                      主干二③
      │
   chunk_id 归并保最高分（分离档多条索引项归一条 FAQ）         主干二④
      │
   唯一块 < top_k → 迭代扩检（池深×3 起步翻倍，5 轮上限+四早停） 主干三
      │
   融合池 → 既有精排/生成/无据拒答闸（设计稿 10/47/48 零改动）

一句话：入库是"一问一答一 chunk"的直通车，检索是"负例否决+归并+扩检"
        的三道 FAQ 专属后处理——两头都不另起管道
```

### 主干一：FaqRegistry.upsert——归一化、指纹与两道去重闸（W-F35-1 本体）

```text
伪代码 — app/rag/faq.py:FaqRegistry.upsert（卡 m6 公开签名逐字：
         FaqRegistry.upsert(qa_pair) -> None；卡面注释"FAQ 一等知识：一条问答
         对一个 chunk 直入索引、不走解析管线；相似问合并/负例问题不索引/召回
         不足迭代扩检≤5 轮翻倍（F35）"是本函数的结构合同）

def upsert(self, qa_pair) -> None:
    # 主干判断①入参契约：qa_pair=标准问+相似问[]+负例[]+答案[]+来源——
    #   全部人工登记（设计范围"不做 FAQ 自动挖掘"：本函数零生成调用，
    #   嵌入是唯一模型调用且走 m2 既有 embed 面，与 Indexer 同款）
    # 主干判断②载入校验闸：标准问非空；相似问≠标准问且互不重复；
    #   负例≠标准问、≠相似问且互不重复——反例正例互斥（负例混进正例集
    #   等于给 FAQ 埋否决开关，拒收报错不静默修正）
    校验通过(qa_pair) 否则 拒收报错
    # 主干判断③归一化与指纹（两层数据纪律——取舍 1）：库存原始串，
    #   指纹算归一化副本；问句七步归一化（去首尾空白/去 URL/转小写/
    #   去首尾标点/繁转简/全角转半角/智能空格），答案只去空白去重
    #   不归一化（答案是要原样展示的成文，不是匹配键）
    原始档 = 清理(qa_pair)                    # 去空白去重，保原始内容
    指纹 = 计算指纹(qa_pair)                  # SHA256——串=标准问|相似问排序|负例排序|答案排序
    # 主干判断④去重两道闸（W-F35-1"导入归一化 SHA256 去重"）：
    if 指纹 in 本批次已见指纹集:
        记跳过("同指纹变体", 批次账可查); return   # 不重复建块不重复嵌入
    if 标准问或相似问 撞 库内已有条目的标准问或相似问:
        撞的是标准问 → 合并候选：相似问/负例并集并入已有条目，指纹重算，
                       指纹不变且旗标无变化记跳过（不重写），有变化走更新链（版本+1）
        撞的是相似问 → 记失败册("标准问撞库内相似问")，不入库
                        # 别名不能抢来当标准问——想扩相似问应追加到已有条目
    # 主干判断⑤一问一 chunk（"一条问答对一个 chunk"的本体；不走解析/分块
    #   管线——chunk 内容=标准问+相似问拼装，负例不进内容只进元数据）：
    chunk = 一问一chunk(原始档, 指纹)          # 元数据带 chunk_type=faq+负例清单+指纹
    m3.save_chunk_meta(chunk.元数据)           # 卡 m3 既有签名——块元数据落账
    # 主干判断⑥直入索引（m14 六函数既有面零改动；两轴索引形状按库配置）：
    索引项列 = 建索引项(chunk, 库配置)          # 合并档 1 项 / 分离档 1+相似问数 项
    先清后写(chunk_id)                         # 卡 m14"删除按知识 ID 级联（先清后写守幂等）"
    双写(索引项列)                             # VectorStore.upsert + Bm25Index 既有面
```

WeKnora 同构对照（引用块逐字，解释在正文）——指纹计算的本体：

```text
internal/types/faq.go:208-210, 235-247（WeKnora commit 33c0333，实测）：
// CalculateFAQContentHash 计算 FAQ 内容的 hash 值
// hash 基于：标准问 + 相似问（排序后）+ 反例（排序后）+ 答案（排序后）
// 用于快速匹配和去重
…
	// 构建用于 hash 的字符串：标准问 + 相似问 + 反例 + 答案
	var builder strings.Builder
	builder.WriteString(normalized.StandardQuestion)
	builder.WriteString("|")
	builder.WriteString(strings.Join(similarQuestions, ","))
	builder.WriteString("|")
	builder.WriteString(strings.Join(negativeQuestions, ","))
	builder.WriteString("|")
	builder.WriteString(strings.Join(answers, ","))

	// 计算 SHA256 hash
	hash := sha256.Sum256([]byte(builder.String()))
	return hex.EncodeToString(hash[:])
```

正文解释：第一段注释是 W-F35-1"导入归一化 SHA256 去重"的**指纹合同原文**——指纹材料=标准问+相似问（排序后）+反例（排序后）+答案（排序后），四段用"|"连接后 SHA256 取 hex；**数组先排序**保证"同内容不同顺序"同指纹（相似问登记顺序不敏感）。指纹算在归一化副本上（`normalized`，:217 调 `Normalize()`）而 DB 存原始串——两层数据纪律的 WeKnora 实测（`SetFAQMetadata` 注释"DB 存储原始数据，ContentHash 基于归一化数据计算"，:185/:202-204）。**答案不参与归一化**（Normalize 里答案只走 `SanitizeStrings` 基础清理，:139"答案只做基础清理"）——答案是要原样展示的成文，归一化会毁掉它；本设计稿主干一③照抄这条分界。

WeKnora 同构对照（引用块逐字，解释在正文）——负例不进索引内容的原注释与反例正例互斥：

```text
internal/application/service/knowledge_faq.go:1642-1649（同 commit，实测）：
	// 负例不应该包含在 Content 中，因为它们不应该被索引
	// 答案根据索引模式决定是否包含
	if mode == types.FAQIndexModeQuestionAnswer && len(meta.Answers) > 0 {
		builder.WriteString("Answers:\n")
		for _, ans := range meta.Answers {
			builder.WriteString(fmt.Sprintf("- %s\n", ans))
		}
	}

internal/application/service/knowledge_faq.go:1679-1684, 1690-1697（同 commit，实测）：
	// 3. 检查反例问题是否与标准问或相似问重复（反例不能和正例相同）
	positiveQuestions := make(map[string]struct{})
	positiveQuestions[meta.StandardQuestion] = struct{}{}
	for _, q := range meta.SimilarQuestions {
		positiveQuestions[q] = struct{}{}
	}
…
		// 检查反例是否与标准问重复
		if q == meta.StandardQuestion {
			return werrors.NewBadRequestError(fmt.Sprintf("反例问题「%s」不能与标准问相同", q))
		}
		// 检查反例是否与相似问重复
		if _, exists := positiveQuestions[q]; exists {
			return werrors.NewBadRequestError(fmt.Sprintf("反例问题「%s」不能与相似问相同", q))
		}
```

正文解释：第一段是 W-F35-3"不参与索引"的**WeKnora 侧原文**——chunk 内容拼装时负例被显式排除（原注释一句话讲清理由："它们不应该被索引"），负例住元数据不住索引；答案是否进内容由问答轴决定（question_answer 档进，question_only 档不进）。第二段是主干一②载入校验闸的 WeKnora 同构——**反例正例互斥**逐项拒绝（反例=标准问、反例=相似问都拒），原理一句话：负例是"点名不答"的开关，混进正例集等于给这条 FAQ 埋自毁开关。本设计稿主干一②照此办理，拒收报错不静默修正。

### 主干二：FaqRegistry.search——负例否决与相似问合并（W-F35-2/W-F35-3 本体）

```text
伪代码 — app/rag/faq.py:FaqRegistry.search（卡 m6 公开签名逐字：
         FaqRegistry.search(query, top_k) -> [FaqHit]）

def search(self, query, top_k) -> [FaqHit]:
    # 主干判断①查询归一化：与指纹同一套七步归一化——刻度统一，
    #   负例全等判据才有可比性（取舍 2；WeKnora 同款函数双用实测：
    #   NormalizeQueryText=NormalizeQuestion，锚点对照 ②）
    查询串 = 归一化问句(query)
    # 主干判断②复用 m14 双路召回（设计范围边界红线"检索侧复用 m14 六函数"
    #   的落点——FAQ 块与报告块同索引同融合池，不另起检索管道）
    候选列 = 双路召回(查询串, top_k)            # 既有混合检索面零改动
    # 主干判断③负例否决（W-F35-3"检索不可达"的落点）：候选 FAQ 块的
    #   元数据带负例清单；查询串与某条负例**归一化后全等** → 该块出局
    #   （全等不是相似——一字之差放行，取舍 2 如实记；否决留痕批次账可查）
    候选列 = [c for c in 候选列 if not 负例命中(c.负例清单, 查询串)]
    # 主干判断④chunk_id 归并保最高分（W-F35-2"合并命中"的检索半边）：
    #   分离档下同一 chunk 的多条索引项归并到一条——一条 FAQ 在融合池里
    #   只占一个坑（合并档天然一项，归并是恒等操作）
    唯一块列 = 按 chunk_id 归并保最高分(候选列)
    # 主干判断⑤召回不足迭代扩检（主干三——唯一块不足额才进，够了不进）
    if len(唯一块列) < top_k:
        唯一块列 = 迭代扩检(查询串, top_k, 已见块=唯一块列)   # 主干三
    # 主干判断⑥出参形状：[FaqHit]——chunk_id/标准问/答案/分数/命中问法；
    #   不足额就交现有唯一块（不硬凑），空集走既有兜底分岔位（设计稿 47
    #   answer_or_fallback 零触碰，无据拒答闸判据零改动）
    return [成 FaqHit(c) for c in 唯一块列[:top_k]]
```

WeKnora 同构对照（引用块逐字，解释在正文）——两轴索引形状与归并：

```text
internal/types/knowledgebase.go:38-56（WeKnora commit 33c0333，实测）：
	// FAQIndexModeQuestionOnly only index questions and similar questions
	FAQIndexModeQuestionOnly FAQIndexMode = "question_only"
	// FAQIndexModeQuestionAnswer index questions and answers together
	FAQIndexModeQuestionAnswer FAQIndexMode = "question_answer"
…
	// FAQQuestionIndexModeCombined index questions and similar questions together
	FAQQuestionIndexModeCombined FAQQuestionIndexMode = "combined"
	// FAQQuestionIndexModeSeparate index questions and similar questions separately
	FAQQuestionIndexModeSeparate FAQQuestionIndexMode = "separate"

internal/application/service/knowledge_faq.go:1931-1938, 1977-1989（同 commit，实测）：
	// 如果是一起索引模式，使用原有逻辑
	if questionIndexMode == types.FAQQuestionIndexModeCombined {
		content := buildFAQIndexContent(meta, indexMode)
		return []*types.IndexInfo{
			{
				Content:         content,
				SourceID:        chunk.ID,
				SourceType:      types.ChunkSourceType,
				ChunkID:         chunk.ID,
…
	// 每个相似问创建一个索引项
	for i, similarQ := range meta.SimilarQuestions {
		similarContent := similarQ
…
		sourceID := fmt.Sprintf("%s-%d", chunk.ID, i)
```

正文解释：第一段是两根旋钮的**枚举本体**——问答轴（question_only/question_answer）决定答案进不进索引内容，问题轴（combined/separate）决定标准问与相似问合并还是分家；缺省=question_answer+combined（`EnsureDefaults` :763-767 实测）。第二段是形状兑现：合并档**一条索引项装下全部问句**（Content=标准问+相似问拼接，ChunkID 指回同一 chunk）；分离档**每个相似问一条独立索引项**（相似问单独成向量——长尾问法各自有专用的嵌入表示，召回更好），但 `ChunkID` 全部指回同一 chunk、索引项号用 `chunk.ID-序号` 区分（:1989）——**分家的是索引项，不分家的是 chunk**。这就是"合并/分离可对照、命中同一条 FAQ"两头都成立的机制底座：合并档靠内容拼装命中，分离档靠 ChunkID 归并命中。

WeKnora 同构对照（引用块逐字，解释在正文）——负例全等判据与 chunk 级归并：

```text
internal/application/service/knowledgebase_search_faq.go:300-313（WeKnora commit 33c0333，实测）：
func (s *knowledgeBaseService) matchesNegativeQuestions(queryTextLower string, negativeQuestions []string) bool {
	if len(negativeQuestions) == 0 {
		return false
	}

	for _, negativeQ := range negativeQuestions {
		negativeQLower := strings.ToLower(strings.TrimSpace(negativeQ))
		…
		// Check if query text is exactly the same as the negative question
		if queryTextLower == negativeQLower {
			return true
		}

internal/application/service/knowledgebase_search_fusion.go:68-72（同 commit，实测）：
func deduplicateByScore(results []*types.IndexWithScore) []*types.IndexWithScore {
	chunkInfoMap := make(map[string]*types.IndexWithScore, len(results))
	for _, r := range results {
		if existing, exists := chunkInfoMap[r.ChunkID]; !exists || r.Score > existing.Score {
			chunkInfoMap[r.ChunkID] = r
		}
```

正文解释：第一段是负例否决的**判据原文**——注释自陈"exactly the same"：查询串与负例在 TrimSpace+ToLower 后**全等**才否决，不是相似度阈值。本设计稿采纳"全等"但把刻度换成七步归一化（与指纹同一把尺）：WeKnora 的 TrimSpace+ToLower 连全角问号都不剥——"老完成率怎么算？"（带问号）就漏过负例"老完成率怎么算"，取舍 2 备案。第二段是**chunk 级归并**的本体——同一 ChunkID 多条结果只留最高分（`!exists || r.Score > existing.Score`），分离档下"标准问项+相似问项"多条命中就是这样归并成一条 FAQ 的；迭代扩检循环里的归并同款（`iterativeRetrieveWithDeduplication` :178-180 实测同一形状）。

### 主干三：迭代扩检——翻倍上限与四处早停（W-F35-4 前半本体）

```text
伪代码 — app/rag/faq.py:迭代扩检（行族内部步——FaqRegistry.search 的
         召回不足分支实现，主干叙述件）

def 迭代扩检(self, 查询串, top_k, 已见块) -> [块]:
    # 主干判断①触发与种子：唯一块不足额才进（WeKnora 触发判据是两条件合取：
    #   去重后不足额且向量路首轮捞满——本设计稿取"不足额"单条件取宽防漏，
    #   库小时迭代第一轮就会被早停三收住，语义等价）；
    #   种子池=top_k×3（首轮已满捞仍不足额=唯一块密度低——相似问扎堆或
    #   负例否决吃掉候选，翻倍才有意义），池深有检索池上限
    #   （防单请求把索引查穿——WeKnora 注释"otherwise a single request could
    #   drive the vector-store query depth arbitrarily deep"，见引用块）
    轮次上限 = 5                                 # W-F35-4"最多 5 轮翻倍后停"
    当前池 = min(top_k * 3, 检索池上限)
    唯一块 = 已见块                              # chunk_id → 块 映射，保最高分
    已滤块 = 空集                                # 负例否决过的不再重复核
    # 主干判断②扩检主循环：每轮只放大池深重查同一查询——
    #   问句不变，变的是"往下捞多深"
    for 轮 in range(轮次上限):
        结果列 = 双路召回(查询串, 当前池)         # m14 六函数既有面
        if 结果列为空: break                      # 早停一：捞无可捞
        for 候选 in 结果列:
            if 候选.chunk_id in 已滤块: continue
            if 负例命中(候选.负例清单, 查询串):
                已滤块.add(候选.chunk_id); 唯一块.pop(候选.chunk_id); continue
            唯一块[候选.chunk_id] = 保最高分(唯一块, 候选)
        if len(唯一块) >= top_k: break            # 早停二：凑够即停
        if len(结果列) < 当前池: break            # 早停三：库已捞尽（下一轮只会重复）
        if 当前池 >= 检索池上限: break            # 早停四：到顶再翻倍只会重发同查询
        当前池 = min(当前池 * 2, 检索池上限)       # 翻倍进位（W-F35-4"翻倍"本体）
    # 主干判断③收场：不足额就交现有唯一块——凑不够是事实不是失败，
    #   下游既有兜底分岔位接住（设计稿 47 既有面零新增）
    return 按(唯一块.分数)降序(唯一块)
```

WeKnora 同构对照（引用块逐字，解释在正文）——上限、种子与早停的原文：

```text
internal/application/service/knowledgebase_search_faq.go:78-84, 192-210（WeKnora commit 33c0333，实测）：
	maxIterations := 5
	// Start with a larger TopK since we're called when first retrieval wasn't enough
	// The first retrieval already used matchCount*3, so start from there.
	// matchCount is caller-supplied, so both the seed and the per-iteration
	// doubling are bounded by maxRetrievalPoolSize — otherwise a single request
	// could drive the vector-store query depth arbitrarily deep.
	currentTopK := min(matchCount*3, maxRetrievalPoolSize)
…
		// Early stop: Check if we have enough unique chunks after deduplication and filtering
		if len(uniqueChunks) >= matchCount {
			logger.Infof(ctx, "Found enough unique chunks after %d iterations", i+1)
			break
		}

		// Early stop: If we got fewer results than TopK, there are no more results to retrieve
		if totalRetrieved < currentTopK {
			logger.Infof(ctx, "No more results available (got %d < %d), stopping iteration", totalRetrieved, currentTopK)
			break
		}

		// Increase TopK for next iteration. Once the cap is reached, another
		// round would re-issue an identical query, so stop instead.
		if currentTopK >= maxRetrievalPoolSize {
			logger.Infof(ctx, "Retrieval depth cap %d reached, stopping iteration", maxRetrievalPoolSize)
			break
		}
		currentTopK = min(currentTopK*2, maxRetrievalPoolSize)
```

正文解释：这段是 W-F35-4 前半句的**机制原文**，四个要素逐项对应本设计稿主干三——①**轮次上限**：`maxIterations := 5`（:78，断言"最多 5 轮"的本体，for 循环硬顶）；②**种子池**：`matchCount×3` 起步（:84——"首次检索已经用了 matchCount×3"的注释说明种子不是拍脑袋，是接住首轮的池深）；③**翻倍进位**：`currentTopK = min(currentTopK*2, maxRetrievalPoolSize)`（:210——翻倍但封顶）；④**三处早停**：凑够（:193-196）、捞尽（:199-202——"捞回数 < 池深=库已见底，下一轮只会重复"）、到顶（:206-209——注释原话"到上限后再来一轮只会重发一模一样的查询，所以停"）。第四处早停（空结果即收，:128-130）在本设计稿主干二①的 if 里。**池深上限是一根防疯长闸**：种子注释原话点明"否则单个请求能把向量库查询深度推到任意深"——扩检是放大镜不是无底洞，捣乱输入 B 路 3 演它的必要性。

### 主干四：golden 分账成文（W-F35-4 后半——声明在案，不是接线）

```text
伪代码（分账声明，非代码——W-F35-4 后半"与 m18 golden 问答对分账声明在案"；
        卡 m6 签名注释第二行"golden=评估资产，FAQ=服务资产，可互转不混用"是合同原文）

 golden 问答对（m18 评估证据链，设计稿 23 地盘）   │   FAQ 问答对（本节 m6 FaqRegistry）
─────────────────────────────────────────────┼──────────────────────────────────────────
 资产类型：评估资产                            │   资产类型：服务资产
 材料合同：问题×N 问法 + golden_sql +          │   材料合同：标准问 + 相似问[] + 负例[] +
   golden_result（手算行集）+ 负责人            │     成文答案[]（负例=点名不答的反例问）
 准入闸：GoldenStore.add——无手算金标拒收       │   准入闸：upsert 载入校验+SHA256 指纹
   （程序算/BI 现算/模型自跑都不是金标）        │     （人工登记，零自动挖掘）
 消费方：few-shot 引导（只读取样）/评估基准/    │   消费方：在线问答直答候选
   语义 CI 行为回归                             │     （问句撞问句，融合池直答位）
─────────────────────────────────────────────┴──────────────────────────────────────────
 混用病灶一：把 FAQ 答案当评估金标——判据与被评物同源，自证循环
   （FAQ 答得好不好不能由 FAQ 自己证明；CONTEXT.md"评估金丝雀"词条：
   判据漂移的绿灯是说谎）
 混用病灶二：把 golden 行集当 FAQ 答案——形态错配（行集是表格数据，
   主任问口径要的是一句话成文，不是一张表）
 互转闸：互转必须重走对方准入闸——FAQ 的问题若要进 golden，必须补手算
   金标行集+负责人（无金标拒收既有闸照拦）；golden 的问题若要成 FAQ，
   必须答案可成文且业务高频（人工审核入库）——转的是问题资产，
   答案各自重造，不互拷
```

正文解释：分账的判据是**资产类型不同则材料合同与准入闸不同**——golden 的命根是手算金标（无金标拒收是卡 m18 `GoldenStore.add` 的卡面合同），FAQ 的命根是负例清单与成文答案（口径问的价值在"点名豁免"与"秒回"）；两本账共享的只有"问题资产"（同一句业务问题可以在两边各有一份材料），答案材料**各自重造不互拷**。混用病灶一的反面教材：拿 FAQ-001 的答案当"月度完成率口径"问的评估基准——检索器召回 FAQ-001、生成器照抄 FAQ-001、评估器比对 FAQ-001，三方同源，评出来的满分无证据价值。

**捣乱输入 A：导入侧三路破坏——"重复、抢名、埋开关"**：

```text
伪代码（时序推演，非代码）

路1  重复重发：开发室把上月登记过的 FAQ-001 又发了一遍（Markdown 复制
     带出首尾空格+全角问号——"　月度产量完成率的口径是什么？"）——
     🛡️ 归一化指纹闸拦（主干一③④）：七步归一化吃掉空白与问号变体，
        指纹与库内 FAQ-001 全同 → 跳过，不重复建块不重复嵌入（省一次
        嵌入调用，批次账可查"同指纹变体"）
路2  抢名：新条目拿"完成率公式"当标准问——那是 FAQ-001 的相似问——
     🛡️ 库内撞名闸拦（主干一④）：标准问撞库内相似问 → 失败册
        （"标准问撞库内相似问"），不入库——别名不能抢来当标准问；
        标准问撞库内标准问则是合并候选（并集并入+指纹重算，指纹不变
        即跳过——WeKnora merge 同构 :1083-1090）
路3  埋开关：登记员把"老完成率怎么算"同时填进标准问和负例清单（想
     给废弃口径留个"能查到但别答"的后门）——🛡️ 载入校验闸拦
     （主干一②，WeKnora :1691-1696 同构逐字拒收：反例不能与标准问相同）——
     否则负例否决会在 FAQ 自己的标准问上触发，条目自毁
可观察行为：三路都进不了索引——重复的跳过留痕、抢名的进失败册、
     埋开关的拒收报错；批次账（进/跳/败三计数）可对账
```

**捣乱输入 B：检索侧三路破坏——"一字之差、扎堆占坑、池深疯长"**：

```text
伪代码（时序推演，非代码）

路1  一字之差：小李问"产量完成率怎么算"（合法问法）vs 有人测"老完成率
     怎么算"（负例）——两串只差一个"老"字，相似度极高——
     🛡️ 全等判据的边界如实演（主干二③，取舍 2）：合法问法不在负例清单
        里 → 放行命中 FAQ-001；负例问法归一化后与负例全等 → 否决。
        反向缺口：若负例登记成"老完成率怎么算"而查询带全角问号
        （"老完成率怎么算？"）——WeKnora 判据（TrimSpace+ToLower）下漏拦，
        本设计稿七步归一化堵住（负例与查询同刻度归一化后全等）；
        但换措辞的变体（"请问老完成率怎么算"）仍会漏——负例是点名
        豁免不是语义豁免，漏拦的兜底是语义层禁用词裁决（设计稿 35 既有闸）
路2  扎堆占坑：分离档下 FAQ-001 的标准问项+2 相似问项同时命中 top-k——
     一条 FAQ 要占三个坑，报告块被挤出候选——
     🛡️ chunk_id 归并闸拦（主干二④，WeKnora deduplicateByScore 同构）：
        三项归并保最高分，融合池里只占一个坑（W-F35-2"合并命中"的
        检索半边——分离档的召回优势与合并档的坑位纪律同时成立）
路3  池深疯长：22 条 FAQ 的库 top_k=5，若翻倍无上限——5 轮后池深
     5×3×2⁴=240，单请求把索引查穿（WeKnora 注释原话"arbitrarily deep"）——
     🛡️ 池深上限闸拦（主干三①，WeKnora maxRetrievalPoolSize 同构）：
        种子与每轮翻倍都 min(…, 上限)，到顶即早停四——放大镜有边框
可观察行为：合法问法秒回、负例问法不可达、分离档不挤坑、池深有顶——
     四条边界全部可观察可对账（扩检轮次与池深入批次账）
```

闸在哪：①载入校验闸（主干一②——反例正例互斥逐项拒收，负例混进正例集=条目自毁，WeKnora :1691-1696 同构）；②归一化指纹闸（主干一③④——库存原始/指纹算归一化副本，七步归一化吃掉变体，SHA256 全同即跳过，W-F35-1 去重本体）；③批内+库内两道去重闸（主干一④——批内指纹集防同批重复，库内撞名分岔：撞标准问=合并候选并集并入、撞相似问=失败册）；④独立入库面闸（主干一⑤⑥——一问一 chunk 直写双路索引，不经解析分块不经四开关枢纽，设计范围边界红线）；⑤负例不索引闸（主干一⑤——负例不进 chunk 内容只进元数据，WeKnora 原注释"它们不应该被索引"，W-F35-3 前半）；⑥负例命中否决闸（主干二③——归一化全等才否决，命中即出局且留痕，W-F35-3 后半"检索不可达"）；⑦chunk_id 归并闸（主干二④——分离档多条索引项归并保最高分，一条 FAQ 一个坑，W-F35-2 合并命中的检索半边）；⑧扩检上限闸（主干三——轮次上限 5+池深上限+翻倍进位+四处早停：空结果/凑够/捞尽/到顶，谁先到谁收，W-F35-4 前半本体）。拦完数据去哪：跳过条=批次账留痕零落库（同指纹不重写不重嵌）；失败册条=进册可查不入索引（抢名条目的去处是"追加为已有条目的相似问"这条人工路径，不是改判自动入库）；被否决块=出局且进已滤集（同轮扩检不再重复核）；不足额=交现有唯一块不硬凑（下游既有兜底/拒答位收场，设计稿 47 零新增）。

### 走查推演 1（W-F35-1）：导入 3 条——跳过、入库、失败册

```text
伪代码（时序推演，非代码）

t0  开发室批量导入 3 条（示例数据③）到 A 库（question_answer+combined 缺省）：
    行 1 = FAQ-001 全文变体重发（首尾空格+全角问号）
    行 2 = "产量完成率数据从哪来"（新条目——设定书 §3 指标 1 数据源列）
    行 3 = 标准问"完成率公式"（撞库内 FAQ-001 相似问）
t1  行 1：载入校验过 → 归一化（"　…？"→"月度产量完成率的口径是什么"）
    → 指纹与库内 FAQ-001 全同 → 跳过（批次账：跳过=1）
t2  行 2：校验过 → 新指纹 → 批内/库内不撞 → 一问一 chunk（faq-002）：
    内容="产量完成率数据从哪来"（合并档：内容=标准问，相似问空）；
    元数据={chunk_type: "faq", 负例: [], 指纹: "sha256:…"}；
    索引项=标准问+答案拼接（问答轴 question_answer 缺省——答案进内容）；
    m3 落块元数据 → 先清后写 → 双写两路索引 → 状态已索引
t3  行 3：校验过 → 新指纹 → 库内撞名检查："完成率公式"命中 FAQ-001 的
    相似问集 → 标准问撞相似问 → 失败册（批次账：失败=1）
t4  批次账对账：进 1 / 跳过 1 / 失败 1；嵌入调用=1（只有行 2——跳过条
    零嵌入，失败条零嵌入）；库内 chunk 总数=2（faq-001 既有 + faq-002 新）
可观察行为（W-F35-1 断言全句成立）：行 2 一条问答对一个 chunk 直入索引
    （t2——chunk 直造、双写直写，全程无解析/分块调用）；不经过解析/分块
    管线（t2 无任何分块步骤可查）；导入归一化 SHA256 去重（t1 变体重发
    被指纹闸收编——归一化在前、SHA256 在后）
```

### 走查推演 2（W-F35-2/W-F35-3）：两问两库对照与负例点查

```text
伪代码（时序推演，非代码）

t1  主任问"月度产量完成率的口径是什么"（A 库=合并档）：
    查询归一化 → 双路召回 → 合并档索引内容=标准问+相似问拼装 → 标准问
    直接命中 → 负例核（查询串与两条负例皆不等）→ chunk 归并（恒等）
    → 唯一块=faq-001 → top-1 FaqHit（答案候选直出——秒回，不检索报告库）
t2  小李问"完成率公式"（同 A 库）：相似问在合并档内容里 → 词面直撞
    → 同样命中 faq-001 → **同一条 FAQ top-1**（两问两个用户，一个答案）
t3  对照 B 库（分离档，阿强配的）：同两问 → 各命中自己的索引项
    （主任问命中标准问项、小李问命中"完成率公式"项——两条不同索引项）
    → chunk_id 归并保最高分 → 仍归到 faq-001 一个坑 → **同一条 FAQ top-1**
    （分离索引选项可对照：检索行为不同、交付结果相同——W-F35-2 前后
    两半各自成立）
t4  负例点查：阿强测"老完成率怎么算"（设定书 §6 禁用词）：
    词面上与 FAQ-001 相似问族高度共鸣 → 候选含 faq-001
    → 负例核：查询串归一化后与负例"老完成率怎么算"全等 → faq-001 否决
    → 空候选 → 设计稿 47 既有兜底/拒答位收场（禁用词的正式裁决走语义层
    m16 既有闸——设计稿 35 地盘，FAQ 负例是知识库侧双保险）
可观察行为（W-F35-2/W-F35-3 断言全句成立）：相似问合并命中同一条 FAQ
    （t1/t2 合并档、t3 分离档归并后同一条）；分离索引选项可对照（t3 双库
    对照）；负例标记不参与索引（t4——负例从未进过索引内容，主干一⑤）
    且检索不可达（t4 否决后空候选）
```

### 走查推演 3（W-F35-4）：分离档扩检两轮凑够与三处分岔

```text
伪代码（时序推演，非代码）

t0  B 库（分离档）22 条问答对、53 条索引项（示例数据⑤计数替身）；
    主任问"月度产量完成率的口径"，top_k=5
t1  首轮（FaqRegistry.search 主干二②③④）：池=top_k×3=15 → 捞满 15 项
    → 负例核=0（查询不撞任何负例）→ chunk 归并：15 项落 4 个 chunk
    （口径族相似问扎堆——FAQ-001 的标准问项+2 相似问项全中）
t2  唯一 4 < 5 → 进迭代扩检（主干三）：轮 1 池=15（种子接首轮）→
    唯一仍 4 < 5 且捞满 → 翻倍
t3  轮 2 池=30 → 捞回 30 项（15 旧项重合+15 新项）→ 15 新项落 5 个
    新 chunk → 唯一 9 ≥ 5 → 早停二（凑够）→ 2 轮结束——轮次上限 5 未触顶
t4  分岔对照（三处早停各演一角）：
    分岔 a（捞尽早停）：反事实——若 B 库该查询可达索引项只有 26 条，
        轮 2 捞回 26 项 < 池 30 → 早停三（库已捞尽，下一轮只会重复）
        → 唯一 4+新增 3=7 ≥ 5 照常交
    分岔 b（跑满硬顶）：若 5 轮跑满唯一仍 4 → for 循环硬顶收 →
        4 条照交不硬凑（不足额是事实——设计稿 47 既有兜底位收场，零新增）
    分岔 c（负例拦在扩检里）：若轮 2 新捞回的某块负例与查询全等 →
        该块进已滤集且从唯一块里弹出（:170 WeKnora 同构 delete）→ 计数不含它
可观察行为（W-F35-4 前半断言全句成立）：最多 5 轮翻倍后停（t3 两轮凑够
    早停、t4b 五轮硬顶——上限与早停双保险都真在）；翻倍进位真发生
    （t1→t3 池深 15→30）；分账声明在案（主干四对照表+混用病灶+互转闸
    三件齐——想验"口径答得对不对"走 golden 跑批，本问无手算金标
    golden 拒收，两本账互不冒充）
```

## 关键判断的取舍记录

1. **指纹算归一化副本、库存原始串——两层数据纪律不分家。** 备选一"只存归一化串"：否决理由——归一化会毁掉要原样展示的东西（答案只做基础清理是 WeKnora :139 注释明说的边界；标准问的原始写法是登记事实，展示层要它）；备选二"库存原始、指纹也算原始"：否决理由——变体绕得过闸（捣乱输入 A 路 1 的全角问号+空格就是拿原始串算指纹的必然漏网）。落定：`Sanitize`（清理保原始）与 `Normalize`（归一化出副本）两步分离，指纹只吃副本（主干一③；WeKnora :114-144 实测同名两函数——本设计稿照抄这个分界，取舍依据是 WeKnora 已趟过的坑）。换边条件：无——这条是数据形态分界不是参数。
2. **负例否决用归一化全等，不用相似度阈值。** 备选"负例相似度超阈值即否决"：否决理由——负例与正例天然只差一词（"老完成率怎么算"vs"产量完成率怎么算"），任何能拦住负例的相似度阈值都会先拦住正例——否决权交给相似度等于给误伤开闸；且阈值是又一根要标定的旋钮，FAQ 库小、标定样本更少，标不准的旋钮不如没有。落定：归一化全等才否决（主干二③）——宁可拦不准（换措辞变体漏拦，捣乱输入 B 路 1 如实记），不可误伤（否决错一条 FAQ，那条 FAQ 对这个问法永久失明）。漏拦的兜底在语义层（禁用词裁决，设计稿 35 既有闸）——两层防线各管一段，WeKnora 的 TrimSpace+ToLower 全等在"带问号变体"上会漏，本设计稿把刻度统一到七步归一化堵住这一口子（判据同是全等、刻度同指纹，防的是变体口子不是语义口子）。换边条件：设计稿 11 评估若显示变体漏拦成主诉，升级方向是"负例归一化后再做同词集判定"（问句词集全同才放行的更严口径），不是相似度阈值。
3. **相似问合并是双轴解耦：索引形状是存储层选项，chunk 归并是检索层保证。** 备选"只做合并档、把分离档当配置残留"：否决理由——两档各答一个真实约束（合并档索引省、短库更稳；分离档每个问法有专用嵌入表示、长尾问法召回更好——W-F35-2 明示"分离索引选项可对照"是断言的一部分，不是可选项）；且分离档的"合并命中"若只靠索引形状就没了机制保证。落定：入库期两轴独立配置（主干一⑥），检索期 chunk_id 归并保最高分兜底（主干二④）——分离档下无论命中哪个问法项，交付的都是同一条 FAQ；合并档归并是恒等，一套检索代码两档通吃。代价如实记：分离档索引项数=1+相似问数，存储与嵌入成本按问法数放大（推演 3 的 53 项/22 条就是这笔账）。换边条件：设计稿 11 评估若显示分离档召回增益撑不起嵌入成本，配置缺省不动、文档记成本账即可——结构零改动。
4. **迭代扩检挂在 FAQ 后处理位，不挂检索主管道。** 备选"扩检作为通用检索能力挂进设计稿 10 混合检索"：否决理由——"召回不足"在报告库与 FAQ 库语义不同：报告库块多，首轮不满额基本等于真没有（扩检是白花池深）；FAQ 库块少问短，相似问扎堆+负例否决让"首轮不满额"是常态而非无据信号——同一判据两种含义，通用化会把报告库的空结果也拖进五轮空转。落定：扩检收在 `FaqRegistry.search` 内部（主干三），报告库管道零触碰；WeKnora 同构实测——`applyFAQPostProcessing` 开头 `kb.Type != FAQ 直接返回`（:33-35，非 FAQ 库直通），扩检从来就是 FAQ 专属位。本设计稿判据取"唯一块不足额"单条件（WeKnora 是两条件合取，:40——多挂了"向量路首轮捞满"防报告库误入的护栏；本设计稿没有报告库误入问题，因为扩检根本不在报告库管道上），库小时的空转会立刻被早停三收住，语义等价。换边条件：无——挂载位是边界红线（检索侧复用 m14 六函数）的直接推论。
5. **golden/FAQ 分账的关键在"答案材料各自重造"。** 备选"FAQ 答案可以直接登记为该问的评估基准"：否决理由——判据与被评物同源（检索器召回它、生成器抄它、评估器比它），自证循环无证据价值（CONTEXT.md"评估金丝雀"词条"判据漂移的绿灯是说谎"）；备选"golden 行集直接当 FAQ 答案出"：否决理由——形态错配，行集是表格数据，口径问要的是一句话成文（主任要口径不要表格）。落定：分账对照表+两混用病灶+互转闸成文（主干四）——互转只转问题资产，材料各走对方准入闸（golden 无手算金标拒收是卡 m18 卡面合同；FAQ 人工审核入库是设计范围"不做自动挖掘"的推论）。换边条件：设计稿 11 评估若为问答侧引入 model grader 基准资产，分账表加第三列即可，本节两本账结构不动。
6. **FAQ 分数加成与自动挖掘一句划界。** 设计范围"不做 FAQ 自动挖掘"：问题从哪来是人工/审核的事——提炼成本付在入库前，管道零生成调用（书 §3.3 对照："必须在索引阶段投入计算资源，对原始知识主动提炼、抽象和结构化"——FAQ 是提炼已经在人工环节完成的知识形态，管道里的"加法"为零，这与设计稿 51 的管道内生成问题 chunk 是两个方向的加法）。FAQ 分数加成（WeKnora `rerank.go:205-217` 实测：FAQ 块复合分乘 boost 封顶 1.0+`faq_boosted` 元数据）：WeKnora 有、PRD F35 未纳——问句撞问句的天然高分已经够 FAQ 浮到前列（走查推演 2 t1/t2），加成是锦上添花且引入"乘法账外"第二把来源处理（设计稿 48 锚点 ⑧ 已辨析与账内一成来源分是两族）。留好的接口位：chunk_type=faq 已进块元数据（主干一⑤），加成只是重排层一个判定位——真要上，新增的是重排分支不是管道改造。

## 锚点对照精要

**WeKnora FAQ 知识库（commit 33c0333 实测核对）**：
**① 问答对元数据与两层数据纪律**——`internal/types/faq.go:17-25`（`FAQChunkMetadata`：标准问/相似问/负例/答案/答案策略/版本/来源七件——主干一①入参契约的 WeKnora 形状）；`:114-127`（`Sanitize`：TrimSpace+去重保原始——入库前基础清理）；`:129-144`（`Normalize`：归一化副本，注释"原始数据不变，返回新的归一化副本，用于 Hash 计算和向量索引"——两层数据纪律本体，取舍 1）；`:185/:202-204`（`SetFAQMetadata` 注释"DB 存储原始数据，ContentHash 基于归一化数据计算"——主干一③的落位证据）。
**② 七步归一化**——`:576-582`（规则注释：去首尾空白/移除 URL/转小写/去首尾标点/繁体转简体/全角转半角/智能空格）；`:583-608`（`NormalizeQuestion` 全函数）；`:610-616`（`normalizeSpaces` 示例注释："怎么 绑定 手机"→"怎么绑定手机"、"iphone 15 怎么 激活"→"iphone 15怎么激活"——中英空格分界的示例）；`:766-770`（`NormalizeQueryText`=`NormalizeQuestion`——查询与指纹同刻度是 WeKnora 自己的设计，主干二①的同款依据）。
**③ SHA256 指纹（W-F35-1 去重本体）**——`:208-210/:235-247`（`CalculateFAQContentHash`：标准问+相似问排序+反例排序+答案排序，"|"连接，SHA256 hex——主干一引用块）；`:222-233`（数组先排序"确保相同内容产生相同 hash"——登记顺序不敏感）。
**④ 直入索引与独立入库面（W-F35-1 不走管线本体）**——`knowledge_faq.go:115-244`（`CreateFAQEntry`：chunk 直造 `ChunkType: types.ChunkTypeFAQ`（:192）、`SetFAQMetadata`（:201）、`CreateChunks`（:206）、`indexFAQChunks` 直入（:212）、索引失败回滚删块并告警（:214-222——"回滚失败会留下一条 stored 状态的残留……必须告警而非静默"注释，本设计稿零展开留痕）；`:142-143`（"同一标准问的并发创建必须串行：下面的重复校验只看得到已落库的条目，拦不住还在索引中的兄弟请求"——并发窗口注释，锚点 ⑨ 守卫的动机）；`knowledge_faq_import.go:2013-2079`（`indexFAQChunks`：`buildFAQIndexInfoList`→`BatchIndex` 直入，无解析管线调用可查）；`knowledgebase_search.go:287-289`（检索调用位：`applyFAQPostProcessing` 排在融合去重后、MatchCount 截断前——FAQ 后处理在主管道上的精确位置）。
**⑤ 两轴索引形状（W-F35-2 对照底座）**——`knowledgebase.go:38-56`（两枚举原注释）；`:763-767`（`EnsureDefaults` 缺省 question_answer+combined）；`knowledge_faq.go:1633-1651`（`buildFAQChunkContent`：负例不进 Content 原注释 :1642-1643——主干一引用块）；`:1890-1904`（`buildFAQIndexContent`：索引内容=标准问+相似问换行拼接，答案按问答轴）；`:1907-2004`（`buildFAQIndexInfoList`：combined 一项/separate 每问一项，sourceID=chunkID-序号 :1989——主干二引用块）。
**⑥ 去重与合并三闸**——载入校验：`knowledge_faq.go:1656-1753`（`checkFAQQuestionDuplicate`：相似问≠标准问 :1664-1667、相似问互斥 :1670-1677、反例正例互斥 :1679-1703——主干一引用块；库内撞名单查询替代全量扫描 :1705-1713）；批内：`knowledge_faq_import.go:529-560`（"文件内标准问去重" :544——同批撞标准问第二条落失败册）；`:475-484`（四阶段校验注释：预校验/合并候选/后校验/回退——导入校验的全景骨架）；合并：`:1066-1090`（标准问撞标准问=合并候选：`unionStrings` 并集相似问/负例、Version+1、:1083-1090 指纹不变且旗标无变化即跳过——主干一④合并分岔的 WeKnora 本体）；`:1178-1258`（replace 模式：指纹批筛 :1221/:1235-1240，无指纹旧块删除 :1245-1253——全量替换的幂等形状，本设计稿零展开留痕）。
**⑦ 负例否决与迭代扩检（W-F35-3/W-F35-4 前半本体）**——`knowledgebase_search_faq.go:24-55`（`applyFAQPostProcessing`：非 FAQ 库直通 :33-35、触发判据 :40、非迭代路径负例过滤 :52——取舍 4 的挂载位证据）；`:73-223`（`iterativeRetrieveWithDeduplication`：maxIterations=5 :78、种子 min(matchCount×3, cap) :84、chunk 级保最高分 :178-180、负例每轮核+弹出 :164-174（`delete(uniqueChunks, …)` :170）、chunkDataCache :86-87（查库缓存防重复拉块——本设计稿零展开留痕）、四早停 :128-130/:193-196/:199-202/:206-209、翻倍 :210——主干三引用块）；`:226-296`（`filterByNegativeQuestions`：非迭代路径的批量否决，chunk 不存在或元数据解析失败**保留**该块 :265-283——"过滤失败宁可放行不误杀"的边界，本设计稿零展开留痕）；`:300-316`（`matchesNegativeQuestions`：TrimSpace+ToLower 全等 :310-313——主干二引用块，取舍 2 的刻度差异备案）。
**⑧ 合并命中与答案回填**——`knowledgebase_search_fusion.go:68-72`（`deduplicateByScore`：ChunkID 归并保最高分——主干二引用块）；`chat_pipeline/merge_faq.go:11-97`（`populateFAQAnswers`：FAQ 块命中后回库拉元数据回填内容，租户缺失/拉库失败降级返回不拦管道 :25-29/:56-61）；`:100-134`（`buildFAQAnswerContent`："Q: 标准问\nAnswer:\n- 答案"拼装——答案回填的展示形状，本设计稿零展开留痕）。
**⑨ WeKnora 侧加固件（本设计稿一句对照位，零展开）**——`knowledge_faq_create_guard.go:24-39`（并发创建守卫：标准问 SHA256 前 16 字节做 Redis SetNX 键，"首个调用者赢，重试者拿冲突"——本设计稿单窗口零并发，键派生"哈希而非原文，防用户文本注入 Redis 键命名空间"的 hygiene 留一句）；`rerank.go:205-217`（FAQ 加成：`FAQPriorityEnabled && FAQScoreBoost > 1.0 && ChunkType==FAQ` → `min(score×boost, 1.0)`+`faq_boosted`/`faq_original_score` 元数据——取舍 6 的 WeKnora 存在性证据）；`types/faq.go:250-258`（`AnswerStrategy` all/random——本设计稿取 all 一档）；`knowledge_faq.go:1820-1823`（`hashQuestion`=MD5 前 4 字节——只用于分离档索引项 sourceID 后缀，与 ContentHash 的 SHA256 是两把刀用途不同，如实对照防混淆）。
**⑩ 调研报告与 PRD 对照备案**——调研报告 ：175"FAQ 类知识库不走解析管线：每条问答对一个 chunk，支持相似问合并/分离索引、负例问题（反例问不参与索引）、导入归一化去重 SHA256（knowledge_faq.go、knowledge_faq_import.go）"与真源码逐项对上（④⑤⑥全部实测印证）；:199"迭代扩检最多 5 轮翻倍与负例问题精确过滤"实测确认（⑦）。**漂移一处**：PRD F35 信源锚点记"knowledge_faq.go：……迭代扩检最多 5 轮"——实测迭代扩检在 `knowledgebase_search_faq.go`（knowledge_faq.go 是登记/校验/索引形状侧），照设计稿 45/47/48 勘误先例如实备案不硬凑，机制描述不作废。
**复刻对照仓**：如实记录——复刻仓 `store/ingest/retrieval/llm_gateway` 各目录 grep 无任何 FAQ/问答对实现（无 faq 命名文件、无负例/指纹痕迹），本节复刻对照仓侧对照不成立，不硬凑（设计稿 45/46/47/48 同款处理）。
**原书第三章**：`:426`（"这些文本块本身该怎么组织？"——FAQ 是组织形态之一：一问一答一个 chunk 是最小组织单位，与父子分块（设计稿 44）/摘要块/问题块（设计稿 51）同属"组织形态"家族）；`:443`（"把原始案例或文档不加处理地直接放进知识库是远远不够的……必须在索引阶段投入计算资源，对原始知识主动提炼、抽象和结构化"——FAQ 的提炼发生在入库前的人工登记环节，设计范围"不做自动挖掘"即提炼成本不进管道，取舍 6 的书出处）；§3.2 混合检索（设计稿 10 既有锚——检索侧复用的理论底座，本节零新引）。
**CONTEXT.md 词条**：①"FAQ 库"（既有 v4 词条——"问答对即一等知识：一条问答对一个 chunk，不走解析管线；相似问合并、负例不索引、召回不足迭代扩检"，本设计稿全稿是该词条的机制展开，零新增词条）；②"选项制"（两轴索引选项的纪律出处）；③"评估金丝雀"（混用病灶一"判据漂移的绿灯是说谎"出处）；④主任/小李/阿强角色（角色表）。
**PRD F35 + 选项矩阵（docs/prd.md）**：F35"做什么/不做什么"逐条对齐——直入索引不走管线/相似问合并分离/负例登记/迭代扩检 5 轮/分账成文（主干一/二/三/四）；不做 FAQ 自动挖掘（取舍 6）；业务逻辑要点"主任常问的'月度完成率口径'进 FAQ 秒回，不再检索报告库"=示例问题与走查推演 2 的出处。选项矩阵第 9 行"FAQ | 独立 FAQ 库（WeKnora）/ golden 问答对复用（m18 既有）| 高频固定问→FAQ 库；评估与服务分账→golden 复用"=两账分立与 golden 复用位的选项出处。**PRD 信源锚点一处漂移照 ⑩ 备案。**
**模块卡 m6/m14/m18/m3（签名唯一来源）**：`FaqRegistry.upsert(qa_pair) -> None / FaqRegistry.search(query, top_k) -> [FaqHit]` 按卡 m6 逐字（卡面注释两行即本节结构合同，F35 机制清单与分账口径逐字入主干）；`VectorStore.upsert/Bm25Index.build/…六函数` 按卡 m14 逐字引用即止（卡 m14 扩容注释"FAQ 块……复用同一六函数双写，metadatas 带 chunk_type 区分……删除按知识 ID 级联（先清后写守幂等）"=双写与删除合同）；`GoldenStore.add`"无金标拒收"按卡 m18 卡面（分账的对方准入闸，零调用）；`Repository.save_chunk_meta/get_chunks_by_ids` 按卡 m3 逐字引用即止（块元数据落账面）；卡 m6 依赖"m2（嵌入与生成）"=嵌入调用面（零生成调用——不做自动挖掘）；走查计划"版本 4 增锁：FAQ 库（W-F35-×）"=本节合同位。
**设计稿 08/09/10/44/45/46/47/48（既有面供给方）**：设计稿 08 双写与 BM25 快照（m14 六函数地盘）；设计稿 09 块元数据落账形状（save_chunk_meta 面）；设计稿 10 混合检索/RRF/无据拒答闸（FAQ 候选同池同闸，零改动）；设计稿 44 chunk_type 行族字段与父子 INV（FAQ chunk 无父子两层，INV 不涉及）；设计稿 45 元数据字段族扩展先例（指纹/负例清单随块元数据落账同款）与 A/B 双库对照法；设计稿 46 分发枢纽的管界（FAQ 不经枢纽——无分块产物）；设计稿 47 兜底分岔位与引用代号登记（FAQ 块进结果集同样领代号，零新增）；设计稿 48 chunk_type 判定位留置与"乘法加成归设计稿 49"预告的收口（取舍 6）。
**设定书（取材锚）**：§3 指标 1 产量完成率（FAQ-001 答案五项逐列：公式/粒度/Owner/数据源/争议注记）；§6"老完成率"禁用词条目（负例一——v1 口径 2024 废弃，替代=产量完成率）；§7 剧本 1《产量下滑归因》（负例二——归因走剧本，触发意图"为什么下滑"）；版本 4 业务事实零新增——FAQ-001 条目是走查注入替身样本（业务内容逐项注源设定书），库 22 条/索引项 53 条/批次 3 条均为推演样本计数（设计稿 46 计数示例同款先例），§1/§5/§8/附录 A 无本节新引条目。

## 越界自查（源：modules.md 边界规则表）

- **m6 机制归 m6（本节主语行，卡 m6 扩容）**：`FaqRegistry` 两公开签名落 `app/rag/faq.py`（W-F35-1 走查列"app/rag/faq.py:FaqRegistry.upsert"=断言合同位；卡 m6 目录行列到件族未列 faq.py——目录粒度备案，FaqRegistry 归 m6 公开接口无争议：卡面公开接口明列两签名）；迭代扩检/归一化/指纹/否决全是 FaqRegistry 行族内部步，问数链（m7）与问智链（m15）零出现——FAQ 只服务"报告库的一生"。
- **m2 唯一出口（既有行）**：本节唯一模型调用是嵌入（双路索引写侧），走 m2 既有 embed 面（与 Indexer 同款）；零生成调用——不做 FAQ 自动挖掘（设计范围），负例/相似问/答案全部人工登记；框架红线"无新增"履行：零新增网关能力、零新替身、零新记账签名。
- **m14 六函数边界（既有行）**：索引写侧与检索读侧只走六函数既有签名，零直接操作 Chroma/rank_bm25 对象（边界规则表"m14 的消费方直接操作 Chroma/rank_bm25 对象"禁令履行）；"删除按知识 ID 级联（先清后写守幂等）"照卡 m14 注释办理（主干一⑥先清后写）；增量写法是六函数调用序不是新签名。
- **设计稿 10 零改动**：混合检索/RRF 融合/精排/带引用生成/无据拒答闸签名与函数体零触碰——FAQ 候选与报告块同池同闸（闸判据"候选空或全低分"零改动）；扩检不挂主管道（取舍 4），报告库管道零新增分支。
- **设计稿 46 枢纽零触碰**：FAQ 独立入库面不经 `PostProcess.dispatch`——C22 枢纽管"入库分块产物"的后处理四路（卡 m22/m25 管界），FAQ 没有分块产物可后处理，边界规则行"图谱/Wiki 后处理绕过 m22 分发枢纽"不适用（FAQ 不是后处理路，是入库面平行入口，设计范围边界红线明示"独立入库面"）；C22 零新边零新节点。
- **设计稿 44 INV 零违反**：FAQ chunk 一问一答即检索单元，无父子两层，"父块永不出现在 VectorStore/Bm25Index"INV 不涉及；FAQ 块入双索引与父块不索引 INV 无冲突（两族 chunk 各守各的 INV）。
- **设计稿 47/48 零触碰**：`Generator.answer_or_fallback`/`RefExpander.expand`/`Ranker.rerank_composite` 函数体零改动——负例否决后空集与扩检不足额落既有兜底分岔位（零新增信号类型）；FAQ 块进结果集照设计稿 47 既有登记面领引用代号（零新增）；设计稿 48 留的 chunk_type 判定位本节仍零展开（FAQ 加成取舍 6）。
- **m18 只读（既有行）**：golden 分账是声明不是接线——本节零 `GoldenStore` 调用零评估链写入（"m18 评估链路写问数主链路状态"禁令反向亦然：FAQ 也不写评估链）；分账表是文档件，互转闸是人工路径不是自动接线。
- **数据面（占位语义）**：指纹/负例清单/标准问/相似问/答案随块元数据落 m3 既有 `save_chunk_meta` 面（设计稿 45 前缀摘要入库定型同款先例——元数据字段族扩展，零新表零新 Repository 签名）；批次账（进/跳/败计数）是请求级内存结构随批次可查，零落库；`chunk_type=faq` 沿设计稿 44 行族既有字段（卡 m14 扩容注释明列 faq 块）。
- **scripts 纪律（既有行）**：零新脚本——批量导入=逐条过同一 `upsert` 闸（公开面唯一，无批量旁路签名）；WeKnora 的批量导入服务与四阶段进度面板是产品面（:475-484 实测），本设计稿收进"逐条过闸+批次账"一句。
- **签名纪律**：`upsert(qa_pair) -> None`/`search(query, top_k) -> [FaqHit]` 按卡 m6 逐字；`FaqHit`（chunk_id/标准问/答案/分数/命中问法）为出参形状叙述件（卡面未给字段族——头部声明块备案）；`归一化问句/计算指纹/载入校验/建索引项/一问一chunk/负例命中/按 chunk_id 归并保最高分/迭代扩检/保最高分` 为伪代码主干叙述件（FaqRegistry 行族内部步——各主干备案，非公开签名发明）。
- **取材锁自查**：全稿业务事实仅四类且全为既有——产量完成率口径（设定书 §3 指标 1 逐列）、老完成率禁用词（§6）、归因剧本（§7）、角色设定（CONTEXT.md 角色表）；FAQ-001 条目=走查注入替身样本（业务内容逐项注源，零新业务事实）；22 条/53 项/3 条批次/2 轮扩检=推演样本计数（设计稿 46 同款先例）。技术口径（七步归一化/SHA256 指纹串/两轴枚举/负例全等/种子×3/翻倍封顶/5 轮上限/四早停/chunk 归并）全部注卡面合同或 WeKnora 实测行号（commit 33c0333），无凭记忆行号；WeKnora 并发守卫/FAQ 加成/答案策略/批量导入面板四处本设计稿未收口如实备案（锚点 ⑨）；复刻仓 对照不成立如实声明；PRD 信源锚点一处漂移（迭代扩检文件归属）如实备案不硬凑（锚点 ⑩）。
- **架构大图同步**：diagrams/petro-agent.html 按设计范围"图节点范围"推进——设计范围"C14 增节点 FAQ 注册表"与图实际容器编号不符（C14=可观测；FAQ 注册表归 m6 问答管道域），照设计稿 44/45/47/48 先例**按语义落实际容器**：新增 1 节点（FAQ 注册表 faq_registry）+3 条边（直入索引实线边到双写节点/负例否决与合并命中虚线边自混合检索节点/迭代扩检回驱虚线边返混合检索节点——均 C4 容器内，不入红虚线 linkStyle 清单）；本节不新增容器（设计范围明示）；防护清单表零追加（负例否决是知识语义过滤不是防护闸节点，设计稿 45 组装器/设计稿 48 复合重排同款先例）；节点明细表追加 1 行；既有节点零触碰；图头部计数零改动（设计稿 43-48 同款先例）；新边追加在既有边序列末尾（linkStyle 按序号引用，中插会漂移既有样式——append-only 编辑，设计稿 47 先例）；图上无文件名/函数名/端口/路由（"归一化指纹""翻倍扩检"均为业务语言）。
- **零代码红线**：全文代码块均标注"伪代码"；无 tests/、无 CI 内容；SQL 零出现（本节无 SQL 语句需求——块元数据走 m3 既有 Repository 面）。
- **明确不讲的零出现自查**：FAQ 自动挖掘零展开（取舍 6 一句划界+头部）；FAQ 分数加成零展开（取舍 6+锚点 ⑨ 一句对照位）；golden 机制本体零展开（主干四只做分账声明，设计稿 23 地盘）；答案策略 random 档零展开（锚点 ⑨）；并发创建守卫零展开（锚点 ⑨ 一句）；批量导入进度面板零展开（越界自查 scripts 行一句）。
