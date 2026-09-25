# 设计稿 02：Redis 缓存与 Streams 队列封装

> **红线声明**：本设计稿零真实可运行代码。全部代码块均为**伪代码**（块首标注"伪代码 — 文件:函数"），公开签名取自设计稿 00 登记表 m4 九签名；Redis 调用按 redis-py 官方 API 形状书写（锚 docs/tech-stack/redis-minio.md）：`from_url` 建连、用毕显式 `aclose`、`xadd`（MAXLEN≈）、`xreadgroup`/`xack` 消费组、`xautoclaim` 打捞。
> **本节交付范围**：`m4` 真身三文件——cache-aside 缓存（redis_cache.py）、Streams 任务队列（task_queue.py）、SSE 事件缓冲（event_buffer.py）。**stub 换真身声明**（设计稿 00 登记表 #4）：本节把 FakeRedis 换为真身；FakeRedis 替身段保留（同文件同签名）供后续最小通路设计稿使用。
> **半程边界**（设计范围 F4-2/3）：本节交付**队列机制与封装**——四函数调用序列 + 手动消费者走查。消费方**业务接线**全部不在本节：受理入队在设计稿 19、worker 消费循环与打捞真身在设计稿 21（W-F4-2/3 全程兑现）、会话端点断线续推接线在设计稿 18（W-F1-4 全程兑现）。走查中一律以"调用方（后续设计稿接线）"占位。
> **明确不讲的**（设计范围声明）：消费方接入（设计稿 17/18/21）、Pub/Sub 生产用途（仅对照段出场）。

## 实现清单

- [x] Cache：缓存读写与自增计数封装可用，建连/显式关闭形状符合官方 API（源：卡 `m4` 公开接口）✅ **走查第 0 步**（from_url/aclose 生命周期）+ **主干一第 1~3 步**（get/set/incr 与调用方读模式、计数形状）
- [x] TaskQueue 消费组闭环机制走查通过：入队（容量裁剪）→消费组读取→确认（手动消费者最小通路；worker 真身全程在设计稿 21 兑现）（源：W-F4-2 半程；卡 `m4` 公开接口）✅ **主干二第 4~6 步**（enqueue/consume/ack 官方调用序列）——半程边界：机制与封装归本节，消费循环业务接线归设计稿 21
- [x] TaskQueue 打捞机制走查通过：处理中卡住的消息可被其他消费者接管（真身全程在设计稿 21）（源：W-F4-3 半程；卡 `m4`）✅ **主干二第 7 步**（claim_stale/XAUTOCLAIM）+ **捣乱输入 C**（停消费者）——半程边界同上
- [x] 对照段：消费者全离线再恢复后，Streams（未确认消息持留、可再取）vs Pub/Sub（发后即焚、收不到）对照成立——"任务队列选 Streams 不选 Pub/Sub"的依据落本设计稿（源：W-F4-4）✅ **对照段**（主干二末）
- [x] EventBuffer：按会话追加事件与断点重放封装可用，容量裁剪生效（源：卡 `m4` 公开接口；断线恢复接线在设计稿 18 兑现 W-F1-4）✅ **主干三第 8~9 步**（append 带 MAXLEN≈、replay_since 排他下界）+ **捣乱输入 D**（游标早于窗口的裁剪兜底）——半程边界：Last-Event-ID 头解析与续推话术归设计稿 18
- [x] 越界引用为零（源：modules.md 边界规则表）✅ **越界自查**

---

## 走查：从输入到验收行为

> **主角数据**（业务真数据样子）：
> ① 老王的问数会话 `th-laowang-001` 的上下文（键 `ctx:th-laowang-001`，值=历史轮次列表）；
> ② 主任的 PPT 任务 `wb-20260913-0007`（流 `wenzhi:tasks`，载荷 `{"analysis": "Volve 完井分析"}`）；
> ③ 同一会话的 SSE 事件帧（流 `sse:th-laowang-001`，帧协议见设计稿 01）。
> **地图先行**（三主干与调用方占位）：

