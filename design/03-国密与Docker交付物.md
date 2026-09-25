# 设计稿 03：国密加解密与 Docker 交付物

> **红线声明**：本设计稿零真实可运行代码。全部代码块均为**伪代码**（块首标注"伪代码 — 文件:函数/契约"），签名取自设计稿 00 登记表 m11 四签名 + deploy 两契约行 + m1 request_log 行；gmssl 3.2.2 与 Docker/compose 按官方 API 形状写调用序列（锚 docs/tech-stack/guomi-sm.md、docs/tech-stack/docker.md）：`CryptSM4().set_key(16 字节密钥, SM4_ENCRYPT/SM4_DECRYPT)`→`crypt_cbc`（PKCS7 固定填充，无 GCM）、`sm3.sm3_hash(func.bytes_to_list(...))` 列表进列表出再转 hex、Dockerfile 多阶段/`USER app`/`HEALTHCHECK`、compose `depends_on: condition: service_healthy`。
> **本节交付范围**：`m11` 真身三件——国密件 `app/security/guomi.py`（加解密/摘要/密钥自检）+ 交付物契约 `deploy/Dockerfile`、`deploy/docker-compose.yml`；`m1` 接线两处——请求日志摘要留痕（设计范围点名的"一处"）+ create_app 装配自检一行（W-F11-6"启动快速失败"的机械前提，装配属组合根本职非业务逻辑）。**stub 声明**：本节无换真身——`m11` 是叶子卡（设计稿 00 stub 登记表 15 条无 m11 条目，卡面 Adapter: 无，纯函数库自检即替身），四签名与两契约行以真身直接交付。
> **半程边界**：W-F11-1 的持久化半程（EncryptedField 列类型、`Repository.save_user` 落库读回全程）在设计稿 04 兑现，本节交付加解密本体与官方调用序列；W-F11-4 本节交付 Dockerfile 契约侧 + compose 编排契约（全栈运行验证归交付验收）；金仓方言（W-F11-3/W-F3-3）在设计稿 04。
> **明确不讲的**（设计范围声明 + 卡外存档）：数据库方言与加密列类型（设计稿 04）；SM2 签名与 sm3_kdf（guomi-sm.md 有形状、无卡不设实现范围，锚点节存档）；等保测评流程（F11 设计范围"不做什么"）；Podman/iSula 差异（仅锚点节存档）。

## 实现清单

- [x] SM4 字段加解密本体：加密产出 base64(随机 IV‖密文)，解密还原明文；官方调用序列入本设计稿（源：卡 `m11` 公开接口；W-F11-1 经持久化层落库的全程在设计稿 04 兑现）✅ **主干一**（encrypt/decrypt 五步与镜像拆装）+ **捣乱输入 A**（IV 写死推演）
- [x] 请求日志留痕：接口报文→SM3 摘要入日志，报文本体不入日志（源：W-F11-2）✅ **主干二**（digest 列表进出 + request_log 接线与路径分叉）
- [x] 密钥自检闸：密钥缺失或长度不为 16 字节时启动快速失败，不许静默运行（源：W-F11-6）✅ **主干三**（两道闸 + create_app 装配第一行接线）
- [x] Dockerfile 契约：多阶段构建、非 root 运行、健康检查指向健康探针（源：W-F11-4 半程；卡 `m11` 交付物契约）✅ **主干四**（两阶段 + 非 root + 探针三组指令）
- [x] compose 契约：数据库健康检查通过前应用不启动、命名卷、网关服务在列（源：W-F11-4；卡 `m11`）✅ **主干五 A**（service_healthy 长语法 + 命名卷 + litellm 在列）+ **捣乱输入 B**（短语法病根推演）
- [x] 离线交付路径：镜像导出→麒麟系统装入→离线装载可用的命令序列写入本设计稿（源：W-F11-5）✅ **主干五 B**（save→摆渡→load 四步序列与架构钉死）
- [x] 越界引用为零（源：modules.md 边界规则表）✅ **越界自查**

---

## 走查：从输入到验收行为

> **主角数据**（业务真数据样子）：
> ① 小李账号资料里的手机号 `13912345678`（敏感字段，走 SM4 加解密——落库全程在设计稿 04）；
> ② 老王的提问报文字节 `{"message":"N-2 井的完井方式是什么","thread_id":"th-laowang-001"}`（接口报文，走 SM3 留痕）；
> ③ 阿强的一次冷启动：SM4_KEY 环境注入→自检→装配；
> ④ 阿强的一次交付：petro-api:1.0 镜像从构建机摆渡进麒麟内网机。
> **地图先行**（本节四件套总览，后续步骤引用不重画）：

