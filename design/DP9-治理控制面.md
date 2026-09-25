# 设计稿 DP9：治理控制面（dp9）—— join 白名单默认拒绝 + 作业区行级隔离 + 导出审批 + S3 凭证下发

> **红线声明**：本设计稿零真实可运行代码。全部代码块均为**伪代码**（块首标注"伪代码 — 文件:函数"），公开签名逐字取自 `specs/data-plane/modules.md`「dp9 治理控制面 Governance」卡四签名（check_join / authorize / export_report / vend_credentials）；函数体=输入输出契约+主干判断，不写实现细节。
> **语言纪律**：业务事实一律注 `设定书 §x`（发明即违规）；技术形状一律 docs/tech-stack/ 分册——预签名 URL 的 SigV4、**7 天上限、"presigned URLs are bearer tokens" 属性逐字照 s3.md**，分册没有的协议字段不写；data-fabric.md 的"策略即代码"**按分册定性如实写"理念对照、非引入产品"**（Gartner："no single vendor currently delivers all data fabric components"；IBM："It is not a piece of software, but rather a design approach"）。
> **边界声明**：dp9 **无模块依赖**（依赖图 `dp9 ← dp5, dp8`——被两者依赖，不依赖任何 dp 模块；StructuredQuery 类型定义在 dp4，此处仅作入参形状、零 import）；治理闸是工具面**唯一放行路径**（边界规则："dp8 绕过 dp9 放行任何查询/导出 → 禁止"）；Seam=`PolicyBackend`，Adapter=`StaticPolicy`（YAML 白名单/权限表）——三档规模换适配器不换接口。
> **明确不讲的**：完整 fabric 产品实现（理念对照，PRD-data-plane D9 原文）；审批流 UI 与超时升级（运行时产品层）；列级脱敏矩阵与策略引擎选型（S3 档只给形状）；dbt tests 闸本体（dp3 已交付，本设计稿只引用其判定同源关系）。

## 实现清单

- [x] `DP-W-D9-1` 白名单默认拒绝：⋈fluid_test 直连拒，violated_edges 指明须经 intermediate（§5 白名单原文四条进表，白名单外一律拒）✅ **主干一**（白名单表 + 四道判 + 走查推演 1）
- [x] `DP-W-D9-2` 行级隔离：渤中用户查渤南井被拒（§1 三作业区：渤南/渤中/渤西）；UserContext 注入点在 dp5/dp8 调用链前置 ✅ **主干二**（authorize 判定 + 注入点位图 + 走查推演 2）
- [x] `DP-W-D9-3` 导出审批：无审批拒；带审批返回 presigned URL（7 天上限、bearer token 属性注源 s3.md）✅ **主干三**（审批位两出口 + presigned 形状 + 走查推演 3）
- [x] `DP-W-D9-4` S3 credential vending：短时效 CredentialRef，不落长期密钥（REST Catalog Spec 形状）✅ **主干四**
- [x] 规模矩阵 dp9 行兑现：S1 静态 YAML / S2 securityContext+审批 / S3 策略引擎+vending；"策略即代码"的 fabric 对照（理念非组件如实声明）✅ **主干五**（三档换挡表 + 取舍 4）
- [x] 取舍 ≥4 条（SQL 生成前 vs 后衔接 F14、五级语义 CI（F20）分工、默认拒绝 vs 默认放行、fabric 理念对照）✅ **取舍节**
- [x] 锚点对照：设定书 §x / data-fabric.md / s3.md / cube-semantic-layer.md → 断言 ID ✅ **锚点对照**

---

## 伪代码走查

### 主干一：check_join——白名单默认拒绝的判定主干（DP-W-D9-1）

**契约**：入参=StructuredQuery（dp4 四件套形状，measures/dimensions/timeDimensions/filters）；出参=Decision(allowed, violated_edges)。判定对象是**结构化形状上的 join 边**，不是 SQL 文本——生成期就拦（取舍 1）。白名单唯一事实源=设定书 §5 原文，进 YAML 加载，本设计稿零改写：

