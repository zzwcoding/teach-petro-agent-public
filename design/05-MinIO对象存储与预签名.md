# 设计稿 05：MinIO 对象存储与预签名直传直下载

> **红线声明**：本设计稿零真实可运行代码。全部代码块均为**伪代码**（块首标注"伪代码 — 文件:函数"），公开签名取自设计稿 00 登记表 m5 四签名（put_stream / get_stream / presigned_url / fetch_and_rearchive）。MinIO 按官方 minio-py API 形状书写（锚 docs/tech-stack/redis-minio.md）：`Minio(endpoint, ak, sk)`、`bucket_exists`/`make_bucket`、`put_object` 流式上传、`get_object`（用毕必须 close+release_conn）、`presigned_put_object`/`presigned_get_object`（默认上限 7 天、可指定 TTL）——设计范围框架红线逐条落在主干一/三/五。
> **stub 换真身声明**（设计稿 00 登记表 #5）：本节把 FakeStorage（内存桶+临时目录）换为真身 Storage，落点 `app/storage/minio_store.py`；替身段保留（同文件同签名）供 MinIO 未就绪的离线走查指名使用（处理方式同设计稿 02 的 FakeRedis、设计稿 04 的 FakeRepository）。
> **半程边界**（设计范围 F5-3）：本节交付**存储机制与封装**——转存义务函数 `fetch_and_rearchive` 的**函数本体、调用形状与失败形状**在本节锁定；**履约编排全在设计稿 21**（WenzhiWorker._handle_job：何时调、重试节奏、重试仍败标任务 FAILED、失败通知）——W-F5-3 全程兑现归设计稿 21，本设计稿只锁"临时地址绝不落库、产物引用只指自家对象"这条闸的机制侧。同理，W-F10-1 的终点（主任持预签名 URL 下载 .pptx）经产物下载端点在设计稿 21 走查，本设计稿立端点接口本身。
> **明确不讲的**（设计范围声明）：worker 侧转存编排（设计稿 21）；产物元数据落库（设计稿 21 经 m3 仓储，表形状见设计稿 04 ArtifactMeta）；CDN 与跨区域复制（§F5"不做什么"）；presigned_post_policy 表单直传只留选型素材（锚点精要第 5 条）。

## 实现清单

- [x] 报告直传：预签名上传 URL 签发成功，文件流不经过应用进程（源：W-F5-1）✅ **主干一**（Minio 构造 + 桶契约建桶判断 + presigned_put_object 签发 + 80MB 三项对比代价）+ **主干四**（端点起点 presign_report_upload）
- [x] 产物直下载：预签名下载 URL 签发（默认上限 7 天、可指定有效期）；服务端读流后 HTTP 连接归还无泄漏（源：W-F5-2）✅ **主干二**（presigned_get_object、7 天上限与短 TTL）+ **主干三**（get_object 读流与 close+release_conn finally 契约；捣乱输入 B 泄漏推演）
- [x] 桶契约落本设计稿：报告桶与产物桶的建桶判断与对象键规划（源：卡 `m5` 公开接口·桶契约）✅ **主干一**（reports/artifacts 两桶、`bucket_exists`→`make_bucket` 幂等判断、对象键命名规则）
- [x] 转存义务函数就位：临时地址下载转存的调用形状锁定（失败路径全程在设计稿 21 兑现 W-F5-3）（源：卡 `m5` 公开接口）✅ **主干五**（fetch_and_rearchive 本体 + put_stream 官方流式形状）——**半程边界**：机制归本节，履约编排归设计稿 21
- [x] 宿主两处端点接线：上传预签名签发、产物下载预签名签发（源：卡 `m1` 公开接口；W-F10-1 的终点经产物下载端点在设计稿 21 走查）✅ **主干四**（`app/api/reports.py:presign_report_upload` + `app/api/artifacts.py:artifact_download_url`；产物元数据读取走 m3 公开面）
- [x] 本节把设计稿 00 登记的 FakeStorage 换为真身（源：卡 `m5` Adapter）✅ 头部 stub 换真身声明 + **越界自查**
- [x] 越界引用为零（源：modules.md 边界规则表）✅ **越界自查**

