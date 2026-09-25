import { useRef, useState } from 'react'
import {
  Button, Card, Col, Empty, Row, Space, Spin, Steps, Switch, Table, Tabs, Tag, Typography
} from 'antd'
import { ThunderboltOutlined } from '@ant-design/icons'

export const E2_GUIDE = [
  '先扫一遍规则表——12 条规则各管一类毛病，每条都可启停。',
  '关掉一条开关——整行置灰，质检任务会跳过它。',
  '点"发起质检任务"——四步流水跑完，出合规报告。',
  '看右侧看板——3 张新问题单自动进"分发"列。',
  '点任意卡"流转"——问题单逐列往前走，到"关闭"就锁定。',
  '看底部水位——原始/清洗层达标，汇总层欠 3 天的账标黄。'
]
export const E2_TRACE = 'F18 转换测试质量 · 设定书 §4 质检规则与任务 · m20 质量卡'

window.__guides = Object.assign(window.__guides || {}, { E2: E2_GUIDE })
window.__traces = Object.assign(window.__traces || {}, { E2: E2_TRACE })

const E_TABS = [
  { key: 'E1', label: '答题考核' },
  { key: 'E2', label: '数据质量台' },
  { key: 'E3', label: '知识体检' }
]

const RULES = [
  { no: 1, kind: '重复', rule: '同一口井同一天只能有一条日产记录——A/B 班手抄重复行即命中', crit: '行数＝去重后行数' },
  { no: 2, kind: '缺失', rule: '日产油量不许空着', crit: '非空率 ≥ 99.5%' },
  { no: 3, kind: '准不准', rule: '产油单位要对：按区块密度折算后，密度须落在 0.82–0.98 t/m³——抓住"吨方混写"', crit: '折算密度 ∈ [0.82, 0.98]' },
  { no: 4, kind: '两本账打架', rule: '含水率：生产日报（计量）vs 化验样，偏差不能太大', crit: '偏差 ≤ 5 个百分点' },
  { no: 5, kind: '超范围', rule: '含水率 0–100、开井小时数 0–24，越界即不合格（停井日开井小时数仍大于 0 的矛盾行也拦）', crit: '越界即 fail' },
  { no: 6, kind: '迟到', rule: '检修台账要跟上：批次水位最晚是前一天的数，超窗的批次拒绝——T-3 补录会被拦下', crit: '≤ T-1，超窗 reject' },
  { no: 7, kind: '写法不统一', rule: '井号写法归一：N2 / N-2 都归成 N-02，归一表要全命中', crit: '归一表全命中' },
  { no: 8, kind: '写法不统一', rule: '设备停机原因码要用新编码表：旧码 R3（皮带断）映射到新码 BELT，全表命中', crit: '映射表全命中' },
  { no: 9, kind: '重复 / 记账', rule: '井档案一井一行，状态变更要有据可查：生产中→停产 必须有记录——N-11"已停仍记生产中"就是反例', crit: '主键唯一＋迁移合法' },
  { no: 10, kind: '假数嫌疑', rule: '恒值检测：生产日报连续 30 天是同一个数——要么真停产、要么抄数，告警让人看', crit: '连续 30 日同值 → 告警' },
  { no: 11, kind: '迟到', rule: '传感器零值：连续 2 小时零值告警', crit: '2 小时零值 → 告警' },
  { no: 12, kind: '账对不上', rule: '物质平衡账：区块月注入量 ≈ 产出量＋存水率变动，偏差大了说明有数不对', crit: '偏差 ≤ 3%' }
]

const FLOW = ['扫描生产库 8 张表', '逐条跑规则（12 条启用）', '命中 3 条 → 开问题单', '按责任岗自动分发']

