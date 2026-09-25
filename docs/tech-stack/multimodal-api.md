# 多模态生成接口集成（python-pptx / 通义万相文生图·文生视频 / edge-tts / FunASR）

> 技术栈调研（接口级：不深入生成模型原理）
> 面向假想业务：Petro-Agent 油田智能平台（FastAPI 异步底座 + LiteLLM 网关 + 三 Agent + 国产化部署）

## 使用场景

在 Petro-Agent 平台中，多模态生成接口解决"Agent 产出物不止文本"的问题，典型场景：

- **自动汇报材料**：智能问数/问智 Agent 将分析结论一键生成 .pptx 汇报文件（生产日报、措施建议评审），python-pptx 在服务端按模板填充图表结论。
- **文生图配图**：问智 Agent 为方案文档生成示意图（如"注水剖面示意图"），走通义万相 API，满足国产化部署诉求。
- **文生视频**：培训/宣贯材料生成短视频片头或工艺动画示意，走万相视频生成 API（异步任务，耗时通常 1~5 分钟）。
- **语音交互**：现场巡检语音指令转文字（ASR，FunASR 本地化部署，数据不出内网），平台播报/语音导览（TTS，edge-tts 免费快速、或后续换国产云 TTS）。

同类选型差异（一句话版）：
- PPT 生成：python-pptx（纯 Python 读写 .pptx，模板驱动）vs Aspose.Slides（商业库、转换能力强但收费）vs LibreOffice headless 转换（渲染导出用，非生成）。
- 文生图：通义万相（国产、DashScope 统一网关、异步任务）vs OpenAI DALL·E / Stability（海外，国产化场景不合规）。
- TTS：edge-tts（免费、微软 Edge 在线服务、无 SLA，只能演示/原型）vs 云厂商 TTS（阿里云 CosyVoice 等有正式 SLA，生产应迁云）。
- ASR：FunASR（开源、可完全私有化、ModelScope 生态，中文效果对标 Whisper）vs Whisper（OpenAI 开源，英文强、中文略弱、无 VAD/说话人管线开箱组合）。

## 核心能力面

### 1. python-pptx（PPT 生成）