```text
伪代码 — app/data_plane/governance.py:check_join（dp9 卡签名原文：
         check_join(query: StructuredQuery) -> Decision(allowed, violated_edges)）

# ── 白名单表（设定书 §5 原文四条，StaticPolicy 从 YAML 加载；判定同源不私改）──
合法 join 白名单（默认拒绝）：
  oil_production_daily ⋈ well_info（井号）            ✓
  oil_production_daily ⋈ date_dim                     ✓
  oil_production_daily ⋈ fluid_test                   ✗（须井号+取样日期双键+时间容差，经 intermediate 视图）
  oil_production_daily ⋈ water_injection_daily 直连   ✗（须经受效关系实体）
  其余任意边：不在表内 = 拒（默认拒绝语义，见取舍 3）

def check_join(query) -> Decision:
    边集 = 收集 join 边(query)          # measures→基表、dims→维表：结构化形状上边可枚举，无需解析 SQL
    violated = []
    for (左表, 右表) in 边集:
        条目 = 白名单查((左表, 右表))    # 双向查：无序对匹配
        if 条目 is None:                 # ① 白名单外 → 默认拒绝
            violated.append(违例边(左表, 右表, 指引="无合法直连路径——先评估业务口径，走治理链审批新增白名单（§1 高影响变更）"))
        elif 条目.结论 == "✗":           # ② 表内标 ✗ → 拒，但修复指引在案（§5 原文括号）
            violated.append(违例边(左表, 右表, 指引=条目.修复路径))
            # ⋈fluid_test → "须井号+取样日期双键+时间容差，经 intermediate 视图"
            # ⋈water_injection_daily → "须经受效关系实体"（注水井→受效油井，§5 实体表）
        # ③ 条目 ✓ → 放行，零动作
    return Decision(allowed=(violated 为空), violated_edges=violated)
```

**走查推演 1（DP-W-D9-1 主角）**：query 含 `oil_production_daily ⋈ fluid_test` 直连——边集枚举出该边，白名单命中且标 ✗ → `allowed=False`，`violated_edges=[{edge: oil_production_daily⋈fluid_test, fix: "须井号+取样日期双键+时间容差，经 intermediate 视图（设定书 §5）"}]`。可观察行为：**拒绝不是终点**——修复指引告诉调用方（dp8.query 的错误路径）"改用 intermediate 视图重发"，与 dp3 模型边界（intermediate 层才允许该 join，DP-W-D3-3 同源判据）互为纵深：dp3 管建模范，dp9 管查询者。

### 主干二：authorize——UserContext（作业区）→ 行级判定（DP-W-D9-2）

**契约**：入参=UserContext（内部形状：user_id/org/role，org ∈ {渤南, 渤中, 渤西}——§1"3 作业区"）+ table + action("read"|"export")；出参=Decision。行级判定的事实源=表数据自身的归属列（如 well_info.block_name，§附录 A.1），闸只持规则不持数据。**注入点**（读 dp8 卡 query 内部顺序原文"内部强制先经 dp9.check_join + dp6.route"）：

```text
伪代码（注入点位图，非代码）

tools_mcp.py:query(metric, dims, window, filters)         # dp8 五工具之一，唯一查询入口
  ① governance.check_join(query)      ┐ dp9 横切闸：先于一切路由与执行
  ② governance.authorize(ctx, table, action) ┘  ← 本主干；ctx 从工具调用身份解析（fabric 模式 2 的
  ③ freshness.route(window, metric)        # dp6 路由（dp9 之后：被拒的查询不配问新鲜度）
  ④ query_runner.run(query)                # dp5 执行——引擎不背权限的债，S1 DuckDB 本就无行级安全
  ⑤ audit.record(...)                      # dp7 留痕（决策含闸的裁决）
    # dp8 直调 dp5 也必须先过 ①②（边界规则：dp8 绕过 dp9 放行 = 禁止，无例外）

def authorize(ctx, table, action) -> Decision:
    # ── 主干判断① 归属解析：表 → 行级键（本节设定 = 井表经 block_name 挂作业区，§A.1）──
    行域 = 归属列(table)                   # 如 well_info.block_name ∈ {渤南, 渤中, 渤西}
    # ── 主干判断② 行级：ctx.org 与行域求交——空交 = 拒 ──
    if action == "read" and 行域 不含 ctx.org:
        return Decision(False, [违例行(ctx.org, table, 指引="作业区隔离（设定书 §1）：仅授权本作业区井数据")])
    # ── 主干判断③ export 加位：读得了 ≠ 拿得走——导出一律再过审批位（主干三）──
    if action == "export":
        return Decision(需审批位裁决, [...])   # 本函数只判资格，审批在 export_report（主干三）
    return Decision(True, [])
```

