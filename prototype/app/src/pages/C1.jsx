import { useEffect, useState } from 'react'
import {
  Button, Card, Col, Collapse, Empty, Row, Select, Skeleton, Steps, Table, Tabs, Tag
} from 'antd'

window.__guides = Object.assign(window.__guides || {}, {
  C1: [
    '看页签"四本账"，默认在"业务术语"——10 条术语，每条带负责人/状态/来源/版本。',
    '把状态筛成"禁用词"——只剩"老完成率"，状态写明替代叫法是"产量完成率"。',
    '切到"指标口径"——15 条指标全列，★ 是晨会常问、☆ 是专业常用；筛"开发室"看条数变化。',
    '切到"对象与关系"——10 个对象、5 条关系，底下是"哪些表能关联"白名单。',
    '切到"分析剧本"——《产量下滑归因》五步做法，《注水井措施评估》八步流程条。',
    '右栏"账本总览"一眼看清四本账条目数；点开"导出通用格式"看导出文件长什么样，点"导出"提示文件已生成。',
    '右下角灰卡——改这里任何一条都不直接生效，顺着链接去修改审批台。'
  ]
})
window.__traces = Object.assign(window.__traces || {}, {
  C1: 'F19 语义层四域 · F23 通用格式导出 · F26 评分卡选表 · F39 治理本体仓 · m16 语义层与指标注册 · m24 治理本体仓'
})

const TERM_STATUS = ['全部状态', '有效', '禁用词', '有效（限作业区语境）', '有效（待联席裁决）', '有效（引用马涛）']
const TERM_OWNERS = ['全部负责人', '开发室', '采油工艺所', '地质研究所', '语义 Owner']

const TERMS = [
  { key: 1, term: '老完成率', type: '禁用词', def: 'v1 口径（不含自用油折算），2024 年废弃', status: '禁用（替代：产量完成率）', st: '禁用词', owner: '开发室', src: '设定书 §6', ver: 'v1' },
  { key: 2, term: '剔检产量', type: '别名 → 净产量', def: '剔除检修井口径', status: '有效', st: '有效', owner: '开发室', src: '设定书 §6', ver: 'v1' },
  { key: 3, term: '有效产量', type: '一词两译', def: '需修饰词消歧（开井日历 / 剔检）', status: '有效', st: '有效', owner: '开发室', src: '设定书 §6', ver: 'v1' },
  { key: 4, term: '躺井', type: '黑话 → 停产待检泵', def: '作业区口语', status: '有效（限作业区语境）', st: '有效（限作业区语境）', owner: '采油工艺所', src: '设定书 §6', ver: 'v1' },
  { key: 5, term: '时率', type: '缩写 → 抽油机时率', def: '见指标 14', status: '有效', st: '有效', owner: '采油工艺所', src: '设定书 §6', ver: 'v1' },
  { key: 6, term: '水淹层', type: '术语', def: '驱替前沿到达的高含水层段', status: '有效', st: '有效', owner: '地质研究所', src: '设定书 §6', ver: 'v1' },
  { key: 7, term: '递减增油', type: '术语', def: '见指标 10（含口径争议注记）', status: '有效（待联席裁决）', st: '有效（待联席裁决）', owner: '采油工艺所', src: '设定书 §6', ver: 'v1' },
  { key: 8, term: '存水率', type: '术语', def: '注入水留存地层比例（物质平衡用）', status: '有效', st: '有效', owner: '开发室', src: '设定书 §6', ver: 'v1' },
  { key: 9, term: '配注合格率', type: '术语', def: '分层实注 / 配注 达标井次占比', status: '有效', st: '有效', owner: '采油工艺所', src: '设定书 §6', ver: 'v1' },
  { key: 10, term: '三多四难', type: '治理热词', def: '数据库多、平台多、孤立应用多 / 共享难、复用难、开发难、协同难', status: '有效（引用马涛）', st: '有效（引用马涛）', owner: '语义 Owner', src: '设定书 §6', ver: 'v1' }
]

const STATUS_COLORS = {
  有效: 'green',
  禁用词: 'red',
  '有效（限作业区语境）': 'green',
  '有效（待联席裁决）': 'orange',
  '有效（引用马涛）': 'green'
}

const METRIC_OWNERS = ['全部负责人', '开发室', '采油工艺所', '销售计量站']

