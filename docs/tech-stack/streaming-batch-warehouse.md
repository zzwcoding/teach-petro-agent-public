# 实时数仓 · 离线数仓 · 流批一体（数仓范式 × Data Agent）

> 技术栈调研 · slug: streaming-batch-warehouse · 关联: [flink.md](flink.md)（流批一体的执行引擎）· [minio-iceberg.md](minio-iceberg.md)（统一湖存储）· [dataagent-stack-map.md](dataagent-stack-map.md)（栈合成篇）· 适用场景：国产化内网环境 · 假想业务：Petro-Agent 油田智能平台 · 调研日期：2026-09-24 · 论断以官方/权威源为准，逐条注源

## 使用场景

### 离线数仓：T+1 批处理，"回溯重跑"是招牌

- **是什么**：数据按天批量抽取→加工→供数，延迟 T+1 起步；技术底座 Hive/Spark/HDFS（Hive 官方定位："a distributed, fault-tolerant data warehouse system…Built on top of Apache Hadoop"，[hive.apache.org](https://hive.apache.org/)），加工编排靠调度系统管依赖。
- **经典分层**（阿里 OneData 官方规范：ODS 数据引入层→CDM 公共层（DWD 明细+DWS 汇总）→ADS 应用层，[阿里云文档](https://help.aliyun.com/zh/maxcompute/data-warehouse-layered-architecture-design-specifications)）：

| 层 | 职责一句话 |
|---|---|
| ODS | 原样落库，业务库/日志的原貌镜像 |
| DWD | 清洗+规范化后的业务过程明细（一事件一行） |
| DWS | 按主题预聚合的公共汇总（宽表/轻芸指标） |
| ADS | 面向应用的最终结果（报表/看板/接口直出） |

- **招牌能力是幂等重跑**：分区覆盖写 + 代码确定性 = 任意历史分区可回溯重算（数据修错了、口径改了都能重刷），这也是它"成熟、便宜、但延迟高"三件套的来源——加工件形态见 [dbt.md](dbt.md)。

### 实时数仓：秒/分钟级，Lambda 与 Kappa 两种组织法

- **Lambda 架构**（一手出处：Nathan Marz《How to beat the CAP theorem》，2011，[nathanmarz.com](https://nathanmarz.com/blog/how-to-beat-the-cap-theorem.html)）：数据不可变 + 全量重算 = 批层（batch layer，"写入要几小时才进查询"），为补新鲜度并行一条实时层（speed layer，Storm/Cassandra 处理"最近几小时"），服务时合并两路视图；**正确性铁律是"实时层的产出最终被批层覆盖"**（原文："everything the realtime layer computes is eventually overridden by the batch layer"）。
- **双链路的代价**（一手出处：Jay Kreps《Questioning the Lambda Architecture》，O'Reilly Radar 2014-07-02，[原文](https://www.oreilly.com/radar/questioning-the-lambda-architecture/)）："你要把同一套转换逻辑写两遍，一遍在批系统、一遍在流系统"；而"维护两套复杂分布式系统产出相同结果的代码，就跟看上去一样痛苦"——这正是**口径漂移的温床**（本文 DataAgent 节的关键伏笔）。
- **Kappa 架构**（同篇 Kreps 提出）：砍掉批层只留流链路，"一切皆流"；修正历史=把 Kafka 日志保留足够长，用第二个流作业**从头重放**生成新结果表再切换。现实约束：历史重算吃 Kafka 保留与算力（数据越老越贵），流作业状态迁移/版本升级要自己兜底。
- **实时数仓自身的代价**：双流 join 要在状态里缓存两侧 until 水位匹配、状态 TTL 与乱序容忍是工程调参主战场（状态与水位线机制见 [flink.md](flink.md) 核心能力面）。

### 流批一体：三条路线分清

- **① 计算引擎流批一体**：Flink Table API/SQL 官方表述——"queries specified in either interface…**specify the same result regardless of whether the input is continuous (streaming) or bounded (batch)**"（同一引擎同一语义，[Flink Table Overview](https://nightlies.apache.org/flink/flink-docs-release-2.3/docs/dev/table/overview/)）；即 Lambda 的两条链路收敛为同一套 SQL 的两种运行模式。
- **② 存储流批一体（湖表统一）**：一张湖表既接流写也接批读。Iceberg 官方定位是 "the open table format for analytic datasets / a high-performance format for huge analytic tables"（[iceberg.apache.org](https://iceberg.apache.org/)），流写批读形状见 [minio-iceberg.md](minio-iceberg.md)；**Paimon** 走得更远——官方原文："Innovatively **combines lake format and LSM structure, bringing realtime streaming updates into the lake architecture**"，主键表支持高频流式更新、"Real-time query within 1 minute"，内置 merge engine（deduplicate/partial-update/aggregate/first-row）与 changelog 产出（[paimon.apache.org](https://paimon.apache.org/)）——出身 Flink Table Store，2024-04-16 从孵化器毕业成 TLP（[ASF 公告](https://news.apache.org/foundation/the-apache-software-foundation-announces-apache-paimon-top-level-project)）。
- **③ 服务流批一体（一个系统吃两种负载）**：Doris 官方定位 "an open-source, **real-time** database for modern analytics and AI"，"Ingest from Kafka and database CDC with **second-level freshness**"，且 "Query Iceberg, Delta Lake, and Hudi tables in place, with no data copy"（[doris.apache.org](https://doris.apache.org/)）；StarRocks 官方 "**Open Source High-Performance Data Warehouse** / Sub-Second Analytics for End Users and **Agents** at Scale"，承诺秒级更新不伤查询（[starrocks.io](https://www.starrocks.io/)）——即"准实时入 + 交互查询出"在一个引擎里闭环。

### 为什么 DataAgent 需要（全文重点）

- **① 新鲜度光谱决定 Agent 能答什么**："上个月产量完成率"离线面 T+1 就能答；"今天上午的注入量"必须实时面；**答不了的一律声明延迟档位而不是编**——数仓范式给了 Agent 每个"能答口径"的时间边界。
- **② 口径流批一致是 Agent 的一致性底线**：Lambda 双链路两套代码是最经典的口径漂移温床——Agent 引用实时数与离线数打架，比"查不到"更糟（用户看到两个版本的事实）；流批一体 = 一套代码一套口径，语义层只对一张表（衔接 [cube-semantic-layer.md](cube-semantic-layer.md)：Cube 的 description/ai_context 只需要维护一份）。
- **③ 问数路由要元数据**：把 freshness/延迟档位写进表元数据（语义层注解或湖表属性），Agent 按问题时间窗路由实时面/离线面，超窗声明拒答——路由规则是确定性的，LLM 只负责理解问题。

### 与 Petro-Agent 的对照

- **准实时档是设定好的**：`设定书 §2.1` 行业链路五层"井口传感器（1 万 RTU、秒级采样）→ Modbus → 边缘计算 → 实时库（InfluxDB 类）→ **ETL 入数据仓库（15 分钟级闭环调度）**"——15 分钟闭环就是项目设定里的准实时入仓档；项目设定压成"井口→实时库→生产库（8 表）→平台"。
- **离线数仓是主体**：`设定书 §2.2`/附录 A 的 8 表以日粒度为主（oil_production_daily 一井一日）、月粒度兜底（monthly_settlement）——这就是一个微缩离线数仓。
- **实时域唯一锚**：`设定书 §4` 规则 11"传感器零值 2 小时告警"，设定书将其标注为"**实时域规则**"——项目设定的秒级传感器面只留了这一个钩子。
- **"两条链路打架"的行业活案例**：`设定书 §8` 事故 13——"月度汇报上产量数与财务口径对不上：**A11 实时加和 vs E7 统计上报差 3.2%**"（`设定书 §3`"一数四源"：同一"油气产量"在 A11 实时加和/A2 上报审核/A5 站库计量/E7 统计上报四系统互不一致）。这就是 Lambda 双链路口径漂移的现实版，也是流批一体存在意义的最佳注脚。
- **剧本消费面**：`设定书 §7` 剧本 1《产量下滑归因》消费的是完成率/递减/措施增油等月度指标，时间窗默认最近 30 天——纯离线面问题。
- **设定与行业的衔接**：本项目是 8 表日粒度，但 §2.1 的 15 分钟闭环与 §8 事故 13 构成"实时/离线之辨"的两个真实抓手——一个对应准实时入仓怎么做，一个对应双链路数字为什么打架、语义层怎么仲裁。

## 核心能力面

- **离线链路三件套**：分层（上表）+ 调度依赖（DAG 保证先后）+ 幂等重跑（分区覆盖写）。
- **Lambda 组件分工**：Kafka 削峰与回放缓冲 → Flink 增量算准实时视图 → OLAP serving（Doris/StarRocks 类）承接高并发查询；批层夜间用湖+dbt 修正。代价：两套代码、两份运维、一份对账作业（见模式 1）。
- **Kappa 现实约束**：重算窗口受 Kafka 保留期约束（数据越老重放越贵）；流作业状态向后兼容要自己管理；强修正语义（如财务重述）不如批层覆盖写干脆。
- **流批一体三路线官方表述**：计算引擎=Flink 同结果表述（引文见上）；存储=Paimon "lake format + LSM"原文 vs Iceberg "high-performance format for huge analytic tables"；服务=Doris "second-level freshness"/StarRocks "second-level data updates and deletes without impacting query performance"。
- **Paimon vs Iceberg（官方口径之辨）**：Paimon 把"高频流式更新+分钟级可见"写进设计目标（LSM 主键表、merge engine、changelog）；Iceberg 把"海量分析表格式"当定位，更新走 copy-on-write/merge-on-read 的等值删除路径（见 [minio-iceberg.md](minio-iceberg.md) V2/V3 说明）——**秒级 upsert 高频更新场景 Paimon 占优，大规模分析批读生态 Iceberg 占优**；Flink CDC 两侧都有官方 pipeline sink（[flink.md](flink.md)）。

## 典型用例模式

### 模式 1：Lambda 双链路 + 每日对账（图式）

```text
业务库(8 表)──CDC──▶ Flink ──▶ Doris/StarRocks 准实时面（15 分钟档，§2.1）
   ‖                        └──▶ Paimon/Iceberg 湖表（流写，服务次晨补数）
   └────────批线────────▶ 湖仓 ODS→DWD→DWS→ADS（dbt T+1 修正面，覆盖写幂等重跑）
每日对账作业：实时面 ADS ↔ 离线 ADS 逐指标比对（§4 规则 12 物质平衡式勾稽）
  ├─ 偏差≤阈值：以离线面为准，实时面被"覆盖"（Lambda 正确性铁律）
  └─ 偏差>阈值：告警进问题单（§4 质量闭环），口径仲裁交语义层（§8 事故 13 的教训）
```

### 模式 2：Agent 问数路由（freshness 档位 → 三出口）

```python
# 伪代码形状（元数据来源：湖表属性/语义层注解，见 minio-iceberg.md / cube-semantic-layer.md）
CATALOG = {  # 表元数据带 freshness 档位（示例：8 表 + 实时面）
  "dws_completion_monthly": {"freshness": "T+1",   "window": ("2019-01", "yesterday")},
  "rt_injection_15min":     {"freshness": "15min", "window": ("now-7d", "now-15min")},  # §2.1 闭环档
}

def route_question(table, as_of: date) -> str:
    m = CATALOG[table]
    lo, hi = m["window"]
    if not (lo <= iso(as_of) <= hi):
        return "REFUSE:超出该表可答时间窗"          # 出口③：声明边界，不编数
    if m["freshness"] == "T+1" and as_of == today:
        return "DEFER:离线面 T+1，请明日查询或改用实时面"  # 出口②：声明延迟档
    return f"ANSWER:{'rt' if m['freshness']!='T+1' else 'offline'} 面查询"  # 出口①
# 关键：路由是确定性代码，LLM 只解析"用户问的哪张表、哪个时间窗"
```

## 选型差异（一句话版）

- **Lambda vs Kappa vs 流批一体**：Lambda 双链路换"实时有数+批层兜正确性"、代价是两套代码必然漂移（[Marz 2011](https://nathanmarz.com/blog/how-to-beat-the-cap-theorem.html)/[Kreps 2014](https://www.oreilly.com/radar/questioning-the-lambda-architecture/)）；Kappa 只留流链路、代价是历史重算与状态运维；流批一体把两条链路收敛成一套 SQL/一张湖表，是当前主流叙事。
- **Hive 数仓 vs 湖仓**：Hive 是"建在 Hadoop 上的分布式容错数仓"（SQL+托管表，[hive.apache.org](https://hive.apache.org/)）；湖仓用开放表格式把表语义架到 S3/MinIO 对象存储上，引擎无关且能接流（[minio-iceberg.md](minio-iceberg.md)）。
- **Paimon vs Iceberg**：高频流式更新/分钟级可见选 Paimon（LSM 主键表是设计目标）；大规模分析批读与多引擎生态选 Iceberg——Flink CDC 对两者都有官方 sink，可并存（[paimon.apache.org](https://paimon.apache.org/)、[iceberg.apache.org](https://iceberg.apache.org/)）。
- **Doris vs StarRocks vs ClickHouse（实时 serving）**：Doris 自称 "real-time database for modern analytics and AI"（Kafka/CDC 秒级新鲜度 + 原地查湖）（[doris.apache.org](https://doris.apache.org/)）；StarRocks 主打"高性能数仓、面向终端用户与 **Agents** 的亚秒分析"（[starrocks.io](https://www.starrocks.io/)）；ClickHouse 自称"最快最省资源的实时数据仓库"（列存、单表极致吞吐见长，[clickhouse.com](https://clickhouse.com/)）。

## 版本锚点

（查询日期：2026-09-24；Flink/Iceberg 版本见 [flink.md](flink.md)/[minio-iceberg.md](minio-iceberg.md)，不重复）

- **Apache Paimon**：最新稳定 release **2.0.0**（2026-08-07，[GitHub Releases](https://github.com/apache/paimon/releases)）；2.1.0 在 RC 阶段（[tags](https://github.com/apache/paimon/tags)）；官方文档版本线 master/2.0/1.4/1.3（[docs](https://paimon.apache.org/)）。
- **Apache Doris**：4.1.4（2026-09-07，[GitHub Releases](https://github.com/apache/doris/releases)）。
- **StarRocks**：社区 release tag 4.1.4（[GitHub tags](https://github.com/StarRocks/starrocks/tags)）。
- **ClickHouse**：v26.9.2.8-stable 与 v26.8.11.7-lts（2026-09-22，[GitHub Releases](https://github.com/ClickHouse/ClickHouse/releases)）。
- **证据不足/如实说明**：① Kreps 原文发布在 **O'Reilly Radar**（2014-07-02），不是坊间常引的"LinkedIn 博客"（Kreps 的 LinkedIn 名篇是 2013《The Log》）；O'Reilly 页面对爬虫返回 403，但原文在站内可读，本文件引文经全文抓取核对。② ODS/DWD/DWS/ADS 四层是阿里 OneData 规范的行业通行化（阿里云官方文档按 ODS/CDM(DWD+DWS)/ADS 表述），"四层"叫法本身无单一国际标准，引用时注明出处体系即可。③ `rt_injection_15min`/`dws_completion_monthly` 等路由示例表名是本文件为演示虚构的表名，业务事实仍以 `设定书 §2.1/§2.2` 为准。

## 信源列表

- Nathan Marz《How to beat the CAP theorem》（Lambda 架构概念源头，2011）：https://nathanmarz.com/blog/how-to-beat-the-cap-theorem.html
- Jay Kreps《Questioning the Lambda Architecture》（Kappa 架构提出文，O'Reilly Radar 2014-07-02）：https://www.oreilly.com/radar/questioning-the-lambda-architecture/
- Flink Table API/SQL Overview（流批同结果官方表述）：https://nightlies.apache.org/flink/flink-docs-release-2.3/docs/dev/table/overview/
- Apache Paimon 官网（lake format + LSM、主键表实时更新、merge engine）：https://paimon.apache.org/
- ASF：Paimon 毕业为顶级项目公告（2024-04-16）：https://news.apache.org/foundation/the-apache-software-foundation-announces-apache-paimon-top-level-project
- Paimon GitHub Releases：https://github.com/apache/paimon/releases
- Apache Iceberg 官网（"the open table format for analytic datasets"）：https://iceberg.apache.org/
- Apache Doris 官网（real-time database、second-level freshness、原地查湖）：https://doris.apache.org/
- StarRocks 官网（面向终端用户与 Agents 的亚秒分析、秒级更新）：https://www.starrocks.io/
- ClickHouse 官网（fastest/most resource efficient real-time data warehouse）：https://clickhouse.com/
- Apache Hive 官网（分布式容错数仓、基于 Hadoop）：https://hive.apache.org/
- 阿里云《数据仓库分层架构设计规范》（OneData：ODS→CDM(DWD/DWS)→ADS）：https://help.aliyun.com/zh/maxcompute/data-warehouse-layered-architecture-design-specifications
- 阿里云 DataWorks 湖仓一体文档（ODS/DWD/DWS/ADS 一份数据同服批流）：https://www.alibabacloud.com/help/en/dataworks/user-guide/data-lakehouse-architecture
- Doris GitHub Releases：https://github.com/apache/doris/releases
- StarRocks GitHub tags：https://github.com/StarRocks/starrocks/tags
- ClickHouse GitHub Releases：https://github.com/ClickHouse/ClickHouse/releases
- 本仓关联篇：[flink.md](flink.md)、[minio-iceberg.md](minio-iceberg.md)、[cube-semantic-layer.md](cube-semantic-layer.md)、[dbt.md](dbt.md)、[duckdb.md](duckdb.md)、[dataagent-stack-map.md](dataagent-stack-map.md)
