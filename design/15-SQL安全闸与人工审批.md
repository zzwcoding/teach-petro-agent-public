# 设计稿 15：SQL 安全闸与人工审批（只读 AST 闸 + 高风险执行前 interrupt 审批）

> **红线声明**：本设计稿零真实可运行代码。全部代码块均为**伪代码**（块首标注"伪代码 — 文件:函数"）。设计范围框架红线：LangGraph 按官方 API 形状写真实调用序列（锚 docs/tech-stack/langgraph.md，下称 LangGraph 官方文档）——`from langgraph.types import interrupt` 后 `interrupt(payload)` 在节点内暂停图、`Command(resume=value)` 作为 invoke 输入恢复（LangGraph 官方文档：resume 是唯一可作为输入的 Command 模式）、**恢复值即 interrupt() 的返回值**、interrupt 必须配合 checkpointer（无 checkpointer 则无法恢复）、恢复后**整节点从头重跑**故节点副作用必须设计为幂等——逐条落在主干三，不做"概念性提及"替代。SQL 解析选型 **sqlglot**（纯 Python、方言参数化、AST 改写与序列化原生支持）——非设计范围点名技术，属本节选型记录，理由入取舍 3。
> **stub 换真身声明**（设计稿 00 登记表 #9 尾注 + 设计稿 14 主干八占位）：本节把设计稿 14 留下的两处直通替身换为真身，**同文件同签名、图布线零改动**——`check_sql`（直通=零判断放行）→ AST 只读闸真身；`run_query` 审批位（直通=不判风险不挂起直接执行）→ 风险判据 + interrupt 审批 + 幂等重跑真身。消费方（generate_sql / verify_result / build_graph）零改动。
> **边界声明**：本节只在 `m7` 范围。对 `m8` 为**使用公开接口**——`Executor.call(tool_call, user)` 五步闭环 + `query_production_db` 注册名（设计稿 12 契约，零内部 import、零接口修改）；对 `m3` 为**使用公开面**——`Repository.save_audit(call_record)` 审计写入（复用 m3 统一审计面；卡面注释语义为"网关用量审计（m2 调）"，审批审计复用属语义扩展，**已备案**，见越界自查）。闸与审批位**零模型调用、零网关记账**（拒绝话术是固定文本，不是生成——同设计稿 10 无据拒答闸先例）。审批请求事件帧桥接与 Command(resume) 的运行时驱动归设计稿 19，本节以"运行时（设计稿 19 接线）"占位。
> **明确不讲的**（设计范围声明）：生成与校验节点真身（设计稿 14 已交付）；运行时桥接与审批事件帧（设计稿 19）；会话上下文缓存（设计稿 18）；KV Cache 提示词装配器（设计稿 16）；审批超时升级策略与审批 UI（设计稿 19 与后续迭代）。

> **前端展示位注记**（2026-09-27）：LIMIT 收口口径（没写补默认 50 行、超 200 截到 200、只封顶不抬底，与工具 schema maximum=200 同源）与"SQL 引用选表命中集之外的外表→interrupt 人工审批（批准续跑/驳回权限拒答零重试；DELETE/无 LIMIT 硬拦不设审批）"在原型 A1 第 23 场景/D3 页有对应展示（A1/A5 / F14 改注）。

## 实现清单

- [x] 只读安全闸：AST 解析只放行 SELECT+白名单表+强制 LIMIT；删除语句/无行数上限语句被拦，生产库零执行（源：W-F7-3）✅ **主干一**（解析→语句类型→表白名单→LIMIT 收口四道判 + **捣乱输入 A** DELETE 全程零执行 + **捣乱输入 B** LIMIT 打架的 AST 封顶解法）
- [x] 拦截去向：被拦语句→结构化错误回灌或直接拒绝话术（不进执行）（源：W-F7-3）✅ **主干二**（三个出口形状 + "可确证性"分岔判据 + 回灌轮与执行失败轮共享熔断预算）
- [x] 高风险执行前人工审批：中断暂停→批准后恢复→整节点幂等重跑无重复副作用（源：W-F7-6）✅ **主干三**（interrupt(payload)/Command(resume) 官方调用序列 + **捣乱输入 C** 整节点重跑与审计幂等键）
- [x] 挂起续跑支撑：审批挂起期间状态经检查点可恢复（源：W-F7-6；卡 `m7` 公开接口）✅ **主干三** t0–t2（checkpointer 快照、进程重启、InMemorySaver/AsyncPostgresSaver 换边）
- [x] 本节把设计稿 14 的直通安全位与审批位换为真身（源：卡 `m7` stub 纪律）✅ 头部 stub 换真身声明 + **主干一/三/四** + **越界自查**
- [x] 越界引用为零（源：modules.md 边界规则表）✅ **越界自查**

---

## 走查：从输入到验收行为

