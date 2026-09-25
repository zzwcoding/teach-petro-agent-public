# 国产数据库与操作系统：KingbaseES / 达梦 DM / 麒麟·统信 OS

覆盖范围（国产数据库与操作系统适配）：人大金仓 KingbaseES、达梦 DM8、麒麟/统信 OS 应用部署三部分。

## 使用场景

**在生产环境解决什么问题**

- 信创/国产化替代：政企核心系统要求数据库、操作系统自主可控，KingbaseES 与达梦是替代 Oracle/PostgreSQL/SQL Server 的主流国产关系库。金仓官方案例：某省"一网通办"系统由 PostgreSQL 迁至 KingbaseES（PG 兼容模式），近百个 Python 服务"零代码修改"完成切换，仅改连接串 host/port（来源：https://www.kingbase.com.cn/explore/tech-blog/金仓数据库兼容psycopg2全解析：国产化替代下的python生态/）。
- 多源异构迁移：KingbaseES 用可插拔架构 + 初始化参数（`initdb-s`）在部署时选定兼容模式（Oracle / MySQL / SQL Server / PostgreSQL），配合 KDTS 结构迁移工具、KFS 增量同步实现低干扰迁移（同上来源；SQL Server 兼容模式说明见 https://www.kingbase.com.cn/explore/sqlserver迁移金仓：兼容性测试数据与性能实测报告/）。注意：兼容模式是 initdb 时固化的，不能运行时随意切换。
- 达梦 DM8 定位"一个数据库满足多样化架构"：双存储引擎（行存引擎 + 列存 HUGE 表），OLTP 高频事务与 OLAP 海量分析混合处理；共享存储集群 DMDSC 提供高可用，应用无需修改（来源：https://eco.dameng.com/community/article/9e1366101d9c7e9f0656ef87e056ad14 、https://eco.dameng.com/community/article/015d15e4bd24fe683d5a0da5a9a6004c）。
- 麒麟/统信 OS：信创服务器的运行底座。银河麒麟高级服务器 V10 兼容 CentOS 8 / RHEL 8 生态（rpm/yum/dnf），统信 UOS 桌面为 Debian 分支（dpkg/apt）；实际适配策略是"按 RHEL8 系选 rpm 包"（来源：https://www.kylinos.cn/about/news/814.html 、https://www.cnblogs.com/28Blog/p/19211779）。

**典型业务场景（Petro-Agent 语境）**：油田生产数据、工单、知识库元数据落在国产库；FastAPI 服务以 systemd 服务形式部署在麒麟 V10 服务器上，CPU 架构可能是 x86_64（海光/兆芯）或 aarch64（鲲鹏/飞腾）。

**同类选型差异（一句话版）**

- KingbaseES ≈ "PG 内核深度开发"：PG 生态工具链（psycopg2/ksycopg2、协议）基本平移，适合 PG 系团队（来源：https://cloud.tencent.com/developer/article/2429180 ）。
- 达梦 DM ≈ 自研内核、Oracle 风格更浓（模式 SCHEMA、默认用户 SYSDBA、端口 5236/51236），Python 只能走官方 dmPython，没有 psycopg2 平移路径。

## 核心能力面

### KingbaseES

