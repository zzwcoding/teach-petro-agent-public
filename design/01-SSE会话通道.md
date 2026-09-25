# 设计稿 01：SSE 会话通道与鉴权（问答链最小通路）

> **红线声明**：本设计稿零真实可运行代码。全部代码块均为**伪代码**（块首注释行标注"伪代码 — 文件:函数"），签名取自设计稿 00 登记表，主干体按 specs/modules.md「伪代码通用约定」书写（异步 async、IO 显式 await、数据形状用业务术语、异常去向三层）。
> **本节交付范围**：`m1` 最小通路装配（路由/鉴权/事件帧生成器/健康探针）+ `m13` EchoAgent 替身。替身声明按设计稿 00 stub 登记表 #1/#2：EchoAgent（设计稿 17 换 run_qa_loop 真身）、EchoGateway（设计稿 07 换 LiteLLM 真身）。
> **明确不讲的**（设计范围声明）：断线重连重放（设计稿 18）、tool_call 帧的真实来源（设计稿 17）、业务 Agent（设计稿 09 起）、令牌签发/刷新体系（无对应模块卡，设计演绎的固定令牌判断）。

## 实现清单

- [x] 带合法令牌的提问返回事件流，帧序 agent→token×N→done，每帧 {event, data} 形状（源：W-F1-1）✅ **走查第 0 步**（协议锁死表+线上帧样例）、**第 3~5 步**（dispatch→替身出帧→逐帧 yield）
- [x] 无效/过期令牌被鉴权依赖拦下（401 语义），不进入事件帧生成器，零模型调用（源：W-F1-2）✅ **走查第 2 步**（Depends 树先于端点体解析）+ **捣乱输入 A**
- [x] 生成中途异常：客户端收到 error 帧后流被取消，无悬挂协程——生成器每轮必须 await 的取消语义写入本设计稿（源：W-F1-3）✅ **走查第 6 步**（异常支线）+ **捣乱输入 B**（断开取消语义）+ 取舍记录 2
- [x] 健康探针返回 ok，供容器健康检查指向（源：卡 `m1` 公开接口；W-F11-4 的探针目标在设计稿 03 兑现）✅ **走查第 1 步**（healthz 端点本体；容器 HEALTHCHECK 编排归设计稿 03）
- [x] EchoAgent 支持正常帧序与异常注入两种模式，供 W-F1-3 通路走查（源：卡 `m13` Adapter）✅ **走查第 4 步**（替身两模式契约：哨兵前缀触发注入，设计稿 17 随替身段删除）
- [x] create_app 最小通路装配完成：路由注册+鉴权依赖+异常处理（工具注册表装载与连接池接线留待后续设计稿）（源：卡 `m1` 公开接口）✅ **走查第 1 步**（装配三项+留待清单）
- [x] 越界引用为零（源：modules.md 边界规则表）✅ **越界自查**（第 1 行"模型流量唯一出口是网关"体现在走查第 4 步）

---

## 走查：从输入到验收行为

> **主角**：老王带令牌发出第一问"N-2 井的完井方式是什么"；W-F1-1 走查主角为小李——问答 Agent 不限主要用户，两人走同一条路，问题原文以 W-F1-1 为准。
> **地图先行**（全链路一览，后续步骤引用不重画）：

```text
伪代码（时序示意，非代码）

老王(客户端/C1)      底座 FastAPI(C2)                Agent 运行时(C13)           AI 网关(C3)
    │ POST 带令牌提问     │                              │                        │
    ├───────────────────>│ ①verify_token：令牌闸          │                        │
    │<───401 拒绝─────────│   （无令牌到此为止，零模型调用）  │                        │
    │    通过→chat_endpoint                             │                        │
    │                    │ ②dispatch("qa") ─────────────>│ ③EchoAgent 替身         │
    │                    │                              │   Gateway.chat(stream) │
    │                    │                              ├───────────────────────>│
    │                    │                              │<── 假调用号+固定token流 ──┤
    │ ④event:agent 帧     │<────────── 事件帧序列 ─────────┤                        │
    │ ④event:token 帧 ×N  │   逐帧 yield（每轮 await）      │                        │
    │ ④event:done 帧      │                              │                        │
    │<───────────────────┤                              │                        │
```

