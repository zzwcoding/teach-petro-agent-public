# 国密算法 SM3/SM4（Python gmssl）

> 技术栈调研 · slug: guomi-sm
> 适用环境：国产化信创环境· 假想业务：Petro-Agent 油田智能平台（敏感字段加密存储、接口摘要签名）
> 调研日期：2026-09-12，API 形状以 gmssl 官方 README（GitHub）与 PyPI 项目页为准，并经本地安装 PyPI sdist（gmssl 3.2.2）实测验证。

## 使用场景

国密（国家商用密码）算法是央企信创环境的**合规要求**而非可选优化：等保测评、关基保护条例下，涉及敏感数据的存储与传输应使用 SM 系列算法替代 AES/SHA-256/MD5。对 Petro-Agent 这类平台：

- **敏感字段加密存储**：井位坐标、产量数据、员工手机号等落 Postgres（金仓数据库）前先 SM4 加密，库被拖走也不明文泄露。
- **接口摘要签名**：对请求体/响应体做 SM3 摘要，配合时间戳、nonce 做防篡改验签（对接内部系统或 Java 侧常用 SM3withSM2 签名体系）。
- **与国产基础设施配合**：金仓数据库自身支持 SM3/SM4 加密列，应用层 gmssl 加密与之互补（应用层管"进库前"，库内 TDE/列加密管"落盘后"）。

与同类选型差异（一句话版）：`pycryptodome` 只有 AES/RSA/SHA 系列，无国密；`gmssl`（duanhongyi）是纯 Python 实现、类 BSD 许可可商用、API 极简，是 Python 侧国密的事实标准小库；更大型的替代是 GmSSL（C 库，guanzhi/GmSSL）及其 tongsuopy 绑定（性能更好但部署重），另有腾讯/江南天安等厂商 SDK（闭源或半开源）。本项目 Python 侧选纯 Python 实现，即 gmssl。

## 核心能力面

### SM3 摘要（`gmssl.sm3`）