> **主角数据**（业务真数据样子，沿设计稿 14 的同一会话延续）：
> ① 标准问：老王（油藏工程师账号，会话 `th-laowang-001`）问 **"上个月产量最高的三口井"**——生成的 SQL 无 LIMIT、表全在选表命中集内，走"零挂起"低风险路径（主干一③→主干四）；
> ② 捣乱输入 A：老王接着问 **"把上个月产量前三拉出来，顺便把 7 月测试井的脏数据清掉"**——问题文本带着删除诉求，模型真的给出了 DELETE（W-F7-3 主角）；
> ③ 捣乱输入 B：模型生成的 SQL **已带 `LIMIT 100000`**（想全量拉数）与子案例 `LIMIT 10`——和强制行数上限打架（W-F7-3"强制 LIMIT"主角）；
> ④ 高风险主角：老王问 **"对照井位台账看看这三口井的井别"**——生成的 SQL JOIN 了选表命中集之外的表 `erp_well_register`（schema 集合没收录的外部台账表），高风险审批位挂起（W-F7-6 主角）；
> ⑤ 捣乱输入 C：④ 的审批在挂起期**赶上进程滚动重启**，次日审批人才点批准——恢复后 run_query 整节点重跑，审计写会不会重复（W-F7-6 幂等主角）；
> ⑥ 解析失败主角：模型输出 **两条连写语句**（`SELECT …; SELECT …`）——形状不成立（W-F7-3 最严处理主角）。
> **地图先行**（本节两道闸在问数一生中的位置；六节点布线沿用设计稿 14，本节只换两处节点函数体，后续步骤引用不重画）：

```text
伪代码（本节两道闸在问数链上的位置总览，非代码）

问数状态机容器 C5 —— 布线零改动（设计稿 14 已铺；本节换两处节点函数体，消费方零改动）
  ① clarify_intent → ② retrieve_schema → ③ generate_sql（均设计稿 14 真身，本节不讲）
  ④ check_sql    🛡️ 本节换真：AST 只读闸——解析→只放行 SELECT→表白名单→强制 LIMIT     主干一
       ├─ 拦截-可纠正（形状成立语义违禁）→ Command(goto=generate_sql) 回灌自愈          主干二
       └─ 拦截-最严（解析失败/多语句）→ Command(goto=END) 拒绝话术出图（fail-closed）    主干二
  ⑤ run_query    🛡️ 本节换真：审批位 interrupt（有外表旗标才挂起）+ 执行走 m8 执行器    主干三/四
       ├─ 挂起→批准 → Command(resume=决定) 恢复→整节点重跑→审计(幂等键)→Executor.call   主干三
       ├─ 挂起→拒绝 → Command(goto=END) 任务终止并说明                                  主干三
       └─ 无旗标（白名单内）→ 零挂起直接执行（低风险路径零审批成本）                      主干四
  ⑥ verify_result（设计稿 14 原样：成功出图/错误回灌/熔断）——本节不讲
  布线声明：闸的出口全部用 Command 收进节点（设计稿 14 反问闸同一先例）——卡面一条条件边
  （route_after_verify）保持原样，设计稿 14 的图零改动，本节只换函数体（同文件同签名纪律）
```

### 主干一：check_sql——AST 只读闸的四道判（W-F7-3 本体）

check_sql 站在生成之后、执行之前：它拿到的 `state["sql"]` 是模型刚产出的文本，它交出去的是**规范化 SQL**。它是问数链里唯一**零 IO、零模型调用**的节点——纯计算闸，重跑零副作用、时延微秒级、离线可测（这个性质在主干三的整节点重跑里直接兑现为"重跑前半程无痕"）。

```text
伪代码 — app/agents/text2sql/nodes/guard.py:check_sql（m7；签名=设计稿 00 登记表 m7 原文；
         本节把设计稿 14 的直通替身（return {}）换为真身；闸的出口全部 Command 收进节点，图零改动）

import sqlglot
from langgraph.types import Command
from sqlglot import exp
from .verify import _MAX_ATTEMPTS, 熔断话术        # m7 包内部件共享：上限常量与话术同源（主干二）

_DEFAULT_ROW_LIMIT = 50    # 缺 LIMIT 时注入的默认行数（与 run_query._ROW_LIMIT、设计稿 14 对齐）
_ROW_LIMIT_CEILING = 200   # 行数收口值 = 设计稿 12 工具 schema 的 row_limit.maximum——闸先行、工具末闸兜底
_只读根类型 = (exp.Select, exp.Union)              # 只读语句形状白名单（UNION 仍是查询）
_禁行节点 = (exp.Delete, exp.Update, exp.Insert, exp.Create, exp.Drop, exp.Alter, exp.Command)

async def check_sql(state) -> dict | Command:
    原文 = state["sql"]
    # ── 主干判断① 解析：先剥 markdown 代码围栏（"伪解析失败"头号来源），再按生产方言解析 ──
    try:
        语句列表 = sqlglot.parse(剥围栏(原文), read="postgres")   # 方言=PG/金仓兼容模式（m3 连接面同族）
    except 解析失败:
        → 出口②拦截-最严（goto=END，设计范围"解析失败按最严处理"——出口形状见主干二）
    # ── 主干判断② 多语句拒：Artifact 执行纪律"拒绝多语句查询"——两条 SELECT 连写也不行 ──
    if len(语句列表) != 1:
        → 出口②拦截-最严                                   # 捣乱输入⑥的落点（主干二走一遍）
    树 = 语句列表[0]
    # ── 主干判断③ 语句类型白名单：根类型 ∈ 只读形状，且全树扫不到任何写节点（双保险）──
    if not isinstance(树, _只读根类型) or 树.find_all(_禁行节点) 非空:
        → 出口①拦截-回灌（readonly_violation——形状成立、语义违禁，可自愈；捣乱输入 A 落点）
    # 根类型判 + 全树扫描各防一条路径：根是 SELECT 但 CTE/子查询里藏写节点，被全树扫描兜住
    # ── 主干判断④ 表名白名单：AST 全量收集表引用（JOIN/子查询/CTE 内的表不漏）──
    引用表 = {t.name for t in 树.find_all(exp.Table)}
    命中表 = {t["table"] for t in state["tables"]}   # 白名单单一事实源=选表节点命中集（设计稿 14 主干四）
    外表 = 引用表 - 命中表
    # ★ 外表不在此拦——旗标交 run_query 审批位（取舍 2：审批给"合法但超常"，不给"非法"兜底）
    # ── 主干判断⑤ 强制 LIMIT：封顶语义用 AST 改写，禁止字符串拼接/正则替换 ──
    现限 = 树.args.get("limit")
    if 现限 is None:
        树 = 树.limit(_DEFAULT_ROW_LIMIT)               # 缺失 → 注入默认（W-F7-3"无行数上限语句被拦"）
    elif 取限值(现限) > _ROW_LIMIT_CEILING:
        树 = 树.limit(_ROW_LIMIT_CEILING)               # 超收口 → 截到收口
    # else 原样保留：模型给的更小上限是它契约的一部分——只封顶不抬底（捣乱输入 B）
    # ── 数据变形：AST 序列化 = 规范化 SQL（注释剥除、空白/大小写归一）——执行与指纹共用规范形 ──
    return {"sql": 树.sql(), "error": None}
    # 出口③ 放行：不追加 attempts（放行不是"尝试"，语义见主干二）；error=None 用覆盖语义清残留错误
    # （error 无 reducer——新值顶旧值，设计稿 14 主干一；防闸回灌轮的旧错误在后续轮被重复回灌）
    # 异常去向：本节点零 IO 零模型调用——无下游异常可抛；解析失败已在主干判断①折成出口②
```