### 第 0 步：先锁协议——事件帧五型（设计范围："协议在设计稿锁死"）

| event | data 形状 | 发出者 | 语义 | 本节是否出现 |
|---|---|---|---|---|
| `agent` | `{call_id, agent_type, thread_id}` | EchoAgent（替身）/设计稿 17 起 run_qa_loop | 首帧：哪条链路接单 + 本次调用号（对账锚） | 出现（帧首，W-F1-1） |
| `token` | `{delta, seq}` | 同上 | 生成增量文本，seq 递增保序 | 出现 ×N（W-F1-1） |
| `tool_call` | `{tool_call_id, tool_name, arguments}` | 设计稿 17 起主循环桥接（形状对齐 OpenAI tool_calls） | 模型请求调工具，前端可展示"正在调用" | 不出现（占形锁死） |
| `done` | `{finish_reason}` | 同上 | 终态帧：正常收尾，此后关流 | 出现（帧尾，W-F1-1） |
| `error` | `{code, message, recoverable}` | 桥接层捕获 / 端点兜底 | 异常终态帧：发出后立即关流 | 出现（注入支线，W-F1-3） |

设计范围"四型（agent/token/tool_call/done）"= 正常帧序四型；`error` 为 W-F1-3 的异常终态帧，同属本协议。每帧经 `ServerSentEvent` 编码成线上两行（`event:` + `data:`）加空行分隔，`data` 恒为 JSON（官方 SSE 形状）：

```text
伪代码（线上帧样例——协议锁死，非代码）

event: agent
data: {"call_id":"echo-call-000001","agent_type":"qa","thread_id":"th-laowang-001"}

event: token
data: {"delta":"N-2 井","seq":1}

event: token
data: {"delta":"采用套管射孔完井","seq":2}

event: done
data: {"finish_reason":"stop"}
```

### 第 1 步：装配——create_app 最小通路 + 健康探针

```text
伪代码 — app/main.py:create_app（m1 装配组合根）

def create_app() -> FastAPI:
    app = FastAPI()
    # 装配项一：路由注册（官方形状：SSE 端点用 response_class 声明响应类）
    app.add_api_route("/chat/{agent_type}", chat_endpoint, methods=["POST"],
                      response_class=EventSourceResponse)     # POST 也支持 SSE（官方）
    # 装配项二：鉴权依赖——verify_token 不在此显式注册，而是挂在 chat_endpoint 参数的
    #   Annotated[User, Depends(verify_token)] 上（依赖树接缝，见第 2 步）
    # 装配项三：异常处理——漏网异常统一处理器（业务异常已在桥接层转 error 帧，见第 6 步）
    app.add_exception_handler(...)                            # 兜底层，非业务语义
    # 留待后续设计稿：工具注册表装载（设计稿 12/13）、lifespan 建连接池（设计稿 04）、
    #   SM3 请求日志中间件（设计稿 03）、require_permission 写权限依赖接线（设计稿 12 起用）
    return app
```

```text
伪代码 — app/main.py:healthz（m1）

def healthz() -> "ok":
    return "ok"     # GET /healthz；Docker HEALTHCHECK 的探针目标。
                    # 本节交付端点本体；compose service_healthy 编排是 W-F11-4，设计稿 03 兑现
```

### 第 2 步：令牌进闸——verify_token（Depends 树上的接缝）

