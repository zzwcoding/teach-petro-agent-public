import { useEffect, useRef, useState } from 'react'
import {
  Button, Card, Collapse, Empty, InputNumber, Skeleton, Space, Steps, Switch, Table, Tag
} from 'antd'
import { ThunderboltOutlined } from '@ant-design/icons'

window.__guides = Object.assign(window.__guides || {}, {
  D5: [
    '点开第一条运行记录——七步链路逐行看耗时和 token。',
    '找"最慢"琥珀标——组织回答这步占近三分之一，排障先看它。',
    '点开第三条"做汇报"——生成文件类任务 36 秒最慢，属正常现象。',
    '看行业对照表——平台字段对得上行业标准，平台特有项如实标注。',
    '改两个上限点"保存阈值"——花超了自动切便宜模型。',
    '点"演示：一次超限调用"——看第 3 步变红、熔断降级被记进链路。'
  ]
})
window.__traces = Object.assign(window.__traces || {}, {
  D5: 'F29 OTel 映射 · F12 性能花费 · m12 可观测'
})

const STEP_COLS = [
  { title: '步骤', dataIndex: 'step', width: 150, render: (v, r) => r.slow ? <Space><b>{v}</b><Tag color="gold">最慢</Tag></Space> : v },
  { title: '耗时', dataIndex: 'time', width: 90, render: (v, r) => r.slow ? <b>{v}</b> : v },
  { title: 'token 花费', dataIndex: 'tok', width: 100, render: (v, r) => r.slow ? <b>{v}</b> : v },
  { title: '说明', dataIndex: 'note' }
]

const RUNS = [
  {
    key: '1',
    head: <Space wrap>run-0909-01 ·「上个月产量最高的三口井」<Tag>问数据</Tag>总耗时 3.9 秒 · 总花费 ¥0.21<Tag color="green">正常</Tag></Space>,
    steps: [
      { key: 1, step: '听懂问题', time: '0.4 秒', tok: '320', note: '识别成"问数据"类问题' },
      { key: 2, step: '查哪些表', time: '0.6 秒', tok: '450', note: <>选中汇总层日产计量表（→ <a href="#/D6">数据接入加工</a>）</> },
      { key: 3, step: '写出查询', time: '0.8 秒', tok: '510', note: '生成取数语句' },
      { key: 4, step: '安全检查', time: '<0.1 秒', tok: '0', note: <>规则检查，不走模型（→ <a href="#/D3">安全与权限</a>）</> },
      { key: 5, step: '执行查询', time: '0.3 秒', tok: '0', note: '数据库返回 3 行' },
      { key: 6, step: '核对结果', time: '0.5 秒', tok: '480', note: '自动核对，无异常' },
      { key: 7, step: '组织回答', time: '1.2 秒', tok: '890', note: '生成回答文字——哪步慢：这步最慢，占了近三分之一。', slow: true },
      { key: 8, step: <b>合计</b>, time: '', tok: '2,650', note: <b>合计 2,650 token · ¥0.21。</b> }
    ]
  },
  {
    key: '2',
    head: <Space wrap>run-0909-02 ·「为什么 N-02 产量下滑」<Tag>问数据</Tag>总耗时 5.2 秒 · 总花费 ¥0.34<Tag color="green">正常</Tag></Space>,
    steps: [
      { key: 1, step: '听懂问题', time: '0.4 秒', tok: '310', note: '命中分析剧本《产量下滑归因》' },
      { key: 2, step: '拉完成率与构成', time: '0.9 秒', tok: '620', note: '产油/开井数/时率三件套' },
      { key: 3, step: '查检修台账', time: '0.7 秒', tok: '540', note: 'N-02 无检修记录' },
      { key: 4, step: '组织回答', time: '1.8 秒', tok: '1,410', note: '归因结论＋证据链——哪步慢：这步最慢；token 也最多。', slow: true },
      { key: 5, step: '（其余步骤略）', time: '1.4 秒', tok: '660', note: '安全检查/执行/核对等合计' }
    ]
  },
  {
    key: '3',
    head: <Space wrap>run-0908-07 ·「做一份月度汇报 PPT」<Tag>做汇报</Tag>总耗时 41 秒 · 总花费 ¥1.86<Tag color="green">已完成</Tag></Space>,
    steps: [
      { key: 1, step: '听懂需求', time: '0.5 秒', tok: '340', note: '识别成"生成文件"任务，后台排队' },
      { key: 2, step: '写大纲', time: '2.1 秒', tok: '1,280', note: '按月度汇报模板出大纲' },
      { key: 3, step: '生成 PPT 文件', time: '36 秒', tok: '2,050', note: '逐页生成——生成文件类任务天然最慢；期间用户可关页面，做完通知。', slow: true },
      { key: 4, step: '转存文件', time: '0.6 秒', tok: '0', note: '成品落入文件存储，出下载直链' },
      { key: 5, step: '通知', time: '<0.1 秒', tok: '0', note: '给用户发完成消息' }
    ]
  }
]

