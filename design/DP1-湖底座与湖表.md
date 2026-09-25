# 设计稿 DP1：湖底座与湖表（dp1 LakeStore）

> **数据面设计稿**（来源 prd-data-plane D1）· 模块卡 [specs/data-plane/modules.md](../specs/data-plane/modules.md)「dp1 湖底座 LakeStore」 · 断言 [specs/walkthroughs-data-plane.md](../specs/walkthroughs-data-plane.md) D1 节（DP-W-D1-1~4） · 状态：**已兑现（自主档）**
> **语言纪律**：零可运行代码，全部代码块为**伪代码**（块首标注"走查，非代码"）；公开签名**逐字取自模块卡 dp1 卡**；PyIceberg / REST Catalog / S3 的 API 形状**逐字照抄三分册**（minio-iceberg.md / duckdb.md / s3.md）——**分册里没有的细节不写**；业务事实一律注 `设定书 §x`；SQL 为 PostgreSQL 方言设计演绎（金仓≈postgres 近似）。
> **边界红线**（modules.md 边界规则表）：dp1 最底层、零模块依赖，不 import 平台 m1–m21；对象访问面收敛本门面（dp5 不得绕过直连 S3 SDK——第 1 行）；`dp1.append` 仅 dp2/dp3 可调（第 5 行）；dp8 五工具全只读、无湖表写入口。
> **一句话**：给三档规模一个统一的"对象存储 + Iceberg 表"读写门面——**schema/分区/快照是问数 Agent 的确定性信源**，写面收敛进料/加工两管道（D1 节目标原话）；不做 compaction 调优与引擎优化器（D1"不做什么"）。

## 实现清单

- [x] `DP-W-D1-1` 双 catalog 档位：JDBC/REST 只换配置不改调用方（SchemaInfo 四件齐）✅ **走查 §1**（load_catalog 三分派）+ **§2**（schema 四件）+ **§7**（S1/S2 换档对照）
- [x] `DP-W-D1-2` 快照隔离：按旧 snapshot_id 读到 append 前视图 ✅ **走查 §4**（scan 按旧快照读 + 快照号白名单校验不回退）
- [x] `DP-W-D1-3` 谓词+列裁剪 scan，ColumnStats 解释裁剪依据 ✅ **走查 §4**（row_filter/selected_fields/limit 规划期下推）+ **§6**（metrics=列级 min/max/null）
- [x] `DP-W-D1-4` append 写面收敛：越界调用审计 + Agent 零写入口 ✅ **走查 §5**（调用方闸 + 走查自查 grep）
- [x] 规模矩阵 dp1 行：S1 JDBC+单机 MinIO / S2 REST+分布式 / S3 联邦 ✅ **§7 三档规模切换**（逐档一节"档位怎么换"）
- [x] 取舍四条（REST vs JDBC catalog / Iceberg vs Delta·Hudi / S1 免 Hadoop / append 写面收敛）✅ **取舍节**
- [x] 锚点对照：每条关键论断注分册名 / `设定书 §x` ✅ **锚点对照表**

---

## 伪代码走查：`app/data_plane/lake_store.py`

> **对象与职责**：两个公开类——`Catalog`（表寻址 + append 写闸）× `TableRef`（读面：schema / scan / snapshots / metrics）；测试替身=模块卡 Seam 行 `InMemoryLake`（内存 Arrow 表）/ `FakeCatalog`。
> **示例表**：`ods.oil_production_daily`（设定书 §2.2/附录 A；行业编码 `X_OP_PROD_DAILY`→oil_production_daily——§2.2；规范列 well_id/prod_date/oil_output/plan_output/open_days/liquid_output——附录 A v2 兼容声明）；分区规格=`day(prod_date)`（设计演绎形状）——**hidden partitioning**：分区只是表配置，用户写业务谓词、裁剪由格式代劳（minio-iceberg.md Table Spec）。

### §1 `load_catalog`——档位唯一分派点（DP-W-D1-1）