**捣乱输入 A：提示词已写"只能 SELECT"，模型仍给了 DELETE**——

```text
伪代码（时序推演，非代码）

t0  老王问："把上个月产量前三拉出来，顺便把 7 月测试井的脏数据清掉"
    ——生成模板纪律（设计稿 14 主干五 _SQL_TEMPLATE："只生成单条 SELECT"）对模型是软约束，
      问题文本里的删除诉求把它顶掉了（上下文层护栏被穿透的实录）
t1  generate_sql 产出：DELETE FROM oil_production_daily WHERE prod_date < '2026-08-01'
t2  check_sql：sqlglot 解析成功（DELETE 是合法 SQL——"能解析"≠"能执行"）；
    根类型 Delete ∉ (Select, Union) → 形状成立、语义违禁 → 出口①结构化错误回灌：
    {"error_code": "readonly_violation",
     "message": "语句类型 DELETE 被只读闸拦截——问数链只接受单条 SELECT 查询",
     "hint": "只读分析不允许写操作；请以 SELECT 直接回答用户的数据问题"}
    Command(update={error, attempts+1}, goto="generate_sql")，attempts 轨迹 +1
t3  generate_sql 带错误回灌重生成：SELECT … ORDER BY oil_prod DESC（"清脏数据"诉求被丢弃——
    闸的 hint 把生成拉回只读轨道）
t4  重过闸：SELECT + 表全在命中集 + LIMIT 注入 → 放行 → 审批位零旗标 → 执行 → 校验 → 出图

可观察行为：DELETE 全程**未到达 m8 执行器、未到达生产库**——生产库零执行（W-F7-3）。
闸在哪：check_sql 主干判断③的根类型判（代码闸）。拦完数据去哪：回灌生成节点自愈，
轨迹记"拦截-回灌"。
代码即规则 vs 提示词约束：提示词是"建议别做"（上下文层护栏，可被问题文本里的注入顶掉）；
AST 闸是"做不了"（执行层护栏，不依赖模型自觉）。提示词保留——它提高一次通过率、省闸轮次；
但安全不押在它身上：**提示词管效率，代码管正确性**（锚 原书 §5 约束优先于指导、LangGraph
官方教程"确定性控制 vs 纯 prompt 约束"）。
```

**捣乱输入 B：原 SQL 已带 LIMIT，与强制上限打架**——

```text
伪代码（时序推演，非代码）

t0  生成产物一：SELECT … ORDER BY oil_prod DESC LIMIT 100000（模型想全量拉数）
    子案例：SELECT … LIMIT 10（模型自己收了更小的口）
t1  naive 做法（本节明令禁止）：字符串尾拼 " LIMIT 50" → "LIMIT 100000 LIMIT 50"——语法错误；
    或正则无脑替换成 50 → 把模型显式给出的 10 顶成 50（静默代改模型契约）
t2  AST 封顶（本节做法，主干判断⑤）：读 limit 节点现值——
    100000 > 收口 200 → 截到 200（上限语义：不得超过）
    10 ≤ 200 → 原样保留（上限语义：只封顶不抬底——把 10 抬成 50 是越权代改）
    无 LIMIT → 注入默认 50（W-F7-3 的"强制"就落在这一支）
t3  序列化规范化：注释/空白/大小写归一后的规范形 SQL 进入 state["sql"]——
    下游执行用它，指纹（设计稿 14 verify 的无进展检测）也算它：注释变体与原文算同一指纹，
    防"加个注释绕过指纹检测"的变体攻击（设计稿 14 指纹闸的配套加固）

闸在哪：主干判断⑤的 AST 改写。拦完数据去哪：不拦——封顶；改写后的规范形照常放行。
```