const METRICS = [
  { key: 1, name: '★产量完成率', def: 'Σ实际产油 ÷ Σ计划配产 × 100%', grain: '月（按区块 / 油田）· %', detail: true, status: ['生效中'], owner: '开发室', src: 'A.2 日产计量＋配产表', dispute: '计划版本切换日双值' },
  { key: 2, name: '★有效产量（两支口径）', def: '开井日历折算 / 检修剔除', grain: '月 · 吨', detail: true, status: ['生效中'], owner: '开发室', src: 'A.2 日产计量＋A.4 检修台账', dispute: '跨月检修切割' },
  { key: 3, name: '☆自然递减率', def: '月：1 − q_t / q_(t−1)（扣新井与措施增油）；年化：指数拟合 q(t)=q_i·e^(−Dt)', grain: '月 · 年 · %', status: ['生效中'], owner: '开发室', src: 'A.2 日产计量', dispute: '措施扣除口径' },
  { key: 4, name: '☆综合递减率', def: '不扣措施的对比期递减', grain: '月 · 年 · %', status: ['生效中'], owner: '开发室', src: 'A.2 日产计量', dispute: '与自然递减率混用事故' },
  { key: 5, name: '☆综合含水率', def: 'Q_w ÷（Q_o＋Q_w）× 100%', grain: '月 · %', status: ['生效中'], owner: '开发室', src: 'A.2 日产计量＋A.6 化验', dispute: '化验 vs 计量打架' },
  { key: 6, name: '☆注采比 β', def: '月注水量 ÷ 月产液量（体积折算）', grain: '月 · 无量纲', status: ['生效中'], owner: '采油工艺所', src: 'A.3 注水日报＋A.2 日产计量', dispute: '折算系数按区块' },
  { key: 7, name: '☆累积亏空', def: 'Σ注水 − Σ产液', grain: '累计 · 方', status: ['生效中'], owner: '开发室', src: 'A.3 注水日报＋A.2 日产计量', dispute: '—' },
  { key: 8, name: '☆措施有效率 η', def: 'N_y ÷ N_z × 100%（有效井次 ÷ 总井次）', grain: '批次 · %', status: ['生效中'], owner: '采油工艺所', src: 'A.5 措施台账', dispute: '"有效"判据' },
  { key: 9, name: '☆措施有效期 T', def: 't₂ − t₁（天）', grain: '单井 · 措施 · 天', status: ['生效中'], owner: '采油工艺所', src: 'A.5 措施台账', dispute: '30% 行缺失' },
  { key: 10, name: '☆递减增油', def: '受效油井实际产油 − 按 d_a 拟合基线 q₀(1−d_a)^t；多井受效按劈分系数（Σ=1）分摊；多措施叠加以主要措施为主', grain: '井组 · 年 · 吨', status: ['生效中', '待联席裁决'], owner: '采油工艺所（开发室联席）', src: 'A.2＋A.5＋受效关系', dispute: '一数多源争议之最（事故 7）' },
  { key: 11, name: '★商品量', def: '脱水稳定后净重（扣自用油输差）', grain: '月 · 吨', status: ['生效中'], owner: '销售计量站', src: 'A.8 月度结算', dispute: '与井口口径天然不等' },
  { key: 12, name: '☆机采系统能效', def: '系统级 / 单元级 / 设备级三级＋统计限值（优良 / 合格）', grain: '月 · %', status: ['生效中'], owner: '采油工艺所', src: 'A.7 设备状态', dispute: '分组限值' },
  { key: 13, name: '☆检泵周期', def: '本次检泵日 − 上次检泵日', grain: '单井 · 天', status: ['生效中'], owner: '采油工艺所', src: 'A.4 检修台账', dispute: '—' },
  { key: 14, name: '☆抽油机时率', def: 'Σ开井天数 ÷ Σ日历天 × 100%', grain: '月 · %', status: ['生效中'], owner: '采油工艺所', src: 'A.2 日产计量', dispute: '—' },
  { key: 15, name: '☆桶油增产成本', def: '措施总投入 ÷ 折算增油量（桶，6.29 桶/m³）', grain: '批次 · 元/桶', status: ['生效中'], owner: '采油工艺所＋财务', src: 'A.5 措施台账＋ERP', dispute: '经营 × 技术联席' }
]

