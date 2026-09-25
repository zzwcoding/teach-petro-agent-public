import { useEffect, useState } from 'react'
import { Alert, Button, Card, Col, Empty, Row, Skeleton, Steps, Table, Tag } from 'antd'

window.__guides = Object.assign(window.__guides || {}, {
  C2: [
    '先看顶部四条铁律——平台只能提建议，合并永远是人点批准。',
    '再看流转路线——进池、过安检、人批准、生效、可回滚，五步。',
    '点"考核没通过"筛选片——列表只剩来自考核的提案，看证据列怎么写。',
    '对"待审"的提案点"过安检（送 C3）"——徽标变"已过安检"，按钮变成"批准"。',
    '点"批准 🛡"——徽标变"已生效（v3）"，下方说明卡讲清版本 +1、派生物自动刷新。',
    '点"回滚到上一版"——状态退回去，改错了随时能退。',
    '把筛选片切回"全部来源"——三种来源同一张表、同一套字段。'
  ]
})
window.__traces = Object.assign(window.__traces || {}, {
  C2: 'F24 三源提案池+体检 · F25 只提 MR · m16 语义层与指标注册 · m18 评估证据链'
})

const RULES = [
  '不直接改主干——建议先进池子；正式定义谁也不能伸手就改。',
  '只提建议不自己合并——平台只能提，合不合并必须人点批准。',
  '不改自动生成的文件——百科页、索引这类自动产物不手改——要改就改源头定义，自动产物随后自己刷新。',
  '大改动必须人工批——产量口径这类高影响变更，必须 Owner / 治理领导组签字。'
]

const FLOW = [
  { t: '提案进池', d: '三个来源统一收口' },
  { t: '过安检', d: <span><a href="#/C3">发布前安检 · 五道检查</a></span> },
  { t: '负责人批准 🛡', d: '人工点' },
  { t: '生效', d: '版本 +1，正式定义更新' },
  { t: '发现不对？', d: '随时可回滚' }
]

const SOURCE_COLORS = { 考核没通过: 'red', 自动体检发现: 'blue', 用户反馈: 'orange' }

const PROPOSALS = [
  {
    key: 1,
    name: '递减增油口径模板修订',
    title: '修订「递减增油」口径模板：补上"多井受效按劈分系数（Σ=1）分摊"（设定书 §3 指标 10）',
    source: '考核没通过',
    evidence: '考核用例「递减增油怎么算」判不通过——平台答案漏了劈分规则；两作业区算法本就不一致（事故 7 · 设定书 §A.5）',
    confidence: '高（人工算的标准答案比对）', priority: '高', state: 'wait'
  },
  {
    key: 2,
    name: '措施有效期标注',
    title: '给「措施有效期」指标卡加"台账缺行"标注（设定书 §3 指标 9）',
    source: '自动体检发现',
    evidence: '体检四维评分：数据覆盖不足——措施台账的起止日期字段 30% 缺行（设定书 §A.5）',
    confidence: '中', priority: '中', state: 'checked'
  },
  {
    key: 3,
    name: '递减增油联席裁决',
    title: '「递减增油」条目状态"待联席裁决"挂起——提请数据治理领导组联席会议裁决（设定书 §6）',
    source: '自动体检发现',
    evidence: '术语台账状态栏原文："有效（待联席裁决）"；指标侧注记"一数多源争议之最"（设定书 §3 指标 10 / §6）',
    confidence: '高（条款原文）', priority: '高', state: 'checked'
  },
  {
    key: 4,
    name: '有效产量默认口径',
    title: '把「有效产量」默认口径正式定为"开井日历折算"，用户不选时按默认出数并标注（设定书 §3 指标 2）',
    source: '用户反馈',
    evidence: '运行信号：多候选澄清频繁＋老王反馈"别每次都反问我"；契约本就要求"不选按默认口径出数并标注"',
    confidence: '中', priority: '中', state: 'wait'
  },
  {
    key: 5,
    name: '有效产量口径卡发布',
    title: '「有效产量」指标卡补充修饰词说明（开井日历折算 / 剔检）——已走完全流程的样例（设定书 §3 指标 2 / §6）',
    source: '考核没通过',
    evidence: '考核曾因"一词两译没消歧"答错——修订后同题重跑通过',
    confidence: '高', priority: '高', state: 'live'
  }
]

const STATE_META = {
  wait: { label: '待审', color: 'orange', btn: '过安检（送 C3）', primary: false },
  checked: { label: '已过安检', color: 'blue', btn: '批准 🛡（负责人签字）', primary: true },
  live: { label: '已生效（v3）', color: 'green', btn: '回滚到上一版', primary: false }
}
const NEXT = { wait: 'checked', checked: 'live', live: 'checked' }

