# 设计稿 21：问智异步 worker（问智链换真身）

> **红线声明**：本设计稿零真实可运行代码。全部代码块均为**伪代码**（块首标注"伪代码 — 文件:函数"），公开签名取自 00 号骨架登记 m15 三签名（run / _handle_job / notify_done）。设计范围框架红线为"无新点名框架"但**真实调用序列必须出现**：①Redis Streams 消费组经设计稿 02 封装按官方语义真写（锚 docs/tech-stack/redis-minio.md）——`xreadgroup(GROUP …, block=5000)` 认领、`xack` 处理后确认、`xautoclaim` 打捞接管，调用序列逐条落在主干一，不做"概念性提及"替代；②生成件沿用设计稿 20 官方形状（`make_ppt` / `create_image` / `tts` 签名原样、`任务失败` 三原因码结构化异常照单消费）；③minio-py 同步客户端的线程池托底契约照设计稿 05 取舍 1 编排。worker 只组合公开接口，零新框架。
> **stub 换真身声明**（00 号骨架登记 #15）：本节把 **EchoJob（手动 enqueue + 同步 _handle_job 的替身）** 换为真身 **WenzhiWorker**——消费循环、启动/周期打捞、失败路径（重试→标失败→通知）、交付编排四处真身，EchoJob 替身段按登记纪律**删除**。**问智链自此全程真身**（受理设计稿 19 → 生成件设计稿 20 → worker 本节），四链路替身声明的最后一站收口。
> **边界声明**：本节代码只落 `m15` 一文件（`app/multimodal/worker.py`）。对 `m4`（TaskQueue.consume/ack/claim_stale、EventBuffer.append、Cache.incr/set——消费循环与通知）、`m10`（make_ppt/create_image/tts 与两个结构化异常）、`m5`（put_stream/fetch_and_rearchive）、`m3`（save_artifact_meta/get_artifact_meta）、`m12`（Tracer.start_span/end_span/trace_run——按受理 run_id 续树）全部为**使用公开接口**，零内部 import、零接口修改。**m13 不 import m15**（边界规则第 4 行）：worker 是被队列解耦的消费方，运行时调用路径上零本节符号。**m10 不直写 m5/m3**（边界规则第 5 行）：产物落桶与元数据由本节 worker 统一经手，转存义务一处管——本节就是这一行的兑现位。
> **明确不讲的**（设计范围声明）：生成件本体（设计稿 20）、受理入队（设计稿 19）、队列封装（设计稿 02）。

## 实现清单

- [x] 问智交付全链：受理任务→worker 消费→生成演示文稿→产物落桶→元数据入库→完成通知→经产物下载端点取预签名 URL 下载（源：W-F10-1）✅ **主干一**（消费认领→处理→确认）+ **主干二**（编排生成→落桶转存）+ **主干三**（元数据入库与下载读侧）+ **主干四**（完成帧→刷新/重连补推→预签名直下载；全链最后一跳的帧面观感见 t3/t4）
- [x] 消费组闭环真身：入队→消费组读取→处理→确认；多消费者可分摊、任务不丢（源：W-F4-2）✅ **主干一**（run 循环：`XREADGROUP ">"` 认领→`_handle_job`→`XACK`；worker-1/worker-2 分摊时序；"任务不丢"的机制位=流持留+PEL+处理成功后才确认）
- [x] 卡住任务打捞真身：处理中崩溃的消息留待领区，被其他实例打捞接管重试，任务最终一致（源：W-F4-3）✅ **主干一·捣乱输入 A**（terminate→消息留 PEL→启动+周期 `claim_stale` 接管→job_id 幂等键防重复生成扣费→最终一致）
- [x] 万相失败路径：生成任务失败→重试后标任务失败→失败说明通知，不落半成品（源：W-F10-3）✅ **主干五**（三原因码结构化→重试预算→标失败→失败帧通知，不冒充成功、零元数据落库、追踪树终态 failed）
- [x] 转存义务闸：临时地址过期/下载失败→重试后标失败；临时地址绝不直接落库，产物引用始终指向对象存储（源：W-F5-3）✅ **主干二·转存段**（"取址即转存"正面走线）+ **转存失败分支**（StorageError 退避重试→标 FAILED→错误帧通知；三道闸：函数形状闸+顺序闸+时点契约闸）
- [x] 本节把设计稿 19 的 EchoJob 替身换为真身 worker（源：卡 `m15` Adapter）✅ 头部 stub 换真身声明 + **主干一**（EchoJob 手动替身段删除；消费循环/打捞/失败路径/交付四处真身）+ **越界自查**
- [x] 越界引用为零（源：modules.md 边界规则表）✅ **越界自查**

---

## 走查：从输入到验收行为

> **主角数据**（业务真数据样子，沿设计稿 19/20 的同一会话线）：
> ① 主任（汇报人，会话 `th-zhuren-021`）说 **"把刚才这份分析做成 PPT，配一张注水剖面示意图，再出个语音解读"**——设计稿 19 受理入队的复合交付单（W-F10-1 主角）：job 载荷 `{"job_id":"job-0913","job_type":"ppt","thread_id":"th-zhuren-021","payload":{"brief":"把这份分析做成 PPT，配一张注水剖面示意图，再出个语音解读","analysis":{"标题":"F-1 井产量预测月报（2026-08）","结论要点":["日产液平稳缓降，月末约 42 方/日","含水率上升 2.1 个百分点，建议加强注采调配","P10–P90 区间 38–47 方/日"],"关键数值":{"预测终点方每日":42,"区间低":38,"区间高":47},"图表数据":{"日期":["09-01","09-15","09-30"],"日产液":[45,43,42]},"图件引用":"artifact://charts/F-1_30d_forecast.png","快照来源":"问数运行 run-t2s-0913"},"analysis_ref":"snap-th-zhuren-021-last","run_id":"run-wz-1726877000","requested_by":"zhuren"}}`——分析 JSON 随载荷内联（取舍 4）；`job_type` 的取值语义=设计稿 02 Job 契约（生成件粒度），复合交付的清单解析归 worker（设计稿 19 受理段占位"类型细分编排归 worker"的兑现）。
> ② 主任补的第二单 **"再配一张注水剖面示意图"**（`job-0914`，单产物 create_image）——捣乱 B 的最纯失败形状主角（W-F10-3）。
> ③ 阿强发布新版本：worker-1 执行到一半被 terminate——捣乱 A 主角（W-F4-3）。
> **对账注（Job 契约的接缝读法）**：设计稿 02 enqueue 只序列化 job_id/job_type/thread_id/payload 四字段——设计稿 19 装配字典的 run_id/requested_by 随 payload 下发；worker 侧 `Job._from` 还原后，job_id/job_type/thread_id 直接可读，brief/analysis/analysis_ref/run_id/requested_by 从 `job.payload` 读。
> **地图先行**（本节三件与相邻设计稿接缝，后文引用不重画）：

