import { useEffect, useRef, useState } from 'react'
import {
  Alert, Button, Card, Col, Empty, InputNumber, Row, Skeleton, Space, Steps, Switch, Table, Tag, Typography
} from 'antd'
import { PlayCircleOutlined } from '@ant-design/icons'

window.__guides = Object.assign(window.__guides || {}, {
  D1: [
    '看"模型清单"两张卡——主用 Petro-72B、备用 DeepSeek，坏了自动切。',
    '点"开始故障演练"——看流程走到第 2 步变红：连续失败 2 次判为故障。',
    '看流程走完出结论卡——用户无感知，冷却期满自动切回。',
    '往下看"调用账本"和"演练日志"——刚这次切换各记了一笔账。',
    '改任一参数点"保存设置"——配置写回生效。',
    '对照"配置文件预览"——表单里每个数字都对应文件里的一行。'
  ]
})
window.__traces = Object.assign(window.__traces || {}, {
  D1: 'F2 网关调度 · F12 性能花费（调用账本）· m2 网关'
})

const CONFIG_YAML = `# 文件：app/gateway/config.yaml
model_list:                          # 模型清单：主用 + 备用
  - model_name: petro-llm            #   主用别名「petro-llm」＝Petro-72B（业务代码只认别名）
    litellm_params:
      model: openai/petro-72b          #   Petro-72B 主模型，OpenAI 兼容接口（换模型只改这一处）
      api_base: \${PETRO72B_BASE_URL}  #   内网地址外置，不写死在代码里
  - model_name: deepseek-backup      #   备用：DeepSeek
    litellm_params:
      model: openai/deepseek         #   同为 OpenAI 兼容形状
      api_base: \${DEEPSEEK_BASE_URL}
fallbacks:                           # 主用故障 → 自动切备用（点「故障演练」验的就是这行）
  - petro-llm: [deepseek-backup]
num_retries: 3                       # 重试只走网关层；软件侧 max_retries=0 防重试套娃
allowed_fails: 2                     # 连续失败满 2 次 → 判定故障
cooldown_time: 60                    # 故障冷却 60 秒，期内不再选主用
request_timeout: 30                  # 单次调用超时（秒）`

const PARAMS = [
  { label: '连续失败几次判为故障', value: 2 },
  { label: '故障后冷却多少秒不用主用', value: 60 },
  { label: '失败自动重试几次', value: 3 },
  { label: '单次调用最多等多久（秒）', value: 30 }
]

const LEDGER_COLS = [
  { title: '时间', dataIndex: 'time', width: 90 },
  { title: '调用号', dataIndex: 'call', width: 100 },
  { title: '模型', dataIndex: 'model', width: 130 },
  { title: '输入＋输出（token）', dataIndex: 'tokens', width: 130 },
  { title: '首字延迟', dataIndex: 'first', width: 90 },
  { title: '总耗时', dataIndex: 'total', width: 80 },
  { title: '花费', dataIndex: 'cost', width: 80 },
  { title: '备注', dataIndex: 'note' }
]
const LEDGER_INIT = [
  { key: 1, time: '09:40:12', call: 'call-8f31', model: 'Petro-72B（主用）', tokens: '1,240＋860', first: '0.9 秒', total: '3.2 秒', cost: '¥0.31', note: '—' },
  { key: 2, time: '09:38:47', call: 'call-8e02', model: 'Petro-72B（主用）', tokens: '980＋540', first: '0.8 秒', total: '2.6 秒', cost: '¥0.22', note: '—' },
  { key: 3, time: '09:35:03', call: 'call-8c77', model: 'DeepSeek（备用）', tokens: '1,020＋610', first: '1.4 秒', total: '4.1 秒', cost: '¥0.09', note: '上次演练遗留：主用冷却期内走备用' }
]

const DRILL_NODES = [
  { t: '演练开始：主用停机' },
  { t: '第 1 次调用失败', fail: true },
  { t: '第 2 次失败（连续满 2 次）', fail: true },
  { t: '主用进入冷却 60 秒' },
  { t: '自动切备用「DeepSeek」' }
]

const now = () => new Date().toTimeString().slice(0, 8)
const sleep = ms => new Promise(r => setTimeout(r, ms))