**走查推演 2（DP-W-D9-2 主角）**：渤中作业区用户查渤南井数据——注意判的是 `block_name=渤南`（§A.1 事实源），不是井名文本（井名"渤中28-1-N2"的井 block_name 可能是渤南——名字会骗人，归属列不会）。authorize 主干判断②空交 → `read` 被拒，指引声明"作业区隔离"。**为什么闸在 dp8 而不在引擎**：行级判定在结构化形状上一次完成，三档引擎（DuckDB/Trino/StarRocks）通用——换引擎不换权限语义（取舍 1 同构论证）；S2 档的同构对应物=Cube securityContext（主干五）。

### 主干三：export_report——审批位 → presigned URL 形状（DP-W-D9-3）

**契约**：入参=artifact(bytes)+watermark_level；出参=PresignedUrl。预签名形状**逐字照 s3.md**（模式 1 + 生产要点），分册没有的字段（如自定义签名参数）不写：

```text
伪代码 — app/data_plane/governance.py:export_report（dp9 卡签名原文：
         export_report(artifact: bytes, watermark_level: str) -> PresignedUrl）

def export_report(artifact, watermark_level) -> PresignedUrl:
    # ── 主干判断① 审批位（S2+）：无审批 → 拒（捣乱路径：导出全量明细未批）──
    审批 = 审批位取(本次请求)              # S2+ 审批位；S1 档导出整体降级为不可用（规模表）
    if 审批 is None:
        return 拒绝("导出需审批（S2+ 审批位）——走治理链提交，批后重试")   # 走查推演 3 前半
    # ── 主干判断② 落桶：文件字节不过应用进程——后端 put 落桶，只发签名不转发字节（s3.md 模式 1）──
    key = f"reports/{审批.id}/export-{watermark_level}.pdf"
    s3.put_object(Bucket="petro-agent-artifacts", Key=key, Body=artifact,
                  Metadata={"watermark": watermark_level, "approval": 审批.id})   # 元数据随对象落桶，可审计
    # ── 主干判断③ 预签名（形状逐字 s3.md：generate_presigned_url / ExpiresIn）──
    url = s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": "petro-agent-artifacts", "Key": key},
        ExpiresIn=3600,   # 官方示例默认 1h；SDK+长期凭证上限 7 天（SigV4）
    )
    return PresignedUrl(url, expires_in=3600, 水印=watermark_level)
    # s3.md 逐字纪律：URL 是 bearer token——"presigned URLs are bearer tokens"（官方警告），
    # 到期前可重复使用；桶开 Block Public Access，预签名是唯一出口
```

**走查推演 3（DP-W-D9-3）**：①无审批导出全量明细 → 主干判断①拒绝并要求审批位，字节零落桶；②带审批 + watermark_level → put 落桶（元数据带审批 id）→ 返回 presigned URL（3600s）。泄露语义随之确定：bearer token 拿到即持有，防线是**短时效 + 高位水印 + 唯一出口**三件，不是 URL 保密（取舍 5）。

### 主干四：vend_credentials——短时效凭证形状（DP-W-D9-4）

**契约**：入参=table+ttl；出参=CredentialRef。形状锚=Iceberg REST Catalog Spec 的 **credential vending（短期表级凭证下发）与远程签名**（minio-iceberg.md；StarRocks v4.0 起 REST catalog 支持 vended credentials 同源）：

```text
伪代码 — app/data_plane/governance.py:vend_credentials（dp9 卡签名原文：
         vend_credentials(table: str, ttl: timedelta) -> CredentialRef）

def vend_credentials(table, ttl) -> CredentialRef:
    # ── 主干判断① 身份与范围：只给"这张表"的短期权限，不给身份本身 ──
    范围 = 表级权限(table, action="read")        # S3 档：策略引擎裁决范围（主干五）
    # ── 主干判断② 下发：短期表级凭证，ttl 到期失效——长期密钥永不进工具面 ──
    return CredentialRef(
        token=目录服务.vend(表=table, scope=范围, ttl=ttl),   # REST Catalog Spec：vended credentials
        expires_at=now() + ttl,                               # 到期即失效，泄露窗口 = ttl 而非永久
    )
    # 走查（DP-W-D9-4）：Agent 工具临时访问新表 → 拿 CredentialRef 访问，ttl 过后 403；
    # 全程零长期密钥落工具面——与主干三 presigned 的 bearer 逻辑同构：短时效换小泄露窗口
```