### 主干二：拦截后的去向——回灌还是拒绝的分岔（W-F7-3 收尾）

分岔判据一句话：**可确证性**。拦下的东西若是"形状成立、违禁点明确"（模型知道规则就能改对），回灌当纠正材料；若是"连形状都不成立"（解析失败/多语句——输入可能是截断垃圾或注入载荷），按设计范围钉死的最严处理：拒绝话术出图，**fail-closed**——不可确证的输入不能喂回模型当下一轮的指导。

```text
伪代码 — app/agents/text2sql/nodes/guard.py:check_sql 的三个出口（出口形状；判定主干见主干一）

from langgraph.types import Command

# ── 出口① 拦截-可纠正（形状成立、语义违禁：DML/DDL 根、全树藏写节点）→ 回灌自愈 ──
已试 = len(state["attempts"]) + 1                       # 本轮计入后的总预算消耗
if 已试 >= _MAX_ATTEMPTS:                               # ★ 上限闸前置（防"生成↔闸"小循环绕过熔断）
    return Command(update={"result": 熔断话术(state["attempts"] + [本轮("拦截-熔断")]),
                           "attempts": [本轮("拦截-熔断")]}, goto=END)
return Command(update={
        "error": {"error_code": "readonly_violation",
                  "message": f"语句类型 {根类型名} 被只读闸拦截——问数链只接受单条 SELECT 查询",
                  "hint": "只读分析不允许写操作；请以 SELECT 直接回答用户的数据问题"},
        "attempts": [本轮("拦截-回灌")]},                # 单元素列表 → reducer 追加（设计稿 14 主干一）
    goto="generate_sql")
# ── 出口② 拦截-最严（解析失败 / 多语句——形状不成立）→ 拒绝话术出图（设计范围：按最严处理）──
return Command(update={
        "result": {"kind": "refused",
                   "text": "这条查询无法通过安全解析，已停止执行。请换一种问法"
                           "（例如：上个月 N-2 井的日产油量是多少？）"},
        "attempts": [本轮("拦截-拒绝")]}, goto=END)
# ── 出口③ 放行 → 静态边去 run_query（形状见主干一 return）──
```

**三个出口的机制要点**：

- **出口形状全部走 Command**（回灌 `goto="generate_sql"`、拒绝 `goto=END`）：卡面只点名 route_after_verify 一条条件边，闸的出口收进节点，图布线保持设计稿 14 原样——与设计稿 14 反问闸同一先例。
- **回灌轮与执行失败轮共享同一条熔断预算**：attempts 是全链路轨迹（reducer 累加，不分管家），上限判据在两个能发起回灌的节点各自前置检查——verify_result（设计稿 14 既有）与 check_sql（本节新增，出口①首行）。判据同源（同一 `_MAX_ATTEMPTS`、同一熔断话术函数，包内共享）。若不前置：DELETE→回灌→再 DELETE→回灌的循环永远不经过 verify_result，上限闸形同虚设，只能靠官方 recursion_limit（默认 1000）兜底——这正是 原书 §5 控制流层"死亡螺旋"（恢复逻辑自身反复触发）的预防位。
- **放行不追加 attempts**：attempts 的语义是"待校验/待修正轮"的轨迹。若放行也入账，verify_result 的无进展指纹检测会读到闸放行条目里同一条 SQL 的指纹，把**第一次**执行失败误判成"重复无进展"提前熔断——判据耦合的坑，按语义边界规避。

**捣乱输入⑥：模型输出两条连写语句（解析失败族）**——

```text
伪代码（时序推演，非代码）

t0  generate_sql 产出："SELECT … LIMIT 3; SELECT count(*) FROM oil_production_daily"
t1  check_sql 主干判断①：剥围栏后 sqlglot.parse 解析成功——但返回**两条**语句
t2  主干判断②：len(语句列表) != 1 → 出口②（拦截-最严）：
    result={"kind": "refused", "text": "这条查询无法通过安全解析，已停止执行。请换一种问法…"}
    goto=END——不回灌、不执行、零生产库访问
t3  为什么不回灌：多语句里第二句是什么、第一句被截没截，闸无法确证；把它当"纠正材料"
    喂回模型=让不可信输入指导下一轮生成——fail-closed 是安全闸的默认姿态
    （对照出口①：DELETE 的违禁点是确证的——类型白名单说了算，回灌才有明确的纠正路径）

闸在哪：主干判断①②（解析+条数）。拦完数据去哪：拒绝话术作为正常终态 result 出图
（事件帧归设计稿 19 桥接），轨迹记"拦截-拒绝"——与设计稿 14 熔断同理：拒绝是用户该收到
一句人话的正常结局，不是系统故障。
```

### 主干三：interrupt 人工审批——挂起、恢复与整节点重跑（W-F7-6）

