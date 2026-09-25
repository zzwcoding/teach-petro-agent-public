import { useState } from 'react'
import { Alert, Button, Card, Col, Descriptions, Empty, Row, Space, Table, Tag, Typography } from 'antd'
import { RollbackOutlined } from '@ant-design/icons'

window.__guides = Object.assign(window.__guides || {}, {
  B4: [
    '点摘要里的"N-02"——跳到井对象卡，看词条自动变链接。',
    '看关键参数"平台"行——CEP-B 带红标：与井档案对不上，是 v3 重建时链错的。',
    '点版本列表 v2——看 v1→v2 差异（新增"表格摘录"）。',
    '点 v3——看引入错误的那一版改了什么。',
    '点"回滚"——当前版变 v2，平台恢复 CEP-A；回滚本身也记成一次新提交。'
  ]
})
window.__traces = Object.assign(window.__traces || {}, {
  B4: 'F50 百科页 · F51 自动链接 · F52 版本回滚 · m6 卡'
})

const VERSIONS = [
  { v: 1, date: '2026-09-15', desc: '首次生成（报告入库自动建页）' },
  { v: 2, date: '2026-09-18', desc: '报告重新解析后自动重建（新增"表格摘录"）' },
  { v: 3, date: '2026-09-20', desc: '自动重建（链错了井）' }
]

const DIFF = {
  1: {
    title: 'v0 → v1（首次生成）',
    body: '首次生成，无上一版可比。重建只取文字块拼回，重叠部分去重后全文通顺。'
  },
  2: {
    title: 'v1 → v2',
    rows: [{ pos: '表格摘录', from: '（无）', to: '新增：报告附表中文化摘录 1 张' }],
    tail: '其余内容逐字未变。'
  },
  3: {
    title: 'v2 → v3（引入错误的一版）',
    rows: [{
      pos: '关键参数 · 平台', from: 'CEP-A',
      to: <span>CEP-B <Tag color="error">错——自动重建时把井链错了（设定书 §A.1：N-02 平台为 CEP-A）</Tag></span>
    }],
    tail: '其余内容逐字未变。'
  }
}

const EXCERPT_ROWS = [
  { key: 1, well: 'N-02', date: '2026-09-14', oil: '48.60', liquid: '165.30', note: '样本日（设定书 §A.2）' },
  { key: 2, well: 'N-11', date: '2026-09-14', oil: '12.40（误录"方"，折算约 11.04 吨）', liquid: '96.00', note: '油量单位误录，按渤中密度 0.89 折算（设定书 §2.2）' }
]
const EXCERPT_COLUMNS = [
  { title: '井号', dataIndex: 'well', width: 80 },
  { title: '日期', dataIndex: 'date', width: 110 },
  { title: '日产油（吨）', dataIndex: 'oil' },
  { title: '日产液（方）', dataIndex: 'liquid', width: 120 },
  { title: '备注', dataIndex: 'note' }
]

const DIFF_COLUMNS = [
  { title: '位置', dataIndex: 'pos', width: 160 },
  { title: '上一版', dataIndex: 'from' },
  { title: '该版', dataIndex: 'to' }
]

function WellLink({ id }) {
  return <a href="#wellcard" onClick={e => {
    e.preventDefault()
    document.getElementById('wellcard')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }}>{id}</a>
}

