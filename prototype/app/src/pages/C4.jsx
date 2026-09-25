import { useEffect, useRef, useState } from 'react'
import {
  Button, Card, Col, Descriptions, Empty, Modal, Row, Select, Skeleton, Spin, Steps, Tag
} from 'antd'

window.__guides = Object.assign(window.__guides || {}, {
  C4: [
    '点"点「有效产量」→ 看平台的澄清窗"——平台不替你猜，先问清要哪支口径。',
    '看两支口径卡并排——差异点就是"跨月检修切割"，例子都是 N-11 检泵那口井。',
    '点任一支"按这支口径出数"——该支标"已选"，下方说明卡给出答案将带的口径标注。',
    '点"不选，按默认口径出数"——按默认口径出数，答案自动标"默认口径"。',
    '左侧下拉换一个指标——右侧指标卡九个字段整卡刷新；选"有效产量"会多出一词两译提示块。',
    '点"提交口径变更……"——联动提示卡出现：注采比、含水率、压力恢复速度要一起核对，变更打包成提案走审批。'
  ]
})
window.__traces = Object.assign(window.__traces || {}, {
  C4: 'F13 口径治理 · m16 语义层与指标注册 · m21 语义运行时'
})

const METRICS = [
  { key: 1, name: '★产量完成率', def: 'Σ实际产油 ÷ Σ计划配产 × 100%', unit: '%', grain: '月（按区块 / 油田）', mods: '—（§3 未登记修饰词）', owner: '开发室', src: 'A.2 日产计量＋配产表', dispute: '计划版本切换日双值', status: ['生效中'] },
  { key: 2, name: '★有效产量（两支口径）', def: '两支口径：开井日历折算 / 检修剔除', unit: '吨', grain: '月', mods: '开井日历折算 / 剔检（修饰词消歧 · 设定书 §6）', owner: '开发室', src: 'A.2 日产计量＋A.4 检修台账', dispute: '跨月检修切割', status: ['生效中'], ambiguous: true },
  { key: 3, name: '☆自然递减率', def: '月：1 − q_t ÷ q_(t−1)（扣新井与措施增油）；年化：指数拟合 q(t)=q_i·e^(−Dt)', unit: '%', grain: '月 · 年', mods: '—（§3 未登记修饰词）', owner: '开发室', src: 'A.2 日产计量', dispute: '措施扣除口径', status: ['生效中'] },
  { key: 4, name: '☆综合递减率', def: '不扣措施的对比期递减', unit: '%', grain: '月 · 年', mods: '—（§3 未登记修饰词）', owner: '开发室', src: 'A.2 日产计量', dispute: '与自然递减率混用事故', status: ['生效中'] },
  { key: 5, name: '☆综合含水率', def: 'Q_w ÷（Q_o＋Q_w）× 100%', unit: '%', grain: '月', mods: '—（§3 未登记修饰词）', owner: '开发室', src: 'A.2 日产计量＋A.6 化验', dispute: '化验 vs 计量打架', status: ['生效中'] },
  { key: 6, name: '☆注采比 β', def: '月注水量 ÷ 月产液量（体积折算）', unit: '无量纲', grain: '月', mods: '—（§3 未登记修饰词）', owner: '采油工艺所', src: 'A.3 注水日报＋A.2 日产计量', dispute: '折算系数按区块', status: ['生效中'] },
  { key: 7, name: '☆累积亏空', def: 'Σ注水 − Σ产液', unit: '方', grain: '累计', mods: '—（§3 未登记修饰词）', owner: '开发室', src: 'A.3 注水日报＋A.2 日产计量', dispute: '—', status: ['生效中'] },
  { key: 8, name: '☆措施有效率 η', def: 'N_y ÷ N_z × 100%（有效井次 ÷ 总井次）', unit: '%', grain: '批次', mods: '—（§3 未登记修饰词）', owner: '采油工艺所', src: 'A.5 措施台账', dispute: '"有效"判据', status: ['生效中'] },
  { key: 9, name: '☆措施有效期 T', def: 't₂ − t₁（天）', unit: '天', grain: '单井 · 措施', mods: '—（§3 未登记修饰词）', owner: '采油工艺所', src: 'A.5 措施台账', dispute: '30% 行缺失', status: ['生效中'] },
  { key: 10, name: '☆递减增油', def: '受效油井实际产油 − 按 d_a 拟合基线 q₀(1−d_a)^t；多井受效按劈分系数（Σ=1）分摊；多措施叠加以主要措施为主', unit: '吨', grain: '井组 · 年', mods: '—（§3 未登记修饰词）', owner: '采油工艺所（开发室联席）', src: 'A.2＋A.5＋受效关系', dispute: '一数多源争议之最（事故 7）', status: ['生效中', '待联席裁决'] },
  { key: 11, name: '★商品量', def: '脱水稳定后净重（扣自用油输差）', unit: '吨', grain: '月', mods: '—（§3 未登记修饰词）', owner: '销售计量站', src: 'A.8 月度结算', dispute: '与井口口径天然不等', status: ['生效中'] },
  { key: 12, name: '☆机采系统能效', def: '系统级 / 单元级 / 设备级三级＋统计限值（优良 / 合格）', unit: '%', grain: '月', mods: '—（§3 未登记修饰词）', owner: '采油工艺所', src: 'A.7 设备状态', dispute: '分组限值', status: ['生效中'] },
  { key: 13, name: '☆检泵周期', def: '本次检泵日 − 上次检泵日', unit: '天', grain: '单井', mods: '—（§3 未登记修饰词）', owner: '采油工艺所', src: 'A.4 检修台账', dispute: '—', status: ['生效中'] },
  { key: 14, name: '☆抽油机时率', def: 'Σ开井天数 ÷ Σ日历天 × 100%', unit: '%', grain: '月', mods: '—（§3 未登记修饰词）', owner: '采油工艺所', src: 'A.2 日产计量', dispute: '—', status: ['生效中'] },
  { key: 15, name: '☆桶油增产成本', def: '措施总投入 ÷ 折算增油量（桶，6.29 桶/m³）', unit: '元/桶', grain: '批次', mods: '—（§3 未登记修饰词）', owner: '采油工艺所＋财务', src: 'A.5 措施台账＋ERP', dispute: '经营 × 技术联席', status: ['生效中'] }
]