```text
伪代码（问智交付链总览，非代码）

受理侧（设计稿 19 已接线）                 问智模块容器 C7 — app/multimodal/worker.py（本节真身）
主任 ─dispatch("wenzhi")→ 装配→入队即回      │
     │                                     ⓪ WenzhiWorker.run 消费循环           主干一
     ▼                                        启动+周期 claim_stale 打捞（PEL 接管，捣乱 A）
任务队列 C9 wenzhi:tasks ─XREADGROUP 认领→   │
     │                                     ① WenzhiWorker._handle_job 编排        主干二
     │                                        幂等闸（get_artifact_meta）→ 交付清单解析 →
     │                                        逐项：调生成件（设计稿 20 签名）→ 转存义务（设计稿 05，
     │                                        W-F5-3）→ put_stream 落桶 → save_artifact_meta（设计稿 04）
     │                                     ② WenzhiWorker.notify_done 完成帧      主干四
     └─XACK 确认（成功/失败都确认，取舍 3）←─────┘
完成帧 → 事件缓冲 C9 → 断点续推读侧（设计稿 18，零改动）→ 主任"PPT 已就绪 [预签名下载]"
失败帧 → 同一条会话事件流 → 主任"为什么没图"（失败也是交付，通知必达）  主干五
追踪：worker 侧 span 按受理 run_id 续树，交付收口 trace_run（设计稿 19 主干 D 留位兑现）
```

### 主干一：消费循环——启动打捞→阻塞认领→逐单处理→确认（W-F4-2 全程）

```text
伪代码 — app/multimodal/worker.py:WenzhiWorker.run（m15；签名=00 号骨架登记原文）

_STREAM = "wenzhi:tasks"              # 设计稿 02 键表定形：MAXLEN≈10000，沿用
_GROUP = "wenzhi"                     # 消费组名（W-F4-2 形状 GROUP wenzhi）
_CONSUMER = f"worker-{进程标识()}"     # 组内消费者名 worker-1/worker-2…——多实例分摊的单位
_BLOCK_MS = 5000                      # 阻塞节拍（W-F4-2 形状 block=5000）
_CLAIM_MIN_IDLE_MS = 20 * 60 * 1000   # 打捞门限：必须大于复合单最长处理时长（万相轮询总超时 10 分钟
                                      #   + PPT/tts 生成与转存落库余量）——设计稿 02 捣乱 C t4 纪律的定形：
                                      #   门限内的"慢"是活人的免抢窗，门限外的 idle 才认定"卡住"
_SWEEP_EVERY = 24                     # 周期打捞：每 24 个阻塞周期（约 2 分钟）扫一轮 PEL——
                                      #   只在启动打捞则"其他实例打捞"仅在重启时成立（取舍 3）

async def run() -> Never:             # 独立进程入口：与宿主共用同一套环境配置与 m4/m5/m3 装配
    # ── 第 0 段 启动打捞（W-F4-3 半程的真身接线）：先把历史遗留的 PEL 卡住消息认领过来，再进读循环──
    await _打捞一轮()
    # ── 第 1 段 消费循环（W-F4-2 真身）：阻塞读 → 逐条处理 → 确认 ──
    轮次 = 0
    while True:
        try:
            jobs = await TaskQueue.consume(_STREAM, _GROUP, _CONSUMER, block_ms=_BLOCK_MS)
            #   ★ 官方语义：XREADGROUP GROUP wenzhi <consumer> COUNT 10 BLOCK 5000 STREAMS
            #   wenzhi:tasks > —— ">" 只取"从未投递给本组"的新消息；读到即挂入本 consumer 的
            #   PEL（待确认清单）。"认领"先于"执行"：从此刻起这条消息的责任人是本进程
            for job in jobs:                  # 逐条处理——一条失败不拖垮同批其余任务
                await _处理一条(job)
        except CacheUnavailable:              # m4 结构化异常（设计稿 02 契约）：Redis 不可达
            await 退避重试等待()               #   异常去向：不崩溃不吞单——未确认消息全在流里/PEL 里
            continue                          #   （不在进程内存），进程活着等恢复，零任务丢失
        轮次 += 1
        if 轮次 % _SWEEP_EVERY == 0:
            await _打捞一轮()                 # 周期打捞：长驻实例也参与接管（W-F4-3 的"其他实例"）

async def _打捞一轮() -> None:
    stale = await TaskQueue.claim_stale(_STREAM, _GROUP, _CONSUMER, _CLAIM_MIN_IDLE_MS)
    #   ★ 官方语义：XAUTOCLAIM —— idle 超过门限的 PEL 条目属主改挂本 consumer，
    #   顺手清除"流里已裁、PEL 还挂着"的死条目（设计稿 02 交付的三元组形状）
    for job in stale:
        await _处理一条(job)                  # 打捞到的走完全相同的处理路径——打捞不是特例
```