```text
伪代码 — app/api/auth.py:verify_token（m1，🛡️ 防未授权访问）

async def verify_token(credentials: Annotated[str, Header]) -> User:
    # credentials 形状：请求头 Authorization: Bearer <token>（Annotated 官方写法，官方模式 2 同构）
    if credentials 缺失 or 非 "Bearer <token>" 形状:
        raise 401("凭证缺失")              # 异常去向：Depends 树抛出 → 请求终结于 401 响应
    token 有效 = 校验签名与过期时间(credentials)   # 设计演绎：固定令牌判断，无签发体系（无模块卡）
    if not token 有效:
        raise 401("凭证无效或过期")          # W-F1-2：闸在生成器之前
    return User{user_id:"laowang", name:"老王", role:"read_only"}
    # role 本节只透传；按角色过滤/写权限是 require_permission 的职责，工具链设计稿 12 接线
```

机制要点：FastAPI 先解析参数里的依赖树、再执行端点函数体。401 从依赖里抛出时，`chat_endpoint` 函数体从未执行——事件帧生成器从未创建、`dispatch` 从未调用、模型调用为零。这就是 W-F1-2 "零模型调用"的机制来源（不是"调了但省着用"，是根本没走到）。

### 第 3 步：分派——dispatch 是 m1 认识的唯一出口（Seam）

```text
伪代码 — app/agents/runtime.py:dispatch（m13；无 IO，纯路由选择，故非 async）

def dispatch(agent_type, message, user) -> EventStream:
    match agent_type:
        case "qa":       return echo_agent_stream(message, user)  # 本节验收路径（设计稿 17 换 run_qa_loop 真身）
        case "text2sql": return echo_agent_stream(message, user)  # 问数链假帧（设计稿 14 主干/设计稿 19 换桥接）
        case "wenzhi":   return echo_agent_stream(message, user)  # 问智受理假帧（设计稿 19 换 enqueue_wenzhi）
        case _:          raise 链路未知异常                        # 异常去向：桥接层之外 → 端点兜底 error 帧
```

接缝纪律（卡 `m1` Seam 行）：`chat_endpoint` 只认 `dispatch(agent_type, ...) -> EventStream` 一个出口。底座不知道下游是状态机还是管道，运行时不关心帧怎么上线——"下游管道只需产出事件，SSE 帧形状由 m13 桥接，m1 不懂业务事件"。

### 第 4 步：替身出帧——EchoAgent 固定帧序 + EchoGateway 假调用号

```text
伪代码 — app/agents/runtime.py:echo_agent_stream（EchoAgent 替身，设计稿 17 删替身段换 run_qa_loop）

async def echo_agent_stream(message, user) -> 事件帧序列:
    # ── 替身两模式契约 ──────────────────────────────────────────────
    # 模式一（正常）：固定帧序 agent→token×N→done，token 内容取自 EchoGateway 固定回复
    # 模式二（异常注入）：message 以哨兵前缀开头（替身专用约定，设计稿 17 随替身段删除）
    #   → 第 2 段 token 后抛网关异常，模拟"生成中途网关抛异常"（W-F1-3 走查输入）
    注入网关异常 = message 以哨兵前缀开头
    thread_id = body 带了就用，否则替身生成占位 ID        # 会话落库设计稿 04 接线，本节只透传

    try:
        # ── 模型调用站：唯一出口是网关（边界规则第 1 行）——替身也不例外 ──
        reply = await Gateway.chat(
            messages=[{role:"system", content:"你是油田问答助手"},
                      {role:"user", content:message}],          # API 消息形状最小两条（见锚点 原书第二章）
            model_alias="petro-llm", stream=True)
            # 此刻 Gateway.chat 的真身是 EchoGateway（stub #2）：固定回复+假 usage+假调用号；
            # 假 token 流不是 EchoAgent 本地捏造，而是"经网关接缝拿流"这个形状的替身版
        yield 帧("agent", {call_id: reply.call_id,             # 假调用号来自 EchoGateway（设计稿 07 换真）
                           agent_type:"qa", thread_id: thread_id})
        段号 = 0
        async for delta in reply.token_stream:                 # EchoGateway 固定 token 序列
            段号 += 1
            if 注入网关异常 and 段号 == 2:
                raise 网关异常("生成中途失败")                   # 与真网关断流同型，桥接层捕获逻辑与真身一致
            await anyio.sleep(0)                               # 取消语义兜底：每轮必 await（官方坑点，见捣乱 B）
            yield 帧("token", {delta: delta, seq: 段号})
        yield 帧("done", {finish_reason:"stop"})               # 终态帧：此后流自然关闭
    except 网关异常:                                           # W-F1-3：桥接层捕获可预期业务异常
        yield 帧("error", {code:"gateway_error",
                           message:"生成中途失败，请重试", recoverable: true})
        return                                                 # 关流：不再有后续帧，协程自然终止、无悬挂
```

