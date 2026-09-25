import { useEffect, useRef, useState } from 'react'
import {
  Button, Card, Empty, Input, InputNumber, Radio, Select, Skeleton, Space, Switch, Table, Tabs, Tag, Typography
} from 'antd'
import { ThunderboltOutlined } from '@ant-design/icons'

window.__guides = Object.assign(window.__guides || {}, {
  D2: [
    '看检索顺序表——三级从准到粗，每级可单独开关。',
    '点"演示：问 @指标 产量完成率"——第 1 步就命中，后两级变虚线跳过（命中即停）。',
    '切"精排"三个档位——快 / 准但贵 / 防同质，各有适用场景。',
    '看引用格式两种示例——人读友好的报告页码 vs 防伪造的编号引用。',
    '看"搜不到时"的固定文案——搜不到就明说，不编造。',
    '注意右下角提示——改这里的规矩要过发布前安检才生效。'
  ]
})
window.__traces = Object.assign(window.__traces || {}, {
  D2: 'F21 检索瀑布 · F34 复合精排 · F33 引用编号 · m6 问答管道 / m21 语义运行时'
})

const ORDER_ROWS = [
  { key: 1, order: <b>精确点名</b>, what: '@指标 / @井号 直接点名', desc: '问法里带了「@产量完成率」「@N-02」这类点名，直接命中，不走后面的模糊搜索' },
  { key: 2, order: <b>确定性查表</b>, what: '台账完全一致才命中', desc: '同义词、别名在账上完全对上才命中——宁可查不到，不给"差不多"的结果' },
  { key: 3, order: <b>语义搜索＋关键词搜索，两路一起查</b>, what: '两路并发', desc: '一路按意思找（换了说法也能命中），一路按字面找（专有名词一个字都不差）' }
]

const DEMO_NODES = ['第0步 · 听懂问题（谁在问/口径版本）', '第1步 · 精确点名', '第2步 · 确定性查表', '第3步 · 语义＋关键词两路']
const sleep = ms => new Promise(r => setTimeout(r, ms))