```text
伪代码（三主干总览，非代码）

调用方（后续设计稿接线）          Redis 容器 C9 — m4 三封装（共享一个 client，见第 0 步）

问数/问答主循环(设计稿 17/18) ─.读/回填.→ Cache.get / Cache.set          主干一 cache-aside
网关记账(设计稿 07)          ─.原子自增.→ Cache.incr
问智受理(设计稿 19)          ─.入队────→ TaskQueue.enqueue ──┐
问智 worker(设计稿 21)       ─.领取/确认.→ TaskQueue.consume / ack    主干二 Streams 队列
打捞(设计稿 21)              ─.接管────→ TaskQueue.claim_stale ┘ 未确认消息挂 PEL（待确认清单）
SSE 主循环(设计稿 17)        ─.逐帧追加.→ EventBuffer.append          主干三 事件缓冲
断线重连端点(设计稿 18)      ─.断点重放.→ EventBuffer.replay_since ┘ XRANGE 排他下界
```

### 键与常量（本节定形，后续设计稿沿用）

| 用途 | 键形状 | 容量/期限 | 定形依据 |
|---|---|---|---|
| 会话上下文缓存 | `ctx:{thread_id}` | TTL 300 秒 | 会话密度高，短 TTL 保鲜；脏读窗口有界（捣乱 A） |
| 问智任务队列 | `wenzhi:tasks` | MAXLEN≈10000 | 容量裁剪防无限增长（取舍 2） |
| 会话事件缓冲 | `sse:{thread_id}` | MAXLEN≈200 | 每会话断线恢复窗口大小（取舍 3） |
| 用量计数 | `spend:{model_alias}:{日期}` | 日累计，TTL 30 天 | INCR 原子计数；审计表（m3）为对账真源 |

### 第 0 步：连接生命周期——from_url 建连与显式 aclose（三封装共享）

```text
伪代码 — app/cache/redis_cache.py:模块级连接生命周期（三封装共享同一 client）

import redis.asyncio as redis
from redis.exceptions import ConnectionError as RedisConnError, TimeoutError as RedisTimeout

# 建连：官方形状 from_url；decode_responses=True → 读写直接见 str，免手动 decode（官方）
client = redis.from_url("redis://redis:6379?decode_responses=True")

class CacheUnavailable(Exception):
    """Redis 不可达的结构化异常——三封装统一上抛此型，调用方凭它走降级分支"""

def _wrap(e: Exception) -> CacheUnavailable:
    # 主干判断：只有连接类异常翻译为 CacheUnavailable；命令级错误（类型错等）原样上抛
    return CacheUnavailable("redis 不可达，降级或重试")

async def close() -> None:
    await client.aclose()
    # 官方红线：asyncio 客户端无析构兜底，必须显式 aclose（官方生命周期要点）
    # 调用时机：m1 lifespan 关停钩子（装配接线归设计稿 04；本节交付 close 本体与调用形状）
```

机制要点：三个封装共享这一个 client（连接池内建），不各建各连——连接数上限与关闭时机收敛到一处。

### 主干一：cache-aside——读 miss→回源→回填带 TTL（W-F4-1 的 m4 侧）

```text
伪代码 — app/cache/redis_cache.py:Cache.get / Cache.set / Cache.incr（三函数封装）

class Cache:
    async def get(self, key) -> value | None:
        try:
            raw = await client.get(key)               # GET；键不存在官方返回 None → miss 判据
        except (RedisConnError, RedisTimeout) as e:
            raise _wrap(e)                            # 异常去向：结构化上抛，调用方降级直读
        if raw is None:
            return None                               # 主干判断：miss——回源是调用方职责（m4 不 import m3）
        return json.loads(raw)                        # 数据变形：JSON 字符串 → 业务对象

    async def set(self, key, value, ttl) -> None:
        payload = json.dumps(value)                   # 数据变形：业务对象 → JSON 字符串
        try:
            await client.set(key, payload, ex=ttl)
            # 一条 SET ex= 原子写"值+过期"。禁止拆成 set 后补 EXPIRE 两步：
            # 两步之间宕机会留下永不过期的键——缓存永久脏（回填带 TTL 的机制保证）
        except (RedisConnError, RedisTimeout) as e:
            raise _wrap(e)

    async def incr(self, key) -> int:
        try:
            return await client.incr(key)             # INCR 单命令原子自增，并发计数不丢；键不存在从 0 起
        except (RedisConnError, RedisTimeout) as e:
            raise _wrap(e)
```

```text
伪代码 — 调用方 cache-aside 读模式（app/agents/runtime.py，设计稿 18 接线；此处只定形状）

async def load_context(thread_id) -> 上下文:
    key = f"ctx:{thread_id}"
    try:
        ctx = await cache.get(key)
        if ctx is not None:
            return ctx                                          # 命中：零回源
        ctx = await Repository.get_session_history(thread_id)   # miss：回源（m3 公开接口）
        await cache.set(key, ctx, ttl=300)                      # 回填带过期
        return ctx
    except CacheUnavailable:
        return await Repository.get_session_history(thread_id)  # 缓存不可达：降级直读，不拦业务
```