```text
伪代码（四件套总览，非代码）

阿强（运维）    麒麟内网机                     宿主容器 C2                      安全合规容器 C12
   │ 容器启动      │                             │                               │
   ├─SM4_KEY 注入──────────────────────────────> ④create_app 装配第一行 ──────> 主干三 key_selfcheck 密钥闸
   │              │                             │   不过闸→启动即崩；过闸→继续装配      │
小李（注册）     手机号 13912345678 ──外存前────> ─────────────────────────────> 主干一 encrypt_field（随机 IV+CBC）
   │              │                             │    出 base64(iv‖cipher)（设计稿 04 加密列落库）│
老王（提问）     POST 报文字节 ─────────────────> ③入口先算摘要 ────────────────> 主干二 digest（SM3 列表进出）
   │              │                             │    摘要入日志、正文沿业务链走          │
阿强（交付）     docker save|gzip → 摆渡 → load → 主干五：compose service_healthy 定起谁何时起
```

### 主干一：SM4-CBC 字段加解密——随机 IV→CBC→base64 组装（W-F11-1 的 m11 半程）

```text
伪代码 — app/security/guomi.py:Crypto.encrypt_field（m11，🛡️ 防明文落库）

# 输入形状：敏感字段明文——小李账号资料里的手机号 "13912345678"（str）
def encrypt_field(plaintext: str) -> str:
    key = load_key()                                   # 密钥装载：环境变量 SM4_KEY 注入——不进代码、不进镜像；
                                                       #   供给端在主干五 compose environment，闸在主干三
    iv = os.urandom(16)                                # ① 数据变形起点：每次加密现生成 16 字节随机 IV
                                                       #   ——CBC 安全的前提；写死 IV 的推演见捣乱输入 A
    crypt = CryptSM4()                                 # ② gmssl 3.2.2 官方形状（官方）：构造只有 mode 参数、
                                                       #   无 padding_mode——PKCS7 是固定行为不是可选项
    crypt.set_key(key, SM4_ENCRYPT)                    # ③ 16 字节密钥 + 加密方向；加解密共用 crypt_cbc、
                                                       #   方向由 set_key 决定——漏切方向是形状坑（见下）
    cipher = crypt.crypt_cbc(iv, plaintext.encode())   # ④ CBC 加密：明文 bytes 进，自动 PKCS7 填充到
                                                       #   16 字节倍数；gmssl 无 GCM 可选（官方）
    return base64.b64encode(iv + cipher).decode()      # ⑤ 数据变形终点：随机 IV ‖ 密文 → base64 单串出；
                                                       #   IV 前置拼装——解密方从串头拆，密钥侧不存 IV 状态
```

```text
伪代码 — app/security/guomi.py:Crypto.decrypt_field（m11）

# 输入形状：encrypt_field 的产出串——base64(iv‖cipher)
def decrypt_field(payload: str) -> str:
    key = load_key()
    raw = base64.b64decode(payload)                    # base64 解码回字节串
    if len(raw) < 17:                                  # 主干判断：连 16 字节 IV + 1 组密文都凑不齐——
        raise CryptoError("密文载荷形状非法")            #   异常去向①：结构化异常上抛，不返回半截数据
    iv, cipher = raw[:16], raw[16:]                    # 拆 IV：前 16 字节约定，与 encrypt 的拼装互为镜像
    crypt = CryptSM4()
    crypt.set_key(key, SM4_DECRYPT)                    # 解密方向：唯一要改的就是 set_key 的方向参数
    plain = crypt.crypt_cbc(iv, cipher)                # 官方形状：解密同走 crypt_cbc、自动去 PKCS7；
                                                       #   填充非法（密钥错/载荷被改）gmssl 抛错 →
                                                       #   翻译成 CryptoError 上抛（异常去向②），
                                                       #   调用方（设计稿 04 加密列）凭异常类型定"读回失败"语义
    return plain.decode()                              # 还原明文："13912345678"
```

