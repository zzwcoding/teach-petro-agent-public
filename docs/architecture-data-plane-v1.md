# DataAgent 数据面架构图 v1

> 阶段 2 产出 · 来源: specs/data-plane/modules.md（卡是唯一真源，图是投影）· 状态: **待用户过审**（PRD §9 决策 7：自主档先行，追认位待补）
> 图例：实线=数据/调用流；三档差异用注记标出（S1 关停件用虚线框表示"该档不存在"）。

```mermaid
flowchart TB
    subgraph SRC[上游（设定书 §2.1）]
        REPORT[班报手工录入<br/>A/B 班·吨方混写]
        PRODDB[生产库 8 表<br/>§2.2/附录A]
        RT[实时库 InfluxDB 类<br/>15 分钟闭环]
    end

    subgraph INGEST[dp2 进料 Ingest]
        BATCH[批量校验直写 S1]
        CDC[Flink CDC 管道 S2+<br/>native=exactly-once<br/>pipeline=主键幂等]
    end

    subgraph LAKE[dp1 湖底座 LakeStore]
        MINIO[(MinIO / S3 兼容<br/>S1 单机 · S2 分布式 · S3 多集群)]
        ICE[Iceberg 湖表<br/>快照/时间旅行/元数据树]
        CAT[Catalog<br/>S1 JDBC · S2 REST · S3 联邦]
    end

    subgraph SERVE[语义与服务层]
        DBT[dp3 加工与质量 Transform<br/>staging→intermediate→marts<br/>20 条规则→tests · manifest]
        CUBE[dp4 语义层 Semantic<br/>15 指标卡→measures<br/>术语归一 · 权威源 · ai_context]
        QR[dp5 执行适配 QueryRunner<br/>S1 DuckDB · S2 Trino/StarRocks]
        FR[dp6 新鲜度路由<br/>答实时/答离线/诚实拒答]
        AUD[dp7 快照审计<br/>四元组 · 回放 · 保留窗口]
    end

    subgraph AGENT[Agent 接口层]
        GOV[dp9 治理控制面<br/>join 白名单默认拒绝<br/>行级权限 · 导出审批 · vending]
        TOOLS[dp8 数据工具面 DataTools<br/>discover/describe/query/replay/lineage<br/>S1 进程内 · S2+ MCP server]
        QA[问数 Agent<br/>主 PRD F7 · 结构化查询]
    end

    REPORT --> BATCH
    PRODDB --> CDC
    RT --> CDC
    BATCH --> ICE
    CDC --> ICE
    ICE --> MINIO
    ICE --- CAT
    ICE --> DBT --> CUBE
    QA --> TOOLS --> GOV
    GOV --> FR --> QR --> ICE
    GOV --> CUBE
    QR --> AUD
    AUD --- ICE

    style INGEST stroke-dasharray: 5 5
```

> 注：S1 档 CDC/实时库一侧不存在（虚线区），批量校验直写是唯一进料；dp8 退化为进程内函数。S3 档在图上叠加：多湖多目录联邦（dp1）、dbt 多项目（dp3）、Cube 联邦（dp4）、多引擎（dp5）、MCP server 池（dp8）、策略引擎+credential vending（dp9）——接口全部不变，只换适配器（specs/data-plane/modules.md 规模映射矩阵）。

## 过审记录

- 状态：**待用户追认**（自主档授权下先行，见 docs/prd-data-plane.md §9 决策 7）。
- 追认后补记：日期 / 结论 / 修改落点 / 遗留问题（格式沿 sdd-flow ADR 惯例，落 `docs/adr/`）。
