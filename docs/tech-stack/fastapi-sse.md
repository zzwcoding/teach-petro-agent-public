# FastAPI + asyncio/ASGI + SSE 流式输出

> 覆盖范围：FastAPI 异步路由、依赖注入、StreamingResponse 与 SSE、后台任务；asyncio 事件循环与 ASGI 原理（简要）。
> 适用场景：国产化内网环境；用于 Petro-Agent 三 Agent（问数/问答/问智）的流式回答推送与异步高并发底座。

## 使用场景

FastAPI 是基于 Starlette（ASGI 框架）+ Pydantic 的 Python Web 框架，生产上解决的核心问题是：**用类型注解声明接口，自动生成 OpenAPI 文档与请求校验，同时在单进程内用 asyncio 事件循环并发承载大量 I/O 密集型请求**（官方原话："In any of the cases above, FastAPI will still work asynchronously and be extremely fast"）。来源：https://fastapi.tiangolo.com/async/

在 Petro-Agent 这类 LLM 平台的典型场景：

- **AI 流式回答**：SSE 是"从服务器经 HTTP 向客户端流式推数据"的标准，官方明确列出常见用途："AI chat streaming, live notifications, logs and observability"。来源：https://fastapi.tiangolo.com/tutorial/server-sent-events/
- **异步路由承接网关流量**：LiteLLM 网关、三 Agent 的编排调用都是 I/O 密集型（等模型/等数据库），async def 路由 + await 让单进程并发数千连接。
- **后台任务**：响应返回后异步收尾（写审计日志、发通知），避免阻塞响应。来源：https://fastapi.tiangolo.com/tutorial/background-tasks/
- **依赖注入做横切面**：认证、限流、数据库连接、租户上下文都挂在 Depends 树上，一次声明多处复用。来源：https://fastapi.tiangolo.com/tutorial/dependencies/

与同类选型差异（一句话版）：Flask/Django 是同步 WSGI 生态，做流式与长连接要借 gevent/Channels 补课；FastAPI 原生 ASGI + 类型驱动 + 自带 OpenAPI，天然适配 LLM 流式接口（SSE/WebSocket）。

## 核心能力面

以下 API 形状均以官方文档为准，是后续伪代码的依据。

**异步路由（async def path operation）**
- 规则：第三方库支持 await 就用 `async def`；不支持 await 的阻塞库（多数传统数据库驱动）用普通 `def`，FastAPI 会在线程池中跑，两种可混用。来源：https://fastapi.tiangolo.com/async/
- 原理：异步代码本质是"I/O bound 时让出事件循环去做别的事"（concurrency，非 parallelism）。

**依赖注入（Depends）**
- `from fastapi import Depends`；推荐 `Annotated` 写法：`commons: Annotated[dict, Depends(common_parameters)]`（Annotated 支持自 0.95.0 起）。来源：https://fastapi.tiangolo.com/tutorial/dependencies/
- 依赖可嵌套（sub-dependencies），依赖里也可用 `async def` 或 `def`；所有依赖声明的参数/校验自动并入 OpenAPI。
- 类型别名复用：`CommonsDep = Annotated[dict, Depends(common_parameters)]`。

**响应与流式**
- `fastapi.responses`（即 Starlette 响应）：`Response(content, status_code, headers, media_type)`、`JSONResponse`、`HTMLResponse`、`PlainTextResponse`、`RedirectResponse`、`FileResponse(path, headers, media_type, filename)`。来源：https://fastapi.tiangolo.com/advanced/custom-response/
- `StreamingResponse`：接收 async generator 或普通 generator（含 yield 的函数），流式输出 body；**坑点：生成器内必须有 `await`（哪怕 `await anyio.sleep(0)`），否则客户端断开时无法取消，流可能继续跑**。来源：https://fastapi.tiangolo.com/advanced/custom-response/
- `response_class` 装饰器参数：声明响应类即把 media type 写进 OpenAPI；直接 return Response 则不做自动序列化、不进 OpenAPI。
- `default_response_class`：FastAPI()/APIRouter() 级默认响应类。

**SSE（FastAPI 0.135.0 原生支持，重大更新）**
- `from fastapi.sse import EventSourceResponse, ServerSentEvent`（**新增于 0.135.0**，替代过去手工 StreamingResponse + `data:` 拼字符串或 sse-starlette 的做法）。来源：https://fastapi.tiangolo.com/tutorial/server-sent-events/
- 用法：路由函数里直接 `yield`，配 `response_class=EventSourceResponse`；yield 的 Pydantic 模型自动 JSON 编码进 `data:` 字段，声明返回类型 `AsyncIterable[Item]` 可让 Pydantic 做校验/文档/序列化（Rust 侧序列化，性能更高）；普通 `def` + `Iterable[T]` 也支持（FastAPI 保证不阻塞事件循环）。
- `ServerSentEvent(data=..., event=..., id=..., retry=..., comment=...)`：控制 SSE 各字段；`data` 永远 JSON 编码，`raw_data` 发原始文本（日志行、`[DONE]` 哨兵值），两者互斥。
- 断线续传：读 `Last-Event-ID` 请求头（`Annotated[int | None, Header()] = None`），从上次位置重放。
- POST 也支持 SSE（MCP 等协议流式场景）。
- 开箱即用的最佳实践：15 秒 keep-alive ping comment 防代理断连、`Cache-Control: no-cache`、`X-Accel-Buffering: no`（防 Nginx 缓冲）。来源：https://fastapi.tiangolo.com/tutorial/server-sent-events/