const CALLOUT_TEXTS = {
  A: '出数口径：开井日历折算。按开井日历折算出数，跨月检修各月照实计入。答案标注：口径＝开井日历折算（设定书 §3 指标 2）。',
  B: '出数口径：剔除检修。把检修井剔除后算净产量（别名"剔检产量"·设定书 §6）。答案标注：口径＝剔除检修。',
  D: '你没有选——按默认口径「开井日历折算」出数。答案已自动标注"默认口径"，明示没让你猜着算。'
}

const LINK_FLOW = [
  { t: <span>提案进<a href="#/C2">修改审批台</a></span> },
  { t: <span>过<a href="#/C3">发布前安检</a>（五道检查）</span> },
  { t: <span>Owner 批准 → 生效（可回滚）</span> }
]

export default function C4Metrics() {
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [picked, setPicked] = useState(null)
  const [metricKey, setMetricKey] = useState(1)
  const [switching, setSwitching] = useState(false)
  const [showLinkage, setShowLinkage] = useState(false)
  const linkageRef = useRef(null)
  const switchTimer = useRef(null)

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => () => clearTimeout(switchTimer.current), [])

  const metric = METRICS.find(m => m.key === metricKey)

  function pickMetric(key) {
    if (key === metricKey) return
    setMetricKey(key)
    setSwitching(true)
    clearTimeout(switchTimer.current)
    switchTimer.current = setTimeout(() => setSwitching(false), 400)
  }

  function submitChange() {
    setModalOpen(false)
    setShowLinkage(true)
    setTimeout(() => linkageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
  }

  if (loading) {
    return (
      <div>
        <Card><Skeleton active paragraph={{ rows: 4 }} /></Card>
        <Card style={{ marginTop: 12 }}><Skeleton active paragraph={{ rows: 8 }} /></Card>
      </div>
    )
  }

  return (
    <div>
      <Card size="small" title="一词两译澄清窗">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span>试一词两译：</span>
          <Button type="primary" onClick={() => setModalOpen(true)}>
            点「有效产量」→ 看平台的澄清窗
          </Button>
        </div>
      </Card>

      {showLinkage && (
        <div ref={linkageRef}>
          <Card style={{ marginTop: 12, background: '#fffbe6', borderColor: '#ffe58f' }}
            title={<span style={{ color: '#874d00' }}>改口径前，先看联动提示</span>}>
            <div>产量一动，这三个数要一起核对：<b>注采比 β、综合含水率、压力恢复速度</b>。它们和产量由物质平衡互相咬着——修改任一口径，必须检查联动指标（设定书 §3"指标不是独立数字"）。本次变更已按流程打包成提案。</div>
            <Steps size="small" style={{ marginTop: 12 }} items={LINK_FLOW.map(f => ({ title: f.t }))} />
            <div style={{ fontSize: 12, color: '#874d00', marginTop: 8 }}>
              提案会自动带上这条联动提示作为影响说明，给审批人看。
            </div>
          </Card>
        </div>
      )}

      <Row gutter={16} align="top" style={{ marginTop: 12 }}>
        <Col span={6}>
          <Card size="small" title="指标清单（设定书 §3 全部 15 条）">
            <div style={{ marginBottom: 8 }}>换一个指标，右边卡片跟着换。</div>
            <Select value={metricKey} onChange={pickMetric} style={{ width: '100%' }}
              options={METRICS.map(m => ({ value: m.key, label: m.name }))} />
            <div style={{ fontSize: 12, color: '#8a94a3', marginTop: 12 }}>
              完整 15 条一览与筛选在<a href="#/C1">指标与术语库</a>。
            </div>
          </Card>
        </Col>
        <Col span={18}>
          <Card size="small" title="指标卡">
            <Spin spinning={switching} tip="加载指标卡…" >
              <div style={{ marginBottom: 12 }}>
                <b style={{ fontSize: 16 }}>{metric.name}</b>{' '}
                {metric.status.map((s, i) => (
                  <Tag key={i} color={s === '生效中' ? 'green' : 'orange'}>{s}</Tag>
                ))}
              </div>
              <Descriptions size="small" column={1} bordered>
                <Descriptions.Item label="定义 · 公式">{metric.def}</Descriptions.Item>
                <Descriptions.Item label="单位">{metric.unit}</Descriptions.Item>
                <Descriptions.Item label="统计粒度">{metric.grain}</Descriptions.Item>
                <Descriptions.Item label="修饰词">{metric.mods}</Descriptions.Item>
                <Descriptions.Item label="负责人">{metric.owner}</Descriptions.Item>
                <Descriptions.Item label="版本">v3</Descriptions.Item>
                <Descriptions.Item label="数据源">{metric.src}</Descriptions.Item>
                <Descriptions.Item label="争议注记">{metric.dispute}</Descriptions.Item>
              </Descriptions>
              {metric.ambiguous && (
                <Card size="small" style={{ marginTop: 12, background: '#f6f8fa' }}>
                  这个词有两个算法（一词两译）——开井日历折算 / 剔除检修（剔检产量）——问"有效产量"时平台会先反问（见页面顶部澄清窗）。
                </Card>
              )}
            </Spin>
          </Card>
        </Col>
      </Row>

      <Modal
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        width={760}
        title="平台反问：你指哪支口径？"
        footer={null}
      >
        <div style={{ marginBottom: 12 }}><b>用户问：「上个月有效产量是多少？」——平台反问：你指哪支口径？</b></div>
        <Row gutter={12}>
          <Col span={12}>
            <Card size="small" title="口径一 · 开井日历折算"
              extra={picked === 'A' ? <Tag color="blue">已选</Tag> : null}>
              按开井日历折算出数。跨月检修的井（例：N-11 检泵 2026-08-28→09-06，设定书 A.4）在 8 月、9 月各按开井情况计入——两支口径的分歧点就是"跨月检修切割"（设定书 §3 指标 2 争议注记）。
              <Button size="small" type={picked === 'A' ? 'primary' : 'default'} style={{ marginTop: 8 }}
                onClick={() => setPicked('A')}>按这支口径出数</Button>
            </Card>
          </Col>
          <Col span={12}>
            <Card size="small" title="口径二 · 剔除检修"
              extra={picked === 'B' ? <Tag color="blue">已选</Tag> : null}>
              把检修井剔除后再算净产量——别名"剔检产量"（设定书 §6）。同一口 N-11，在 9 月的数里不计入检修这段。
              <Button size="small" type={picked === 'B' ? 'primary' : 'default'} style={{ marginTop: 8 }}
                onClick={() => setPicked('B')}>按这支口径出数</Button>
            </Card>
          </Col>
        </Row>
        <div style={{ marginTop: 12 }}>
          <Button size="small" onClick={() => setPicked('D')}>不选，按默认口径出数</Button>
          <span style={{ fontSize: 12, color: '#8a94a3', marginLeft: 8 }}>
            默认口径暂取「开井日历折算」（§3 两支口径的排序第一支）；正式指定默认值走<a href="#/C2">修改审批台</a>提案裁决。
          </span>
        </div>
        <div style={{ marginTop: 12 }}>
          {picked ? (
            <Card size="small" style={{ background: '#f6f8fa' }}>{CALLOUT_TEXTS[picked]}</Card>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={'（还没选口径——点上面任意一支，或选"不选"看默认标注。）'} />
          )}
        </div>
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button type="primary" onClick={submitChange}>提交口径变更……</Button>
          <span style={{ fontSize: 12, color: '#8a94a3' }}>
            想改口径（含改默认口径）？先看平台给的联动提示——产量一动，好几个数要一起核对。
          </span>
        </div>
      </Modal>
    </div>
  )
}