---

## 走查：从输入到验收行为

> **主角数据**（业务真数据样子）：
> ① 小李要上传的 Volve 完井报告 PDF：`volve_completion_report.pdf`，80MB 量级 → reports 桶（W-F5-1 主角）；
> ② 主任要下载的问智产物：`井组产量分析.pptx`（artifacts 桶；本节以"已落桶"为前提走查直下载——落桶与元数据落库在设计稿 21）；
> ③ 万相示意图返回的临时 URL（24h 过期）→ 转存入 artifacts 桶（主干五主角）；
> ④ 一次收口讨论：主任把产物下载 URL 转发进 50 人的收口群（捣乱输入 A）。
> **地图先行**（五主干与调用方占位，后续步骤引用不重画）：

```text
伪代码（五主干总览，非代码）

小李 C1            宿主 C2                    对象存储 C10 (MinIO)
 │ ①要传报告          │
 ├─.签发请求.→ presign_api ─.PUT 签发.→ Storage.presigned_url     主干一（桶契约+直传 URL）
 │←{url, key}─┘            └._ensure_bucket（建桶判断）→ reports/artifacts 桶
 │ ②持 url 直传 80MB（文件流不过应用——红虚线语义）↘
 ├─────────────────────────────────────────→ reports 桶
 │ ③要下产物          │
 ├─.签发请求.→ presign_api ─.读产物元数据.→ m3 仓储（设计稿 04 表）    主干四（下载端点）
 │      │←桶+键──┘  └─.GET 签发.→ Storage.presigned_url           主干二（7 天上限+短 TTL）
 │←url─┘ ④持 url 直下载 ↘
 ├─────────────────────────────────────────→ artifacts 桶
 │
 │（服务端读流——设计稿 21 worker / 索引侧按契约调用）
 └─ Storage.get_stream ──用毕 close+release_conn（finally）──→ 主干三（连接归还）
万相临时 URL(24h) ─→ Storage.fetch_and_rearchive ─下载转存.→ artifacts 桶  主干五（半程，调用在设计稿 21）
```

### 主干一：桶契约与直传预签名——80MB 不过应用（W-F5-1 + 卡 m5 桶契约）

```text
伪代码 — app/storage/minio_store.py:Storage 装配（m5；官方构造形状，设计范围红线第 1 条）

_client = Minio(
    endpoint=环境注入对象存储端点(),     # host:port——端点外置（同设计稿 04 连接串外置思路）；国产化内网部署换地址即切
    access_key=环境注入访问密钥(),
    secret_key=环境注入秘密密钥(),
    secure=True,                       # 官方构造形状默认位：TLS
)
# 官方事实：客户端线程安全、不可跨进程共享——进程内建一次（模块级单例）；多进程部署各建各的，不共享
```

```text
伪代码 — app/storage/minio_store.py:Storage._ensure_bucket（m5 模块内私有；桶契约的履行）

REPORTS_BUCKET = "reports"        # 卡 m5 桶契约：原始报告——小李直传的 PDF
ARTIFACTS_BUCKET = "artifacts"    # 卡 m5 桶契约：生成产物——问智 PPT/图/音频（设计稿 21 落桶）
_ensured: set[str] = set()        # 进程内"已确保"标记：命中则零额外往返，签发热路径不加网络调用

def _ensure_bucket(self, bucket: str) -> None:      # 模块内私有——建桶是桶契约的履行机制，不进公开签名
    if bucket in _ensured:
        return                                      # 主干判断①：本进程已确保过，直接走
    if self._client.bucket_exists(bucket):          # 主干判断②：官方判断在前（官方桶操作形状）
        _ensured.add(bucket); return
    self._client.make_bucket(bucket)                # 主干判断③：不存在才建（设计范围"桶不存在→建桶"）
    _ensured.add(bucket)
    # 异常去向：两进程同时判不存在、双双建桶 → 后到者收"桶已存在"类 S3Error，收敛为已确保（幂等不炸）；
    #          权限不足/端点不可达 → 包装 StorageError 上抛——启动预热期暴露，不带病接流量
    # 调用时机：装配期对两契约桶各预热一次（create_app lifespan）+ 公开方法入口惰性兜底（防跳过装配直调）
```

