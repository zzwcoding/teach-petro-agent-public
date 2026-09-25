# DuckDB（嵌入式 OLAP × Data Agent）

> 技术栈调研 · slug: duckdb · 关联: [minio-iceberg.md](minio-iceberg.md)（湖仓底座——DuckDB 是该栈的进程内分析引擎/查询末端）
> 适用场景：国产化内网环境 · 假想业务：Petro-Agent 油田智能平台 · 调研日期：2026-09-23 · 论断以官方文档/源码为准，逐条注源。

## 使用场景

### DuckDB 是什么：跑在你进程里的 OLAP 数据库

- **进程内嵌入式分析型 RDBMS**："没有需要安装、升级和维护的 DBMS 服务器软件，DuckDB 不作为独立进程运行，而是完全嵌入宿主进程"——SQL 直接跑在 Python 进程里，列式 + 向量化执行面向分析型（OLAP）负载（[Why DuckDB](https://duckdb.org/why_duckdb/)）。
- **零依赖、易部署**：编译与运行均无外部依赖，发行版把整棵源码树编译成"一个头文件 + 一个实现文件"的 amalgamation；可从资源受限的边缘设备到 100+ 核大内存服务器，还能经 DuckDB-Wasm 跑进浏览器（[Why DuckDB](https://duckdb.org/why_duckdb/)）。
- **"文件即数据库"**：直接对 Parquet/CSV/JSON 文件、Pandas/Arrow 对象发起 SQL 查询，"有时甚至无需拷贝就能处理外部数据——Python 包可直接对 Pandas 数据跑查询而不导入不拷贝"（[Why DuckDB](https://duckdb.org/why_duckdb/)；[Parquet 文档](https://duckdb.org/docs/current/data/parquet/overview)）。

### 为什么 Data/Data Agent 需要它（全文重点）

- **① 进程内嵌入式 OLAP——Agent 自己的进程就是查询引擎**：问数 Agent 的 tool 函数里 `import duckdb` 即得完整 OLAP 引擎，无服务端、无运维、无 JDBC/网络往返；单二进制 + 无外部依赖的形状天然适合油田内网离线部署与国产化环境（[Why DuckDB](https://duckdb.org/why_duckdb/)）。
- **② 它是 minio-iceberg.md 模式 2 里 `scan().to_duckdb()` 的承接端**：PyIceberg 的 `to_duckdb(table_name, connection=None)` 源码就是"把 `to_arrow()` 的结果 `register` 进一个内存 DuckDB 连接并返回该连接"——PyIceberg→Arrow→DuckDB 这条链路的本地计算引擎就是 DuckDB，裁剪后的扫描结果在进程内零落盘地跑聚合（[iceberg-python 源码](https://github.com/apache/iceberg-python/blob/main/pyiceberg/table/__init__.py)）。
- **③ httpfs 扩展直接把 `s3://` 当数据源，含 MinIO**：官方明说 "The httpfs filesystem is tested with AWS S3, **Minio**, Google Cloud and lakeFS"；MinIO 走 path-style 时配 `ENDPOINT` + `URL_STYLE 'path'`（参数形状见下）；iceberg/delta 扩展则可扫湖表甚至挂 REST catalog（[S3 API Support](https://duckdb.org/docs/current/core_extensions/httpfs/s3api.html)）。
- **④ "Agent 沙箱分析"模式：LLM 生成 SQL 在本地快速试错**：问数 Agent 一轮对话要发十几次试错查询，DuckDB 在内存/单文件库里跑这些 SQL——不碰共享库、没有连接池排队、崩了就随进程回收；替换扫描（replacement scan）让 LLM 直接 `SELECT * FROM df变量名` 查 Python 内存里的 Pandas/Arrow 数据（[Python 数据摄入](https://duckdb.org/docs/current/clients/python/data_ingestion)）。
- **⑤ 与 Trino/StarRocks 的定位差（一句话）**：DuckDB 是进程内单机引擎（数据拉到本地算），Trino/StarRocks 是服务端分布式引擎（SQL 下推到集群算）——小数据交互式分析归 DuckDB，跨源大表归湖仓集群，二者共用同一套 Iceberg/MinIO 底座（[Why DuckDB](https://duckdb.org/why_duckdb/)、[Trino Overview](https://trino.io/docs/current/overview.html)）。

## 核心能力面

### Python API 形状

来源：[Python API](https://duckdb.org/docs/current/clients/python/overview)、[结果转换](https://duckdb.org/docs/current/clients/python/conversion)、[数据摄入](https://duckdb.org/docs/current/clients/python/data_ingestion)

- `duckdb.sql("SELECT 42")` —— 模块级入口，跑在全局共享的内存库上，返回惰性 `Relation`（取数时才执行）；**官方警告全局连接非线程安全**，多线程须各自 `duckdb.connect()`。
- `duckdb.connect()`（内存库）/ `duckdb.connect("file.db")`（持久化单文件库）/ `duckdb.connect(config={...})`（配置项字典）；支持 context manager 自动关闭。
- 结果转换（[conversion 页](https://duckdb.org/docs/current/clients/python/conversion)）：`df()` / `fetchdf()` / `fetch_df()`（Pandas DataFrame）、`fetchnumpy()`（NumPy 字典）、**`to_arrow_table()` / `to_arrow_reader(chunk_size)`（Arrow，新签名）**、`pl()`（Polars）；**`fetch_arrow_table()` 与 `fetch_record_batch()` 已标 deprecated**，官方要求换用 to_arrow_* 两个新名。
- `duckdb.register("视图名", df_or_arrow)` —— 把 DataFrame/Arrow 对象注册成虚拟视图；替换扫描则免注册：Python 变量名直接当表名查询（支持 pandas DataFrame、Arrow table/dataset/RecordBatchReader/scanner），可用 `SET python_enable_replacements=false` 关闭；同名对象优先级 register() > 原生表/视图 > 替换扫描（[data_ingestion 页](https://duckdb.org/docs/current/clients/python/data_ingestion)）。
- `con.execute("CREATE TABLE t AS SELECT * FROM df")` —— 把 DataFrame 物化进库；`con.install_extension("h3", repository="community")` 装社区扩展。

### 扩展体系：httpfs / iceberg / delta

- **httpfs 的 S3 形状（首选 secrets）**：`CREATE SECRET (TYPE S3, PROVIDER config, KEY_ID '...', SECRET '...', REGION '...')`，随后直接查 `s3://bucket/file.parquet`；参数表（[S3 API Support](https://duckdb.org/docs/current/core_extensions/httpfs/s3api.html)）：`ENDPOINT`（自定义端点）、`URL_STYLE`（`vhost` 别名 `virtual`，或 `path`；S3 默认 vhost，R2/GCS 默认 path）、`USE_SSL`、`VERIFY_SSL`、`SESSION_TOKEN`、`KMS_KEY_ID`、`SCOPE`、`REFRESH` 等。**MinIO/自建端点 = `ENDPOINT 'minio.petro.internal:9000'` + `URL_STYLE 'path'`**。
- **旧式 `SET s3_endpoint` 已是 legacy**：官方专页声明"这是把密钥存成设置的旧方法，有泄露风险，避免使用"，但仍记录了形状：`SET s3_region / s3_endpoint / s3_use_ssl / s3_url_style='path' / s3_access_key_id / s3_secret_access_key / s3_session_token`；还支持把参数写在 URI 查询串里逐请求生效（`'s3://bucket/f.parquet?s3_access_key_id=..&s3_secret_access_key=..'`）（[Legacy Authentication](https://duckdb.org/docs/current/core_extensions/httpfs/s3api_legacy_authentication.html)）。
- **iceberg 扩展（核心扩展，首次使用自动装）**：两条路——① 免 catalog 直读单表：`iceberg_scan('path/to/table', allow_moved_paths=true)`，**只读**；辅助函数 `iceberg_metadata` / `iceberg_snapshots`；② `ATTACH` 一个 **Iceberg REST catalog** 解锁**全量功能含写入**：`CREATE SECRET (TYPE ICEBERG, CLIENT_ID/CLIENT_SECRET, OAUTH2_SERVER_URI)` 或传 `TOKEN`，再 `ATTACH 'warehouse' AS icat (TYPE ICEBERG, SECRET ..., ENDPOINT '...')`；写入侧支持 CREATE TABLE（`PARTITIONED BY (day(ts), bucket(16,id))` 全套 Iceberg 分区变换）、INSERT、**UPDATE/DELETE（仅 merge-on-read 语义、写 position delete 文件）**、MERGE INTO upsert、schema 演化 ALTER TABLE、`COPY FROM DATABASE` 双向深拷贝；挂 catalog 后支持时间旅行 `AT (VERSION => SNAPSHOT_ID)` / `AT (TIMESTAMP => ...)`（[Iceberg Extension](https://duckdb.org/docs/current/core_extensions/iceberg/overview)、[Functions](https://duckdb.org/docs/current/core_extensions/iceberg/iceberg_functions)、[REST Catalogs](https://duckdb.org/docs/current/core_extensions/iceberg/catalogs.html)、[Writing](https://duckdb.org/docs/current/core_extensions/iceberg/writing.html)）；有 S3 Tables/Glue/R2/Polaris/Lakekeeper/BigLake 等分 catalog 接入指南。
- **delta 扩展**：`delta_scan('file:///...' | 's3://...')` 读 Delta 表（secrets 鉴权）；`ATTACH 's3://bucket/t' AS t (TYPE delta)` 后可 `INSERT INTO`（blind append）与时间旅行 `SELECT * FROM t AT (VERSION => 5)` 或挂载时钉版本 `(TYPE delta, VERSION 5)`；`CHECKPOINT t` 压缩 Delta log；底层 delta-kernel-rs + object_store，支持删除向量扫描/过滤下推/多线程；**平台仅 linux amd64/arm64、macOS Intel/Apple Silicon、Windows amd64**（[Delta](https://duckdb.org/docs/current/core_extensions/delta)）。
- **Parquet 直读**：`read_parquet('s3://bucket/*.parquet')` 支持多文件与 glob（ListObjectsV2 实现）（[S3 API Support](https://duckdb.org/docs/current/core_extensions/httpfs/s3api.html)）。

### MotherDuck 与 MCP server（重点核实）

- **MotherDuck 官方出了 MCP server，且是"本地 + 托管"双形态**：本地款 `motherduckdb/mcp-server-motherduck`（"DuckDB / MotherDuck Local MCP Server"）托管在 MotherDuck 官方 GitHub org `motherduckdb` 下，**MIT 开源**——可连本地 DuckDB 文件、内存库、S3 上的库和 MotherDuck，v1.x 起**默认只读**、加 `--read-write` 才可写；托管款 Remote MCP 由 MotherDuck 云端直接提供（[GitHub 仓库](https://github.com/motherduckdb/mcp-server-motherduck)、[Remote MCP 文档](https://motherduck.com/docs/sql-reference/mcp/)）。
- **DuckDB 本体（duckdb org）没有官方 MCP server**：`duckdb/duckdb-mcp-server` 不存在；官方社区扩展目录里有一个社区维护的 `duckdb_mcp`（teaguesterling 维护，Apache-2.0，双向——既能当 MCP server 把库内容暴露成资源，也能当 client 用 SQL 访问远端 MCP 资源），引用时勿说成 DuckDB 官方（[community-extensions 仓库](https://github.com/duckdb/community-extensions)、[description.yml](https://raw.githubusercontent.com/duckdb/community-extensions/main/extensions/duckdb_mcp/description.yml)）。

### 当前版本与 Python 要求

- 最新稳定版 **1.5.5**（[官网安装页](https://duckdb.org/install/) data-core-version 标注；[PyPI](https://pypi.org/project/duckdb/) 同步 1.5.5，2026-07-22 上传）。
- Python 版本口径不一致：文档页写 "DuckDB requires Python **3.9** or newer"（[Python API](https://duckdb.org/docs/current/clients/python/overview)），但 PyPI 上 1.5.5 的 `requires_python` 元数据是 **>=3.10.0**（[PyPI JSON API](https://pypi.org/pypi/duckdb/json)）——落地时按 PyPI 元数据执行（≥3.10）。

## 典型用例模式

### 模式 1：PyIceberg scan → Arrow → DuckDB 本地聚合 → LLM 归纳

```python
# 伪代码形状（来源：PyIceberg to_duckdb 源码 + DuckDB conversion 文档）
table = cat.load_table("ods.well_daily")                    # 承接 minio-iceberg.md 模式 2

con = table.scan(row_filter="prod_date >= '2026-01-01'",    # 裁剪在 PyIceberg 规划期完成
                 selected_fields=("well_id", "oil_prod")) \
        .to_duckdb("well_daily")                            # 源码形状: con.register(name, self.to_arrow())

agg = con.sql("""
    SELECT well_id, sum(oil_prod) AS total, avg(oil_prod) AS avg_d
    FROM well_daily GROUP BY well_id ORDER BY total DESC LIMIT 50
""").to_arrow_table()                                       # 新 Arrow 签名（fetch_arrow_table 已 deprecated）
# 摘要表 → 序列化喂 LLM 归纳：数据不出进程、零落盘、毫秒级试错
```

### 模式 2：DuckDB 直连 MinIO 读 Parquet / 挂 REST catalog 扫湖

```sql
-- 伪代码形状（来源：httpfs S3 API Support 页 + iceberg REST Catalogs 页）
CREATE SECRET minio_secret (TYPE S3, PROVIDER config,
    KEY_ID 'AK', SECRET 'SK',
    ENDPOINT 'minio.petro.internal:9000',   -- 自建端点
    URL_STYLE 'path',                        -- MinIO 走 path-style
    USE_SSL false);                          -- 内网 http

SELECT well_id, sum(oil_prod) FROM read_parquet('s3://warehouse/well_daily/*.parquet')
GROUP BY well_id;                            -- httpfs 已 tested with MinIO（官方原话）

-- 进阶：挂 Iceberg REST catalog，获得可写湖表 + 时间旅行
CREATE SECRET ic_secret (TYPE ICEBERG, TOKEN 'bearer...');
ATTACH 's3://warehouse/' AS lake (TYPE ICEBERG, SECRET ic_secret,
    ENDPOINT 'http://rest-catalog.petro.internal:8181');
SELECT * FROM lake.ods.well_daily AT (VERSION => SNAPSHOT_ID);  -- 按快照回放 Agent 结论
```

## 选型差异（一句话版）

- **DuckDB vs SQLite**：同为进程内嵌入式、零依赖（官方 why 页明说借鉴了 SQLite 的简单性与进程内运行），但 SQLite 面向单机应用的行式 OLTP 单文件库（sqlite.org "Single-file database"），DuckDB 面向列式 OLAP 分析查询（[Why DuckDB](https://duckdb.org/why_duckdb/)、[SQLite About](https://www.sqlite.org/about.html)）。
- **DuckDB vs Polars**：Polars 是"DataFrame 的分析查询引擎，用 Rust 写"（表达式/惰性 API 形状），DuckDB 是完整 SQL 数据库（DDL/事务/扩展/持久化）——都嵌进程，选型看队伍主语言是 DataFrame 链还是 SQL 链（[Polars README](https://github.com/pola-rs/polars)）。
- **DuckDB vs ClickHouse**：ClickHouse 是"面向 OLAP 的列式 SQL DBMS"，以服务端集群形态扛高并发实时分析，DuckDB 单机进程内、贴着分析者跑（[ClickHouse Docs](https://clickhouse.com/docs/en/intro)）。
- **DuckDB vs Trino**：Trino 是"分布式 SQL 查询引擎，查询跨一个或多个异构数据源的大数据集"，联邦下推；DuckDB 把数据拉到本地算——单文件/单表交互分析 DuckDB，跨源海量联邦 Trino（[Trino Overview](https://trino.io/docs/current/overview.html)）。
- **DuckDB vs Spark 本地模式**：Spark 自我定位"大规模数据分析的统一引擎"，本地模式也起 JVM driver 进程、生态重；DuckDB 进程内嵌、pip 装完即用——原型/沙箱/中小数据交互分析 DuckDB，大规模 ETL/流处理 Spark（[spark.apache.org](https://spark.apache.org/)）。

## 版本锚点

（查询日期：2026-09-23）

- **DuckDB 稳定版 1.5.5**（2026-07-22 发布，bugfix 线）；特性版 **1.5.0 "Variegata"**（2026-03-09）；文档站版本导航为 "1.5 current / 2.0-dev preview"（[GitHub Releases](https://github.com/duckdb/duckdb/releases)、[官网安装页](https://duckdb.org/install/)）。
- **Python 客户端 1.5.5**，`pip install duckdb`；Python 版本要求文档写 3.9+、PyPI 元数据 >=3.10.0（[PyPI](https://pypi.org/project/duckdb/)）。
- **关联锚点**：PyIceberg 0.12.0 的 `to_duckdb` 形状见 [iceberg-python 源码](https://github.com/apache/iceberg-python/blob/main/pyiceberg/table/__init__.py)；iceberg/delta 均为 DuckDB 核心扩展、随 1.5.x 文档维护。

**未找到一手源/证据不足**：① Python 版本下限官方两处口径不一致（docs 3.9+ vs PyPI >=3.10.0），引用时建议以 PyPI 元数据为准；② 官方文档没有"MinIO 专用配置示例页"——MinIO 只出现在 s3api 页的 tested-with 清单里，path-style 写法是从 `URL_STYLE` 参数表 + legacy 页明文（`SET s3_url_style='path'`）推得的标准形状；③ duckdb org 本体无官方 MCP server，"DuckDB MCP"只有 MotherDuck 官方款与社区款（duckdb_mcp），引用时勿混同。

## 信源列表

- Why DuckDB（进程内/零依赖/amalgamation/可移植/Quack 协议）：https://duckdb.org/why_duckdb/
- 官网安装页（当前稳定版 1.5.5）：https://duckdb.org/install/
- GitHub Releases（1.5.5 / 1.5.0 "Variegata"）：https://github.com/duckdb/duckdb/releases
- Python API（sql/connect/线程安全/扩展安装）：https://duckdb.org/docs/current/clients/python/overview
- Python 结果转换（df/to_arrow_table/deprecated 清单）：https://duckdb.org/docs/current/clients/python/conversion
- Python 数据摄入（替换扫描/register/优先级）：https://duckdb.org/docs/current/clients/python/data_ingestion
- httpfs S3 API Support（secrets 参数表/MinIO tested/read_parquet）：https://duckdb.org/docs/current/core_extensions/httpfs/s3api.html
- httpfs Legacy Authentication（SET s3_endpoint/s3_url_style='path'）：https://duckdb.org/docs/current/core_extensions/httpfs/s3api_legacy_authentication.html
- Iceberg 扩展总览（两种用法/只读 vs 可写）：https://duckdb.org/docs/current/core_extensions/iceberg/overview
- Iceberg Functions（iceberg_scan/iceberg_metadata/iceberg_snapshots/AT 时间旅行）：https://duckdb.org/docs/current/core_extensions/iceberg/iceberg_functions
- Iceberg REST Catalogs（CREATE SECRET TYPE ICEBERG/ATTACH 形状）：https://duckdb.org/docs/current/core_extensions/iceberg/catalogs.html
- Writing to Iceberg（分区变换/UPDATE/DELETE/MERGE INTO/限制）：https://duckdb.org/docs/current/core_extensions/iceberg/writing.html
- Delta 扩展（delta_scan/ATTACH TYPE delta/AT VERSION/CHECKPOINT/平台限制）：https://duckdb.org/docs/current/core_extensions/delta
- MotherDuck 本地 MCP server（官方 org、MIT、默认只读）：https://github.com/motherduckdb/mcp-server-motherduck
- MotherDuck Remote MCP 文档：https://motherduck.com/docs/sql-reference/mcp/
- DuckDB 社区扩展目录（duckdb_mcp 为社区款）：https://github.com/duckdb/community-extensions ；duckdb_mcp 描述：https://raw.githubusercontent.com/duckdb/community-extensions/main/extensions/duckdb_mcp/description.yml
- PyPI duckdb（版本与 requires_python 元数据）：https://pypi.org/project/duckdb/ ；JSON API：https://pypi.org/pypi/duckdb/json
- PyIceberg to_duckdb 源码：https://github.com/apache/iceberg-python/blob/main/pyiceberg/table/__init__.py
- Trino Overview：https://trino.io/docs/current/overview.html ；ClickHouse Intro：https://clickhouse.com/docs/en/intro ；SQLite About：https://www.sqlite.org/about.html ；Polars README：https://github.com/pola-rs/polars ；Spark：https://spark.apache.org/
