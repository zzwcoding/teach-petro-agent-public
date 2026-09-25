# 设计稿 DP5：查询执行适配（dp5 QueryRunner）—— 同一 StructuredQuery 三后端同构执行

> **数据面设计稿**（来源 prd-data-plane D5）· 模块卡 [specs/data-plane/modules.md](../specs/data-plane/modules.md)「dp5 执行适配 QueryRunner」 · 断言 [specs/walkthroughs-data-plane.md](../specs/walkthroughs-data-plane.md) D5 节（DP-W-D5-1~4） · 状态：**已兑现（自主档）**
> **红线声明**：零可运行代码，全部代码块为**伪代码**（块首标注"伪代码（走查，非代码）"）；公开签名**逐字取自模块卡 dp5 卡**三签名（run / sandbox_query / engines）；函数体=输入输出契约+主干判断；三后端 API/配置形状**逐字照分册**——DuckDB Python API/Arrow 签名（`to_arrow_table()` 新签名，`fetch_arrow_table` 已 deprecated）照 [duckdb.md](../docs/tech-stack/duckdb.md)，Trino/StarRocks 接入形状照 [minio-iceberg.md](../docs/tech-stack/minio-iceberg.md)（StarRocks path-style 必设 true 官方原话），StarRocks 官方叙事照 [streaming-batch-warehouse.md](../docs/tech-stack/streaming-batch-warehouse.md)——**分册没有的参数名不写**。
> **边界声明**（modules.md 边界规则表第 1 行）：**dp5 绕过 dp1 直连 S3 SDK / 引擎原生文件访问=禁止（无例外）**——DuckDB 沙箱的数据经 `dp1.scan` 进程（对象访问面收敛 LakeStore）；Trino/StarRocks 路径 dp5 只下发 SQL，引擎侧对象访问由引擎经与 dp1 同一份 catalog 配置承担，dp5 代码零 AK/SK、零 `s3://` 路径。依赖 dp1+dp4（StructuredQuery 定义在 dp4）+dp9（依赖图 `dp9 ← dp5, dp8`）；**闸前置**：check_join 在 run 调用链第一步——dp8 面向 Agent、dp5 是执行门面，**闸在两条调用链都前置**（与 [DP9 设计稿](DP9-治理控制面.md)注入点位图④"引擎不背权限的债"一致）。Seam=`EngineAdapter`（duckdb/trino/starrocks 三实现）；Adapter=`RecordedEngine`（固定结果回放，测试不真连引擎）。
> **一句话**：统一结构化查询的执行门面——同一 StructuredQuery 按档位路由到 DuckDB/Trino/StarRocks，返回 Arrow + 快照号 + 统计（模块卡职责原话）；不做引擎运维与调优（D5"不做什么"）。

## 实现清单

- [x] `DP-W-D5-1` 同一 StructuredQuery 配 duckdb/trino 两后端同构执行：同 snapshot_id 透传、同 stats 结构，方言差异封在 adapter 内（EngineAdapter 三实现，StarRocks 给配置不给全伪代码）✅ **走查 §1**（分派主干）+ **§2**（duckdb 侧）+ **§3**（trino 侧）+ **§4**（starrocks 形状）
- [x] `DP-W-D5-2` S1 沙箱：dp1 scan→Arrow→DuckDB 进程内聚合，零服务端依赖；衔接 PyIceberg `to_duckdb` 链路（duckdb.md）✅ **走查 §2**
- [x] `DP-W-D5-3` 成本护栏：超 limit 拒绝或降级采样并显式声明，不静默全表扫 ✅ **走查 §5**
- [x] `DP-W-D5-4` snapshot_id 透传：Result.snapshot_id 与请求一致 ✅ **走查 §1**（契约）+ **§2/§3**（两侧落地）
- [x] 规模矩阵 dp5 行：S1 DuckDB 进程内（为何免服务端）/ S2 Trino 默认（PRD §9-3 理由）或 StarRocks + DuckDB 沙箱末端 / S3 多引擎并存；分区/谓词下推语义 ✅ **走查 §6**
- [x] 取舍 ≥4：DuckDB vs Polars vs ClickHouse vs Trino / Trino vs StarRocks（PRD §9-3 + 国产化上位路径）/ StarRocks "Sub-Second Analytics for Agents" 叙事与服务流批一体 / S1 免服务端 / 闸前置不在引擎里 ✅ **取舍节**
- [x] 锚点对照：duckdb.md / minio-iceberg.md / streaming-batch-warehouse.md / cube-semantic-layer.md → 断言 ID ✅ **锚点对照**