来源：[python-pptx Quickstart](https://python-pptx.readthedocs.io/en/latest/user/quickstart.html)、[项目首页](https://python-pptx.readthedocs.io/)

- `Presentation()`：创建空演示文稿；`Presentation('模板.pptx')` 基于现有模板打开。
- `prs.slide_layouts[i]`：版式集合，官方示例用 `[0]`（标题页）、`[1]`（标题+项目符号）、`[5]`（仅标题）、`[6]`（空白）。
- `prs.slides.add_slide(layout)`：加页；返回 slide 有 `.shapes`、`.placeholders`、`shapes.title`。
- `slide.shapes.add_textbox(left, top, width, height)`：加文本框，返回 shape 有 `.text_frame`。
- `_TextFrame.text` / `.add_paragraph()` / `_Paragraph.level` / `_Paragraph.font.bold/.size`：段落级控制（quickstart 原文：并非所有 shape 都能容纳文本，`has_text_frame` 可判断；`text_frame.text` 写入会清空除首段外的所有段落）。
- `slide.shapes.add_picture(img_path, left, top, height=...)`：插图。
- `slide.shapes.add_shape(MSO_SHAPE.XXX, ...)`（`from pptx.enum.shapes import MSO_SHAPE`）、`slide.shapes.add_table(rows, cols, ...).table`：自选图形与表格。
- `prs.save('test.pptx')`：保存。单位用 `pptx.util.Inches` / `Pt`。
- 官方定位：创建、读取、更新 .pptx（"creating, reading, and updating PowerPoint (.pptx) files"）。

### 2. 通义万相·文生图（DashScope HTTP / SDK）

来源：[万相-文生图V1版API参考](https://help.aliyun.com/zh/model-studio/text-to-image-api-reference)、[文本生成图像](https://help.aliyun.com/zh/model-studio/text-to-image)

- 模型 `wanx-v1`（V1 版；官方注明"推荐使用全面升级的文生图V2版模型"）。限流：任务下发 QPS 2、同时处理中任务 1、免费额度 500 张。计费 0.16 元/张。
- **HTTP 仅支持异步**：必须带请求头 `X-DashScope-Async: enable`（缺失报 "current user api does not support synchronous calls"）。两步：
  1. `POST https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis`（旧域名 `dashscope.aliyuncs.com` 仍可用）→ 返回 `output.task_id`、`task_status`（PENDING/RUNNING/SUCCEEDED/FAILED/CANCELED/UNKNOWN）。
  2. `GET /api/v1/tasks/{task_id}` → 成功时 `output.results[].url`（OSS 图片 URL，**有效期 24 小时**，需及时转存）。
- 请求体：`model`（必选）、`input.prompt`（必选，≤800字符）、`input.negative_prompt`（可选，≤500字符）、`input.ref_img`（可选，参考图 URL）、`parameters.style`（`<auto>/<photography>/<portrait>/<3d cartoon>/<anime>/<oil painting>/<watercolor>/<sketch>/<chinese painting>/<flat illustration>`）、`parameters.size`（`1024*1024`/`720*1280`/`768*1152`/`1280*720`）、`parameters.n`（1~4）、`parameters.seed`（[0, 2147483647]）、`parameters.ref_strength`（[0.0,1.0]）、`parameters.ref_mode`（`repaint`/`refonly`）。
- 响应：`task_metrics.TOTAL/SUCCEEDED/FAILED`；`usage.image_count` 只对成功张数计费。部分失败时整体状态仍为 SUCCEEDED，逐张给 url 或 code/message。
- Python SDK（dashscope）：`ImageSynthesis.call(...)` 同步封装、`ImageSynthesis.async_call()/wait()/fetch()/cancel()`；模型常量 `ImageSynthesis.Models.wanx_v1`；地域基址 `dashscope.base_http_api_url = 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1'`。
- 企业网络注意：结果图存 OSS，出口白名单需放通对应地域域名（如 `dashscope-result-bj.oss-cn-beijing.aliyuncs.com`，官方列了 10 个地域）。

### 3. 通义万相·文生视频

来源（定向搜索摘要，未逐字抓取全文）：[万相-文生视频API参考（2.1～2.6）](https://help.aliyun.com/zh/model-studio/legacy-wan-text-to-video-api-reference)

- 旧版协议支持 wan2.6 及早期系列（wan2.5/wan2.2/wanx2.1）；视频生成任务耗时通常 1~5 分钟，**API 为异步调用**，"创建任务 → 轮询获取"两步，形态与文生图一致。具体请求路径与参数（分辨率档位、时长、运镜等）以官方文档页为准——本轮调研未展开抓取，标注为部分覆盖。

### 4. edge-tts（TTS）

来源：[rany2/edge-tts GitHub README](https://github.com/rany2/edge-tts)

- 本质：Python 模块 + CLI，封装 **Microsoft Edge 在线 TTS 服务**（非微软官方 API、无 SLA）。
- CLI：`edge-tts --text "..." --write-media hello.mp3 --write-subtitles hello.srt`（可同时出字幕）；`edge-tts --list-voices` 列出全部音色；`--voice zh-CN-...Neural` 切换音色；`--rate=-50%`、`--volume=-50%`、`--pitch=-50Hz` 调语速/音量/音高（负值必须写成 `--rate=-50%`，否则被当作命令行选项）。
- Python 模块：可 import 使用（README 指向 `/examples/`、`/src/edge_tts/util.py`）；库内部走流式合成。
- 重要限制：**自定义 SSML 支持已移除**——服务端只接受 Edge 自身生成的"单 `<voice>` 标签内套单 `<prosody>` 标签"结构。

### 5. FunASR（ASR，私有化部署）

来源：[modelscope/FunASR GitHub README](https://github.com/modelscope/FunASR)

- 定位：工业级语音识别工具包（"Industrial speech recognition toolkit for offline, streaming, and edge deployment"），MIT 协议（模型权重单独授权），Python ≥ 3.8，先装 torch/torchaudio。
- 核心入口 `funasr.AutoModel(model=..., vad_model=..., punc_model=..., spk_model=..., device=...)`，统一接口 + ModelScope 模型 ID 即插即用。官方"中文生产管线"示例：`AutoModel(model="paraformer-zh", vad_model="fsmn-vad", punc_model="ct-punc", spk_model="cam++", device="cuda")`。
- `model.generate(input="音频路径或URL", hotword="关键词 20", batch_size_s=300)` → `result[0]["text"]`；带 VAD+说话人时结果含 `sentence_info`（start/spk/sentence 时间戳+匿名说话人编号）。
- 流式：`AutoModel(model="paraformer-zh-streaming")` + `cache={}` + `chunk_size=[0,10,5]` + `is_final` 逐块喂音频。
- CLI（Agent 友好）：`funasr audio.wav --output-format json|srt --spk --timestamps`。
- **OpenAI 兼容服务**：`funasr-server --host 127.0.0.1 --port 8000 --model sensevoice --device cpu`，端点 `POST /v1/audio/transcriptions`（multipart 表单 `file`/`model`/`response_format=verbose_json`），可直接对接 LangChain/Dify/AutoGen。
- 热门 checkpoint：SenseVoiceSmall（234M，中英日韩粤+情绪/事件标签，CPU 友好）、paraformer-zh（220M，时间戳）、Fun-ASR-Nano-2512（800M，LLM 式转写，可配 vLLM `AutoModelVLLM` 批处理）、fsmn-vad、ct-punc、cam++。
- 边缘部署：GGUF + llama.cpp 单二进制（llama-funasr-sensevoice），官方称中文 CER 比 whisper.cpp 低约 3 倍。

## 典型用例模式

### 模式 A：模板驱动生成 PPT（python-pptx）

最小调用序列：`Presentation('模板.pptx')` → 遍历/新增 `slides.add_slide(prs.slide_layouts[N])` → 写 `shapes.title.text` / `placeholders[i].text` / `add_textbox()` / `add_picture()` → `prs.save(path)`。代码形状（官方 quickstart 精简）：

```python
from pptx import Presentation
from pptx.util import Inches, Pt

prs = Presentation()                       # 或 Presentation('template.pptx')
slide = prs.slides.add_slide(prs.slide_layouts[6])   # 空白版式
box = slide.shapes.add_textbox(Inches(1), Inches(1), Inches(1), Inches(1))
box.text_frame.text = "油田日报"
p = box.text_frame.add_paragraph()
p.text = "日产油 xxx 吨"; p.font.size = Pt(20)
slide.shapes.add_picture('chart.png', Inches(1), Inches(1))
prs.save('report.pptx')
```

### 模式 B：异步文生图（万相 HTTP 两步 + 轮询）

`POST .../image-synthesis`（带 `X-DashScope-Async: enable`）→ 存 `task_id` → 循环 `GET .../tasks/{task_id}` 直到 `task_status == "SUCCEEDED"` → 立即下载 `results[].url` 转存自有存储（24 小时过期）。SDK 简化为 `ImageSynthesis.call(...)`（同步封装）或 `async_call()` + `wait()`。

```python
from dashscope import ImageSynthesis
rsp = ImageSynthesis.call(api_key=KEY, model=ImageSynthesis.Models.wanx_v1,
                          prompt="注水剖面示意图", n=1, size='1024*1024')
urls = [r.url for r in rsp.output.results]   # 随后 requests.get(url) 下载转存
```

### 模式 C：TTS 出音频+字幕（edge-tts CLI 一行）

`edge-tts --voice zh-CN-XiaoxiaoNeural --text "结论：本井日产油..." --write-media out.mp3 --write-subtitles out.srt`。Python 侧 `pip install edge-tts` 后 import 其异步 API 流式写文件。

### 模式 D：ASR 私有化服务（FunASR）

嵌入模式（进程内）：`AutoModel(model="paraformer-zh", vad_model="fsmn-vad", punc_model="ct-punc", device="cuda")` → `model.generate(input=wav)`。服务模式（跨语言/跨进程）：起 `funasr-server`（OpenAI 兼容），业务侧用标准 OpenAI SDK 打 `POST /v1/audio/transcriptions`，与 LiteLLM 网关的 OpenAI 形态天然对齐。

```python
from funasr import AutoModel
model = AutoModel(model="paraformer-zh", vad_model="fsmn-vad", punc_model="ct-punc", device="cuda")
res = model.generate(input="巡检录音.wav", hotword="井口 套管")
print(res[0]["text"])
```

## 选型与版本

| 组件 | 建议基线 | 依据 |
|---|---|---|
| python-pptx | 1.0.x（readthedocs "latest" 即 1.0.0 文档） | https://python-pptx.readthedocs.io/en/latest/user/quickstart.html |
| DashScope SDK | 官方要求"最新版"（pip install dashscope），未指定版本号 | https://help.aliyun.com/zh/model-studio/text-to-image-api-reference |
| 万相文生图 | V1 用 `wanx-v1`；新项目官方推荐 **V2 版**（如 `wanx2.1-t2i-turbo`，见文档内 CLI 示例） | 同上 |
| 万相文生视频 | wanx2.1 系列（旧版协议，官方已推 2.6/2.7 新模型） | https://help.aliyun.com/zh/model-studio/legacy-wan-text-to-video-api-reference |
| edge-tts | PyPI 最新（README 未给版本基线，**未找到公开版本基线说明**） | https://github.com/rany2/edge-tts |
| FunASR | 1.4.15（README "What's new" 明确 `pip install -U "funasr==1.4.15"`，已适配 NumPy 2）；Python ≥ 3.8 | https://github.com/modelscope/FunASR |

国产化落地建议：文生图/视频走 DashScope（阿里云百炼，北京地域 + 业务空间专属域名），ASR 用 FunASR 私有化（数据不出内网），TTS 演示用 edge-tts、生产切换国产云 TTS（edge-tts 为逆向在线服务，无 SLA，**不能**作为生产依赖）。

## 官方文档锚点

- python-pptx Quickstart（全部最小示例出处）：https://python-pptx.readthedocs.io/en/latest/user/quickstart.html
- python-pptx 项目首页（定位：create/read/update .pptx）：https://python-pptx.readthedocs.io/
- 阿里云百炼·文本生成图像（模型概览/指南）：https://help.aliyun.com/zh/model-studio/text-to-image
- 万相-文生图V1版API参考（请求/响应参数、SDK 示例、OSS 域名白名单表）：https://help.aliyun.com/zh/model-studio/text-to-image-api-reference
- 万相-文生图V2版API参考（本轮未展开，留作后续锚点）：https://help.aliyun.com/zh/model-studio/text-to-image-v2-api-reference
- 万相-文生视频API参考（2.1～2.6，旧版协议，仅摘要级覆盖）：https://help.aliyun.com/zh/model-studio/legacy-wan-text-to-video-api-reference
- edge-tts GitHub（CLI/Python 用法、SSML 限制）：https://github.com/rany2/edge-tts
- FunASR GitHub（AutoModel 管线、CLI、funasr-server、Model Zoo、1.4.15 版本）：https://github.com/modelscope/FunASR
- FunASR OpenAI 兼容服务示例：https://github.com/modelscope/FunASR/blob/main/examples/openai_api/README_zh.md

**未找到/未覆盖的公开文档**：① 万相文生视频的具体请求路径与参数细节（本轮只拿到搜索摘要，未抓取全文）；② edge-tts 的官方版本基线；③ python-pptx 官方不支持"渲染幻灯片为图片"的能力说明页（社区共识，官方文档未直接声明）。