```text
伪代码 — app/storage/minio_store.py:Storage.presigned_url（m5；PUT 分支——W-F5-1 签发半程）

def presigned_url(self, bucket: str, key: str, method: str, ttl=None) -> str:
    self._ensure_bucket(bucket)
    if method == "PUT":
        return self._client.presigned_put_object(bucket, key, expires=ttl or 分钟级默认)
        # minio-py 两预签函数的库默认都是 7 天上限；本封装对 PUT 收紧为分钟级——签发策略收在 m5 一处
        # 输入形状：key="reports/2026-09/volve-completion-a3f9.pdf"（对象键规则见下）
    return self._client.presigned_get_object(bucket, key, expires=ttl or timedelta(days=7))
    # GET 分支展开见主干二
    # 签发即本地计算：签名参数拼进 URL 查询串，对象存储收到请求时才验签——签发端无需网络往返（SigV4 设计）
```

**数据变形：对象键命名规则**（设计范围"对象键命名规则"）。报告桶：`reports/{年-月}/{文件名主干}-{短随机串}.{扩展名}`——分域前缀按月滚存、短随机串防同名覆盖、保留扩展名供下载端识别类型；产物桶：`artifacts/{会话号}/{产物号}.{扩展名}`——键随产物元数据一起落库（设计稿 04 ArtifactMeta 的"桶/对象键"两列），消费方只认元数据、不自己拼键。捣乱输入（怪文件名）的处置在主干四：键生成只取文件名主干，不采用调用方路径段。

**为什么 80MB 不过应用——三项对比代价**（对照基准"过应用中转"是本系统明确不走的路，事实口径）：
- **内存**：过应用 = 请求体要在应用进程里落地。Starlette 对上传文件有阈值（1MB 量级），超过后转存磁盘临时文件——但瞬时占用 × 并发数仍由应用扛：50 人并发各传 80MB 就是 4GB 量级的内存/临时盘压力。直传 = 应用进程全程只见一条 URL 字符串（百字节量级），80MB 字节流在客户端与 MinIO 之间点对点。
- **带宽**：过应用 = 同一段字节走两条腿（客户端→应用入站 80MB，应用→MinIO 出站 80MB），宿主容器的网络出口被翻倍占用。直传 = 一条腿，应用只发出几百字节的 URL。
- **超时**：过应用 = 上传时长取决于最慢的客户端链路（弱网可达数百秒），这段时间占住 uvicorn worker 与反代的请求体缓冲，还逼着全套超时配置为大文件让路。直传 = 签发请求毫秒级返回，大文件传输时长归客户端与 MinIO 之间的连接，应用的超时预算与大文件彻底解耦。

观察到的验收行为（W-F5-1）：小李点上传 → 宿主返回 `{url, key}`（毫秒级）→ 前端持 url 向 MinIO 发 PUT——**报文字节自始至终不进 FastAPI 进程**；MinIO 侧 reports 桶出现对象，键与响应里的 key 一致。

### 主干二：直下载预签名与"签名即授权"（W-F5-2 前半）

```text
伪代码 — app/storage/minio_store.py:Storage.presigned_url（m5；GET 分支——接主干一）

    return self._client.presigned_get_object(bucket, key, expires=ttl or timedelta(days=7))
    # ★ 默认 7 天 = SigV4 预签名上限（官方：presigned_get_object 默认 7 天过期）；传更短的 timedelta 即缩短
    # 落点：产物下载端点（主干四）实际签发小时级短 TTL——"7 天"是上限事实，不是我们默认要用的时长
```

直下载全程：主任在完成通知里点产物 → 端点签发下载 URL（主干四）→ 前端持 URL 向 MinIO 发 GET → 对象存储验签（签名有效、未过期、桶/键未篡改）→ 字节流直落浏览器，**不过宿主进程**。与直传同一机理反着走：宿主发出的同样只是几百字节签名串。

