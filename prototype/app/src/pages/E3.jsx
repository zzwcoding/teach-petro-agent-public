import { useRef, useState } from 'react'
import { Card, Col, Progress, Row, Skeleton, Tabs, Tag, Typography } from 'antd'

export const E3_GUIDE = [
  '左侧清单先看默认选中的 N-11——右侧出四维分数条，总评"需补课"标红。',
  '看 N-11 的短板——逻辑维度 62 分，"档案状态滞后"等 3 条建议。',
  '换点一个区块（渤中）——看"孤儿关系"怎么被体检抓出来。',
  '换点一个指标（递减增油）——两作业区算法不一致挂"口径待裁决"。',
  '每条建议都标了缺什么类型——缺来源 / 缺负责人 / 口径待裁决 / 孤儿关系 / 资料缺项。',
  '看报告脚注——建议经人确认才进修改审批台，平台不自己改。'
]
export const E3_TRACE = 'F24 三源提案池+体检 · m16/m18 卡'

window.__guides = Object.assign(window.__guides || {}, { E3: E3_GUIDE })
window.__traces = Object.assign(window.__traces || {}, { E3: E3_TRACE })

const E_TABS = [
  { key: 'E1', label: '答题考核' },
  { key: 'E2', label: '数据质量台' },
  { key: 'E3', label: '知识体检' }
]

const GROUPS = [
  { name: '井', keys: ['N-02', 'N-06', 'N-11'] },
  { name: '区块', keys: ['bo-nan', 'bo-zhong', 'bo-xi'] },
  { name: '指标', keys: ['m-complete', 'm-effective', 'm-decline', 'm-measure'] }
]

const OBJECTS = {
  'N-02': {
    label: 'N-02 渤中28-1-N2', name: 'N-02 渤中28-1-N2', type: '井',
    scores: [92, 95, 88, 90], grade: '健康',
    sugg: [
      { tag: '缺来源', text: '备注字段里有一段来路不明的旧文本（供应商导入塞入）——建议标注来源或清理（设定书 §A.1）' }
    ]
  },
  'N-06': {
    label: 'N-06', name: 'N-06', type: '井',
    scores: [90, 92, 85, 94], grade: '健康',
    sugg: [
      { tag: '缺来源', text: '受效关系的劈分系数、响应起始日没有登记出处（设定书 §5：受效关系属性）' }
    ]
  },
  'N-11': {
    label: 'N-11', name: 'N-11', type: '井',
    scores: [88, 62, 70, 75], grade: '需补课',
    sugg: [
      { tag: '逻辑打架', text: '档案状态滞后——2026-08-30 起检泵停产，档案仍记"生产中"（设定书 §A.1）' },
      { tag: '缺来源', text: '检修影响产量"约 210 吨"来自各作业区估算，口径不一（设定书 §A.4）' },
      { tag: '缺负责人', text: '状态变更记录没有认领人' }
    ]
  },
  'bo-nan': {
    label: '渤南', name: '渤南区块', type: '区块',
    scores: [90, 88, 82, 86], grade: '健康',
    sugg: [
      { tag: '缺来源', text: '原油密度 0.86 t/m³（吨方换算用）需挂单位换算表出处（设定书 §2.2）' }
    ]
  },
  'bo-zhong': {
    label: '渤中', name: '渤中区块', type: '区块',
    scores: [86, 84, 80, 82], grade: '亚健康',
    sugg: [
      { tag: '孤儿关系', text: '有井没挂上"井—隶属→区块"关系——按区块汇总时会漏井（关系类型见设定书 §5）' },
      { tag: '缺负责人', text: '区块级数据负责人未指定' }
    ]
  },
  'bo-xi': {
    label: '渤西', name: '渤西区块', type: '区块',
    scores: [80, 78, 72, 76], grade: '亚健康',
    sugg: [
      { tag: '缺来源', text: '化验样频次不齐（高产周报 / 低产半月报），缺样插补规则未登记（设定书 §A.6）' },
      { tag: '缺负责人', text: '区块级数据负责人未指定' }
    ]
  },
  'm-complete': {
    label: '产量完成率', name: '产量完成率', type: '指标',
    scores: [95, 90, 88, 92], grade: '健康',
    sugg: [
      { tag: '口径待裁决', text: '配产计划版本切换日出现双值行——需明确取哪个版本（设定书 §3 指标 1 争议注记）' }
    ]
  },
  'm-effective': {
    label: '有效产量', name: '有效产量', type: '指标',
    scores: [92, 70, 85, 88], grade: '亚健康',
    sugg: [
      { tag: '口径待裁决', text: '一词两译（开井日历折算 / 剔检）缺默认口径标注（设定书 §3 指标 2 / §6；已有提案在 C2）' }
    ]
  },
  'm-decline': {
    label: '递减增油', name: '递减增油', type: '指标',
    scores: [85, 52, 75, 80], grade: '需补课',
    sugg: [
      { tag: '口径待裁决', text: '两作业区算法不一致（事故 7），条目挂"待联席裁决"（设定书 §3 指标 10 / §6）' },
      { tag: '缺来源', text: '劈分系数（Σ=1）的出处未登记（设定书 §3 指标 10 / §5）' }
    ]
  },
  'm-measure': {
    label: '措施有效期', name: '措施有效期', type: '指标',
    scores: [88, 86, 58, 84], grade: '需补课',
    sugg: [
      { tag: '资料缺项', text: '措施起止日期 30% 行缺失——建议补台账（设定书 §A.5）' },
      { tag: '缺负责人', text: '缺失行的补录责任人未指定' }
    ]
  }
}

