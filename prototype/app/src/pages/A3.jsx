import { useEffect, useState } from 'react'
import {
  Button, Card, Col, Empty, Input, List, Modal, Row, Segmented, Skeleton, Space, Table, Tag
} from 'antd'
import { LockOutlined, StopOutlined, ThunderboltOutlined } from '@ant-design/icons'

window.__guides = Object.assign(window.__guides || {}, {
  A3: [
    '先看灰底对照卡 #WB-20260922-02——低风险动作自动执行，不需要人点。',
    '读高风险卡 #WB-20260923-01 的四栏——改动内容 / 理由 / 影响测算 / 副作用，像一份合同。',
    '点"批准"——状态变"已执行"，审计表追加一行，变更记录区追加一条；生产原表不动。',
    '走驳回路径（刷新恢复初始态后）——点"驳回"写条理由提交，状态变"已驳回"，建议退回提出方。',
    '对比两张卡的执行方式——低风险自动、高风险锁到人。'
  ]
})
window.__traces = Object.assign(window.__traces || {}, {
  A3: 'F47 受控写入 · m17 校验链 / m8 权限 / m3 持久化'
})

const WORKBENCH = [
  { key: 'A1', label: '问一问' },
  { key: 'A2', label: '井档案（井 360°）' },
  { key: 'A3', label: '变更审批台' }
]

const LOW_RISK = {
  id: '变更建议 #WB-20260922-02',
  tags: [<Tag key="1">低风险</Tag>, <Tag key="2" color="green">已自动执行</Tag>],
  body: '更新 N-02 井备注（低风险类动作：改一条备注，不碰计量数字）。'
}

const PROPOSAL = {
  id: '变更建议 #WB-20260923-01',
  proposer: '提出：配注优化助手（依据《注水井措施评估》剧本）· 对象：N-06 井（渤南 / CEP-A · 注水 · 分层注水 3 层）',
  rows: [
    {
      key: 'change', label: '改动内容',
      body: <span>N-06 日配注上调 10%；三层配注同比例调整（分层实注/配注 达标口径见"配注合格率"）。<b>只写平台变更记录区，不直接改任何生产表。</b></span>
    },
    {
      key: 'why', label: '理由',
      body: '维持注采平衡：注采比 β＝月注水量 ÷ 月产液量（体积折算）；区块物质平衡要求月注入量 ≈ 产出量＋存水率变动（偏差 ≤3%）。绝对数值以生产库现值为准。'
    },
    {
      key: 'impact', label: '影响测算',
      body: '受效油井按劈分系数（Σ=1）分摊增油预期（递减增油口径）；见效时点以受效关系的"响应起始日"为准；注采比与累积亏空将同步变化，发布前联动复核。'
    },
    {
      key: 'side', label: '副作用',
      body: '① 含水上升风险（综合含水率）；② 层段实注台账"两层 / 三层口径不一"，上调后须按新配注重新核对；③ 不触碰财务口径（商品量结算）——本变更与月度结算无交集。'
    }
  ]
}

const AUDIT_COLUMNS = [
  { title: '何时', dataIndex: 'when', width: 150 },
  { title: '谁批的', dataIndex: 'who', width: 220 },
  { title: '哪个助手提的', dataIndex: 'agent', width: 140 },
  { title: '改了什么', dataIndex: 'what' }
]

const INITIAL_RECORDS = ['#WB-20260922-02 · 2026-09-22 · 更新 N-02 井备注（低风险自动类，详见审计行）']
const INITIAL_AUDIT = [{ key: '1', when: '2026-09-22 15:40', who: '老王', agent: '档案助手', what: '更新 N-02 井备注（低风险自动类）' }]

const DONE_CARD = <span>已写入变更记录区 #WB-20260923-01；<b>批准后只写变更记录，生产原表（注水台账）不动</b></span>
const NEW_RECORD = '#WB-20260923-01 · 2026-09-23 · N-06 日配注上调 10%（仅写变更记录区，生产原表不动）'
const NEW_AUDIT = {
  key: '2', when: '2026-09-23 10:36', who: '阿强（当前角色 · 高风险终审）', agent: '配注优化助手',
  what: 'N-06 日配注上调 10% —— 写入变更记录区 #WB-20260923-01；生产原表（注水台账）未动'
}
const REJECT_PLACEHOLDER = '例如：影响测算没覆盖含水上升风险，补测算后再议'
const REJECT_DEFAULT = '影响测算不足'