---

## 伪代码走查：`app/data_plane/query_runner.py`

> **对象与职责**：`QueryRunner` 门面（闸前置 → 护栏预检 → 适配器分派）× `EngineAdapter` 三实现（duckdb/trino/starrocks）；StructuredQuery 入参形状=dp4 四件套 measures/dimensions/timeDimensions/filters（[cube-semantic-layer.md](../docs/tech-stack/cube-semantic-layer.md)："这就是 Agent 要生成的全部形状"）。
> **示例**：指标问数走 `ods.oil_production_daily`（设定书 §2.2，规范列 well_id/prod_date/oil_output——附录 A）；走查规格 D5-2 的 "well_daily 表" 是井日产明细的示意记法（duckdb.md 模式 1 同名仅示意，非设定书表名），本设计稿统一用设定书表名。

### §1 `run`——执行门面主干（DP-W-D5-1 / D5-4 契约 / D5-3 闸位）

```text
伪代码（走查，非代码）——签名逐字取自 dp5 卡

def run(self, query: StructuredQuery, snapshot_id: int | None = None) -> QueryResult:
    # 契约：输入=结构化查询（dp4.build_query 产物）+ 快照号（None=当前快照）
    #       输出=QueryResult(arrow, snapshot_id, stats(rows_scanned, bytes, engine))——三后端同构
    decision = governance.check_join(query)            # ① 闸前置（dp9 卡签名）：join 白名单默认拒绝，
    if not decision.allowed:                           #    在 SQL 生成/下发之前就拦（判定对象=结构化形状上的 join 边）
        raise QueryRejected(decision.violated_edges)   #    拒绝带越界边（设定书 §5：须经 intermediate 双键+时间容差）
    #    dp8 链已查过、dp5 为何再查：dp7.replay 与未来调用方不经 dp8——闸在每条进引擎的链上都前置，
    #    白名单同一份 YAML 同源判定，不双标（DP9 设计稿："引擎不背权限的债，S1 DuckDB 本就无行级安全"）
    guard = self._cost_guard(query)                    # ② 成本护栏预检（§5：超限拒绝或降级采样声明）
    adapter = self._route()                            # ③ 档位路由：配置选中的交互引擎（PRD §9-3 二选一）；
                                                       #    S1 只注册 duckdb——换档只换配置，本主干零改动
    result = adapter.execute(query, snapshot_id, guard)  # ④ 方言差异封在 adapter 内（§2/§3/§4）
    return QueryResult(arrow=result.arrow,
                       snapshot_id=snapshot_id if snapshot_id is not None else result.snapshot_id,
                                                          # ⑤ 透传：请求带了快照号就原样回填（D5-4 一致性）
                       stats=Stats(rows_scanned=result.rows_scanned,   # 扫描行数/字节/引擎如实回填——
                                   bytes=result.bytes, engine=adapter.name))  # 声明与数字对得上，不静默改数
```

### §2 `sandbox_query` + `EngineAdapter.duckdb`——S1 进程内链路（DP-W-D5-2 / D5-1 duckdb 侧）