**捣乱输入 A：URL 被转发给 50 人的收口讨论**（口径留事实，方案不给实现）：

```text
伪代码（时序推演，非代码）

t0  主任拿到产物下载 URL（小时级 TTL），转发进 50 人收口群
t1  事实一（凭据自包含）：预签名 URL 自带签名参数（访问密钥 ID、过期时刻、签名值）——
    对象存储验签只核对"签名对、没过期、桶/键没被改"，不核对"拿着 URL 的是谁"——签名即授权
t2  事实二（转发后果）：TTL 内 50 人都能下载同一对象；MinIO 访问日志里这些请求是同一个签名，
    区分不出主任还是群友——审计粒度是"这条 URL 被下了几次"，不是"谁下的"
t3  事实三（无单 URL 吊销）：预签名没有吊销列表——想让某个已发出的 URL 提前失效，
    只能等过期，或动全局手段（换密钥/禁账号/删对象），三者都殃及全体 URL
t4  收口：以上是事实口径。短 TTL / 服务端代理下载 / 下载审计 / 一次性令牌等方案设计
    不在本节（存储封装是叶子，访问政策属调用方）——方案素材留给后续需求
```

闸在哪：这道"闸"的机制面只有一处——**TTL 长短是签发侧唯一可调的暴露窗口**，所以本节把签发策略收在 m5 封装一处（PUT 分钟级、GET 小时级、上限 7 天），端点不各自为政。拦完数据去哪：无可拦——URL 已发出即有效；50 人转发是**授权模型的事实后果**，不是可捕获的异常。

### 主干三：服务端读流与连接归还——get_object 的用毕义务（W-F5-2 后半）

```text
伪代码 — app/storage/minio_store.py:Storage.get_stream（m5；官方形状，设计范围红线第 4 条）

def get_stream(self, bucket: str, key: str) -> urllib3.HTTPResponse:
    return self._client.get_object(bucket, key)
    # 官方形状：get_object 返回 urllib3.HTTPResponse——读取期间一条 HTTP 连接已从客户端内部连接池借出
    # 归还契约在卡上（"用毕 close+release_conn"）：get_stream 只借不还，还的义务随返回值交给调用方，
    #   契约形状见下段——卡面签名如此，本节不改卡（取舍 3）
    # 异常去向：对象不存在（NoSuchKey 类 S3Error）/端点不可达 → 包装 StorageError(结构化错误码) 上抛，
    #   不返回半截流；调用方按"下游不可用/查无对象"分流
```

```text
伪代码 — 调用方用毕归还的契约形状（设计稿 21 worker 读产物、索引侧读报告原文，均按此写）

resp = storage.get_stream("artifacts", "artifacts/{会话号}/{产物号}.pptx")
try:
    字节流 = resp.read()          # 读流（流式消费，不要求整块驻留）
finally:
    resp.close()                  # ① 结束响应读取、释放底层资源
    resp.release_conn()           # ② 连接记账回池——少这一行就是捣乱输入 B
# finally 的意义：无论读流成功、读一半异常、还是 read 本身抛错，归还必执行——
#   契约是"用毕归还"，不是"读到底就行"：异常中断/局部 offset 读/响应没读完的路径到不了读完，
#   而异常路径恰恰是读不完的路径
```

**捣乱输入 B：忘 close+release_conn 的连接池泄漏推演**：

