import { Badge, Card, Col, List, Row, Statistic, Tag, Typography } from 'antd'
import {
  AlertOutlined, AuditOutlined, DatabaseOutlined, FileSearchOutlined,
  MessageOutlined, ProfileOutlined, ToolOutlined
} from '@ant-design/icons'

window.__guides = Object.assign(window.__guides || {}, {
  INDEX: [
    '看顶部四张统计卡——平台今天的家底。',
    '点"问一问"卡片——进入统一提问入口。',
    '看下边待办列表——三条待办都可点进对应页面处理。',
    '顶栏切换用户——看看不同角色看到的菜单有什么不同。'
  ]
})
window.__traces = Object.assign(window.__traces || {}, {
  INDEX: '总导航 · F48 治理约束 · DESIGN.md §1 G0 行'
})

const QUICK = [
  { key: 'A1', title: '问一问', desc: '问报告 / 问数据 / 做汇报', icon: <MessageOutlined />, color: '#1677ff' },
  { key: 'A2', title: '井档案', desc: '一口井一页看全', icon: <ProfileOutlined />, color: '#0b7a5c' },
  { key: 'B1', title: '报告库', desc: '入库 / 索引 / 出处', icon: <FileSearchOutlined />, color: '#7c4dff' },
  { key: 'E2', title: '数据质量台', desc: '质检任务 / 问题单', icon: <AlertOutlined />, color: '#d97706' }
]

const TODOS = [
  { tag: '问题单', color: 'orange', text: '质检问题单 3 项待认领（最新 #QT-20260915-01）', link: '#/E2' },
  { tag: '待审批', color: 'blue', text: '修改提案 2 条等待审批（含「递减增油」口径争议）', link: '#/C2' },
  { tag: '口径', color: 'red', text: '「有效产量」一词两译待确认默认口径', link: '#/C4' }
]

export default function Index() {
  return (
    <div>
      <Typography.Title level={4} style={{ marginTop: 0 }}>平台总览</Typography.Title>
      <Typography.Paragraph type="secondary">渤海油田分公司 · 3 作业区 · 120 口在产井</Typography.Paragraph>

      <Row gutter={16}>
        {[
          ['采油井', 86, <ToolOutlined />], ['注水井', 34, <DatabaseOutlined />],
          ['在库报告', 1247, <FileSearchOutlined />], ['本月待办', 3, <AuditOutlined />]
        ].map(([title, value, icon]) => (
          <Col span={6} key={title}>
            <Card><Statistic title={title} value={value} prefix={icon} /></Card>
          </Col>
        ))}
      </Row>

      <Row gutter={16} style={{ marginTop: 16 }}>
        {QUICK.map(q => (
          <Col span={6} key={q.key}>
            <Card hoverable onClick={() => { location.hash = '/' + q.key }}>
              <Card.Meta avatar={<span style={{ fontSize: 22, color: q.color }}>{q.icon}</span>}
                title={q.title} description={q.desc} />
            </Card>
          </Col>
        ))}
      </Row>

      <Card title="待办" style={{ marginTop: 16 }} extra={<Badge count={3} />}>
        <List
          dataSource={TODOS}
          renderItem={t => (
            <List.Item>
              <List.Item.Meta
                avatar={<Tag color={t.color}>{t.tag}</Tag>}
                title={<a href={t.link}>{t.text}</a>}
              />
            </List.Item>
          )}
        />
      </Card>
    </div>
  )
}
