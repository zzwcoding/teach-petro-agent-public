# dbt（分析工程 × Data Agent）

> 技术栈调研 · slug: dbt · 关联: [minio-iceberg.md](minio-iceberg.md)（湖仓底座——dbt 是湖仓栈上的 T 层）、[cube-semantic-layer.md](cube-semantic-layer.md)（语义层之争的对照篇）· 姊妹篇 [duckdb.md](duckdb.md)（进程内分析引擎/查询末端）、[s3.md](s3.md)（对象存储协议底座）
> 适用场景：国产化内网环境 · 假想业务：Petro-Agent 油田智能平台
> 调研日期：2026-09-23，论断以官方文档/源码为准，逐条注源。

## 使用场景

### dbt 是什么：把"数据变换"工程化

dbt = **分析工程框架**，只管 ELT 里的 T（Transform）：用纯 SQL（`.sql` 文件里一条 select = 一个 model）+ Jinja 模板，把"裸 SQL 脚本"升级成有版本管理、依赖 DAG、测试、文档、血缘的工程项目（[models 官方文档](https://docs.getdbt.com/docs/build/models)）。运行边界：`dbt run` 只在仓库里执行变换 SQL，**数据不离开仓库**、不做抽取装载——所以它天然叠在 MinIO+Iceberg+Trino/StarRocks 这类底座之上当 T 层（[dbt-trino README](https://github.com/starburstdata/dbt-trino)：dbt 是 ELT 中的 T，不搬数据）。**Core（开源 CLI，Apache 2.0）负责本地变换**；dbt 平台（Cloud）另加调度、CI/CD、文档托管、监控告警，免费 Developer 档到 Enterprise+ 均可用（[docs introduction](https://docs.getdbt.com/docs/introduction)）。2026 年发行格局：Python 版 `dbt-core` 1.x 线继续维护；新 Rust 引擎以独立分发 `dbt`（2.0.x，Beta）并行推进（[PyPI dbt-core](https://pypi.org/project/dbt-core/)、[PyPI dbt](https://pypi.org/project/dbt/)）。

### 为什么 Data/Data Agent 需要它（全文重点）

Agent 问数的可信度瓶颈在"查什么表、口径是谁定的、数据脏不脏"。dbt 恰好是湖仓栈上产出这些答案的那一层：

- **可信数据面：Agent 查"治理过的表"，不查裸明细**。明细落在 MinIO+Iceberg（见 [minio-iceberg.md](minio-iceberg.md)），dbt 在其上用 SQL 把明细加工成测试过的中间层/指标宽表；text-to-SQL 指向这层金托管的表，幻觉面从"整个湖"缩到"一小圈测试过的模型"。
- **生成物是机器可读口径库：manifest.json**。每次运行产出的 [manifest.json](https://docs.getdbt.com/reference/artifacts/manifest-json) 结构化含全部 model 的列/描述/测试/依赖（`nodes`/`sources`/`metrics`/`exposures`/`parent_map`/`child_map`）——Agent 的表语义上下文可直接从这里拉 JSON，不必读人写的口径文档。三层口径来源各管一段：**Iceberg 元数据管物理 schema，dbt manifest 管加工层口径+血缘，Cube 类语义层管面向业务的指标定义**。
- **dbt data tests 是数据质量闸门**。测试就是"返回失败记录的 select"（0 行 = 通过），内置 unique/not_null/accepted_values/relationships（[data tests 文档](https://docs.getdbt.com/docs/build/data-tests)）；Agent 答数前先查 [run_results.json](https://docs.getdbt.com/reference/artifacts/run-results-json) 与新鲜度结果，脏表拒答。
- **血缘让 Agent 能解释"这个数从哪来"**。manifest 的 `parent_map`/`child_map` 给出逐节点上下游，Agent 回答时可以附"该指标由哪些上游表/测试保障"的 lineage 说明。
- **Agent 可触发 dbt 作业、引用其产物作工具闭环**。"跑一遍质检→读 run_results→放行答数"或"检测到新数据→触发增量模型"都可封装为平台工具；`exposures` 资源类型（dashboard/application/ml 等）正是 dbt 官方给"下游消费方"留的 DAG 挂点，Agent 应用可注册为一个 exposure 进入血缘与选择器（[exposures 文档](https://docs.getdbt.com/docs/build/exposures)）。

## 核心能力面

### 项目结构核心概念形状

来源：[docs.getdbt.com](https://docs.getdbt.com/docs/build/models) 各概念页

- **models**：`.sql` 一文件一 select，`ref('上游模型')` / `source('源', '表')` 两个 Jinja 函数把依赖写进代码——dbt 据此建 DAG、按序执行、跨环境解析 schema，禁止硬编码表名（[models](https://docs.getdbt.com/docs/build/models)）。
- **materializations**：模型落库形状，内置 5 种——`table`（CTA 重建）/ `view` / `incremental`（配 `is_incremental()` 只处理新增）/ `ephemeral`（编译成下游 CTE，不落库）/ `materialized_view`（[materializations](https://docs.getdbt.com/docs/build/materializations)）。
- **sources**：声明上游原表 + `freshness` 新鲜度阈值（`warn_after`/`error_after` + `loaded_at_field`），`dbt source freshness` 产出 `target/freshness.json`（与 `sources.json`）（[sources](https://docs.getdbt.com/docs/build/sources)）。
- **seeds / snapshots**：CSV 当表管理（seeds）；快照表捕捉源数据变更历史（snapshots）（[seeds](https://docs.getdbt.com/docs/build/seeds)、[snapshots](https://docs.getdbt.com/docs/build/snapshots)）。
- **tests（data tests）**：generic（`{% test %}` 块 + YAML 挂到列上，可复用）vs singular（`tests/*.sql` 一次性查询）；`dbt build` 把跑模型与测试串成一棵 DAG（[data tests](https://docs.getdbt.com/docs/build/data-tests)）。
- **docs + exposures**：`dbt docs generate` 出文档站；exposures 声明下游消费（必填 `type`/`owner`，`depends_on` 可挂 ref/source/metric），进 DAG 血缘（[exposures](https://docs.getdbt.com/docs/build/exposures)）。

### 适配器生态（国产化关键）

dbt 靠适配器对接各仓库/引擎，Trino/StarRocks/Doris 三条线都已存在：

- **dbt-trino：Starburst 官方维护**，是 dbt-presto 的 fork，Apache-2.0；测试基线 Trino 478 / Starburst Enterprise 482-e.1（[仓库](https://github.com/starburstdata/dbt-trino)）。对 Iceberg catalog 的支持现状：官方 setup 页的要求是"profile 里 database（catalog）所用的 Trino 连接器必须支持建表"——Trino 的 Iceberg connector 满足，即 dbt 模型可直接物化到 Iceberg 表；仓库 CI 夹具自带 `docker/trino/catalog/iceberg.properties`（[trino-setup](https://docs.getdbt.com/reference/warehouse-setups/trino-setup)）。Petro-Agent 形状：MinIO+Iceberg 明细 → dbt-trino 跑 T → 治理层表仍在湖上。
- **dbt-starrocks：StarRocks 官方仓库**（[StarRocks/dbt-starrocks](https://github.com/StarRocks/dbt-starrocks)），官方文档页标注 experimental；物化支持 table/view/materialized_view/incremental（增量策略 append/insert_overwrite/dynamic_overwrite），可经 `source()` 引用 StarRocks 外部 catalog（即湖上 Iceberg 表）（[StarRocks dbt 文档](https://docs.starrocks.io/docs/integrations/dbt/)、[getdbt StarRocks configs](https://docs.getdbt.com/reference/resource-configs/starrocks-configs)）。
- **dbt-doris：Apache Doris 官方**，诞生于 `apache/doris` 仓库 `extension/dbt-doris`（基于 dbt-core，走 mysql-connector-python 驱动，profile `type: doris`）（[Doris 官方文档页](https://doris.apache.org/docs/3.0/ecosystem/dbt-doris-adapter)、[extension 源码](https://github.com/apache/doris/tree/master/extension/dbt-doris)）；2026 年主推接棒线 `velodb/dbt-for-apache-doris`（PyPI 包 `dbt-for-apache-doris`，1.1.0 于 2026-08-12 发布、面向 dbt Core 1.12，Upstream 字段指向 apache/doris extension）（[PyPI](https://pypi.org/pypi/dbt-for-apache-doris/json)、[仓库](https://github.com/velodb/dbt-for-apache-doris)）。

### dbt Semantic Layer / MetricFlow 现状（授权边界，易错点）

- **MetricFlow 是语义层引擎，现为 Apache 2.0 开源**：v0.209.0 起 Apache 2.0（历史：≤0.140.0 AGPL → 0.150.0–0.208.2 BSL → 现 Apache 2.0），以 `dbt-metricflow` 包与 dbt 项目配合使用（[metricflow README](https://github.com/dbt-labs/metricflow)、[PyPI](https://pypi.org/pypi/dbt-metricflow/json)）。
- **托管 dbt Semantic Layer（云上的指标查询 API/BI 集成）是付费平台功能**：官方文档明说"定义与查询指标须 Starter 或 Enterprise 档账号"（[dbt Semantic Layer 文档](https://docs.getdbt.com/docs/use-dbt-semantic-layer/dbt-sl)）。一句话对照：**指标定义 YAML 跟着开源 dbt 项目走，把指标当服务暴露出去（API/BI 直连）要付费云**；与 Cube 的对照见姊妹篇 [cube-semantic-layer.md](cube-semantic-layer.md)（独立开源语义层，仓库无关）。

### 机器可读产物（Agent 的读取面）

- **manifest.json**：顶层键 `metadata`（含 dbt/manifest schema 版本）、`nodes`（models/seeds/snapshots/tests，含列、描述、配置、`depends_on`）、`sources`、`metrics`、`exposures`、`macros`、`docs`、`parent_map`/`child_map`（血缘）、`selectors`、`disabled`；官方提供对应 JSON Schema 供程序消费，版本映射页明确 dbt v1.8–v2.0 → manifest v12（[manifest 文档](https://docs.getdbt.com/reference/artifacts/manifest-json)）。
- **run_results.json**（schema v6）：每次调用的执行结果数组，每条含 `unique_id`（对应 manifest 节点）、`status`（success/pass/fail/error 等）、`execution_time`、`timing`、`failures`（测试失败行数）、`compiled_code`、`relation_name`（[run_results 文档](https://docs.getdbt.com/reference/artifacts/run-results-json)）。
- **freshness.json / sources.json**：source freshness 独立产物，逐表 pass/warn/error + `max_loaded_at`（[sources 文档](https://docs.getdbt.com/docs/build/sources)）。

## 典型用例模式

### 模式 1：Agent 工具"读口径+血缘"——解析 manifest.json 喂 LLM

```python
# 伪代码形状（字段取自 manifest.json 官方文档）
import json
mf = json.load(open("target/manifest.json"))

def tool_model_card(model: str) -> dict:
    n = mf["nodes"][f"model.petro.{model}"]           # unique_id 形状 model.<pkg>.<name>
    return {"description": n["description"],           # 模型级口径说明
            "columns": {c: v["description"] for c, v in n["columns"].items()},
            "tests": [t for t in n["depends_on"]["nodes"] if t.startswith("test.")],
            "upstream": mf["parent_map"][n["unique_id"]],   # 血缘：这个数从哪来
            "materialized": n["config"]["materialized"]}
# 该 dict 拼进问数 prompt：LLM 拿到的是"列含义+测试保障+上游来源"的结构化口径
# metrics/exposures 同在顶层键里，可另出"指标卡/消费方卡"工具
```

### 模式 2：Agent 答数前质量闸——测试全绿+源新鲜才放行

```python
# 伪代码形状（字段取自 run_results.json 与 sources 官方文档）
rr = json.load(open("target/run_results.json"))        # schema v6
fr = json.load(open("target/freshness.json"))

def quality_gate(models: list[str]) -> bool:
    bad_test = [r for r in rr["results"]
                if r["unique_id"].startswith("test.") and r["status"] == "fail"]
    stale = [s for s in fr["results"] if s["status"] == "error"]   # freshness 阈值超标
    if bad_test or stale:
        return False   # 脏表拒答：返回失败测试/stale 源清单，说明拒答原因
    return True

if quality_gate(["dwd_well_daily"]):
    answer = run_text_to_sql_on("dwd_well_daily")      # 假想表，仅示意
else:
    refuse_with_evidence(bad_test, stale)              # 引用 run_results/freshness 证据
```

## 选型差异（一句话版）

- **dbt vs 手写 SQL 脚本 + 自拼调度**：变换逻辑的依赖排序/测试/文档/血缘是框架内生（DAG 由 `ref` 推导），手写方案四件套全要自建且易腐（[models](https://docs.getdbt.com/docs/build/models)）。
- **dbt Semantic Layer vs Cube（语义层之争）**：dbt SL 的指标定义长在 dbt 项目内、托管暴露在付费云；Cube 是仓库无关的独立开源语义层——已在 dbt 栈上则 SL 顺手，多引擎/多消费端中立选型看 Cube（对照详见姊妹篇 [cube-semantic-layer.md](cube-semantic-layer.md)）。
- **dbt vs Airflow（编排 vs 变换）**：dbt 本体不含调度（调度是云平台能力，[introduction](https://docs.getdbt.com/docs/introduction)）；外置调度器定时触发 `dbt build` 两者互补不冲突。
- **Core（含新 Rust 引擎 OSS 分发）vs dbt 平台（Cloud）**：变换运行时免费开源（Apache 2.0）；调度/CI/文档托管/监控/托管 Semantic Layer 在平台，Developer 免费档起步（[introduction](https://docs.getdbt.com/docs/introduction)）。

## 版本锚点

（查询日期：2026-09-23）

- **dbt-core（Python 1.x 线）**：**1.12.5**（2026-09-15 发布，Python ≥3.10，[PyPI](https://pypi.org/project/dbt-core/)）；官方称 v1 线继续维护（[introduction](https://docs.getdbt.com/docs/introduction)）。
- **dbt（新 Rust 引擎 2.x 分发）**：**2.0.6**（2026-09-19，Beta，Python ≥3.11，[PyPI](https://pypi.org/project/dbt/)）；dbt-core 仓库 release 最新 **v2.0.5**（2026-09-18，[GitHub Releases](https://github.com/dbt-labs/dbt-core/releases)）。
- **dbt-trino**：**1.10.5**（2026-09-23 上架 PyPI，Apache-2.0，测试基线 Trino 478，[PyPI](https://pypi.org/pypi/dbt-trino/json)、[仓库](https://github.com/starburstdata/dbt-trino)）。
- **dbt-starrocks**：**1.12.2**（2026-09-15，[PyPI](https://pypi.org/pypi/dbt-starrocks/json)、[仓库](https://github.com/StarRocks/dbt-starrocks)）；官方文档标注 experimental。
- **dbt-doris / dbt-for-apache-doris**：前者 **1.0.0**（2026-03-17，apache/doris extension），后者 **1.1.0**（2026-08-12，面向 dbt Core 1.12，[PyPI](https://pypi.org/pypi/dbt-for-apache-doris/json)）。
- **dbt-metricflow**：**0.15.0**（2026-09-10，[PyPI](https://pypi.org/pypi/dbt-metricflow/json)）；MetricFlow 库 v0.209.0 起 Apache 2.0（[README](https://github.com/dbt-labs/metricflow)）。
- **manifest schema**：dbt v1.8–v2.0 对应 **manifest v12**（[manifest 文档](https://docs.getdbt.com/reference/artifacts/manifest-json)）；run_results 为 **schema v6**（[文档](https://docs.getdbt.com/reference/artifacts/run-results-json)）。
- **未找到一手源/证据不足**：① dbt-trino 当前 README 已删去旧版"Supported catalogs（hive/iceberg/delta_lake）"矩阵，Iceberg 支持只能以 CI 夹具 `docker/trino/catalog/iceberg.properties` + setup 页"连接器须支持建表"间接佐证，无专门声明页；② MetricFlow 在"纯 Core 本地编译指标查询"侧的一页式官方说明缺失，`dbt-metricflow` 包存在与 Apache 2.0 许可是一手源，但"Core 端能否完整复刻云 SL API"无官方明文；③ "dbt-starrocks 基于 dbt-mysql"一说仅见第三方转述，未在一手源核实，本文不采信；④ Doris 官网 latest 路径 `/docs/ecosystem/dbt-doris-adapter/` 返回空渲染，稳定引用用版本化路径 `/docs/3.0/`。

## 信源列表

- dbt 官方文档 introduction（Core vs 平台、OSS = Apache 2.0 Rust 引擎、v1 线维护）：https://docs.getdbt.com/docs/introduction
- dbt models（select 即模型、ref/source 依赖 DAG）：https://docs.getdbt.com/docs/build/models
- dbt materializations（table/view/incremental/ephemeral/materialized_view）：https://docs.getdbt.com/docs/build/materializations
- dbt sources（freshness 配置、freshness.json/sources.json 产物）：https://docs.getdbt.com/docs/build/sources
- dbt data tests（generic vs singular、内置四测试、--store-failures）：https://docs.getdbt.com/docs/build/data-tests
- dbt exposures（type/owner/depends_on、进 DAG、+exposure: 选择器）：https://docs.getdbt.com/docs/build/exposures
- dbt seeds：https://docs.getdbt.com/docs/build/seeds ；snapshots：https://docs.getdbt.com/docs/build/snapshots
- manifest.json 官方 schema 文档（顶层键、版本映射 manifest v12）：https://docs.getdbt.com/reference/artifacts/manifest-json
- run_results.json 官方文档（schema v6、status/failures 字段）：https://docs.getdbt.com/reference/artifacts/run-results-json
- dbt Semantic Layer 文档（须 Starter/Enterprise 档）：https://docs.getdbt.com/docs/use-dbt-semantic-layer/dbt-sl
- MetricFlow overview（SL 的引擎）：https://docs.getdbt.com/docs/build/about-metricflow
- MetricFlow 仓库（许可史 AGPL→BSL→Apache 2.0，v0.209.0+ 开源）：https://github.com/dbt-labs/metricflow
- dbt-trino 仓库（Starburst 维护、dbt-presto fork、Trino 478 基线、iceberg 夹具）：https://github.com/starburstdata/dbt-trino
- dbt Trino setup（catalog 只须连接器支持建表）：https://docs.getdbt.com/reference/warehouse-setups/trino-setup
- StarRocks 官方 dbt 文档（experimental、物化与增量策略、外部 catalog）：https://docs.starrocks.io/docs/integrations/dbt/
- StarRocks dbt 仓库：https://github.com/StarRocks/dbt-starrocks ；getdbt StarRocks configs：https://docs.getdbt.com/reference/resource-configs/starrocks-configs
- Apache Doris dbt-doris 官方文档页：https://doris.apache.org/docs/3.0/ecosystem/dbt-doris-adapter
- apache/doris extension/dbt-doris 源码：https://github.com/apache/doris/tree/master/extension/dbt-doris
- velodb/dbt-for-apache-doris（接棒线，PyPI Upstream 指向 extension）：https://github.com/velodb/dbt-for-apache-doris
- PyPI：dbt-core https://pypi.org/project/dbt-core/ ；dbt https://pypi.org/project/dbt/ ；dbt-trino/starrocks/doris/metricflow 经 PyPI JSON API（见正文）
- dbt-core GitHub Releases：https://github.com/dbt-labs/dbt-core/releases