```text
伪代码（时序推演，非代码）

前提：某调用方草稿读产物后不写 finally 归还（close/release_conn 都没调）

机制起点：连接池属于 Minio 客户端（进程级单例——官方：线程安全、不可跨进程共享），
         泄漏因此是进程级的，不随单次请求结束而释放；
         close 与 release_conn 分工不同——close 释放响应与底层资源，release_conn 把连接记账回池可复用

t1  低频期无症状：每次泄漏一条，池里"借出未还"计数单调上涨，服务照常——没有任何异常栈指向忘写的行
t2  池容量是有限个（个位到十位数量级，可经构造参数 http_client 定制）——借满后新的 get_object
    阻塞等待归还：读产物请求开始排队、超时；症状先是"产物下载偶发慢"，不是报错
t3  连接底层是 socket：进程文件描述符计数随之单调上涨——fd 耗尽后连新建连接都失败，
    殃及同进程一切出站调用（数据库、Redis、网关全部连坐），此时故障面已远超对象存储
兜底为何指望不上：解释器回收响应对象的时机不受控（引用环、异常栈持帧都会推迟回收）——
    高并发下池早已见底，等不到回收。所以归还必须写在 finally，由语言机制保证执行
```

闸在哪：这道闸**不在 Storage 内部**——卡面契约就是把归还义务交给调用方（取舍 3 记这样定的代价）。本设计稿能做的是把契约写死在两处：本段契约形状 + 设计稿 21 worker 编排走查。拦完数据去哪：泄漏发生时没有"被拦的数据"，只有 t2/t3 的可观察症状（读流超时、fd 上涨）——这正是要在本设计稿里推演、而不是等线上暴露的理由；设计稿 21 走查 worker 编排时按本段契约逐个调用点核对 finally。

### 主干四：宿主两处端点接线（卡 `m1` 公开接口；m1 只做薄壳）

```text
伪代码 — app/api/reports.py:presign_report_upload（m1 端点薄壳；W-F5-1 起点）

def presign_report_upload(filename: str, user = Depends(verify_token)) -> {url, key}:
    # 输入形状：小李在前端选了 volve_completion_report.pdf（80MB 量级）；鉴权复用 m1 既有 verify_token 闸
    主干, 扩展名 = 剥文件名主干与扩展名(filename)
    扩展名不在白名单(如 pdf) → 结构化 4xx（可纠正，前端换文件）
    key = f"reports/{年-月}/{主干}-{短随机串}.{扩展名}"
    #   数据变形：只取文件名主干、不采用调用方路径段——"../../x.pdf"之类出不了怪键，
    #   防前缀列表被污染、防元数据关联错位；键规则本身见主干一
    url = Storage.presigned_url(REPORTS_BUCKET, key, method="PUT", ttl=分钟级)   # 本地签名计算，无网络往返
    return {"url": url, "key": key}   # key 随响应回前端：后续流程（登记、离线索引）只认这个键（编排归设计稿 09 起）
    # 边界（规则表第 6 行：m1 不写业务逻辑）：本端点只做 键规划+签发转发；报告的解析/索引在 m6（设计稿 09）
    # 异常去向：对象存储不可达（预热期建桶失败的 StorageError 穿透）→ 结构化 5xx，不发半截响应
```

```text
伪代码 — app/api/artifacts.py:artifact_download_url（m1 端点薄壳；W-F10-1 的终点接口，走查在设计稿 21）

def artifact_download_url(artifact_id: str, user = Depends(verify_token)) -> URL:
    # 输入形状：主任在问智完成通知里点了产物条目（产物号）
    meta = 经 m3 Repository 公开面读产物元数据(artifact_id)
    #   产物元数据表 = 设计稿 04 ArtifactMeta（产物号/桶/对象键/种类/所属会话/创建时刻）；
    #   落库在设计稿 21（save_artifact_meta），本端点只读——读侧方法签名缺口见越界自查"遗留（卡修订待办）"，
    #   本设计稿只引用 m3 公开面、不发明签名
    查无此产物 → 结构化 4xx（产物未生成或产物号错）
    url = Storage.presigned_url(meta.bucket, meta.object_key, method="GET", ttl=小时级)
    return url   # 主任持 URL 直连对象存储下载 .pptx——与直传同一机理：文件流不过应用
    # 有效期：上限 7 天（主干二事实），实际签发小时级短 TTL——取值是部署参数，不是机制
    # 边界同上：本端点只做 查元数据+签发转发；产物落桶/落库在设计稿 21
```

