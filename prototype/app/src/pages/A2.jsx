import { useState } from 'react'
import {
  Button, Card, Col, Collapse, Empty, Row, Segmented, Select, Space, Spin, Table, Tag, Typography
} from 'antd'
import { CaretRightOutlined } from '@ant-design/icons'
import { DEV } from '../shell/TraceBar.jsx'

window.__guides = Object.assign(window.__guides || {}, {
  A2: [
    '选井下拉切到 N-06——四张卡与关系链整体换数据。',
    '看 N-06 的产量卡——注水井自动换成"注水台账"。',
    '点"它最近怎么样"——回答卡出现，顶部标"本页背景已由系统注入"。',
    '点"有没有递减风险？"——出评级与依据；换一口井再点，结论不同。',
    '切到 N-11——看检修台账：检泵 8-28 → 9-06，影响约 210 吨。',
    '在关系链里逐层点开"下一层 · 措施 / 设备 / 检修"——沿井往下钻，N-11 能追到停产根因。'
  ]
})
window.__traces = Object.assign(window.__traces || {}, {
  A2: 'F44 背景注入 · F45 对象查询 · F46 专业函数（递减风险）· F43 AgentOS 总纲 · F48 治理约束（无权限井灰显）· m16 对象关系 / m1 底座'
})

const WORKBENCH = [
  { key: 'A1', label: '问一问' },
  { key: 'A2', label: '井档案（井 360°）' },
  { key: 'A3', label: '变更审批台' }
]

const WELL_OPTIONS = [
  { value: 'N-02', label: 'N-02 渤中28-1-N2（渤南 · 采油 · 生产中）' },
  { value: 'N-06', label: 'N-06（渤南 · 注水 · 分层注水 3 层）' },
  { value: 'N-11', label: 'N-11（渤中 · 采油 · 停产）' },
  { value: 'na', label: '（无查看权限的井不在此列表）', disabled: true }
]