风险判据不设新 State 字段（State 七字段是卡面登记的公共契约，设计稿 14 主干一）：run_query 调 guard 包内导出的同一私有函数 `风险评点(state["sql"], 命中表)` **重算**外表旗标——判据单一事实源（同一函数），纯计算重算成本≈0。审批位住 run_query 是卡面原文（"run_query … 含 interrupt() 人工审批位"）：审批的对象是"这一次执行"，不是"这条 SQL"。

```text
伪代码 — app/agents/text2sql/nodes/execute.py:run_query（m7；签名=设计稿 00 登记表 m7 原文；
         本节把设计稿 14 的审批位直通替身换为真身；执行腿细节见主干四）

from langgraph.types import interrupt, Command
from .guard import 风险评点                       # 判据同源重算——不新增 State 键（State 七字段是卡面契约）

_ROW_LIMIT = 50    # 设计稿 14 既有常量，与闸注入默认一致

async def run_query(state) -> dict | Command:
    # ── 主干判断① 风险评点（纯函数重算）：白名单外表引用 = 高风险 ──
    旗标 = 风险评点(state["sql"], {t["table"] for t in state["tables"]}).外表引用
    if 旗标:
        # 🛡️ 审批位（W-F7-6）：interrupt 暂停图——State 快照已随 checkpointer 落盘，
        #   进程可重启、审批可跨时段；本节点内唯一挂起点、判据只读冻结 State——
        #   挂起点位置确定，恢复值与 interrupt() 的对应关系因此无歧义
        决定 = interrupt({"type": "sql_approval",           # 载荷=审批人需要的全部现场
                          "question": state["question"],
                          "sql": state["sql"],
                          "risk": 旗标})                     # 如 ["表引用超出选表集合: erp_well_register"]
        # 挂起→恢复：运行时（设计稿 19 接线）把挂起事件折成审批请求帧；审批人的决定被包成
        #   Command(resume=决定) 作为 invoke 输入重新驱动图（LangGraph 官方文档：resume 是唯一可作为输入的
        #   Command 模式）——恢复值即上面 interrupt() 的返回值；恢复后【整个 run_query 从头
        #   重跑】（LangGraph 官方文档幂等行：节点中断恢复时从头重跑整个节点函数）
        if 决定.get("action") != "approve":
            # 拒绝审批→任务终止并说明（设计范围异常去向）：老王知道为什么没结果
            return Command(update={"result": {"kind": "refused",
                                              "text": 终止话术(旗标, 决定.get("note"))},
                                   "attempts": [{"sql": 指纹(state["sql"]),
                                                 "verdict": "审批拒绝"}]},
                           goto=END)
        # ── 副作用①（批准后才发生）：审批执行审计——幂等键收口（捣乱输入 C 的答案）──
        # 会话号经 config 进节点（与 user 同源占位，设计稿 19 接线——设计稿 14 主干二同源）；
        # 轮次读 attempts 长度：两者在恢复重跑时都读自冻结快照，键因此是重跑不变量
        await Repository.save_audit({"kind": "sql_approval",            # m3 公开面（边界声明）
                                     "idem_key": f"{会话号}:{len(state['attempts'])}:{指纹(state['sql'])}",
                                     "decision": 决定, "sql": state["sql"], "risk": 旗标})
        # save_audit 抛错=真故障（库不可达）→ 结构化上抛折错误帧（设计稿 14 网关错误同待遇）；
        # 重跑时同键重写仍一行——审计不因重跑而重复
    # ── 副作用② 执行：永远走 m8 执行器公开接口（边界红线；契约=设计稿 12，主干四）──
    tool_call = 构造调用(name="query_production_db",
                         arguments={"sql": state["sql"], "row_limit": _ROW_LIMIT})
    tool_result = await Executor.call(tool_call, user)   # 五步闭环：校验→权限→执行→三分法
    return {"result": tool_result}       # 成败判定归 verify_result（设计稿 14 分工不变）
```

**审批载荷与恢复值形状**：

```text
伪代码（数据形状，非代码）

审批载荷（interrupt 的 payload，给审批人的全部现场）：
  {"type": "sql_approval", "question": 老王原问, "sql": 规范SQL, "risk": [旗标…]}
恢复值（Command(resume=…) 注入，即 interrupt() 返回值）：
  {"action": "approve" | "reject", "by": 审批人账号, "note": "批注（可选）"}
# LangGraph 官方教程的 approve / edit / response 三分支，本节收窄为 approve/reject 两种——
# edit（审批人改 SQL 再放行）留作后续扩展，且改完的 SQL 必须重过 AST 闸再执行，
# 不能从审批位直通进执行器——"审批改写"是新的生成，生成必须重新过闸
```

**捣乱输入 C：审批挂在夜里，进程滚动重启——整节点重跑语义**——

