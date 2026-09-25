# 设计稿 DP7：快照审计与回放（dp7 Audit）—— 结论绑定快照四元组，按同快照回放

> **语言纪律声明**：本设计稿零真实可运行代码——全部代码块为**伪代码**（块首标注"伪代码 — 文件:函数"或"伪代码（数据形状声明，非代码）"），公开签名取自模块卡 dp7（specs/data-plane/modules.md：`record` / `replay` / `retention_policy` 三签名逐字）；函数体=输入输出契约+主干判断；分册（docs/tech-stack/minio-iceberg.md）里没有的机制细节不写，业务事实一律注 `设定书 §x`；[设计稿 66](66-Wiki版本与一键回滚.md) **只作同构对照**——Wiki 版本账是文档页账、这里是湖表快照账，两套账两种物，不混用。
> **框架红线**（设计范围）：机制设计稿不点名框架——快照/time-travel 语义取 [minio-iceberg.md](../docs/tech-stack/minio-iceberg.md)（Table Spec：每次提交生成快照，"表中某时点的状态（含全部数据文件集合）"可按快照读回；"Time travel = 结论可回放……'可复现分析'是 Agent 结果可信的底线"）。
> **接线边界**：dp7 依赖 dp1+dp5（模块卡依赖行）——回放候选快照集从 `TableRef.snapshots` 来（[DP1](DP1-湖底座与湖表.md) §3"dp7 审计的候选集"），重跑执行走 `dp5.run` 透传快照号（[DP5](DP5-查询执行适配.md) §1⑤）；**`dp7.replay` 用当前快照替代记录快照=禁止（无例外）**（modules.md 边界规则第 6 行——回放的语义就是"那一版"）。**谁调用 record**：dp8.query 工具内置伴随动作（DP-W-D8-2 内部顺序 dp9.check_join → dp6.route → dp5.run → **dp7.record**）——审计是作答的强制伴随，不是事后可选。Seam=`AuditStore`；Adapter=`InMemoryAudit`（模块卡 Seam 行）。
> **明确不讲的**：全平台 OTel 可观测（F29，走查规格 D7"不做什么"）；快照生成与 expire 清理的执行实现（dp1/dp2 设计稿；prd-data-plane 生命周期行原话"讲机制不做实现"）；剧本 1 归因分解的指标步骤（dp4/dp8 消费位——§7 只取输出合同）；集团审计面的产品形状（S3 一句带过，取舍 5）。

## 实现清单

- [x] `DP-W-D7-1` record 落四元组：question_id/StructuredQuery/snapshot_id/semantic_version+quality_status 齐全 ✅ **走查 §1**（行形状）+ **§2**（record 落行）
- [x] `DP-W-D7-2` 同快照回放 match=True，original 与 current 逐行一致（剧本 1 归因报告可回放——"结论+证据链+数据版本"的工程兑现，设定书 §7）✅ **走查 §3** 主干 + 推演
- [x] `DP-W-D7-3` 快照已过期 → 显式报错"快照已过保留窗口"不静默；retention_policy 给出窗口取舍 ✅ **走查 §3③**（错误路）+ **§4**（策略）
- [x] 审计记录 schema：谁/何时/什么输入/什么输出/依据哪条快照（PRD"可审计"维）+ semantic_version/quality_status 双版本列 ✅ **走查 §1**
- [x] 规模矩阵 dp7 行：S1 快照号记录 / S2 +对账作业 / S3 +集团审计面 ✅ **走查 §5** + 取舍 5
- [x] 取舍 ≥4：绑 snapshot_id 不绑时间戳 / 保留窗口两层制 / 回放一致的前提是引擎确定性 / 审计伴随不补记 / S2 对账·S3 审计面一句带过 ✅ **取舍 1–5**
- [x] 锚点对照：minio-iceberg.md / 设定书 §7 / 设计稿 66 → 断言 ID ✅ **锚点对照表**

---

## 伪代码走查：`app/data_plane/audit.py`

> **存在理由一句话**：剧本 1《产量下滑归因》第 5 步"生成归因报告（**输出合同：结论+证据链+数据版本**）"（`设定书 §7`）——前两件是 dp4/dp8 的活，**"数据版本"这件落在本设计稿**：把"这答案是按哪一版数据、哪一版口径、什么质量状态算出来的"钉成一行审计记录，事后按同一快照重放校验。
> **示例声明**：走查示例取剧本 1 第 1 步"拉完成率与构成"（`设定书 §7`）——query=产量完成率 × 区块 × 近 30 天（缺参策略"时间窗默认最近 30 天"§7 原话）；snapshot_id=87231 等**数字均为替身**（设计演绎），业务事实只有设定书注的那些。

