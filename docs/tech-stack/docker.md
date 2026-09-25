# Docker 容器化部署（Dockerfile 最佳实践 + Compose 编排）

> 技术栈调研 · slug: docker
> 适用场景：国产化内网环境 · 假想业务：Petro-Agent 油田智能平台（FastAPI 异步底座 + LiteLLM 网关 + 三 Agent）
> 调研日期：2026-09-12，Docker 侧论断以 docs.docker.com 官方文档为准。

## 使用场景

Docker 解决的核心问题是：**把应用及其依赖打包成不可变镜像，在任何装了 Docker 的主机上以一致的运行时环境启动**，消除"在我机器上能跑"。对 Petro-Agent 这类 LLM 平台：

- **开发-测试-生产环境一致性**：FastAPI 应用 + Postgres + Redis + MinIO 一套 compose 文件，开发机、测试服务器、油田内网生产机的服务拓扑完全一致，只换环境变量。
- **镜像即交付物**：央企信创环境（麒麟 OS）上部署时，交付的是构建好的镜像 tar 包，避免在生产机上现场编译装依赖（现场无外网、源受限时尤其关键）。
- **隔离与回滚**：同一台物理机上多个项目/多版本互不干扰；出问题 `docker compose down && docker compose up -d` 回滚到上一个 tag 的镜像。
- **健康检查与编排自愈**：`HEALTHCHECK` + compose `depends_on: condition: service_healthy` 保证 FastAPI 启动前数据库、Redis 已就绪，而不是"启动了但没 ready"。

与同类选型差异（一句话版）：裸机 systemd 部署省一层抽象但环境一致性全靠纪律；Kubernetes 编排能力强但央企内网落地重、运维门槛高；Docker Compose 以单个 YAML 文件管理单机多容器，是中小规模 AI 平台内网部署的务实选择（compose 是单机编排，跨机调度仍需 K8s/Swarm）。

## 核心能力面

### Dockerfile 最佳实践（官方推荐清单）