```text
伪代码 — 调用方用量计数（app/gateway/spend_recorder.py:record_spend 内，设计稿 07 接线；此处只定形状）

累计 = await cache.incr(f"spend:{model_alias}:{今天}")   # 例："spend:petro-llm:2026-09-13"
# 返回值即自增后的累计值 → 上游预算判据（over_budget?）读这个数
# 异常去向：CacheUnavailable → 计数失败不拦调用（记账非关键路径），缺口经 Postgres 审计表对账；
#   "只依赖 Redis 计数做预算"的反例记录归设计稿 07（W-F2-3 注明项）
```

### 捣乱输入 A：并发写与回填赛跑——脏读窗口走一遍（双删顺序）

前提：同一会话两个请求并发，R1 读上下文、R2 落新一问一答。时序推演：

```text
伪代码（时序推演，非代码）

t0  R1: Cache.get(ctx:th-laowang-001) → miss
t1  R1: Repository.get_session_history → 读到 v1（3 轮）        ← 回源耗时 t1..t3
t2  R2: save_chat_turn 落第 4 轮（库=v2）；随后调用方以 v2 覆盖回填 Cache.set(ctx, v2, ttl)
t3  R1 的回填迟到：Cache.set(ctx, v1, ttl) —— v1 盖掉 v2        ← 脏读窗口在此刻闭合
t4  后续读命中 → 拿到旧上下文（少第 4 轮），直到 TTL 过期或下次写路径再覆盖
```

顺序取舍与闸（两层兜底）：

1. **写路径顺序纪律=先库后缓存**。反序（先删/先改缓存、后写库）的窗口更差：删缓存到库提交之间，并发读 miss → 读库拿旧值 → 回填旧值，且此刻库还没提交，"缓存与库不一致期"从回源起点拉到写库提交点。
2. **TTL 封顶**：脏值最多存活 ttl（300 秒），窗口量级=一次回源耗时（毫秒级），被 TTL 有界化。
3. **加强选项（经典"延迟双删"）**：写路径覆盖回填后，延迟一小段再删/再覆盖一次，专清 t3 这类迟到回填。代价=多一次写与延迟调度。本系统会话上下文是追加型、读方可容忍缺最后一轮，选 1+2；若业务要求上下文强一致，回模块卡修订流程补失效接口后启用双删——卡面公开接口（get/set/incr）本节不私自扩。
4. **本系统写路径的"删"以覆盖实现**：落库后调用方以最新值 `Cache.set` 覆盖回填（删+回填合一，不引 DEL）；并发赛跑窗口与上面推演同构，兜底同为 TTL。

### 主干二：Streams 任务队列——enqueue→XREADGROUP→XACK→XAUTOCLAIM（W-F4-2/3 机制半程）

```text
伪代码 — app/cache/task_queue.py:TaskQueue.enqueue（数据变形：业务任务 → 流字段 → 消息 ID）

class Job:                                # 队列消息形状（封装层对象；调用方不见 fields 字典）
    msg_id: str      # Redis 生成的流内唯一编号（毫秒-序号）——确认/打捞都以它为凭
    job_id: str      # 幂等键：调用方生成、随消息携带；打捞重做时处理方据此判重（取舍 4）
    job_type: str    # "make_ppt" / "create_image" / "tts"（设计稿 21 编排分发依据）
    thread_id: str   # 交付回流的会话线（完成帧 append 的目标，设计稿 21 用）
    payload: dict    # 业务载荷：{"analysis": "Volve 完井分析", ...}

    async def enqueue(self, stream, job) -> str:
        fields = {                              # Streams 只收扁平字符串键值对——
            "job_id": job.job_id,               # 嵌套结构必须先序列化进单字段
            "job_type": job.job_type,
            "thread_id": job.thread_id,
            "payload": json.dumps(job.payload),
        }
        try:
            msg_id = await client.xadd(stream, fields,
                                       maxlen=QUEUE_MAXLEN, approximate=True)
            # XADD 官方形状：maxlen + approximate=True 即 MAXLEN ~ 裁剪（容量上限，取舍 2）
        except (RedisConnError, RedisTimeout) as e:
            raise _wrap(e)
            # 异常去向：入队失败=受理失败，必须结构化上抛——"已受理"的承诺只有
            #   队列真收到才算数（受理闸）；调用方（设计稿 19）据此给用户失败话术
        return msg_id                           # "*" 自动生成 ID 的返回值
```