观察到的验收行为：同一手机号加密两次，产出两段**不同**的 base64 串（IV 随机所致）；各自走 decrypt_field 都还原出 `13912345678`。卡面注释"加密产出 base64(iv‖cipher)"的 `iv‖cipher` 就是第⑤步的 `iv + cipher` 拼装。

### 捣乱输入 A：IV 写死会怎样——静默的模式泄露

```text
伪代码（时序推演，非代码）

前提：捣乱实现把 IV 写死成常量（iv = b"0123456789abcdef"），密钥 K 不变

t0  小李在账号 A 登记手机号 P="13912345678" → 库里密文行 C1 = base64(I‖CBC_K,I(P))
t1  小李换账号重新登记同一手机号        → C2 = base64(I‖CBC_K,I(P))
t2  C1 与 C2 逐字节相同——攻击者拖库后不破算法即断定"两行此字段值相同"；
    拿已知手机号字典逐个加密比对，常用值甚至能直接对号入座
t3  更隐蔽的病：CBC 首分组 C₁=E_K(P₁⊕I)——IV 写死则"相同明文前缀→相同首分组"，
    分组间模式泄露，ECB 的病被写死的 IV 请了回来（随机 IV 正是 CBC 对 ECB 的修正点）
```

闸在哪：`encrypt_field` 第①步 `os.urandom(16)`——IV 的随机性编码进产出物（随密文存储），不依赖任何运行时状态，解密方从串头读 IV；IV 本身无需保密、必须不可预测（官方）。这是**设计闸不是运行时闸**：写死 IV 不抛任何错、加解密照常成功，损害是静默的模式泄露——所以它以设计范围红线（"IV 随机"）而不是异常分支存在。拦完数据去哪：无运行时拦截对象；相邻的运行时错误（载荷不足 17 字节、填充非法）才有闸，走 CryptoError 上抛（主干一异常去向）。

付出什么：随机 IV 使同一手机号两次加密产出不同密文 → 密文列上**等值查询/等值 JOIN 不可用**——加密字段只能按主键取回后解密（设计稿 04 EncryptedField 的使用边界，接缝藏在列类型后对调用方无感）。

### 主干二：SM3 报文摘要与请求日志留痕（W-F11-2）

```text
伪代码 — app/security/guomi.py:Crypto.digest（m11）

# 输入形状：接口报文原始字节——老王 POST /chat/qa 的请求体 raw bytes
def digest(payload: bytes) -> str:
    data_list = func.bytes_to_list(payload)            # 形状坑第一跳：sm3_hash 只吃 int 列表，直接喂 bytes
                                                       #   会跑错或静默出错（官方）——bytes 必须先转列表
    hash_list = sm3.sm3_hash(data_list)                # "列表进列表出"：输出也是 32 个字节值的 int 列表
    return func.list_to_bytes(hash_list).hex()         # 形状坑第二跳：列表 → bytes → 64 位 hex 字符串
                                                       # 产出："66c7f0f4…" 形状的 64 位 hex——可对账可比对，不携带原文
```

```text
伪代码 — app/main.py:request_log（m1 本节接线：报文 SM3 摘要留痕，正文不落日志）

async def request_log(request, digest: str) -> None:
    # 签名取自设计稿 00 登记表 m1 第 3 行（卡 m1 公开接口为真源）；digest 由调用方算好传入
    await 结构化日志写入({
        "type": "request_log",
        "endpoint": f"{request.method} {request.url.path}",   # 哪个入口（路由元信息，非业务解析）
        "digest_sm3": digest,                                  # 64 位 hex——留痕的全部内容
        # 刻意没有的字段：报文本体、解析出的业务字段——W-F11-2 断言"报文本体不入日志"：
        #   正文沿业务链走（dispatch 要用），日志侧从参数处只收摘要，两条路径在此分叉
    })
```

```text
伪代码 — 接线形状：app/api/chat.py:chat_endpoint 入口（m1，W-F11-2 的触发点）

body_bytes = await request.body()                        # 原始字节（FastAPI 经 Request 参数注入取 raw body）
await request_log(request, Crypto.digest(body_bytes))    # 摘要进日志；正文继续走 dispatch——业务链照常
# 注入方式（中间件或端点参数）是 m1 路由层细节：卡面 request_log(request, digest) 的
# request 形参即由此供给；本节交付函数本体与接线形状，不锁死注入姿势
```