### §1 审计记录 schema——审计五问 + 双版本列（DP-W-D7-1 的形状底座）

```text
伪代码（数据形状声明，非代码）——审计行 = PRD"可审计"五问 + 可追溯四元组的落行

AuditRecord（AuditStore 落行物，Seam 实现面；列名为设计演绎）
  question_id       # 谁问的：问题实例 ID——审计五问之"谁"（prd-data-plane 可审计行）
  asked_at          # 何时：作答时点（Clock 注入——dp6 同款可冻结替身）
  query             # 什么输入：StructuredQuery 原样落行——回放重跑的就是它，不重猜 SQL；
                    #   "表"随权威表锚在 query 内（dp4 SourceRef，DP5 §1④）——四元组的"表"在此
  snapshot_id       # 依据哪条快照：dp5.run 透传回来的结果快照号（DP-W-D5-4）——审计主锚
  semantic_version  # 口径版本：语义层版本（prd-data-plane D7 原话"语义层版本"）——口径后来
                    #   演化了，回放差异可归因到版本而不是各说各话
  quality_status    # 质量状态：dp3 质量结论随行（validate_batch → QualityReport，dp3 卡）——
                    #   与 PRD 可追溯四元组（表/snapshot_id/口径版本/quality 状态）逐项对上
  original          # 什么输出：当回合作答摘要——比对物在记录时就钉死，回放才有对照
  # 判据：五问（谁/何时/什么输入/什么输出/依据哪张快照）全覆盖 + 双版本列在场 = "齐全"
```

### §2 `record`——dp8.query 的内置伴随调用（DP-W-D7-1）

```text
伪代码 — app/data_plane/audit.py:record（签名逐字取自 dp7 卡）

def record(self, question_id: str, query: StructuredQuery, snapshot_id: int,
           semantic_version: str, quality_status: str) -> AuditRef:
    # 契约：输入=问题实例 ID + 结构化查询 + 快照号 + 口径版本 + 质量状态（四元组五参，卡面合同）
    #       输出=AuditRef——审计凭据，随 AnswerBundle 回带（dp8 卡 AnswerBundle 旁路），replay 按它取行
    # 调用时机（谁调用）：dp8.query 内部顺序 dp9.check_join → dp6.route → dp5.run →
    #   dp7.record（DP-W-D8-2）——dp5.run 拿到结果之后才 record：作答成功是前置，
    #   记录的是"已经给出的答案"，不是"想给的答案"（取舍 4）
    ref = self._store.put(AuditRecord(
        question_id=question_id,                    # 谁问的
        asked_at=self._clock.now(),                 # 何时（审计五问之二）
        query=query,                                # 什么输入：四件套产物原样落行
        snapshot_id=snapshot_id,                    # 依据哪条快照——dp8 从 dp5 结果回填，
                                                    #   不在记录时现取 current_snapshot
        semantic_version=semantic_version,          # 口径版本
        quality_status=quality_status,              # 质量状态
        original=本回合作答摘要))                    # 什么输出：record 在 dp8.query 语境里调用，
                                                    #   dp5.run 的结果在场，摘要随 store 落行携带——
                                                    #   落行形状=AuditStore 实现细节，公开签名按
                                                    #   卡面五参不动（伪代码红线，不私增公开参数）
    return ref
```

### §3 `replay`——按记录快照重跑 dp5 比对主干（DP-W-D7-2 / DP-W-D7-3）

```text
伪代码 — app/data_plane/audit.py:replay（签名逐字取自 dp7 卡）

def replay(self, ref: AuditRef) -> ReplayResult:
    # 契约：输入=审计凭据；输出=ReplayResult(match, original, current)——回放对账三件
    row = self._store.get(ref)                    # ① 取审计行：四元组 + original 都在行内
    #   （可选预检：row.snapshot_id ∈ dp1.snapshots() 白名单——DP1 §3 候选集；本主干走
    #    scan 浮出路径，错误单点）
    result = self._runner.run(row.query,          # ② 按**记录快照**重跑 dp5——快照号从审计行来，
                              snapshot_id=row.snapshot_id)
                              #    **不是** table.current_snapshot（边界规则第 6 行，无例外）：
                              #    回放的语义就是"那一版"；dp5 透传给 dp1.scan（DP-W-D5-4）
    # ③ 快照已被 expire 清理 → dp1.scan 快照号白名单不命中，SnapshotGoneError
    #   （"快照不存在或已过保留窗口"，DP1 §4 同款）沿调用链浮出——dp7 照单上抛，
    #   **绝不静默回退当前快照**（DP-W-D7-3）：证据失效要显式声明，不换考卷再对答案
    match = rows_equal(row.original, result.arrow)  # ④ 逐行比对：同 query × 同快照 → 应同结果
                                                    #    （一致性的两根支柱见取舍 3）
    return ReplayResult(match=match, original=row.original, current=result)
```