### 主干五：三档换挡——PolicyBackend 换适配器不换接口

```text
伪代码（规模映射表，非代码；矩阵 dp9 行原文：白名单 YAML / securityContext+审批 / 策略引擎+vending）

S1 边缘档：StaticPolicy——check_join/authorize 读静态 YAML（白名单表 + 作业区权限表，本设计稿主干形态）
S2 平台档：+ Cube securityContext——"关于当前用户的一组已验证声明"（Authorization: <JWT> 头，JWKS 验签），
           query_rewrite 在编译期把行级过滤注入生成的 SQL（按 user_id 过行/按角色过滤——
           cube-semantic-layer.md 原文形状）；导出审批位启用（主干三）
S3 集团档：+ 策略引擎 + credential vending——主干四；"策略即代码"对照 data-fabric.md 模式 2
           （@policy_engine.enforce(scopes=["row","column","sensitivity"])），如实声明：理念对照，
           不是引入 fabric 产品（data-fabric.md："不是单一开源组件"）
三档共同点：公开签名四件零变化，换的是 PolicyBackend 适配器——"换的是适配器，不是接口"
```

## 关键判断的取舍记录

1. **治理闸在 SQL 生成前（结构化形状上），生成后校验只作兜底；与主 PRD F14 执行前校验链同构不同位。** D9 目标原文"横切闸在 SQL 生成前生效"。机制依据：StructuredQuery 是 dp4.build_query 的确定性产物，join 边/行域在结构化形状上可枚举，判定零解析成本、零误判；等 SQL 文本生成后再解析判 join，是把确定性判定拖进"解析是否成功"的不确定域。与 F14 的分工：F14（平台侧 m17 五段链）管**自由生成的 SQL 文本**（AST→策略→新鲜度→血缘→审计）；dp9 管**数据面五工具的 StructuredQuery**——两者在同一世界观里是同一道闸的两个投影（"结构化查询先过 D9 白名单与 F14 校验链"，PRD-data-plane §6 原文），设计上各守一段：数据面拦形状，平台面拦文本。
2. **五级语义 CI（F20）是发布时检查，dp9 是运行时闸——时间轴上前后两级，不互相替代。** F20 管"什么口径/语义资产**能上线**"（L1–L5：schema→引用→指标 SQL 与安全→治理→行为回归）；dp9 管"上线后的查询**能碰什么**"。§5 白名单同时活在两处：dp3 模型边界（intermediate 层才许该 join，发布时 CI 兜）与 dp9 运行时复核（查询时拦）——判据同源（§5 原文一份）、位次不同，防御纵深而非重复建设：绕过 dp3 的查询在 dp9 仍被拦。
3. **默认拒绝，不默认放行；豁免必须带理由进 modules.md 边界规则表。** 默认放行的失败模式是静默的：新表新 join 未评估即达引擎，治理债转给下游质量与审计；默认拒绝的失败模式是显式的（合法新查询被拒），且 violated_edges 的修复指引把成本降为"改走 intermediate/受效关系实体"一步或"走治理链审批"一票——误拒绝有便宜的正道，绕过没有。豁免同样显式化：要开新口子，进边界规则表带理由，不做静默特例——白名单是资产，特例也得是资产。
4. **fabric"策略即代码"是理念对照，不是引入产品——分册定性逐字照写。** data-fabric.md 定性（Gartner"no single vendor currently delivers all data fabric components"、IBM"It is not a piece of software, but rather a design approach"）：fabric 无可安装包，本设计稿的 PolicyBackend/StaticPolicy 是其"统一策略引擎"能力面的设计微缩，模式 2 伪代码形状照分册、组件一个不引入；落地角色由 Cube securityContext（S2）+ YAML 白名单（S1）+ 策略引擎形状（S3）分摊。同分册口径：湖仓六件套解决"怎么存怎么算"，fabric 对照物解"谁能取、管得住"——恰是 dp9 四签名对应的那一半。
5. **presigned URL 的安全模型押在"短时效 + 唯一出口"，不押在 URL 保密上。** s3.md 逐字：URL 是 bearer token，到期前可重复使用——持有即权限，无法做"仅本人可用"。对策顺势而为：ExpiresIn 收短（官方示例默认 1h）、桶开 Block Public Access（预签名是唯一出口）、导出强制高位水印留痕、不可篡改诉求走桶版本控制 + Object Lock。备选"应用代理转发字节"不选：字节过进程=带宽与内存走应用，且代理层反而成为新的泄露单点（s3.md 模式 1 立论原话"文件流不过应用进程"）。

