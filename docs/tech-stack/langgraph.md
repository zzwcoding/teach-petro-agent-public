# LangGraph 编排状态机

> 技术栈调研 · slug: langgraph
> 假想业务锚点：Petro-Agent 问数 Agent（意图理解 → 选表 → 生成 SQL → 校验 → 执行/修正）
> 调研日期：2026-09-12，官方文档主源已从 `langchain-ai.github.io/langgraph` 迁移至 `docs.langchain.com/oss/python/langgraph`（旧站 quickstart/low_level 页面 404）

## 使用场景

LangGraph 把 Agent 工作流建模为**图**：共享 State（状态快照）+ Nodes（干活）+ Edges（决定下一步去哪），底层用类 Google Pregel 的消息传递、按 super-step 推进，天然支持循环、分支、并行——这是它区别于 LangChain 线性 Chain 的根本点（"nodes do the work, edges tell what to do next"）。[来源](https://docs.langchain.com/oss/python/langgraph/graph-api)

生产环境解决的问题：
- **有环 Agent 编排**：ReAct 式"生成 → 执行 → 失败 → 重试"循环无法用线性 Chain 表达，LangGraph 用边回绕（`run_query → generate_query`）实现自修正回路。[来源](https://docs.langchain.com/oss/python/langgraph/sql-agent)
- **状态持久化与断点续跑**：checkpointer 在 super-step 边界保存线程状态，支撑对话续接、故障恢复、time travel。[来源](https://docs.langchain.com/oss/python/langgraph/persistence)
- **人在回路（Human-in-the-loop）**：`interrupt()` 在执行高风险动作（如执行 SQL）前暂停图，人工审批/编辑/驳回后经 `Command(resume=...)` 恢复——官方 SQL Agent 教程明确用它做 SQL 执行前人工审核。[来源](https://docs.langchain.com/oss/python/langgraph/sql-agent)
- **确定性控制 vs 纯 prompt 约束**：官方教程指出，预置 agent 靠 system prompt 约束行为（"必须先 list tables、执行前必须 check"），而 LangGraph 可把每一步拆成专用节点，**强制**指定工具调用（`tool_choice="any"`），控制度更高。这正是 Petro-Agent 问数 Agent"意图理解/选表/生成/校验/修正"分阶段的直接依据。[来源](https://docs.langchain.com/oss/python/langgraph/sql-agent)

典型业务场景：智能问数（text-to-SQL + 校验回路）、多 Agent 协作/交接、带审批流的工具执行、长对话记忆、批处理 map-reduce（`Send`）。

同类选型差异（一两句）：LangChain LCEL Chain 是线性 DAG，表达不了循环 Agent；CrewAI/AutoGen 偏角色协作的高层封装，控制粒度粗；LangGraph 是低层图原语，节点/边/状态全部显式可控，官方称 prebuilt `create_agent` 本身也是用 LangGraph 原语实现的（所以深定制直接落回 LangGraph）。[来源](https://docs.langchain.com/oss/python/langgraph/sql-agent)

## 核心能力面

关键 API/类/函数清单（以官方文档为准，伪代码 API 形状依据）：

| 类别 | API | 说明与来源 |
|---|---|---|
| 图构建 | `StateGraph(State, input_schema=..., output_schema=...)` | 主图类，State 为 TypedDict / dataclass / Pydantic BaseModel ([graph-api](https://docs.langchain.com/oss/python/langgraph/graph-api)) |
| 状态 | `MessagesState`（内置 `messages` 键 + `add_messages` reducer）；自定义 reducer 用 `Annotated[list, add]` | reducer 决定节点返回值如何合并进状态，默认是覆盖 ([graph-api](https://docs.langchain.com/oss/python/langgraph/graph-api)) |
| 节点 | `builder.add_node(name, fn)`；`fn(state) -> dict`（部分更新） | 节点是同步/异步 Python 函数，可接 `config`/`runtime` ([graph-api](https://docs.langchain.com/oss/python/langgraph/graph-api)) |
| 边 | `builder.add_edge(A, B)`；`add_edge(START, node)`；`add_edge(node, END)` | 静态边；`START`/`END` 为虚拟节点 ([graph-api](https://docs.langchain.com/oss/python/langgraph/graph-api)) |
| 条件边 | `builder.add_conditional_edges(node, routing_fn, {返回值映射})` | routing_fn 返回下一节点名或 END，可多个目标并行 ([graph-api](https://docs.langchain.com/oss/python/langgraph/graph-api)) |
| 动态路由 | `Command(update=..., goto=...)`；`Command(resume=...)` 作为 invoke/stream 输入 | 节点内合并"状态更新 + 路由"；`resume` 是唯一可作为输入的 Command 模式 ([graph-api](https://docs.langchain.com/oss/python/langgraph/graph-api)) |
| 动态扇出 | `Send(node_name, state)` | map-reduce：条件边返回 Send 列表 ([graph-api](https://docs.langchain.com/oss/python/langgraph/graph-api)) |
| 预置组件 | `langgraph.prebuilt.ToolNode([tools])` | 把工具包成节点，官方 SQL 教程用它包 `sql_db_schema`/`sql_db_query` ([sql-agent](https://docs.langchain.com/oss/python/langgraph/sql-agent)) |
| 持久化 | `builder.compile(checkpointer=...)`；`InMemorySaver` / `SqliteSaver` / `PostgresSaver` / `AsyncPostgresSaver`；线程经 `{"configurable": {"thread_id": ...}}` 定位 | 无 checkpointer 则无法 interrupt/恢复；生产建议 PostgresSaver，MemorySaver 重启即失 ([persistence](https://docs.langchain.com/oss/python/langgraph/persistence)、[sql-agent](https://docs.langchain.com/oss/python/langgraph/sql-agent)) |
| 人在回路 | `from langgraph.types import interrupt`；`interrupt(payload)` 暂停 + `Command(resume=value)` 恢复，恢复值即 `interrupt()` 返回值 | 必须配合 checkpointer；官方教程支持 accept / edit args / response 三种人工处置 ([sql-agent](https://docs.langchain.com/oss/python/langgraph/sql-agent)、[graph-api](https://docs.langchain.com/oss/python/langgraph/graph-api)) |
| 运行时 | `recursion_limit`（config 顶层键，1.0.6 起默认 1000，超限抛 `GraphRecursionError`）；`config["metadata"]["langgraph_step"]`；`RemainingSteps` 托管值 | 防死循环 ([graph-api](https://docs.langchain.com/oss/python/langgraph/graph-api)) |
| 流式 | `graph.stream_events(input, config, version="v3")`；`stream_mode="values"/"updates"`；`output_keys` | 增量输出与中断事件 ([graph-api](https://docs.langchain.com/oss/python/langgraph/graph-api)、[sql-agent](https://docs.langchain.com/oss/python/langgraph/sql-agent)) |
| 可视化 | `graph.get_graph().draw_mermaid_png()` | 官方教程用其生成图 PNG ([sql-agent](https://docs.langchain.com/oss/python/langgraph/sql-agent)) |

幂等性注意：checkpointer 在 super-step 边界存点，节点中断恢复时会**从头重跑整个节点函数**，官方明确要求节点副作用（如插库）设计为幂等。[来源](https://docs.langchain.com/oss/python/langgraph/graph-api)

## 典型用例模式

最小调用序列（官方 SQL Agent 教程骨架，与本项目问数 Agent 对应）：

```python
# 状态：直接用内置 MessagesState（含 add_messages reducer）
builder = StateGraph(MessagesState)

# 节点划分（官方教程原样）：
builder.add_node(list_tables)        # 选表前置：列库表
builder.add_node(call_get_schema)    # 强制 tool_choice="any" 调 get_schema
builder.add_node(get_schema_node, "get_schema")   # ToolNode 执行
builder.add_node(generate_query)     # 生成 SQL（绑 run_query 工具）
builder.add_node(check_query)        # 校验 SQL（独立 prompt + 强制工具调用）
builder.add_node(run_query_node, "run_query")     # ToolNode 执行

builder.add_edge(START, "list_tables")
builder.add_edge("list_tables", "call_get_schema")
builder.add_edge("call_get_schema", "get_schema")
builder.add_edge("get_schema", "generate_query")
builder.add_conditional_edges("generate_query", should_continue)  # 有 tool_call→check_query，否则 END
builder.add_edge("check_query", "run_query")
builder.add_edge("run_query", "generate_query")   # 执行结果回灌，形成修正回路

checkpointer = InMemorySaver()                    # 生产换 PostgresSaver
agent = builder.compile(checkpointer=checkpointer)

config = {"configurable": {"thread_id": "t-1"}}
agent.invoke({"messages": [{"role": "user", "content": question}]}, config)
```

人工审核版：把 `sql_db_query` 包装进带 `interrupt()` 的工具（approve/edit/response 三分支），`run_query` 节点换用该版本，重编译即可——图结构不变。[来源](https://docs.langchain.com/oss/python/langgraph/sql-agent)

与 Petro-Agent 问数 Agent 的对应关系：问数 Agent 的"意图理解 → 选表 → 生成 → 校验 → 修正"五级划分与官方 SQL 教程节点一一同构——list_tables/call_get_schema ≈ 意图理解+选表，generate_query ≈ 生成，check_query ≈ 校验，run_query→generate_query 回边 ≈ 修正循环；人在回路对应国企场景的"执行前人工审批"。

## 选型与版本

- 版本基线：**langgraph 1.2.11**（2026-09-12 PyPI 最新），依赖 `langchain-core >=1.4.7,<2`、`langgraph-checkpoint >=4.1.0,<5`、`langgraph-prebuilt >=1.1.0,<1.2`、`pydantic >=2.7.4`。[来源](https://pypi.org/project/langgraph/)
- 状态基线：已发布 1.x（稳定版），默认 recursion limit 1000 自 1.0.6 起。
- 生产 checkpointer 建议 `PostgresSaver`（国产化部署可用openGauss/达梦需自行验证驱动兼容——官方仅提供 Postgres/SQLite 实现，`langgraph-checkpoint-postgres`；国产化数据库适配**未找到公开文档**，属自研改造点）。
- 与 FastAPI 集成：langgraph 图编译后是标准 Runnable，可在 FastAPI 路由内 `await graph.ainvoke(...)`；官方另有 LangGraph Server/Agent Server 托管方案（persistence 自动处理），但国企内网私有化部署倾向自嵌 FastAPI + PostgresSaver。[来源](https://docs.langchain.com/oss/python/langgraph/persistence)

## 官方文档锚点

- Graph API（State/Nodes/Edges/Reducers/Command/Send/recursion limit）：https://docs.langchain.com/oss/python/langgraph/graph-api
- 官方 SQL Agent 教程（节点划分 + 人在回路 interrupt）：https://docs.langchain.com/oss/python/langgraph/sql-agent
- 持久化（Checkpointer vs Store、Saver 选型）：https://docs.langchain.com/oss/python/langgraph/persistence
- PyPI 版本与依赖：https://pypi.org/project/langgraph/
- 旧站 langchain-ai.github.io/langgraph 的 quickstart / low_level 页面已 404，统一走新站（2026-09 实测）
- 未找到公开文档：国产化数据库（达梦/openGauss）的 checkpointer 官方适配