观察到的接线行为：两处端点的函数体都只有"变形输入 → 调 m5/m3 公开接口 → 回签名串"三步——m1 的角色是**签发窗口**，不碰对象字节、不写存储逻辑；端点自身经 Depends 走鉴权闸（设计稿 01 的 auth_verify 节点），未授权请求拦在签发之前。

### 主干五（半程）：转存义务函数——临时 URL 下载转存（卡 `m5` 公开接口；W-F5-3 机制半程）

```text
伪代码 — app/storage/minio_store.py:Storage.put_stream（m5；put_object 流式上传官方形状，设计范围红线第 3 条）

def put_stream(self, bucket: str, key: str, stream) -> ObjectWriteResult:
    self._ensure_bucket(bucket)                    # 桶契约兜底（主干一）
    return self._client.put_object(
        bucket, key,
        data=stream,            # 官方形状：data 为带 read() 的流对象——边读边上，字节不整块驻留内存
        length=已知长度,         # 长度已知直传；length=-1 表示未知长度——此时必须指定 part_size 走 multipart（官方）
        content_type=按扩展名映射,
    )
    # 返回 ObjectWriteResult：含 etag / version_id（官方）——转存方可凭 etag 对账"转存的就是下载的那份"
    # 异常去向：S3Error（权限/端点/桶）→ 包装 StorageError 上抛；半截对象由调用方按失败路径处置（设计稿 21）
```

```text
伪代码 — app/storage/minio_store.py:Storage.fetch_and_rearchive（m5；W-F5-3 机制半程，调用形状锁定）

def fetch_and_rearchive(self, url: str, bucket: str) -> str:
    # 输入形状：url=万相返回的临时地址（24h 过期，卡 m10 事实）；bucket="artifacts"
    # ① 临时地址下载：HTTP 客户端 GET url → 字节流（服务端发起，不经客户端中转）
    #    异常去向（本节锁形状）：非 2xx / 超时 / 连接失败 → StorageError("转存下载失败", 原因码) 上抛
    # ② 流式转存入桶：put_stream(bucket, key, 字节流)——官方形状见上段
    #    key 沿产物键规则：artifacts/{会话号}/{产物号}.{图后缀}
    # ③ 返回 key：产物引用从此只指向 MinIO 对象——临时 URL 永不落库（转存义务闸的底线）
    # 半程边界：何时调（万相任务 SUCCEEDED 之后立即）、重试节奏、重试仍败标任务 FAILED、失败通知——
    #   履约编排全在设计稿 21 WenzhiWorker._handle_job（W-F5-3 全程兑现处）；本节只交付函数本体与失败形状
```

走查（机制半程）：万相示意图生成成功，返回带 24h 过期参数的 URL → 设计稿 21 worker（履约方）调 `fetch_and_rearchive(url, "artifacts")` → 函数体两步：下载临时 URL 得字节流、`put_stream` 流式转存入桶 → 返回新 key，随产物元数据落库。从此产物引用是 MinIO 对象键：临时 URL 过期与否不再影响产物可用——"24h 临时 URL 绝不直接落库"这条闸由**函数形状**保证（调用方拿不到临时 URL 的落库理由：返回值就是转存后的 key）。

## 关键判断的取舍记录

