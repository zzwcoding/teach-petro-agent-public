import { useEffect, useState } from 'react'
import { Button, Card, Empty, Input, Select, Skeleton, Space, Table, Tag } from 'antd'

window.__guides = Object.assign(window.__guides || {}, {
  D4: [
    '看数据库下拉——开发库 PostgreSQL、生产库金仓，一套代码两个库都能跑。',
    '把下拉切到"生产库 · 金仓"——连接串自动换、方言差异提示换 4 条（注意第一条：兼容模式建库时定死）。',
    '看 Redis 卡——一台缓存干四件事，绿标已连接。',
    '看 MinIO 卡——两个桶，上传下载走直链、最长 7 天有效。',
    '看部署信息——Docker、麒麟 OS、离线镜像交付。',
    '看国密表——SM4 管加密、SM3 管留痕、密钥不对拒绝启动。'
  ]
})
window.__traces = Object.assign(window.__traces || {}, {
  D4: 'F3 持久化 · F4 缓存队列 · F5 对象存储 · F11 国产化 · m3/m4/m5/m11'
})

const ENVS = {
  dev: {
    label: '开发库 · PostgreSQL',
    cardTitle: '开发库 · PostgreSQL',
    type: '数据库类型：PostgreSQL（开源数据库）',
    driver: '连接驱动：社区异步驱动（asyncpg）',
    foot: '开发环境日常用；考核跑批、联调都在这个库。',
    conn: 'postgresql+asyncpg://petro:******@db-dev:5432/petro',
    dialectTitle: '方言差异提示（当前：PostgreSQL）',
    dialect: [
      '一套业务代码两个库都能跑——切换只改上面这一条连接串；',
      '安全检查对语句按 PostgreSQL 口音解析。'
    ]
  },
  prod: {
    label: '生产库 · 金仓',
    cardTitle: '生产库 · 金仓 KingbaseES',
    type: '数据库类型：金仓 KingbaseES（国产数据库）',
    driver: '连接驱动：金仓官方驱动 ksycopg2 异步路径（主机 kdb-prod · 端口 54321）',
    foot: '国产化生产环境；同一套业务代码、同一套用例，两个库都要跑通才上线。',
    conn: 'kingbase+ksycopg2://petro:******@kdb-prod:54321/petro',
    dialectTitle: '方言差异提示（当前：金仓）',
    dialect: [
      '兼容模式在建库（初始化）时一次性固化——选错要重建库，切库前先确认；',
      '没有官方的社区异步驱动，改走金仓官方驱动 ksycopg2 异步路径；',
      '安全检查对金仓语句按"近似 PostgreSQL 口音"解析，解析不过不给执行、附改法提示；',
      '数据库工具层用金仓官方方言包对接。'
    ]
  }
}

const DEPLOY_ROWS = [
  { key: 1, item: '容器化', val: 'Docker（多阶段构建；容器内不用最高权限账号运行；健康检查通过才启动服务）' },
  { key: 2, item: '操作系统', val: '麒麟 OS V10（RHEL8 兼容系）——信创环境可跑' },
  { key: 3, item: '离线交付', val: '打包成镜像文件，拷进内网后装载（docker save / load）——不通外网也能交付' }
]