观察到的验收行为：老王发一次提问 → 日志多一行含 64 位 SM3 摘要的 request_log 记录 → 翻遍日志找不到"完井方式"四个字。摘要与正文的关系：同报文必得同摘要（可对账），但摘要推不回正文（64 位 hex 只留指纹）。

### 主干三：密钥自检闸——缺失/长度不对，启动即崩（W-F11-6）

```text
伪代码 — app/security/guomi.py:key_selfcheck（m11，🛡️ 防弱密钥缺钥上线）

SM4_KEY_LEN = 16                      # SM4 密钥长度 128 bit = 16 字节（与分组同长，官方）

def key_selfcheck() -> None:
    key = os.environ.get("SM4_KEY")                       # 密钥唯一来源：运行时环境注入（主干五供给）
    if key is None:                                       # 闸一：缺失
        raise 启动失败("SM4_KEY 未注入——拒绝无密钥静默运行")
    if len(key.encode()) != SM4_KEY_LEN:                  # 闸二：长度（"13912345678" 这类顺手字符串=11 字节弱密钥）
        raise 启动失败(f"SM4_KEY 长度 {len(key.encode())} 字节 ≠ 16——拒绝弱密钥")
    return None                                           # 过闸 → create_app 继续装配；
                                                          #   两闸异常无捕获方——进程启动即崩（快速失败语义）
```

```text
伪代码 — 接线形状：app/main.py:create_app 装配序列第一行（m1 组合根）

def create_app() -> FastAPI:
    key_selfcheck()        # 装配先于一切路由：密钥不过闸，进程起不来——容器编排侧表现为
                           #   unhealthy/重启循环，绝不带病接流量。m1 本节触及面 = 本行装配调用
                           #   + 主干二 request_log 接线两处，均为横切装配职责（边界规则第 6 行）
    ...                    # 其余装配项与设计稿 01 第 1 步一致，本节不重复
```

观察到的验收行为：不注入 SM4_KEY 起 `docker compose up api` → api 容器立刻退出（启动即崩，非跑起来后报错）；注入 11 字节密钥 → 同样崩，日志指名长度不符。两个方向（缺失/弱钥）都被同一道装配闸拦下，不存在"密钥不对但应用照常服务"的中间态。

### 主干四：多阶段 Dockerfile——非 root 构建主干（W-F11-4 半程）

```text
伪代码 — deploy/Dockerfile（m11 交付物契约；形状逐条锚 docs/tech-stack/docker.md 模式 1 官方 best practices）

# syntax=docker/dockerfile:1
# ── 阶段一 builder：装依赖（构建残留留在本阶段，不进最终镜像）────────────
FROM python:3.12-slim AS builder
WORKDIR /w
COPY requirements.txt .                                   # 依赖清单单独先 COPY：依赖不变则 pip 层缓存全命中（官方）
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt
    # gmssl 3.2.2 纯 Python 无 native 扩展（官方）——无需 gcc/make 工具链，鲲鹏/飞腾架构同样直装

# ── 阶段二 runtime：只带运行必需（多阶段构建的核心收益）──────────────────
FROM python:3.12-slim
RUN groupadd -r app && useradd --no-log-init -r -g app app   # 非 root：官方形状一条 RUN 建组+建用户（官方）
WORKDIR /srv
COPY --from=builder /install /usr/local                   # 只拷依赖产物，不带 pip 与构建工具
COPY ./app ./app                                          # 应用代码；SM4_KEY 绝不 COPY 进镜像（供给端在运行时环境）
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request;urllib.request.urlopen('http://localhost:8000/healthz')" || exit 1
    # 探针目标 = 设计稿 01 交付的 GET /healthz（设计稿 01 第 1 步预留的挂点在此接上）；
    # 用镜像里现成的 python 发探针、不为探针装 curl；start-period 给 uvicorn 启动留宽限；
    # 退出码 0=healthy / 非 0=unhealthy（官方）
USER app                                                  # 自此一切进程以 app 运行——W-F11-4"容器内进程非 root"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
    # exec 形式：uvicorn 成为 PID 1 直接收 SIGTERM——docker stop 优雅停机的前提（官方）
```

观察到的验收行为：`docker build -f deploy/Dockerfile -t petro-api:1.0 .` 成功；`docker run` 后容器内进程属主是 app 非 root；`docker inspect` 的 Health 区块每 30 秒探一次 `/healthz`，连续 3 次失败标 unhealthy。异常去向：应用崩溃 → 探针非 0 → unhealthy → 编排层（compose/K8s 侧策略）可见并可摘流。