const LANES = ['分发', '认领', '整改', '复核', '关闭']
const PRESET_CARDS = [
  { id: 'p8', lane: 0, title: '规则 8 · 停机原因码旧码未映射', desc: 'equip_status 旧码 R3 未按映射表换成 BELT（设定书 §A.7）', owner: '责任：作业区资料员' },
  { id: 'p5', lane: 1, title: '规则 5 · 停井日开井小时数仍大于 0', desc: '矛盾行：状态停着、open_days 还有数（设定书 §A.2）', owner: '认领：作业区资料员' },
  { id: 'p7', lane: 2, title: '规则 7 · 井号未归一（N2 → N-02）', desc: '新旧写法并存（设定书 §A.1）；按归一表改写', owner: '整改：作业区资料员' },
  { id: 'p4', lane: 3, title: '规则 4 · 含水率计量 vs 化验差 6 个百分点', desc: '已整改完毕，等质量管理员复检（小李）', owner: '复核：小李' },
  { id: 'p10', lane: 4, title: '规则 10 · 连续 30 日同值告警', desc: '核实为真实关井——不整改，记录原因后关闭', owner: '复核通过：小李' }
]
const DYNAMIC_CARDS = [
  { id: 'd1', title: '规则 1 · N-02 同日 A/B 两行重复日报', desc: 'A/B 班手抄重复（设定书 §A.2 样本）' },
  { id: 'd3', title: '规则 3 · N-11 产油单位误录（方 → 吨）', desc: '吨方混写，按区块密度折算（设定书 §2.2）' },
  { id: 'd6', title: '规则 6 · N-11 检修批次 T-3 补录超窗', desc: 'batch 20260911-T3，承诺水位 T-1（设定书 §A.4）' }
]
const REPORT = {
  title: '合规报告（质检任务 #QT-20260915-01 · 2026-09-15 09:30）',
  range: '检查范围：生产库 8 表　扫描 12,604 行　启用规则 12 条　',
  hits: [
    '① 规则 1：N-02 在 2026-09-14 出现 A/B 两行重复日报（设定书 §A.2 样本）',
    '② 规则 3：N-11 产油单位误录（12.40 方，应为吨——吨方混写）',
    '③ 规则 6：N-11 检修批次 20260911-T3 为 T-3 补录，超出承诺水位 T-1'
  ],
  verdict: '——已全部开成问题单并按责任岗分发（见右侧看板新卡）。'
}

const sleep = ms => new Promise(r => setTimeout(r, ms))
const WATER = [
  { layer: '原始层', to: '到 2026-09-14', tag: '达标（承诺 T-1）', color: 'green' },
  { layer: '清洗层', to: '到 2026-09-14', tag: '达标（承诺 T-1）', color: 'green' },
  { layer: '汇总层（问数用）', to: '到 2026-09-11', tag: '落后 3 天 · 超期', color: 'gold' }
]