来源：[gmssl README](https://github.com/duanhongyi/gmssl)（master 分支 README 含 SM3 章节）＋本地 sdist 源码实测

- **算法定位**：SM3 是 256-bit 杂凑（摘要）算法，输出 32 字节，对标 SHA-256；README 中 SM2 签名一节即用 SM3 做杂凑（`sign_with_sm3` / `verify_with_sm3`）。
- **`sm3.sm3_hash(msg)`**：`msg` 为**字节 int 列表**（不是 bytes！），用 `func.bytes_to_list(data)` 转换；返回值为字节 int 列表，转十六进制字符串用 `func.list_to_bytes(result).hex()`。实测 `sm3_hash(bytes_to_list(b"abc"))` 输出 `66c7f0f4...ba8e0`，与 SM3 公开标准测试向量一致。
- **`sm3.sm3_kdf(z, klen)`**：密钥派生函数，**第一个参数是十六进制字符串的 bytes（如 `b'616263'`），不是列表**——传 `bytes_to_list` 的列表会直接抛 `AttributeError`（本地实测确认）；`klen` 为派生密钥长度（字节）。源码注释："z 为 16 进制表示的比特串（str），klen 为密钥长度（单位 byte）"。
- **坑点**：README 未提供 SM3 独立用法的完整示例段落（SM3 章节仅在 SM2 签名语境出现），`sm3_hash` 的"列表进列表出"转换全靠 `gmssl.func` 里的 `bytes_to_list` / `list_to_bytes` 辅助函数，这两个辅助函数在 README 中没有文档说明——签名 `[来源：sm3.py/func.py 源码]`。

### SM4 分组加密（`gmssl.sm4.CryptSM4`）

来源：[gmssl README](https://github.com/duanhongyi/gmssl)＋本地 sdist 源码实测

- **算法定位**：SM4 是分组密码，分组长度 128 bit、密钥长度 128 bit（16 字节 key），对标 AES-128。
- **API 形状**（README 示例原文）：
  ```python
  from gmssl.sm4 import CryptSM4, SM4_ENCRYPT, SM4_DECRYPT
  crypt_sm4 = CryptSM4()                        # PyPI 3.2.2 版：构造函数只有 mode 参数
  crypt_sm4.set_key(key, SM4_ENCRYPT)           # key 为 16 字节 bytes
  cipher = crypt_sm4.crypt_ecb(plain)           # ECB
  crypt_sm4.set_key(key, SM4_DECRYPT)
  plain = crypt_sm4.crypt_ecb(cipher)
  crypt_sm4.set_key(key, SM4_ENCRYPT)
  cipher = crypt_sm4.crypt_cbc(iv, plain)       # CBC，iv 为 16 字节 bytes
  ```
- **填充模式**：master 分支 README 记载构造函数支持 `padding_mode` 参数——`0` NoPadding（要求输入是 16 字节倍数）、`1` ZERO（ANSI X9.19 补 0x00）、`2` ISO9797M2（补 0x80 再补 0x00）、`3` **PKCS7（默认值）**、`4` PBOC（PBOC2018 规范）。**注意**：PyPI 最新 sdist（gmssl 3.2.2）的 `CryptSM4.__init__(self, mode=SM4_ENCRYPT)` 尚**没有** `padding_mode` 参数，固定走 `func.padding`/`func.unpadding`（PKCS7）——即该特性在 GitHub master 已合入但未发版；本地实测 3.2.2 的 `crypt_ecb`/`crypt_cbc` 均强制 PKCS7 填充/去填充（分组不足或填充非法会抛异常）。
- **没有 GCM**：gmssl 的 SM4 只提供 ECB 与 CBC 两种模式（README 只列 `encrypt_ecb/decrypt_ecb/encrypt_cbc/decrypt_cbc`，本地 `dir(CryptSM4)` 实测无 `crypt_gcm`）——**需要 GCM/CCM 等 AEAD  authenticated 模式时 gmssl 不满足**，得换 GmSSL C 库绑定（tongsuopy）或厂商 SDK；生产存储场景用 CBC + 应用层 HMAC/完整性字段弥补。
- **ECB/CBC 安全提示**：ECB 不隐藏数据模式（同明文分组→同密文分组），README 虽给出 ECB 示例，生产敏感字段存储应优先 CBC（随机 IV）或更高模式；IV 与密文一起存储/传输（IV 本身无需保密）。

### SM2（README 一并提供）

来源：[gmssl README](https://github.com/duanhongyi/gmssl)

- `sm2.CryptSM2(public_key=..., private_key=...)`：公钥 64 字节、私钥 32 字节，均为**十六进制字符串**（非 bytes）；`asn1=True` 参数用于对接 Java 验签失败的场景。
- `encrypt(data)` / `decrypt(enc)`：数据 bytes 进出；`sign(data, random_hex_str)` / `verify(sign, data)`：签名需外部传入随机数 `func.random_hex(para_len)`，返回十六进制；`sign_with_sm3(data)` / `verify_with_sm3(sign, data)`：内部杂凑，更常用。
- 定位：椭圆曲线公钥算法（对标 ECDSA/ECIES），README 原文"同等安全程度要求下，椭圆曲线密码较其他公钥算法所需密钥长度小很多"。

## 典型用例模式

### 模式 1：敏感字段 SM4-CBC 加密后落库（金仓/Postgres 通用）

```python
# 形状来源：gmssl README（CryptSM4 用法）＋本地实测
import os, base64
from gmssl.sm4 import CryptSM4, SM4_ENCRYPT, SM4_DECRYPT

KEY = os.environ["SM4_KEY"].encode()          # 16 字节，环境变量注入，勿写进代码

def sm4_encrypt(plain: bytes) -> str:
    iv = os.urandom(16)                       # 每次随机 IV（CBC 必须）
    c = CryptSM4()
    c.set_key(KEY, SM4_ENCRYPT)
    cipher = c.crypt_cbc(iv, plain)           # PKCS7 填充（3.2.2 固定行为）
    return base64.b64encode(iv + cipher).decode()   # IV 拼在密文前一起存

def sm4_decrypt(payload: str) -> bytes:
    raw = base64.b64decode(payload)
    iv, cipher = raw[:16], raw[16:]
    c = CryptSM4()
    c.set_key(KEY, SM4_DECRYPT)
    return c.crypt_cbc(iv, cipher)            # 自动去填充
```

最小调用序列：写入 → 明文 bytes → 随机 IV + `crypt_cbc` → `IV‖密文` base64 → 存 TEXT 列；读取 → base64 解码 → 拆 IV → `crypt_cbc` 解密 → 去填充得明文。生产要点：key 走 KMS/环境变量不进镜像；`set_key` 加解密切换方向别漏；gmssl 无 GCM，完整性靠业务层 MAC。

### 模式 2：SM3 接口摘要签名（防篡改）

```python
# 形状来源：sm3.py 源码实测（列表进出）＋ README 的 SM3withSM2 语境
import json, time
from gmssl import sm3, func

def sm3_hex(data: bytes) -> str:
    return func.list_to_bytes(sm3.sm3_hash(func.bytes_to_list(data))).hex()

def sign_payload(body: dict, secret: str) -> str:
    canonical = json.dumps(body, sort_keys=True, separators=(",", ":"))
    to_hash = f"{canonical}|{secret}|{int(time.time())}".encode()   # 摘要输入串接密钥+时间戳
    return sm3_hex(to_hash)
```

最小调用序列：客户端与服务端共享 secret → 对规范序列化的报文 + secret + 时间戳做 SM3 → 摘要随请求头传递 → 服务端重算比对。注意：`sm3_hash` 只吃 int 列表，直接传 bytes 会跑出错或静默出错——必须先 `func.bytes_to_list`；这与 SM4 的 bytes 进出习惯不同，是 gmssl 最容易踩的形状坑。

### 模式 3：SM3 KDF 派生密钥（README 未展开，源码能力）

```python
# 形状来源：sm3.py 源码注释（z 为十六进制比特串，klen 单位 byte）＋本地实测
from gmssl import sm3
derived = sm3.sm3_kdf(b'616263', 32)          # 传入 hex 字符串 bytes；传 bytes_to_list 列表会 AttributeError
```

## 选型与版本

- **gmssl 3.2.2**（PyPI 当前最新，2026-09-12 调研）：`pip install gmssl`；纯 Python 实现、无 C 扩展，类 BSD 许可可闭源商用（README 原文）。
- **GitHub master 领先于 PyPI**：`padding_mode` 多填充模式、`CryptSM4(padding_mode=3)` 示例只存在于 master README，3.2.2 sdist 源码实测无此参数——需要 NoPadding/PBOC 填充时须从 GitHub 源码安装（`pip install git+https://github.com/duanhongyi/gmssl.git`），且要自担未发版风险。
- **发布物瑕疵**：PyPI 上 3.2.2 的 sdist 文件名带 `.linux-x86_64` 后缀且内含打包者的 conda env 路径残留（本地解压确认 `usr/local/envs/...` 结构），wheel 为纯 Python `py3-none-any`——建议优先装 wheel；这也说明该项目维护松散，生产使用要锁版本、做依赖审查。
- **信创适配**：纯 Python 无 native 扩展，麒麟 OS（x86/ARM 鲲鹏/飞腾）均可直接运行；性能上纯 Python 实现比 C 扩展慢一到两个数量级，高频加解密（如批量字段解密、大文件）应评估 GmSSL C 库（tongsuopy）或硬件密码机。
- **合规口径**：GM/T 0004（SM3）、GM/T 0002（SM4）标准本身不在本次调研范围；落地时的密评（商用密码应用安全性评估）要求以主管部门最新规范为准。
- **未找到公开文档**：gmssl 的 SM3 独立用法（非 SM2 语境）官方 README 无完整示例，仅源码可得；gmssl 与金仓数据库内置国密函数的互操作（密文格式/填充是否一致）未找到公开文档，需实测。

## 官方文档锚点

- gmssl 项目主页（PyPI：安装、README 全文）：https://pypi.org/project/gmssl/
- gmssl GitHub 仓库（README：SM2/SM4 API 示例、padding_mode 说明、类 BSD 许可声明）：https://github.com/duanhongyi/gmssl
- gmssl master README raw（本次 SM3 章节与 padding_mode 细节核对来源）：https://raw.githubusercontent.com/duanhongyi/gmssl/master/README.md
- 未找到公开文档：SM3 独立用法示例、金仓数据库内置 SM4 与 gmssl 密文互操作说明（见"选型与版本"）。