**后台任务**
- `from fastapi import BackgroundTasks`；路径操作函数里声明参数 `background_tasks: BackgroundTasks`，调用 `.add_task(func, *args, **kwargs)`，任务在响应返回后执行；任务函数可 `async def` 或 `def`（**注意：这是 starlette.background.BackgroundTasks，别用单数的 BackgroundTask**）。来源：https://fastapi.tiangolo.com/tutorial/background-tasks/
- 与 DI 集成：依赖和子依赖里声明的 BackgroundTasks 会被合并到同一个对象，响应后统一执行。
- 官方告诫：重度后台计算应上 Celery + RabbitMQ/Redis 这类外部队列，BackgroundTasks 只适合同进程小任务。

**ASGI / asyncio 原理（简要）**
- FastAPI 跑在 ASGI 服务器（生产用 uvicorn）上；ASGI 是异步服务器网关接口，应用是可调用对象，事件循环驱动协程，单进程内并发处理大量挂起 I/O 的连接。FastAPI 本身基于 Starlette 实现 ASGI。（框架结构见 https://fastapi.tiangolo.com/advanced/custom-response/ 中"most of the available responses come directly from Starlette"；asyncio 并发模型见 https://fastapi.tiangolo.com/async/）

## 典型用例模式

**模式 1：LLM token 流式输出（SSE，三 Agent 问答统一出口）**

```python
from collections.abc import AsyncIterable
from fastapi import FastAPI
from fastapi.sse import EventSourceResponse, ServerSentEvent
from pydantic import BaseModel

app = FastAPI()

class ChatPrompt(BaseModel):
    text: str

@app.post("/chat/stream", response_class=EventSourceResponse)
async def stream_chat(prompt: ChatPrompt) -> AsyncIterable[ServerSentEvent]:
    # 伪代码：逐 token 从 LiteLLM 网关取流
    async for token in agent_llm.stream(prompt.text):
        yield ServerSentEvent(data=token, event="token")
    yield ServerSentEvent(raw_data="[DONE]", event="done")
```

最小调用序列：客户端 POST `/chat/stream` → 路由校验 ChatPrompt → 进入 async 生成器 → 每个 `yield` 编码为一个 SSE event 帧 → 客户端 EventSource/fetch 流式读取 → 结束发 `[DONE]`。来源：https://fastapi.tiangolo.com/tutorial/server-sent-events/

**模式 2：异步路由 + 依赖注入 + 后台任务（问数接口：先返回结果，审计日志后台落盘）**

```python
from typing import Annotated
from fastapi import BackgroundTasks, Depends, FastAPI

app = FastAPI()

def write_audit_log(query: str): ...  # 伪代码：写审计日志

async def get_current_user(token: Annotated[str, Depends(oauth2_scheme)]): ...

@app.post("/query")
async def query_data(
    background_tasks: BackgroundTasks,
    user: Annotated[User, Depends(get_current_user)],
):
    result = await agent.run(...)          # await I/O 密集型调用
    background_tasks.add_task(write_audit_log, str(result.query))
    return result
```

最小调用序列：请求到达 → DI 树解析（认证 → 用户 → 参数校验）→ async 路由 await Agent → return 触发序列化 + OpenAPI 文档 → BackgroundTasks 在响应发出后执行审计。

**模式 3：StreamingResponse 原始字节流（导出大报表/文件流）**

```python
from fastapi.responses import StreamingResponse

async def data_generator():
    async for chunk in db.stream_rows():   # 生成器内必须有 await 才能被正确取消
        yield chunk
    # 或无限流时循环内插 await anyio.sleep(0)

@app.get("/report")
async def report():
    return StreamingResponse(data_generator(), media_type="text/csv")
```

来源：https://fastapi.tiangolo.com/advanced/custom-response/

## 选型与版本

- **FastAPI ≥ 0.135.0**：官方 SSE 教程标注 "Added in FastAPI 0.135.0"，要原生 `fastapi.sse.EventSourceResponse/ServerSentEvent` 必须 ≥0.135.0；`Annotated` 写法要求 ≥0.95.0（官方推荐 ≥0.95.1）。来源：https://fastapi.tiangolo.com/tutorial/server-sent-events/ 、https://fastapi.tiangolo.com/tutorial/dependencies/
- 配套：Pydantic v2（SSE 序列化走 Pydantic）、uvicorn 作 ASGI server（生产底座）、anyio（StreamingResponse 示例中用于让出事件循环）。
- 国产化部署注意：事件循环与 SSE 均为纯 Python 标准库/框架层能力，无原生扩展依赖，CPU 架构（x86/ARM/鲲鹏/飞腾）无特殊门槛；SSE 走标准 HTTP，过 Nginx 需关注 `X-Accel-Buffering: no`（FastAPI 已自动加该头）。
- 未找到公开文档：FastAPI 官方未给出各版本间 StreamingResponse 性能基准数据；sse-starlette 与原生 `fastapi.sse` 的迁移对照表未见官方文档（原生支持为 2026 年新增，社区迁移资料尚少）。

## 官方文档锚点

- 异步与并发模型（async def 决策树）：https://fastapi.tiangolo.com/async/
- SSE 教程（EventSourceResponse / ServerSentEvent / Last-Event-ID / POST SSE）：https://fastapi.tiangolo.com/tutorial/server-sent-events/
- Custom Response（StreamingResponse、FileResponse、response_class、取消坑点）：https://fastapi.tiangolo.com/advanced/custom-response/
- 依赖注入（Depends、Annotated、sub-dependencies）：https://fastapi.tiangolo.com/tutorial/dependencies/
- 后台任务（BackgroundTasks、DI 集成、Celery 告诫）：https://fastapi.tiangolo.com/tutorial/background-tasks/
- Release notes（SSE 文档新增记录）：https://fastapi.tiangolo.com/release-notes/