export default function E2Quality() {
  const [ruleOn, setRuleOn] = useState(() => Object.fromEntries(RULES.map(r => [r.no, true])))
  const [step, setStep] = useState(-1)
  const [running, setRunning] = useState(false)
  const [report, setReport] = useState(null)
  const [cards, setCards] = useState(PRESET_CARDS.map(c => ({ ...c })))
  const runningRef = useRef(false)

  function toggleRule(no) {
    setRuleOn(prev => ({ ...prev, [no]: !prev[no] }))
  }

  async function runTask() {
    if (runningRef.current) return
    runningRef.current = true
    setRunning(true)
    setReport(null)
    setCards(prev => prev.filter(c => !c.id.startsWith('d')))
    setStep(0)
    for (let i = 1; i < FLOW.length; i++) {
      await sleep(600)
      setStep(i)
    }
    setReport(REPORT)
    setCards(prev => [...prev, ...DYNAMIC_CARDS.map(c => ({ ...c, lane: 0, owner: '责任：作业区资料员（本次任务分发）' }))])
    setRunning(false)
    runningRef.current = false
  }

  function flowCard(id) {
    setCards(prev => prev.map(c => (c.id === id ? { ...c, lane: Math.min(c.lane + 1, LANES.length - 1) } : c)))
  }

  const ruleColumns = [
    {
      title: '开关', dataIndex: 'on', width: 120,
      render: (on, rule) => (
        <Switch
          size="small" checked={on}
          checkedChildren="启用中" unCheckedChildren="已停用"
          onChange={() => toggleRule(rule.no)}
        />
      )
    },
    { title: '#', dataIndex: 'no', width: 44 },
    { title: '查什么', dataIndex: 'kind', width: 110 },
    { title: '规则（人话）', dataIndex: 'rule' },
    { title: '判据 · 阈值', dataIndex: 'crit', width: 200 }
  ]

  const cardOf = c => {
    const closed = c.lane === LANES.length - 1
    return (
      <Card
        key={c.id} size="small"
        style={{ marginBottom: 8, border: closed ? '1px solid #b7eb8f' : undefined }}
      >
        <div style={{ fontWeight: 600, fontSize: 13 }}>{c.title}</div>
        <div style={{ fontSize: 12, color: '#8a94a3', marginTop: 2 }}>{c.desc}</div>
        <div style={{ fontSize: 12, marginTop: 4 }}>{c.owner}</div>
        <div style={{ marginTop: 6 }}>
          <Tag color={closed ? 'green' : 'default'}>{LANES[c.lane]}</Tag>
          {closed ? (
            <Button size="small" disabled>已关闭</Button>
          ) : (
            <Button size="small" type="link" style={{ padding: 0 }} onClick={() => flowCard(c.id)}>流转 →</Button>
          )}
        </div>
      </Card>
    )
  }

  return (
    <div>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
        20 条质检规则守着数据入口——发起质检任务一键体检生产库出合规报告，命中的问题开成问题单从分发一路流转到关闭，另有数据新鲜度水位一眼看清数据到哪天。
      </Typography.Paragraph>
      <Tabs activeKey="E2" items={E_TABS} onChange={k => { location.hash = '/' + k }} style={{ marginBottom: 16 }} />

      <Card title="① 质检规则配置（共 20 条，本页列前 12 条）" size="small">
        <Table
          size="small"
          columns={ruleColumns}
          dataSource={RULES.map(r => ({ ...r, on: ruleOn[r.no] }))}
          rowKey="no"
          pagination={false}
          onRow={r => (ruleOn[r.no] ? {} : { style: { opacity: 0.45, background: '#fafafa' } })}
        />
        <div style={{ fontSize: 12, color: '#8a94a3', marginTop: 8 }}>
          其余 8 条（引用完整 / 跨表一致 / 枚举合法 / 正则格式 / 极值 / 波动率 / 钩稽 / 洗数规则）见规则库总册。
          规则分三层：通用规则 → 挂到具体字段的规则 → 场景专项规则（设定书 §4）；停用某条＝质检任务跳过它，不删规则。
        </div>
      </Card>

      <Card title="② 发起质检任务与合规报告" size="small" style={{ marginTop: 16 }}>
        <Space style={{ marginBottom: 12 }}>
          <Button type="primary" icon={<ThunderboltOutlined />} onClick={runTask}>
            发起质检任务（跑一遍启用中的 12 条）
          </Button>
          {running && <Spin size="small" />}
        </Space>
        <Steps
          size="small" current={step < 0 ? 0 : step}
          status={step < 0 ? 'wait' : running ? 'process' : 'finish'}
          items={FLOW.map(t => ({ title: t }))}
        />
        <div style={{ marginTop: 12, maxWidth: 760 }}>
          {!report ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="还没有质检报告——点上方「发起质检任务」跑一遍。"
            />
          ) : (
            <Card size="small" style={{ background: '#f6f8fa' }} title={report.title}>
              {report.range}<b>命中 3 条</b>
              {report.hits.map(h => <div key={h} style={{ marginTop: 6 }}>{h}</div>)}
              <div style={{ marginTop: 8 }}><b>不合规 3 项</b>{report.verdict}</div>
            </Card>
          )}
        </div>
        <div style={{ fontSize: 12, color: '#8a94a3', marginTop: 10 }}>
          角色三角（设定书 §1）：数字化室配置入湖强制规则、出合规性报告；质量管理员（小李）配置质检任务、复检、出报告；采集管理员（作业区资料员）管源头数据。
        </div>
      </Card>

      <Row gutter={16} align="top" style={{ marginTop: 16 }}>
        <Col span={17}>
          <Card title="③ 问题单看板（分发 → 认领 → 整改 → 复核 → 关闭）" size="small">
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              {LANES.map((lane, li) => (
                <div key={lane} style={{ flex: 1, minWidth: 0, background: '#fafafa', borderRadius: 8, padding: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, textAlign: 'center' }}>{lane}</div>
                  {cards.filter(c => c.lane === li).map(cardOf)}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: '#8a94a3', marginTop: 8 }}>
              流程与角色分工来自设定书 §1/§4：分发→认领→整改→复核→关闭；两次质检结果由工具自动比对、问题状态动态更新。点卡上的「流转」把问题单推到下一列。
            </div>
          </Card>
        </Col>
        <Col span={7}>
          <Card title="④ 数据新鲜度水位" size="small">
            {WATER.map(w => (
              <Card size="small" key={w.layer} style={{ background: '#fafafa', marginBottom: 8 }}>
                <div style={{ fontWeight: 600 }}>{w.layer}</div>
                <div style={{ margin: '6px 0' }}>{w.to}</div>
                <Tag color={w.color}>{w.tag}</Tag>
              </Card>
            ))}
            <div style={{ fontSize: 12, color: '#8a94a3' }}>
              T-1＝昨天的数今天要能看到（示例以 2026-09-15 为今天）。汇总层是老王问数用的表——它欠 3 天的账，问"最近三天产量"就答不齐。
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  )
}