```text
伪代码（走查，非代码）——链路形状照抄 duckdb.md 模式 1（PyIceberg to_duckdb 源码形状=register(name, to_arrow())）

def sandbox_query(self, table: str, pred: str, fields: tuple[str, ...], limit: int) -> ArrowTable:
    # 契约：输入=表名 / 业务谓词 / 字段子集 / 行数上限；输出=ArrowTable——进程内试算，零服务端依赖（D5-2）
    arrow = self._lake.load_table(table).scan(pred=pred, fields=fields,   # ① dp1 门面：裁剪在扫描规划期完成
                                              snapshot_id=None, limit=limit)  # （谓词/列/limit 下推，DP1 §4）
    con = duckdb.connect()                    # ② 每会话独立连接：官方警告全局 duckdb.sql 非线程安全，
                                              #    多线程须各自 duckdb.connect()（duckdb.md Python API 页）
    con.register("t", arrow)                  # ③ 注册 Arrow 为虚拟视图（=to_duckdb 的源码形状；替换扫描
                                              #    免注册是另一路，显式 register 更可走查）
    return con.sql("SELECT * FROM t LIMIT ?",
                   [limit]).to_arrow_table()  # ④ 新 Arrow 签名——fetch_arrow_table 已 deprecated，
                                              #    本设计稿不用旧名（duckdb.md 转换页原话）
    # 边界自查：沙箱**不**用 httpfs 直扫 s3://（duckdb.md 虽有 ENDPOINT+URL_STYLE 'path' 现成形状）——
    # 边界规则第 1 行"不绕 dp1"无例外；数据经 dp1.scan 进内存，进程内零落盘、崩了随进程回收

class DuckDbAdapter(EngineAdapter):           # run() 的 S1 实现——与沙箱同一条 dp1→Arrow→DuckDB 链
    name, tier = "duckdb", "进程内沙箱"
    def execute(self, query, snapshot_id, guard):
        arrow = self._lake.load_table(权威表锚(query)).scan(   # 数据照样经 dp1（对象访问面不因引擎改变）
            pred=谓词(query), fields=列(query),
            snapshot_id=snapshot_id, limit=guard.effective_limit)  # 快照语义由 PyIceberg scan 承接（DP1 §4
        con = duckdb.connect(); con.register("t", arrow)           # 按快照读不脏读）——D5-4 的 duckdb 侧落地
        return con.sql(translate(query)).to_arrow_table()          # translate：四件套→SELECT/GROUP BY/WHERE（§3 同主干）
```

### §3 `EngineAdapter.trino`——SQL 下推（DP-W-D5-1 trino 侧 + snapshot 透传）

```text
伪代码（走查，非代码）——接入配置形状逐字照 minio-iceberg.md「引擎/仓库接入形状·Trino」

class TrinoAdapter(EngineAdapter):
    name, tier = "trino", "交互引擎（S2 默认，PRD §9-3）"
    def execute(self, query, snapshot_id, guard):
        sql = self.translate(query, snapshot_id, guard)   # ① 翻译主干（下）：方言差异只活在 adapter 里
        rows = self._client.sql(sql)                      # ② SQL 下推集群算（duckdb.md 定位差原话：
        return self.to_arrow(rows)                        #    "SQL 下推到集群算"），列式结果转 Arrow
    def translate(self, query, snapshot_id, guard) -> str:
        # 主干（设计演绎骨架）：SELECT dims, agg(measures) FROM 权威表锚
        #   WHERE timeDimensions.dateRange ∧ filters GROUP BY dims LIMIT guard.effective_limit
        # FROM 锚=dp4 权威 SourceRef（一数四源仲裁，DP-W-D4-5）——dp5 不发明表名、不自造聚合语义
        if snapshot_id is not None:
            sql += 快照钉版子句     # 语义=minio-iceberg.md"time travel 按快照读回"（D5-4 trino 侧）；
                                    # 具体子句属 Trino 方言、分册未收录不写——对照锚=duckdb.md
                                    # ATTACH 后 AT (VERSION => SNAPSHOT_ID)
        return sql

# Trino catalog 接入配置（与 dp1 S2 同一份 REST catalog；参数名=minio-iceberg.md 原词）：
#   connector.name=iceberg
#   iceberg.catalog.type=rest            # hive_metastore/glue/jdbc/rest/nessie 等（分册原词清单）
#   fs.s3.enabled=true
#   s3.endpoint=http://minio.petro.internal:9000
#   s3.path-style-access=true
#   s3.aws-access-key=***   s3.aws-secret-key=***
```