export default function B4() {
  const [curVer, setCurVer] = useState(3)
  const [selVer, setSelVer] = useState(3)
  const [banner, setBanner] = useState(null)

  const platformFixed = curVer === 2

  function rollback() {
    if (curVer === 3) {
      setCurVer(2); setSelVer(2)
      setBanner({ kind: 'success', text: '已回滚：当前版 = v2，平台恢复 CEP-A。注意：回滚本身也记成一次新提交（可再滚回）。' })
    } else {
      setBanner({ kind: 'info', text: '当前已是回滚后的版本（v2）。回滚本身也记成一次新提交，可继续回滚到更早版本。' })
    }
  }

  const diff = DIFF[selVer]

  return (
    <Row gutter={16} align="top">
      <Col span={6}>
        <Card title="百科首页目录（完井报告库）" size="small">
          <div style={{ fontSize: 13, lineHeight: 2.2 }}>
            <div><b>《N-02 井完井报告》百科页（本页）</b></div>
            <div><Tag>《渤中28-1 区块月度生产月报》百科页（演示占位）</Tag></div>
          </div>
          <Typography.Title level={5} style={{ marginTop: 16, fontSize: 13 }}>最近更新</Typography.Title>
          <div style={{ fontSize: 12, color: '#8a94a3', lineHeight: 2 }}>
            <div>09-20 · 完井报告百科 v3</div>
            <div>09-18 · 完井报告百科 v2</div>
            <div>09-15 · 完井报告百科 v1</div>
          </div>
        </Card>
      </Col>
      <Col span={18}>
        <Card title="中文百科页（由 200 页英文原版重写生成）" size="small">
          <div style={{ marginBottom: 12 }}>
            <Typography.Title level={4} style={{ margin: 0 }}>
              《N-02 井完井报告》· 百科页 <Tag color="blue">当前版：v{curVer}</Tag>
            </Typography.Title>
          </div>
          <Typography.Paragraph style={{ fontSize: 13 }}>
            摘要：本报告为 <WellLink id="N-02" /> 井（<WellLink id="渤中28-1" />-N2）完井报告：井位于渤南区块 CEP-A 平台，井别采油，2019-06-15 投产，状态生产中；正文含完井段与投产信息，插图含岩性柱状图等。
          </Typography.Paragraph>
          <Descriptions size="small" bordered column={2} title="关键参数">
            <Descriptions.Item label="井号">N-02</Descriptions.Item>
            <Descriptions.Item label="井名">渤中28-1-N2</Descriptions.Item>
            <Descriptions.Item label="井别">采油（EW）</Descriptions.Item>
            <Descriptions.Item label="投产日期">2019-06-15</Descriptions.Item>
            <Descriptions.Item label="平台">
              {platformFixed
                ? <span>CEP-A <span style={{ fontSize: 12, color: '#8a94a3' }}>（已随回滚恢复 · 设定书 §A.1）</span></span>
                : <span>CEP-B <Tag color="error">与井档案对不上（设定书 §A.1：CEP-A）——v3 自动重建时把井链错了</Tag></span>}
            </Descriptions.Item>
            <Descriptions.Item label="区块">渤南</Descriptions.Item>
            <Descriptions.Item label="状态">生产中</Descriptions.Item>
          </Descriptions>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            参数值取自报告与井档案（设定书 §A.1）。
          </Typography.Text>
          <Typography.Title level={5} style={{ marginTop: 16, fontSize: 13 }}>表格摘录（报告附表 · 中文化示例）</Typography.Title>
          <Table size="small" columns={EXCERPT_COLUMNS} dataSource={EXCERPT_ROWS} pagination={false} />
        </Card>

        <Card title="对象卡：井 N-02" size="small" style={{ marginTop: 16 }} id="wellcard">
          <Descriptions size="small" bordered column={3}>
            <Descriptions.Item label="井号">N-02</Descriptions.Item>
            <Descriptions.Item label="井名">渤中28-1-N2</Descriptions.Item>
            <Descriptions.Item label="井别">采油（EW）</Descriptions.Item>
            <Descriptions.Item label="投产">2019-06-15</Descriptions.Item>
            <Descriptions.Item label="平台">CEP-A</Descriptions.Item>
            <Descriptions.Item label="区块">渤南</Descriptions.Item>
            <Descriptions.Item label="状态">生产中</Descriptions.Item>
            <Descriptions.Item label="关联注水井" span={2}>
              N-06（受效关系见 → <a href="#/B5">关系图谱</a>）
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <Card title="版本历史与差异对比" size="small" style={{ marginTop: 16 }}>
          <Row gutter={16}>
            <Col span={10}>
              {VERSIONS.map(v => (
                <div key={v.v} onClick={() => setSelVer(v.v)}
                  style={{
                    padding: '8px 10px', marginBottom: 8, borderRadius: 8, cursor: 'pointer',
                    border: selVer === v.v ? '1px solid #1677ff' : '1px solid #e2e7ee',
                    background: selVer === v.v ? '#f0f7ff' : '#fff'
                  }}>
                  <b>v{v.v}</b>
                  {curVer === v.v && <Tag color="blue" style={{ marginLeft: 8 }}>当前版</Tag>}
                  <div style={{ fontSize: 12, color: '#8a94a3' }}>{v.date} · {v.desc}</div>
                </div>
              ))}
            </Col>
            <Col span={14}>
              {diff ? (
                <div>
                  <b>{diff.title}</b>
                  {diff.rows && (
                    <Table size="small" style={{ marginTop: 8 }} columns={DIFF_COLUMNS}
                      dataSource={diff.rows.map((r, i) => ({ key: i, ...r }))} pagination={false} />
                  )}
                  {diff.body && <div style={{ marginTop: 8, fontSize: 13 }}>{diff.body}</div>}
                  {diff.tail && <div style={{ marginTop: 8, fontSize: 12, color: '#8a94a3' }}>{diff.tail}</div>}
                </div>
              ) : (
                <Empty description="点左边版本列表任意一版，这里展开它与上一版的逐字差异。" />
              )}
            </Col>
          </Row>
          <Space style={{ marginTop: 16 }}>
            <Button type="primary" icon={<RollbackOutlined />} onClick={rollback}>
              回滚（恢复到上一版 v2）
            </Button>
          </Space>
          {banner && (
            <Alert style={{ marginTop: 12 }} showIcon type={banner.kind} message={banner.text} />
          )}
        </Card>
      </Col>
    </Row>
  )
}