```text
伪代码（走查，非代码）——签名逐字取自 dp1 卡；入口/属性形状照抄 minio-iceberg.md

def load_catalog(backend: Literal["jdbc","rest","federated"], **cfg) -> Catalog:
    # 契约：输入=档位 + 配置（uri / credential / warehouse / s3 端点四件）；输出=Catalog 门面
    #       换档 = 只换这一层的配置，调用方代码零改动（D1-1 的"只换配置不改调用方"）
    if backend == "jdbc":            # S1 档
        # Iceberg catalog 形态清单含 JDBC（分册「Catalog 形态」）；PyIceberg 侧对应 SQL catalog：
        # 分册「PyIceberg 关键 API」原词 SQL(Postgres/SQLite)
        return SqlCatalog("petro", uri=cfg.uri, warehouse=cfg.warehouse, **s3_props(cfg))
    if backend == "rest":            # S2 档：Polaris / Nessie 等 REST catalog
        # 入口形状照抄分册：load_catalog("default", type="rest", uri=..., credential=...)
        return load_catalog("petro", type="rest", uri=cfg.uri, credential=cfg.credential,
                            warehouse=cfg.warehouse, **s3_props(cfg))
    if backend == "federated":       # S3 档：多 REST 目录联邦——按命名空间路由到各域目录
        return FederatedCatalog({ns: load_catalog("petro", type="rest", **route)
                                 for ns, route in cfg.routes.items()})
    raise ValueError(f"未知档位 backend={backend!r}")     # 捣乱输入：档位白名单外直接拒绝

def s3_props(cfg) -> dict:           # 对象存储访问面统一注入（属性名=分册 S3FileIO 属性常量原词）
    return {"s3.endpoint": cfg.s3_endpoint,               # 单机/分布式 MinIO、国产 OSS/OBS 皆此一件
            "s3.path-style-access": "true",               # MinIO 必须 path-style
            "s3.access-key-id": cfg.ak, "s3.secret-access-key": cfg.sk}
# 错误路径：缺 uri/warehouse → 配置错误当场报；catalog 连不上 → 底层异常原样上抛不吞（不静默降级内存版）
```

> path-style 三分册对齐：Iceberg S3FileIO `s3.path-style-access`（minio-iceberg.md）；StarRocks 侧官方原话"For MinIO, you must set the value to true"（minio-iceberg.md）；DuckDB 侧 `URL_STYLE 'path'`（duckdb.md）——同一语义三条路，档位换了参数名换、纪律不换。

### §2 `Catalog.load_table` / `TableRef.schema`——确定性信源（DP-W-D1-1）

```text
伪代码（走查，非代码）——schema 四件形状照抄 minio-iceberg.md「模式 1」tool_describe

class Catalog:
    def load_table(self, name: str) -> TableRef:
        # 契约：输入=全限定表名（"ods.oil_production_daily"）；输出=TableRef 读面句柄
        # 错误路径：表不存在 → NoSuchTableError 原样上抛（不返回空壳句柄——静默空表是问数脏答之源）
        return TableRef(self._impl.load_table(name))      # PyIceberg：catalog.load_table("db.tbl")

class TableRef:
    def schema(self) -> SchemaInfo:                       # Agent 问数的确定性信源（模块卡原话）
        # 契约：输出=列名/类型/注释/分区规格**四件齐**——LLM 拿机器可读 schema，不靠口述数据字典
        t = self._t
        return SchemaInfo(
            columns=[(f.name, str(f.field_type)) for f in t.schema().fields],  # 列名/类型
            comment=t.schema().metadata,                                       # 注释=口径说明载体
            partition_spec=str(t.spec()),                                      # 分区规格
            current_snapshot=t.current_snapshot().snapshot_id)                 # 口径锚点
```

### §3 `TableRef.snapshots`——快照清单（dp7 审计的候选集）

```text
伪代码（走查，非代码）

    def snapshots(self) -> list[SnapshotInfo]:
        # 契约：输出=快照清单（快照号 + 摘要）——dp7"按同快照重放"从这里挑快照
        out = []
        for s in self._t.snapshots:                       # PyIceberg：table.snapshots / table.current_snapshot
            out.append(SnapshotInfo(id=s.snapshot_id,     # snapshot_id 形状=分册模式 1 原词
                                    note=快照摘要(s)))     # 操作/时间等元数据树信息（字段名为设计演绎）
        return out
```

### §4 `TableRef.scan`——谓词+列裁剪+按快照读（DP-W-D1-2 / D1-3）

