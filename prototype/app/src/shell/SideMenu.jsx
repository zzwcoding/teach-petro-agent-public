import { Layout, Menu, Typography } from 'antd'

export default function SideMenu({ role, current, onNavigate }) {
  const groups = window.__menuForRole(role)
  const items = groups.map(g => ({
    type: 'group',
    label: g.group,
    children: g.items.map(it => ({ key: it.key, label: it.label }))
  }))
  return (
    <Layout.Sider width={216} theme="dark">
      <div style={{ padding: '18px 16px 14px', borderBottom: '1px solid rgba(255,255,255,.12)' }}>
        <Typography.Text strong style={{ color: '#fff', fontSize: 16 }}>Petro-Agent</Typography.Text>
        <div style={{ fontSize: 11, color: '#8fa8c8' }}>油田智能平台</div>
      </div>
      <Menu
        theme="dark"
        mode="inline"
        selectedKeys={[current]}
        style={{ background: 'transparent', borderInlineEnd: 'none', padding: '8px' }}
        items={items}
        onClick={e => onNavigate(e.key)}
      />
    </Layout.Sider>
  )
}