```text
伪代码 — app/cache/task_queue.py:TaskQueue.consume（消费组读取）

    async def consume(self, stream, group, consumer, block_ms, count=10) -> list[Job]:
        try:
            await client.xgroup_create(stream, group, id="0-0", mkstream=True)
            # 组不存在则建：组首游标 0-0（从流头投递）——建组前已入队的积压任务不丢；
            # mkstream=True 兼顾流尚不存在时自动建流
        except RedisResponseError as e:
            if "BUSYGROUP" not in str(e):
                raise _wrap(e)
            # BUSYGROUP = 组已存在：消费组闭环的正常分支，不是错误
        try:
            resp = await client.xreadgroup(group, consumer, {stream: ">"},
                                           count=count, block=block_ms)
            # ">" 语义：只取"从未投递给本组"的条目；读到即挂入本消费者的 PEL（待确认清单）
            # block_ms：无新消息最多阻塞这么久——消费循环的节拍器
        except (RedisConnError, RedisTimeout) as e:
            raise _wrap(e)
        if resp is None:
            return []                           # BLOCK 到点无新消息：超时是正常返回值不是异常
        return [Job._from(msg_id, fields)       # 数据变形：[[流名,[(id, fields)...]]] → [Job]
                for _, entries in resp for msg_id, fields in entries]
        # 此刻消息只是"被本消费者认领"——处理与确认是调用方的事（W-F4-2 手动消费者最小通路；
        # 消费循环真身 WenzhiWorker.run 在设计稿 21 接线）
```

```text
伪代码 — app/cache/task_queue.py:TaskQueue.ack

    async def ack(self, stream, group, msg_id) -> None:
        try:
            await client.xack(stream, group, msg_id)
            # XACK 只把消息从本组 PEL 移除——不删除流中条目；
            # 条目留到 MAXLEN 裁剪。"确认"与"物理删除"是两件事
        except (RedisConnError, RedisTimeout) as e:
            raise _wrap(e)
        # ack 责任在调用方（处理成功后才 ack）——卡面注释"处理后调用方 XACK"即此分工
```

```text
伪代码 — app/cache/task_queue.py:TaskQueue.claim_stale（XAUTOCLAIM 打捞 PEL 卡住消息）

    async def claim_stale(self, stream, group, consumer, min_idle_ms, count=10) -> list[Job]:
        jobs, cursor = [], "0-0"
        try:
            while True:
                next_cursor, batch, trimmed = await client.xautoclaim(
                    stream, group, consumer,
                    min_idle_time=min_idle_ms,       # 门限：idle 超过它才认定"卡住"
                    start_id=cursor, count=count)
                # redis-py 7.x 形状返回三元组：(下一游标, [(id, fields)...], 已裁剪条目 id 列表)
                jobs += [Job._from(msg_id, fields) for msg_id, fields in batch]
                # trimmed：流里已被裁、却还挂在 PEL 上的死条目——XAUTOCLAIM 顺手从 PEL 清除，
                #   否则永远堵在待确认清单里（无法处理也无法确认）
                if next_cursor == "0-0":
                    break                            # PEL 扫描完毕
                cursor = next_cursor                 # 没扫完，续扫
        except (RedisConnError, RedisTimeout) as e:
            raise _wrap(e)
        return jobs
        # 接管语义：消息属主从原消费者改挂到本 consumer 名下；原消费者若"复活"对同一消息
        #   的处理仍可能已发生——重做判重靠 job_id 幂等键（取舍 4）
```

### 捣乱输入 C：消费者停了——任务卡 PEL→XAUTOCLAIM 打捞

```text
伪代码（时序推演，非代码）

t0  worker-1 consume("wenzhi","worker-1", block=5000) → 领到 1726...-7（挂入 worker-1 的 PEL）
t1  worker-1 处理到一半进程被停（捣乱输入）——XACK 永远不会发生
t2  期间新任务照常 enqueue；worker-2 用 ">" 读不到 1726...-7：
    它不是"从未投递给本组"的新消息，是挂在他人 PEL 里的孤儿——">" 天生不碰它
t3  worker-2 启动/周期执行 claim_stale(min_idle_ms=60_000)：
    1726...-7 的 idle 已远超 60s → 属主改挂 worker-2 → 处理 → ack —— 打捞闭环（W-F4-3）
t4  保护窗语义：若 worker-1 只是"慢"不是"死"，min_idle_ms 就是它的免抢窗——
    门限必须大于单任务最长处理时长，否则活人被当尸体打捞，同一任务双做
```