```text
伪代码（走查，非代码）——scan 参数名照抄分册：row_filter / selected_fields / snapshot_id / limit

    def scan(self, pred: str | None, fields: tuple[str, ...], snapshot_id: int | None,
             limit: int) -> ArrowTable:
        # 契约：输入=业务谓词 / 字段子集 / 快照号（None=当前快照）/ 行数上限
        #       输出=ArrowTable——只含谓词命中行 × 所选列（D1-3）
        known = {s.snapshot_id for s in self._t.snapshots}
        if snapshot_id is not None and snapshot_id not in known:
            raise SnapshotGoneError("快照不存在或已过保留窗口")   # 明确报错，**绝不静默回退当前快照**
        scan_kw = {"row_filter": pred} if pred else {}
        scan = self._t.scan(selected_fields=fields,       # 列裁剪：未选列的数据文件字节不触碰
                            snapshot_id=snapshot_id,      # 按旧快照读=append 前视图（D1-2，不脏读）
                            limit=limit, **scan_kw)       # 谓词/limit 下推进扫描计划，非读后截断
        return scan.to_arrow()                            # Arrow=三档通用交换格式（dp5 末端承接）
    # 裁剪机制（分册「统计信息与裁剪」「四层元数据树」）：manifest list 带分区统计跳过整个 manifest；
    # manifest 每行带数据文件的列级 min/max/null 计数做文件级裁剪——依据可解释，见 §6 metrics()
```

> 走查演示（D1-2）：`append(A 批)` → `append(B 批)` → `scan(snapshot_id=第一次提交号)` 读回的是**只有 A 批**的视图；两次读同快照结果逐行一致——"Agent 探索查询与上游入湖并发进行，读的是加载时快照，不读半截写入"（minio-iceberg.md）。走查演示（D1-3）：`scan(pred="prod_date>='2026-09-01'", fields=("well_id","oil_output"), limit=10000)` 只回命中行×两列。

### §5 `Catalog.append`——写面唯一入口，仅 dp2/dp3（DP-W-D1-4）

```text
伪代码（走查，非代码）

WRITE_ALLOWED = ("dp2.ingest", "dp3.transform")   # 边界规则第 5 行：写面收敛进料/加工两管道

class Catalog:
    def append(self, table: str, arrow: ArrowTable, commit_meta: dict) -> SnapshotInfo:
        # 契约：输入=表名 / Arrow 批 / commit 元数据（provenance 随 commit 落元数据——dp2 卡原话）
        #       输出=新 SnapshotInfo；语义=**只追加**（append-only），不改不删
        caller = 调用方模块名()                            # 设计形状：真实现=显式 caller 参数/审计装饰器
        if caller not in WRITE_ALLOWED:
            raise BoundaryViolation(f"dp1.append 仅限 dp2/dp3，越界调用方：{caller}")   # D1-4
        t = self._impl.load_table(table)
        t.append(arrow)          # PyIceberg：table.append(df)；提交=新 metadata json 原子替换+乐观并发重试
        return SnapshotInfo(id=t.current_snapshot().snapshot_id, meta=commit_meta)
    # 本门面**不暴露** overwrite/delete/upsert/add_files（PyIceberg 虽有——分册「写」清单原词）：
    # 更正与删除必须走 dp2/dp3 管道留痕；dp8 五工具全只读，"Agent 零写入口"由此成立
    # 走查自查（D1-4 的"调用方审计"）：全仓伪代码 grep "\.append(" → 合法调用方仅 dp2/dp3 + dp1 测试替身
```

> 提交语义两层背书：对象层强一致——"write 之后任何 subsequent read 立即见最新"（s3.md，2020-12-01 起）；表层原子替换——"所有变更产生新 metadata json 并原子替换，catalog 只存当前元数据指针"（minio-iceberg.md）。合起来：append 提交后，读者要么看到完整新快照、要么看到旧快照，没有中间态。

### §6 `TableRef.metrics`——裁剪依据可解释（DP-W-D1-3 后半）

```text
伪代码（走查，非代码）

    def metrics(self) -> ColumnStats:
        # 契约：输出=列级 min/max/null 计数——scan 裁剪的**可解释依据**（模块卡原话）
        # 来源=元数据树 manifest 行级 metrics（分册原词），**不扫数据文件**——读元数据即得
        return ColumnStats.from_manifest(self._t)   # manifest 每行=一个数据文件+分区值+metrics
    # 用法：Agent 试错查询前先看 stats——"prod_date 的 max 覆盖不到所问月份"当场可知，免一次空扫描
```