```text
伪代码 — app/multimodal/worker.py:_处理一条（m15 私有；确认时机与失败出口都在这一层）

async def _处理一条(job) -> None:
    根 = Tracer.start_span(job.payload["run_id"], "交付编排")    # m12：按受理 run_id 续树
    try:                                                        # （设计稿 19 主干 D 留位的兑现位）
        引用包 = await _handle_job(job)          # 主干二：编排+交付（含通知）
        await TaskQueue.ack(_STREAM, _GROUP, job.msg_id)
        #   ★ 官方语义：XACK 把消息移出本组 PEL——只删待确认标记，不删流中条目；
        #   "处理后调用方确认"（设计稿 02 契约）=处理成功才 ack：ack 之前崩溃，消息还在 PEL 可打捞
        Tracer.end_span(根, attrs={"job_id": job.job_id, "终态": "delivered"})
    except 交付失败 as e:                        # 生成/转存重试超限 或 不可恢复输入错——统一失败出口
        await _标失败并通知(job, e)              # 失败帧 notify（主干五）——失败也是交付
        await TaskQueue.ack(_STREAM, _GROUP, job.msg_id)   # ★ 失败也确认：任务生命周期终点=
        Tracer.end_span(根, attrs={"job_id": job.job_id,        #   "成功交付"或"显式失败交付"两种，
                                  "终态": "failed", "reason_code": e.reason_code})   #   都出 PEL（取舍 3）
    except CacheUnavailable:                     # Redis 不可达：处理不了也通知不了——不 ack、不标失败
        Tracer.end_span(根, attrs={"终态": "deferred"})
        raise                                    #   消息留 PEL，恢复后由打捞重做（幂等闸兜住，取舍 2）
    tracer.trace_run(job.payload["run_id"])      # 交付收口落盘：同一 run_id 第二次 trace_run=
                                                 #   受理树与交付树两段，JSON 行按 run_id 检索两段都在
```

**W-F4-2 主角走线（多消费者分摊）**：

```text
伪代码（时序推演，非代码）

t0  设计稿 19 受理：主任的 job-0913 经 TaskQueue.enqueue XADD 进 wenzhi:tasks（msg_id="1726877000-1"）
    ——入队即回受理帧，worker 何时消费与运行时无关（m13 不 import m15，边界规则第 4 行）
t1  worker-1 与 worker-2 同组长驻：各自 consume(">"，block=5000) 阻塞等新消息；
    job-0913 与紧随其后的 job-0914 先后被 Redis 投递给"当时空手"的消费者——
    两条消息分挂在 worker-1 / worker-2 各自的 PEL 上：分摊是消费组的天然行为，不排队不抢占
t2  worker-1 对 job-0913：_处理一条 → _handle_job（主干二）→ 成功 → XACK —— 消息出 PEL
t3  "任务不丢"的三个机制位：①流是 append-only 持留日志（MAXLEN≈10000 未裁到就一直在）；
    ②未确认消息挂 PEL 不消失；③ack 责任在处理成功之后（处理中崩溃=消息还在，可打捞）。
    对照 worker 全离线：流与 PEL 都在 Redis 侧，恢复后 ">" 续取新消息、claim_stale 接管旧消息
    （设计稿 02 对照段 W-F4-4 的机制，本节是它的消费方接线）
```

### 主干一·捣乱输入 A：执行到一半被 terminate——PEL 打捞接管，幂等键防重复扣费（W-F4-3 全程）

```text
伪代码（时序推演，非代码）

t0  worker-1 认领 job-0913 → 幂等闸查无元数据 → 逐项编排：PPT 项已 落桶+落库（产物号 job-0913-0），
    正在 create_image 轮询示意图项——整单还剩最后一项没交付
t1  阿强发布新版本，worker-1 容器被 terminate。XACK 永远不会发生：job-0913 留在 worker-1 的 PEL
    （待确认清单），流中条目原样持留——这就是"处理中崩溃的消息留待领区"
t2  worker-2（长驻）在下一个周期打捞扫到它：idle 已超 20 分钟门限 → XAUTOCLAIM 属主改挂 worker-2
    → _处理一条(job-0913)。滞留窗口=门限本身（最坏约 20 分钟+扫描间隔）：这是防"误抢活人"
    的对价——门限必须大于单任务最长处理时长，否则慢任务被当死任务双做（设计稿 02 捣乱 C t4）
t3  worker-2 的 _handle_job 幂等闸（主干二第 1 段）：get_artifact_meta("job-0913-0") 命中
    → PPT 项跳过生成（万相重做=重新排队重新扣费，这就是幂等键防重复生成扣费的落点）；
    示意图项查无元数据 → 只重做这一项（重试预算经 Redis 计数继承——t0 的崩溃点在重试中途也不放大预算）
t4  示意图项完成 → 整单引用齐 → notify_done（artifact_ready 帧，与"假如第一次跑完"内容一致——
    重复帧无害，客户端按帧幂等渲染）→ TaskQueue.ack → 消息出 PEL —— 任务最终一致（W-F4-3 期望行为）
闸在哪：①min_idle 门限（活人免抢窗）②job_id 幂等闸（重做不重复扣费的上限保障）③重试预算持久化
    （防 crash-loop 无限重试）。拦完数据去哪：没有数据被拦——打捞是恢复机制，拦的是"同任务双做"
    与"重复生成的钱"；已知残余窗口：崩溃发生在生成项中途 → 该项重做重扣费（上游万相无幂等键，
    取舍 2 记账）
```

### 主干二：编排与交付——_handle_job 一单三产物（W-F10-1 中段 + W-F5-3 全程）