1. **minio-py 同步客户端在异步宿主中的形状：签名按卡保持同步，真网络 IO 托底线程池**——redis-minio.md 记载 minio-py 客户端线程安全、不可跨进程共享，未提供官方 async 客户端；卡 `m5` 四签名也无 async 形状。落点：预签名签发是本地签名计算（无网络往返），端点内直调不构成阻塞；`bucket_exists`/`put_object`/`get_object` 是真网络 IO，在异步宿主内的调用点经线程池托底（FastAPI 官方 run_in_threadpool 形状），契约写进本设计稿调用段、设计稿 21 照此编排。备选（按模块卡修订流程给 m5 扩 async 包装面）的换边条件：设计稿 21 worker 大吞吐读流出现事件循环阻塞证据——当前直传直下载的签发路径毫秒级，先不加层。
2. **建桶判断收在 m5 模块内私有 `_ensure_bucket`，不新增公开签名**——卡 `m5` 公开接口只有四方法 + 桶契约注释；建桶是桶契约的**履行机制**，不是调用方需要的能力。做成模块内私有、装配期预热 + 公开方法入口惰性兜底，进程内"已确保"标记避免热路径多一次 exists 往返。备选（独立 `ensure_buckets` 公开方法由 lifespan 调用）的代价：多一个公开面、调用方还得知道桶清单；换边条件：出现运行期动态建桶需求再扩卡。
3. **"用毕归还"做成调用方契约（finally 形状写进本设计稿），不包上下文管理器**——卡面签名 `get_stream -> stream` + 注释"用毕 close+release_conn"，契约位置在卡上；包成 `with` 形状意味着新增公开签名（按模块卡修订流程改卡），本节不改。代价：每个调用方都要记得 finally，捣乱输入 B 就是忘写的推演；换边条件：设计稿 21 之后调用方数量变多且实际出现漏还，按模块卡修订流程给 with 包装——本设计稿推演把"忘写的症状长什么样"先钉下来，换边时有对照。
4. **预签名 URL 按"签名即授权"事实口径记录，不在 m5 私加访问控制**——50 人转发的收口只留事实（TTL 内持有者皆可下载、无单 URL 吊销、审计粒度是 URL 不是人）；短 TTL/代理下载/一次性令牌等方案不塞进存储封装。理由：m5 是叶子，访问政策属调用方——m1 鉴权闸管"**谁能拿到 URL**"（签发前验人），管不了"URL 拿到后转发给谁"（签发后验不了人）；两层各管各的边界，混进 m5 就要给叶子加用户概念。本节能做且做了的：把签发策略（PUT 分钟级、GET 小时级、上限 7 天）收在封装一处，暴露窗口成为显式参数。

## 锚点对照精要

**docs/tech-stack/redis-minio.md · 客户端构造与进程边界**（卡 `m5` 锚点 K-G）
redis-minio.md 记载构造形状 `Minio(endpoint, access_key=..., secret_key=..., secure=True, http_client=None, ...)`，客户端线程安全但**不可跨进程共享**（多进程须每进程新建）。落点：主干一装配段逐参数照写，模块级单例、端点与密钥环境注入；连接池属客户端实例，捣乱输入 B 的"泄漏是进程级的"由这条推出。

**docs/tech-stack/redis-minio.md · 桶操作面**（卡 `m5` 桶契约锚点）
redis-minio.md 桶操作列有 `bucket_exists`/`make_bucket(bucket_name, location, object_lock=False)`，另有策略/加密/版本控制/`set_bucket_lifecycle`（过期与转储规则）等桶级配置。落点：本节只用 exists+make 两个做幂等建桶判断；两桶分开（reports/artifacts）使"清产物不清报告"这类桶级生命周期策略各走各的——lifecycle 本身不配置，留作运维素材。

**docs/tech-stack/redis-minio.md · 流式上传与 ObjectWriteResult**（卡 `m5` put_stream 锚点）
redis-minio.md：`put_object(bucket, object, data, length, content_type, ...)` 的 `data` 为带 `read()` 的流对象，`length=-1` 表示未知长度、此时须指定 `part_size` 走 multipart；返回 `ObjectWriteResult`（含 `etag`、`version_id`）；`fput_object` 是文件路径版。落点：主干五 put_stream 照流式形状写——转存与产物落桶共用一条通道，字节不整块驻留内存。

**docs/tech-stack/redis-minio.md · get_object 的连接归还义务**（卡 `m5` get_stream 锚点；W-F5-2 断言点名）
redis-minio.md：`get_object` 返回 `urllib3.HTTPResponse`，**用毕须 `response.close(); response.release_conn()`**（括号注明：连接复用）；另有 `fget_object` 落盘版与 `stat_object` 元信息。落点：主干三契约形状与 finally 纪律全部站在这条官方义务上——close 与 release_conn 分工、必须成对出现在 finally，是 redis-minio.md 原文的展开而非自创。