export default function D4System() {
  const [ready, setReady] = useState(false)
  const [env, setEnv] = useState('dev')
  const [conn, setConn] = useState(ENVS.dev.conn)
  const [saved, setSaved] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 500)
    return () => clearTimeout(t)
  }, [])

  const cur = ENVS[env]

  return (
    <Space size={16} align="start" style={{ display: 'flex' }}>
      <div style={{ flex: '0 0 55%' }}>
        <Card title="① 数据库环境" size="small" style={{ marginBottom: 16 }}>
          <Space style={{ marginBottom: 12 }}>
            <Select
              style={{ width: 220 }} value={env} allowClear
              placeholder="选择数据库环境"
              options={Object.entries(ENVS).map(([k, v]) => ({ value: k, label: v.label }))}
              onChange={k => { setEnv(k || null); setConn(k ? ENVS[k].conn : '') }}
            />
          </Space>
          {env ? (
            <>
              <Card size="small" style={{ background: '#f6ffed' }}>
                <Space><b>{cur.cardTitle}</b><Tag color="green">已连接</Tag></Space>
                <div style={{ fontSize: 13, marginTop: 6 }}>{cur.type}</div>
                <div style={{ fontSize: 13 }}>{cur.driver}</div>
                <div style={{ fontSize: 12, color: '#8a94a3', marginTop: 6 }}>{cur.foot}</div>
              </Card>
              <Card size="small" title={cur.dialectTitle} style={{ marginTop: 12 }}>
                {cur.dialect.map((d, i) => <div key={i} style={{ fontSize: 13, padding: '2px 0' }}>{i + 1}. {d}</div>)}
              </Card>
              <div style={{ fontSize: 12, margin: '12px 0 4px' }}>连接串</div>
              <Space.Compact style={{ width: '100%' }}>
                <Input value={conn} onChange={e => setConn(e.target.value)} />
                <Button type="primary" onClick={() => setSaved('已保存。')}>保存连接</Button>
              </Space.Compact>
              {saved && <div style={{ fontSize: 12, color: '#389e0d', marginTop: 6 }}>{saved}</div>}
            </>
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="选择数据库环境后，这里显示连接状态与方言提示。"
            />
          )}
        </Card>

        <Card title="④ 部署信息" size="small" style={{ marginBottom: 16 }}>
          {ready ? (
            <Table
              size="small" pagination={false}
              columns={[{ title: '项目', dataIndex: 'item', width: 110 }, { title: '说明', dataIndex: 'val' }]}
              dataSource={DEPLOY_ROWS}
            />
          ) : <Skeleton active paragraph={{ rows: 2 }} />}
        </Card>

        <Card title="⑤ 国密算法用在哪" size="small">
          <Table
            size="small" pagination={false}
            columns={[{ title: '算法', dataIndex: 'a', width: 130 }, { title: '用在哪', dataIndex: 'u' }]}
            dataSource={[
              { key: 1, a: 'SM4（加密）', u: <>敏感字段加密——如用户手机号，库里只存密文（→ <a href="#/D3">安全与权限 · 加密清单</a>）</> },
              { key: 2, a: 'SM3（指纹）', u: '接口报文留痕——日志只存报文"指纹"，不存正文' },
              { key: 3, a: '启动自检', u: '密钥没配或长度不对，平台拒绝启动——不允许带病运行' }
            ]}
          />
        </Card>
      </div>

      <div style={{ flex: 1 }}>
        <Card title="为什么要能切" size="small" style={{ marginBottom: 16, background: '#f6f8fa' }}>
          <div style={{ fontSize: 13 }}>
            开发用开源库，生产用国产库——同一套代码双库跑通，是国产化交付的硬要求。
          </div>
        </Card>

        <Card
          size="small" style={{ marginBottom: 16 }} title={<Space>Redis 缓存<Tag color="green">已连接</Tag></Space>}
        >
          <div style={{ fontSize: 13 }}>一台缓存干四件事：</div>
          <Space wrap style={{ marginTop: 8 }}>
            <Tag color="blue">会话上下文缓存</Tag>
            <Tag color="blue">调用记账计数</Tag>
            <Tag color="blue">断线续传的消息缓冲</Tag>
            <Tag color="blue">后台任务队列</Tag>
          </Space>
        </Card>

        <Card
          size="small" title={<Space>MinIO 对象存储<Tag color="green">已连接</Tag></Space>}
        >
          <div style={{ fontSize: 13 }}>两个桶：</div>
          <Space wrap style={{ marginTop: 8 }}>
            <Tag color="blue">reports · 报告原文</Tag>
            <Tag color="blue">artifacts · 生成文件</Tag>
          </Space>
          <div style={{ fontSize: 12, color: '#8a94a3', marginTop: 8 }}>
            上传、下载都走直链，文件流不经过平台转发；直链默认最长 7 天有效。
          </div>
        </Card>
      </div>
    </Space>
  )
}
