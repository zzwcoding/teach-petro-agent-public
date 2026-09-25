# Apache Flink（流处理引擎 × Data Agent）

> 技术栈调研 · slug: flink · 关联: [minio-iceberg.md](minio-iceberg.md)（湖仓底座——Flink 是该栈的实时进料与加工层，本文件把其"Flink"小节展开成篇）· 适用场景：国产化内网环境 · 假想业务：Petro-Agent 油田智能平台 · 调研日期：2026-09-24 · 论断以官方文档/源码为准，逐条注源

## 使用场景

### Flink 是什么：流处理优先的有状态分布式计算引擎

- **官方定位**："a framework and distributed processing engine for stateful computations over unbounded and bounded data streams"（对流与批的状态化计算），主打 exactly-once 状态一致性、事件时间处理与迟到数据处理、增量 checkpoint、低延迟高吞吐（[flink.apache.org](https://flink.apache.org/)）。
- **事件时间 + watermark**："时间的进度取决于数据而非墙上时钟"；Watermark(t) 声明"事件时间已到达 t"，窗口据此确定性闭合，迟到数据走 allowed lateness（[Time 文档](https://nightlies.apache.org/flink/flink-docs-release-2.3/docs/concepts/time/)）。
- **状态与容错**：checkpoint 让状态可恢复，"给予应用与无故障执行相同的语义"；checkpoint 存储分 JobManager（堆，单状态默认 5MB 上限）与 FileSystem（生产 HA 推荐）两类（[Checkpoints](https://nightlies.apache.org/flink/flink-docs-release-2.3/docs/ops/state/checkpoints/)）；状态后端默认 HashMapStateBackend，**EmbeddedRocksDBStateBackend 是唯一支持增量 checkpoint 的内置后端**，ForStStateBackend（存算分离到远端文件系统）仍标注 experimental（[State Backends](https://nightlies.apache.org/flink/flink-docs-release-2.3/docs/ops/state/state_backends/)）。

### 为什么 DataAgent 需要它（全文重点）

- **① Agent 数据面的"进料口"**：Agent 问答的新鲜度取决于入湖延迟。Flink CDC 从业务库（MySQL/Oracle/Postgres）抽增量，经 pipeline 实时写 Iceberg 落 MinIO；Flink Iceberg sink **"guarantees exactly-once semantics"**——湖里不重不丢，Agent 问到的数才是可信的增量视图（[flink-cdc pipeline connectors](https://nightlies.apache.org/flink/flink-cdc-docs-release-3.6/docs/connectors/pipeline-connectors/overview/)、[Iceberg Flink Writes](https://iceberg.apache.org/docs/latest/flink-writes/)）。
- **② 流批一体——口径两侧一致**：同一套 SQL/Table API 既跑实时增量也跑全量回刷，Agent 消费的"日累计产量"在实时与离线两侧出自同一条作业定义，不存在流批两套口径对不上的问题（[flink.apache.org：SQL 支持流与批](https://flink.apache.org/)）。
- **③ 实时指标生产者**：Flink 算好实时聚合宽表/指标写 Iceberg（或经 [Flink CDC pipeline sink](https://nightlies.apache.org/flink/flink-cdc-docs-release-3.6/docs/connectors/pipeline-connectors/overview/) 写 StarRocks/Doris/Paimon），Agent 的"实时问答"消费的是 Flink 产物而非自己现算——链路分工：**Flink 管进料加工，Cube 管口径暴露（[cube-semantic-layer.md](cube-semantic-layer.md)），Trino/StarRocks/DuckDB 管交互查询（[minio-iceberg.md](minio-iceberg.md)、[duckdb.md](duckdb.md)）**，各守一段。
- **④ 定位差**：**Flink SQL Gateway 是作业提交/会话形态，不是交互式问数引擎**——OpenAPI 规范官方原话"still experimental"，语句按 session→operation 提交、结果分批拉取，延迟模型与 Trino/StarRocks 的亚秒交互查询不同（[SQL Gateway 文档](https://nightlies.apache.org/flink/flink-docs-release-2.3/docs/sql/interfaces/sql-gateway/)）。Agent 交互问数不要直连 Flink。
- **⑤ 官方 AI/Agent 叙事：有，而且不小**——官方子项目 **Flink Agents**（0.3.1，兼容 Flink 1.20.x–2.3.x）自称 "a streaming Agent OS"："agent 成为你实时数据流里的一等 operator，在活事件流中做 AI 决策"，内置记忆抽象、工具与 **MCP server 上的工具托管**、主流 LLM/向量库集成，checkpoint + 外部 WAL 保证 agent 执行 exactly-once（[Flink Agents 文档](https://nightlies.apache.org/flink/flink-agents-docs-latest/docs/get-started/overview/)、[下载页](https://flink.apache.org/downloads/)）；SQL 侧 Flink 2.1 起内置 `ML_PREDICT` 模型推理（含 OpenAI provider）、2.2 起内置 `VECTOR_SEARCH` 流式向量检索（[2.2.0 发布博客](https://flink.apache.org/2025/12/04/apache-flink-2.2.0-advancing-real-time-data--ai-and-empowering-stream-processing-for-the-ai-era/)）。

## 核心能力面

### 编程模型一句话级

- 三层 API：DataStream API / Table API / SQL；流批一体执行（[flink.apache.org](https://flink.apache.org/)）。
- exactly-once 语义 = checkpoint 恢复状态 + sink 侧两阶段提交（FLIP-191 统一 Sink 接口即为此设计，[FLIP-191](https://cwiki.apache.org/confluence/display/FLINK/FLIP-191%3A+Extend+unified+Sink+interface+to+support+small+file+compaction)、[Iceberg SinkV2 说明](https://iceberg.apache.org/docs/latest/flink-writes/)）。

### Iceberg 集成形状（重点）

来源：[Flink Connector DDL](https://iceberg.apache.org/docs/latest/flink-connector/)、[Flink Writes](https://iceberg.apache.org/docs/latest/flink-writes/)、[Flink Reads/配置](https://iceberg.apache.org/docs/latest/flink-configuration/)、[Flink Maintenance](https://iceberg.apache.org/docs/latest/flink-maintenance/)

- **DDL/catalog**：Flink SQL 建表 `CREATE TABLE ... WITH ('connector'='iceberg', 'catalog-type'='hive'|'hadoop'|'rest', 'uri'=..., 'warehouse'=...)`，可引用已有表（`catalog-name/catalog-database/catalog-table`）。
- **写/upsert**：UPSERT 按主键生效，**仅限 v2 表格式**——表级 `'format-version'='2', 'write.upsert.enabled'='true'`，或写入提示 `INSERT INTO t /*+ OPTIONS('upsert-enabled'='true') */`；DataStream 侧 `FlinkSink.upsert(true)`。**限制**：OVERWRITE 与 UPSERT 互斥；分区表的 upsert 要求分区源列包含在 equality fields 里；流作业不支持 `INSERT OVERWRITE`；HASH 分布写并行度受 hash key 基数限制。
- **写语义与实验性新 sink**：Flink Iceberg sink 保证 exactly-once；基于 SinkV2（Flink 1.15+）的新 `IcebergSink` 仍 experimental（`SET table.exec.iceberg.use-v2-sink = true;` 启用，RANGE 分布暂缺）。
- **读**：`'streaming'='true'` 流式读 + `monitor-interval`（默认 60s）发现新快照；`starting-strategy`（默认 `INCREMENTAL_FROM_LATEST_SNAPSHOT`，可选 `INCREMENTAL_FROM_SNAPSHOT_ID` 等）；批模式 time travel 用 `snapshot-id`/`as-of-timestamp`；分支/标签读 `branch`/`tag`，增量区间 `start-snapshot-id`/`end-snapshot-id`/`start-tag`/`end-tag`；`split-size` 默认 128MB。
- **元数据表**：`$history`/`$snapshots`/`$files`/`$manifests`/`$partitions` 可直接 SELECT——Agent 想"看这张湖表发生了什么"有现成的自查面（[Flink Queries](https://iceberg.apache.org/docs/latest/flink-queries/)）。
- **小文件治理**：批态 Actions API `Actions.forTable(table).rewriteDataFiles()`；流态 `TableMaintenance` 任务（ExpireSnapshots/RewriteDataFiles/DeleteOrphanFiles），按 `scheduleOnCommitCount`/`scheduleOnInterval` 调度，需 TriggerLockFactory 防并发维护；SQL 侧 `flink-maintenance.rewrite.enabled` 等开关。**运维红线**：过期快照/删孤儿文件可能破坏 Flink 作业状态——保留含 `flink.job-id` 的快照。

### Flink CDC 3.x

来源：[Pipeline Connectors Overview](https://nightlies.apache.org/flink/flink-cdc-docs-release-3.6/docs/connectors/pipeline-connectors/overview/)、[Iceberg Pipeline Connector](https://nightlies.apache.org/flink/flink-cdc-docs-release-3.6/docs/connectors/pipeline-connectors/iceberg/)

- **形态**：YAML pipeline 定义 source（MySQL/Oracle/Postgres）→ sink（Iceberg/StarRocks/Doris/Paimon/Kafka/Hudi/Fluss/Elasticsearch/OceanBase/MaxCompute），3.6.0（2026-03-30）兼容 Flink 1.20.x 与 2.2.x。
- **官方 Iceberg pipeline sink 存在**（3.4 起加入）：自动建表、**schema 变更（加列）自动传播到 Iceberg**、批+流两种同步、`partition.key` 支持分区变换（`truncate[10](id)`/`hour(ts)`/`bucket[10](...)`）；catalog 支持 hadoop/hive/glue + 自定义 impl；依赖 `iceberg-flink-runtime-1.20` jar。
- **语义红线（与 Flink Iceberg sink 不同）**："Exactly-once semantics are not supported. The connector uses at-least-once + the table's primary key for idempotent writing"；且源表**必须有主键**。

### SQL Gateway / SQL Client 现状

来源：[SQL Gateway](https://nightlies.apache.org/flink/flink-docs-release-2.3/docs/sql/interfaces/sql-gateway/)、[REST Endpoint](https://nightlies.apache.org/flink/flink-docs-release-2.3/docs/sql/interfaces/sql-gateway/rest-endpoint/)

- `./bin/sql-gateway.sh start` 起 REST endpoint（默认 8083）：`POST /v1/sessions` 开会话得 `sessionHandle` → `POST /v1/sessions/{sh}/statements/` 提交语句得 `operationHandle` → 分批 fetch 结果（`EOS` 结束）；OpenAPI 分 v1（提交语句）/v2（SQL Client 连接）/v3（物化表刷新）/v4（application 模式脚本部署）。**成熟度原话："The OpenAPI specification is still experimental."** 另有 HiveServer2 endpoint 与 Flink JDBC Driver 页面。
- 定位表述：这是"给 SQL Client/调度系统远程提交作业"的口子，不是给 Agent 做 BI 式即时问数的引擎。

## 典型用例模式

### 模式 1：Flink CDC → Iceberg 实时入湖（YAML pipeline 形状）

```yaml
# 伪代码形状（来源：flink-cdc 3.6 Iceberg pipeline connector 文档）
source:
  type: mysql
  hostname: oltp.petro.internal
  tables: production.well_daily          # 业务库增量表（仅示意，非设定书事实）
sink:
  type: iceberg
  name: iceberg-sink
  catalog.properties.type: hadoop        # 或 hive/glue + 自定义 impl
  catalog.properties.warehouse: s3://warehouse/   # ← MinIO 上的桶（iceberg-flink-runtime-1.20 jar）
  table.properties.format-version: "2"
pipeline:
  route:
    - source-table: production.well_daily
      sink-table: ods.well_daily
      partition-key: prod_date           # 支持 day/hour/truncate[10]/bucket[10] 等变换
# 语义注意：pipeline sink = at-least-once + 主键幂等（非 exactly-once）；
# 要 exactly-once 得走 Flink SQL 的 iceberg sink（upsert 限 v2 表 + 主键）
```

### 模式 2：Flink 产实时聚合 → Agent 经引擎/语义层消费

```sql
-- 伪代码形状（来源：Iceberg Flink DDL/Writes 文档）
CREATE TABLE dws_well_prod_rt (
  operator STRING, prod_date TIMESTAMP(3),
  total_oil BIGINT,
  PRIMARY KEY (operator, prod_date) NOT ENFORCED   -- upsert 前提：v2 表 + 主键
) WITH ('connector'='iceberg', 'format-version'='2', 'write.upsert.enabled'='true',
        'catalog-type'='rest', 'uri'='http://rest-catalog:8181',
        'warehouse'='s3://warehouse/');

INSERT INTO dws_well_prod_rt            -- 流作业持续维护这张聚合宽表
SELECT operator, window_start AS prod_date, SUM(oil_prod) AS total_oil
FROM TABLE(TUMBLE(TABLE ods_well_daily, DESCRIPTOR(row_time), INTERVAL '1' DAY))
GROUP BY operator, window_start;
-- 下游：Trino/StarRocks 交互查这张表，或登记进 Cube 语义层供 Agent 问数；
-- Agent 侧判据：表快照增长 = 数据新鲜度（$snapshots 元数据表可自查）
```

### 模式 3（可选）：小文件治理定时作业

```java
// 伪代码形状（来源：Iceberg Flink Maintenance 文档）
TableMaintenance.forTable(loader)
    .add(RewriteDataFiles.builder().targetFileSizeBytes(128 * 1024 * 1024).build())
    .add(ExpireSnapshots.builder().maxSnapshotAge(Duration.ofDays(5)).retainLast(1).build())
    .scheduleOnInterval(Duration.ofHours(1))   // 需 TriggerLockFactory 防多作业并发维护
    .append();
// 流式入湖一天写几千 commit 时，不治理会让 Trino/StarRocks 的查询规划变慢
```

## 选型差异（一句话版）

- **Flink vs Spark Structured Streaming**：Spark SS 是"构建在 Spark SQL 引擎之上的可扩展容错流处理引擎"，默认微批（约 100ms 级延迟、exactly-once，Continuous 模式约 1ms 但 at-least-once）（[Spark 文档](https://spark.apache.org/docs/latest/structured-streaming-programming-guide.html)）——Flink 是真逐条事件驱动的纯流引擎，低延迟状态计算与 CDC/水位线场景是主场。
- **Flink vs Kafka Streams**：Kafka Streams 是"输入输出都存在 Kafka 集群里"的客户端库（[Kafka 文档](https://kafka.apache.org/documentation/streams/)）——跟 Kafka 深度绑定、无独立资源管理；Flink 是独立集群引擎，带完整 checkpoint/恢复与流批一体的 Table/SQL 层。
- **Flink CDC vs Debezium+Kafka**：Debezium 是"开源变更数据捕获平台"，把库的行级变更按提交序流进 Kafka（[debezium.io](https://debezium.io/)）——需要自备 Kafka 总线与下游消费者；Flink CDC 用 YAML pipeline 把 source→sink 一条龙管到底（直接落湖表，可跳过 Kafka 中转）。
- **Flink SQL Gateway vs Trino/StarRocks**：前者是实验性 OpenAPI 的作业提交/会话接口，后者是为亚秒级交互查询而生的 MPP 查询引擎（见 [minio-iceberg.md](minio-iceberg.md) 引擎节）——Agent 问数走后者，Flink 负责把数准备好。

## 版本锚点

（查询日期：2026-09-24）

- **Flink**：最新稳定 **2.3.0**（2026-06-25）；2.2.1（2026-05-15）；**1.20.5 为 LTS 线**（2026-06-03）——2.x 与 1.20 LTS 双线并行（[官方 Downloads](https://flink.apache.org/downloads/)）。
- **Iceberg × Flink 支持矩阵**（以 Maven Central 实际 artifacts 为准）：Iceberg 1.11.0 提供 `iceberg-flink-runtime-1.20`、`-2.0`、`-2.1`（均为 1.11.0）；`-1.19` 止于 1.10.2、`-1.18` 止于 1.9.2；**尚无 Flink 2.2/2.3 的 runtime artifact**（[Maven Central](https://repo1.maven.org/maven2/org/apache/iceberg/iceberg-flink-runtime-2.1/)）——新湖仓底座配 Flink 时选 1.20 或 2.0/2.1 线最稳。
- **Flink CDC**：**3.6.0**（2026-03-30，兼容 Flink 1.20.x/2.2.x），Iceberg pipeline sink 自 3.4 起提供（[Downloads](https://flink.apache.org/downloads/)、[CDC 版本表](https://nightlies.apache.org/flink/flink-cdc-docs-release-3.6/docs/connectors/pipeline-connectors/overview/)）。
- **Flink Agents**：0.3.1（兼容 Flink 1.20.x–2.3.x）；0.1.0 于 2025-10-15、0.2.0 于 2026-02-06 发布（[Downloads](https://flink.apache.org/downloads/)、[0.2.0 公告](https://flink.apache.org/2026/02/06/apache-flink-agents-0.2.0-release-announcement/)）。
- **证据不足/如实说明**：① Iceberg 官方文档**没有**一张"Flink 版本支持矩阵"页面（`/versions/` 为 404），上述矩阵由 Maven Central 上 `iceberg-flink-runtime-*` artifacts 实证得出；② Iceberg Flink Maintenance 文档页未提及 `rewrite_manifests` 动作（Spark 侧才有完整 actions 面）；③ Flink 2.3 的 SQL Model Inference/Vector Search 功能详情页未逐字核验，本文只引用 2.1/2.2 官方发布博客对 `ML_PREDICT`/`VECTOR_SEARCH` 的表述。

## 信源列表

- Flink 官网定位与子项目：https://flink.apache.org/
- 官方 Downloads（2.3.0/2.2.1/1.20.5 LTS、CDC 3.6.0、Flink Agents 0.3.1）：https://flink.apache.org/downloads/
- Time 语义（event time/watermark/迟到）：https://nightlies.apache.org/flink/flink-docs-release-2.3/docs/concepts/time/
- Checkpoints（checkpoint storage 两类）：https://nightlies.apache.org/flink/flink-docs-release-2.3/docs/ops/state/checkpoints/
- State Backends（HashMap/EmbeddedRocksDB/ForSt）：https://nightlies.apache.org/flink/flink-docs-release-2.3/docs/ops/state/state_backends/
- SQL Gateway 总览（8083/v1/sessions/statements）：https://nightlies.apache.org/flink/flink-docs-release-2.3/docs/sql/interfaces/sql-gateway/
- SQL Gateway REST Endpoint（OpenAPI v1–v4、"still experimental"）：https://nightlies.apache.org/flink/flink-docs-release-2.3/docs/sql/interfaces/sql-gateway/rest-endpoint/
- Flink Agents 文档（streaming Agent OS、MCP 工具托管、WAL exactly-once）：https://nightlies.apache.org/flink/flink-agents-docs-latest/docs/get-started/overview/
- Flink Agents 0.2.0 发布公告（2026-02-06）：https://flink.apache.org/2026/02/06/apache-flink-agents-0.2.0-release-announcement/
- Flink 2.2.0 发布博客（VECTOR_SEARCH/ML_PREDICT/物化表）：https://flink.apache.org/2025/12/04/apache-flink-2.2.0-advancing-real-time-data--ai-and-empowering-stream-processing-for-the-ai-era/
- FLIP-191（统一 Sink 接口/两阶段提交）：https://cwiki.apache.org/confluence/display/FLINK/FLIP-191%3A+Extend+unified+Sink+interface+to+support+small+file+compaction
- Iceberg Flink Connector（DDL/'connector'='iceberg'/catalog 配置）：https://iceberg.apache.org/docs/latest/flink-connector/
- Iceberg Flink Writes（upsert= v2+主键、exactly-once、SinkV2 实验开关）：https://iceberg.apache.org/docs/latest/flink-writes/
- Iceberg Flink 读取配置（streaming/monitor-interval/starting-strategy/snapshot-id/branch/tag）：https://iceberg.apache.org/docs/latest/flink-configuration/
- Iceberg Flink Queries（流批读、tag/branch hint、$snapshots 等元数据表）：https://iceberg.apache.org/docs/latest/flink-queries/
- Iceberg Flink Maintenance（rewriteDataFiles/TableMaintenance/TriggerLockFactory）：https://iceberg.apache.org/docs/latest/flink-maintenance/
- Flink CDC Pipeline Connectors 总览（source/sink 清单、版本兼容表）：https://nightlies.apache.org/flink/flink-cdc-docs-release-3.6/docs/connectors/pipeline-connectors/overview/
- Flink CDC Iceberg Pipeline Connector（自动建表/schema 演进/at-least-once 声明）：https://nightlies.apache.org/flink/flink-cdc-docs-release-3.6/docs/connectors/pipeline-connectors/iceberg/
- Maven Central：iceberg-flink-runtime-1.20/2.0/2.1 元数据：https://repo1.maven.org/maven2/org/apache/iceberg/iceberg-flink-runtime-2.1/
- Spark Structured Streaming 指南：https://spark.apache.org/docs/latest/structured-streaming-programming-guide.html
- Kafka Streams 文档：https://kafka.apache.org/documentation/streams/
- Debezium 官网：https://debezium.io/