| 能力 | 关键 API / 配置项 | 来源 |
|---|---|---|
| 官方 Python 驱动 ksycopg2 | Python DB API 2.0 完整实现、线程安全、客户端/服务端游标、异步通信与通知、复制协议支持；是 libpq 的 C 包装 | https://bbs.kingbase.com.cn/kingbase-doc/v8.6.7.24/development/client-interfaces/python/python-1.html |
| 第三方驱动兼容 | psycopg2 2.8+ 至 3.x 官方完成兼容测试，可 `psycopg2.connect(host=..., port=54321, database=..., user=..., password=...)` 直接连（需 PG 兼容模式） | https://www.kingbase.com.cn/explore/tech-blog/金仓数据库兼容psycopg2全解析：国产化替代下的python生态/ |
| 兼容模式 | `initdb` 时按 `-m/--mode` 选定（PG/Oracle/MySQL/SQL Server）；例：Oracle 兼容模式提供 `ROWNUM`、`ROWID` 伪列、DBLink；版本基线 V009R001C010 支持四种模式 | https://blog.csdn.net/gouxiu0231/article/details/163659554 、https://www.kingbase.com.cn/explore/tech-blog/金仓数据库-oracle-兼容实践，国产替代路径如何破局/ 、https://www.kingbase.com.cn/explore/sqlserver迁移金仓：兼容性测试数据与性能实测报告/ |
| 方言差异要点 | 与 PG 并非 100% 等同：兼容模式改变 SQL 语义；`kingbase.conf` 中 `ora_input_emptystr_isnull` 等参数在 Oracle 模式下行为与 PG 不同；SQLAlchemy 需用金仓官方方言或处理版本号探测问题 | https://www.gaogushenling.com/article/tool-efficiency/tool-deployment-usage/07-database-storage-tools/relational-database/kingbase.html 、https://www.cnblogs.com/echohye/p/18965858 、https://wenku.csdn.net/column/6s07d6fttm |
| 默认端口 | 54321（非 PG 的 5432） | https://www.kingbase.com.cn/explore/tech-blog/金仓怎么指定数据库和模式？生产环境连接配置实战/ |
| 迁移工具链 | KDTS（异构结构迁移）、KFS（实时增量同步） | psycopg2 兼容解析文（同上） |
| 驱动安装方式 | ksycopg2 文件夹放入 `sys.path` 目录 + `export LD_LIBRARY_PATH=<libpq所在目录>:$LD_LIBRARY_PATH` | https://bbs.kingbase.com.cn/kingbase-doc/v8.6.7.24/development/client-interfaces/python/python-1.html |
| asyncpg | **未找到官方文档明确说明 asyncpg 支持情况**；官方异步路径是 ksycopg2 的异步通信能力 | 同上（官方仅列 ksycopg2） |

### 达梦 DM8

| 能力 | 关键 API / 配置项 | 来源 |
|---|---|---|
| Python 接口 dmPython | 实现 Python DB API 2.0；`dmPython.connect(user='SYSDBA', password='...', server='localhost', port=51236)` → `conn.cursor()`；`cursor.execute(sql, values)` 支持绑定变量（占位符 `?`）；`cursor.fetchall()/fetchone()`；异常 `dmPython.Error` | https://eco.dameng.com/document/dm/zh-cn/app-dev/python-python.html |
| 依赖 | 通过 DM DPI 接口扩展，除 Python 标准库外需 DPI 运行环境；环境变量 `DM_HOME`、`LD_LIBRARY_PATH=$DM_HOME/bin:$DM_HOME/drivers/dpi/`；源码编译需 gcc + python-devel；Windows 下需拷贝 dpi DLL | 同上（FAQ 第 2、3、4、5 条） |
| 版本基线 | DM 8.0+、Python 3.6.8+、dmPython 2.3+ | https://eco.dameng.com/document/dm/zh-cn/app-dev/python_environment.html |
| 诊断 | `dm_svc.conf` 中 `DPI_TRACE=(1)` 生成 `dmPython_trace.log` / `dpi_trace.log` | 同上 |
| 架构 | 行存/列存（HUGE 表）双存储引擎，OLTP/OLAP 混合；DMDSC 共享存储集群（需 DMCSS 同步服务，可选 DMASM）；计算层与存储层分离 | https://eco.dameng.com/community/article/9e1366101d9c7e9f0656ef87e056ad14 、https://eco.dameng.com/community/article/015d15e4bd24fe683d5a0da5a9a6004c |
| SQL 风格 | 对象寻址 `模式名.表名`（如 `PRODUCTION.PRODUCT_CATEGORY`），类 Oracle | https://eco.dameng.com/document/dm/zh-cn/app-dev/python-python.html |

### 麒麟 / 统信 OS 部署适配要点