export default function A3Action() {
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('pending')
  const [records, setRecords] = useState(INITIAL_RECORDS)
  const [audit, setAudit] = useState(INITIAL_AUDIT)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 500)
    return () => clearTimeout(t)
  }, [])

  function approve() {
    setStatus('approved')
    setRecords(r => [...r, NEW_RECORD])
    setAudit(a => [...a, NEW_AUDIT])
  }
  function submitReject() {
    const r = reason.trim() || REJECT_DEFAULT
    setStatus('rejected')
    setReason(r)
    setRejectOpen(false)
  }

  const statusTag = status === 'pending' ? <Tag>待审批</Tag>
    : status === 'approved' ? <Tag color="green">已执行</Tag>
    : <Tag color="red">已驳回</Tag>

  const proposalCard = (
    <Card title={<Space>{PROPOSAL.id}<Tag color="red">高风险</Tag>{statusTag}</Space>}>
      <div style={{ fontSize: 13, marginBottom: 12 }}>{PROPOSAL.proposer}</div>
      <Table
        size="small" pagination={false}
        columns={[
          { title: '栏', dataIndex: 'label', width: 100 },
          { title: '内容', dataIndex: 'body' }
        ]}
        dataSource={PROPOSAL.rows}
      />
      {status === 'pending' && (
        <Space style={{ marginTop: 16 }}>
          <Button type="primary" danger icon={<LockOutlined />} onClick={approve}>批准（高风险，必须人点）</Button>
          <Button icon={<StopOutlined />} onClick={() => { setReason(''); setRejectOpen(true) }}>驳回（须写理由）</Button>
        </Space>
      )}
      {status === 'approved' && (
        <Card size="small" style={{ marginTop: 16, background: '#f6ffed', borderColor: '#b7eb8f' }}>
          <ThunderboltOutlined style={{ color: '#52c41a' }} /> {DONE_CARD}
        </Card>
      )}
      {status === 'rejected' && (
        <Card size="small" style={{ marginTop: 16, background: '#fff1f0', borderColor: '#ffa39e' }}>
          <StopOutlined style={{ color: '#ff4d4f' }} /> 已驳回 · 理由：{reason}（建议退回配注优化助手，生产侧无任何改动）
        </Card>
      )}
    </Card>
  )

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Segmented options={WORKBENCH} value="A3"
          onChange={k => { if (k !== 'A3') location.hash = '/' + k }} />
      </Space>

      <Space wrap style={{ marginBottom: 16 }}>
        <Tag color="blue">建议像合同</Tag>
        <Tag color="orange">高风险必须人点 🔒</Tag>
        <Tag color="green">批准后只写变更记录，生产原表不动</Tag>
        <Tag>全程审计：谁 · 何时 · 谁提的 · 改了什么</Tag>
      </Space>

      <Row gutter={[16, 16]}>
        <Col span={24} md={10}>
          <Card title={LOW_RISK.id}>
            {LOW_RISK.tags.map((t, i) => <span key={i}>{t}</span>)}
            <div style={{ marginTop: 8 }}>{LOW_RISK.body}</div>
          </Card>
        </Col>
        <Col span={24} md={14}>
          <Skeleton loading={loading} active avatar paragraph={{ rows: 6 }}>
            {proposalCard}
          </Skeleton>
        </Col>
        <Col span={24} md={10}>
          <Card title="变更记录区（只追加，永不改生产原表）">
            <Skeleton loading={loading} active paragraph={{ rows: 3 }}>
              {records.length
                ? <List size="small" dataSource={records} renderItem={r => <List.Item>{r}</List.Item>} />
                : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无变更记录" />}
            </Skeleton>
          </Card>
        </Col>
        <Col span={24} md={14}>
          <Card title="审计表">
            <Skeleton loading={loading} active paragraph={{ rows: 3 }}>
              <Table size="small" columns={AUDIT_COLUMNS} dataSource={audit} pagination={false} />
            </Skeleton>
          </Card>
        </Col>
      </Row>

      <Modal
        title="驳回（须写理由）" open={rejectOpen} onCancel={() => setRejectOpen(false)} footer={null} width={520}
      >
        <Input.TextArea
          rows={3} value={reason} placeholder={REJECT_PLACEHOLDER}
          onChange={e => setReason(e.target.value)}
        />
        <Button type="primary" danger style={{ marginTop: 12 }} onClick={submitReject}>提交驳回</Button>
      </Modal>
    </div>
  )
}
