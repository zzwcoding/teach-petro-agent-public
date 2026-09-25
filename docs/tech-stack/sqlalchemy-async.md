# SQLAlchemy 2.0 Async + asyncpg

- slug: sqlalchemy-async
- 官方源：docs.sqlalchemy.org（2.0 版本文档）
- 调研日期：2026-09-12

## 使用场景

SQLAlchemy asyncio 扩展（`sqlalchemy.ext.asyncio`，1.4 引入，2.0 成为生产推荐用法）让 Python asyncio 程序以全异步方式使用 SQLAlchemy 的 Core 与 ORM 全部能力，底层通过异步 DBAPI 方言驱动。asyncpg 是 SQLAlchemy 的第一个 Python asyncio 方言，用 `create_async_engine()` 创建。（[asyncio 扩展](https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html)、[PostgreSQL 方言/asyncpg](https://docs.sqlalchemy.org/en/20/dialects/postgresql.html#asyncpg)）

在 Petro-Agent 平台中的典型业务场景：

- **异步底座的数据层**：FastAPI 异步接口下并发处理问数/问答/问智 Agent 的数据库读写，不阻塞事件循环；高并发场景下协程比线程池更难打满连接池，池参数（pool_size/max_overflow）需要显式配置。
- **DDL 与迁移**：`AsyncEngine.begin()` + `AsyncConnection.run_sync()` 执行 `MetaData.create_all()` 等无 awaitable 钩子的同步 DDL 函数。
- **大规模结果集**：`AsyncConnection.stream()` / `AsyncSession.stream()` 返回 `AsyncResult` 做服务端游标流式读取。
- **国产化部署适配**：`postgresql+asyncpg://` 连接串可指向 openGauss、人大金仓 KingbaseES 等 PostgreSQL 兼容库（注：兼容性属部署实测问题，官方文档仅声明支持 PostgreSQL 9.6+，未找到国产库的公开兼容矩阵）。

依赖注意：asyncio 扩展需要 Python 3 且依赖 greenlet，官方建议 `pip install sqlalchemy[asyncio]` 确保 greenlet 随包装好（含无预编译 wheel 的平台）。（[asyncio 安装说明](https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html)）

## 核心能力面

以下 API/类/参数均以官方 2.0 文档为准：

**引擎与连接层**

- `sqlalchemy.ext.asyncio.create_async_engine(url, **kw)` — 创建 `AsyncEngine`；asyncpg 连接串 `postgresql+asyncpg://user:password@host:port/dbname[?key=value...]`；创建后可接 `pool_size`、`max_overflow`、`pool_pre_ping` 等引擎/池参数（池参数定义见 create_engine）。
- `AsyncEngine.connect()` — 返回 `AsyncConnection`（异步上下文管理器，进入时才从池取连接）。
- `AsyncEngine.begin()` — 返回带 `AsyncTransaction` 的 `AsyncConnection` 上下文。
- `AsyncEngine.dispose()` — 释放连接池，函数作用域内创建 engine 时须 `await engine.dispose()`。
- `AsyncConnection.execute()` — 返回缓冲 `Result`；`AsyncConnection.stream()` — 返回流式 `AsyncResult`。
- `AsyncConnection.run_sync(fn)` — 在异步连接上调用同步 DDL 等特殊函数（如 `Base.metadata.create_all`）。
- 属性：`sync_engine`（事件监听目标）、`pool`、`url`、`dialect`、`execution_options()`。（[AsyncEngine API](https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html#sqlalchemy.ext.asyncio.AsyncEngine)）

**会话层（ORM）**

- `sqlalchemy.ext.asyncio.async_sessionmaker(bind, *, class_=AsyncSession, autoflush=True, expire_on_commit=True, **kw)` — 2.0 新增的可配置 AsyncSession 工厂（带 PEP-484 类型支持）；方法：`__call__()`、`begin()`（上下文管理器：给新 session + 自动提交事务）、`configure()`。
- `AsyncSession.execute(statement, params, ...)` → `Result`；`scalars()`/`scalar()` → `ScalarResult`；`stream()`/`stream_scalars()` → `AsyncResult`。
- `AsyncSession.get(entity, ident, *, options, populate_existing, with_for_update, ...)` / `get_one()`（主键取值）。
- `AsyncSession.merge(instance, *, load=True)`、`flush()`、`refresh()`、`commit()`、`rollback()`、`close()`、`begin()`、`begin_nested()`（嵌套事务/SAVEPOINT）。
- `AsyncSession.run_sync(fn, *arg, **kw)` — 在 greenlet 内跑同步 Session 调用。
- `AsyncSessionTransaction` — 支持 `commit()`/`rollback()` 及异步上下文管理。
- `sqlalchemy.ext.asyncio.AsyncAttrs` — mixin，其 `awaitable_attrs`（2.0.13 新增）可把任意关系/属性当 awaitable 访问：`await a1.awaitable_attrs.bs`。
- 防止隐式 IO（asyncio 下禁止）：关系加载用 `selectinload()` 急加载、声明 `lazy="raise"`、或使用 2.0 Write Only 关系（集合只写不读，显式 SQL 查询）。（[AsyncSession API](https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html#sqlalchemy.ext.asyncio.AsyncSession)、[async_sessionmaker API](https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html#sqlalchemy.ext.asyncio.async_sessionmaker)、[Preventing Implicit IO](https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html#preventing-implicit-io-when-using-asyncsession)）

**2.0 新语法风格（与 1.x legacy 区分）**

- `DeclarativeBase` 基类 + `Mapped[T]` 类型注解 + `mapped_column()`（替代 `Column`）。
- 查询统一用 `select()` / `select(...).where(...)` 表达式（`session.execute(select(A))`），非 1.x 的 `Query` 风格。

**asyncpg 方言特有项**

- 多主机故障转移：`create_async_engine("postgresql+asyncpg://user:pass@/dbname?host=A:5432&host=B:5432")`（2.0.18 新增），所有 host 必须带完整端口号。
- Prepared statement 缓存：方言对所有语句用 `asyncpg.connection.prepare()`，缓存带来 10%+ 性能提升，缓存在每条 DBAPI 连接上。
- json/jsonb：asyncpg 默认不解码为字符串，SQLAlchemy 用内置 `json.loads` 做默认解码器，可用引擎参数 `json_deserializer` 替换。
- ENUM 类型性能坑：新建连接时会发昂贵查询取自定义类型元数据，官方缓解方案：`create_async_engine(url, connect_args={"server_settings": {"jit": "off"}})`。（[asyncpg 方言](https://docs.sqlalchemy.org/en/20/dialects/postgresql.html#asyncpg)）

## 典型用例模式

最小调用序列（生产形态：引擎 + sessionmaker + selectinload + expire_on_commit=False）：

```python
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, selectinload
from sqlalchemy import ForeignKey, select

engine = create_async_engine(
    "postgresql+asyncpg://user:pass@localhost:5432/petro",
    pool_size=10, max_overflow=20, pool_pre_ping=True,
)

Session = async_sessionmaker(engine, expire_on_commit=False)

async def get_well_with_logs(well_id: int):
    async with Session() as session:                     # 短会话作用域
        stmt = select(Well).options(selectinload(Well.logs)).where(Well.id == well_id)
        return (await session.scalars(stmt)).one()

async def create_well(name: str):
    async with Session.begin() as session:               # 自动 commit，异常自动 rollback
        session.add(Well(name=name))
    # 出上下文即提交并关闭
```

模式要点：

1. 引擎全局单例；session 按请求短生命周期（`async with Session()` 或 `Session.begin()`）。
2. 关系加载一律 `selectinload()` 急加载，杜绝 lazy load 隐式 IO。
3. `expire_on_commit=False` 使 commit 后属性仍可访问（官方示例默认配置）。
4. 应用关闭时 `await engine.dispose()`。
5. 流式大结果：`async for row in await session.stream(select(Well)):`。

## 选型与版本

- **SQLAlchemy 2.0.52**（2026-09 时 PyPI 上 2.0 维护线最新；2.1 已发布但 2.0 为稳定生产基线）。
- **asyncpg 0.31.0**（PyPI 最新稳定版）。安装用 `sqlalchemy[asyncio]>=2.0.52` 以带上 greenlet。
- 同类差异一句话：相对同步 psycopg2/psycopg，asyncpg 路径让连接不被阻塞、契合 FastAPI 事件循环；相对 Tortoise ORM/peewee-async 等原生异步 ORM，SQLAlchemy 2.0 提供 Core+ORM 双层 API、成熟的连接池与迁移生态（Alembic 原生支持 async，本调研未展开）。
- 版本锚定来源：[PyPI SQLAlchemy](https://pypi.org/pypi/SQLAlchemy/json)、[PyPI asyncpg](https://pypi.org/pypi/asyncpg/json)。

## 官方文档锚点

- asyncio 扩展总览/ORM Synopsis：https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html
- AsyncEngine API：https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html#sqlalchemy.ext.asyncio.AsyncEngine
- AsyncConnection API：https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html#sqlalchemy.ext.asyncio.AsyncConnection
- AsyncSession API：https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html#sqlalchemy.ext.asyncio.AsyncSession
- async_sessionmaker API：https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html#sqlalchemy.ext.asyncio.async_sessionmaker
- Preventing Implicit IO：https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html#preventing-implicit-io-when-using-asyncsession
- asyncpg 方言（连接串/多主机/prepared cache/json/ENUM-JIT）：https://docs.sqlalchemy.org/en/20/dialects/postgresql.html#asyncpg
- asyncpg 驱动官方站：https://magicstack.github.io/asyncpg/

未找到公开文档：国产数据库（openGauss/KingbaseES）与 asyncpg 方言的官方兼容矩阵——仅在社区实践中验证，官方文档只声明支持 PostgreSQL 9.6+。