```text
伪代码 — app/multimodal/worker.py:WenzhiWorker._handle_job（m15；签名=00 号骨架登记原文；
         主干判断/数据变形/异常去向三层不省）

async def _handle_job(job) -> 产物引用:
    run_id = job.payload["run_id"]
    引用包 = {"job_id": job.job_id, "run_id": run_id, "items": []}   # 产物引用=worker 内部随行包
                                                                     # （notify_done 的 data 从它派生）
    # ── 第 0 段 交付清单解析（设计稿 19 受理占位"类型细分编排归 worker"的兑现）──
    清单 = await _解析交付清单(job)
    #   受理替身只把消息粗分类（"PPT"→ppt）；真身按 brief 解析完整交付清单：
    #   "做成 PPT，配一张注水剖面示意图，再出个语音解读"
    #   → [{kind:"make_ppt", 进料:payload["analysis"], 模板:"模板-月报.pptx"},
    #      {kind:"create_image", prompt:"油田五点法井网注水剖面示意图：地层剖面，注入水沿箭头
    #                                  方向驱替，油藏工程制图风格"},
    #      {kind:"tts", text:由结论要点拼装的解读词}]  → tts 双产物展开为音频/字幕两个条目，
    #      同一交付循环各走一遍，交付循环零特判（W-F10-4 双产物）
    if not 清单:
        # ── 异常去向：解析不出任何交付项——空单零假受理，走失败出口（不发完成帧不静默 ack）──
        raise 交付失败(原因码="empty_deliverables", 用户话术="没有从这条消息里解析出要交付的内容",
                       失败项=[], 已交付=[])
    # ── 第 1 段 幂等闸（取舍 2）：打捞重做的第一问——"哪些项已经交付过了？"──
    待做 = []
    for 项序号, 项 in enumerate(清单):
        meta = await Repository.get_artifact_meta(f"{job.job_id}-{项序号}")
        #   ★ m3 读侧（modules.md m3 卡"设计稿 05 发现补"行）：产物号=幂等键=元数据主键。
        #   判重责任在处理方（设计稿 02 取舍 4）——队列不去重，打捞是至少一次投递，重做靠这里免重复
        if meta is not None:
            引用包["items"].append(meta)     # 已入库 ⇒ 已完整走过 生成→转存/落桶→落库（顺序闸见下块）
        else:
            待做.append((项序号, 项))
    # ── 第 2 段 逐项 生成→交付（顺序执行：一项的重试不波及已完成项）──
    for 项序号, 项 in 待做:
        with tracer.span(run_id, f"生成：{项.中文名}"):
            候选 = await _调生成件(项)       # 主干判断：生成异常三路去向（下块）
        with tracer.span(run_id, f"交付：{项.中文名}"):
            meta = await _交付单产物(job, 项序号, 候选)   # 转存义务（W-F5-3）+ 落库，见下块
            引用包["items"].append(meta)
    # ── 第 3 段 完成通知（卡面 _handle_job 注释的末环"→ 通知"）──
    await self.notify_done(job.thread_id, 引用包)           # 主干四；通知失败→CacheUnavailable 上抛
    return 引用包                            # → _处理一条 ack。通知失败的重放路径：重做时第 1 段
                                             #   幂等闸整单命中，直接重发完成帧——通知失败不吞单
```

```text
伪代码 — app/multimodal/worker.py:_调生成件（m15 私有；分发表——设计稿 20 签名原样消费）

async def _调生成件(项) -> 产物候选:
    match 项.kind:
        case "make_ppt":
            return await make_ppt(项.进料, 项.模板)        # 设计稿 20 主干一：PptFile{流, 扩展名, 页数}
        case "create_image":
            return await create_image(项.prompt)           # 设计稿 20 主干三：{task_id, urls}
            #   异常去向① 生成输入不合（prompt 越界等）→ 不可恢复，零重试上抛——重试同参必再失败
            #   异常去向② 任务失败（三原因码：image_task_failed/timeout/rejected）→ 主干五重试语义
        case "tts":
            return await tts(项.text)                      # 设计稿 20 主干五：{音频, 字幕, 音色}
    # 产物候选=设计稿 20"生成与交付分离"的接缝：生成器零落桶零落库零通知（设计稿 20 越界自查已核），
    # 交付政策全在本层——这就是边界规则第 5 行"转存义务一处管"的消费侧形态
```

```text
伪代码 — app/multimodal/worker.py:_交付单产物（m15 私有；W-F5-3 全程兑现——转存义务的履约编排）

async def _交付单产物(job, 项序号, 候选) -> ArtifactMeta:
    产物号 = f"{job.job_id}-{项序号}"                       # 幂等键=元数据主键（第 1 段判据）
    对象键 = f"artifacts/{job.thread_id}/{产物号}{候选.扩展名}"   # 设计稿 05 对象键规则：随会话分域
    if 候选.get("urls"):                                    # ── 分支 A：外源临时地址（万相图）──
        for url in 候选["urls"]:                            #   OSS 临时地址 24h 过期（官方文档/设计稿 20 事实）
            key = await _转存重试(url)
            #   ★ 取址即转存：create_image 返回与 fetch_and_rearchive 之间不插任何其他步骤
            #   （设计稿 20 时点契约的兑现位——24h 刻度从 SUCCEEDED 起算，拖延=过期死链）
            object_key = key                                #   m5 派生的桶键（签名 (url, bucket)->key）
    else:                                                   # ── 分支 B：本地候选流（PPT/音频/字幕）──
        object_key = 对象键
        await _线程池(lambda: Storage.put_stream("artifacts", 对象键, 候选.流))
        #   ★ 设计稿 05 取舍 1 契约兑现：minio-py 同步客户端真网络 IO 托底线程池，事件循环不阻塞；
        #   同键覆盖写天然幂等——打捞重做对同产物号重复落桶无副作用
    meta = ArtifactMeta(产物号=产物号, bucket="artifacts", object_key=object_key,
                        种类=候选.种类, 所属会话=job.thread_id, 创建时刻=时钟.now())
    await Repository.save_artifact_meta(meta)               # m3 写侧（设计稿 04 签名原样；六字段对账）
    #   ★ 顺序闸：落库只在 转存/落桶 成功之后——元数据行存在 ⇒ 对象必已在桶，
    #   幂等闸拿"元数据是否存在"判"是否已交付"才有判据（倒序则判据是假的）
    return meta
    # 异常去向：StorageError → _转存重试预算耗尽上抛 → 交付失败 → 主干五；
    #   此时零元数据行（顺序闸），桶里或无对象（下载失败在 put_stream 前）、
    #   或有无引用孤儿对象（put_stream 后崩溃——无引用即无害垃圾，不指错）

async def _转存重试(url) -> str:
    for 尝试 in range(_RETRY_LIMIT + 1):
        try:
            return await _线程池(lambda: Storage.fetch_and_rearchive(url, "artifacts"))
            #   m5 公开接口（设计稿 05 主干五）：GET 临时地址字节流 → put_stream 入桶 → 返回桶键。
            #   函数形状闸：返回值就是转存后的 key——调用方拿不到"临时 URL 落库"的接口面
        except StorageError:
            if 尝试 == _RETRY_LIMIT:
                raise 交付失败(原因码="rearchive_failed", 上游摘要=url 过期/下载失败摘要)
            await asyncio.sleep(2 ** 尝试)                  # 退避重试：为瞬态网络错留，不为死链留
            #   重试仍 403（签名已过期——设计稿 20 捣乱 A 的第 25 小时场景）→ 不可逆：
            #   图没了且不可从死链复活，重生成=重新排队重新计费——失败帧里写明，不静默
```