### 主干五 A：compose 健康依赖编排（W-F11-4 编排侧）

```text
伪代码 — deploy/docker-compose.yml（m11 交付物契约；形状锚 docs/tech-stack/docker.md 模式 2 Compose Specification）

services:
  api:
    build: { context: ., dockerfile: deploy/Dockerfile }
    ports: ["8000:8000"]
    environment:
      SM4_KEY: ${SM4_KEY}                                  # 密钥插值自部署机环境——镜像与 compose 文件都不携带
      DATABASE_URL: postgresql+asyncpg://petro:${PG_PASSWORD}@db:5432/petro
      REDIS_URL: redis://redis:6379/0
    depends_on:
      db:      { condition: service_healthy }              # W-F11-4 核心：db 转 healthy 才创建 api（捣乱输入 B）
      redis:   { condition: service_healthy }
      minio:   { condition: service_started }
      litellm: { condition: service_started }              # 网关服务在列（卡 m11 交付物契约）；chroma 服务设计稿 08 增列
    restart: unless-stopped

  db:
    image: postgres:16
    volumes: ["pgdata:/var/lib/postgresql/data"]           # 命名卷：容器可重建、数据不丢（卡 m11 契约项）
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U petro"]           # 官方镜像自带探针——healthy 判据（官方）

      interval: 5s
      retries: 5

  redis:                                                   # 形状同 docker.md 模式 2：redis-cli ping 探针
  minio:                                                   # 形状同 docker.md 模式 2：miniodata 命名卷 + mc ready 探针
  litellm:                                                 # 网关容器：挂配置启动 :4000（配置契约归卡 m2/设计稿 07）

volumes:
  pgdata: {}
  miniodata: {}
```

### 捣乱输入 B：app 起得比依赖快——短语法 vs 长语法

```text
伪代码（时序推演，非代码）

前提：捣乱配置把 depends_on 写成短语法 depends_on: [db]；db 空卷首启（初始化最慢路径）

t0  compose 按依赖序"创建"容器：db 先、api 后——但短语法只保证创建顺序，
    官方明言不等待 healthy（官方："Compose does not wait for dependency
    services to be 'healthy'"）
t1  db 容器内 postgres 正在 initdb（几十秒）；api 的 uvicorn 几秒就起来了——app 起得比依赖快
t2  create_app 装配 → lifespan 按 DATABASE_URL 建连接池 → 连接被拒（5432 还没人监听）
t3  uvicorn 退出；restart: unless-stopped 拉起 → 再连 → 再崩——崩溃循环，
    日志被同一张崩溃栈刷屏，表象是"服务起不来"，根因是编排闸缺失
t4  崩溃若干轮后偶然成功（postgres 初始化恰好先完成）——"能跑"纯属运气，
    首启/换空卷/扩容每条路径都要重新赌一次
```

闸在哪：`depends_on: db: {condition: service_healthy}`——compose 编排层在 db 的 healthcheck（pg_isready）连续通过、状态转 healthy **之前，根本不创建 api 容器**。闸在"创建依赖方容器"这一步，不是应用里的重试逻辑：应用保持"首连即成"，不为依赖未就绪写一行代码。拦完数据去哪：api 容器延后创建，无失败数据残留；若 db 自己到 retries 上限仍不健康，则被标 unhealthy、api 永不启动——失败显式可见，而非静默半可用。

### 主干五 B：离线交付——save → 摆渡 → load（W-F11-5）

```text
伪代码 — 离线交付命令序列（W-F11-5；形状锚 docs/tech-stack/docker.md 模式 3 交付段）

# ① 构建机（有源）：按目标架构构建——麒麟目标机多为鲲鹏/飞腾（aarch64）
docker build --platform linux/arm64 -t petro-api:1.0 -f deploy/Dockerfile .
    # 架构必须在构建期钉死：x86 镜像 load 进 aarch64 机器跑不起来——不是运行期选项

# ② 导出：镜像压成 tar 包——交付物=文件，不再依赖构建机上的任何状态
docker save petro-api:1.0 | gzip > petro-api-1.0.tar.gz

# ③ 摆渡：U 盘/光盘进信创内网 → 麒麟 V10（RHEL8 兼容系）目标机装载
docker load -i petro-api-1.0.tar.gz

# ④ 起全栈 + 验证：
SM4_KEY=… docker compose up -d            # compose 文件随 tar 摆渡；密钥由内网环境注入（主干三的供给端）
docker compose ps                         # 期望：db/redis/minio healthy → api 才创建并转 healthy
docker compose top api                    # 期望：uvicorn 进程属主为 app 非 root、监听 8000（W-F11-5 装载可用判据）
```