### §4 `EngineAdapter.starrocks`——external catalog 配置形状（设计范围：给配置不给全伪代码）

```text
配置形状（走查，非代码）——逐字照 minio-iceberg.md「引擎/仓库接入形状·StarRocks」

CREATE EXTERNAL CATALOG iceberg_lake PROPERTIES (
    "type" = "iceberg",
    "iceberg.catalog.type" = "rest",                  -- rest|hive|glue|jdbc（分册原词）
    "aws.s3.endpoint" = "http://minio.petro.internal:9000",
    "aws.s3.enable_path_style_access" = "true",       -- 官方原话："For MinIO, you must set the value to true"
    "aws.s3.access_key" = "***",  "aws.s3.secret_key" = "***");
-- v4.0 起 REST catalog 支持 vended credentials（分册原词）——S3 档衔接 dp9.vend_credentials 短期凭证
-- 选型位：与 Trino 接口同构、适配器层二选一（PRD §9-3）；适配器实现与 §3 同主干，仅方言形状不同
```

### §5 成本护栏——超 limit 拒绝或降级采样并显式声明（DP-W-D5-3）

```text
伪代码（走查，非代码）

LIMIT_GUARD = 100_000        # 走查规格 D5-3 示例档"如 10 万行"——设计演绎常量，非业务事实

def _cost_guard(self, query) -> Guard:
    # 契约：输入=StructuredQuery 携带的行数上限 query.limit（D5-3 给定形状；四件套之外的操作字段，设计演绎）
    #       输出=Guard(effective_limit, mode)，mode ∈ {"pass","reject","sample"}
    if query.limit <= LIMIT_GUARD:
        return Guard(query.limit, "pass")              # 护栏内放行
    return self._policy.on_exceed(query)               # 超限两出口，**不静默全表扫**：
    #   出口 A 拒绝：报表/导出类一次性查询 → raise QueryRejected("limit 超成本护栏，请缩小时间窗或分组粒度")
    #   出口 B 降级采样：探索性试算 → effective_limit 压到采样上限执行（dp1 scan limit 承接），
    #     QueryResult 附显式声明（设计演绎字段 guard_note="已降级采样 N 行，非全量"）；
    #     stats.rows_scanned 如实回填——声明与数字对得上。
    # 纪律同源：dp6 拒答"声明边界不编数"、dp7 快照过期显式报错，同一诚实框架在 dp5 的投影
```

### §6 `engines` + 三档切换——矩阵 dp5 行（换的是适配器，不是接口）

```text
伪代码（走查，非代码）

    def engines(self) -> list[EngineInfo]:
        # 契约：输出=已注册引擎与角色档位——Agent 可问"现在能路由到哪些引擎"
        return [EngineInfo(name=a.name, tier=a.tier) for a in self._adapters]
```

| 档位 | 矩阵原词 | 路由形状与理由 |
|---|---|---|
| S1 边缘档 | DuckDB 进程内 | 只注册 duckdb（§2）；免服务端理由见取舍 4；sandbox_query 即测试形态（RecordedEngine 回放） |
| S2 平台档 | Trino（默认）/StarRocks + DuckDB 末端 | 交互引擎二选一（PRD §9-3：默认 Trino，理由见取舍 2）；DuckDB 留任沙箱末端——大表聚合下推集群、试错查询留在进程内 |
| S3 集团档 | 多引擎 | 同一 EngineAdapter 接口多实现并存、按域路由（各域引擎共享同一 catalog 面）；闸与护栏照旧前置 |

**分区/谓词下推语义**：DuckDB 沙箱——裁剪在 PyIceberg 扫描规划期完成（duckdb.md 模式 1 原话"裁剪在 PyIceberg 规划期完成"），DuckDB 只见裁剪后的 Arrow；Trino/StarRocks——业务谓词进 SQL WHERE 由引擎下推，Iceberg **hidden partitioning**"用户写业务谓词，裁剪由格式代劳"（minio-iceberg.md Table Spec）。两侧裁剪依据的可解释信源同源：dp1 `TableRef.metrics` 的列级 min/max/null（DP1 §6）。

