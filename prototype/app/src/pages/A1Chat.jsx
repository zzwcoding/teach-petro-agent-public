import { useEffect, useRef, useState } from 'react'
import {
  Alert, Button, Card, Col, Collapse, Input, List, Row, Space, Steps, Table, Tabs, Tag, Typography
} from 'antd'
import { AudioOutlined, DownloadOutlined, ThunderboltOutlined, WifiOutlined } from '@ant-design/icons'
import { DEV } from '../shell/TraceBar.jsx'

const ANSWER = '上个月产量最高的三口井如下（按日产油量排名，已剔除同班次重复行并统一单位）。'

const NODES = [
  { t: '听懂问题', d: '意图＝查数据排名 · 指标＝日产油量 · 时间＝上个月（2026-08-01 → 2026-09-01）· 条数＝前 3。含糊问法会先反问（例：「那口井怎么样了」→ 反问哪口井、哪个月）。' },
  { t: '查哪些表', d: '全库 200 张表先检索裁剪到 5 张，命中 2 张：日产计量表（井号 / 日期 / 日产油…）＋井档案表（井号 / 井名…）。表说明书带业务注释才能被问句命中。' },
  { t: '写出查询（第 1 次）', d: <div>SELECT well_name, oil_rate FROM oil_production_daily JOIN well_info USING (well_id) WHERE prod_date &gt;= '2026-08-01' AND prod_date &lt; '2026-09-01' ORDER BY oil_rate DESC LIMIT 3<div className="code-block">埋伏：oil_rate 是编出来的列名，真列叫 oil_prod——要到执行才炸。例题固定不变、按固定顺序生成（省算力、可复现）。</div></div> },
  { t: '安全检查', d: '只放行查看语句 ✓ · 单条语句 ✓ · 表在白名单 ✓ · 条数强制限量 ✓ → 放行。规则在代码里执行，不靠嘴上叮嘱。', guard: true },
  { t: '执行查询（第 1 次）', d: <span>数据库亲自报错：<code>Unknown column 'oil_rate' in 'field list'</code>。真正碰数据库的只有查询执行器（只读）。</span> },
  { t: '核对结果（第 1 次）', d: '判定：失败。处理：把报错原文＋可用表结构回灌给「写出查询」，试错计数 +1（最多 3 次；改不动就明说，不硬编一个答案）。', fail: true },
  { t: '自动改错（第 2 次生成）', d: <span>例题与表结构照旧、报错垫在末尾——助手读着报错自己改列名：<code>ORDER BY oil_prod DESC</code>。反思回边=核对失败 → 退回生成节点重来。</span> },
  { t: '再过安检并执行（第 2 次）', d: '改过的查询不豁免：同一道安全检查再过一遍 ✓ → 执行成功，返回 3 行。' },
  { t: '核对结果（第 2 次 · 通过）', d: '判定通过后，答案＋出处＋图表建议在左侧问答区点亮。' }
]
if (DEV) {
  NODES[3].d += '（m17 · W-F14-1…6）'
  NODES[5].d += '（m7 状态机 · W-F7-5/6）'
}

const FLOW_STEPS = ['受理回执', '生成中', '存入文件库', '生成下载直链']
const ART = {
  ppt: ['《上月产量 Top3 · 汇报页.pptx》', '格式 PowerPoint · 下载直链 24 小时内有效'],
  img: ['《三口井产量对比 · 示意图.png》', '文生图异步任务 · 下载直链 24 小时内有效'],
  audio: ['《上月产量解读 · 语音.mp3》', '朗读解读音频 · 下载直链 24 小时内有效']
}
const HISTORY = ['上个月产量最高的三口井', '「躺井」是什么意思', 'N-02 最近怎么样', '把 8 月完成率做成汇报']
const COLUMNS = [
  { title: '排名', dataIndex: 'rank', width: 60 },
  { title: '井', dataIndex: 'well' },
  { title: '区块 / 平台', dataIndex: 'block' },
  { title: '日产油（折吨）', dataIndex: 'oil', align: 'right' },
  { title: '说明', dataIndex: 'note' }
]
const ROWS = [
  { key: 1, rank: 1, well: 'N-02 渤中28-1-N2', block: '渤南 / CEP-A', oil: '48.60', note: '样本日 2026-09-14' },
  { key: 2, rank: 2, well: 'N-11', block: '渤中 / CEP-B', oil: '≈11.04（12.40"方"×0.89 折算）', note: '该行油量单位误录为"方"，已折算' },
  { key: 3, rank: 3, well: '—', block: '—', oil: '—', note: '演示库仅装配 3 口样本井，N-06 为注水井不产油；真实平台返回全油田 86 口采油井完整榜单' }
]

