import { useState } from 'react'
import { Alert, Button, Card, Col, Collapse, Row, Select, Spin, Tag } from 'antd'

window.__guides = Object.assign(window.__guides || {}, {
  B2: [
    '在"选报告"下拉切一份报告——下面的片段列表整组换数据。',
    '点任一片段的"命中句"——展开它所在的完整上下文段。',
    '找"图片说明块"——看没有文字的图怎么也能被检索命中。',
    '点"看看模型原始输出"——对不上的引用号 c99 被直接删除、不渲染。',
    '留意每条片段顶部的来源标签——报告名＋井号＋章节路径三件套。'
  ]
})
window.__traces = Object.assign(window.__traces || {}, {
  B2: 'F6 RAG 管道 · F30 大小段配合 · F31 出处标签 · F33 引用编号 · F36 图片说明块 · m6/m14 卡'
})

const TYPE_COLORS = {
  原文块: 'blue',
  图片说明块: 'purple',
  图片文字块: 'cyan',
  摘要块: 'green',
  问题块: 'orange'
}

const REPORTS = {
  r1: {
    label: '《N-02 井完井报告（英文 · 200 页）》 · 完井报告库',
    chunks: [
      {
        type: '原文块',
        src: '《N-02 井完井报告（英文 · 200 页）》 · 井 N-02 · 章节 01 井基本情况 ＞ 1.2 投产信息',
        hit: 'N-02（渤中28-1-N2）于 2019-06-15 投产。',
        ctx: '1.2 投产信息：N-02 井位于渤南区块、CEP-A 平台；井别采油（EW）；2019-06-15 投产；截至本期状态：生产中。'
      },
      {
        type: '图片说明块',
        src: '《N-02 井完井报告（英文 · 200 页）》 · 井 N-02 · 章节 03 图件 ＞ 图 3-7',
        hit: '图 3-7 岩性柱状图：按深度展示该井段岩性分布（图内无文字，本说明为系统自动生成）。',
        ctx: '3.2 岩性：见图 3-7 岩性柱状图。（命中图片说明块后，回读它所在章节的正文）'
      },
      {
        type: '图片文字块',
        src: '《N-02 井完井报告（英文 · 200 页）》 · 井 N-02 · 章节 03 图件 ＞ 图 3-7',
        hit: '图 3-7 图内文字（系统识别）：砂岩 / 泥岩 / 灰岩（图例）。',
        ctx: '图 3-7 岩性柱状图（图片本体不进索引，文字与说明进）。'
      },
      {
        type: '摘要块',
        src: '《N-02 井完井报告（英文 · 200 页）》 · 井 N-02 · 全文档',
        hit: '本报告为 N-02 井（渤中28-1-N2）完井报告：位于渤南区块 CEP-A 平台，井别采油，2019-06-15 投产，状态生产中。',
        ctx: '全文档摘要 ×1，入库时自动生成。'
      },
      {
        type: '问题块',
        src: '《N-02 井完井报告（英文 · 200 页）》 · 井 N-02 · 全文档',
        hit: '本报告可能被问：N-02 井的完井方式是什么？',
        ctx: '每 20 段自动生成一批"可能被问的问题"块。'
      }
    ]
  },
  r2: {
    label: '《渤中28-1 区块月度生产月报（2026-08）》 · 生产月报库',
    chunks: [
      {
        type: '原文块',
        src: '《渤中28-1 区块月度生产月报（2026-08）》 · 井 N-11 · 章节 02 检修与停产 ＞ 2.1 检泵',
        hit: 'N-11 井检泵：2026-08-28 → 2026-09-06，影响产量约 210 吨。',
        ctx: '2.1 检泵：N-11 井检泵作业，起止 2026-08-28 → 2026-09-06（跨月），影响产量约 210 吨；该检修为事后补录，批次号 20260911-T3（T-3 补录）。（设定书 §A.4）'
      },
      {
        type: '原文块',
        src: '《渤中28-1 区块月度生产月报（2026-08）》 · 井 N-11 · 章节 04 计量与折算 ＞ 4.2 单位换算',
        hit: '渤中区块原油密度按 0.89 t/m³ 折算，吨↔方换算＝质量÷密度。',
        ctx: '4.2 单位换算：原油密度按区块——渤南 0.86 / 渤中 0.89 / 渤西 0.91（t/m³）。本月 N-11 一行日产油误录单位"方"（12.40 方），已按密度折算为约 11.04 吨。（设定书 §2.2 / §A.2）'
      },
      {
        type: '原文块',
        src: '《渤中28-1 区块月度生产月报（2026-08）》 · 井 N-11 · 章节 01 井基本情况',
        hit: 'N-11 井 2026-08-30 起检泵停产。',
        ctx: '01 井基本情况：N-11（EW 采油），2020-02-20 投产，CEP-B 平台，渤中区块；状态：停产（2026-08-30 起检泵）。台账存在状态滞后特征——"已停仍挂生产中"的行要靠质检规则抓（设定书 §A.1）。'
      }
    ]
  }
}

