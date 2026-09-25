import { useState } from 'react'
import {
  Alert, Button, Card, Checkbox, Col, Input, Row, Space, Table, Tag, Typography
} from 'antd'

window.__guides = Object.assign(window.__guides || {}, {
  B3: [
    '看库内 4 条问答——注意红色"负例 · 不参与回答"那一行。',
    '点"合并相似问"——"完成率公式"并进"产量完成率怎么算"，列表少一条。',
    '在新增表单直接点"入库"——预填的"配注合格率"问答追加进列表。',
    '勾上"登记为负例"再入库——新行标红，不参与回答。',
    '底部改扩检轮数、点"保存配置"。'
  ]
})
window.__traces = Object.assign(window.__traces || {}, {
  B3: 'F35 FAQ · m6 卡'
})

const COLUMNS = [
  { title: '问题', dataIndex: 'q', width: 220 },
  { title: '答案', dataIndex: 'a' },
  { title: '相似问法', dataIndex: 'similar', width: 260 },
  { title: '状态', dataIndex: 'status', width: 160, render: s => s.neg
    ? <Tag color="red">负例 · 不参与回答</Tag>
    : <Tag color="green">服务中</Tag> }
]

const INITIAL_ROWS = [
  { key: 1, q: '产量完成率怎么算？', a: 'Σ实际产油 ÷ Σ计划配产 × 100%（按月、按区块或油田；负责人：开发室 · 设定书 §3 指标 1）', similar: '「月度完成率口径」（主任常问）', status: {} },
  { key: 2, q: '完成率公式是什么？', a: 'Σ实际产油 ÷ Σ计划配产 × 100%（与上一条同义，待合并）', similar: '—', status: {} },
  { key: 3, q: '"躺井"是什么意思？', a: '停产待检泵，作业区口语（限作业区语境；Owner：采油工艺所 · 设定书 §6）', similar: '「躺井啥意思」', status: {} },
  { key: 4, q: '帮我预测明年油价', a: '（负例：不回答。库里登记为"不该答的问题"）', similar: '「油价预测」', status: { neg: true } }
]

export default function B3() {
  const [rows, setRows] = useState(INITIAL_ROWS)
  const [q, setQ] = useState('配注合格率是什么？')
  const [a, setA] = useState('分层实注÷配注，达标井次占比（Owner：采油工艺所 · 设定书 §6）')
  const [neg, setNeg] = useState(false)
  const [tip, setTip] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [merged, setMerged] = useState(false)
  const [saved, setSaved] = useState(false)
  const [rounds, setRounds] = useState(5)

  function submit() {
    setSubmitting(true)
    setTimeout(() => {
      const question = q.trim() || '（未填问题）'
      const answer = a.trim() || '（未填答案）'
      setRows(rs => [...rs, {
        key: Date.now(), q: question, a: answer,
        similar: '—', status: neg ? { neg: true } : {}
      }])
      setTip(neg
        ? { kind: 'neg', text: `已登记负例：「${question}」——不参与索引、检索不可达。` }
        : { kind: 'ok', text: `已入库：「${question}」——一条问答对一个片段，直接进索引、不走解析管线；命中即秒回。` })
      setSubmitting(false)
    }, 400)
  }

  function merge() {
    setRows(rs => rs.map(r => r.key === 1
      ? { ...r, similar: '「月度完成率口径」（主任常问）·「完成率公式」' }
      : r).filter(r => r.key !== 2))
    setMerged(true)
  }

  return (
    <div>
      <Card title="新增问答" size="small">
        <Row gutter={16}>
          <Col span={10}>
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="问题" />
            <Input.TextArea
              style={{ marginTop: 8 }} rows={3} value={a}
              onChange={e => setA(e.target.value)} placeholder="答案"
            />
            <div style={{ marginTop: 8 }}>
              <Checkbox checked={neg} onChange={e => setNeg(e.target.checked)}>
                登记为负例（"不该答的问题"，不参与回答）
              </Checkbox>
            </div>
            <Button type="primary" style={{ marginTop: 12 }} loading={submitting} onClick={submit}>
              新增问答（入库）
            </Button>
            {tip && (
              <Alert style={{ marginTop: 12 }} showIcon
                type={tip.kind === 'neg' ? 'warning' : 'success'} message={tip.text} />
            )}
          </Col>
          <Col span={14}>
            <Typography.Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 0 }}>
              常见问题一问一答直接入库：命中即秒回，不走报告检索；"不该答的问题"登记为负例，永不参与回答。
            </Typography.Paragraph>
          </Col>
        </Row>
      </Card>

      <Card title={`库内问答（${rows.length} 条）`} size="small" style={{ marginTop: 16 }}>
        {!merged && (
          <Button style={{ marginBottom: 12 }}
            onClick={merge}>
            合并相似问（"完成率公式"并入"产量完成率怎么算"）
          </Button>
        )}
        {merged && (
          <Alert style={{ marginBottom: 12 }} type="success" showIcon
            message="已合并：2 条 → 1 条。相似问法并入同一条目（导入时归一化去重）——两种问法现在命中同一条答案。" />
        )}
        <Table size="small" columns={COLUMNS} dataSource={rows} pagination={false} />
      </Card>

      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={12}>
          <Card size="small" title="本库 ＝ 服务资产">
            命中直接回答用户，秒回。答案由小李维护、审核后生效。
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small" title="考核题集 ＝ 评估资产（在「考核与质量」区）">
            标准问法＋人工算好的标准答案，只用于给平台打分，不直接服务用户。
            <div style={{ marginTop: 8 }}>
              <a href="#/E1">答题考核（评估集）→ E1-eval</a>
            </div>
          </Card>
        </Col>
      </Row>

      <Card title="检索配置" size="small" style={{ marginTop: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Space wrap>
            <span style={{ fontSize: 13 }}>召回不足时扩检轮数（每轮翻倍，最多 5 轮后停）</span>
            <Input style={{ width: 80 }} value={rounds}
              onChange={e => setRounds(e.target.value.replace(/\D/g, ''))} />
          </Space>
          <Space wrap>
            <span style={{ fontSize: 13 }}>相似问合并（自动按语义聚类，人工确认）</span>
            <Tag color="green">开</Tag>
          </Space>
          <Space wrap>
            <span style={{ fontSize: 13 }}>负例登记入口</span>
            <Tag color="green">已开（新增问答勾选负例）</Tag>
          </Space>
          <Space>
            <Button type="primary" onClick={() => setSaved(true)}>保存配置</Button>
            {saved && <Typography.Text type="secondary">已保存。</Typography.Text>}
          </Space>
        </Space>
      </Card>
    </div>
  )
}