const CITATIONS = [
  { key: '1', label: '出处 1 · 日产计量表样本行', children: <div className="code-block">{`N-02|2026-09-14|48.60|165.30|70.6|50.00|24|3.1|A
N-02|2026-09-14|48.60|165.30|70.6|50.00|24|3.1|B   ←同日 A/B 班重复行
N-11|2026-09-14|12.40方|96.00|87.1|15.00|6.5|2.7|A  ←油单位误录`}</div> },
  { key: '2', label: '出处 2 · 单位换算表', children: <div className="code-block">原油密度按区块：渤南 0.86 / 渤中 0.89 / 渤西 0.91（t/m³）；吨↔方换算＝质量÷密度。</div> },
  { key: '3', label: '出处 3 · 可组合的表', children: <div className="code-block">日产计量表 ⋈ 井档案表（按井号）✓ 允许组合；日产量直连注水量 ✗ 须经受效关系。</div> }
]
if (DEV) CITATIONS.forEach(c => { c.label += '（设定书 §A.2/§2.2/§5）' })

const TOOL_CALL = {
  key: 'tc',
  label: '本次调用：数据查询工具 · 2.4s',
  children: (
    <div style={{ fontSize: 12 }}>
      参数：时间＝上个月 · 指标＝日产油量 · 条数＝前 3<br />
      命中表：日产计量表、井档案表 · 返回 3 行 · 只读执行
      {DEV && <span>（F8 工具体系 · m8 工具注册表 · W-F8-1…5）</span>}
    </div>
  )
}

const LITH_STEPS = ['自主选工具', '填参数（井号 N-02 · 井段 2500–2600m）', '权限检查（只读角色可用 ✓）', '模型返回结论', '解读给你听']

export const A1_GUIDE = [
  '点"试试示例"——右侧思考过程开始逐步跑。',
  '看第 1 次核对变红——平台查错后自动改（最多 3 次）。',
  '答案逐字出现——表格+出处都可展开核对。',
  '点任意出处——看原始数据长什么样。',
  '点"做成 PPT"——任务进队列，进度走完出下载。',
  '点"模拟断线"——断网重连回答不丢。',
  '切到"问报告/做汇报"——术语问答与汇报成品各看一条。'
]
export const A1_TRACE = 'F7 问数状态机 · F1 流式通道（断线恢复·逐字输出）· F8 工具体系 · F9 领域工具 · F10 多模态成品 · F14 执行前安检 · m13/m15/m7/m8/m17 · W-F7-1…6 · W-F1-4 · W-F8-1…5 · W-F9-1 · W-F10-1/2 · W-F14-1…6'

const sleep = ms => new Promise(r => setTimeout(r, ms))

