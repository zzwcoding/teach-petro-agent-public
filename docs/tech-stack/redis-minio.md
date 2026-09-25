# Redis + S3/MinIO

> 技术栈调研 · slug: redis-minio
> 适用场景：国产化内网环境 · 假想业务：Petro-Agent 油田智能平台（FastAPI 异步底座 + LiteLLM 网关 + 三 Agent）
> 调研日期：2026-09-12，以下 API 形状均以官方文档为准。

## 使用场景

### Redis 在生产环境解决什么问题

- **热数据缓存**：把 LLM 网关的模型列表、prompt 模板、问数结果的二次查询等高频读数据放内存，避免反复打到 Postgres/向量库；KV 读写为 O(1)。
- **会话/状态存储**：多轮问答的 session 状态、Agent 执行轨迹（trace）的中间状态、限流计数器（token bucket），靠 `EXPIRE` 做 TTL 自动过期。
- **流式队列 / 背压缓冲**：FastAPI 的 SSE 流式输出与 Agent 异步任务之间，用 Pub/Sub 做 token 扇出广播，用 **Redis Streams + 消费组**做可重试、可多消费者分摊的任务队列（官方定位：append-only log + O(1) 随机访问 + consumer groups 消费策略，见 [Redis Streams 文档](https://redis.io/docs/latest/develop/data-types/streams/)）。
- **异步锁与互斥**：多个 worker 抢同一任务时的分布式锁（`SET NX EX` 形状）。

### MinIO/S3 在生产环境解决什么问题

- **非结构化对象的统一存储**：井场文档、测井曲线文件、RAG 语料原文、Agent 生成报告（PDF/CSV）以对象形式存桶，元数据（索引、向量）留在 Postgres/向量库，实现"元数据/对象分离"。
- **大文件直传/直下载**：通过**预签名 URL**让浏览器/前端直接 PUT/GET 对象，文件流不经过 FastAPI 应用进程（`presigned_get_object` / `presigned_put_object` / `presigned_post_policy`，见 [MinIO Python API Reference](https://docs.min.io/aistor/developers/sdk/python/api/)）。
- **国产化部署适配**：MinIO 是 S3 兼容协议的开源实现，可私有部署在油田内网；同一套代码也可用 `boto3` 指到阿里云 OSS / 华为 OBS 等 S3 兼容端点。

### 同类选型差异（一句话版）

- 缓存/队列：Redis vs Memcached（Redis 有持久化、丰富数据结构与 Streams/PubSub，Memcached 只有纯 KV）；Redis vs Kafka（Kafka 吞吐与回放更强，Redis Streams 胜在轻量、低延迟、与缓存同实例复用）。
- 对象存储：MinIO vs 公有云 OSS/S3（MinIO 可私有化、S3 协议兼容；SDK 侧 MinIO 官方 Python SDK 与 boto3 均可用，minio-py 对 MinIO 特性如 `listen_bucket_notification` 支持更完整）。

## 核心能力面

### redis-py（asyncio）关键 API 形状

来源：[redis-py asyncio examples（官方）](https://redis-py.readthedocs.io/en/stable/examples/asyncio_examples.html)

- `import redis.asyncio as redis` —— asyncio 客户端入口；所有命令都是 coroutine，需显式 `await client.aclose()` 断开（无析构兜底）。
- `redis.from_url("redis://localhost:6379?decode_responses=True")` —— URL 建连；支持三种 scheme：`redis://`（TCP）、`rediss://`（TLS）、`unix://`；`protocol=3` 切 RESP3（默认 RESP2）。
- `redis.Redis.from_pool(pool)` / `redis.ConnectionPool.from_url(...)` —— 连接池管理；自定义 pool 共享给多个 client 时需显式 `await pool.aclose()`。
- `client.ping()`、`client.get/set`（KV 缓存 + `ex=` TTL）、`client.set(name, value, nx=True, ex=...)`（分布式锁形状，NX/EX 为 Redis 命令参数）。
- `async with r.pipeline(transaction=True) as pipe:` —— Multi/Exec 事务管道，命令链式缓冲，`await pipe.set(...).set(...).execute()` 才原子提交。
- `r.pubsub()` → `pubsub.subscribe/psubscribe("channel:*")`、`pubsub.get_message(ignore_subscribe_messages=True)`、`r.publish(channel, msg)` —— 发布订阅（适合 token 流扇出）。
- Streams / 消费组（命令级，来自 [Redis Streams 官方文档](https://redis.io/docs/latest/develop/data-types/streams/)）：`XADD key [MAXLEN ~ n] * field value`（追加，`*` 自动生成 ID，MAXLEN 裁剪防无限增长）、`XREADGROUP GROUP g c COUNT n BLOCK ms STREAMS key >`（消费组读）、`XACK`（确认）、`XAUTOCLAIM` / `XCLAIM`（故障转移抢消息）、`XINFO GROUPS`、`XTRIM`。redis-py 中对应 `client.xadd/xreadgroup/xack/xautoclaim`（commands mixin 形状）。
- `redis.asyncio.sentinel.Sentinel([...])` → `sentinel.master_for("mymaster")` —— 哨兵高可用，自动故障转移。
- 生命周期要点：asyncio 下必须显式关闭连接池；建议 FastAPI  lifespan 里建全局 client，shutdown 时 `aclose()`。

### MinIO Python SDK（minio-py）关键 API 形状

来源：[MinIO Python API Reference](https://docs.min.io/aistor/developers/sdk/python/api/)、[minio-py README](https://github.com/minio/minio-py)

- `Minio(endpoint, access_key=..., secret_key=..., secure=True, region=None, http_client=None, credentials=None, cert_check=...)` —— 客户端构造；线程安全但**不可跨进程共享**（多进程须每进程新建）。
- 桶操作：`make_bucket(bucket_name, location='us-east-1', object_lock=False)`、`bucket_exists(bucket_name)`、`list_buckets()`、`remove_bucket(bucket_name)`、`list_objects(bucket_name, prefix='', recursive=True, start_after=...)`（返回 Object 迭代器）、`set_bucket_policy(bucket_name, json_str)`、`set_bucket_encryption(...)`、`set_bucket_versioning(bucket_name, VersioningConfig(ENABLED))`、`set_bucket_lifecycle(...)`（过期/转储规则）。
- 对象上传：`fput_object(bucket_name, object_name, file_path, content_type=..., metadata=...)`（文件路径上传）；`put_object(bucket_name, object_name, data, length, content_type=..., metadata=..., sse=...)`（流式上传，`data` 为带 `read()` 的对象，`length=-1` 表示未知长度并需指定 `part_size` 走 multipart）；返回 `ObjectWriteResult`（含 `etag`、`version_id`）。
- 对象下载/读取：`fget_object(bucket_name, object_name, file_path)`（落盘）；`get_object(bucket_name, object_name, offset=..., length=...)` 返回 `urllib3.HTTPResponse`，**用毕须 `response.close(); response.release_conn()`**（连接复用）；`stat_object(...)` 取元信息；`remove_object/remove_objects(...)` 删除。
- 预签名：`presigned_get_object(bucket_name, object_name, expires=timedelta(...), response_headers=...)` → 下载 URL 字符串，**默认 7 天过期**；`presigned_put_object(bucket_name, object_name, expires=...)` → 直传 URL；`presigned_post_policy(PostPolicy(...))` → 表单直传（可加重定向、大小范围条件）；通用 `get_presigned_url(method, bucket, object, expires=..., response_headers=...)`（GET/PUT/DELETE 均可）。
- 服务端事件：`listen_bucket_notification(bucket_name, prefix=..., events=["s3:ObjectCreated:*"])` 返回事件迭代器（MinIO 扩展，S3 公有云无此 API）。

## 典型用例模式

### 模式 1：缓存 + 会话（最小序列）

```python
# 伪代码形状（来源：redis-py asyncio 官方示例）
import redis.asyncio as redis

r = redis.from_url("redis://localhost:6379?decode_responses=True")
await r.set("session:u123", json.dumps(state), ex=1800)   # 会话，TTL 30min
state = json.loads(await r.get("session:u123"))
await r.aclose()   # asyncio 下必须显式关闭
```

生产要点：FastAPI lifespan 建全局 client；`decode_responses=True` 省去手动 decode；锁用 `SET key val NX EX` 形状。

### 模式 2：SSE token 流扇出（Pub/Sub）

```python
# 伪代码形状（来源：redis-py pubsub 官方示例）
async with r.pubsub() as pubsub:
    await pubsub.subscribe(f"stream:{task_id}")
    while True:
        msg = await pubsub.get_message(ignore_subscribe_messages=True)
        if msg: yield msg["data"]          # SSE 逐 token 推给前端
# Agent worker 侧：await r.publish(f"stream:{task_id}", token)
```

### 模式 3：异步任务队列（Streams 消费组，可重试）

```python
# 伪代码形状（命令语义来源：Redis Streams 官方文档）
await r.xadd("agent:tasks", {"task_id": t, "payload": p}, maxlen_approx=100000)
# worker:
msgs = await r.xreadgroup("workers", "w1", {"agent:tasks": ">"}, count=10, block=5000)
await handle(msgs)
await r.xack("agent:tasks", "workers", *ids)      # 处理完确认
# 挂掉的 worker 的消息留在 PEL，由 XAUTOCLAIM 被其他 worker 接管
```

### 模式 4：文件上传下载 + 预签名直传

```python
# 伪代码形状（来源：MinIO Python API Reference）
from minio import Minio
from datetime import timedelta

client = Minio("minio.petro.internal:9000", access_key=AK, secret_key=SK, secure=True)

if not client.bucket_exists("well-docs"):
    client.make_bucket("well-docs")

client.fput_object("well-docs", "well-a12/log.pdf", "/tmp/log.pdf",
                   content_type="application/pdf")            # 服务端上传
url = client.presigned_get_object("well-docs", "well-a12/log.pdf",
                                  expires=timedelta(hours=2)) # 前端 2h 内直下载
put_url = client.presigned_put_object("well-docs", "incoming/x.csv",
                                      expires=timedelta(minutes=10))  # 前端直传
resp = client.get_object("well-docs", "well-a12/log.pdf", offset=0, length=1024)
try:
    head = resp.read()
finally:
    resp.close(); resp.release_conn()
```

## 选型与版本

- **minio-py**：官方要求 **Python 3.10+**，`pip3 install minio`（来源：minio-py README）。基线建议：minio-py 7.x 最新稳定版。
- **redis-py**：asyncio 支持已合入主包（`redis.asyncio`，前身为 aioredis，来源：redis-py asyncio 示例页）；RESP3 用 `protocol=3`。**具体最新版本号未在本次调研页面直接确认**，落地时以 PyPI 当时的最新 stable 为准。
- **Redis Server**：7.x 稳定线（Streams 消费组、ACL、RESP3 均成熟）；如用 Redis 8.2 可获 `XACKDEL` 等 stream 命令增强（来源：Redis Streams 文档）。
- **MinIO Server**：最新稳定 RELEASE，S3 兼容；预签名默认 7 天过期上限与 SigV4 语义一致（来源：MinIO API Reference）。
- **国产化提示**：minio-py 也可指任意 S3 兼容端点（`endpoint` 换内网地址即可）；纯 boto3 方案差异不大，选 minio-py 的理由是 MinIO 私有部署特性（listen_bucket_notification 等）支持完整。

## 官方文档锚点

- redis-py asyncio examples（连接池/事务/PubSub/哨兵/URL scheme）：https://redis-py.readthedocs.io/en/stable/examples/asyncio_examples.html
- Redis Streams 数据类型文档（XADD/XREADGROUP/XACK/XAUTOCLAIM/XTRIM、消费组语义）：https://redis.io/docs/latest/develop/data-types/streams/
- MinIO Python API Reference（构造函数、桶/对象/预签名全量签名）：https://docs.min.io/aistor/developers/sdk/python/api/
- minio-py Quickstart（安装、Python 3.10+、file uploader 示例、线程/进程安全说明）：https://github.com/minio/minio-py
- 未找到公开文档：redis-py 的"官方推荐缓存封装（如 Cache-aside helper）"——redis-py 本体只提供裸命令客户端，缓存模式需在应用层自行封装，本次未在官方文档检索到更高层的缓存抽象说明。