### §7 三档规模切换——矩阵 dp1 行逐档兑现（换的是适配器，不是接口）

| 档位 | 模块卡/矩阵原词 | 档位怎么换（调用方零改动） |
|---|---|---|
| S1 边缘档 | JDBC catalog + 单机 MinIO | `load_catalog("jdbc", uri=postgres:///lake, warehouse=…, s3_endpoint=内网单机:9000)`——catalog=一个 Postgres/SQLite 连接，**零新增服务进程**；120 井×8 表 GB 级（设定书 §1/§2.2，PRD §3 S1 行） |
| S2 平台档 | REST catalog（Polaris/Nessie）+ 分布式 MinIO | `load_catalog("rest", uri=…, credential=…)`——Trino/StarRocks 同一 catalog 接入（Trino `iceberg.catalog.type=rest`；StarRocks `"iceberg.catalog.type"="rest"`，minio-iceberg.md）；REST Catalog Spec 附带 credential vending 与远程签名 |
| S3 集团档 | REST 目录联邦 | `load_catalog("federated", routes=…)`——多域 REST 目录按命名空间路由（mesh 式自治，PRD §3 S3 一天）；跨域短期凭证衔接 dp9.vend_credentials（credential vending 形状） |

> **换档验收即 D1-1 后半**：同一批 `load_table/schema/scan/append` 调用代码原样不动，diff 只出现在 `load_catalog(**cfg)` 的配置里。DuckDB 对照（dp5 沙箱末端，duckdb.md）：`CREATE SECRET (TYPE S3, …, ENDPOINT 'minio.petro.internal:9000', URL_STYLE 'path', USE_SSL false)` + `ATTACH 'warehouse' AS lake (TYPE ICEBERG, SECRET …, ENDPOINT '…')`，时间旅行 `AT (VERSION => SNAPSHOT_ID)`——与 PyIceberg `scan(snapshot_id=…)` 同语义的另一条无 JVM 路线。

---

## 取舍

1. **REST vs JDBC catalog**：REST=OpenAPI 统一协议，"一个客户端实现打通所有语言/引擎"，还带服务端提交去冲突与 credential vending/远程签名（minio-iceberg.md）；JDBC（PyIceberg 的 SQL(Postgres/SQLite)）=最小依赖形态，一个 Postgres/SQLite 连接就是 catalog，S1 兼职运维扛得住。→ **S1 用 JDBC、S2+ 用 REST，切换只动 load_catalog 配置**；内网自建选型口径"优先 REST"（分册原话）。
2. **Iceberg vs Delta/Hudi（一句话版）**：Iceberg=引擎中立、社区采纳面最广（Spark/Trino/Flink/StarRocks/Doris/PyIceberg 各自读写互不绑死）；Delta=Databricks 背景强（UniForm 可被 Iceberg/Hudi 客户端读）；Hudi=主打 upsert 与分钟级增量入湖。数据面主诉求是"多引擎读同一张表+快照审计"，Iceberg 的引擎解耦与 time travel 正中要害——设计替身以 Iceberg 为主格式已贯穿调研分册（PRD §9 决策 5）。
3. **S1 为何无 Hadoop**：PyIceberg 纯 Python 实现、**无需 JVM**，`scan().to_arrow()` 直通；MinIO 走原生 S3FileIO 而非 HadoopFileIO，不"携带 Hadoop 包袱"进湖仓（minio-iceberg.md）。对照：DuckDB iceberg 扩展 `iceberg_scan` 免 catalog 直读单表（只读），`ATTACH` REST catalog 解锁全量含写入与时间旅行——两条"无 JVM 查湖"路线；Spark 本地模式也要起 JVM driver，S1 不请；交互聚合由 dp5 的 DuckDB 末端承接（`to_duckdb` 源码形状=register(arrow)）。
4. **append 写面收敛**：全数据面的湖表写入口只有 `Catalog.append` 一个——仅 dp2/dp3 可调、append-only、必带 commit_meta（provenance 落快照元数据）；Agent 五工具全只读（dp8 只读红线）。收益：审计面收敛——"谁能改这张表"的答案只有两处管道，每次写可追溯到 provenance；越界调用在走查自查报违规（D1-4）。门面故意不暴露 overwrite/delete/upsert：能力在 PyIceberg 里有，**纪律在门面上收**。