## 锚点对照

| 断言/内容 | 锚点 | 落点 |
|---|---|---|
| DP-W-D9-1 白名单默认拒绝 | 设定书 §5（四条原文 + 默认拒绝括号） | 主干一白名单表/四道判/推演 1 |
| DP-W-D9-1 修复指引 | 设定书 §5（双键+时间容差经 intermediate / 须经受效关系实体）；实体=受效关系（§5 实体表） | 主干一 violated_edges |
| DP-W-D9-2 三作业区行级 | 设定书 §1（3 作业区）、§附录 A.1（block_name=渤南/渤中/渤西） | 主干二判定/推演 2 |
| DP-W-D9-2 注入点 | modules.md dp8 卡（query"内部强制先经 dp9.check_join + dp6.route"）；边界规则"dp8 绕过 dp9=禁止" | 主干二注入点位图 |
| DP-W-D9-3 预签名形状 | s3.md（generate_presigned_url/ExpiresIn=3600 官方默认；SigV4 长期凭证上限 7 天；"presigned URLs are bearer tokens"；Block Public Access 唯一出口）逐字 | 主干三形状/推演 3 |
| DP-W-D9-4 credential vending | minio-iceberg.md（REST Catalog Spec：短期表级凭证下发与远程签名；StarRocks v4.0 vended credentials）；data-fabric.md 模式 2 | 主干四 |
| 规模矩阵 dp9 行 / securityContext 形状 | modules.md 矩阵；cube-semantic-layer.md（securityContext=JWT 声明、query_rewrite 编译期注入、context_to_app_id 多租户） | 主干五 |
| 取舍 1（F14 衔接） | 主 PRD F14（五段校验链）；prd-data-plane §6（"先过 D9 白名单与 F14 校验链"） | 取舍 1 |
| 取舍 2（F20 分工） | 主 PRD F20（五级语义 CI L1–L5）；walkthroughs D3-3（dp3 同源判据） | 取舍 2 |
| 取舍 4（fabric 定性） | data-fabric.md（Gartner/IBM 定性原话、模式 2、"湖仓六件套 vs fabric"口径） | 取舍 4 |

## 预计追问

1. **行级隔离为什么放在应用闸，不靠数据库视图或引擎行级安全？** S1 档 DuckDB 进程内本就没有行级安全，视图方案要按 3 作业区 × N 表维护视图矩阵；闸在结构化形状上判一次，三档引擎通用——S2 档才换 Cube securityContext 的 query_rewrite 编译期注入，语义不变、载体升级（"换的是适配器，不是接口"）。
2. **白名单谁维护？新 join 想直连走什么流程？** 白名单唯一事实源是设定书 §5（业务规则不是代码发明）；新增直连边=高影响变更，走治理链审批（§1 数据治理领导组）+ F20 语义 CI 发布后进 YAML——dp9 只消费判据，不造判据（取舍 3 的"豁免显式化"）。
3. **presigned URL 被转发给无权限的人怎么办？** 按 bearer token 的官方定性接受它：拿到即持有、到期前可重复使用（s3.md 逐字）——所以防线前置为短时效（默认 1h）、审批留痕、高位水印、Block Public Access 唯一出口；"URL 只给对的人"靠分发渠道纪律，不靠 URL 本身。
4. **vend_credentials 和直接发 access_key 差在哪？** 表级 scope + ttl：泄露窗口从"轮换密钥之前"缩到 ttl（到期 403），且长期密钥永不进工具面——这是 REST Catalog Spec credential vending 的立意，与 presigned 的短时效逻辑同构（主干四尾注）。
5. **F14 校验链和 dp9 会不会把同一条查询拦两遍？** 位不同不重复：dp9 拦结构化查询形状（数据面五工具入口，生成前）；F14 拦自由 SQL 文本（平台问数链 m17，执行前）——同一世界观的两道闸各守一段（取舍 1），白名单判据同源所以结论一致，不会出现"这边放行那边拒绝"的分裂。