**W-F5-3 全程两副面孔**：

```text
伪代码（时序推演，非代码）

【正面：24h 窗口内转存】
t0  create_image 轮询 SUCCEEDED → {task_id:"…", urls:["https://oss…?Expires=<24h 签名>"]}
t1  _交付单产物 分支 A：立即 fetch_and_rearchive(url, "artifacts")——m5 内部 GET 字节流
    → put_stream 入桶 → 返回桶键（取址与转存之间零插步）
t2  桶键随 ArtifactMeta 落库——产物引用从此只指 MinIO 对象；临时 URL 用完即弃，绝不落库
t3  次日临时地址过期失效——产物下载照常（预签名指向 MinIO 对象，与死链无关）——闸的价值位

【反面：转存失败→重试→标 FAILED→错误帧（W-F5-3 断言路径）】
t0  worker 停摆后恢复，消费到 job-0712 时距 SUCCEEDED 已 25 小时（设计稿 20 捣乱 A 的极端例）
t1  fetch_and_rearchive → OSS 403（签名过期）→ StorageError → 退避重试 2 次（每次仍 403——
    过期不可逆，重试只为瞬态网络错留）
t2  预算耗尽 → 交付失败 上抛 → _标失败并通知（主干五）→ 失败帧 reason_code="rearchive_failed"
    → ack。拦完数据去哪：零元数据行（顺序闸）="不落半成品"的库侧形态；
    无引用孤儿对象无正确性影响；主任收到的失败说明点名"生成成功但产物地址已过期，需重新生成"
```

### 主干三：产物元数据入库与下载读侧（W-F10-1 尾巴的一半）

```text
伪代码 — 产物元数据的写侧与读侧（m15 消费 m3 公开面；端点本体设计稿 05 已交付、零改动）

写侧（主干二 _交付单产物 内，已走）：
    await Repository.save_artifact_meta(meta)
    #   六字段=设计稿 04 变形段对账：产物号/桶/对象键/种类（演示文稿·图·音频·字幕）/所属会话/创建时刻

读侧（本节兑现设计稿 05 遗留①的下游——下载端点的元数据依赖）：
    app/api/artifacts.py:artifact_download_url（设计稿 05 主干四，本节零改动）：
        meta = await Repository.get_artifact_meta(artifact_id)   # m3 读侧公开接口
        查无此产物 → 结构化 4xx（产物未生成或产物号错）
        url = Storage.presigned_url(meta.bucket, meta.object_key, method="GET", ttl=小时级)
# "元数据入库"与"下载端点"是同一行的两侧：worker 写、端点读，m3 统一读写出口；
# 完成帧携带 artifact_id（主干四）→ 前端点击 → 端点读元数据 → 预签名——一行数据接起两端
```

### 主干四：完成通知——notify_done 与"刷新页面看到 PPT 已就绪"（W-F10-1 终点）

```text
伪代码 — app/multimodal/worker.py:WenzhiWorker.notify_done（m15；签名=00 号骨架登记原文；帧形状=设计稿 19 替身锁定）

async def notify_done(thread_id, artifact_ref) -> None:
    await EventBuffer.append(thread_id, {                # m4 公开接口（设计稿 02 主干三）：
        "event": "artifact_ready",                       #   XADD sse:{thread_id}，MAXLEN≈200——
        "data": {"job_id": artifact_ref["job_id"],       #   帧先落缓冲再等人，写侧义务；
                 "artifact_ref": artifact_ref["items"],  #   替身锁定的三主字段原样保留，data 从
                 "run_id": artifact_ref["run_id"],       #   随行包派生（_handle_job 第 0 段组装）；
                 "artifact_id": 主产物号,                 #   artifact_ref 值域从单对象升格为产物清单
                 "kind": 种类清单}})                      #   （复合交付的自然形，帧型名不变）；
    #   增字段 artifact_id/kind=下载与渲染所需（data 为自由 JSON）
    # append 返回 event_id（毫秒-序号）——主任客户端断点续推的游标推进单位（设计稿 18 读侧）
    # 异常去向：CacheUnavailable 上抛 → _处理一条 不 ack → 恢复后打捞重做 → 幂等闸整单命中 →
    #   免费重发完成帧（取舍 2/3 的合流点：重放只花一次 XADD 的钱，不花生成的钱）
```

