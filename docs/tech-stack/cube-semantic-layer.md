# Cube 语义层（Headless BI × Data Agent）

> 技术栈调研 · slug: cube-semantic-layer · 关联: [minio-iceberg.md](minio-iceberg.md)（湖仓底座——Cube 语义层通常架在 Trino/StarRocks 等查询引擎之上，引擎之下正是 MinIO+Iceberg）
> 适用场景：国产化内网环境 · 假想业务：Petro-Agent 油田智能平台
> 调研日期：2026-09-23，论断均以官方文档/源码为准，逐条注源。

## 使用场景

### 为什么 DataAgent 需要语义层（全文重点）

- **text-to-SQL 直写明细 SQL 的根本痛点是口径漂移**：同名指标各写各的（"日产油量"含不含合采井、时间窗对不齐）、join 路径随手选、粒度不一致。Cube 的解法是**把 Agent 从"写 SQL"降级为"选口径"**：Agent 生成对语义层的结构化查询（`measures/dimensions/timeDimensions/filters` 的 JSON），SQL 由数据模型确定性编译生成——"描述性上下文帮 Agent 选，可执行上下文让选出的答案正确且被授权"（[Cube 官方博客：The Context Layer Needs a Semantic Layer, 2026-07-10](https://cube.dev/blog/the-context-layer-needs-a-semantic-layer)）。
- **数据模型 = 机器可读的口径字典**：cube/measure/dimension 上除 `description`（人读+Agent 读）外还有 **`meta.ai_context`**（"只对 AI agent 可见、不进 UI"，单条 2000 字符封顶）——把"优先用哪个指标、别名词、时间字段选哪个、数据质量坑"直接写在模型里供 LLM 消费（[AI Context 文档](https://docs.cube.dev/docs/data-modeling/ai-context.md)）。与 Iceberg 的分工：**Iceberg 在存储层管"表结构是真的"，Cube 在语义层管"业务口径是对的"**——互补不竞争。
- **SQL API 让 Agent 把 Cube 当 Postgres 连**：Cube 走 Postgres 兼容协议，"凡是能连 PostgreSQL 的应用就能连 Cube"，`MEASURE()` 扩展让 `SELECT MEASURE(orders.count)` 这种带口径的 SQL 也能跑——BI/Agent 生态零改造接入（[SQL API 文档](https://docs.cube.dev/reference/core-data-apis/sql-api/index.md)）。
- **预聚合 + 两级缓存兜住探索性查询成本**：Agent 一轮问数可能打十几发聚合查询，命中预聚合时"不碰源库"，内存缓存默认开启、预聚合按需显式配置（[Pre-aggregations 文档](https://docs.cube.dev/docs/pre-aggregations/index.md)）。
- **securityContext 给 Agent 查询划权限边界**：JWT 声明进入 securityContext，`query_rewrite` 在编译期把行级过滤注入生成的 SQL，`context_to_app_id` 做多租户模型隔离——Agent 再自由，也只在被授权的行/列内回答（[Access Control 文档](https://docs.cube.dev/docs/data-modeling/access-control/context.md)）。
- **官方 MCP/Agent 生态已落地（但分层收费）**：官方 MCP server 是 **Cube Cloud 托管端点**（Premium/Enterprise 计划，`https://cubecloud.dev/mcp`，OAuth+PKCE，约 30 个工具含 `searchDataModel`/`runQuery`/模型编辑/预聚合管理）；开源侧官方给了 **cube-agent-skills 仓库**（Apache-2.0，Claude Code/Codex/Cursor 通用技能集）（[MCP 文档](https://docs.cube.dev/docs/integrations/mcp-server.md)、[cube-agent-skills](https://github.com/cube-js/cube-agent-skills)）。

### Cube 解决什么问题：语义层 / Headless BI

- **定位**：Cube Core 是 "open-source semantic layer for AI, BI and embedded analytics"，"headless：不自带 UI"——"指标、维度、join、访问规则在代码里定义一次，经 SQL/REST/GraphQL API 暴露"（[GitHub README](https://github.com/cube-js/cube)）；产品叙事已升级为"构建在开源语义层之上的 agentic analytics 平台"（[docs.cube.dev](https://docs.cube.dev/)）。
- **指标定义一次，处处一致**：口径写在数据模型里而非散落各处 BI 报表，下游 BI/应用/Agent 全部消费同一份编译产物（[GitHub README](https://github.com/cube-js/cube)）。
- **湖仓栈里的位置**：Cube 直连任意可 SQL 查询的数据源，官方数据源清单含 **Trino/Presto/Hive/SparkSQL/Athena/DuckDB** 等——Trino 之下骑 MinIO+Iceberg，Cube 之上接 Agent，三层各管一段（[Data Sources 文档](https://docs.cube.dev/admin/connect-to-data/data-sources/index.md)、[Trino 集成公告](https://cube.dev/blog/cube-and-trino-integration)）。

## 核心能力面

### 数据模型形状（YAML 为主，JS 为历史）

来源：[Data Modeling Overview](https://docs.cube.dev/docs/data-modeling/overview.md)、[cube() 参考](https://docs.cube.dev/reference/data-modeling/cube)

- **cubes**：一个 cube 对应一张（逻辑）表，核心属性 `name` / `sql_table` / `measures`（`name`+`sql`+`type`，可带 `filters`/`format`，计算度量引用其他度量）/ `dimensions` / `joins` / `preAggregations` / `meta`。
- **views**："架在 cubes 之上构成整个数据模型的门面"，按 `join_path` + `includes` 控制终端用户能查什么——治理边界就在这里。
- **格式演变**：文档**YAML 展示在前（当前格式）**，JavaScript `cube(\`users\`, {...})` 为遗留等价形式；另有 `lkml2cube`（LookML 迁移）、`cube_dbt`（dbt 元数据复用）官方参考页。
- **注解**：`description`（cubes/views/measures/dimensions/segments 通用）与 `meta.ai_context`（仅 views/measures/dimensions，Agent 专用）。

### API 面

来源：[REST API Reference](https://docs.cube.dev/reference/core-data-apis/rest-api/reference.md)、[SQL API](https://docs.cube.dev/reference/core-data-apis/sql-api/index.md)、[GitHub README](https://github.com/cube-js/cube)

- **REST API**（base 路径 `/cubejs-api/v1`）：`POST/GET /load`（执行 JSON 查询，支持 `queryType=multi` 数据混合、`responseFormat=compact|columnar`）、`/meta`（返回 cubes/views 的名称、标题、measures、dimensions、hierarchies、segments 元数据）、`/sql`（返回为查询生成的原生 SQL，调试利器，支持 `disable_post_processing`）、`/cubesql`（SQL API 的 NDJSON 通道）、`/convert-query`（SQL API→REST 查询互转）、`/pre-aggregations/jobs`（触发/查询预聚合构建）、`/readyz`+`/livez`。响应含 `annotation`（查询到的成员定义回显）与 `usedPreAggregations`（命中了哪些预聚合）——这两个字段对 Agent 自检极有用；数值默认以字符串返回防精度丢失。
- **查询格式**：JSON 键 `measures` / `dimensions` / `filters` / `timeDimensions`（含 `granularity`）/ `timezone`——这就是 Agent 要生成的全部形状。
- **SQL API**：Postgres 兼容协议；**Core 默认关闭**，设 `CUBEJS_PG_SQL_PORT`（示例 15432）开启，Cloud 默认 5432/用户 `cube`；扩展 `MEASURE()` 函数、cube/view 映射为表、可查 `information_schema`；底层用 Apache DataFusion 做查询规划（egg 库做表达式重写）；pushdown 查询 SQL 覆盖面广但不走预聚合，普通/后处理查询反之。
- **GraphQL**：README 明列 SQL/REST/GraphQL 三 API。
- **AI 侧无独立"AI API"端点**：AI 上下文经数据模型注解（`meta.ai_context`）+ MCP server + Claude Connector + agent-skills 交付；Analytics Chat 等 AI 功能读的是同一份数据模型（[AI Context 文档](https://docs.cube.dev/docs/data-modeling/ai-context.md)）。

### MCP server（重点核实结论）

来源：[MCP Server 文档](https://docs.cube.dev/docs/integrations/mcp-server.md)

- **存在，官方出品，但属 Cube Cloud**："Cube hosts an MCP server endpoint"，端点 `https://cubecloud.dev/mcp`（全账户同一 URL，OAuth token 路由），**"available on Premium and Enterprise plans"**；OAuth Authorization Code + PKCE（`client_id=cube-mcp-client`，scope `mcp-agent-access`），Viewer 角色及以上可用，部署访问限制与角色权限取交集。
- **约 30 个工具**，四组：查询/发现（`searchDataModel`、`runQuery`——走 PostgreSQL 方言 SQL API）、仪表盘创作（workbooks/reports/folders 的增改发布）、**数据模型编辑与分支**（`readDataModelFile`/`writeDataModelFile`/`commitDataModelChanges`/`mergeToDefaultBranch`）、运维（`getPreAggregationStatus`/`buildPreAggregation`）；9 个破坏性工具强制确认。
- **开源版（Cube Core）不含此托管 MCP server**；开源侧的官方 Agent 配套是 [cube-agent-skills](https://github.com/cube-js/cube-agent-skills)（Apache-2.0，9 个技能，覆盖探索/查询、建模、运维部署）与 [Claude Connector](https://cube.dev/blog/cube-connector-and-skills-for-claude)（Connector 本身是托管形态，技能仓库开源）。

### 安全：securityContext / 行级安全 / 多租户

来源：[Access Control: Context](https://docs.cube.dev/docs/data-modeling/access-control/context.md)、[Row-level Security](https://docs.cube.dev/docs/data-modeling/access-control/row-level-security.md)

- securityContext = "关于当前用户的一组已验证声明"，来自 `Authorization: <JWT>` 头（JWKS 验签）；`query_rewrite` 配置项按声明给查询注入过滤（按 `user_id` 过行、强制日期范围、按角色过滤、按邮箱控列）；`context_to_app_id` 把声明映射为不同租户的编译模型；`extend_context` 可在鉴权前补算属性。SQL API 侧另有独立[安全页](https://docs.cube.dev/reference/core-data-apis/sql-api/security.md)。

### 缓存与预聚合（一句话级准确）

来源：[Pre-aggregations](https://docs.cube.dev/docs/pre-aggregations/index.md)、[Deployment](https://docs.cube.dev/cube-core/deployment.md)

- **两级缓存**：内存查询缓存默认开启；预聚合是第二级——按数据模型显式声明的聚合表，Cube 对每个进查询自动匹配并**重写**到命中的预聚合，配合独立存储 **Cube Store**（`cubejs/cubestore` 镜像）与独立 Refresh Worker（`CUBEJS_REFRESH_WORKER=true`）做构建/刷新，`refresh_key` 控新鲜度（默认 10s）。生产部署推荐 API 实例 + refresh worker + Cube Store 的 docker-compose 形态。

### 数据源支持面（重点核实结论）

来源：[Data Sources 索引页](https://docs.cube.dev/admin/connect-to-data/data-sources/index.md)

- **官方清单**：查询引擎 **Trino、Presto、Hive/SparkSQL、Amazon Athena、DuckDB/MotherDuck**；数仓 ClickHouse/Snowflake/BigQuery/Redshift/Databricks 等；交易库 **Postgres**/MySQL/MSSQL/Oracle/SQLite；另有 Druid/Pinot/MongoDB 及 DuckDB 读 Parquet/CSV/JSON。
- **结论：能直接骑在湖仓栈上**——官方清一色支持 Trino/Presto/Athena/Hive（2022-11-08 官方公告 Trino 集成，[博客](https://cube.dev/blog/cube-and-trino-integration)）；**但 Dremio 不在官方清单**（仅社区"第三方驱动"区有 Dremio 条目），**StarRocks 完全未列**——Petro-Agent 若用 StarRocks 做引擎，Cube 需经 Trino 中转或走 Postgres 兼容面。

### 部署形态

来源：[Cube Core Deployment](https://docs.cube.dev/cube-core/deployment.md)、[GitHub README](https://github.com/cube-js/cube)

- **开源自托管**：docker-compose 起多实例——API（`cubejs/cube` 镜像，端口 4000）+ Refresh Worker + Cube Store（`cubejs/cubestore`）；生产要求锁定具体版本 tag、NGINX 反代、JWT 鉴权（`CUBEJS_JWK_URL`）、关 dev mode（文档原话：dev mode 是 "authentication bypass"）。内网私有部署可行，适配国产化环境（镜像体系 + 任意 S3/JDBC 后端）。
- **Cube Cloud**：全托管，MCP server/Cloud 控制面 API（`/v1/data-sources` 等 Metadata API 标注 Cloud only）等增值能力在此。

## 典型用例模式

### 模式 1：Agent 工具"读口径"——/meta 拉全量语义字典喂 LLM

```python
# 伪代码形状（来源：Cube REST API Reference，/meta 端点）
import httpx

CUBE = "http://cube.petro.internal:4000/cubejs-api/v1"

def tool_read_semantics() -> dict:
    r = httpx.get(f"{CUBE}/meta", headers={"Authorization": JWT})
    meta = r.json()                                    # cubes/views: name, title, measures, dimensions, segments
    return {c["name"]: {
        "measures":   [(m["name"], m.get("description")) for m in c["measures"]],
        "dimensions": [(d["name"], d["type"])           for d in c["dimensions"]],
    } for c in meta["cubes"]}
# 这份 dict 就是问数 prompt 的口径上下文：description + meta.ai_context 已写进模型，
# LLM 拿到的是"带注释的指标清单"，而非靠翻库表猜口径
```

### 模式 2：Agent 生成语义层查询——JSON query → /load

```python
# 伪代码形状（来源：REST API Reference 查询格式示例）
def tool_query(measures, dimensions, time_dimension, date_range, filters=None):
    q = {"measures": measures,                    # 如 ["well_daily.total_oil"]  ← 口径在模型里定死
         "dimensions": dimensions,
         "timeDimensions": [{"dimension": time_dimension,
                             "dateRange": date_range, "granularity": "day"}],
         "filters": filters or []}
    r = httpx.post(f"{CUBE}/load", json={"query": q}, headers={"Authorization": JWT})
    body = r.json()
    # body["annotation"] 回显成员定义；body["usedPreAggregations"] 自检是否命中预聚合；
    # 大结果另可 GET /sql 先看生成的原生 SQL 做审计
    return body["data"]                            # [ {"well_daily.day": "2026-09-01", ...} ]，数值为字符串需转
```

### 模式 3：SQL API 形态——Agent 经 Postgres 协议把 Cube 当库连

```python
# 伪代码形状（来源：SQL API 文档；Core 需设 CUBEJS_PG_SQL_PORT 开启）
import psycopg                                   # 任意 Postgres 客户端/驱动均可

conn = psycopg.connect(host="cube.petro.internal", port=15432,
                       user="cube", password=JWT_OR_SECRET)
cur = conn.cursor()
cur.execute("""
    SELECT well_daily.operator, MEASURE(well_daily.total_oil)   -- MEASURE() 扩展 = 带口径的聚合
    FROM well_daily
    WHERE well_daily.prod_date >= '2026-01-01'
    GROUP BY 1
""")
rows = cur.fetchall()    # 命中预聚合则不落源库；securityContext 的行级过滤已注入查询
# 对 Agent 的意义：只要会写 SQL 就能问数，但"会写 SQL"不再等于"能自造口径"
```

## 选型差异（一句话版）

- **Cube vs dbt Semantic Layer/MetricFlow**：dbt SL "在既有模型上定义指标并自动处理 join"，指标定义生在 dbt 工程内、经 API 供下游（[dbt 文档](https://docs.getdbt.com/docs/use-dbt-semantic-layer/dbt-sl)）——dbt 强在"与转换工程同源"，Cube 强在"独立运行时 + 预聚合/缓存 + 多协议 API（REST/SQL/GraphQL）+ 行级安全"全带。
- **Cube vs LookML(Looker)**：LookML 是 Looker 的建模语言——"一组描述对象、数据库连接、UI 元素的文件，据此执行 SQL 查询"，measure 即 SQL 聚合函数字段（[Google Cloud 文档](https://cloud.google.com/looker/docs/lookml-terms-and-concepts)）——LookML 深绑 Looker 平台，Cube 是 headless、可被任意前端/Agent 消费（官方还提供 [lkml2cube](https://docs.cube.dev/reference/data-modeling/lkml2cube) 迁移）。
- **Cube vs AtScale**：AtScale 自称 "universal semantic layer platform"，主打不挪数据直连 Snowflake/Databricks 等云数仓、同时服务 BI 与 AI（[atscale.com](https://atscale.com/)）——AtScale 偏企业 OLAP 系语义层，Cube 开源核心 + 云增值。
- **语义层 vs 裸 text-to-SQL+自建指标字典**：裸 text-to-SQL 把口径一致性押在 prompt 工程与模型自觉上，语义层把口径变成**可执行、带鉴权的编译产物**——"Agent 猜 revenue 是毛是净"这类失败模式被结构性消除（[Cube 博客 2026-07-10](https://cube.dev/blog/the-context-layer-needs-a-semantic-layer)）。
- **开源自托管 vs Cube Cloud**：开源版全功能语义层 + REST/SQL/GraphQL API + 预聚合/docker-compose 部署，可进油田内网；**托管 MCP server、Metadata API 等 Agent 生态增值在 Cloud（Premium/Enterprise）**（[MCP 文档](https://docs.cube.dev/docs/integrations/mcp-server.md)）。

## 版本锚点

（查询日期：2026-09-23）

- **开源 Cube（cube-js/cube）最新 release：v1.7.43**（2026-09-21，修复 cubestore/query orchestrator、cubesql LRU 升级等；[GitHub Releases](https://github.com/cube-js/cube/releases)）。
- **Node 版本**：仓库 `.nvmrc` 钉在 **24.21.0**（[.nvmrc](https://github.com/cube-js/cube/blob/main/.nvmrc)）；官方部署文档未给最低版本号，仅提示 `NODE_OPTIONS=--max-old-space-size` 与镜像内已设 `NODE_ENV=production`（[Deployment](https://docs.cube.dev/cube-core/deployment.md)）；文档示例用锁定 tag（如 `cubejs/cube:v0.36.0`）仅为示例写法，非最新版。
- **MCP server 状态**：官方托管端点 `https://cubecloud.dev/mcp`，**Premium/Enterprise 计划限定**；开源侧配套为 cube-agent-skills（Apache-2.0）（[MCP 文档](https://docs.cube.dev/docs/integrations/mcp-server.md)、[仓库](https://github.com/cube-js/cube-agent-skills)）。
- **官方 AI 叙事锚点**：博客 "The Context Layer Needs a Semantic Layer"（2026-07-10）、"Introducing Cube's Claude Connector and Skills"（2026-08-20）、"Query Latency in the Age of AI Agents"（2026-07-15）（[Agentic Analytics 分类](https://cube.dev/blog/category/agentic-analytics)）。
- **证据不足/未找到一手源**：① 开源版**没有官方 MCP server**，社区虽有第三方 Cube MCP 实现（mcpservers.org 等）但本次未核实到可背书的一手仓库，引用时只能说"社区实现、自行评估"；② Dremio 仅社区第三方驱动、StarRocks 无官方支持（见数据源节）；③ Node 最低运行版本官方未明示；④ SQL API 的认证细节（JWT 当口令直连）仅 Cloud 文档详述，Core 侧形状以 `CUBEJS_PG_SQL_PORT` 配置页为准。

## 信源列表

- Cube 官方文档首页（产品定位）：https://docs.cube.dev/
- Cube Core GitHub README（headless 定位、SQL/REST/GraphQL 三 API）：https://github.com/cube-js/cube
- 数据建模总览（YAML 当前格式/cubes/views/measures/dimensions）：https://docs.cube.dev/docs/data-modeling/overview.md
- cube() 数据模型参考（全属性）：https://docs.cube.dev/reference/data-modeling/cube
- AI Context（description / meta.ai_context）：https://docs.cube.dev/docs/data-modeling/ai-context.md
- REST API Reference（/load、/meta、/sql、/cubesql、/pre-aggregations/jobs）：https://docs.cube.dev/reference/core-data-apis/rest-api/reference.md
- SQL API（Postgres 协议、MEASURE()、CUBEJS_PG_SQL_PORT、DataFusion）：https://docs.cube.dev/reference/core-data-apis/sql-api/index.md
- MCP Server 文档（Cloud 托管端点、OAuth PKCE、30 工具清单）：https://docs.cube.dev/docs/integrations/mcp-server.md
- cube-agent-skills 开源仓库（Apache-2.0）：https://github.com/cube-js/cube-agent-skills
- Claude Connector + Skills 公告（2026-08-20）：https://cube.dev/blog/cube-connector-and-skills-for-claude
- 博客 The Context Layer Needs a Semantic Layer（2026-07-10）：https://cube.dev/blog/the-context-layer-needs-a-semantic-layer
- Access Control: Context（securityContext/query_rewrite/context_to_app_id）：https://docs.cube.dev/docs/data-modeling/access-control/context.md
- Pre-aggregations（两级缓存、重写匹配、Cube Store、refresh_key）：https://docs.cube.dev/docs/pre-aggregations/index.md
- Cube Core Deployment（docker-compose 形态、镜像、生产要点）：https://docs.cube.dev/cube-core/deployment.md
- Data Sources 索引（Trino/Presto/Athena/Hive 有、Dremio 仅社区驱动、无 StarRocks）：https://docs.cube.dev/admin/connect-to-data/data-sources/index.md
- Cube×Trino 集成公告（2022-11-08）：https://cube.dev/blog/cube-and-trino-integration
- GitHub Releases（v1.7.43，2026-09-21）：https://github.com/cube-js/cube/releases
- dbt Semantic Layer：https://docs.getdbt.com/docs/use-dbt-semantic-layer/dbt-sl
- LookML terms and concepts（Google Cloud）：https://cloud.google.com/looker/docs/lookml-terms-and-concepts
- AtScale：https://atscale.com/