const DIMS = ['资料全不全', '逻辑顺不顺', '数据覆盖够不够', '关系健全不健全']
const GRADE_COLOR = { 健康: 'green', 亚健康: 'gold', 需补课: 'red' }
const AMBER_TAGS = ['口径待裁决', '逻辑打架']
const sleep = ms => new Promise(r => setTimeout(r, ms))

export default function E3Checkup() {
  const [sel, setSel] = useState('N-11')
  const [loading, setLoading] = useState(false)
  const timer = useRef(null)

  function pick(key) {
    if (key === sel || loading) return
    setLoading(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      setSel(key)
      setLoading(false)
    }, 250)
  }

  const obj = OBJECTS[sel]

  const report = loading ? (
    <Skeleton active paragraph={{ rows: 6 }} />
  ) : (
    <Card size="small">
      <div style={{ marginBottom: 4 }}>
        <Typography.Title level={4} style={{ margin: 0, display: 'inline' }}>{obj.name}</Typography.Title>
        <Tag style={{ marginLeft: 8 }}>{obj.type}</Tag>
        <Tag color={GRADE_COLOR[obj.grade]} style={{ marginLeft: 4 }}>总评：{obj.grade}</Tag>
      </div>
      <div style={{ marginTop: 12 }}>
        {DIMS.map((d, i) => (
          <div key={d} style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ width: 140, flexShrink: 0, fontSize: 13 }}>{d}</span>
            <Progress
              percent={obj.scores[i]}
              format={v => `${v} 分`}
              strokeColor={obj.scores[i] < 70 ? '#faad14' : undefined}
              style={{ flex: 1, margin: 0 }}
            />
          </div>
        ))}
      </div>
      <div style={{ fontWeight: 600, marginTop: 12, marginBottom: 8 }}>补全建议（{obj.sugg.length} 条）</div>
      {obj.sugg.length === 0 ? (
        <div style={{ color: '#8a94a3' }}>暂无缺项。</div>
      ) : (
        obj.sugg.map((s, i) => (
          <Card size="small" key={i} style={{ marginBottom: 8, background: '#fafafa' }}>
            <Tag color={AMBER_TAGS.includes(s.tag) ? 'gold' : 'default'}>{s.tag}</Tag>
            <span style={{ fontSize: 13 }}>{s.text}</span>
          </Card>
        ))
      )}
      <div style={{ fontSize: 12, color: '#8a94a3', marginTop: 8 }}>
        以上建议经人确认后进修改建议池（→ C2 修改审批台）；平台不自己改。
      </div>
    </Card>
  )

  return (
    <div>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
        给平台的知识底子做体检——每口井、每个区块、每个指标按四个维度打分，缺什么、哪里断了关系列出补全建议；体检只出评分和建议，改不改由人在修改审批台定。
      </Typography.Paragraph>
      <Tabs activeKey="E3" items={E_TABS} onChange={k => { location.hash = '/' + k }} style={{ marginBottom: 16 }} />
      <Row gutter={16} align="top">
        <Col span={6}>
          <Card title="体检对象" size="small">
            {GROUPS.map(g => (
              <div key={g.name} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, color: '#8a94a3', marginBottom: 6 }}>{g.name}</div>
                {g.keys.map(k => (
                  <Tag.CheckableTag key={k} checked={sel === k} onClick={() => pick(k)} style={{ fontSize: 13 }}>
                    {OBJECTS[k].label}
                  </Tag.CheckableTag>
                ))}
              </div>
            ))}
            <div style={{ fontSize: 12, color: '#8a94a3' }}>
              对象清单来自平台的四本账（业务术语 / 指标口径 / 对象与关系 / 分析剧本 → C1 指标与术语库）。
            </div>
          </Card>
          <Card title="四个维度是什么" size="small" style={{ marginTop: 16, background: '#f6f8fa' }}>
            <div style={{ marginBottom: 6 }}>① 资料全不全——该有的档案、说明在不在</div>
            <div style={{ marginBottom: 6 }}>② 逻辑顺不顺——说法之间打不打架</div>
            <div style={{ marginBottom: 6 }}>③ 数据覆盖够不够——底下的数齐不齐</div>
            <div>④ 关系健全不健全——跟别的对象连没连上</div>
          </Card>
        </Col>
        <Col span={12}>
          <Card title="四维体检报告" size="small">{report}</Card>
        </Col>
        <Col span={6}>
          <Card title="体检之后走哪" size="small" style={{ background: '#f6f8fa' }}>
            补全建议经人确认后，进 C2 修改审批台（修改建议池的三个来源之一：「自动体检发现」，另两个是考核没通过和用户反馈）。
          </Card>
        </Col>
      </Row>
    </div>
  )
}