```text
伪代码（时序推演，非代码）——④"这份分析做成 PPT 配图出语音"的完成通知与下载（W-F10-1 全链终点）

t0  受理段的会话流早已 done(accepted) 关掉（设计稿 19）——受理与完成之间隔着分钟级生成期，连接不等人
t1  worker 编排交付完成：四个产物对象落桶、四条元数据入库（交付清单三项，tts 双产物展开——
    PPT job-0913-0 / 图 -1 / 音频 -2 / 字幕 -3）
t2  notify_done → EventBuffer.append("sse:th-zhuren-021", artifact_ready) → event_id="1726…-7"
t3  主任刷新页面（或客户端重连）→ 前端带 Last-Event-ID（受理 done 帧的编号）→ 设计稿 18 断点续推
    分支（零改动）：replay_since 排他下界只补受理后的帧 → artifact_ready 送达——
    "在线即收"的严格语义需要长驻推送通道（Pub/Sub 扇出是换边素材）；本系统的到达路径是
    帧"在缓冲里等人"：刷新/重连即补推，低频完成事件不值得常驻连接
t4  前端渲染 "PPT 已就绪 [预签名下载]"：点击 → GET /artifacts/{artifact_id}/url（设计稿 05 端点）
    → get_artifact_meta 读桶/键（主干三读侧）→ Storage.presigned_url(GET, 小时级)
    → 主任持 URL 直连 MinIO 下载 .pptx——文件流不过应用（设计稿 05 直下载机理）
    ★ W-F10-1 全链在此收口：受理（设计稿 19）→消费（本节）→生成（设计稿 20）→转存落库（本节）
      →通知（本节）→下载（设计稿 05 端点）——每一跳的接缝都已有设计稿，本节是消费方总装
```

### 主干五：万相任务 FAILED——三原因码→重试→标失败→失败帧（W-F10-3 全程·捣乱输入 B）

```text
伪代码 — app/multimodal/worker.py:重试预算与标失败（m15 私有；失败语义统一出口）

async def _重试预算(job_id, 项序号) -> int:
    key = f"wenzhi:retry:{job_id}:{项序号}"
    次数 = await Cache.incr(key)                  # m4 原子自增（设计稿 02）——计数持久在 Redis：
    if 次数 == 1:
        await Cache.set(key, 1, ttl=86400)        #   首次失败补 TTL（Cache 无 expire 接口，
    return 次数                                   #   set 原值带 TTL 是既有面内的标准做法）；
                                                  #   打捞重做继承已耗预算，防 crash-loop 无限重试

async def _标失败并通知(job, e: 交付失败) -> None:
    # 交付失败 异常载荷（结构化，随异常携带）：reason_code / 用户话术 / 失败项 / 已交付
    #   （部分成功项的元数据——复合单的失败帧点名已完成项，引用已持久有效）
    失败帧 = {"event": "artifact_failed",         # 帧协议增项（沿设计稿 19 node_progress/approval_request
        "data": {"job_id": job.job_id,            # 先例，越界自查声明）——失败也是显式交付
                 "run_id": job.payload["run_id"], "reason_code": e.reason_code,
                 "message": e.用户话术,            # 上游原话入通知，不编原因（设计稿 20 捣乱 B 兑现）
                 "失败项": e.失败项, "已完成项": [m.产物号 for m in e.已交付]}}
    await EventBuffer.append(job.thread_id, 失败帧)
    # "标任务失败"落在哪里？任务是一次性载荷不是可查询业务实体（m3 六实体无任务表）——
    # 终态住在三处：失败帧（主任侧可读）、span 终态 attrs（追踪树可查）、结构化日志。
    # 出现"任务列表页/人工重跑"产品需求时给 m3 增任务表（取舍 3）
```

```text
伪代码（时序推演，非代码）——⑤ 捣乱 B：job-0914（单产物 create_image）万相返回 FAILED

t0  _调生成件 → create_image（设计稿 20 主干三）：带异步头建任务成功 → 轮询得 task_status=FAILED
    → raise 任务失败(原因码="image_task_failed", 任务号=…, 上游报文=code/message 原文, 阶段="轮询")
t1  _handle_job 捕获 任务失败 → _重试预算 = 1 ≤ 2 → 同参重试（瞬态假设：限流/网络抖动值得再试；
    万相限流 任务下发 QPS 2、同时处理中 1（官方）——退避 30 秒避开窗口）
t2  第二、三次尝试仍 FAILED（上游拒绝是确定性的）→ 预算耗尽 → 交付失败(原因码=…) 上抛
    ——重试上限的判据语义：瞬态错（网络/限流）重试有意义，确定性错（prompt 越界=生成输入不合）
    零重试直接走本出口；三原因码（image_task_failed / image_task_timeout / image_task_rejected，
    设计稿 20 结构化载荷）原样透传进失败帧
t3  _标失败并通知 → 失败帧：
    {"event":"artifact_failed","data":{"job_id":"job-0914","run_id":"run-wz-…",
     "reason_code":"image_task_failed","message":"示意图未能生成（上游拒绝：<万相 message 原文>）",
     "失败项":[{"kind":"create_image","task_id":"…"}],"已完成项":[]}}
t4  _处理一条 ack → 任务显式失败交付，出 PEL
可观察行为（W-F10-3 三处兑现）：①失败帧显式到达（刷新/重连经设计稿 18 读侧补推）——不冒充成功、
    零 artifact_ready 帧；②零产物元数据落库（顺序闸：转存/落桶成功才落库）——"不落半成品"的库侧
    形态；③追踪树终态 failed、reason_code 可查（run_id 检索）。
对照：若 t3 缺失（吞异常只 ack）——主任的"再配一张示意图"凭空消失，既无图也无解释；
    "失败也是交付——通知必达"是设计范围断言，不是礼貌。复合单的部分失败同构：任一项超限失败 →
    整单 FAILED，失败帧点名已完成项（引用已持久有效）与失败项；重做时幂等闸逐项命中，
    只补失败项——收敛到全项完成或整单 FAILED，终态不撒谎
```

## 关键判断的取舍记录