---

## 取舍

1. **DuckDB vs Polars vs ClickHouse vs Trino（duckdb.md 一句话版）**：Polars 是"DataFrame 的分析查询引擎"，DuckDB 是完整 SQL 数据库（DDL/事务/扩展/持久化）——选型看队伍主语言是 DataFrame 链还是 SQL 链；ClickHouse 以服务端集群形态扛高并发实时分析，DuckDB 单机进程内、贴着分析者跑；Trino 是分布式联邦引擎"查询跨一个或多个异构数据源"，DuckDB 把数据拉到本地算。→ **数据面分工：沙箱/末端归 DuckDB，跨源大表交互归 Trino/StarRocks**，二者共用同一套 Iceberg/MinIO 底座。
2. **Trino vs StarRocks（PRD §9-3）**：S2 交互引擎**默认 Trino**——生态对 REST catalog/dbt-trino 更顺（dbt-trino 是 dp3 S2 形状；Cube 官方数据源清单有 Trino、**StarRocks 完全未列**，语义层 S2 默认 Cube 与决策 4 自洽）；**国产化叙事时 StarRocks 上位**（引擎定位与官方 Agent 叙事注源见取舍 3；其许可证/授权条款未入调研分册，本设计稿不引申）——两者接口同构，适配器层二选一（PRD §9-3 原话），切换只动 §3/§4 的 adapter 注册。
3. **StarRocks 官方叙事与服务流批一体**：官方定位 "Open Source High-Performance Data Warehouse / **Sub-Second Analytics for End Users and Agents at Scale**"，"second-level data updates and deletes without impacting query performance"（streaming-batch-warehouse.md）——即流批一体三路线的**③服务流批一体**："准实时入 + 交互查询出"在一个引擎里闭环。对照 Lambda 双链路"同一套转换逻辑写两遍"的口径漂移温床（Kreps 原话）与事故 13（A11 实时加和 vs E7 统计上报差 3.2%，设定书 §8）：单引擎闭环是"口径流批一致"的工程答法——本设计稿讲了不默认选（决策 3），它给 Trino 路线留一个真实的上位挑战者。
4. **S1 为何免服务端**：DuckDB 进程内嵌入式——"没有需要安装、升级和维护的 DBMS 服务器软件"，tool 函数里 `import duckdb` 即得完整 OLAP 引擎，无 JDBC/网络往返；单二进制零外部依赖，天然适合油田内网离线部署与国产化环境（duckdb.md）。"Agent 沙箱分析"模式：LLM 一轮对话十几次试错查询在进程内跑——不碰共享库、无连接池排队、崩了随进程回收；数据面 S1 形态（GB 级、兼职运维，PRD §3）不需要为交互查询多养一个集群。
5. **为什么闸（dp9）在调用链前置而不在引擎里**：判定对象是结构化形状上的 join 边——dp4 产物可枚举、零解析成本；等 SQL 下发后让引擎判，是把确定性判定拖进"三引擎三方言"的不确定域（白名单判三遍还可能判不齐），且 S1 DuckDB 本就无行级安全——**引擎不背权限的债**（DP9 设计稿原话）。闸前置一次判定全后端共享，与 dp8 工具面同闸同源（边界规则："dp8 绕过 dp9 放行任何查询/导出=禁止"）；成本护栏同理放 run 预检段——护栏是数据面纪律，不是某一引擎的方言特性。

## 锚点对照