export default function D1Gateway() {
  const [ready, setReady] = useState(false)
  const [params, setParams] = useState(PARAMS.map(p => p.value))
  const [saved, setSaved] = useState('')
  const [drillOn, setDrillOn] = useState(true)
  const [cur, setCur] = useState(-1)
  const [conclusion, setConclusion] = useState(false)
  const [ledger, setLedger] = useState(LEDGER_INIT)
  const [log, setLog] = useState([
    { key: 1, time: '09:20:00', text: '上次演练：主用连续失败 2 次 → 冷却 60 秒，自动切换至备用；用户无感知' }
  ])
  const running = useRef(false)
  const keyRef = useRef(100)

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 500)
    return () => clearTimeout(t)
  }, [])

  async function runDrill() {
    if (running.current) return
    running.current = true
    setConclusion(false); setCur(0)
    for (let i = 1; i < DRILL_NODES.length; i++) { await sleep(600); setCur(i) }
    const t = now()
    keyRef.current += 1
    setLedger(rows => [...rows, {
      key: keyRef.current, time: t, call: 'call-8f55', model: 'DeepSeek（备用）',
      tokens: '1,010＋590', first: '1.3 秒', total: '3.8 秒', cost: '¥0.08',
      note: '经故障自动切换（试过主用失败的标记随账记录）'
    }])
    keyRef.current += 1
    setLog(rows => [...rows, {
      key: keyRef.current, time: t,
      text: '本次演练：主用「Petro-72B」连续失败 2 次 → 冷却 60 秒，流量自动切换至备用「DeepSeek」；用户无感知，主用冷却期满自动切回'
    }])
    setConclusion(true)
    running.current = false
  }

  const nodeState = i => {
    if (cur < 0 || i > cur) return 'wait'
    if (i === cur) return DRILL_NODES[i].fail ? 'error' : 'process'
    return DRILL_NODES[i].fail ? 'error' : 'finish'
  }

  return (
    <div>
      <Card title="模型清单（主用＋备用）" size="small" style={{ marginBottom: 16 }}>
          <Row gutter={12}>
            <Col span={12}>
              <Card size="small" style={{ background: '#f6ffed' }}>
                <Space><b>主用：Petro-72B</b><Tag color="green">使用中</Tag></Space>
                <div style={{ fontSize: 12, color: '#8a94a3', marginTop: 6 }}>
                  内网部署，走 OpenAI 兼容接口——所有业务代码只认「主用模型」这个名字，不直接连模型。
                </div>
              </Card>
            </Col>
            <Col span={12}>
              <Card size="small">
                <Space><b>备用：DeepSeek</b><Tag>备用</Tag></Space>
                <div style={{ fontSize: 12, color: '#8a94a3', marginTop: 6 }}>
                  主用故障时自动顶上，用户无感知；主用冷却期满自动切回。
                </div>
              </Card>
            </Col>
          </Row>
          <Card size="small" title="谁在用这套配置" style={{ marginTop: 12 }}>
            <a href="#/A1">问一问</a>、<a href="#/B1">报告库</a>回答、问数——平台所有用到模型的动作，都从这一个口出去。
          </Card>
        </Card>

        <Card title="切换与重试参数" size="small" style={{ marginBottom: 16 }}>
          <Row gutter={12}>
            {PARAMS.map((p, i) => (
              <Col span={6} key={p.label}>
                <div style={{ fontSize: 12, marginBottom: 4 }}>{p.label}</div>
                <InputNumber
                  style={{ width: '100%' }} min={0} value={params[i]}
                  onChange={v => setParams(ps => ps.map((x, j) => (j === i ? v : x)))}
                />
              </Col>
            ))}
          </Row>
          <Space style={{ marginTop: 12 }}>
            <Button type="primary" onClick={() => setSaved('已保存。')}>保存设置</Button>
            {saved && <span style={{ fontSize: 12, color: '#389e0d' }}>{saved}</span>}
          </Space>
        </Card>

        <Card title="配置文件预览" size="small" style={{ marginBottom: 16 }}>
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 4 }}>
            下面这份就是本页表单对应的配置文件内容；改表单＝改这份文件的对应字段。
          </Typography.Paragraph>
          <div className="code-block" contentEditable suppressContentEditableWarning>{CONFIG_YAML}</div>
        </Card>

        <Card title="调用账本" size="small" style={{ marginBottom: 16 }}>
          {ready ? (
            <>
              <Table size="small" columns={LEDGER_COLS} dataSource={ledger} pagination={false} scroll={{ x: 800 }} />
              <div style={{ fontSize: 12, color: '#8a94a3', marginTop: 8 }}>
                token＝模型计费的计算量单位；首字延迟＝从提问到蹦出第一个字的时间。
              </div>
            </>
          ) : <Skeleton active paragraph={{ rows: 3 }} />}
        </Card>

        <Card title="故障演练" size="small">
          <Space>
            <Switch checked={drillOn} onChange={setDrillOn} />
            <span>允许演练：{drillOn ? '开' : '关'}</span>
            <span style={{ fontSize: 12, color: '#8a94a3' }}>
              演练开关平时关闭——关停主用是破坏性操作，只允许在演练窗口做
            </span>
          </Space>
          <div style={{ marginTop: 12 }}>
            <Button type="primary" icon={<PlayCircleOutlined />} onClick={runDrill}>
              开始故障演练（关停主用 60 秒）
            </Button>
          </div>
          {cur >= 0 && (
            <Steps
              size="small" style={{ marginTop: 16 }} current={cur}
              items={DRILL_NODES.map((n, i) => ({ title: n.t, status: nodeState(i) }))}
            />
          )}
          {conclusion && (
            <Alert style={{ marginTop: 12 }} type="info" showIcon message={
              '演练结论：主用停机期间备用应答正常，用户无感知；主用冷却期满后流量自动切回。切换过程记录在下面日志和账本里。'
            } />
          )}
          {!conclusion && cur < 0 && (
            <Empty
              style={{ marginTop: 16 }} image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="还没有演练记录——点上面按钮，看主用停机后怎么自动切到备用。"
            />
          )}
          <div style={{ marginTop: 16 }}>
            <b style={{ fontSize: 13 }}>演练日志</b>
            <Table
              style={{ marginTop: 8 }} size="small" pagination={false}
              columns={[{ title: '时间', dataIndex: 'time', width: 90 }, { title: '日志', dataIndex: 'text' }]}
              dataSource={log}
            />
          </div>
        </Card>
      </div>
  )
}