> 走查推演（DP-W-D7-2 · 剧本 1 情境）：9 月归因报告落审计行（snapshot_id=87231·替身）→ 两周后有人问"归因结论是不是按当时的数算的" → `replay(ref)` 按快照 87231 重跑同一 StructuredQuery → match=True——剧本 1 输出合同"结论+证据链+**数据版本**"（`设定书 §7`）的第三件就此兑现：数据版本不是报告尾注里的一行字，是一条可重放的审计记录。

### §4 `retention_policy`——两层保留窗口（DP-W-D7-3 后半）

```text
伪代码 — app/data_plane/audit.py:retention_policy（签名逐字取自 dp7 卡）

def retention_policy(self) -> RetentionPolicy:
    # 契约：输出=快照保留窗口策略（形状设计演绎；数值对照设计稿 66 先例，取舍 2）
    return RetentionPolicy(
        rolling=50,     # 滚动窗：日常快照滚动保留 50 条——高频入湖把旧快照滚出窗
        hard_cap=200,   # 硬顶：任何时刻至多留 200 条，越线者先清——同构先例 50/200 的"两层"思路
        audit_rule="审计记录留存随快照窗口")  # prd-data-plane 生命周期行原话：快照没了审计行失效
    # 窗口依据：Iceberg 元数据树里 manifest list 一快照一份（minio-iceberg.md）——每条快照都有
    #   元数据成本：不设窗口 → 元数据无限膨胀；只设一层 → 审计要用的快照被高频入湖冲出窗。
    #   两层 = 日常滚动 + 硬顶兜底。expire 清理是**存储边界不是篡改口**（同设计稿 66 漂移
    #   备案①"已落快照零改写"立场）——快照被清后审计行显式报错（§3③），证据失效看得见。
    # 同构不同物：设计稿 66 版本账保"文档页长什么样"（revision 不可变快照行），本设计稿快照账保
    #   "表数据某时点的文件集合"（Iceberg 快照）——窗口纪律同思路，账本对象不同，两套账不混用。
```

### §5 三档规模——矩阵 dp7 行（换的是配件，不是接口）

| 档位 | 矩阵原词 | 形状与理由 |
|---|---|---|
| S1 边缘档 | 快照号记录 | record/replay/retention_policy 三签名全在；AuditStore=InMemoryAudit 替身——回放即测试形态（模块卡走查计划：同快照 match=True / 过期报错 / 四元组齐全三测） |
| S2 平台档 | +对账作业 | 定期抽审计行批量 replay、漂移即告警（形状设计演绎，取舍 5） |
| S3 集团档 | +集团审计面 | 审计记录成为上报/稽核资产；机制不变，产品形状一句带过（取舍 5） |

---

## 取舍

1. **绑 snapshot_id 而不是时间戳（time-travel 语义之辨）**：Iceberg"每次提交生成快照"、提交即原子替换元数据指针，"按 snapshot 读=该时点全部数据文件集合"（minio-iceberg.md Table Spec）——**时间戳是"时刻"，快照号是"提交身份"**：同一时刻可能零次或多次提交（并发入湖），按时间换算永远在猜；快照号零换算、逐字节可比。回放要的是确定性的"那一版"，不是大概的"那个时刻"——所以审计行主锚=snapshot_id，asked_at 时间戳只做"何时问的"叙述列。
2. **保留窗口两层制（对照设计稿 66 同构先例）**：50 滚动 + 200 硬顶（§4）——窗口依据是元数据成本（manifest list 每快照一份），两层兜住"高频入湖冲掉审计快照"与"元数据无限膨胀"两头；审计记录留存=随快照窗口（prd-data-plane 生命周期行），两套窗口对齐不留孤证。**同构不同物**：66 保的是文档页 revision（知识层账），本设计稿保的是表数据快照（数据层账）——纪律同思路（两层、硬顶兜底、清理是存储边界不是篡改口），账本对象不同不混用。
3. **回放一致的前提是引擎确定性（同 query 同快照同结果）**：match=True 不是 dp7 单方面保证的——成立条件=同一 StructuredQuery × 同一快照 × 同一引擎语义 → 同一结果。湖侧确定性由 Iceberg 背书（数据文件不可变+快照隔离不脏读，Table Spec）；引擎侧由同构翻译背书（DP-W-D5-1）。两个破口都要堵：经 dp5 成本护栏**采样降级**过的查询重跑行集就不同（DP5 §5）——回放按记录原样重跑、不带降级；非确定函数（随机/当前时间）禁入问数查询——否则回放对不出"数据变了"还是"查询本身不确定"。
4. **审计是伴随动作，不是事后补记**：semantic_version/quality_status 是运行时上下文（dp4/dp3 的当回合结论），事后从日志反推必缺角；record 内置在 dp8.query 的 dp5.run 之后（DP-W-D8-2 顺序），答案出门即落账——这也是 dp8 AnswerBundle 必含 snapshot_id/quality_status/as_of 的账本侧理由（DP-W-D8-2）。
5. **S2 对账作业 / S3 集团审计面一句带过**：矩阵行 S2=+对账作业（定期抽 AuditRef 批量 replay，漂移即告警——把"逐条人工质疑才回放"升级成"制度性抽检"）、S3=+集团审计面（审计记录成为上报资产）；讲形状不讲实现，本设计稿机制三签名在 S1 即全覆盖。