const OBJECTS = [
  { key: 1, obj: '井', attr: '井号 / 井别 / 投产日 / 状态机' },
  { key: 2, obj: '井筒', attr: '段 / 射孔 / 防砂' },
  { key: 3, obj: '区块', attr: '§5 未列属性' },
  { key: 4, obj: '油田', attr: '§5 未列属性' },
  { key: 5, obj: '平台', attr: '§5 未列属性' },
  { key: 6, obj: '设备', attr: '§5 未列属性' },
  { key: 7, obj: '措施', attr: '§5 未列属性' },
  { key: 8, obj: '化验样', attr: '§5 未列属性' },
  { key: 9, obj: '受效关系', attr: '注水井 → 受效油井，多对多；属性＝劈分系数（Σ=1）、响应起始日——系数劈分是强制要求，设定书 §5' },
  { key: 10, obj: '配注层', attr: '§5 未列属性' }
]

const RELATIONS = [
  { key: 1, rel: '井 —隶属→ 区块 —隶属→ 油田', read: '井属于哪个区块，区块属于哪个油田' },
  { key: 2, rel: '平台 —承载→ 井', read: '井装在哪个平台上' },
  { key: 3, rel: '注水井 —受效→ 油井', read: '哪口注水井的注水，效果落在哪口油井上' },
  { key: 4, rel: '措施 —作用于→ 井', read: '压裂 / 酸化等措施做在哪口井上' },
  { key: 5, rel: '化验样 —取样自→ 井', read: '化验的水样取自哪口井' }
]

const WHITELIST = [
  { key: 1, ok: '可以', tables: '日产计量 oil_production_daily ⋈ 井档案 well_info', how: '用井号连' },
  { key: 2, ok: '可以', tables: '日产计量 oil_production_daily ⋈ 日期维表 date_dim', how: '按日期连' },
  { key: 3, ok: '默认不给', tables: '日产计量 oil_production_daily ⋈ 化验样 fluid_test', how: '须井号＋取样日期双键＋时间容差，经清洗层视图中转' },
  { key: 4, ok: '默认不给', tables: '日产计量 oil_production_daily ⋈ 注水日报 water_injection_daily（直连）', how: '须经"受效关系"这个对象中转，不许硬拼' }
]

const YAML_SAMPLE = `# 语义资产 → 通用格式导出
# 同一份定义：平台问答 / BI 报表 / 外部智能助手都能读
dataset:
  name: oil_production_daily      # 日产计量（设定书 A.2）
metric:
  name: production_completion_rate
  displayName: 产量完成率
  definition: Σ实际产油 ÷ Σ计划配产 × 100%   # 设定书 §3 指标 1
  unit: "%"
  grain: 月（按区块 / 油田）
  owner: 开发室
  extensions:                     # 本项目特有字段进扩展段，不丢不污染标准段
    modifiers: []
    dispute_note: 计划版本切换日双值
    version: v3
relationship:
  from: 注水井
  to: 油井
  type: 受效                      # 设定书 §5`

const SCRIPT_STEPS = ['定口径（递减增油）', '有效性判定', '技术指标计算（指标 8–10）', '受效判断', '劈分系数', '增油核算', '桶油成本', '归档进"已验证指标"证据']

const termColumns = [
  { title: '术语', dataIndex: 'term', render: v => <b>{v}</b> },
  { title: '类型', dataIndex: 'type' },
  { title: '定义', dataIndex: 'def' },
  { title: '状态', dataIndex: 'status', render: (v, r) => <Tag color={STATUS_COLORS[r.st]}>{v}</Tag> },
  { title: '负责人', dataIndex: 'owner' },
  { title: '来源', dataIndex: 'src' },
  { title: '版本', dataIndex: 'ver' }
]

const metricColumns = [
  { title: '#', dataIndex: 'key', width: 40 },
  {
    title: '指标', dataIndex: 'name',
    render: (v, r) => <span><b>{v}</b>{r.detail && <> <a href="#/C4">→ 口径详情</a></>}</span>
  },
  { title: '定义与公式', dataIndex: 'def' },
  { title: '粒度 · 单位', dataIndex: 'grain' },
  {
    title: '状态', dataIndex: 'status',
    render: v => <span>{v.map((s, i) => <Tag key={i} color={s === '生效中' ? 'green' : 'orange'}>{s}</Tag>)}</span>
  },
  { title: '负责人', dataIndex: 'owner' },
  { title: '数据源', dataIndex: 'src' },
  { title: '争议注记', dataIndex: 'dispute' }
]