```text
伪代码（时序推演，非代码）

t0  老王问"对照井位台账看看这三口井的井别" → 生成 SQL JOIN erp_well_register（外表）
    → check_sql 放行（SELECT/白名单 LIMIT 都合规，只是旗标外表）→ run_query 风险评点命中
    → interrupt(载荷) 暂停：图在 super-step 边界停下，State 快照（sql/tables/attempts/question）
    落 checkpointer；运行时把挂起事件折成审批请求帧（设计稿 19 接线），值班手机收到审批卡片
t1  夜里部署滚动重启，进程换了——
    开发 InMemorySaver：快照重启即失（LangGraph 官方文档原文），挂起丢失、审批请求随重跑重发（开发语义可接受）；
    生产 AsyncPostgresSaver：快照在库里，同 thread_id 恢复如初（金仓适配无公开文档，
    属自研改造点——设计稿 14 主干二已注，换边收在 compile 一处参数）
t2  次日审批人点"批准" → 运行时 ainvoke(Command(resume=决定), 同 thread_id config)
    → 图从检查点恢复，run_query **整节点从头重跑**（LangGraph 官方文档幂等行）
t3  重跑前半程（挂起点之前）：风险评点重算——纯函数、读冻结 State（sql/tables 未变），
    旗标照旧 → 走到 interrupt() 这一行，**这次直接返回恢复值，不再挂起**——
    不会出现"批准之后又被问一遍"；重跑前半程零 IO 零写，无痕
t4  副作用①审计写：幂等键 = 会话号:轮次:SQL指纹——与首次重跑前"想写"的那条同键，
    落库仍一行（同键重写不产生第二行）
t5  副作用②SELECT 执行：只读天然幂等；挂起期间生产库若有新写入，恢复后读到新值——
    以恢复后这次执行为准，结果快照由 verify 通过后写一次（设计稿 14 分工）
t6  可观察行为：审批记录恰一条、生产库只读零写入、老王次日拿到三口井的井别对照——
    "恢复后 run_query 幂等重执行无重复副作用"（W-F7-6）逐字兑现

反事实（没有幂等键的 naive INSERT）：每次"重启+恢复"叠加一行审批记录，审计里
"批准了什么"变成"批准了 N 遍"——不资损但污染合规对账。幂等键不是优化，是 LangGraph 官方文档
"节点副作用必须设计为幂等"在审批审计上的具体兑现。
```

**挂起成本的账**：挂起本身近乎零成本（存一次快照），真正的成本在**恢复侧**——整节点重跑迫使节点内部按"挂起前纯计算、批准后副作用"切两段，且每段副作用都要可重放（审计带幂等键、读天然幂等）。这就是取舍 4 的机制来源：**interrupt 的恢复成本与节点幂等是同一枚硬币**——不设计幂等，interrupt 就不是安全机制而是重复副作用发生器。

### 主干四：执行腿——永远走 m8 执行器（只读账号/行数收口/超时/参数化绑定缺口）

```text
伪代码 — 执行腿的 m8 公开接口使用形状（契约=设计稿 12 主干三/五，本节零修改零内部 import）

tool_call = 构造调用(name="query_production_db",
                     arguments=JSON文本({"sql": state["sql"],        # 闸产出的规范形 SQL
                                         "row_limit": _ROW_LIMIT}))  # 50 ≤ schema 上限 200
tool_result = await Executor.call(tool_call, user)
# Executor 五步（设计稿 12）：lookup → json.loads → schema 校验 → assert_allowed → 执行
# 本节上游闸不替代五步——五步里的工具侧防线原样保留（防御纵深，见下表）
return {"result": tool_result}
```

**执行层纪律逐项落点对照**（锚 原书 §5 Artifact 模式的执行纪律清单）：

```text
伪代码（对照表，非代码）

┌────────────────────┬──────────────────────────────────────────────────────────┐
│ 书面纪律             │ 本系统落点                                                 │
├────────────────────┼──────────────────────────────────────────────────────────┤
│ 只读数据库账号       │ m3 连接串外置：生产连接串配只读账号（部署期决策，数据层护栏——  │
│                    │ 上两层全被绕过时库账号仍只读，锚 原书 §1 数据层）              │
│ 解析 SQL 只放行      │ check_sql AST 闸（本节，生成后执行前）；工具侧 SELECT 前缀末闸 │
│ 批准的 SELECT       │ （设计稿 12，关键字级）挡漏网——两层各防一条绕过路径               │
│ 拒绝 DDL/DML/多语句  │ 同上两处：根类型判+全树扫描+parse 条数判                      │
│ 服务端参数化绑定     │ 【缺口如实记录】m8 工具契约 text(sql) 整句执行，字面量未参数化； │
│                    │ 现有补偿=只放行 SELECT+只读账号（字面量风险被形状与权限收窄）；   │
│                    │ 彻底兑现需 m8 工具执行面把 sql 与 params 分离——按边界纪律      │
│                    │ 经扩卡改卡，不在本节私改（登记遗留）                          │
│ 限制返回行数         │ 双层：闸注入/截断 LIMIT（≤200 收口）+ 工具 fetchmany 收口     │
│                    │ （设计稿 12）                                                  │
│ 限制可访问表         │ 表白名单（闸，硬）+ 外表人工审批（本节审批位，软）               │
│ 限制查询时间范围     │ 提示词纪律层（生成模板要求时间条件明确——设计稿 14）；非硬闸，     │
│                    │ 已知边界（设计范围闸范围只有 SELECT/白名单/LIMIT 三项，不私加）     │
│ 超时               │ Executor 下游错三分法已有 db_timeout 形状（设计稿 12）；语句级    │
│                    │ 超时在 m3 会话/引擎层配置——m7 不重复造                          │
└────────────────────┴──────────────────────────────────────────────────────────┘
```