function resultCard(name, from, to) {
  if (to === 'checked' && from === 'wait') {
    return `「${name}」已通过发布前安检（五道检查明细见 C3）——等负责人点批准，平台不会自己合并（铁律 2）。`
  }
  if (to === 'live') {
    return `「${name}」已生效：版本 +1，正式定义更新；自动生成的百科页、索引等派生物随后自动刷新（不手改 · 铁律 3）。`
  }
  return `「${name}」已回滚：版本回退，正式定义与各处显示恢复一致。`
}

export default function C2Proposals() {
  const [loading, setLoading] = useState(true)
  const [src, setSrc] = useState('全部来源')
  const [rows, setRows] = useState(PROPOSALS)
  const [msg, setMsg] = useState(null)

  const columns = [
    { title: '提案（改什么 · 为什么）', dataIndex: 'title', render: v => <b>{v}</b> },
    { title: '来源', dataIndex: 'source', width: 120, render: v => <Tag color={SOURCE_COLORS[v]}>{v}</Tag> },
    { title: '证据', dataIndex: 'evidence' },
    { title: '可信度', dataIndex: 'confidence', width: 180 },
    { title: '优先级', dataIndex: 'priority', width: 70 },
    {
      title: '状态', dataIndex: 'state', width: 110,
      render: v => <Tag color={STATE_META[v].color}>{STATE_META[v].label}</Tag>
    },
    {
      title: '操作', width: 190,
      render: (_, r) => {
        const meta = STATE_META[r.state]
        return (
          <Button size="small" type={meta.primary ? 'primary' : 'default'}
            onClick={() => act(r.key)}>{meta.btn}</Button>
        )
      }
    }
  ]


  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600)
    return () => clearTimeout(t)
  }, [])

  function act(key) {
    const row = rows.find(r => r.key === key)
    if (!row) return
    const from = row.state
    const to = NEXT[from]
    setRows(prev => prev.map(r => (r.key === key ? { ...r, state: to } : r)))
    setMsg({ key: Date.now(), name: row.name, text: resultCard(row.name, from, to) })
  }

  const pills = ['全部来源', '考核没通过', '自动体检发现', '用户反馈']
  const filtered = rows.filter(r => src === '全部来源' || r.source === src)

  if (loading) {
    return (
      <div>
        <Card><Skeleton active paragraph={{ rows: 3 }} /></Card>
        <Card style={{ marginTop: 12 }}><Skeleton active paragraph={{ rows: 8 }} /></Card>
      </div>
    )
  }

  return (
    <div>
      <Card style={{ background: '#fffbe6', borderColor: '#ffe58f' }}
        title={<span style={{ color: '#874d00' }}>四条铁律 · 置顶 · 永不违反</span>} size="small">
        <Row gutter={16}>
          {RULES.map((r, i) => (
            <Col span={6} key={i}>
              <div style={{ fontSize: 13 }}>
                <b>{i + 1}. {r.split('——')[0]}</b>
                <div style={{ fontSize: 12, color: '#874d00' }}>{r.split('——').slice(1).join('——')}</div>
              </div>
            </Col>
          ))}
        </Row>
      </Card>

      <Card size="small" style={{ marginTop: 12 }} title="一张建议的流转路线">
        <Steps size="small" items={FLOW.map(f => ({ title: f.t, description: f.d }))} />
      </Card>

      <Card size="small" style={{ marginTop: 12 }} title="提案池（三个来源统一收口）">
        <div style={{ marginBottom: 12 }}>
          {pills.map(p => {
            const active = src === p
            return (
              <Tag.CheckableTag key={p} checked={active}
                style={active
                  ? { background: '#1677ff', color: '#fff' }
                  : { border: '1px solid #d9d9d9', color: '#555' }}
                onClick={() => setSrc(p)}>{p}</Tag.CheckableTag>
            )
          })}
          <span style={{ fontSize: 12, color: '#8a94a3', marginLeft: 8 }}>
            筛选结果 {filtered.length} / {rows.length} 条
          </span>
        </div>
        <Table size="small" columns={columns} dataSource={filtered} pagination={false} rowKey="key"
          locale={{ emptyText: <Empty description="该来源暂无提案" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }} />
        {msg ? (
          <Alert style={{ marginTop: 12 }} type="info" showIcon key={msg.key} message={msg.text} />
        ) : (
          <Empty style={{ marginTop: 16 }} image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="还没有流转记录——点上面任一行的操作按钮，状态流转与说明会出现在这里。" />
        )}
      </Card>
    </div>
  )
}
