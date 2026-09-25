import { useState } from 'react'
import { Alert, Button, Card, Col, Empty, Row, Space, Switch, Tabs, Tag, Typography } from 'antd'

window.__guides = Object.assign(window.__guides || {}, {
  B5: [
    '点节点 N-02——它与平台/区块/注水井的关系在清单里高亮，右栏逐条列出。',
    '点"问：哪些井受过 N-06 注水影响？"——沿受效关系走一步直接出答案，不翻报告。',
    '关掉图例"井（3）"——井节点和相关边全部隐去，右栏同步；再点恢复。',
    '切"三道关"三个页签——建图时、入图前、查询时各看一道闸。',
    '看"抽取设置"预填值——关系必须原文有依据，拿不准宁可跳过。',
    '切"五种做法"页签——对比五种建图做法何时选谁。'
  ]
})
window.__traces = Object.assign(window.__traces || {}, {
  B5: 'F40 抽取图谱 · F41 B/C/E 派速览 · F42 五流派擂台 · F55 图谱三接入点 · m6/m16 卡'
})

const NODES = [
  { id: 'N-06', label: 'N-06（注水井）', type: '井' },
  { id: 'N-02', label: 'N-02（采油井）', type: '井' },
  { id: 'N-11', label: 'N-11（采油井）', type: '井' },
  { id: '渤南', label: '区块：渤南', type: '区块' },
  { id: '渤中', label: '区块：渤中', type: '区块' },
  { id: 'CEP-A', label: '平台 CEP-A', type: '平台' },
  { id: 'CEP-B', label: '平台 CEP-B', type: '平台' },
  { id: '渤海油田', label: '渤海油田', type: '油田' },
  { id: '检泵', label: '措施：检泵（N-11）', type: '措施' }
]
const NAME = Object.fromEntries(NODES.map(n => [n.id, n.label]))
const TYPE_OF = Object.fromEntries(NODES.map(n => [n.id, n.type]))
const TYPE_COLOR = { 井: 'blue', 区块: 'green', 平台: 'purple', 油田: 'gold', 措施: 'orange' }

const EDGES = [
  { from: 'N-02', rel: '隶属', to: '渤南' },
  { from: 'N-06', rel: '隶属', to: '渤南' },
  { from: 'N-11', rel: '隶属', to: '渤中' },
  { from: '渤南', rel: '隶属', to: '渤海油田' },
  { from: '渤中', rel: '隶属', to: '渤海油田' },
  { from: 'CEP-A', rel: '承载', to: 'N-02' },
  { from: 'CEP-A', rel: '承载', to: 'N-06' },
  { from: 'CEP-B', rel: '承载', to: 'N-11' },
  { from: 'N-06', rel: '受效', to: 'N-02', note: '受效关系：劈分系数合计＝1、响应起始日随台账 · 设定书 §5 · 演示边' },
  { from: '检泵', rel: '作用于', to: 'N-11', note: '批次 20260911-T3 · 设定书 §A.4' }
]

const LEGEND = [
  { type: '井', count: 3 },
  { type: '区块', count: 2 },
  { type: '平台', count: 2 },
  { type: '油田', count: 1 },
  { type: '措施', count: 1 }
]

const edgeText = e => `${NAME[e.from]} —${e.rel}→ ${NAME[e.to]}`

