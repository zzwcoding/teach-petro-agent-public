import { useEffect, useState } from 'react'
import { Alert, Button, Card, Col, Collapse, Empty, Row, Skeleton, Steps, Table, Tag } from 'antd'

window.__guides = Object.assign(window.__guides || {}, {
  C3: [
    '先看顶部五道检查的顺序——格式、引用、查询安全、治理、考核，任一道不过即停。',
    '点开发布记录 #2026-0921-03——五道全绿，第3道"不涉及"是正常态（纯术语变更无可查内容）。',
    '点开 #2026-0920-02——看被第 4 道拦下的样子：高影响变更没带审批单，第 5 道直接"未跑"。',
    '右侧点"模拟提交这次发布"——五道逐个点亮，第 3 道变红，第 4、5 道灰掉，原因与结论卡出现。',
    '再点一次——从头重跑；对照原因卡里的两条踩线点（改数据语句 / 除法没保护）。',
    '看右下角"第5道和考核的关系"——改口径不能把原来答对的题改错。'
  ]
})
window.__traces = Object.assign(window.__traces || {}, {
  C3: 'F20 五级 CI · m17 执行前校验链 · m16 语义层与指标注册'
})

const GATES = [
  '第1道 · 文件格式合法',
  '第2道 · 引用对得上、无循环',
  '第3道 · 查询安全（只放行查看 / 粒度对 / 不除零）',
  '第4道 · 负责人齐、敏感字段标了',
  '第5道 · 考核成绩不降级'
]
const GATE_SHORT = ['第1道 · 格式', '第2道 · 引用', '第3道 · 查询安全', '第4道 · 治理', '第5道 · 考核']

const RESULT_TAG = {
  过: { color: 'green' },
  拦下: { color: 'red' },
  不涉及: { color: 'default' },
  未跑: { color: 'default' }
}

const RECORDS = [
  {
    key: '1',
    title: '发布 #2026-0921-03 · 新增术语「躺井」（限作业区语境）',
    status: '已发布', statusColor: 'green',
    detail: [
      ['第1道 · 文件格式合法', '过', '配置文件装载通过，必填字段齐（术语 / 定义 / 状态 / 负责人）'],
      ['第2道 · 引用对得上、无循环', '过', '引用到的「抽油机时率」等条目都在账上，引用链无环、无废弃引用'],
      ['第3道 · 查询安全', '不涉及', '本变更只加术语条目、不带查询模板，无可查内容'],
      ['第4道 · 负责人齐、敏感字段标了', '过', '负责人＝采油工艺所（设定书 §6）；不含敏感字段'],
      ['第5道 · 考核成绩不降级', '过', '考核题集全量＋负样本重跑，全绿，成绩无下降']
    ]
  },
  {
    key: '2',
    title: '发布 #2026-0920-02 · 「产量完成率」定义修订提案',
    status: '被第4道拦下', statusColor: 'red',
    detail: [
      ['第1道 · 文件格式合法', '过', '文件能装载、字段齐'],
      ['第2道 · 引用对得上、无循环', '过', '引用的日产计量、配产表都在账上，无循环'],
      ['第3道 · 查询安全', '过', '模板只读、统计粒度＝月、公式除法已加零分母保护'],
      ['第4道 · 负责人齐、敏感字段标了', '拦下', '高影响口径变更（完成率定义改）没带负责人审批单。完成率是晨会常问指标（★），属高影响变更，必须 Owner / 治理领导组签字。处理：整包退回修改审批台补审批。'],
      ['第5道 · 考核成绩不降级', '未跑', '被第4道短路——一道不过，后面的不查']
    ]
  },
  {
    key: '3',
    title: '发布 #2026-0918-01 · 「有效产量」指标卡补充修饰词说明',
    status: '已发布', statusColor: 'green',
    detail: [
      ['第1道 · 文件格式合法', '过', '文件能装载、字段齐'],
      ['第2道 · 引用对得上、无循环', '过', '引用的「剔检产量」条目在账（设定书 §6），无循环'],
      ['第3道 · 查询安全', '过', '两支口径模板均只读、统计粒度＝月、无除法无除零风险'],
      ['第4道 · 负责人齐、敏感字段标了', '过', '负责人＝开发室（设定书 §3 指标 2）；不含敏感字段'],
      ['第5道 · 考核成绩不降级', '过', '考核题集全量＋负样本重跑全绿——含"有效产量"一词两译用例']
    ]
  }
]