**docs/tech-stack/redis-minio.md · 预签名三通道与 7 天上限**（卡 `m5` presigned_url 锚点；W-F5-1/2 断言点名）
redis-minio.md：`presigned_get_object(bucket, object, expires=timedelta(...), response_headers=...)` **默认 7 天过期**；`presigned_put_object(bucket, object, expires=...)` 直传 URL；`presigned_post_policy` 表单直传（可加重定向、大小范围条件）；通用 `get_presigned_url(method, ...)` GET/PUT/DELETE 均可；预签名 7 天上限与 SigV4 语义一致。落点：本节只用 put/get 两函数；post_policy 的"限大小直传"能力记为换边素材（出现"上传必须限大小"需求时按模块卡修订流程扩卡）——50 人转发收口（捣乱 A）的三条事实也出自本条与 SigV4 验签语义。

**docs/tech-stack/redis-minio.md · S3 兼容端点与国产化部署**（卡 `m5` 依赖行锚点）
redis-minio.md：minio-py 可指任意 S3 兼容端点（`endpoint` 换内网地址即可），纯 boto3 方案差异不大、选 minio-py 的理由是 MinIO 私有部署特性（如 `listen_bucket_notification`——MinIO 扩展，S3 公有云无此 API）支持完整；minio-py 要求 Python 3.10+，基线 7.x。落点：主干一端点环境注入（国产化内网换地址即切）；`listen_bucket_notification` 本节不使用，留作事件驱动素材。

## 越界自查（源：modules.md 边界规则表）

- **边界规则第 6 行（本节主语行）**："m1 写业务逻辑"——两处端点函数体只有"变形输入 → 调 m5/m3 公开接口 → 回签名串"，键规划与扩展名白名单是签发的输入变形，非状态机/管道逻辑；鉴权复用 m1 既有 `verify_token` 闸，未新增依赖。
- **m5 是叶子**：四个公开方法零出边——`_ensure_bucket` 与 `StorageError` 为 `app/storage` 模块内私有（非公开接口，不违"未发明签名"——卡面"桶契约"注释即其职责来源）；转存函数内的 HTTP 客户端只出站拉万相临时 URL，不触碰任何业务模块。
- **m3/m1 引用方向**：m1→m5（Storage.presigned_url）、m1→m3（产物元数据公开面读取）均沿卡 `m1` 依赖行 {m3, m4, m5, ...}，正常使用公开接口，非改接口；产物元数据**落库**在设计稿 21（save_artifact_meta，设计稿 04 已交付形状），本设计稿未替设计稿 21 写任何落库调用。
- **架构大图同步**：diagrams/petro-agent.html 按设计范围"图节点范围"只加三节点——`presign_api`（宿主容器 C2）、`object_store`、`rearchive_duty`（🛡️，对象存储容器 C10）；两条边（签发边 + 客户端持预签名直传直下载跨容器边，后者按设计范围标红虚线：文件流不过应用）；`rearchive_duty` 无出边（调用在设计稿 21，沿 cache_aside/task_queue"本节暂不接线"先例登记节点明细表）；`<script>` 零改动，图上无文件名/函数名/端口/路由。
- **签名纪律**：Storage 四方法逐条对齐设计稿 00 登记表 m5 四签名；m1 两端点对齐登记表 m1 签名（`presign_report_upload(filename) -> {url, key}`、`artifact_download_url(artifact_id) -> URL`）。
- **遗留（模块卡修订待办，不阻塞本节验收）**：① 卡 `m3` 公开接口只登记写侧 `save_artifact_meta`，产物下载端点需要按产物号**读**产物元数据（桶/对象键）——本设计稿以"经 m3 公开面读产物元数据"占位、不发明签名，需按模块卡修订流程给卡 `m3` 补读侧方法（设计稿 21 落库对账时一并核）。② minio-py 同步 SDK 的线程池托底是调用点契约（取舍 1），设计稿 21 编排时按此核对每个 m5 调用点。
- **零代码红线**：全文代码块均标注"伪代码"；无 tests/、无 CI 内容。