**为什么闸在 m7 而不是只靠 m8 的末闸**：末闸（设计稿 12 工具侧 `startswith("SELECT")`）只有"参数错"一种表达，且站在 Executor 内部——用户与模型都得不到"为什么被拒、该怎么改"；AST 闸站在生成之后执行之前、持有 State 上下文（选表命中集），能给回灌 hint、能给审批旗标、能把拒绝话术写成正常终态。三层各司其职：**闸管语义与自愈，末闸管漏网，只读账号管"代码全错时世界仍然完好"**（数据层护栏不依赖上两层正确——锚 原书 §1）。

## 关键判断的取舍记录

1. **只读约束是"代码即规则"：闸在执行前，提示词只管效率不管安全。** 设计范围边界红线原文"只读约束是'代码即规则'——闸在执行前，不靠提示词约束"。机制依据：提示词纪律是上下文层护栏，可被问题文本里的注入顶掉（捣乱输入 A 是实录——模板写着"只生成单条 SELECT"，模型仍给 DELETE）；AST 闸是执行层护栏，判定不依赖模型自觉。LangGraph 官方教程同款论据：预置 agent 靠 system prompt 约束行为，LangGraph 拆专用节点强制控制度更高——check_sql 即官方 check_query 的同构位。闸还零模型调用零记账（拒绝话术是固定文本）：安全闸不增加模型成本。备选"只靠提示词+工具侧末闸兜底"不选：拦截时点晚、拒绝语义混在工具参数错里、没有自愈路径。换边条件：无——这是底线不是权衡。
2. **审批位给"合法但超常"的查询，不给"非法"查询兜底：表白名单违例走人工审批，语句类型/LIMIT 违例不设审批。** 删除语句被硬拦，人不需要被请求批准一条 DELETE（审批位对非法语句零价值）；而外表引用可能是合理业务查询（schema 集合漏收的台账表），一票否决推高误拒绝率——锚 原书 §1：护栏还有"误拒绝"这一失败模式，评估不能只测"该拒的被拒"，还要测"该过的能过"。代价：审批位引入挂起/恢复复杂度——用"有旗标才 interrupt"把成本严格限定在高风险路径，白名单内查询零挂起（主角①的路径）。换边条件：合规要求全量审批留痕时，审批位前移为"无条件 interrupt（risk 可为空）"——机制不变，成本变。
3. **强制 LIMIT 与指纹基准都用 AST 规范形，不用字符串拼接/正则。** LIMIT 注入的语义是"封顶"不是"追加"：缺失补默认、超收口截断、更小的显式上限保留（捣乱输入 B 三分支）——字符串拼接产出语法错误，正则替换会被注释/大小写/嵌套骗过。AST 序列化的副产品是规范化 SQL（注释剥除、形状归一）：执行与设计稿 14 的无进展指纹共用同一规范形，防"加注释绕过指纹检测"的变体。sqlglot 选型记录：纯 Python（麒麟/鲲鹏可装，对齐 m11 交付约束）、方言参数化（read="postgres" 对金仓兼容模式）、AST 改写原生；边缘私有语法解析失败落进"最严拒绝"兜底——解析不了的不执行，永远是安全侧。换边条件：方言差异实际撞墙时换 read 参数或前置一条方言归一，闸结构不动。
4. **interrupt 挂起把恢复成本押在节点幂等上：挂起前零副作用，批准后副作用带幂等键。** LangGraph 官方约束"恢复=整节点从头重跑"，设计对策是把 run_query 切成两段：interrupt 之前纯计算（风险评点，重跑无痕）；批准之后审计写（幂等键=会话号:轮次:SQL 指纹，重写不重复）+ 只读 SELECT（天然幂等，数据漂移以恢复后为准）。备选"审计写在 interrupt 之前（挂起即记待审批）"：多一条状态且挂起未批不产生合规记录义务，反增重跑痕迹，不选。同样思路下风险判据放 run_query 内重算而非进 State：State 七字段是卡面公共契约，节点间私有旗标用同一纯函数重算更省——判据单一事实源（同一函数），零新增公共面。换边条件：合规要求审批时效 SLA（挂起超时告警）时，"待审批"记录才值得写——届时幂等键同样适用。

## 锚点对照精要

**docs/tech-stack/langgraph.md · interrupt / Command(resume) / checkpointer / 节点幂等**（卡 `m7` 锚点 K-E）
文：`interrupt(payload)` 暂停、`Command(resume=value)` 恢复、恢复值即 interrupt() 的返回值，必须配合 checkpointer——无 checkpointer 则无法 interrupt/恢复；checkpointer 在 super-step 边界存线程快照（InMemorySaver 重启即失、生产建议 PostgresSaver）；节点恢复时从头重跑整个节点函数，副作用必须设计为幂等。落点：主干三逐条落形——审批位即官方 SQL 教程"SQL 执行前人工审核"的同构位；审计幂等键是"副作用必须幂等"在审批记录上的具体兑现；MemorySaver/PostgresSaver 换边收在 compile 参数（金仓适配无公开文档，自研改造点沿用设计稿 14 记录）。

**docs/tech-stack/langgraph.md · 确定性控制 vs 纯 prompt 约束**（卡 `m7` 锚点 K-A/K-E）
文：官方教程指出预置 agent 靠 system prompt 约束行为（"必须先 list tables、执行前必须 check"），LangGraph 把每步拆成专用节点、强制工具调用，控制度更高；官方 SQL 教程设独立的 check_query 校验节点。落点：check_sql 是 check_query 的同构位——校验是图上的专用节点不是提示词条款；捣乱输入 A 是"提示词被问题文本顶掉"的实录，LangGraph 官方教程这条论据是"代码即规则"的框架侧出处。