来源：[Dockerfile best practices（官方）](https://docs.docker.com/develop/develop-images/dockerfile_best-practices/)

- **多阶段构建（multi-stage）**：把构建与运行分离，最终镜像只含运行必需的文件，"resulting output only contains the files that are needed to run the application"；多个 stage 可并行构建提速；公共部分可抽成可复用 stage（"Docker only needs to build the common stage once"）。典型形状：`FROM python:3.12 AS builder` 装依赖 → `FROM python:3.12-slim` + `COPY --from=builder /usr/local/lib/python3.12/site-packages ...`。
- **选小而可信的基础镜像**：官方推荐 Alpine（"tightly controlled and small in size, currently under 6 MB"）；构建/单测用一个镜像、生产用更小的镜像，缩小攻击面。
- **非 root 运行**：`RUN groupadd -r app && useradd --no-log-init -r -g app app` 建组和用户后 `USER app`；建议显式指定 UID/GID；避免装 `sudo`（TTY 与信号转发行为不可预测），需要 root 起非 root 跑的场景用 `gosu`；不要频繁来回切换 `USER`。
- **缓存失效纪律**：`RUN apt-get update && apt-get install` 必须写在**同一条** RUN 里（分开写会命中旧缓存导致装到过期的包，官方称之为 cache busting）；包列表按字母序多行排列防重复；`--no-install-recommends` + 同一层 `rm -rf /var/lib/apt/lists/*` 减体积。
- **构建缓存利用**：`RUN --mount=type=bind,source=requirements.txt,target=/tmp/requirements.txt pip install ...` 用 bind mount 替代 COPY 装依赖（不进最终镜像、缓存更精准）；`.dockerignore` 排除无关文件（语法类似 `.gitignore`）。
- **基础镜像版本钉死**：tag 可变（`alpine:3.21` 会随补丁漂移），供应链要求高时钉 digest：`FROM alpine:3.21@sha256:a8560b36...`；CI 中构建并测试镜像，定期 `--no-cache` 重建。
- **指令级细节**：`CMD` 用 exec 形式 `CMD ["executable","param1","param2"]`；服务类镜像推荐 `ENTRYPOINT` 定主命令 + `CMD` 给默认参数；入口脚本里用 `exec` 让应用成为 PID 1 以正确接收信号；`WORKDIR` 用绝对路径；`ENV` 在每层持久化——后层 `unset` 无效，敏感变量要在**同一层** set-use-unset；`EXPOSE` 声明容器监听端口。
- **健康检查**：`HEALTHCHECK [--interval=... --timeout=... --start-period=... --retries=3] CMD <命令>`（退出码 0 = healthy，非 0 = unhealthy），`HEALTHCHECK NONE` 禁用镜像自带检查。锚点：[Dockerfile reference · HEALTHCHECK](https://docs.docker.com/reference/dockerfile/#healthcheck)（本次调研未逐行核对该页，细节以该锚点为准）。

### Compose 编排关键配置（官方 Compose Specification）

来源：[Compose file reference · services](https://docs.docker.com/reference/compose-file/services/)

- **定位**：Compose Specification 是合并了旧 2.x/3.x 格式的现行规范，由 Compose v2（1.27.0+）实现；顶层 `services` 是必需要素，服务内 `build`（从 Dockerfile 构建）与 `image`（用现成镜像）二选一或并存。
- **`build` 段**：`build: .` 短语法，或长语法 `build: { context: ., dockerfile: Dockerfile, target: builder }`（可指定多阶段构建的 stage）。
- **`healthcheck` 段**（与 Dockerfile 的 HEALTHCHECK 指令同语义同默认值，可覆盖镜像内设置）：
  - `test: ["CMD", "curl", "-f", "http://localhost"]`（exec 形式，无 shell）；或 `["CMD-SHELL", "curl -f http://localhost || exit 1"]`；纯字符串等价于 CMD-SHELL；`NONE` / `disable: true` 禁用。
  - 字段：`interval`、`timeout`、`retries`、`start_period`、`start_interval`（durations 写法如 `1m30s`、`10s`；durations 形式自 Compose 2.20.2 起）。
- **`depends_on` 长短语法**：
  - 短语法只控启动顺序，**不等待 healthy**（"Compose does not wait for dependency services to be 'healthy'"）。
  - 长语法 `depends_on: { db: { condition: service_healthy } }`，`condition` 取值：`service_started`（等价短语法）/ `service_healthy`（依赖健康后才启动）/ `service_completed_successfully`（一次性任务跑完）；`required: false`（依赖缺失只告警，2.20.0+）；`restart: true`（依赖更新后重启本服务，2.17.0+）。
- **常用服务字段**：`ports: ["8000:8000"]`、`environment` / `env_file`、`volumes`（命名卷实现数据持久化，容器可重建但数据不丢）、`networks`（compose 自动建项目级网络，服务名即主机名互相可达）、`restart: unless-stopped`、`deploy.resources.limits.cpus / memory`（资源限额）、`command`（覆盖镜像 CMD）。
- **卷与数据**：数据库类服务必须挂命名卷（`volumes: pgdata:/var/lib/postgresql/data` + 顶层 `volumes: { pgdata: {} }`）；`volumes_from` 可整组挂载另一服务/容器的卷（`:ro` 只读）。

## 典型用例模式

### 模式 1：FastAPI 多阶段构建 Dockerfile（构建与运行分离 + 非 root + 健康检查）

```dockerfile
# syntax=docker/dockerfile:1
# 形状来源：官方 best practices（多阶段 / USER / HEALTHCHECK / CMD exec 形式）
FROM python:3.12-slim AS builder
WORKDIR /w
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.12-slim
RUN groupadd -r app && useradd --no-log-init -r -g app app   # 显式非 root
WORKDIR /srv
COPY --from=builder /install /usr/local                       # 只带运行依赖，不带构建工具
COPY ./app ./app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD python -c "import urllib.request;urllib.request.urlopen('http://localhost:8000/healthz')" || exit 1
USER app
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]   # exec 形式，应用成为 PID 1
```

最小序列：`docker build -t petro-api:1.0 .` → 多阶段构建，最终层只含 site-packages 与应用代码 → `docker run -p 8000:8000 petro-api:1.0` → uvicorn 以 app 用户跑在 8000 → Docker 每 30s 探测 `/healthz`，连续 3 次失败标记 unhealthy（供编排层重启/摘流）。

### 模式 2：FastAPI + Postgres + Redis + MinIO 典型 compose 骨架

```yaml
# 形状来源：Compose Specification（services/build/healthcheck/depends_on/volumes 字段）
services:
  api:
    build: { context: ., target: runtime }        # 用模式 1 的多阶段镜像
    ports: ["8000:8000"]
    environment:
      DATABASE_URL: postgresql+asyncpg://petro:${PG_PASSWORD}@db:5432/petro
      REDIS_URL: redis://redis:6379/0
      S3_ENDPOINT: http://minio:9000
    depends_on:
      db:   { condition: service_healthy }        # 等数据库 ready 再起应用
      redis: { condition: service_started }
      minio: { condition: service_started }
    restart: unless-stopped

  db:
    image: postgres:16
    environment:
      POSTGRES_USER: petro
      POSTGRES_PASSWORD: ${PG_PASSWORD}
    volumes: ["pgdata:/var/lib/postgresql/data"]  # 数据持久化，重建容器不丢
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U petro"]  # 官方镜像自带 pg_isready
      interval: 5s
      retries: 5
    restart: unless-stopped

  redis:
    image: redis:7
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      retries: 5
    restart: unless-stopped

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_AK}
      MINIO_ROOT_PASSWORD: ${MINIO_SK}
    volumes: ["miniodata:/data"]
    ports: ["9000:9000", "9001:9001"]
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]       # MinIO 客户端就绪探针
      interval: 5s
      retries: 5
    restart: unless-stopped

volumes:
  pgdata: {}
  miniodata: {}
```

最小序列：`docker compose up -d --build` → compose 按依赖序创建：db/redis/minio 先起 → db 的 `pg_isready` 通过转 healthy → api 才启动（避免应用启动时数据库还没监听导致崩溃循环）→ 服务间用服务名当主机名内网互通（`db:5432`、`redis:6379`、`minio:9000`）→ `docker compose logs -f api` 看日志、`docker compose ps` 看 health 状态。

### 模式 3：镜像瘦身与构建缓存组合拳

- **瘦身**：多阶段构建剥离构建工具（gcc/make 留在 builder 阶段）；基础镜像用 `-slim`/`alpine` 变体；`.dockerignore` 排除 `.git`、`tests/`、`*.md`；apt 层内 `rm -rf /var/lib/apt/lists/*`；不在镜像里塞文本编辑器等多余软件（官方："Don't install unnecessary packages"）。
- **缓存**：`requirements.txt` **单独先 COPY** 再装依赖（依赖不变则 pip 层全命中，代码改动不触发重装）；用 `RUN --mount=type=bind` 替代 COPY 可让缓存更精准；`apt-get update && install` 同层（防缓存过期包）；需要强制刷新时用 `docker build --no-cache`。
- **交付（信创内网）**：`docker save petro-api:1.0 | gzip > petro-api.tar.gz` 导出 → 拷贝到麒麟 OS 内网机 → `docker load -i`；基础镜像需提前准备对应 CPU 架构（x86_64 / arm64 鲲鹏）的版本。

## 选型与版本

- **Docker Engine / Docker Compose v2**：Compose Specification 由 Compose v2（CLI 1.27.0+）实现，旧 `version: "3.x"` 头已废弃可省略（来源：[Compose file reference](https://docs.docker.com/reference/compose-file/)）。`depends_on.condition` / `required` / healthcheck durations 等字段要求较新的 Compose 版本（2.17.0 / 2.20.0 / 2.20.2 起，见上）。
- **基础镜像**：官方推荐 Alpine（<6MB）或各语言的 `-slim` 变体；生产与构建用不同基础镜像；版本钉 tag，供应链审计要求高时钉 digest（来源：best practices）。
- **Python 应用注意**：slim/alpine 变体不带编译工具，含 C 扩展的依赖（如 asyncpg、部分加密库）在 alpine（musl libc）上可能源码编译失败或需额外装 `build-base`，实务上 `-slim`（glibc）兼容性更好——此为本项目根据常见实践的提示，官方 best practices 页未展开 musl/glibc 差异。
- **国产化部署注意**：Docker 需确认麒麟 OS 的兼容发行（麒麟自带 iSula/兼容 Docker 的容器引擎，部分信创环境用 Podman 替代，compose 文件基本通用但 `--mount` 等 BuildKit 特性依赖构建器版本）；镜像需按目标 CPU 架构（鲲鹏 ARM / 飞腾 ARM / x86）分别构建，`docker build --platform linux/arm64` 可交叉构建。
- **未找到公开文档**：Docker 官方未给出"FastAPI 镜像体积/启动耗时"的基准数据；HEALTHCHECK 指令的逐字段默认值（interval 30s / timeout 30s 等）本次未从 Dockerfile reference 页逐项核对，落地时以 [Dockerfile reference](https://docs.docker.com/reference/dockerfile/#healthcheck) 为准。

## 官方文档锚点

- Dockerfile best practices（多阶段、非 root、缓存、钉版本、指令细则全清单）：https://docs.docker.com/develop/develop-images/dockerfile_best-practices/
- Compose file reference · services（build/healthcheck/depends_on/ports/volumes/restart 全字段）：https://docs.docker.com/reference/compose-file/services/
- Compose file reference（规范定位、旧 2.x/3.x 并入 Compose Specification）：https://docs.docker.com/reference/compose-file/
- Dockerfile reference · HEALTHCHECK（镜像级健康检查指令语法，本次未逐行核对）：https://docs.docker.com/reference/dockerfile/#healthcheck
