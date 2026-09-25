import { useEffect, useRef, useState } from 'react'
import {
  Alert, Button, Card, Checkbox, Col, Empty, Row, Space, Spin, Steps, Switch, Table, Tabs, Tag, Typography
} from 'antd'
import { UploadOutlined } from '@ant-design/icons'

window.__guides = Object.assign(window.__guides || {}, {
  B1: [
    '点"上传报告（直传）"——右侧处理管线从解析到索引期加法逐步点亮。',
    '管线走完——自动产出"全文档摘要"和"可能被问的 10 个问题"两张卡。',
    '点管线任意处——全流程重跑一遍。',
    '关掉"语义索引"开关——出现黄色提示卡说明关掉的后果，管线"建索引"一步的 ✓/✗ 同步变。',
    '切"切段方式"三个页签——同一段原文三种切法对照立刻换。',
    '点"保存本库配置"——保存提示出现，开关在下次入库时定型。'
  ]
})
window.__traces = Object.assign(window.__traces || {}, {
  B1: 'F5 对象存储 · F6 RAG 管道 · F30 大小段配合 · F32 四开关 · F37 索引期加法 · m5/m6/m14 卡'
})

const LIBS = [
  { key: 1, name: '完井报告库', doc: '《N-02 井完井报告（英文 · 200 页）》', sw: ['语义 ✓', '关键词 ✓', '百科 ✓', '图谱 ✓'] },
  { key: 2, name: '生产月报库', doc: '《渤中28-1 区块月度生产月报（2026-08）》', sw: ['语义 ✓', '关键词 ✓', '百科 ✓', '图谱 ✗'] },
  { key: 3, name: '制度文件库', doc: '《平台管理制度文件（示例）》', sw: ['语义 ✓', '关键词 ✓', '百科 ✓', '图谱 ✗（省抽取费）'] }
]
const LIB_COLUMNS = [
  { title: '库', dataIndex: 'name', width: 110 },
  { title: '最近入库', dataIndex: 'doc' },
  { title: '索引开关', dataIndex: 'sw', render: sw => sw.join('　') }
]

const FLOW = ['解析（读出文字和图）', '切段', '向量化', '建索引', '索引期加法（摘要＋问题）']

const QUESTIONS = [
  'N-02 井是什么时候投产的？（设定书 §A.1）',
  'N-02 井在哪个平台、哪个区块？（设定书 §A.1）',
  'N-02 井的完井方式是什么？（报告正文 · PRD F30 例问）',
  'N-02 是采油井还是注水井？（设定书 §A.1）',
  'N-02 井的日产油、含水率是多少？（设定书 §A.2 样本行）',
  '报告里的岩性柱状图说了什么？（图片说明块命中 · PRD F36）',
  '报告提到哪几类措施？（压裂 / 酸化 / 补孔 / 调剖 · 设定书 §A.5）',
  'N-06 注水影响哪些井？（受效关系 · 设定书 §5 / PRD F40）',
  '这份报告的中文百科页长什么样？（PRD F50）',
  '这份报告适合回答哪类问题？（全文档摘要块 · PRD F37）'
]

const MODE_TEXT = {
  smart: '智能切段——按章节和语义边界切，一段 256–1024 字，相邻段重叠 10–20%。',
  fixed: '固定大小——每段等长，句子可能被拦腰斩断。',
  mixed: '大小段配合——小段进索引负责被找到，大段入库负责被读懂。'
}
const RAW_TEXT = '3. N-02 井完井情况。3.1 基本数据：N-02 井（渤中28-1-N2）位于渤南区块 CEP-A 平台，井别采油（EW），2019-06-15 投产。3.2 完井段：详见射孔与防砂参数表。'

const sleep = ms => new Promise(r => setTimeout(r, ms))