export default function D2Retrieval() {
  const [ready, setReady] = useState(false)
  const [orderOn, setOrderOn] = useState([true, true, true])
  const [earlyStop, setEarlyStop] = useState(true)
  const [saved, setSaved] = useState('')
  const [topK1, setTopK1] = useState(20)
  const [topK2, setTopK2] = useState(20)
  const [merge, setMerge] = useState('两路合并排名（推荐）')
  const [topN, setTopN] = useState(20)
  const [fmt, setFmt] = useState('page')
  const [fallback, setFallback] = useState('fixed')
  const [fallbackText, setFallbackText] = useState('报告库里没有找到能回答这个问题的内容。我不能凭空编——请换个问法，或联系资料员补充报告。')
  const [demoCur, setDemoCur] = useState(-1)
  const [demoDone, setDemoDone] = useState(false)
  const running = useRef(false)

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 500)
    return () => clearTimeout(t)
  }, [])

  async function runDemo() {
    if (running.current) return
    running.current = true
    setDemoDone(false); setDemoCur(0)
    await sleep(700); setDemoCur(1)
    await sleep(700); setDemoCur(2); setDemoDone(true)
    running.current = false
  }

  const rerankTabs = [
    {
      key: 'fast', label: '模型精排（快）',
      children: (
        <div style={{ fontSize: 13 }}>
          <div><b>怎么算：</b>用一个小而快的排序模型，把两路合并的候选一次性重新打分排队。</div>
          <div style={{ marginTop: 8 }}><b>优点 / 代价：</b>一次调用排完一批，延迟低、花费小</div>
          <div style={{ marginTop: 8 }}><b>适用场景：</b>日常问答——界面响应要快，问题以「查报告找说法」为主</div>
        </div>
      )
    },
    {
      key: 'llm', label: '大模型逐个打分（准但贵）',
      children: (
        <div style={{ fontSize: 13 }}>
          <div><b>怎么算：</b>用主力大模型对前 N 条候选<b>逐条</b>打分——打 20 条就是 20 次模型调用，一条都不能少。</div>
          <div style={{ marginTop: 8 }}><b>优点 / 代价：</b>判断最准；但每条都花一次调用，慢且贵</div>
          <div style={{ marginTop: 8 }}><b>适用场景：</b>重要汇报材料、口径核对——宁可慢点贵点也要准</div>
          <div style={{ fontSize: 12, color: '#8a94a3', marginTop: 8 }}>打分解析失败时按原顺序放行，不炸整条链路。</div>
        </div>
      )
    },
    {
      key: 'compound', label: '复合分＋多样性（防同质）',
      children: (
        <div style={{ fontSize: 13 }}>
          <div><b>怎么算：</b>复合分＝0.6×模型分 ＋ 0.3×检索基础分 ＋ 0.1×来源分，每条候选的得分都能拆开看；再按多样性参数（λ=0.7）挑选，避免前几名全是同一份报告的近重复段落。</div>
          <div style={{ marginTop: 8 }}><b>优点 / 代价：</b>结果覆盖面广、来源多样，得分可解释</div>
          <div style={{ marginTop: 8 }}><b>适用场景：</b>「各区块产量对比」这类要覆盖面的汇总问题——防止答案全从同一篇报告抄近重复段</div>
        </div>
      )
    }
  ]

  const nodeCls = i => {
    if (demoCur < 0) return { border: '1px solid #e2e7ee', color: '#8a94a3', opacity: 1 }
    if (i < demoCur || (demoDone && i <= 1)) return { border: '1px solid #1677ff', color: '#1677ff', background: '#f0f7ff' }
    if (i === demoCur && !demoDone) return { border: '1px solid #1677ff', color: '#1677ff', background: '#f0f7ff' }
    if (demoDone && i >= 2) return { border: '1px dashed #b9c2ce', color: '#8a94a3', opacity: 0.55 }
    return { border: '1px solid #e2e7ee', color: '#8a94a3', opacity: 1 }
  }

  return (
    <div>
      <Card title="检索顺序（逐级升级）" size="small" style={{ marginBottom: 16 }}>
        {ready ? (
          <Table
            size="small" pagination={false}
            columns={[
              { title: '次序', dataIndex: 'order', width: 260 },
              { title: '这一步查什么', dataIndex: 'what', width: 200 },
              { title: '开关', width: 80, render: (_, r) => (
                <Switch
                  size="small" checked={orderOn[r.key - 1]}
                  onChange={v => setOrderOn(s => s.map((x, j) => (j === r.key - 1 ? v : x)))}
                />
              ) },
              { title: '说明', dataIndex: 'desc' }
            ]}
            dataSource={ORDER_ROWS}
          />
        ) : <Skeleton active paragraph={{ rows: 3 }} />}
        <Space style={{ marginTop: 12 }}>
          <Switch size="small" checked={earlyStop} onChange={setEarlyStop} />
          <span><b>命中即停：{earlyStop ? '开' : '关'}</b></span>
          <span style={{ fontSize: 12, color: '#8a94a3' }}>上级查到就不往下查，省时省钱</span>
        </Space>
        <div style={{ fontSize: 12, color: '#8a94a3', marginTop: 6 }}>
          两个答案拿不准时：宁可不答、反问澄清，不瞎猜（这是固定铁律，不设开关）。
        </div>
      </Card>

      <Card title="每路条数与合并方式" size="small" style={{ marginBottom: 16 }}>
        <Space wrap size={24}>
          <div>
            <div style={{ fontSize: 12, marginBottom: 4 }}>语义搜索取多少条</div>
            <InputNumber min={1} value={topK1} onChange={setTopK1} />
          </div>
          <div>
            <div style={{ fontSize: 12, marginBottom: 4 }}>关键词搜索取多少条</div>
            <InputNumber min={1} value={topK2} onChange={setTopK2} />
          </div>
          <div>
            <div style={{ fontSize: 12, marginBottom: 4 }}>两路结果怎么合并</div>
            <Select
              style={{ width: 240 }} value={merge}
              options={['两路合并排名（推荐）', '谁排前用谁（简单拼接）'].map(o => ({ value: o, label: o }))}
              onChange={setMerge}
            />
          </div>
          <div>
            <div style={{ fontSize: 12, marginBottom: 4 }}>送精细排序的条数（前 N）</div>
            <InputNumber min={1} value={topN} onChange={setTopN} />
          </div>
        </Space>
        <Space style={{ marginTop: 12 }}>
          <Button type="primary" onClick={() => setSaved('已保存。')}>保存设置</Button>
          {saved && <span style={{ fontSize: 12, color: '#389e0d' }}>{saved}</span>}
        </Space>
      </Card>

      <Card title="精细排序（三选一）" size="small" style={{ marginBottom: 16 }}>
        <Tabs defaultActiveKey="fast" items={rerankTabs} />
      </Card>

      <Space size={16} align="start" style={{ display: 'flex' }}>
        <Card title="引用格式（二选一）" size="small" style={{ marginBottom: 16, flex: 1 }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Card size="small" style={{ background: fmt === 'page' ? '#f0f7ff' : '#fff' }}>
              <Space><b>格式一：[报告名 p.页码]</b><Tag color="blue">人读友好</Tag></Space>
              <div className="code-block">渤中 28-1 油田 2019 年 6 月投产 [渤中28-1 完井报告 p.34]</div>
              <div style={{ fontSize: 12, color: '#8a94a3', marginTop: 6 }}>谁都能看懂指向哪份报告哪一页，核查方便。</div>
            </Card>
            <Card size="small" style={{ background: fmt === 'code' ? '#f0f7ff' : '#fff' }}>
              <Space><b>格式二：编号引用 [c3]</b><Tag>防伪造</Tag></Space>
              <div className="code-block">渤中 28-1 油田 2019 年 6 月投产 [c3]——模型只看到编号表，答完再展开成真实出处。</div>
              <div style={{ fontSize: 12, color: '#8a94a3', marginTop: 6 }}>编号表里没有的编号（含被塞进报告里的假编号）直接删掉、绝不显示——想编引用都编不出来。</div>
            </Card>
            <Radio.Group
              value={fmt} onChange={e => setFmt(e.target.value)}
              options={[
                { value: 'page', label: '[报告名 p.页码]（人读友好）' },
                { value: 'code', label: '[c3] 编号引用（防伪造）' }
              ]}
            />
          </Space>
        </Card>
        <Card title="搜不到时的兜底话术" size="small" style={{ marginBottom: 16, flex: 1 }}>
          <Radio.Group
            value={fallback} onChange={e => setFallback(e.target.value)}
            options={[
              { value: 'fixed', label: '说固定文案（推荐）' },
              { value: 'free', label: '允许自由回答，但必须标注「未依据报告库」' }
            ]}
          />
          <Input.TextArea
            style={{ marginTop: 12 }} rows={3} value={fallbackText}
            onChange={e => setFallbackText(e.target.value)}
          />
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
            搜不到不报错、更不编造：固定文案或自由回答＋明确标注，两条路二选一。
          </Typography.Paragraph>
        </Card>
      </Space>

      <Card title="逐级检索演示（命中即停）" size="small" style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<ThunderboltOutlined />} onClick={runDemo}>
          演示：问「@指标 产量完成率 的口径是什么」
        </Button>
        {demoCur >= 0 ? (
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            {DEMO_NODES.map((t, i) => (
              <div key={t} style={{ ...nodeCls(i), flex: 1, borderRadius: 6, padding: '8px 10px', fontSize: 12 }}>{t}</div>
            ))}
          </div>
        ) : (
          <Empty
            style={{ marginTop: 16 }} image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="还没有演示记录——点上面按钮，看带 @点名的提问怎么在第一级命中。"
          />
        )}
        {demoDone && (
          <div style={{ background: '#f6f8fa', borderRadius: 8, padding: 12, marginTop: 12, fontSize: 13 }}>
            结果：第 1 步「精确点名」直接命中《产量完成率》指标卡——<b>早停</b>：第 2、3 步不跑了，省时省钱；命中后回读指标账本核验版本，不是缓存旧影子。
          </div>
        )}
      </Card>

      <Space wrap align="start" size={16} style={{ display: 'flex' }}>
        <Card title="这些规矩管谁" size="small" style={{ width: 380 }}>
          <div style={{ fontSize: 13 }}>
            「<a href="#/A1">问一问</a>」的<b>问报告</b>、<b>问数据</b>两条路都按这个顺序找；引用格式同时管<a href="#/B2">答案出处页</a>的展示。
          </div>
          <div style={{ fontSize: 12, color: '#8a94a3', marginTop: 8 }}>
            本页配置＝检索侧的"总规矩"；各报告库自己的开关（语义/关键词/百科/图谱四个索引开关）在<a href="#/B1">报告库</a>按库配。
          </div>
        </Card>
        <Card size="small" style={{ width: 380, background: '#fffbe6' }}>
          <b>改这里的任何规矩都不悄悄生效</b>
          <div style={{ fontSize: 13, marginTop: 6 }}>
            改完要过<a href="#/C3">发布前安检</a>，考核成绩不降级才发布——改坏答案规矩会被第五道检查拦下。
          </div>
        </Card>
      </Space>
    </div>
  )
}