### 第 5 步：推流回客户端——chat_endpoint 逐帧 yield

```text
伪代码 — app/api/chat.py:chat_endpoint（m1，W-F1-1 主干）

# 请求体形状（chat_endpoint 卡面 body 参数定形）：
class ChatPrompt(BaseModel):
    message: str            # 业务真数据样子："N-2 井的完井方式是什么"
    thread_id: str | None   # 会话线 ID，本节只透传

async def chat_endpoint(
    agent_type: str,                                   # 路径参数："qa"
    body: ChatPrompt,
    user: Annotated[User, Depends(verify_token)],      # 依赖先于函数体：401 到不了这里
) -> AsyncIterable[ServerSentEvent]:                   # 官方形状：生成器 + response_class=EventSourceResponse
    frames = dispatch(agent_type, body.message, user)  # Seam：m1 只认 dispatch 一个出口
    try:
        async for frame in frames:
            await anyio.sleep(0)                       # 每轮让出事件循环——取消语义兜底（官方坑点）
            yield frame                                # 每帧即一个 SSE event：官方编码 event:/data: 两行
    except Exception:                                  # 兜底层：桥接层之外的漏网异常
        yield ServerSentEvent(event="error",
                              data={code:"internal_error", message:"服务内部错误", recoverable: false})
        return                                         # 关流：客户端永远收到结构化 error 帧，而非连接被裸断
```

观察到的验收行为（W-F1-1）：带令牌 POST 提问 → 响应是 EventSourceResponse 事件流 → curl 逐帧滚出 `event: agent` → `event: token` × N → `event: done`，每帧 `{event, data}`。防断连配套（15 秒 keep-alive ping、`Cache-Control: no-cache`、`X-Accel-Buffering: no`）是 `fastapi.sse` 开箱即用行为，不手写（官方行为）。

### 第 6 步：异常支线（W-F1-3）——桥接捕获→error 帧→关流

时序：EchoAgent 注入模式在第 2 段 token 后抛网关异常 → `echo_agent_stream` 的 `except` 捕获（桥接层，业务错误码只有 m13 知道）→ yield `event: error` 帧（data 含 code/message/recoverable）→ `return` 关流 → `chat_endpoint` 的 `async for` 自然结束 → 响应正常收尾。客户端看到：agent→token→token→**error**，然后流结束。两层分工：可预期业务异常在桥接层转 error 帧（保留业务错误码分类）；漏网异常在端点兜底转 `internal_error` 帧——保证客户端永远收到结构化帧。

## 捣乱输入

### 捣乱 A：无令牌/过期令牌——401 在生成器之前

同一 POST 请求，Authorization 头缺失（或令牌过期）：请求仍先经过路由匹配 → FastAPI 开始解析参数依赖树 → `verify_token` 判"凭证缺失/无效" → 抛 401 → **依赖解析失败，端点函数体不执行**。数据去向：请求终结于 401 响应，事件帧生成器未创建、`dispatch` 未调用、`Gateway.chat` 未调用——闸的位置决定成本，此闸拦在一切昂贵操作之前（W-F1-2 期望"零模型调用"由此成立）。拦完数据去哪：无残留——没有生成器、没有后台任务，请求对象随响应终结。

### 捣乱 B：客户端中途断开——生成器取消语义（"断开后何时真停"）

推演逐层走：