const WELLS = {
  'N-02': {
    archive: {
      rows: [{ key: '1', id: 'N-02', name: '渤中28-1-N2', kind: '采油（EW）', spud: '2019-06-15', platform: 'CEP-A', block: '渤南', status: '生产中', ok: true, note: '正常' }],
      foot: null
    },
    prodTitle: '近 30 天产量',
    prod: [
      { label: '日产油', value: '48.60 吨' },
      { label: '日产液', value: '165.30 方' },
      { label: '含水', value: '70.6%' },
      { label: '配产', value: '50.00 吨' },
      { label: '开井', value: '24.0 小时' },
      { label: '油压', value: '3.1 MPa' }
    ],
    prodFoot: '样本日 2026-09-14，同日 A/B 班重复行已去重。',
    measuresEmpty: '暂无记录',
    measuresFoot: '措施类型 压裂 / 酸化 / 补孔 / 调剖',
    maintainEmpty: '无检修记录',
    maintain: null,
    ask: {
      recent: 'N-02 近期生产平稳：样本日（2026-09-14）日产油 48.60 吨、含水 70.6%、油压 3.1 MPa，开井满 24 小时，配产 50.00 吨；无检修、无停产记录。',
      decline: <span><b>评级：低</b> · 依据：开井时率满、无措施与检修扰动。</span>
    },
    chain: {
      root: '井 N-02（采油 · 生产中 · 渤南 / CEP-A）',
      measures: '无措施行。类型枚举：压裂 / 酸化 / 补孔 / 调剖',
      devices: '采油井常见设备：电泵 / 螺杆泵；停机原因编码新旧并存：旧 R3＝皮带断 ↔ 新 BELT，平台按映射表自动归一',
      maintain: '无检修记录',
      tail: null
    }
  },
  'N-06': {
    archive: {
      rows: [{ key: '1', id: 'N-06', name: '—', kind: '注水（IW）', spud: '2019-08-01', platform: 'CEP-A', block: '渤南', status: '生产中', ok: true, note: '分层注水（3 层）' }],
      foot: null
    },
    prodTitle: '近 30 天注水台账（注水井看这张）',
    prod: [
      { label: '分层注水', value: '3 层' },
      { label: '分层实注示例', value: 'P1:60,P2:40' },
      { label: '泵压字段（MPa）', value: null }
    ],
    prodFoot: '注水井无日产油记录，"产量最高"类排名自动排除本井。',
    measuresEmpty: '注水井措施以调剖为主（暂无记录行）',
    measuresFoot: null,
    maintainEmpty: '无检修记录',
    maintain: null,
    ask: {
      recent: 'N-06 是注水井（分层注水 3 层，渤南 / CEP-A）：当前按分层配注注水，分层实注见左侧台账卡（P1:60,P2:40 口径示例）。它对受效油井的增油贡献按劈分系数（Σ=1）分摊；评估走《注水井措施评估》剧本。',
      decline: '注水井不做产油递减评级。若要评估注水有效性，走《注水井措施评估》剧本：定口径（递减增油）→ 有效性判定 → 技术指标 → 受效判断 → 劈分系数 → 增油核算 → 桶油成本。'
    },
    chain: {
      root: '井 N-06（注水 · 生产中 · 渤南 / CEP-A）',
      measures: '注水井措施以调剖为主（无样本行）',
      devices: '设备类型枚举：电泵 / 螺杆泵 / 加热炉（本井无设备行）',
      maintain: '无检修记录',
      tail: '关系：N-06 —受效→ 受效油井（劈分系数 Σ=1）——受效井清单未装配'
    }
  },
  'N-11': {
    archive: {
      rows: [{ key: '1', id: 'N-11', name: '—', kind: '采油（EW）', spud: '2020-02-20', platform: 'CEP-B', block: '渤中', status: '停产', ok: false, note: '2026-08-30 起检泵' }],
      foot: '台账状态"停产"与产量表 9-14 仍有开井 6.5 小时记录并存（状态滞后，已提示数据岗）。'
    },
    prodTitle: '近 30 天产量',
    prod: [
      { label: '日产液', value: '96.00 方' },
      { label: '含水', value: '87.1%' },
      { label: '配产', value: '15.00 吨' },
      { label: '开井', value: '6.5 小时' },
      { label: '油压', value: '2.7 MPa' },
      { label: '日产油', value: '12.40', bad: '单位误录"方"' }
    ],
    prodFoot: '样本日 2026-09-14，按渤中密度 0.89 t/m³ 折算 ≈11.04 吨。',
    measuresEmpty: '暂无记录',
    measuresFoot: '措施类型：压裂 / 酸化 / 补孔 / 调剖',
    maintainEmpty: null,
    maintain: '检泵 2026-08-28 → 2026-09-06（跨月）· 影响产量 约 210 吨 · 批次 20260911-T3',
    ask: {
      recent: 'N-11 处于检泵停产后恢复期：8-28 → 9-06 检泵（影响约 210 吨，批次 20260911-T3）；样本日（2026-09-14）日产液 96.00 方、含水 87.1%，日产油 12.40"方"（单位误录，折算约 11.04 吨）。台账状态"停产"与产量表仍开井 6.5 小时并存——状态滞后已提示数据岗。',
      decline: <span><b>评级：高</b> · 依据：检泵停产刚结束、含水 87.1% 偏高、开井时率仅 6.5/24 小时。</span>
    },
    chain: {
      root: '井 N-11（采油 · 停产 · 渤中 / CEP-B）',
      measures: '无措施行（类型枚举：压裂 / 酸化 / 补孔 / 调剖）',
      devices: '检泵作业对象＝抽油设备（类型枚举：电泵 / 螺杆泵 / 加热炉）；停机原因编码新旧并存：旧 R3＝皮带断 ↔ 新 BELT',
      maintain: '检泵 2026-08-28 → 2026-09-06 · 影响约 210 吨 · 批次 20260911-T3',
      tail: '追溯结论：本井停产环节＝检泵作业（检修台账）；措施层无在案记录。遍历深度为受控参数'
    }
  }
}
if (DEV) {
  WELLS['N-02'].prodFoot += '（m16 对象关系 · W-F45-1）'
}

const ARCHIVE_COLUMNS = [
  { title: '井号', dataIndex: 'id', width: 70 },
  { title: '井名', dataIndex: 'name' },
  { title: '井别', dataIndex: 'kind' },
  { title: '投产', dataIndex: 'spud', width: 110 },
  { title: '平台', dataIndex: 'platform', width: 80 },
  { title: '区块', dataIndex: 'block', width: 70 },
  { title: '状态', dataIndex: 'status', width: 90, render: (t, r) => <Tag color={r.ok ? 'green' : 'red'}>{t}</Tag> },
  { title: '备注', dataIndex: 'note' }
]