| 要点 | 内容 | 来源 |
|---|---|---|
| 分支识别 | 银河麒麟高级服务器 V10 属 CentOS/RHEL 8 兼容系（rpm/yum/dnf）；桌面/社区版 Debian 系（dpkg/apt）；统信 UOS 类似。先用 `nkvers` / `cat /etc/os-release` 确认版本与架构 | https://www.kylinos.cn/about/news/814.html 、https://blog.csdn.net/xkx_07_10/article/details/137506904 、https://www.cnblogs.com/28Blog/p/19211779 |
| Python 服务化 | 数据库装完自动注册 systemd 服务（rpm 安装惯例）；FastAPI 应用同样写 unit 文件由 systemd 托管；系统自带 Python 版本偏旧（V10 常见 3.7/3.9），需确认依赖版本或独立编译 | https://www.cnblogs.com/tanxj/p/19048223 |
| 架构适配 | CPU 可能是海光/兆芯 x86_64 或鲲鹏/飞腾 aarch64：所有二进制依赖（驱动、dpi 库、wheel）必须选对应架构版本；ksycopg2 官方提供 Linux amd64/aarch64/mips64le（部分 Python 版本 mips64le 不支持） | https://bbs.kingbase.com.cn/kingbase-doc/v8.6.7.24/development/client-interfaces/python/python-1.html 、https://blog.csdn.net/weixin_36464343/article/details/157593757 |
| 离线源 | 内网无外网时需手工下载 rpm 包或用官方 ISO 源（麒麟 yum 源） | https://www.oceanbase.com/knowledge-base/oat-1000000000284374 |

## 典型用例模式

**KingbaseES（psycopg2 直连接法，最小序列）**

```python
import psycopg2
conn = psycopg2.connect(host="kdb-prod", port=54321, database="petro",
                        user="petro_app", password="***")
cur = conn.cursor()
cur.execute("INSERT INTO well_metric(name, value) VALUES (%s, %s) RETURNING id", ("w1", 3.14))
conn.commit()
cur.close(); conn.close()
```
来源：https://www.kingbase.com.cn/explore/tech-blog/金仓数据库兼容psycopg2全解析：国产化替代下的python生态/ 。迁移时通常只改连接串（host/port），SQL 不动。

**达梦（dmPython，最小序列）**

```python
import dmPython
conn = dmPython.connect(user='SYSDBA', password='***', server='localhost', port=51236)
cursor = conn.cursor()
cursor.execute("insert into PRODUCTION.CATEGORY(name) values(?)", ("语文",))
conn.commit()                      # 隐式/显式事务
rows = cursor.execute("select name from PRODUCTION.CATEGORY").fetchall()
conn.close()
```
来源：https://eco.dameng.com/document/dm/zh-cn/app-dev/python-python.html 。要点：绑定变量占位符是 `?`；需要 `DM_HOME` + `LD_LIBRARY_PATH` 指向 DPI 动态库。

**麒麟 OS 部署 Python 服务（序列）**：确认 `nkvers` 与架构 → 麒麟 yum 源装 python3-pip/gcc → 装对应架构的 ksycopg2/dmPython 驱动 → 写 systemd unit 托管 uvicorn/FastAPI → 数据库 rpm 安装后由 systemd 管理服务。来源：https://blog.csdn.net/xkx_07_10/article/details/137506904 、https://www.cnblogs.com/tanxj/p/19048223 。

## 选型与版本

- **KingbaseES**：基线 V8R6（V8.6.7.x 文档线，生产常见）或 V9R1C10（四种兼容模式）。Python 侧优先官方 ksycopg2（DB API 2.0 + 异步通信），或验证过的 psycopg2 2.8+。项目形态：PG 技术栈国产化时选它。
- **达梦 DM8**：基线 DM 8.0+，dmPython 2.3+，Python ≥3.6.8（FastAPI 场景建议 ≥3.9）。项目形态：客户指定达梦/Oracle 存量迁移时选它。
- **OS**：银河麒麟高级服务器 V10 SP1/SP3（RHEL8 兼容系）或统信 UOS Server 20；应用包按 el8/ky10 的 rpm 选型，双架构（x86_64/aarch64）都要出包。
- 选型差异一句话：KingbaseES 吃 PG 生态红利（迁移成本最低），达梦吃 Oracle 兼容与政企存量，两者都满足信创合规；Petro-Agent 若自主选型、团队熟 PG，优先 KingbaseES。