export default function B1() {
  const [libsLoading, setLibsLoading] = useState(true)
  const [uploaded, setUploaded] = useState(false)
  const [cur, setCur] = useState(-1)
  const [done, setDone] = useState(false)
  const running = useRef(false)
  const [sw, setSw] = useState({ semantic: true, keyword: true, wiki: true, graph: false })
  const [addSummary, setAddSummary] = useState(true)
  const [addQuestions, setAddQuestions] = useState(true)
  const [saved, setSaved] = useState(false)
  const [mode, setMode] = useState('smart')

  useEffect(() => {
    const id = setTimeout(() => setLibsLoading(false), 500)
    return () => clearTimeout(id)
  }, [])

  async function runFlow() {
    if (running.current) return
    running.current = true
    setDone(false); setCur(0)
    for (let i = 1; i < FLOW.length; i++) { await sleep(650); setCur(i) }
    setDone(true)
    running.current = false
  }
  function upload() {
    setUploaded(true)
    runFlow()
  }

  const mark = on => (on ? '✓' : '✗')
  const stepCards = []
  if (cur >= 0) {
    stepCards.push({ key: 's1', label: '步 1 · 解析', text: '读出正文和插图；报告原文原样存进文件库（桶：报告原文），一个字不动——以后任何引用都能翻回原文。' })
    if (cur >= 1) stepCards.push({ key: 's2', label: '步 2 · 切段', text: `切段方式：${MODE_TEXT[mode]} 想看三种切法的对照，用下面"切段方式"现场切换。` })
    if (cur >= 2) stepCards.push({ key: 's3', label: '步 3 · 向量化', text: '把每段换成一串"语义坐标"：意思相近的段坐标就相近——问句换个说法也能搜到，靠的就是它。' })
    if (cur >= 3) stepCards.push({ key: 's4', label: '步 4 · 建索引', text: `按四开关写入索引：语义 ${mark(sw.semantic)} · 关键词 ${mark(sw.keyword)} · 百科页 ${mark(sw.wiki)} · 关系图谱 ${mark(sw.graph)}。关掉的支路不跑、不产生抽取费用。` })
  }

  const switches = [
    { key: 'semantic', name: '语义索引', note: '换种说法也能搜到（语义搜索的底子）', off: '关掉后：只剩关键词精确命中，问法一换就可能搜不到。' },
    { key: 'keyword', name: '关键词索引', note: '按字面精确搜：井号、编号一搜一个准。', off: '关掉后：同义词问法仍能靠语义命中，但精确编号（如 N-02）搜不到——对照实验可复述。' },
    { key: 'wiki', name: '百科页', note: '入库后顺手生成中文百科页（如 200 页英文完井报告 → 一页中文）。', off: <span>关掉后：不生成百科页，英文原版就只能整本翻（含跳转<a href="#/B4">"报告百科"页</a>链接）。</span> },
    { key: 'graph', name: '关系图谱', note: '逐段抽"谁—什么关系→谁"，费用较高；没有关系的库（如制度文件）建议关。', off: '（图谱已关）本次入库不做关系抽取，省下费用；"哪些井受过 N-06 注水影响"这类问题将答不了。想开 → 点上面开关。' }
  ]

  const chunkTab = (
    <div>
      <div className="code-block">{RAW_TEXT}</div>
      {mode === 'smart' && (
        <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.9 }}>
          <div><Tag color="blue">小段 1</Tag>3. N-02 井完井情况。3.1 基本数据：N-02 井（渤中28-1-N2）位于渤南区块 CEP-A 平台，井别采油（EW）。</div>
          <div><Tag color="blue">小段 2</Tag>……井别采油（EW），2019-06-15 投产。3.2 完井段：详见射孔与防砂参数表。</div>
        </div>
      )}
      {mode === 'fixed' && (
        <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.9 }}>
          <div><Tag color="blue">小段 1</Tag>3. N-02 井完井情况。3.1 基本数据：N-02 井（渤中28-1-N2）位于渤</div>
          <div><Tag color="blue">小段 2</Tag>南区块 CEP-A 平台，井别采油（EW），2019-06-15 投产。3.2 完井段：详见……</div>
        </div>
      )}
      {mode === 'mixed' && (
        <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.9 }}>
          <div><Tag color="blue">小段</Tag>（进索引，负责被找到）</div>
          <div style={{ marginLeft: 8 }}>① N-02 井（渤中28-1-N2）2019-06-15 投产。</div>
          <div style={{ marginLeft: 8 }}>② 井别采油（EW），位于 CEP-A 平台。</div>
          <div style={{ marginTop: 6 }}><Tag color="purple">大段</Tag>（只入库、不进索引，负责被读懂）</div>
          <div style={{ marginLeft: 8 }}>3. N-02 井完井情况。3.1 基本数据：……（整段全文）。</div>
        </div>
      )}
    </div>
  )

  return (
    <div>
      <Row gutter={16} align="top">
        <Col span={9}>
          <Card title="报告库" size="small">
            {libsLoading ? (
              <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
            ) : (
              <Table size="small" columns={LIB_COLUMNS} dataSource={LIBS} pagination={false} />
            )}
          </Card>
          <Card title="上传报告" size="small" style={{ marginTop: 16 }}>
            <Button type="primary" icon={<UploadOutlined />} onClick={upload}>上传报告（直传）</Button>
            {uploaded && (
              <Alert style={{ marginTop: 12 }} type="success" showIcon
                message={<>已选择：《N-02 井完井报告（英文 · 200 页）》→ 完井报告库</>} />
            )}
          </Card>
          <Card title="本库索引开关（四开关）" size="small" style={{ marginTop: 16 }}>
            {switches.map(s => (
              <div key={s.key} style={{ marginBottom: 12 }}>
                <Space align="start">
                  <Switch checked={sw[s.key]} onChange={v => { setSw(p => ({ ...p, [s.key]: v })); setSaved(false) }} />
                  <div>
                    <b>{s.name}</b>
                    <div style={{ fontSize: 12, color: '#8a94a3' }}>{s.note}</div>
                  </div>
                </Space>
                {!sw[s.key] && (
                  <Alert style={{ marginTop: 6 }} type="warning" showIcon message={s.off} />
                )}
              </div>
            ))}
            <Card size="small" title="索引期加法（处理完自动多做两件事）" style={{ marginTop: 4, background: '#fafafa' }}>
              <Checkbox checked={addSummary} onChange={e => setAddSummary(e.target.checked)}>自动生成全文档摘要 ×1</Checkbox>
              <div style={{ marginTop: 6 }}>
                <Checkbox checked={addQuestions} onChange={e => setAddQuestions(e.target.checked)}>每 20 段自动生成"可能被问的问题"一批</Checkbox>
              </div>
            </Card>
            <Space style={{ marginTop: 12 }}>
              <Button type="primary" onClick={() => setSaved(true)}>保存本库配置</Button>
              {saved && <Typography.Text type="secondary">已保存——开关在下次入库时定型，不做运行时热切换。</Typography.Text>}
            </Space>
          </Card>
        </Col>
        <Col span={15}>
          <Card title="处理进度管线" size="small">
            <div style={{ fontSize: 12, color: '#8a94a3', marginBottom: 8 }}>
              点"上传报告"开跑；点管线任意处可重跑。关掉的索引支路直接跳过、不跑不花钱。
            </div>
            {cur < 0 && !uploaded ? (
              <Empty description={<span>还没有报告在处理：点左侧"上传报告（直传）"开跑一次入库。</span>} />
            ) : (
              <div onClick={() => runFlow()} style={{ cursor: 'pointer' }}>
                <Steps size="small" current={cur} status={done ? 'finish' : 'process'}
                  items={FLOW.map(t => ({ title: t }))} />
                <div style={{ marginTop: 12 }}>
                  {stepCards.map(c => (
                    <Card key={c.key} size="small" style={{ marginBottom: 8, background: '#f6f8fa' }}
                      title={<span style={{ fontSize: 13 }}>{c.label}</span>}>
                      <span style={{ fontSize: 13 }}>{c.text}</span>
                    </Card>
                  ))}
                </div>
                {done && (
                  <div>
                    <Card size="small" style={{ marginBottom: 8 }} title={<span><Tag color="green">摘要块</Tag>全文档摘要（自动生成 · 演示）</span>}>
                      本报告为 N-02 井（渤中28-1-N2）完井报告：井位于渤南区块 CEP-A 平台，井别采油，2019-06-15 投产，状态生产中；正文含完井段与投产信息，插图含岩性柱状图等。（事实取设定书 §A.1）
                    </Card>
                    <Card size="small" title={<span><Tag color="orange">问题块</Tag>这份报告可能被问的 10 个问题（自动生成）</span>}>
                      <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 2 }}>
                        {QUESTIONS.map((q, i) => <li key={i}>{q}</li>)}
                      </ol>
                    </Card>
                  </div>
                )}
              </div>
            )}
          </Card>
        </Col>
      </Row>
      <Card title="切段方式（三选一，现场看对照）" size="small" style={{ marginTop: 16 }}
        extra={<span style={{ fontSize: 12, color: '#8a94a3' }}>同一段报告原文（演示，事实＝设定书 §A.1），三种切法切出来不一样。</span>}>
        <Tabs
          activeKey={mode}
          onChange={k => setMode(k)}
          items={[
            { key: 'smart', label: '智能切段（256–1024 字）', children: chunkTab },
            { key: 'fixed', label: '固定大小', children: chunkTab },
            { key: 'mixed', label: '大小段配合', children: chunkTab }
          ]}
        />
      </Card>
    </div>
  )
}