观察到的验收行为：目标机全程无外网、无源，`load` 后 `up -d` 一次成功；主干三的密钥闸在此复验——忘配 SM4_KEY 时 api 起不来且日志指名缺钥，交付序列的最后一道检查仍是密钥闸。

## 关键判断的取舍记录

1. **CBC + 每次随机 IV，不用 ECB**——ECB 同明文分组→同密文分组，字段等值模式直接漏（捣乱 A 的 t2 在 ECB 下整段成立）；gmssl 只有 ECB/CBC 两种模式且无 GCM（guomi-sm.md），CBC+随机 IV 是其中唯一够存储用的组合。备选"等 gmssl master 发版上 AEAD"不可控（该项目维护松散，master 的 padding_mode 迟迟不发版）。付出：密文列等值查询不可用（捣乱 A 末段）。换边条件：出现"按加密字段等值检索"需求时，走模块卡修订流程扩卡加盲索引/确定性加密件，不在本卡私加。
2. **留痕只做 SM3 摘要，不做 SM3withSM2 验签**——卡 `m11` 公开接口只有 `digest(payload) -> hex`；guomi-sm.md 模式 2 的防篡改验签要规范序列化 + 共享 secret + 时间戳窗口 + 对端协商，是一套密钥管理体系，超出"内部日志可对账"的诉求。换边条件：与外部系统对接要求报文防篡改时，走模块卡修订流程扩卡（SM2 形状 guomi-sm.md 已备，含 asn1 对接 Java 验签的坑位）。
3. **密钥自检放装配第一步、失败即崩，不做惰性检查**——备选是首次加解密才报错：缺钥的应用能起来、能接流量，直到第一次写敏感字段才炸，前一段全是"明文落库"事故的暴露窗。快速失败把损害窗口压到零，代价是纯巡检类场景也被拒启动（本系统无此场景）。这也是"启动即崩"进验收（W-F11-6）而非实现细节的原因；对应 m1 触及面只有 create_app 一行装配调用，无业务逻辑。
4. **健康探针用镜像内现成的 python 解释器，不为探针装 curl**——slim 镜像无 curl，`python -c "urllib.request.urlopen(...)"`（docker.md 模式 1 原形状）零新增依赖、镜像不胖、探针能力不降（退出码语义同）。备选装 curl 换来探针命令可读性，付出是每镜像一份 curl 及其升级面。换边条件：探针长出多目标/重试语义时再评估专用探针容器。

## 锚点对照精要

**docs/tech-stack/guomi-sm.md · SM4 调用形状与 PKCS7**（卡 `m11` 锚点）
guomi-sm.md 记载官方形状：`CryptSM4()`（PyPI 3.2.2 构造只有 mode 参数）→ `set_key(16 字节 key, SM4_ENCRYPT/SM4_DECRYPT)` → `crypt_ecb(plain)` / `crypt_cbc(iv, plain)`；3.2.2 sdist 无 `padding_mode` 参数（GitHub master 已合入未发版），填充固定 PKCS7、加解密自动走。落点：主干一按 3.2.2 形状写、不用 master 独有参数；卡锚点行的缩写"crypt_iv_cbc"指"带显式 IV 的 crypt_cbc"，guomi-sm.md 记载的官方方法名是 `crypt_cbc(iv, plain)`。

**docs/tech-stack/guomi-sm.md · 无 GCM 与模式选择**（卡 `m11` 锚点）
guomi-sm.md：gmssl 只提供 ECB/CBC 两种模式（`dir(CryptSM4)` 实测无 `crypt_gcm`），需要 AEAD 时 gmssl 不满足，得换 GmSSL C 库绑定（tongsuopy）或厂商 SDK；README 虽给 ECB 示例，但 ECB 不隐藏数据模式，生产敏感字段存储应优先 CBC（随机 IV）；IV 与密文一起存储、IV 本身无需保密。落点：主干一选 CBC+随机 IV，无 GCM 的完整性缺口记录为已知边界（取舍 1/2）。