### 对照段（W-F4-4）：worker 全离线再恢复——Streams vs Pub/Sub

```text
伪代码（对照推演，非代码）

前提：主任入队 3 个 PPT 任务后，全部 worker 离线 10 分钟，再恢复。

Streams（wenzhi:tasks）：
  离线期间 XADD 的 3 条持留在流里——append-only 日志，持留与订阅者在不在线无关
  worker 恢复 → xreadgroup(">")：组首游标仍停在最后投递位 → 3 条照常领到
  若某条曾被领走未确认 → 它在 PEL 持留 → xautoclaim 可接管（捣乱 C 全流程）
  ⇒ 未确认消息持留、可再取——任务不丢

Pub/Sub（对照形状，redis-minio.md 模式 2：pubsub()/subscribe/get_message/publish）：
  publish 的投递对象只有"当时在线的订阅者"，发后即焚，服务端不存
  worker 离线的 10 分钟里 publish 的任务 = 从未存在过，恢复后无从补领
  且每订阅者各收一份（广播），不是消费组的分摊
  ⇒ 发后即焚、收不到——任务永久丢

结论（W-F4-4 断言）：任务队列选 Streams 不选 Pub/Sub；
Pub/Sub 的正确职责是在线扇出（官方定位"token 流扇出"），生产用途本节不讲（设计范围声明）。
```

### 主干三：事件缓冲——append 带 MAXLEN≈→replay_since(游标) 补发不丢不重

```text
伪代码 — app/cache/event_buffer.py:EventBuffer.append（会话事件按会话线追加）

class EventFrame:                          # 与设计稿 01 锁死的事件帧协议同构
    event_id: str                          # Redis 流 ID（毫秒-序号）——同时是 SSE 的 id: 字段
    event: str                             # agent / token / tool_call / done / error（设计稿 01 五型）
    data: dict

    async def append(self, thread_id, event: dict) -> str:
        fields = {"event": event["event"], "data": json.dumps(event["data"])}
        try:
            event_id = await client.xadd(f"sse:{thread_id}", fields,
                                         maxlen=SSE_EVENTS_MAXLEN, approximate=True)
            # 每会话一条流 + MAXLEN≈200：容量裁剪生效（实现清单第 5 条的"裁剪"在此）
        except (RedisConnError, RedisTimeout) as e:
            raise _wrap(e)
            # 异常去向：上抛调用方（设计稿 17 分支）——降级为"在线推流照常、断点续推暂不可用"，
            #   不拦 SSE 主干；缓冲失效只损失断线恢复能力
        return event_id
        # 编号递增机制："*" 自动 ID = <毫秒时间戳>-<同毫秒序号>，Redis 保证同流严格递增
        #   → "会话内事件编号递增"不自己维护计数器，流 ID 天然承担；
        #   客户端回传的 Last-Event-ID（设计稿 18 解析）就是这个编号
```

```text
伪代码 — app/cache/event_buffer.py:EventBuffer.replay_since（断点重放：不丢不重）

    async def replay_since(self, thread_id, last_event_id) -> list[EventFrame]:
        key = f"sse:{thread_id}"
        has_cursor = bool(last_event_id) and last_event_id != "0-0"
        try:
            if has_cursor:
                earliest = await client.xrange(key, min="-", max="+", count=1)
                # 窗口判定：最早存活帧仍在游标之后 ⇒ 游标到窗口之间有帧已被 MAXLEN 裁掉
                if earliest and _id_gt(earliest[0][0], last_event_id):
                    raise ReplayGap(earliest_id=earliest[0][0])
                    # 异常去向：不静默续推——静默 = 把"丢过帧"演成"本来没有"；
                    #   调用方（设计稿 18）凭 earliest_id 转"会话中断较久，请重新提问"话术
                if not earliest:
                    raise ReplayGap(earliest_id=None)
                    # 边界：流已裁空且游标非空——无法证明游标之后无帧，
                    #   宁可走缺口话术，不静默发空数组冒充"没丢"
            rows = await client.xrange(key,
                                       min=f"({last_event_id}" if has_cursor else "-",
                                       max="+")
            # "(" 排他下界（Redis 6.2+ 官方形状）：严格大于游标 → 客户端已收的帧一帧不发（不重）
        except (RedisConnError, RedisTimeout) as e:
            raise _wrap(e)
        return [EventFrame(event_id=i, event=f["event"], data=json.loads(f["data"]))
                for i, f in rows]                  # XRANGE 按 ID 升序返回 → 补发天然保序（不乱序）
```