export default function B5() {
  const [sel, setSel] = useState('N-06')
  const [visible, setVisible] = useState({ 井: true, 区块: true, 平台: true, 油田: true, 措施: true })
  const [answered, setAnswered] = useState(false)
  const [saved, setSaved] = useState(false)

  const isShown = id => visible[TYPE_OF[id]]
  const shownEdges = EDGES.filter(e => isShown(e.from) && isShown(e.to))
  const adjEdges = sel ? shownEdges.filter(e => e.from === sel || e.to === sel) : []

  function ask() {
    setAnswered(true)
    setSel('N-06')
  }

  return (
    <div>
      <Alert type="warning" showIcon
        message={`铁律：图谱入库前过闸，对不上的关系不立边——类型对不上的不立、原文里没有的关系不立；拿不准宁可跳过，不胡编。拦下的边不进图，"图和库对得上"正是图在执法的证据。`} />

      <Row gutter={16} style={{ marginTop: 16 }} align="top">
        <Col span={14}>
          <Card title="关系网" size="small">
            <div style={{ marginBottom: 12 }}>
              {NODES.map(n => (
                <Tag.CheckableTag key={n.id} checked={sel === n.id}
                  style={{
                    margin: '2px 6px 2px 0',
                    opacity: isShown(n.id) ? 1 : 0.4,
                    textDecoration: isShown(n.id) ? 'none' : 'line-through'
                  }}
                  onChange={() => setSel(n.id)}>
                  {n.label}
                </Tag.CheckableTag>
              ))}
            </div>
            <Typography.Title level={5} style={{ fontSize: 13 }}>关系清单</Typography.Title>
            <div>
              {shownEdges.map((e, i) => {
                const active = sel && (e.from === sel || e.to === sel)
                return (
                  <div key={i} style={{
                    fontSize: 13, padding: '3px 8px', borderRadius: 6,
                    background: active ? '#f0f7ff' : 'transparent',
                    opacity: active ? 1 : 0.45
                  }}>
                    {edgeText(e)}
                    {e.note && <div style={{ fontSize: 12, color: '#8a94a3' }}>{e.note}</div>}
                  </div>
                )
              })}
            </div>
            <div style={{ fontSize: 12, color: '#8a94a3', marginTop: 10 }}>
              演示库只有 3 口样本井（设定书 §1：全油田 120 口在产井）；节点和边全部来自报告与台账（设定书 §5 / §A）。
            </div>
          </Card>
        </Col>
        <Col span={10}>
          <Card title="所选节点的相邻关系" size="small">
            {sel && <Tag color={TYPE_COLOR[TYPE_OF[sel]]}>{NAME[sel]}</Tag>}
            {adjEdges.length > 0 ? (
              <div style={{ marginTop: 8 }}>
                {adjEdges.map((e, i) => (
                  <Card key={i} size="small" style={{ marginBottom: 8, background: '#f6f8fa' }}>
                    <b style={{ fontSize: 13 }}>{edgeText(e)}</b>
                    {e.note && <div style={{ fontSize: 12, color: '#8a94a3' }}>{e.note}</div>}
                  </Card>
                ))}
              </div>
            ) : (
              <Empty description={<span style={{ fontSize: 13 }}>该节点暂无可见关系（不会有凭空的边；若相关类型被图例隐去，点回图例即可恢复）。</span>} />
            )}
          </Card>
          <Card title="走关系回答问题（不翻全文）" size="small" style={{ marginTop: 16 }}>
            <Button type="primary" onClick={ask}>问：哪些井受过 N-06 注水影响？</Button>
            {answered && (
              <Card size="small" style={{ marginTop: 12, background: '#f6f8fa' }}>
                <Tag color="blue">图谱问答</Tag>
                答：沿"受效"关系走一步：N-02（受效油井，劈分系数随台账）。演示库仅装配 3 口样本井（设定书 §1）；真实平台沿图遍历返回全量受效井。
              </Card>
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginTop: 16 }} align="top">
        <Col span={8}>
          <Card title="图例（点类型可隐去/显示）" size="small">
            {LEGEND.map(l => (
              <div key={l.type} style={{ marginBottom: 10 }}>
                <Switch size="small" checked={visible[l.type]}
                  onChange={v => setVisible(p => ({ ...p, [l.type]: v }))} />{' '}
                <b style={{ fontSize: 13 }}>{l.type}（{l.count}）</b>
              </div>
            ))}
          </Card>
        </Col>
        <Col span={16}>
          <Card title="图谱三道关" size="small">
            <Tabs
              defaultActiveKey="build"
              items={[
                { key: 'build', label: '建图时', children: <div style={{ fontSize: 13 }}>抽什么类型，不是模型说了算：抽取的类型清单对着领域术语表逐一对号，对不上的不许自创（治"类型漂移"）。</div> },
                { key: 'gate', label: '入图前', children: <div style={{ fontSize: 13 }}>（流程：入库闸 → 关系网）抽出来的边先过闸再进图：类型对不上不立边、原文没有的不立边。拦下的边正是"图在执法"的证据。</div> },
                { key: 'query', label: '查询时', children: <div style={{ fontSize: 13 }}>先精确锚定（@N-06）直达图邻域，图检索做兜底；黑话和禁用词（如"躺井"）被术语闸拦在入图之前；域外问题先拒答。</div> }
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginTop: 16 }} align="top">
        <Col span={12}>
          <Card title="抽取设置（按库配置，预填当前值）" size="small">
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>实体类型：井 / 区块 / 油田 / 平台 / 措施（默认 11 类通用实体，可换领域术语表对号）</Typography.Text>
            <div style={{ fontSize: 12, marginTop: 4 }}>关系标签：隶属 / 承载 / 受效 / 作用于</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>示例：N-06 —受效→ N-02（劈分系数合计＝1）· 检泵 —作用于→ N-11</div>
            <div className="code-block" style={{ marginTop: 8 }}>自定义指令：关系必须原文有依据；拿不准宁可跳过，不许创造新类型</div>
            <Space style={{ marginTop: 12 }}>
              <Button type="primary" onClick={() => setSaved(true)}>保存抽取设置</Button>
              {saved && <Typography.Text type="secondary">已保存——设置在下次入库时生效。</Typography.Text>}
            </Space>
          </Card>
        </Col>
        <Col span={12}>
          <Card title="五种建图做法对照" size="small">
            <Tabs
              defaultActiveKey="D"
              items={[
                { key: 'D', label: 'D 抽取图谱（本库）', children: <div style={{ fontSize: 13 }}>逐段抽"谁—什么关系→谁"，配类型闸防胡编；应用顺手、上手快。要上生产的域，建议再配 A 治理仓。</div> },
                { key: 'A', label: 'A 治理仓', children: <div style={{ fontSize: 13 }}>先有受治理的术语与关系仓（每条带负责人、版本），抽取照仓对号入座；上生产选它。</div> },
                { key: 'B', label: 'B 聚类', children: <div style={{ fontSize: 13 }}>不知道有哪些类型时先自由发现：抽名词→自动聚类→给组起名；新域探路用，探完收编进治理仓。</div> },
                { key: 'C', label: 'C 两步走', children: <div style={{ fontSize: 13 }}>先列概念清单、再排层次结构，快速出第一版验证想法；层次易铺平是它的坑。</div> },
                { key: 'E', label: 'E 直给', children: <div style={{ fontSize: 13 }}>一个提示词端到端，半小时出活——但措辞敏感、两次跑两样，只适合一次性原型验证。</div> }
              ]}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}