1. **转存义务必须落服务端 worker，不能靠前端下载时"顺手存"。** 四个不对称：①**时机**——转存要赶 24h 窗口（官方），下载发生在用户想起来的任何时候；用户第 25 小时才点下载，顺手存无米下锅（死链下载本身失败，什么也存不下），设计稿 20 捣乱 A 的损失恰好是不可逆的；②**凭证**——浏览器持对象存储写凭证等于公开 AK/SK；即便发预签名 PUT，"下载后回传上传"要求前端在线且可靠，重试节奏、失败上报、幂等去重都没有承载点；③**引用一致性**——产物引用的持久性是元数据行的另一半，写库与转存必须在同一编排端（前端写不了库），顺序闸（转存成功才落库）是幂等判据的前提；④**失败语义**——重试→标 FAILED→失败帧需要任务上下文与重试预算，前端没有任务上下文、没有可靠重试，用户可能再也不回来，而 worker 的打捞机制保证失败路径最终必达。对照 reports 桶直传：那是"用户主动上传"场景，用户在线本身就是兜底；产物转存是无人值守场景，履约主体只能是 worker。换边条件：出现"产物由用户端生成直传"的产品形态时重新划分义务。
2. **消费循环幂等键：job_id 派生产物号=元数据主键，判重读侧 get_artifact_meta 命中即跳过。** 打捞是至少一次投递（设计稿 02 取舍 4），同一消息可能被原消费者与接管者各处理一次；队列层不去重（保持业务无关），判重责任上移处理方。落点：产物号 `{job_id}-{项序号}` 是 ArtifactMeta 主键，`get_artifact_meta` 命中 ⇒ 该项已完整走过"生成→转存/落桶→落库"（顺序闸保证判据为真）⇒ 重做跳过生成——**防重复扣费**（万相按张计费 0.16 元，重复执行是直接烧钱）。代价账如实记：崩溃发生在生成项**中途**的重做仍会重扣费（上游万相无幂等键，同参重查不免费），min_idle 门限（大于单任务最长处理时长）把"误抢活人"概率压到接近零，残余窗口是已知的、被失败帧与追踪树照亮的。备选"队列层 SETNX 已处理集合"：队列变厚且要为每种业务定义完成判据（设计稿 02 已拒）；"桶里查对象存在性"代替元数据判重：m5 公开面无 exists 接口，且桶键在转存分支由 m5 派生、worker 不预设键值——元数据主键才是稳定判据。换边条件：万相官方提供按业务键的任务查询时，重做可先查上游任务续用，重扣费窗口归零。
3. **失败也 ack：任务生命周期终点=成功交付或显式失败交付，重试预算持久在 Redis。** 失败任务若留 PEL 等人工：每次打捞都会重做同参必败任务（烧钱+失败帧永不发生），且 PEL 语义里根本没有"人工介入"通道。显式失败交付（失败帧+ack）让任务有干净的终点；主任要的是"为什么没图"的通知必达，排障要的是 run_id 可查——两件都不需要库表状态位（m3 六实体无任务表，任务是一次性载荷不是可查询业务实体）。配套：重试计数走 `Cache.incr` 持久化而非进程内存——否则"每次都在第 3 次尝试时崩溃"的任务在打捞重做后预算归零，crash-loop 无限重试；持久计数使打捞重做继承已耗预算，收敛到 FAILED 有保证。周期打捞（每约 2 分钟）与启动打捞并用：只有启动打捞时，"其他实例打捞接管"退化为"重启才有打捞"，W-F4-3 的"任务最终一致"在长驻实例群不成立。换边条件：出现"人工修复后重跑"的运维需求时，用重新入队（新 job_id）表达，不复活旧消息。
4. **分析进料随载荷内联下发，worker 不反查库；复合交付清单解析收在 worker 一处。** m3 公开面没有问数快照的读侧方法（save_query_snapshot 有、对应 get 无）——设计稿层不发明签名（扩卡=改卡）；而受理现场（设计稿 19 桥接段）本就持有问数终态 JSON，队列 payload 单字段 json.dumps 序列化（设计稿 02 变形段既有能力）承载 KB 量级载荷零障碍——按引用反查反而造出一个不存在的接口需求。备选：给 m3 补 get_query_snapshot 后按 analysis_ref 反查——载荷到百 KB 量级（XADD 单字段值上限 512MB，远未触）或多个 worker 要共享同一份分析时再换边。连带决定：复合交付的清单解析（brief→生成项）归 `_handle_job`——设计稿 19 受理段占位"类型细分编排归 worker"的兑现；受理侧保持薄（入队即回），交付编排（要什么、按什么顺序、失败怎么办）一个主人。代价：受理帧不含产物清单细节，主任看到的是"已受理"；换取的是受理路径零生成知识、边界规则第 4 行成立。

## 锚点对照精要

**docs/tech-stack/redis-minio.md · 模式 3 异步任务队列（Streams 消费组，可重试）**（卡 `m15` 锚点 K-G；设计范围框架红线调用序列源）
文：模式 3 给出 worker 侧官方语义序列：`xadd` 入队 → worker `xreadgroup("workers","w1",{stream:">"},count=10,block=5000)` → `handle(msgs)` → `xack`（"处理完确认"），并注明"挂掉的 worker 的消息留在 PEL，由 XAUTOCLAIM 被其他 worker 接管"；选型行定位"用 Redis Streams + 消费组做可重试、可多消费者分摊的任务队列"。落点：主干一 run 循环逐条对位——`consume(">"，block=5000)` 只取新投递、`_handle_job` 处理、`ack` 处理成功后确认（成功/失败两种交付都 ack，取舍 3）；`claim_stale` 打捞=XAUTOCLAIM 接管语义（min_idle_time 门限承载）。落点差异：官方文档示意的 block=5000/count=10 照用；打捞门限从示意值定形为 20 分钟——必须大于单任务最长处理时长（万相轮询总超时 10 分钟+余量），否则活人被当尸体打捞（设计稿 02 捣乱 C t4 纪律的落形）。