1. 客户端在 token 第 3 帧后断网 → TCP 连接关闭。
2. 服务端发现时机：ASGI 服务器（uvicorn）在下一次向该连接写响应体时发现写失败（SSE 每帧一次写，所以最多一个帧的间隔就能发现），或收到协议层 disconnect 事件 → **取消该请求的协程任务**。
3. 取消如何生效：以 CancelledError 注入协程，只能挂在"协程此刻正挂起的点"——即最近一次 `await`。若生成器正跑一段无 await 的纯计算，必须等这段跑完、到达下一个 await 才能被打断。
4. 这就是"每轮必 await（哪怕 `await anyio.sleep(0)`）"的铁律来源（官方坑点原话：生成器内必须有 await，否则客户端断开时无法取消，流可能继续跑）：它保证帧与帧之间恒存在可取消点。
5. 真停时刻 = 下一帧驱动点，最迟当前帧处理完即停。CancelledError 在生成器内冒泡 → `async for` 终止 → 生成器关闭 → `finally` 清理（本节无资源需归还；设计稿 04 接连接池后在生成器 `finally` 归还）。
6. 无悬挂协程的两个条件：每轮必 await（可取消点恒在）+ 无 fire-and-forget 任务（替身不 spawn 后台任务；问智异步是设计稿 19 经任务队列的受理，不属本节）。

与第 6 步异常支线的对照：error 支线是**生成器自己走完关流**（主动收尾）；捣乱 B 是**外部取消打断**（被动终止）。两条路径都依赖每轮 await 才能干净退出——这是 W-F1-3 "无悬挂协程"的完整语义。

## 关键判断的取舍记录

1. **SSE 单向流够用，不上 WebSocket**——本节交互形状是"POST 一次提问，服务器推回一串帧"，纯服务器→客户端单向；SSE 走标准 HTTP（fastapi.sse 官方支持 POST SSE），代理/Nginx 基建现成兼容（防缓冲头开箱即用）。WebSocket 的双向能力在此场景无消费者，且 F1 设计范围"不做什么"明确排除。换边条件：前端要中途打断生成、双向协作编辑类交互时再评估 WebSocket。
2. **流式生成器的取消语义是 FastAPI 第一坑**——备选是生成器里轮询 `is_disconnected` 主动检查，但那把取消责任摊到每个业务生成器，且检查间隔即泄漏窗口；依赖任务取消语义 + 每轮 await 兜底，取消责任收归 ASGI 层一处。LLM 场景此坑被放大：每帧都是模型算力真金白银，断开后续跑的流是纯烧钱。所以取消语义写入本节验收（W-F1-3）而非实现细节。
3. **done 帧用 data JSON，不用 raw_data "[DONE]" 哨兵**——官方示例用 `raw_data="[DONE]"` 发哨兵文本；本节选 `data={"finish_reason":"stop"}`，代价是多几个字节，收益是五型帧全部 `{event, data}` 同构，前端单一代码路径解析（设计范围验收"每帧 {event, data} 形状"即此决定）。raw_data 保留给未来日志行流式推送类需求；若日后要兼容 OpenAI 客户端的 `[DONE]` 惯例，加一型哨兵帧即可，协议可扩展。
4. **error 帧捕获分两层（桥接层 + 端点兜底），不在端点一层全捕**——依据 Seam 分工：m13 是"事件语义"接缝，业务异常的错误码分类（gateway_error / 未来工具错 / 权限拒）只有运行时知道，m1 不懂业务事件；端点只兜"漏网"的 internal_error。备选（chat_endpoint 单层捕获一切）会把业务错误码硬编码进底座，违反边界规则第 6 行（m1 不写业务逻辑）。代价是两层 try/except，换来异常语义按模块归属。

## 锚点对照精要