**原书 §1 · 护栏与安全性**（卡 `m7` 锚点 K-A）
书：三层护栏按**被绕过的难度**排——上下文层（模型能看到什么）、执行层（模型能做什么，动作生效前验证）、数据层（世界最终能被改成什么样），越靠下越不依赖模型自己的判断；执行层高风险操作需额外审查或人工确认，且复核必须由**上下文之外**的机制完成，否则会与被注入的 Agent 一起沦陷；护栏还有"误拒绝"失败模式；人工干预两触发=超过失败阈值、高风险/不可逆操作。落点：提示词纪律（上下文层）→AST 闸+工具末闸（执行层）→只读账号（数据层）三层各防一条绕过路径；interrupt 把批准交到图外的人手里是"上下文之外的复核"的极致形态；外表走审批而非硬拦处理的是误拒绝成本；attempt_breaker（设计稿 14）与 human_approval（本节）恰是书本的两条人工干预触发。

**原书 §5 · Harness 设计原则 · 约束优先于指导与过程性错误**（卡 `m7` 锚点：原书故障与恢复节所在章）
书：能用代码强制的规则就不要用文档建议——前者是"做不了"，后者只是"建议别做"；约束还防**过程性错误**：修复数据库故障时直接把库删了重建，"修复"生效但数据没了，因此生产级 Harness 要对 `rm -rf`、**删除生产数据**这类危险动作设置专门的检查与审批。落点：本节的 guard（专门检查）+ human_approval（专门审批）是书上这句话的点对点落形——删除生产数据在书里就被点名为需要审批的危险动作；提示词里的 SELECT 纪律保留，但只是"建议别做"层。

**原书 §5 · 语义解析与 Artifact 执行纪律**（卡 `m7` 锚点 K-A/K-E）
书：关键字黑名单被组合爆炸绕过（`$(echo rm) -rf /`），安全机制要"基于理解而非匹配"，在语义层理解命令真实效果；Artifact 模式的执行纪律=只读数据库账号、解析 SQL 只允许批准的 SELECT、拒绝 DDL/DML/多语句、服务端参数化绑定、限制查询时间/返回行数/可访问表。落点：设计稿 12 工具侧 `startswith("SELECT")` 是关键字级末闸，本节 check_sql 升级为语义级（AST 根类型+全树扫描+条数判）；Artifact 清单逐项落点见主干四对照表——"服务端参数化绑定"一项是登记在案的缺口（m8 契约整句执行，扩卡改卡）。

## 越界自查（源：modules.md 边界规则表）

- **边界规则第 2 行（本节主语行）**："`m6` 与 `m7` 互相 import"——本设计稿零 m6 出现；表白名单消费的是选表节点经 m14 所得的 `state["tables"]`，零检索器引用。
- **边界规则第 1 行**：本节零模型调用——check_sql 纯计算、run_query 无网关调用、拒绝/终止话术是固定文本；零直连模型端点。
- **m8 为使用公开接口**：`Executor.call(tool_call, user)` + `query_production_db` 注册名（构造 tool_call 数据形状），零工具实现内部 import、零执行器/工具契约修改——工具侧 SELECT 末闸与 row_limit 收口是设计稿 12 既有防线，本节只使用不改动。
- **m3 为使用公开面**：`Repository.save_audit(call_record)` 审计写入。**备案项**：卡面注释语义为"网关用量审计（m2 调）"，本节以 call_record 形状复用同面写审批审计记录——语义扩展不新增签名，在卡面补一行注释备案（不属私改接口，属语义登记）。
- **签名纪律**：check_sql / run_query 签名逐字对齐设计稿 00 登记表 m7（`-> dict` 宽松形状下 `dict | Command` 是官方子形状，设计稿 14 同例）；新增件全部模块私有——`_DEFAULT_ROW_LIMIT`/`_ROW_LIMIT_CEILING`/`_只读根类型`/`_禁行节点`/`风险评点`/`剥围栏`（nodes/guard.py 内）、错误码 `readonly_violation`（m7 内部形状，对齐设计稿 14 的 error 结构 {error_code, message, hint}）；State 七字段零增减；未发明卡面之外的新公开接口。
- **调用方零接线**：审批事件帧桥接、审批 UI、Command(resume) 的运行时驱动、user/会话号经 config 进图（设计稿 19）、审批超时升级策略——一律占位；未替后续设计稿写任何接线代码。
- **零代码红线**：全文代码块均标注"伪代码"；无 tests/、无 CI 内容。
- **架构大图同步**：diagrams/petro-agent.html 按设计范围"图节点范围"只在 C5 容器内加 `sql_readonly_gate`（🛡️ 只读安全闸）与 `human_approval`（🛡️ 人工审批）两节点、按设计范围边清单换真（设计稿 14"生成→校验"直通边替换为 生成→只读闸→审批→校验 主链，新增拦截回灌虚线与批准后执行跨容器虚线→工具体系容器）；防护清单表加两行、节点明细表加两行、骨架进度计数 14→15；`<script>` 零改动；图上无文件名/函数名/端口/路由。