| # | 论断（设计稿出处） | 锚（分册/设定书/PRD/模块卡） | 断言/落位 |
|---|---|---|---|
| 1 | `to_arrow_table()` 新签名；`fetch_arrow_table` 已 deprecated | duckdb.md「结果转换」 | DP-W-D5-2（§2④） |
| 2 | PyIceberg `to_duckdb` 链路：源码形状=register(name, to_arrow()) | duckdb.md「为什么需要②」模式 1 | DP-W-D5-2（§2） |
| 3 | 全局 duckdb.sql 非线程安全，多线程各自 connect | duckdb.md「Python API」 | §2② |
| 4 | 进程内嵌入式/零服务端/沙箱试错叙事、国产化部署适配 | duckdb.md「为什么 Data Agent 需要它」①④ | 取舍 4、§6 S1 |
| 5 | Trino 接入形状：connector.name=iceberg / iceberg.catalog.type / fs.s3.enabled / s3.* 五参数 | minio-iceberg.md「引擎/仓库接入形状」 | DP-W-D5-1（§3） |
| 6 | StarRocks EXTERNAL CATALOG 形状；path-style 官方原话 "For MinIO, you must set the value to true" | minio-iceberg.md 同节 | §4 |
| 7 | StarRocks v4.0+ REST catalog 支持 vended credentials（衔接 dp9） | minio-iceberg.md 同节 | §4 注 |
| 8 | StarRocks "Sub-Second Analytics for End Users and Agents"、秒级更新不伤查询；服务流批一体③ | streaming-batch-warehouse.md「选型差异」「流批一体」 | 取舍 3 |
| 9 | Lambda 双链路口径漂移；事故 13 差 3.2% | streaming-batch-warehouse.md；`设定书 §8` | 取舍 3 |
| 10 | StructuredQuery 四件套="Agent 要生成的全部形状"；Agent 从写 SQL 降级为选口径 | cube-semantic-layer.md「API 面」 | §走查引言、§1 |
| 11 | Cube 官方数据源有 Trino、无 StarRocks | cube-semantic-layer.md「数据源支持面」 | 取舍 2 |
| 12 | hidden partitioning 谓词下推语义；time travel 按快照读回 | minio-iceberg.md（Table Spec） | §6、§3 注 |
| 13 | 默认 Trino + 国产化上位、接口同构适配器二选一 | prd-data-plane §9 决策 3 | 取舍 2、§6 S2 |
| 14 | 不绕 dp1 直连 S3 SDK/引擎原生文件访问（无例外）；dp9 闸前置 | modules.md 边界规则第 1/2 行；DP9 设计稿 | 边界声明、§1①、取舍 5 |
| 15 | 示例表与规范列；S1 形态 GB 级兼职运维 | `设定书 §2.2`/附录 A；prd-data-plane §3 | §走查引言、取舍 4 |

## 预计追问

1. **Trino/StarRocks 自己读 MinIO，算不算 dp5 绕过 dp1？** 不算——边界规则拦的是"dp5 进程拿 S3 SDK/引擎原生文件访问直读对象"；服务端引擎的对象访问由引擎自身经与 dp1 同一份 REST catalog 配置承担（接入形状见 §3/§4），dp5 代码里零 AK/SK、零 `s3://` 路径，表的身份解析锚在 dp4 权威 SourceRef。
2. **snapshot_id 在 Trino 后端怎么钉住？** 语义=time travel"按快照读回"（minio-iceberg.md Table Spec）；具体子句属 Trino 方言、分册未收录不写——走查只断言 D5-4"Result.snapshot_id 与请求一致"，DuckDB 侧有现成对照锚 `AT (VERSION => SNAPSHOT_ID)`（duckdb.md）。
3. **超 limit 为什么不干脆静默采样？** 静默改数是问数脏答之源——D5-3 原话"不静默全表扫"：拒绝路径带原因，采样路径结果附显式声明且 stats.rows_scanned 如实回填；与 dp6 拒答话术、dp7 快照过期显式报错同一条诚实纪律。
4. **duckdb 沙箱为什么不用 httpfs 直扫 s3://（分册有现成形状）？** 形状有（`ENDPOINT`+`URL_STYLE 'path'`）但默认路径不这么走——对象访问面收敛 LakeStore，边界规则第 1 行无例外；裁剪已在 PyIceberg 规划期完成、进程内零落盘，httpfs 形状只作档位对照锚（DP1 §7 注）。
5. **成本护栏的 10 万行哪来的？** 走查规格 D5-3 的示例档（"如 10 万行"），设计演绎常量非业务事实；真实档位随算力与 dp1 metrics 的行数估计配置，出口策略（拒绝 or 采样）由 `_policy` 按查询场景分派。