## 锚点对照

| # | 论断（设计稿出处） | 锚（分册/设定书/规格/先例） | 断言/落位 |
|---|---|---|---|
| 1 | 每次提交生成快照，"某时点状态（含全部数据文件集合）"可按快照读回；提交=原子替换元数据指针 | minio-iceberg.md（Table Spec） | §3②、取舍 1 |
| 2 | "Time travel = 结论可回放……'可复现分析'是 Agent 结果可信的底线"；模式 3 `assert replay == answer` | minio-iceberg.md「使用场景」「模式 3」 | DP-W-D7-2（§3、推演） |
| 3 | 快照隔离：并发读写"读的是加载时的快照，不会读到半截写入" | minio-iceberg.md「使用场景」 | §3④、取舍 3 |
| 4 | manifest list 一快照一份——保留窗口的元数据成本依据 | minio-iceberg.md「核心能力面」 | §4、取舍 2 |
| 5 | 剧本 1《产量下滑归因》输出合同"结论+证据链+数据版本"；缺参默认最近 30 天 | `设定书 §7` | 引子、§3 推演、DP-W-D7-2 |
| 6 | 可审计五问（谁/何时/什么输入/什么输出/依据哪张快照）；可追溯四元组（表/snapshot_id/口径版本/quality 状态）；留存随快照窗口；expire 清理讲机制不做实现 | prd-data-plane「Agent 产品加问」/生命周期行 | §1、§4 |
| 7 | "语义层版本"入审计记录 | prd-data-plane D7 原话 | §1 semantic_version 注 |
| 8 | 两层保留窗口 50/200（机器快照 50 条窗口、硬顶 200）；清理是存储边界不是篡改口、"已落快照零改写" | 设计稿 66（同构对照，两套账不混用） | §4、取舍 2 |
| 9 | `dp7.replay` 用当前快照替代记录快照=禁止（无例外）——回放的语义就是"那一版" | modules.md 边界规则第 6 行 | §3②③、追问 2 |
| 10 | dp1.scan 快照号白名单校验，SnapshotGoneError"快照不存在或已过保留窗口"；snapshots()=dp7 审计候选集 | DP1 设计稿 §4/§3 | §3②③ |
| 11 | dp5.run snapshot_id 透传（DP-W-D5-4）；采样降级破口 | DP5 设计稿 §1/§5 | §3②、取舍 3 |
| 12 | dp8.query 内部顺序 dp9.check_join → dp6.route → dp5.run → dp7.record；AnswerBundle 四件齐 | DP-W-D8-2；dp8 卡 | §2 调用时机、取舍 4 |
| 13 | dp3 质量结论（QualityReport）随行 | modules.md dp3 卡 | §1 quality_status 注 |

## 预计追问

1. **original 都落行了，replay 还重跑干什么？** 存的是"当时答了什么"，回放证明"按当时的数重算还是它"——中间补录/修数后重算不一致，恰是审计要暴露的事实；只存结果防不住"数被悄悄改过"的质疑。
2. **快照过期为什么不能拿当前快照"近似回放"？** 边界规则第 6 行无例外——回放的语义就是"那一版"；换快照回放=审计时换考卷对答案，match 与否都失去证据资格——所以显式报错并把出路指向 retention_policy 的窗口取舍。
3. **match=False 说明什么？** 快照未变（数据文件不可变）时差异只能来自查询侧：口径版本换了（semantic_version 在行内可查）、引擎方言差异、或采样降级——ReplayResult 带 original/current 两列就是为定位差异。
4. **审计行自己存在哪？** Seam=AuditStore / Adapter=InMemoryAudit（模块卡走查计划），S1 即测试形态；真实档位随存储选型走，留存纪律=随快照窗口（prd-data-plane 生命周期行），本设计稿讲机制不选产品。
5. **50/200 哪来的？** 设计稿 66 实测先例（机器快照 50 条窗口、硬顶 200）同构借鉴——数值是设计演绎非业务事实，湖表侧真实窗口随入湖频率与存储预算定。