**docs/tech-stack/fastapi-sse.md · EventSourceResponse / ServerSentEvent**（卡 `m1` 锚点）
官方 0.135.0 起原生 SSE：路由函数直接 yield，配 `response_class=EventSourceResponse`，`ServerSentEvent(data/event/id/retry/comment)` 控制 SSE 各字段，data 恒 JSON 编码、raw_data 发原始文本、两者互斥；POST 也支持 SSE；keep-alive ping 与 no-cache、防 Nginx 缓冲头开箱即用。落点：chat_endpoint 按"生成器 + response_class + `AsyncIterable[ServerSentEvent]` 返回声明"官方形状写（走查第 5 步）；五型帧只占 event/data 两字段，id 字段留给设计稿 18 断线续传；防缓冲头不手写，继承开箱行为。

**docs/tech-stack/fastapi-sse.md · Depends / Annotated 依赖注入**（卡 `m1` 锚点）
官方推荐 Annotated 写法声明依赖，依赖可嵌套成树，认证等横切面一次声明多处复用；依赖先于端点函数体解析。落点：verify_token 以 `Annotated[User, Depends(verify_token)]` 挂进 chat_endpoint 参数——W-F1-2 的"401 在事件帧生成器之前、零模型调用"正是依赖树解析顺序的机制结果（走查第 2 步、捣乱 A）；require_permission 本节只登记不接线。

**docs/tech-stack/fastapi-sse.md · StreamingResponse 取消坑点**（卡 `m1` 锚点）
官方明确：流式生成器内必须有 await（哪怕 `await anyio.sleep(0)`），否则客户端断开时无法取消，流可能继续跑。落点：chat_endpoint 与 echo_agent_stream 两层生成器每轮各置一个 await 点，断开最迟在当前帧处理完即停（捣乱 B 的第 3~5 步推演）；本节把该坑升格为验收断言 W-F1-3。

**原书第二章 §Agent如何调用大模型 · 消息结构与无状态**（卡 `m1`/`m13` 锚点）
API 核心是 messages 列表：system/user/assistant/tool 四种角色消息加顶层 tools 字段；每次调用无状态，模型不记忆历史，Agent 框架必须每次把完整消息列表送回。落点：EchoAgent 经 Gateway.chat 发最小两条消息（system+user）就是该形状的最小通路版，设计稿 17 run_qa_loop 才长出 assistant/tool 完整轨迹；"无状态"的可对账落点是 call_id——每次调用独立记账（本节是 EchoGateway 假调用号，设计稿 07 换真）。

**原书第二章 同节 · 模型决策/框架执行与流式输出顺序**（卡 `m13` 锚点）
模型只发 tool_calls 调用请求，真正执行工具的是 Agent 框架；流式输出按固定顺序生成（思考→文本→工具调用请求），流式让用户实时看到过程。落点：事件帧协议就是这条输出流的逐段翻译——token 帧对应文本增量、tool_call 帧对应调用请求（本节占形，设计稿 17 由主循环桥接产出）、done 帧对应"模型判停"；桥接职责按卡 `m13` Seam：下游产事件、运行时定帧形，m1 不懂业务事件。

## 越界自查（源：modules.md 边界规则表）

- **第 1 行（模型流量唯一出口是网关）**：体现在走查第 4 步——EchoAgent 的假 token 也经 `Gateway.chat`（EchoGateway 替身）取流，替身链无一处直连模型端点；设计稿 17 真身 run_qa_loop 同样只认 m2 出口。
- **第 6 行（m1 不写业务逻辑）**：chat_endpoint 只做四件事——依赖树鉴权、调 dispatch、逐帧转发、漏网异常兜底 internal_error 帧；帧的业务语义（agent/token/done 分类与错误码）全部定义在 m13 桥接层，m1 不解帧。
- 其余各行（m6/m7 互不 import、m13 不 import m15、m10 不直写 m5/m3、scripts 只走公开接口等）：本节引用面仅 m1→m13（dispatch）与 m13→m2（Gateway.chat，EchoGateway 替身），未触及其他行。
- **零代码红线**：全文代码块均标注"伪代码"；函数签名取自设计稿 00 登记表，本节新增定形仅两处且设计范围授权——事件帧五型（"协议在设计稿锁死"）与 ChatPrompt 请求体（chat_endpoint 卡面 body 参数定形）。