**docs/tech-stack/guomi-sm.md · SM3 列表进出的形状坑**（卡 `m11` 锚点）
guomi-sm.md：`sm3.sm3_hash(msg)` 的 msg 是字节 int 列表不是 bytes，必须先 `func.bytes_to_list`；返回同为 int 列表，转 hex 走 `func.list_to_bytes(...).hex()`；实测输出与 SM3 公开标准测试向量一致；两个辅助函数在 README 无文档（形状坑来源）。另 `sm3_kdf` 首参是十六进制串的 bytes、传列表抛 AttributeError——本节未用到，存档备查。

**docs/tech-stack/guomi-sm.md · 信创适配与版本纪律**（卡 `m11` 锚点）
guomi-sm.md：gmssl 3.2.2 纯 Python 无 native 扩展，麒麟（x86/ARM 鲲鹏/飞腾）可直接运行；纯 Python 比 C 扩展慢一到两个数量级，高频批量加解密应评估 GmSSL C 库或硬件密码机；PyPI sdist 有打包瑕疵，建议装 wheel 并锁版本。落点：主干四 builder 阶段无需编译工具链即来自"纯 Python"这条；高频解密场景的性能换边条件记录在案。

**docs/tech-stack/docker.md · 多阶段与非 root**（卡 `m11` 锚点）
docker.md：官方 best practices——多阶段构建使最终镜像只含运行必需文件（builder `--prefix=/install` → runtime `COPY --from=builder`）；非 root 用 `groupadd -r` + `useradd --no-log-init -r` 建组用户后 `USER app`，避免装 sudo、不频繁切换 USER；CMD exec 形式让应用成为 PID 1 正确接收信号。落点：主干四逐条按此形状书写，未加戏。

**docs/tech-stack/docker.md · HEALTHCHECK 与 depends_on 长短语法**（卡 `m11` 锚点）
docker.md：`HEALTHCHECK [--interval --timeout --start-period --retries] CMD <命令>`，退出码 0=healthy/非 0=unhealthy，compose 的 healthcheck 段同语义、可覆盖镜像内设置；`depends_on` 短语法只控启动顺序，官方明言"Compose does not wait for dependency services to be 'healthy'"，长语法 `condition: service_healthy` 才等健康（另有 service_started / service_completed_successfully）。落点：捣乱输入 B 的病根与闸全部站在这条官方语义上。

**docs/tech-stack/docker.md · save/load 交付与国产化部署注意**（卡 `m11` 锚点）
docker.md：信创内网交付 `docker save | gzip` → 拷贝 → `docker load -i`，基础镜像按目标 CPU 架构（x86_64 / arm64 鲲鹏）分别准备，`docker build --platform linux/arm64` 可交叉构建；麒麟自带 iSula/兼容 Docker 的容器引擎、部分信创环境用 Podman 替代，compose 文件基本通用但 `--mount` 等 BuildKit 特性依赖构建器版本。落点：主干五 B 按此写命令序列、构建期钉 `--platform`；Podman 差异只存档不展开。

## 越界自查（源：modules.md 边界规则表）

- **m11 是叶子卡**：guomi.py 四函数不 import 任何业务模块；deploy 两文件是交付契约非代码。引用方向只有 m1→m11（自检调用与摘要接线）、m3→m11（设计稿 04 加密列，本节不写）——与卡依赖行一致。
- **m1 触及面**（边界规则第 6 行"m1 不写业务逻辑"）：request_log 本体 + chat_endpoint 入口摘要两行 + create_app 装配自检一行，三处均为横切日志/装配职责；报文正文照常沿 dispatch 进业务链，日志侧只收摘要，无状态机与管道逻辑。
- **边界规则表逐行核对**：无一行以 m11 为主语（叶子无出边）；m1 相关仅第 6 行，已核对。架构大图按设计范围只加 C12 三节点与两条摘要回路边（宿主↔摘要节点），部署编排不设图节点（设计范围声明）——零新增业务调用边。
- **签名纪律**：公开签名取自设计稿 00 登记表（m11 四签名 + deploy 两契约行 + m1 request_log 行）；本节新增仅结构化异常 CryptoError/启动失败与载荷长度判据（17 字节下界），全部落在 app/security/guomi.py 内，未发明新公开接口。
- **零代码红线**：全文代码块均标注"伪代码"；无 tests/、无 CI 内容。