## 官方文档锚点

- KingbaseES 客户端编程接口·Python（ksycopg2 说明、版本兼容表、安装配置）：https://bbs.kingbase.com.cn/kingbase-doc/v8.6.7.24/development/client-interfaces/python/python-1.html
- 金仓官方：psycopg2 兼容性解析（协议级兼容、政务迁移案例、配置建议）：https://www.kingbase.com.cn/explore/tech-blog/%E9%87%91%E4%BB%93%E6%95%B0%E6%8D%AE%E5%BA%93%E5%85%BC%E5%AE%B9psycopg2%E5%85%A8%E8%A7%A3%E6%9E%90%EF%BC%9A%E5%9B%BD%E4%BA%A7%E5%8C%96%E6%9B%BF%E4%BB%A3%E4%B8%8B%E7%9A%84python%E7%94%9F%E6%80%81/
- 金仓官方：Oracle 兼容实践（内核兼容、伪列、DBLink）：https://www.kingbase.com.cn/explore/tech-blog/%E9%87%91%E4%BB%93%E6%95%B0%E6%8D%AE%E5%BA%93-oracle-%E5%85%BC%E5%AE%B9%E5%AE%9E%E8%B7%B5%EF%BC%8C%E5%9B%BD%E4%BA%A7%E6%9B%BF%E4%BB%A3%E8%B7%AF%E5%BE%84%E5%A6%82%E4%BD%95%E7%A0%B4%E5%B1%80/
- 金仓官方：SQL Server 兼容模式（initdb -s 切换方言解析器）：https://www.kingbase.com.cn/explore/sqlserver%E8%BF%81%E7%A7%BB%E9%87%91%E4%BB%93%EF%BC%9A%E5%85%BC%E5%AE%B9%E6%80%A7%E6%B5%8B%E8%AF%95%E6%95%B0%E6%8D%AE%E4%B8%8E%E6%80%A7%E8%83%BD%E5%AE%9E%E6%B5%8B%E6%8A%A5%E5%91%8A/
- 金仓官方：生产环境连接配置（默认端口 54321、database/schema 指定）：https://www.kingbase.com.cn/explore/tech-blog/%E9%87%91%E4%BB%93%E6%80%8E%E4%B9%88%E6%8C%87%E5%AE%9A%E6%95%B0%E6%8D%AE%E5%BA%93%E5%92%8C%E6%A8%A1%E5%BC%8F%EF%BC%9F%E7%94%9F%E4%BA%A7%E7%8E%AF%E5%A2%83%E8%BF%9E%E6%8E%A5%E9%85%8D%E7%BD%AE%E5%AE%9E/
- 达梦官方：Python 数据库接口（dmPython API 全部示例）：https://eco.dameng.com/document/dm/zh-cn/app-dev/python-python.html
- 达梦官方：Python 开发环境准备（版本基线）：https://eco.dameng.com/document/dm/zh-cn/app-dev/python_environment.html
- 达梦官方：dmPython 安装：https://eco.dameng.com/document/dm/zh-cn/pm/dmpython-installation.html
- 达梦官方社区：DM8 架构解析（行列双引擎）：https://eco.dameng.com/community/article/9e1366101d9c7e9f0656ef87e056ad14
- 达梦官方社区：DMDSC 共享存储集群：https://eco.dameng.com/community/article/015d15e4bd24fe683d5a0da5a9a6004c
- 麒麟官方：银河麒麟高级服务器兼容 CentOS8 说明：https://www.kylinos.cn/about/news/814.html
- 未找到公开文档：① asyncpg 对 KingbaseES 的官方支持说明（官方仅列 ksycopg2）；② kylinos.cn 上面向第三方应用迁移的系统性开发者指南（目前只有散见新闻与社区实践，麒麟官方完整适配手册未检索到公开 URL）。