```text
伪代码 — app/cache/event_buffer.py:_id_gt（游标比较辅助——排序语义闸）

def _id_gt(a: str, b: str) -> bool:
    # 流 ID 是 "毫秒-序号"：必须按 (int(毫秒), int(序号)) 数值序比较——
    # 字符串字典序会判错（"9-0" 字典序大于 "10-0"），缺口判定就漏闸
    ma, sa = a.split("-"); mb, sb = b.split("-")
    return (int(ma), int(sa)) > (int(mb), int(sb))
```

### 捣乱输入 D：游标前的帧已被 MAXLEN 裁掉——兜底设计

```text
伪代码（时序推演，非代码）

t0  会话 th-laowang-001 已产 220 帧 → MAXLEN≈200 裁掉最早约 20 帧，最早存活帧=21-3
t1  客户端带 Last-Event-ID: 5-0 重连（游标早于窗口）
t2  replay_since：earliest=21-3，_id_gt("21-3","5-0")=True → ReplayGap(earliest_id=21-3)
t3  调用方（设计稿 18）绝不从 21-3 起续推冒充断点续传——那会让客户端误以为
    6..21 段"不存在是正常的"，帧序在客户端侧静默断裂
    → 话术"会话中断较久，请重新提问"；新提问从新流全量开始（不静默丢帧）
t4  对照（正常分支）：Last-Event-ID: 150-0 → xrange(min="(150-0", max="+")
    → 只补 151-0 之后的存活帧：窗口内不丢、游标后不重、按 ID 升序不乱序
```

## 关键判断的取舍记录

1. **任务队列选 Streams 不选 Pub/Sub**（W-F4-4）——依据是投递语义：Streams 是服务端持留的 append-only 日志，消费组记组首游标、PEL 记未确认，离线恢复可再取、卡住可打捞；Pub/Sub 是发后即焚的扇出，订阅者不在线=这条消息对它不存在。备选还有 List（LPUSH/BRPOP）：能积压但没有消费组/PEL/打捞，多消费者与故障接管都要自己写。换边条件：纯在线广播（token 流扇出类）用 Pub/Sub；吞吐/长回放诉求上量后再评估 Kafka（本系统规模不需要）。
2. **MAXLEN≈近似裁剪，不用精确**——近似模式让 Redis 按整块（radix tree 节点）批量裁，XADD 写路径近似 O(1)；精确模式每次追加都要遍历到恰好 N 条，热写路径上付确定性开销。本节三处容量（队列 10000/会话缓冲 200）语义都是"上限防失控"，不是精确配额，±少量条目无业务后果。换边条件：出现"严格不得超过 N 条"的合规类配额时，该流改精确裁剪或独立 XTRIM。
3. **游标与 MAXLEN 的兜底关系：ReplayGap 结构化缺口**——MAXLEN 裁剪使"任意旧游标都能续传"不可能永远成立，二者是容量与承诺的矛盾。兜底不是加大 MAXLEN（窗口再大也终会裁到），而是把"游标早于窗口"做成结构化信号（ReplayGap 携带最早存活编号）上抛，调用方转显式话术——不静默续推（假装没丢）、也不静默发空（假装完整）。备选"不裁剪无限增长"以内存换承诺，流增长与线上会话量成正比，不可取。
4. **队列不去重，幂等责任上移**——XADD 不判重，XAUTOCLAIM 打捞=至少一次投递：同一消息可能被原消费者和接管者各处理一次。卡内不判重（队列保持薄、业务无关），改为消息强制携带 job_id 幂等键，判重责任在处理方（设计稿 21 编排时按 job_id 查产物元数据）。备选：队列层维护"已处理集合"（SET NX 判重）——队列变厚且要为每种业务定义完成判据，通用性差。换边条件：出现非幂等且代价高的任务类型时，在业务侧加处理记录，而非改队列。
5. **卡面公开接口无 DEL/判重/组管理——纪律处理**——本设计稿坚持九签名不私自扩：失效以"覆盖回填"实现（捣乱 A 第 4 点）、判重上移处理方（取舍 4）、XGROUP CREATE 作为 consume 内部前置（第 5 步）。若业务推进要求公开面扩（如 Cache.delete），按 modules.md 纪律修订模块卡后加行，不在设计稿层发明公开接口。