export default function B2() {
  const [report, setReport] = useState('r1')
  const [loading, setLoading] = useState(false)
  const [showRaw, setShowRaw] = useState(false)

  function pickReport(key) {
    if (key === report) return
    setLoading(true)
    setTimeout(() => { setReport(key); setLoading(false) }, 350)
  }

  const data = REPORTS[report]

  return (
    <div>
      <Row gutter={16}>
        <Col span={14}>
          <Alert type="warning" showIcon style={{ height: '100%' }}
            message="铁律：完整段落永远不直接出现在搜索结果里。搜索命中的是小段；你点开命中句，才把它所在的完整上下文段带出来。" />
        </Col>
        <Col span={10}>
          <Card size="small" style={{ background: '#f5f5f5', height: '100%' }}>
            <span style={{ fontSize: 13 }}>出处标签：每个片段都带"报告名＋井号＋章节路径"三件套，AI 回答引用时原样带给用户，一眼知道出处在哪。</span>
          </Card>
        </Col>
      </Row>

      <Card title="按报告浏览片段" size="small" style={{ marginTop: 16 }}
        extra={
          <Select style={{ width: 420 }} value={report} onChange={pickReport}
            options={Object.entries(REPORTS).map(([k, v]) => ({ value: k, label: v.label }))} />
        }>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 32 }}><Spin tip="片段加载中…" /></div>
        ) : (
          <Collapse
            items={data.chunks.map((c, i) => ({
              key: i,
              label: (
                <div>
                  <div style={{ fontSize: 12, color: '#8a94a3' }}>
                    <Tag color={TYPE_COLORS[c.type]}>{c.type}</Tag>{c.src}
                  </div>
                  <b style={{ fontSize: 13 }}>命中句：{c.hit}</b>
                </div>
              ),
              children: (
                <div style={{ fontSize: 13 }}>
                  <b>完整上下文段：</b>{c.ctx}
                </div>
              )
            }))}
          />
        )}
      </Card>

      <Card title="看不懂的引用号？直接删掉，不显示" size="small" style={{ marginTop: 16 }}>
        <div style={{ fontSize: 13 }}>
          <b>展示给你的回答：</b>……该井 2019-06-15 投产 <code>[c2]</code>。
        </div>
        <Button style={{ marginTop: 12 }} onClick={() => setShowRaw(v => !v)}>
          看看模型原始输出（含一个对不上的 c99）
        </Button>
        {showRaw && (
          <div className="code-block" style={{ marginTop: 12 }}>
            模型原始输出：……该井 2019-06-15 投产 `[c2]` `[c99]`{'\n'}
            →　「c99」在引用对照表里不存在（含报告被投毒、伪造引用的情形），直接删除、不渲染——宁缺不假。
          </div>
        )}
      </Card>
    </div>
  )
}