## 锚点对照

| # | 论断（设计稿出处） | 锚（分册/设定书/PRD） | 断言/落位 |
|---|---|---|---|
| 1 | schema/注释/分区规格/当前快照是 catalog 一等元数据，喂 Agent 不靠猜 | minio-iceberg.md「模式 1」「为什么 Agent 需要这一层」 | DP-W-D1-1（§2） |
| 2 | catalog 三形态 JDBC/REST/联邦；`load_catalog(type=…, uri, credential)` 入口 | minio-iceberg.md「Catalog 形态」「PyIceberg 关键 API」 | DP-W-D1-1（§1/§7） |
| 3 | 快照隔离不脏读；time travel 按快照读回；提交=元数据原子替换 | minio-iceberg.md（Table Spec：ACID 快照隔离/Time travel/提交语义） | DP-W-D1-2（§4/§5） |
| 4 | 谓词+列裁剪；manifest 级分区统计跳过+文件级 min/max 裁剪 | minio-iceberg.md「统计信息与裁剪」「四层元数据树」 | DP-W-D1-3（§4/§6） |
| 5 | append 仅 dp2/dp3；Agent 五工具全只读、零写入口 | specs/data-plane/modules.md 边界规则第 5 行 + dp8 卡 | DP-W-D1-4（§5） |
| 6 | MinIO path-style：`s3.path-style-access` / `URL_STYLE 'path'` / StarRocks"must set true" | minio-iceberg.md、duckdb.md | §1 注/§7 S1 |
| 7 | `s3.endpoint` 一件换端点：MinIO/OSS/OBS 皆 S3 兼容（世界语） | s3.md「S3 是什么」；国产化注记=prd-data-plane §5 | §1 s3_props |
| 8 | 对象层强一致（2020-12-01 起）支撑"提交无中间态" | s3.md 协议关键语义 | §5 注 |
| 9 | credential vending/远程签名（S3 档短期凭证，dp9 消费） | minio-iceberg.md「REST Catalog 的意义」 | §7 S3 |
| 10 | 免 JVM 双路线：PyIceberg 纯 Python / DuckDB iceberg ATTACH | minio-iceberg.md、duckdb.md「iceberg 扩展」 | 取舍 3/§7 注 |
| 11 | 示例表与列名；3 作业区/120 井/5 平台 | `设定书 §2.2`/附录 A/`§1` | §走查示例 |
| 12 | 三档企业形态（GB/TB·百TB/PB+；兼职→专职数据组→中心平台） | prd-data-plane §3 | §7 |

## 预计追问

1. **catalog 为什么不直接放 MinIO 桶里？** 数据文件与 Iceberg 元数据树全落桶，但"当前元数据指针"需要事务性寻址——社区版 MinIO 只做对象存储、catalog 外置；内嵌 REST catalog 是 AIStor Tables（商业版）才有的能力（minio-iceberg.md 明说）。
2. **旧快照被 expire 清理后按 snapshot_id 读会怎样？** §4 显式报"快照不存在或已过保留窗口"，绝不静默回退当前快照——与 dp7.replay 的边界规则（禁止用当前快照替代）同一纪律；保留窗口由 dp7.retention_policy 裁决。
3. **pred 是字符串谓词，不怕注入？** 它不拼 SQL——原样交给 PyIceberg `row_filter` 解析，列名/类型不合法在解析期报错；面向用户输入的真正闸在 dp9（join 白名单默认拒绝）与平台 F14 校验链（prd-data-plane §7"输出校验"行）。
4. **scan 为什么返回 Arrow 而不是 DataFrame？** Arrow 是三档通用交换格式——dp5 DuckDB 末端的 `to_duckdb` 源码形状就是 register(arrow)，pandas 只是 `to_pandas()` 一步的事（minio-iceberg.md 模式 2 原词）。
5. **S1 的 Postgres/SQLite catalog 会不会太玩具？** S1=GB 级、资料员兼职运维（PRD §3 S1 形态），catalog 只存"当前元数据指针"；涨到 TB 级换 `rest` 配置即可、调用方零改动——这正是"换的是适配器不是接口"的 dp1 演示位。