## 锚点对照精要

**docs/tech-stack/redis-minio.md · redis-py asyncio 客户端与生命周期**（卡 `m4` 锚点：redis-py asyncio）
redis-minio.md：asyncio 客户端入口是 `import redis.asyncio as redis`，所有命令都是 coroutine；官方明言无析构兜底、必须显式 `await client.aclose()`；`from_url` 支持 redis://、rediss://（TLS）、unix:// 三 scheme 与 `decode_responses=True`；生命周期建议 FastAPI lifespan 建全局 client、shutdown 时关闭。落点：第 0 步模块级 client 三封装共享、aclose 交付本体且调用时机指到 lifespan（接线归设计稿 04）；decode_responses=True 使 get/set/incr 读写直接见 JSON 字符串。

**docs/tech-stack/redis-minio.md · KV 缓存原语与官方无缓存抽象**（卡 `m4` 锚点：官方无缓存抽象）
redis-minio.md：缓存能力就是裸命令 `get/set`（`ex=` TTL）与 `SET NX EX` 锁形状，且调研结论明记"redis-py 本体只提供裸命令客户端，未检索到官方 cache-aside helper，缓存模式需应用层自行封装"。落点：Cache 三函数即对这组裸命令的最薄封装（get 带序列化、set 一条 `SET ex=` 原子带 TTL、incr 原子计数）；miss 回源与降级直读两个分支留在调用方——m4 是叶子卡，不 import m3（边界纪律）。

**docs/tech-stack/redis-minio.md · Streams/消费组命令形状**（卡 `m4` 锚点：XADD/XREADGROUP/XACK/XAUTOCLAIM）
redis-minio.md 转述 Redis Streams 官方定位：append-only log + O(1) 随机访问 + consumer groups；命令形状 `XADD key [MAXLEN ~ n] * field value`、`XREADGROUP GROUP g c COUNT n BLOCK ms STREAMS key >`、`XACK` 确认、`XAUTOCLAIM/XCLAIM` 故障转移抢消息、另有 XINFO GROUPS/XTRIM。落点：四函数一一对应四命令（主干二），redis-py 侧为 `xadd/xreadgroup/xack/xautoclaim`（commands mixin 形状）；XGROUP CREATE 作为 consume 的内部前置并处理 BUSYGROUP；min_idle_ms 承载 XAUTOCLAIM 的 idle 参数；XTRIM 不单列——容量语义统一走 XADD 的 MAXLEN≈。

**docs/tech-stack/redis-minio.md · Pub/Sub 形状（仅对照）**（卡 `m4` 锚点：Pub/Sub 仅对照不用于任务）
redis-minio.md：`r.pubsub()` → `subscribe/psubscribe`、`get_message(ignore_subscribe_messages=True)`、`r.publish(channel, msg)`，官方定位适合 token 流扇出。落点：Pub/Sub 只在对照段出场（W-F4-4 的反例半边），不写进任何生产路径；其"广播不分摊、发后即焚"两条语义正是对照段的断言依据。

## 越界自查（源：modules.md 边界规则表）

- **m4 是叶子卡**：本设计稿三文件不 import 任何业务模块；一切业务动作以"调用方（后续设计稿接线）"占位并注明设计稿号（读模式→设计稿 18、计数→设计稿 07、受理→设计稿 19、消费循环与打捞→设计稿 21、逐帧追加→设计稿 17）。
- **边界规则表逐行核对**：无一行以 m4 为主语（叶子无出边）；本设计稿未引入任何跨模块调用边，架构大图同步零新增边（设计范围"图节点范围"声明）。
- **签名纪律**：公开签名取自设计稿 00 登记表 m4 九签名；本节新增仅机制件——结构化异常（CacheUnavailable/ReplayGap）、消息与帧数据形状（Job/EventFrame）、内部辅助（_id_gt）与键/常量定形表，全部落在 app/cache/ 三文件内，未发明新公开接口。
- **零代码红线**：全文代码块均标注"伪代码"；无 tests/、无 CI 内容。