const detailColumns = [
  { title: '检查道', dataIndex: 'gate', width: 240 },
  { title: '结果', dataIndex: 'result', width: 90, render: v => <Tag color={RESULT_TAG[v].color}>{v}</Tag> },
  { title: '为什么', dataIndex: 'why' }
]

const REASON = '在第3道拦下，为什么：查询安全只放行"查看"语句——这份模板第 12 行却是一条改数据的语句（UPDATE）；公式做除法没有零分母保护——「产量完成率」的分母（计划配产）为 0 时会算出错数。两条都踩查询安全红线。改法提示已附在提案上：改成只读语句＋除法加零分母保护。'
const CONCLUSION = '本次发布不通过。第4、5道显示"未检查"——顺序执行、任一道不过即短路，绝不带病往下走。整包退回修改。'

const sleep = ms => new Promise(r => setTimeout(r, ms))

export default function C3Ci() {
  const [loading, setLoading] = useState(true)
  const [runStep, setRunStep] = useState(-1)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600)
    return () => clearTimeout(t)
  }, [])

  async function runDrill() {
    if (running) return
    setRunning(true)
    setRunStep(-1)
    await sleep(300)
    for (let i = 0; i <= 2; i++) { setRunStep(i); await sleep(700) }
    setRunning(false)
  }

  const drillDone = runStep === 2 && !running

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
      <Card size="small" title="五道检查按顺序走，任一道不过即停">
        <Steps
          size="small"
          items={GATES.map((t, i) => ({ title: i === 2 ? <span>{t} 🛡</span> : t }))}
        />
      </Card>

      <Row gutter={16} align="top" style={{ marginTop: 12 }}>
        <Col span={15}>
          <Card size="small" title="发布记录（点开看五道明细）">
            <Collapse
              items={RECORDS.map(r => ({
                key: r.key,
                label: <span>{r.title} <Tag color={r.statusColor}>{r.status}</Tag></span>,
                children: (
                  <Table size="small" columns={detailColumns} pagination={false}
                    dataSource={r.detail.map((d, i) => ({ key: i, gate: d[0], result: d[1], why: d[2] }))} />
                )
              }))}
            />
            <div style={{ fontSize: 12, color: '#8a94a3', marginTop: 12 }}>
              拦下来的发布不消失——整包退回<a href="#/C2">修改审批台</a>，改法提示附在提案上；改完重新提交、五道重过。
            </div>
          </Card>
        </Col>
        <Col span={9}>
          <Card size="small" title="现场演练：被第 3 道拦下">
            <div style={{ marginBottom: 8 }}>演练变更：<b>《某查询模板修订》</b></div>
            <Button type="primary" block loading={running} onClick={runDrill}>模拟提交这次发布</Button>
            <div style={{ fontSize: 12, color: '#8a94a3', margin: '8px 0 12px' }}>可反复点，每次从头重跑</div>
            {runStep < 0 && !running ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="尚未演练——点「模拟提交这次发布」，看五道检查怎么走、在哪停。" />
            ) : (
              <>
                <Steps
                  size="small"
                  direction="vertical"
                  current={Math.max(runStep, 0)}
                  status={runStep === 2 ? 'error' : 'process'}
                  items={GATE_SHORT.map((t, i) => ({
                    title: t,
                    description: i < runStep ? '通过'
                      : i === 2 && runStep === 2 ? '拦下——查询安全踩线'
                      : i > runStep && runStep === 2 ? '未检查（短路不查）'
                      : '检查中…'
                  }))}
                />
                {drillDone && (
                  <>
                    <Alert style={{ marginTop: 12 }} type="error" showIcon message={REASON} />
                    <Alert style={{ marginTop: 8 }} type="warning" showIcon message={CONCLUSION} />
                  </>
                )}
              </>
            )}
          </Card>
          <Card size="small" style={{ marginTop: 12, background: '#f6f8fa' }} title="第5道和考核的关系">
            第五道用「考核与质量」区同一套考核题集全量重跑：成绩不掉才放行——改口径不能把原来答对的题改错（<a href="#/E1">答题考核</a>）。
          </Card>
        </Col>
      </Row>
    </div>
  )
}