const objColumns = [
  { title: '对象', dataIndex: 'obj', render: v => <b>{v}</b> },
  { title: '属性·说明', dataIndex: 'attr' },
  { title: '状态', render: () => <Tag>草案</Tag> },
  { title: '负责人', render: () => '—（未落）' },
  { title: '来源', render: () => '设定书 §5' },
  { title: '版本', render: () => '—（未落）' }
]

const relColumns = [
  { title: '关系', dataIndex: 'rel', render: v => <b>{v}</b> },
  { title: '读法', dataIndex: 'read' },
  { title: '来源', render: () => '设定书 §5' }
]

const wlColumns = [
  {
    title: '能否关联', dataIndex: 'ok', width: 110,
    render: v => <Tag color={v === '可以' ? 'green' : 'orange'}>{v}</Tag>
  },
  { title: '两张表', dataIndex: 'tables' },
  { title: '说明', dataIndex: 'how' }
]

const emptyText = <Empty description="没有符合筛选条件的条目" image={Empty.PRESENTED_IMAGE_SIMPLE} />

export default function C1Assets() {
  const [loading, setLoading] = useState(true)
  const [tStatus, setTStatus] = useState('全部状态')
  const [tOwner, setTOwner] = useState('全部负责人')
  const [mOwner, setMOwner] = useState('全部负责人')
  const [exported, setExported] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600)
    return () => clearTimeout(t)
  }, [])

  const termRows = TERMS.filter(r =>
    (tStatus === '全部状态' || r.st === tStatus) && (tOwner === '全部负责人' || r.owner === tOwner))
  const metricRows = METRICS.filter(r => mOwner === '全部负责人' || r.owner === mOwner)

  const termsTab = (
    <div>
      <Row gutter={8} align="middle" style={{ marginBottom: 12 }}>
        <Col>
          <Select value={tStatus} onChange={setTStatus} style={{ width: 200 }}
            options={TERM_STATUS.map(v => ({ value: v, label: v }))} />
        </Col>
        <Col>
          <Select value={tOwner} onChange={setTOwner} style={{ width: 160 }}
            options={TERM_OWNERS.map(v => ({ value: v, label: v }))} />
        </Col>
        <Col><span style={{ fontSize: 12, color: '#8a94a3' }}>筛选结果 {termRows.length} / {TERMS.length} 条</span></Col>
      </Row>
      <Table size="small" columns={termColumns} dataSource={termRows} pagination={false}
        locale={{ emptyText }} rowKey="key" />
    </div>
  )

  const metricsTab = (
    <div>
      <Row gutter={8} align="middle" style={{ marginBottom: 12 }}>
        <Col>
          <Select value={mOwner} onChange={setMOwner} style={{ width: 160 }}
            options={METRIC_OWNERS.map(v => ({ value: v, label: v }))} />
        </Col>
        <Col><span style={{ fontSize: 12, color: '#8a94a3' }}>筛选结果 {metricRows.length} / {METRICS.length} 条</span></Col>
      </Row>
      <Table size="small" columns={metricColumns} dataSource={metricRows} pagination={false}
        locale={{ emptyText }} rowKey="key" />
    </div>
  )

  const objectsTab = (
    <div>
      <Table size="small" columns={objColumns} dataSource={OBJECTS} pagination={false} rowKey="key"
        title={() => '业务对象（10 个）'} />
      <Table size="small" style={{ marginTop: 16 }} columns={relColumns} dataSource={RELATIONS} pagination={false} rowKey="key"
        title={() => '对象之间的关系（5 条）'} />
      <Card size="small" style={{ marginTop: 16 }} title="哪些表能关联（白名单，不在单子上的默认不给连）">
        <Table size="small" columns={wlColumns} dataSource={WHITELIST} pagination={false} rowKey="key" />
      </Card>
    </div>
  )

  const scriptsTab = (
    <div>
      <Card size="small" title="剧本 1《产量下滑归因》">
        <div style={{ marginBottom: 8 }}>听到哪类问题开工：<b>"为什么下滑"</b></div>
        <ol style={{ paddingLeft: 20, margin: 0 }}>
          <li>拉完成率与构成（产油 / 开井数 / 时率）</li>
          <li>分解：新井贡献 / 老井递减 / 措施增油 / 停产影响（用指标 3 / 8 / 10）</li>
          <li>归因分支：地质——含水上升？工程——检泵停产？管理——配产调整？</li>
          <li>下钻受效关系与检修台账</li>
          <li>生成归因报告</li>
        </ol>
        <Row gutter={16} style={{ marginTop: 12 }}>
          <Col span={12}>
            <Card size="small" type="inner" title="缺参策略">
              时间窗默认最近 30 天、范围默认全区块，并明确标注"默认"
            </Card>
          </Col>
          <Col span={12}>
            <Card size="small" type="inner" title="哪步要人确认">
              机器建议占比与置信度高→少问人；低→必须人工确认档位（设定书 §7）
            </Card>
          </Col>
        </Row>
        <Row gutter={16} style={{ marginTop: 8 }}>
          <Col span={12}>
            <Card size="small" type="inner" title="交付物合同">
              结论＋证据链＋数据版本，三样齐才算答完
            </Card>
          </Col>
          <Col span={12}>
            <Card size="small" type="inner" title="来源 / 负责人 / 状态 / 版本">
              设定书 §7 · 负责人未落（如实标注）· 草案（待 Owner 审定）· v1
            </Card>
          </Col>
        </Row>
      </Card>
      <Card size="small" style={{ marginTop: 12 }} title="剧本 2《注水井措施评估》">
        <Steps size="small" items={SCRIPT_STEPS.map(t => ({ title: t }))} />
        <div style={{ fontSize: 12, color: '#8a94a3', marginTop: 8 }}>
          登记口径：来源＝设定书 §7 · 负责人未落（如实标注）· 状态＝草案（待 Owner 审定）· 版本 v1。
        </div>
      </Card>
    </div>
  )

  if (loading) {
    return (
      <Row gutter={16}>
        <Col span={17}>
          <Card><Skeleton active paragraph={{ rows: 10 }} /></Card>
        </Col>
        <Col span={7}>
          <Card><Skeleton active /></Card>
        </Col>
      </Row>
    )
  }

  return (
    <Row gutter={16} align="top">
      <Col span={17}>
        <Card>
          <div style={{ fontSize: 12, color: '#8a94a3', marginBottom: 8 }}>
            四本账四个页签，点上面切换。账上每条都带：负责人 / 状态 / 来源 / 版本。
          </div>
          <Tabs
            defaultActiveKey="terms"
            items={[
              { key: 'terms', label: '业务术语', children: termsTab },
              { key: 'metrics', label: '指标口径', children: metricsTab },
              { key: 'objects', label: '对象与关系', children: objectsTab },
              { key: 'scripts', label: '分析剧本', children: scriptsTab }
            ]}
          />
        </Card>
      </Col>
      <Col span={7}>
        <Card size="small" title="账本总览">
          业务术语 <b>10</b> 条 · 指标口径 <b>15</b> 条 · 对象与关系 <b>10 实体＋5 关系</b> · 分析剧本 <b>2</b> 个
        </Card>
        <Card size="small" style={{ marginTop: 12 }} title="导出通用格式（给别的系统用）">
          <Collapse
            items={[{
              key: 'yaml', label: '点开看导出文件长什么样（一份定义，三处消费）',
              children: <div className="code-block">{YAML_SAMPLE}</div>
            }]}
          />
          <div style={{ marginTop: 8 }}>
            <Button type="primary" onClick={() => setExported(true)}>导出</Button>
            {exported && (
              <span style={{ fontSize: 12, color: '#8a94a3', marginLeft: 8 }}>
                已生成导出文件 ossie-export.yaml——真实实现是一条导出命令，厂商细节进扩展段
              </span>
            )}
          </div>
        </Card>
        <Card size="small" style={{ marginTop: 12, background: '#f6f8fa' }} title="改这里的任何一条，都不直接生效">
          先提案（<a href="#/C2">修改审批台</a>）→ 过五道检查（<a href="#/C3">发布前安检</a>）→ 负责人批准才发布，且可回滚（<a href="#/C2">修改审批台</a>）。
        </Card>
      </Col>
    </Row>
  )
}