const CHAIN_ITEMS = w => [
  { key: 'm', label: '下一层 · 措施', children: w.chain.measures },
  { key: 'd', label: '下一层 · 设备', children: w.chain.devices },
  { key: 'r', label: '下一层 · 检修', children: w.chain.maintain }
]

export default function A2Well() {
  const [well, setWell] = useState('N-02')
  const [loading, setLoading] = useState(false)
  const [asked, setAsked] = useState(null)
  const w = WELLS[well]

  function switchWell(v) {
    if (v === well) return
    setAsked(null)
    setLoading(true)
    setTimeout(() => { setWell(v); setLoading(false) }, 400)
  }
  function ask(kind) { setAsked(kind) }

  return (
    <div>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }} align="center">
        <Segmented options={WORKBENCH} value="A2"
          onChange={k => { if (k !== 'A2') location.hash = '/' + k }} />
        <Space>
          <span>当前井：</span>
          <Select style={{ width: 340 }} value={well} options={WELL_OPTIONS} onChange={switchWell} />
        </Space>
      </Space>

      <Spin spinning={loading} tip="加载井档案…">
        <Row gutter={[16, 16]}>
          <Col span={15}>
            <Card size="small" title="井档案">
              <Table size="small" columns={ARCHIVE_COLUMNS} dataSource={w.archive.rows} pagination={false} />
              {w.archive.foot && (
                <div style={{ fontSize: 12, color: '#8a94a3', marginTop: 8 }}>{w.archive.foot}</div>
              )}
            </Card>
          </Col>
          <Col span={9}>
            <Card size="small" title={w.prodTitle}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {w.prod.map(p => (
                  <Tag key={p.label} style={{ marginInlineEnd: 0, padding: '4px 10px' }}
                    color={p.bad ? 'red' : 'default'}>
                    {p.label}{p.value && <> <b>{p.value}</b></>}{p.bad ? `（${p.bad}）` : ''}
                  </Tag>
                ))}
              </div>
              <div style={{ fontSize: 12, color: '#8a94a3', marginTop: 8 }}>{w.prodFoot}</div>
            </Card>
          </Col>
          <Col span={12}>
            <Card size="small" title="措施记录">
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={w.measuresEmpty} />
              {w.measuresFoot && (
                <div style={{ fontSize: 12, color: '#8a94a3', marginTop: 8, textAlign: 'center' }}>{w.measuresFoot}</div>
              )}
            </Card>
          </Col>
          <Col span={12}>
            <Card size="small" title="检修台账">
              {w.maintain
                ? <Typography.Paragraph style={{ marginBottom: 0 }}>{w.maintain}</Typography.Paragraph>
                : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={w.maintainEmpty} />}
            </Card>
          </Col>

          <Col span={24}>
            <Card size="small" title="页内直接问">
              <Space>
                <Button type="primary" icon={<CaretRightOutlined />} onClick={() => ask('recent')}>它最近怎么样</Button>
                <Button icon={<CaretRightOutlined />} onClick={() => ask('decline')}>有没有递减风险？</Button>
              </Space>
              {asked && (
                <Card size="small" style={{ marginTop: 12 }}>
                  <div><Tag color="green">本页背景已由系统注入</Tag><b>我：</b>{asked === 'recent' ? '它最近怎么样' : '有没有递减风险？'}</div>
                  <div style={{ marginTop: 8 }}>{w.ask[asked]}</div>
                  <div style={{ fontSize: 12, marginTop: 8 }}>
                    <a onClick={() => { location.hash = '/A1' }}>继续追问可去问一问（本页背景随会话带上）</a>
                  </div>
                </Card>
              )}
            </Card>
          </Col>

          <Col span={24}>
            <Card size="small" title="关系链下钻">
              <Collapse
                defaultActiveKey={['root']}
                items={[{ key: 'root', label: w.chain.root, children: (
                  <Collapse ghost items={CHAIN_ITEMS(w)} />
                ) }]}
              />
              {w.chain.tail && (
                <div style={{ fontSize: 12, color: '#8a94a3', marginTop: 8 }}>{w.chain.tail}</div>
              )}
            </Card>
          </Col>
        </Row>
      </Spin>
    </div>
  )
}