export default function A1Chat() {
  const [q, setQ] = useState('')
  const [asked, setAsked] = useState('')
  const [cur, setCur] = useState(-1)
  const [answerShown, setAnswerShown] = useState(false)
  const [typed, setTyped] = useState(0)
  const [netDown, setNetDown] = useState(false)
  const [artStep, setArtStep] = useState(-1)
  const [art, setArt] = useState(null)
  const [toast, setToast] = useState('')
  const [lithOn, setLithOn] = useState(false)
  const [lithDone, setLithDone] = useState(false)
  const running = useRef(false)

  async function runFlow() {
    if (running.current) return
    running.current = true
    setAnswerShown(false); setTyped(0); setCur(0)
    for (let i = 1; i < NODES.length; i++) { await sleep(700); setCur(i) }
    setAnswerShown(true)
    running.current = false
  }
  function ask(text) {
    const t = (text || '').trim() || '上个月产量最高的三口井'
    setQ(t); setAsked(t); setNetDown(false)
    runFlow()
  }

  useEffect(() => {
    if (!answerShown) return
    const id = setInterval(() => setTyped(n => {
      if (n >= ANSWER.length) { clearInterval(id); return n }
      return n + 2
    }), 20)
    return () => clearInterval(id)
  }, [answerShown])

  async function runArtifact(kind) {
    setArt(null); setArtStep(0); setToast('')
    for (let i = 1; i < FLOW_STEPS.length; i++) { await sleep(650); setArtStep(i) }
    setArt(ART[kind])
  }
  function download(name) { setToast(`已开始下载「${name}」——下载直链 24 小时内有效`) }

  async function runLith() {
    setLithOn(true); setLithDone(false)
    await sleep(600)
    setLithDone(true)
  }

  const nodeState = i => {
    if (cur < 0 || i > cur) return 'wait'
    if (i === cur) return 'process'
    return 'finish'
  }

  const dataTab = (
    <div>
      <Button type="primary" icon={<ThunderboltOutlined />} onClick={() => ask('上个月产量最高的三口井')}>
        试试示例：「上个月产量最高的三口井」
      </Button>
      {asked && (
        <Card size="small" style={{ marginTop: 12, background: '#f5f5f5' }}>
          <b>我：</b>{asked}
        </Card>
      )}
      <Space.Compact style={{ width: '100%', marginTop: 12 }}>
        <Input
          placeholder="在这里打字提问……" value={q}
          onChange={e => setQ(e.target.value)}
          onPressEnter={() => ask(q)}
        />
        <Button icon={<AudioOutlined />} onClick={() => ask('上个月产量最高的三口井')}>语音提问</Button>
        <Button onClick={() => { setNetDown(true) }} icon={<WifiOutlined />}>模拟断线</Button>
      </Space.Compact>
      {netDown && (
        <Alert
          style={{ marginTop: 12 }} type="warning" showIcon closable onClose={() => setNetDown(false)}
          message="网络断开了 3 秒……已自动重连：回答从断点继续、已经出来的内容不丢，不用重新问。"
        />
      )}
      {answerShown && (
        <Card style={{ marginTop: 16 }} title={<span><Tag color="blue">智能助手</Tag>{ANSWER.slice(0, typed)}</span>}>
          <Table size="small" columns={COLUMNS} dataSource={ROWS} pagination={false} />
          <div style={{ fontSize: 12, color: '#8a94a3', marginTop: 8 }}>
            数据来源：生产日报系统 · 上月月度聚合。图表建议：三口井日产油对比柱状图。
          </div>
          <Collapse ghost items={CITATIONS} style={{ marginTop: 8 }} />
          <Collapse ghost style={{ marginTop: 4 }} items={[TOOL_CALL]} />
          <Space style={{ marginTop: 12 }}>
            <Button type="primary" onClick={() => runArtifact('ppt')}>做成 PPT</Button>
            <Button onClick={() => runArtifact('img')}>配张图</Button>
            <Button onClick={() => runArtifact('audio')}>出段语音</Button>
          </Space>
          {artStep >= 0 && (
            <div style={{ background: '#f6f8fa', borderRadius: 8, padding: 12, marginTop: 12 }}>
              <Steps size="small" items={FLOW_STEPS.map((t, i) => ({ title: t }))}
                current={artStep} status={art ? 'finish' : 'process'} />
              <div style={{ fontSize: 12, color: '#8a94a3', marginTop: 6 }}>不用干等：任务受理后先进队列，做好自动回来。</div>
            </div>
          )}
          {art && (
            <Card size="small" style={{ marginTop: 12 }}>
              <b>{art[0]}</b>
              <div id="artifact-card" style={{ fontSize: 12, color: '#8a94a3' }}>{art[1]}</div>
              <div style={{ fontSize: 12, color: '#8a94a3' }}>调用：文件生成工具 · 队列 0.6s · 生成 1.9s</div>
              <Button size="small" icon={<DownloadOutlined />} style={{ marginTop: 8 }} onClick={() => download(art[0])}>一键下载</Button>
              {toast && <div style={{ fontSize: 12, color: '#8a94a3', marginTop: 6 }}>{toast}</div>}
            </Card>
          )}
        </Card>
      )}
    </div>
  )

  const reportTab = (
    <div>
      <Card size="small" style={{ background: '#f5f5f5' }}><b>我：</b>「躺井」是什么意思？哪份材料里有？</Card>
      <Card style={{ marginTop: 12 }}>
        <Tag color="blue">智能助手</Tag>躺井＝停产待检泵，是作业区口语。回答依据下面出处，且仅限作业区语境使用。
        <Collapse ghost style={{ marginTop: 8 }} items={[
          { key: '1', label: '出处 1 · 业务术语台账「躺井」条目', children: '躺井 · 类型：黑话→停产待检泵 · 状态：有效（限作业区语境）· 负责人：采油工艺所' },
          { key: '2', label: '出处 2 · 指标口径「检泵周期」', children: '检泵周期＝本次检泵日 − 上次检泵日（单井 / 天）· 负责人：采油工艺所' }
        ]} />
      </Card>
      <Card style={{ marginTop: 12 }}>
        <Tag color="blue">智能助手</Tag>
        <b>再问一句：</b>产量完成率怎么算？——Σ实际产油 ÷ Σ计划配产 × 100%（按月、按区块或油田，负责人：开发室）。
        <Alert style={{ marginTop: 8 }} type="info" showIcon
          message={'若问到「老完成率」（2024 年已废弃的旧口径），平台会提示该词已禁用、请用「产量完成率」。'} />
      </Card>
      <Card title="专业计算：识别岩性 / 预测产量" style={{ marginTop: 16 }}>
        <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
          这两件事不走"翻报告"，是平台内置的专业模型包成工具、由助手自主调用。
        </Typography.Paragraph>
        <Button type="primary" onClick={runLith}>试试示例：「N-02 井 2500–2600 米的岩性是什么？」</Button>
        {lithOn && (
          <div style={{ marginTop: 12 }}>
            <Card size="small" style={{ background: '#f5f5f5' }}><b>我：</b>N-02 井 2500–2600 米的岩性是什么？</Card>
            <Card size="small" style={{ marginTop: 8 }}>
              <Tag color="blue">智能助手</Tag>这要用测井岩性识别模型，我来调一下。
              <Steps size="small" style={{ marginTop: 8 }} items={LITH_STEPS.map(t => ({ title: t }))}
                current={lithDone ? LITH_STEPS.length : 2} status="finish" />
            </Card>
            {lithDone && (
              <Card size="small" style={{ marginTop: 8 }}>
                <Tag color="blue">智能助手</Tag>
                识别结果：该井段以<b>砂岩为主、泥岩夹层</b>，砂岩约占七成——可作注水受效方向分析的岩性依据。只回结论和关键数值，原始测井曲线不进对话。
              </Card>
            )}
          </div>
        )}
      </Card>
      <Card size="small" style={{ marginTop: 16, background: '#f6f8fa' }}>
        <b>再来一个：</b>"预测 N-02 未来 30 天的产量"——助手调产量预测工具（要填：井号＋天数），返回逐日预测走势。同类专业函数还有递减分析：井档案页"有没有递减风险"问的就是它。
      </Card>
    </div>
  )

  const deckTab = (
    <div>
      <Card size="small" style={{ background: '#f5f5f5' }}>
        <b>我：</b>🎙 语音已转文字：把上个月完成率情况做成汇报
      </Card>
      <Card style={{ marginTop: 12 }}>
        <Tag color="blue">智能助手</Tag>
        好。口径用<b>产量完成率</b>＝Σ实际产油 ÷ Σ计划配产 × 100%（月 / 区块·油田，负责人：开发室）。两点提醒：
        <Alert style={{ marginTop: 8 }} type="warning" showIcon message={
          <span>① 汇报里别写"老完成率"——那是 2024 年废弃的禁用词。② 月度汇报数与财务口径对不上是老问题（"一数四源"）——一律按审定口径出数并标注来源。</span>
        } />
        <Card size="small" title="生成文件" style={{ marginTop: 12 }}>
          <b>《8 月产量完成率 · 汇报页.pptx》</b>{' '}
          <Button size="small" icon={<DownloadOutlined />} onClick={() => download('《8 月产量完成率 · 汇报页.pptx》')}>一键下载</Button>
          {toast && <div style={{ fontSize: 12, color: '#8a94a3', marginTop: 6 }}>{toast}</div>}
        </Card>
      </Card>
    </div>
  )

  return (
    <Row gutter={16} align="top">
      <Col span={5}>
        <Card title="历史会话" size="small">
          <List
            size="small"
            dataSource={HISTORY}
            renderItem={(h, i) => (
              <List.Item style={{ cursor: 'pointer' }} onClick={() => i === 0 && ask(h)}>
                {i === 0 ? <Tag color="blue">{h}</Tag> : <span>{h}</span>}
              </List.Item>
            )}
          />
          {DEV && <div style={{ fontSize: 12, color: '#8a94a3' }}>会话记录存服务端，换设备、断线重连都不丢（m3/m4）。</div>}
        </Card>
      </Col>
      <Col span={12}>
        <Card>
          <Tabs
            defaultActiveKey="data"
            items={[
              { key: 'data', label: '问数据', children: dataTab },
              { key: 'report', label: '问报告', children: reportTab },
              { key: 'deck', label: '做汇报', children: deckTab }
            ]}
          />
        </Card>
      </Col>
      <Col span={7}>
        <Card title="思考过程" size="small"
          extra={<span style={{ fontSize: 12, color: '#8a94a3' }}>问数据时展示 · 点步骤条重跑</span>}
          onClick={() => cur >= 0 && !running.current && runFlow()}
          style={{ cursor: 'pointer' }}>
          <div style={{ fontSize: 12, color: '#8a94a3', marginBottom: 8 }}>
            六站固定顺序＋一条"改错回流"：错了自动改，最多 3 次，改不动就明说转人工。
          </div>
          <Steps
            direction="vertical" size="small" current={cur}
            status={cur >= 0 && NODES[cur]?.fail ? 'error' : 'process'}
            items={NODES.map((n, i) => ({
              title: <span>{n.t}{n.guard ? ' 🛡' : ''}</span>,
              description: i <= cur ? <span style={{ fontSize: 12 }}>{n.d}</span> : null
            }))}
          />
        </Card>
      </Col>
    </Row>
  )
}