const OTEL_ROWS = [
  { key: 1, f: '模型供应商 / 模型名', s: <><code>gen_ai.system</code> / <code>gen_ai.request.model</code></>, d: '哪个模型答的' },
  { key: 2, f: '输入 / 输出 token', s: <><code>gen_ai.usage.input_tokens</code> / <code>gen_ai.usage.output_tokens</code></>, d: '每步花多少计算量' },
  { key: 3, f: '结束原因', s: <code>gen_ai.response.finish_reasons</code>, d: '答完了还是被截断' },
  { key: 4, f: '链路节点耗时', s: '行业标准节点时长', d: '哪步慢一目了然' },
  { key: 5, f: '指标口径版本 / 解释链', s: <><b>平台特有</b>（行业标准无对应，显式标注）</>, d: '数从哪个口径算来——行业标准没有这项，如实标注、不硬套也不丢掉' }
]

const FUSE_NODES = ['调用大模型', '核算本次花费 ¥2.40', '超过单次上限 ¥2.00', '改用便宜模型重试', '链路记一笔「熔断降级」']
const sleep = ms => new Promise(r => setTimeout(r, ms))

export default function D5Observe() {
  const [ready, setReady] = useState(false)
  const [otelOn, setOtelOn] = useState(true)
  const [vendorOn, setVendorOn] = useState(false)
  const [budget, setBudget] = useState(800)
  const [perCall, setPerCall] = useState(2.0)
  const [saved, setSaved] = useState('')
  const [cur, setCur] = useState(-1)
  const running = useRef(false)

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 500)
    return () => clearTimeout(t)
  }, [])

  async function runFuse() {
    if (running.current) return
    running.current = true
    setCur(0)
    for (let i = 1; i < FUSE_NODES.length; i++) { await sleep(650); setCur(i) }
    running.current = false
  }

  const nodeState = i => {
    if (cur < 0 || i > cur) return 'wait'
    if (i === cur) return i === 2 ? 'error' : 'process'
    return i === 2 ? 'error' : 'finish'
  }

  return (
    <div>
      <Card title="运行记录与链路时间线" size="small" style={{ marginBottom: 16 }}>
        {ready ? (
          <Collapse
            items={RUNS.map(r => ({
              key: r.key, label: r.head,
              children: (
                <Table
                  size="small" pagination={false} columns={STEP_COLS} dataSource={r.steps}
                  rowClassName={r2 => (r2.slow ? 'd5-slow-row' : '')}
                />
              )
            }))}
          />
        ) : <Skeleton active paragraph={{ rows: 4 }} />}
      </Card>

      <Card title="行业标准对照与追踪开关" size="small" style={{ marginBottom: 16 }}>
        <Table
          size="small" pagination={false}
          columns={[
            { title: '平台记的字段', dataIndex: 'f', width: 200 },
            { title: '行业标准叫法', dataIndex: 's', width: 340 },
            { title: '说明', dataIndex: 'd' }
          ]}
          dataSource={OTEL_ROWS}
        />
        <Space wrap size={32} style={{ marginTop: 12 }}>
          <Space>
            <Switch size="small" checked={otelOn} onChange={setOtelOn} />
            <span>行业标准映射：{otelOn ? '开' : '关'}</span>
            <span style={{ fontSize: 12, color: '#8a94a3' }}>关掉＝只留平台自己看得懂的记录</span>
          </Space>
          <Space>
            <Switch size="small" checked={vendorOn} onChange={setVendorOn} />
            <span>挂接第三方追踪平台：{vendorOn ? '开' : '关'}</span>
            <span style={{ fontSize: 12, color: '#8a94a3' }}>挂接位已留</span>
          </Space>
        </Space>
      </Card>

      <Card title="预算熔断" size="small">
        <Space wrap size={24}>
          <div>
            <div style={{ fontSize: 12, marginBottom: 4 }}>单月花费上限（元）</div>
            <InputNumber min={0} value={budget} onChange={setBudget} />
          </div>
          <div>
            <div style={{ fontSize: 12, marginBottom: 4 }}>单次调用成本上限（元）</div>
            <InputNumber min={0} step={0.5} value={perCall} onChange={setPerCall} />
          </div>
        </Space>
        <Space style={{ marginTop: 12 }}>
          <Button onClick={() => setSaved('已生效：花费触顶后，后续调用自动改用便宜模型，链路里记一笔「熔断降级」。')}>保存阈值</Button>
          <Button type="primary" icon={<ThunderboltOutlined />} onClick={runFuse}>演示：一次超限调用怎么被刹住</Button>
          {saved && <span style={{ fontSize: 12, color: '#389e0d' }}>{saved}</span>}
        </Space>
        {cur >= 0 ? (
          <Steps
            size="small" style={{ marginTop: 16 }} current={cur}
            items={FUSE_NODES.map((t, i) => ({ title: t, status: nodeState(i) }))}
          />
        ) : (
          <Empty
            style={{ marginTop: 16 }} image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="还没有演示记录——点上面按钮，看一次超限调用怎么被刹住。"
          />
        )}
      </Card>
    </div>
  )
}