**docs/tech-stack/multimodal-api.md · 万相两步异步与 24h 过期（模式 B）**（卡 `m15` 锚点 K-C；设计范围"生成件沿用设计稿 20 官方形状"的形状源）
文：模式 B `POST .../image-synthesis`（带 `X-DashScope-Async: enable`）→ 存 task_id → 循环 `GET .../tasks/{task_id}` 直到 `task_status == "SUCCEEDED"` → **立即下载 `results[].url` 转存自有存储（24 小时过期）**；限流任务下发 QPS 2、同时处理中任务 1；计费按张。落点：两步异步本体由设计稿 20 交付（create_image），本节是"立即下载转存自有存储"这半句的**履约人**——"取址即转存"时点契约在 `_交付单产物` 分支 A 兑现（SUCCEEDED 返回与 fetch_and_rearchive 之间零插步）；重试退避避开 QPS 2 限流窗口；万相无业务幂等键，打捞重做重扣费记为已知代价（取舍 2）。落点差异：官方文档的"自有存储"在本系统落为 m5 artifacts 桶，转存函数形状与失败语义由设计稿 05/21 两段拼成（设计稿 20 归属链声明兑现）。

**原书第五章 §代码：通用 Agent 的元能力（代码驱动的多媒体生成）**（卡 `m15` 锚点）
书：代码生成是元能力——精确、可执行、可组合，能产出"新的表达形态（HTML 表单、PPT、视频帧）"；Agent 用它在运行时创造新能力而不必事先预制。落点：make_ppt 的模板驱动代码生成是元能力"精确控制"的兑现（设计稿 20 主干一：每页内容可程序化断言），本节 worker 是元能力的**编排消费侧**——把一次受理按交付清单分解为多次元能力调用（PPT/万相/edge-tts），产物候选统一过"转存→落库→通知"的交付管道；生成（能力）与交付（编排）分离使元能力可整体替换（edge-tts 无 SLA → 国产云 TTS 只换函数体，worker 分发表零改动——设计稿 20 定位的消费侧保障）。

## 越界自查（源：modules.md 边界规则表）

- **边界规则第 5 行（本节主语行）**："`m10` 直接写 `m5`/`m3`（产物落桶与元数据由 `m15` 统一经手，转存义务一处管）"——本设计稿 worker 全文经手落桶（put_stream/fetch_and_rearchive）、元数据（save_artifact_meta）、通知（EventBuffer.append）；对 m10 只调三个生成件签名并消费其产物候选——生成侧零存储/库符号（设计稿 20 越界自查已核，本节编排侧复核成立），转存义务的时点与重试语义只有一个主人。
- **边界规则第 4 行（m13 不 import m15）**：本设计稿零 m13 符号——worker 是被 `m4.TaskQueue` 解耦的消费方，只认队列消息形状（Job 契约，设计稿 02/19）；运行时调用路径上零本节符号（设计稿 19 受理段已核），双向对账闭合。
- **m4 使用公开接口**：`TaskQueue.consume/ack/claim_stale`、`EventBuffer.append`、`Cache.incr/set` 照设计稿 02 交付签名消费，`CacheUnavailable` 结构化异常照单捕获（退避重试/不 ack 不标失败两分支）；零新 Redis 命令——xreadgroup/xack/xautoclaim 的命令细节封在设计稿 02 卡内，本设计稿出现的"命令语义注"是消费方对官方语义的引用，不是绕开封装直发命令。
- **m10 使用公开接口**：`make_ppt/create_image/tts` 按设计稿 20 交付签名调用；`生成输入不合`（零重试）与`任务失败`（三原因码，重试语义归本层）两个结构化异常照单消费；零 m10 内部 import、零接口修改（create_video 同构模式不消费——设计范围不讲文生视频完整实现）。
- **m5 使用公开接口**：`put_stream`（分支 B）与 `fetch_and_rearchive`（分支 A）两方法；本节零 `get_stream` 调用点（产物读取走下载端点预签名，不经 worker），故设计稿 05"用毕 close+release_conn"契约在 worker 无履行点；`StorageError` 照单捕获；minio-py 同步调用全部线程池托底（设计稿 05 取舍 1 遗留②的兑现位）。
- **m3 使用公开接口**：`save_artifact_meta`（写侧）/`get_artifact_meta`（读侧——modules.md m3 卡"设计稿 05 发现补"行，设计稿 05 遗留①在此收口）；零引擎内部接触（边界规则第 7 行）。
- **m12 打点在公开接口边界**：`Tracer.start_span/end_span/trace_run` 按受理 run_id 续树（设计稿 19 主干 D 留位兑现；同一 run_id 两次落盘=受理树与交付树两段，检索键 run_id 等值查两段都在）；打点失败不拦主流程（设计稿 06 纪律）。
- **签名纪律**：三公开签名逐字对齐 00 号骨架登记 m15 三行（run/_handle_job/notify_done）；本节新增仅内部件——`_处理一条`/`_打捞一轮`/`_解析交付清单`/`_调生成件`/`_交付单产物`/`_转存重试`/`_重试预算`/`_标失败并通知` 私有件，`_STREAM/_GROUP/_CONSUMER/_BLOCK_MS/_CLAIM_MIN_IDLE_MS/_SWEEP_EVERY/_RETRY_LIMIT` 常量，失败帧型 artifact_failed（帧协议增项沿设计稿 19 node_progress/approval_request 先例，data 为自由 JSON）——未发明卡外公开接口。
- **架构大图同步**：diagrams/petro-agent.html 按设计范围"图节点范围"只在 C7 问智模块容器内加三节点（wenzhi_worker / artifact_deliver / stale_claim，全中文描述+英文锚 ID）与设计范围六边（任务队列--请求 领取任务-->消费循环、打捞-.-接管未确认消息.->消费循环、消费循环-->交付节点、交付-.产物写入.->对象存储容器 C10、交付-.元数据.->持久化容器 C8、交付-.完成帧.->Redis 容器事件缓冲 C9），另补一条设计稿 05 登记占位的兑现边（rearchive_duty 转存入桶边——设计稿 05 节点明细表"设计稿 21 接线"承诺的落图）；节点明细表加三行、task_queue/rearchive_duty/object_store/wenzhi_accept/event_buffer/repository 与五生成件行下游描述更新；`<script>` 零改动；图上无文件名/函数名/端口/路由。
- **零代码红线**：全文代码块均标注"伪代码"；无 tests/、无 CI 内容。
