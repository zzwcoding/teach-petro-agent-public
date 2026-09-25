# MinIO + Apache Iceberg（湖仓底座 × Data Agent）

> 技术栈调研 · slug: minio-iceberg · 关联: [redis-minio.md](redis-minio.md)（MinIO 基础部分）
> 适用场景：国产化内网环境 · 假想业务：Petro-Agent 油田智能平台
> 调研日期：2026-09-23，论断均以官方文档/源码为准，逐条注源。

## 使用场景

### MinIO 在湖仓架构里的角色：数据湖的物理底座

- **S3 兼容对象存储就是数据湖的磁盘**：Iceberg 表的数据文件（Parquet/Avro/ORC）、清单文件（manifest，AVRO）、清单列表与元数据 JSON **全部以对象形式落在桶里**——MinIO 官方湖仓教程里一张表的所有文件同存一个 `iceberg` 桶，catalog 状态由外部（示例用 PostgreSQL JDBC catalog）持有（[MinIO 官方湖仓指南](https://www.min.io/blog/lakehouse-architecture-iceberg-minio)）。
- **走原生 S3FileIO 而非 HadoopFileIO**：Iceberg 访问 MinIO 用原生 S3FileIO，避免"携带 Hadoop 包袱"进云原生湖仓；文件名按前缀散列（ObjectStoreLocationProvider）摊平 S3 IO、抗限流（[MinIO 官方湖仓指南](https://www.min.io/blog/lakehouse-architecture-iceberg-minio)）。
- **国产化/内网意义**：油田内网私有部署 MinIO = 自建数据湖，任何讲 S3 协议的湖仓组件（Spark/Trino/StarRocks/Doris/PyIceberg）都能把 `s3.endpoint` 指到它（各引擎接入形状见下）。

### Apache Iceberg 解决什么问题：给"一堆对象文件"补上表语义

Iceberg 是**开放表格式**（open table format）——不替代存储、不替代计算引擎，而是在对象文件之上定义机器可读的表结构层（[Table Spec](https://iceberg.apache.org/spec/)）：

- **ACID 快照隔离**：表状态更新 = 生成新元数据文件后**原子替换**（atomic swap）；多写入者靠乐观并发重试提交（[Table Spec](https://iceberg.apache.org/spec/)）。
- **Hidden partitioning**："分区只是表配置，读计划基于数据值谓词而非分区值"——用户写业务谓词，裁剪由格式代劳，物理目录布局不再污染 SQL（[Table Spec](https://iceberg.apache.org/spec/)）。
- **Schema/分区演化**：列的安全增删改名（含嵌套结构）只是元数据操作；分区规格可演化，新 spec 取代旧 spec、按快照序号保持新旧文件正确归位（[Table Spec](https://iceberg.apache.org/spec/)）。
- **Time travel 与回滚**：每次提交生成快照，"表中某时点的状态（含全部数据文件集合）"可按快照读回（[Table Spec](https://iceberg.apache.org/spec/)）。
- **统计信息与裁剪**：manifest list 带 per-manifest 分区统计用于跳过整个 manifest；manifest 每行带数据文件的分区值与 metrics（列级 min/max/null 计数）供文件级裁剪（[Table Spec](https://iceberg.apache.org/spec/)）。
- **引擎解耦**：同一张表被 Spark/Trino/Flink/StarRocks/Doris/PyIceberg 各自读写，互不绑死——这就是"开放"的含义（[Vendors 页](https://iceberg.apache.org/vendors/)）。
- **spec 版本现状**："V1/V2/V3 已完成并被社区采纳，V4 开发中"。V3 新增：纳秒时间戳/unknown/**variant**/geometry/geography 类型、列默认值、多参分区变换、**行级血缘（row lineage）**、**二进制删除向量（deletion vectors）**、表加密键；V4 主打相对路径（表可迁移免重写元数据）（[Table Spec](https://iceberg.apache.org/spec/)）。

### 为什么 Data/Data Agent 需要这一层（全文重点）

Agent 问数（text-to-SQL / 数据分析智能体）的失败模式大多是"猜错表、猜错列、猜错口径、查了脏数据"。湖仓层恰好逐条对上：

- **确定性的表语义信源，压 text-to-SQL 幻觉**：LLM 生成 SQL 最怕 schema 靠目录列表+文件名猜。Iceberg catalog 里 schema、分区规格、列注释、列统计**全是一等元数据**，Agent 拉到的是结构化 JSON/Arrow 而非人类口述的"数据字典文档"（[Table Spec](https://iceberg.apache.org/spec/)、[PyIceberg](https://py.iceberg.apache.org/)）。
- **快照隔离保证并发不脏读**：Agent 高频探索查询与上游 ETL 同时进行时，读的是加载时的快照，不会读到半截写入（[Table Spec](https://iceberg.apache.org/spec/)）。
- **Time travel = 结论可回放**：Agent 给出的每个分析结论可绑定 `snapshot_id`，审计时按同一快照重放得到同一结果——"可复现分析"是 Agent 结果可信的底线（[Table Spec](https://iceberg.apache.org/spec/)、[PyIceberg scan](https://py.iceberg.apache.org/)）。
- **REST Catalog 让工具层纯 API 发现表**：Agent 的 MCP/工具层只要会发 HTTP，就能 list/load 表、读 schema、拿 vended credentials，不必捆绑任何计算引擎或 JVM——"一个客户端实现打通所有语言/引擎"，还支持服务端提交去冲突与远程签名（[REST Catalog Spec](https://iceberg.apache.org/rest-catalog-spec/)）。
- **分区裁剪 + 列统计 = 探索性查询成本可控**：Agent 一轮对话可能发起十几次试错查询，manifest 级跳过 + 文件级 min/max 裁剪让"扫一眼某列分布"不至于全表扫（[Table Spec](https://iceberg.apache.org/spec/)）。
- **PyIceberg 让"查湖"成为 Agent 主循环里的一个 tool**：纯 Python 实现、**无需 JVM**，`scan().to_arrow().to_pandas()` 一条链路直通 LLM 上下文；写侧 append/overwrite/delete/upsert 皆备（[PyIceberg](https://py.iceberg.apache.org/)、[iceberg-python 源码](https://github.com/apache/iceberg-python)）。
- **前沿已落地：表格式 × MCP**——Polaris 官网 Tools 栏列有 **Polaris MCP Server**（[polaris.apache.org](https://polaris.apache.org/)）；Databricks 托管 MCP Server（Public Preview）让 Agent 经 Unity Catalog 访问数据与函数（[Databricks 文档](https://docs.databricks.com/aws/en/generative-ai/mcp/managed-mcp)）；AWS 出了 S3 Tables（Iceberg 托管表）的 MCP 教程（[AWS Storage Blog](https://aws.amazon.com/blogs/storage/implementing-conversational-ai-for-s3-tables-using-model-context-protocol-mcp)）。"catalog/表格式作为 Agent 工具暴露"已是厂商共识动作。

## 核心能力面

### Iceberg 表格式关键机制（元数据树）

来源：[Table Spec](https://iceberg.apache.org/spec/)

- **四层元数据树**：`metadata json`（表 schema、分区配置、属性、快照全集）→ `manifest list`（一个快照对应一份，带 per-manifest 统计以跳过不需要的 manifest）→ `manifest`（每行 = 一个数据文件 + 分区值 + metrics）→ `data file`（不可变 Parquet/Avro/ORC，逐文件跟踪而非按目录）。
- **提交即换元数据**：所有变更产生新 metadata json 并原子替换；catalog 只存"当前元数据指针"。
- **删除的两种编码**（V2 起）：position deletes（按文件路径+行号标删）与 equality deletes（按列值标删）；V3 引入二进制删除向量加速读。
- **分区演化/排序演化**：新 spec 取代旧 spec，不重写历史文件，靠序号对齐。

### Catalog 形态

来源：[Iceberg 1.11.0 文档导航](https://iceberg.apache.org/docs/latest/)、[REST Catalog Spec](https://iceberg.apache.org/rest-catalog-spec/)

- **形态清单**：HadoopCatalog、HiveCatalog（thrift HMS）、JDBC、AWS Glue/DynamoDB、Nessie、REST、自定义实现——catalog 只是"当前元数据指针"的寻址方式不同。
- **REST Catalog 的意义**：用 OpenAPI 定义统一 catalog 协议（地位类比 Hive 的 thrift 协议）；好处：任意新语言/引擎一个客户端实现通吃、变更式提交带来服务端去冲突与重试、catalog 服务端写根元数据简化升级、懒加载快照/多表提交/缓存、**credential vending（短期表级凭证下发）与远程签名**。
- **选型口径**：内网自建优先 REST（PyIceberg/StarRocks/Doris/Trino 全都原生讲 REST 协议）；已有 HMS 则 Hive 型零成本接入；需要跨表 Git 式版本语义用 Nessie。

### PyIceberg 关键 API 形状

来源：[PyIceberg 官网](https://py.iceberg.apache.org/)、[API 参考](https://py.iceberg.apache.org/reference/pyiceberg/catalog/)、[iceberg-python 源码](https://github.com/apache/iceberg-python)（**当前版本 0.12.0，2026-09-01 发布**，要求 Python ≥3.10,<4.0.0，[PyPI](https://pypi.org/project/pyiceberg/)）

- 入口：`catalog = load_catalog("default", type="rest", uri=..., credential=...)`；支持 Hive/Glue/DynamoDB/BigQuery/SQL(Postgres/SQLite)/**REST**/内存等 catalog；对象存储访问需装 `s3fs`/`pyarrow` 等 extra（`pip install "pyiceberg[s3fs,pyarrow]"`）。
- 发现：`catalog.list_namespaces()` / `list_tables(ns)` / `table = catalog.load_table("db.tbl")` / `table_exists` / `register_table`（把已有元数据文件注册进 catalog）。
- 读：`table.scan(row_filter="col > 0", selected_fields=("a","b"), snapshot_id=..., limit=...)` → `.to_arrow()` / `.to_pandas()` / `.to_duckdb(...)` / `.count()`；另有 `incremental_append_scan(from_snapshot_id_exclusive=..., to_snapshot_id_inclusive=...)`（签名取自[源码](https://github.com/apache/iceberg-python/blob/main/pyiceberg/table/__init__.py)）。
- 写：`table.append(df)` / `table.overwrite(df)` / `table.delete(predicate)` / `table.upsert(df)` / `table.add_files(...)`；结构演化 `with table.update_schema() as u: u.union_by_name(df.schema)`；分区演化 `table.update_spec()`；事务 `with table.transaction() as tx: ...`。
- 状态：`table.refresh()`（拉最新元数据）、`table.snapshots` / `table.current_snapshot` / `table.schema` / `table.schemas`（全历史 schema）。
- 写支持成熟度：0.10 起 bucket 分区表写入、动态 overwrite、提交重试与并发校验逐步补齐；0.12 加 Arrow RecordBatchReader 直写、视图（View）读取/REST 加载、geometry/geography 类型（[0.12.0 release notes](https://github.com/apache/iceberg-python/releases/tag/pyiceberg-0.12.0)、[Releases](https://github.com/apache/iceberg-python/releases)）。

### 引擎/仓库接入形状（MinIO 作 S3 endpoint）

- **Iceberg 本体（S3FileIO）**：`s3.endpoint` / `s3.path-style-access` / `s3.access-key-id` / `s3.secret-access-key`（常量取自[源码 S3FileIOProperties](https://github.com/apache/iceberg/blob/main/aws/src/main/java/org/apache/iceberg/aws/s3/S3FileIOProperties.java)）；Spark 侧 catalog 配置形状 `spark.sql.catalog.<name>.warehouse=s3://bucket/prefix` + `.io-impl=org.apache.iceberg.aws.s3.S3FileIO`（[AWS 集成文档](https://iceberg.apache.org/docs/latest/aws/)）。**官方 Spark quickstart 的 docker-compose 就带 MinIO**：`apache/iceberg-rest-fixture` 容器配 `CATALOG_WAREHOUSE=s3://warehouse/`、`CATALOG_S3_ENDPOINT=http://minio:9000`（[spark-quickstart](https://iceberg.apache.org/spark-quickstart/)）。
- **Trino**：catalog 文件 `connector.name=iceberg` + `iceberg.catalog.type`（`hive_metastore`/`glue`/`jdbc`/`rest`/`nessie` 等）；对象存储用原生 S3 文件系统：`fs.s3.enabled=true`、`s3.endpoint`、`s3.path-style-access`、`s3.aws-access-key`、`s3.aws-secret-key`（[Iceberg connector](https://trino.io/docs/current/connector/iceberg.html)、[S3 file system](https://trino.io/docs/current/object-storage/file-system-s3.html)）。
- **StarRocks**：`CREATE EXTERNAL CATALOG ... PROPERTIES("type"="iceberg", "iceberg.catalog.type"="rest"|"hive"|"glue"|"jdbc", ...)`；S3 兼容存储凭据参数 `aws.s3.endpoint` / `aws.s3.enable_path_style_access`（文档明说 **"For MinIO, you must set the value to true"**）/ `aws.s3.access_key` / `aws.s3.secret_key`；v4.0 起 REST catalog 支持 vended credentials（[StarRocks Iceberg Catalog](https://docs.starrocks.io/docs/data_source/catalog/iceberg/)）。
- **Apache Doris**：`CREATE CATALOG ... PROPERTIES('type'='iceberg', 'iceberg.catalog.type'='rest'|'hms'|'hadoop'|'glue'...)`；MinIO 存储参数页给了专用前缀 `minio.endpoint` / `minio.access_key` / `minio.secret_key` / `minio.use_path_style`（3.1 前为 `s3.*` 旧名，路径风格**建议 true**）；Doris 还支持向 Iceberg 表写回（Data Write-back）（[Iceberg Catalog](https://doris.apache.org/docs/lakehouse/catalogs/iceberg-catalog)、[MinIO 存储页](https://doris.apache.org/docs/lakehouse/storages/minio)）。
- **Flink**：批/流读写 Iceberg（DataStream/Table API），可按 `start-snapshot-id` / tag/branch hint 读历史与增量，`$snapshots`/`$files`/`$partitions` 等元数据表可查（[Flink Queries](https://iceberg.apache.org/docs/latest/flink-queries/)）。

### MinIO 官方对 Iceberg/湖仓的立场与文档

- **社区版定位**：官方湖仓指南把 MinIO 定位为 lakehouse 的 S3 兼容存储层（数据+元数据全落桶），2022-07 首发、2025-02 更新（[Definitive Guide to Lakehouse Architecture with Iceberg and MinIO](https://www.min.io/blog/lakehouse-architecture-iceberg-minio)）。
- **AIStor Tables（商业版）**：2026-02-03 GA，口号 "The first data store to build-in Apache Iceberg V3"——**把 Iceberg REST Catalog 内嵌进对象存储本身**（`/_iceberg` 路径，与 S3 API 同端点、同 SigV4 身份），支持 Views、多表原子事务、删除向量/row lineage/Variant，宣称"首个实现 Iceberg REST Catalog Views 的本地部署 catalog"（[GA 公告](https://www.min.io/blog/announcing-general-availability-of-minio-aistor-tables)、[Embedded vs External Catalogs](https://www.min.io/blog/embedded-vs-external-iceberg-catalogs-how-the-catalog-layer-works-in-a-data-lakehouse)）。
- **Iceberg 官方 Vendors 页背书**：MinIO AIStor "implements the Apache Iceberg REST Catalog specification"，支持 V3（row lineage、deletion vectors），"Engines connect over the standard REST catalog protocol, including Apache Spark, Trino, **PyIceberg**, DuckDB, Starburst, Dremio, PuppyGraph"（[iceberg.apache.org/vendors](https://iceberg.apache.org/vendors/)）。
- **接入文档**：查询引擎连 AIStor Tables 的官方配置页（[docs.min.io](https://docs.min.io/aistor/developers/aistor-tables/connect-query-engines/)）；注意 **AIStor 是商业产品，社区版 MinIO 仍只做对象存储、catalog 需外置**。

## 典型用例模式

### 模式 1：Agent 工具"发现表"——catalog 元数据喂给 LLM

```python
# 伪代码形状（来源：PyIceberg 官网 + catalog API 参考）
from pyiceberg.catalog import load_catalog

cat = load_catalog("petro", type="rest",
                   uri="http://minio.petro.internal:9000/_iceberg",  # 形状参照 AIStor Tables 内嵌 REST catalog
                   warehouse="s3://warehouse/", credential=...)       # 社区版则外置 REST catalog/Nessie/JDBC

def tool_list_tables(ns: str) -> list[str]:
    return [f"{ns}.{t}" for t in cat.list_tables(ns)]                 # 表清单 → tool 结果

def tool_describe(table_id: str) -> dict:
    t = cat.load_table(table_id)
    return {"schema": [(f.name, str(f.field_type)) for f in t.schema().fields],  # 确定性列名/类型
            "partition_spec": str(t.spec()),                           # 分区规格 → 生成 SQL 可带分区谓词
            "current_snapshot": t.current_snapshot().snapshot_id,      # 口径锚点
            "comment": t.schema().metadata}                            # 列注释即口径说明
# 这份 dict 直接拼进问数 prompt：LLM 拿的是机器可读 schema，不是猜的
```

### 模式 2：Agent 工具"查湖"——PyIceberg scan → Arrow → 归纳

```python
# 伪代码形状（来源：PyIceberg 官网示例 + 源码 DataScan 签名）
table = cat.load_table("ods.well_daily")   # 假想业务：井日产表（仅示意，非设定书事实）

def tool_query(pred: str, fields: tuple[str, ...], limit: int = 10000):
    scan = table.scan(row_filter=pred, selected_fields=fields, limit=limit)  # 分区/列裁剪在规划期完成
    return scan.to_arrow()                          # → to_pandas()/to_duckdb() 皆可

summary = tool_query("prod_date >= '2026-01-01'", ("well_id", "oil_prod")).to_pandas().describe()
# 摘要统计喂 LLM 归纳；大结果改走引擎下推：
#   Spark/Trino/StarRocks/Doris 挂同一 catalog+MinIO 跑 SQL，Iceberg 只供元数据与裁剪
```

### 模式 3：可复现/审计——按 snapshot id 回放 Agent 结论

```python
# 伪代码形状（来源：Table Spec 快照语义 + PyIceberg scan(snapshot_id=...)）
snap = table.current_snapshot().snapshot_id
answer = analyze(table.scan(row_filter=..., snapshot_id=snap).to_arrow())   # 结论绑定快照号

# 审计回放：任何人按同一 snapshot_id 重跑同一分析 → 结果逐字节可比
replay = analyze(table.scan(row_filter=..., snapshot_id=snap).to_arrow())
assert replay == answer
# 另一条链：incremental_append_scan(from_snapshot_id_exclusive=a, to_snapshot_id_inclusive=b)
# 直接拿两个快照间的增量，Agent 做日报"只看新增"不用全量重扫
```

## 选型差异（一句话版）

- **表格式**：Iceberg（引擎中立、社区采纳面最广，V3 已完成，[spec](https://iceberg.apache.org/spec/)）vs Delta Lake（"format agnostic lakehouse 框架"，Databricks 背景强，UniForm 可被 Iceberg/Hudi 客户端读，[delta.io](https://delta.io/)）vs Hudi（"开放湖仓平台"，主打 upsert/增量处理分钟级入湖，[hudi.apache.org](https://hudi.apache.org/)）。
- **Catalog**：REST Catalog（引擎无关的 OpenAPI 协议，Agent/多语言首选，[spec](https://iceberg.apache.org/rest-catalog-spec/)）vs Hive Metastore（存量最厚、thrift 老协议）vs Nessie（"带 Git 语义的事务 catalog，跨表事务"，[projectnessie.org](https://projectnessie.org/)）vs Apache Polaris（"数据与 AI 资产的开放 catalog"，实现 Iceberg REST API，官网 Tools 含 **Polaris MCP Server**，[polaris.apache.org](https://polaris.apache.org/)）vs Lakekeeper（Rust 写的自托管 REST catalog，OpenFGA 撑 RBAC/ReBAC/ABAC 且明说"跨引擎为人与 **AI agents**"做集中鉴权，[docs.lakekeeper.io](https://docs.lakekeeper.io/)）vs Gravitino（"高性能、地理分布式、联邦元数据湖"——catalog 之上的 metalake，[gravitino.apache.org](https://gravitino.apache.org/)）vs 内嵌型（MinIO AIStor Tables 把 REST catalog 塞进存储端点，少运维一个服务，[MinIO 博客](https://www.min.io/blog/embedded-vs-external-iceberg-catalogs-how-the-catalog-layer-works-in-a-data-lakehouse)）。

## 版本锚点

（查询日期：2026-09-23）

- **Apache Iceberg**：最新稳定 **1.11.0**（2026-05-20 发布，[GitHub Releases](https://github.com/apache/iceberg/releases)、[docs Latest](https://iceberg.apache.org/docs/latest/)）；spec 现状 V1–V3 完成、V4 开发中（[Table Spec](https://iceberg.apache.org/spec/)）。
- **PyIceberg**：**0.12.0**（2026-09-01 发布，Python ≥3.10,<4.0.0，[PyPI](https://pypi.org/project/pyiceberg/)、[release](https://github.com/apache/iceberg-python/releases/tag/pyiceberg-0.12.0)）。
- **MinIO**：社区版最新 RELEASE tag 为 **RELEASE.2025-10-15T17-29-55Z**（2025-10-16，[GitHub Releases](https://github.com/minio/minio/releases)）；AIStor（商业线）2026-02 GA Tables（内嵌 Iceberg V3 REST catalog，[GA 公告](https://www.min.io/blog/announcing-general-availability-of-minio-aistor-tables)）。
- **引擎侧锚点**：StarRocks v4.0 起 REST catalog 支持 vended credentials（[docs](https://docs.starrocks.io/docs/data_source/catalog/iceberg/)）；Doris 3.1 起 MinIO 参数换 `minio.*` 前缀、4.1 起支持 Iceberg JDBC catalog（[docs](https://doris.apache.org/docs/lakehouse/catalogs/iceberg-catalog)）；Trino 原生 S3 文件系统 `fs.s3.enabled`（[docs](https://trino.io/docs/current/object-storage/file-system-s3.html)）。
- **未找到一手源/证据不足**：① apache/iceberg 本体**没有**官方 MCP server——"Iceberg MCP"目前全部是厂商（Polaris/Databricks/AWS）或社区实现，引用时勿说成 Apache 官方；② Iceberg 官方文档 `docs/latest` 下没有独立的 S3FileIO 属性页（`/docs/latest/s3/` 为 404），`s3.endpoint` 等属性名本次取自[源码常量](https://github.com/apache/iceberg/blob/main/aws/src/main/java/org/apache/iceberg/aws/s3/S3FileIOProperties.java)；③ MinIO 社区版内嵌 catalog：不存在，AIStor Tables 为商业功能。

## 信源列表

- Apache Iceberg Table Spec（元数据树/快照/演化/V3 清单）：https://iceberg.apache.org/spec/
- Apache Iceberg 文档 Latest 1.11.0（catalog 形态、Flink、AWS 集成）：https://iceberg.apache.org/docs/latest/
- Iceberg REST Catalog Spec（OpenAPI 协议、credential vending）：https://iceberg.apache.org/rest-catalog-spec/
- Iceberg 官方 Spark Quickstart（docker-compose 内置 MinIO + REST fixture）：https://iceberg.apache.org/spark-quickstart/
- Iceberg Vendors 页（MinIO AIStor 条目、REST 协议引擎清单）：https://iceberg.apache.org/vendors/
- Iceberg S3FileIO 属性常量（源码）：https://github.com/apache/iceberg/blob/main/aws/src/main/java/org/apache/iceberg/aws/s3/S3FileIOProperties.java
- PyIceberg 官网（安装/extras/catalog 支持/scan+append 示例）：https://py.iceberg.apache.org/
- PyIceberg API 参考（Catalog 签名）：https://py.iceberg.apache.org/reference/pyiceberg/catalog/
- PyIceberg 源码（Table/DataScan 签名）：https://github.com/apache/iceberg-python/blob/main/pyiceberg/table/__init__.py
- PyIceberg 0.12.0 Release：https://github.com/apache/iceberg-python/releases/tag/pyiceberg-0.12.0 ；PyPI：https://pypi.org/project/pyiceberg/
- Trino Iceberg connector：https://trino.io/docs/current/connector/iceberg.html ；S3 file system：https://trino.io/docs/current/object-storage/file-system-s3.html
- StarRocks Iceberg Catalog（含 MinIO path-style 必设 true）：https://docs.starrocks.io/docs/data_source/catalog/iceberg/
- Apache Doris Iceberg Catalog：https://doris.apache.org/docs/lakehouse/catalogs/iceberg-catalog ；MinIO 存储参数：https://doris.apache.org/docs/lakehouse/storages/minio
- MinIO 湖仓指南（2022/2025 更新）：https://www.min.io/blog/lakehouse-architecture-iceberg-minio
- MinIO AIStor Tables GA 公告（2026-02-03）：https://www.min.io/blog/announcing-general-availability-of-minio-aistor-tables
- MinIO 内嵌 vs 外置 catalog（2026-08-10）：https://www.min.io/blog/embedded-vs-external-iceberg-catalogs-how-the-catalog-layer-works-in-a-data-lakehouse
- MinIO AIStor Tables 文档（查询引擎接入）：https://docs.min.io/aistor/developers/aistor-tables/connect-query-engines/
- MinIO GitHub Releases：https://github.com/minio/minio/releases
- Apache Polaris（含 Polaris MCP Server）：https://polaris.apache.org/
- Databricks 托管 MCP Server（Unity Catalog × Agent）：https://docs.databricks.com/aws/en/generative-ai/mcp/managed-mcp
- AWS Storage Blog：S3 Tables × MCP：https://aws.amazon.com/blogs/storage/implementing-conversational-ai-for-s3-tables-using-model-context-protocol-mcp
- Nessie：https://projectnessie.org/ ；Lakekeeper：https://docs.lakekeeper.io/ ；Gravitino：https://gravitino.apache.org/ ；Delta Lake：https://delta.io/ ；Hudi：https://hudi.apache.org/
