import { useState } from 'react'
import { Button, Card, Col, Row, Table, Tabs, Tag, Typography } from 'antd'

export const F1_GUIDE = [
  '三个页签从左到右点一遍——外部 AI 的三种用法：直接调、反问、给任务号。',
  '看"直接调工具"的清单——就 3 个查询工具，一件不多、一件不少。',
  '看"参数不够时反问"——平台缺参数会问回来，不瞎猜。',
  '看"长任务给任务号"——受理即回 task-7c2d，凭号取结果。',
  '点"看一张取货凭证长什么样"——大结果只给几行预览＋下载直链。',
  '点"打开平台名片"——真跳转到 agent-card.html。',
  '看右栏权限卡——外部 AI 和内部用户同一套安检；改定义只能提建议＋人工审批。',
  '看底部对外配置——三个映射位与放行清单一眼对齐。'
]
export const F1_TRACE = 'F8 工具体系 · F27 大结果句柄 · F28 对外接口 · F49 内外双通道 · F54 行业复用 · 协议化暴露 · m16/m4/m15/m7 卡'

window.__guides = Object.assign(window.__guides || {}, { F1: F1_GUIDE })
window.__traces = Object.assign(window.__traces || {}, { F1: F1_TRACE })

const TOOL_COLUMNS = [
  { title: '对外工具清单', dataIndex: 'tool', width: 140 },
  { title: '说明', dataIndex: 'desc' }
]
const TOOLS = [
  { key: '1', tool: '按井查产量', desc: '按井 / 区块 / 月查产油产液（审定口径）' },
  { key: '2', tool: '查指标口径', desc: '问"递减率怎么算的"——返回定义、公式、负责人、版本' },
  { key: '3', tool: '查井档案', desc: '井的基本档案、状态、隶属区块' }
]

const REUSE_COLUMNS = [
  { title: '层', dataIndex: 'layer', width: 120 },
  { title: '是什么', dataIndex: 'what' },
  { title: '换一家油田能带走多少', dataIndex: 'take', width: 260 }
]
const REUSE = [
  { key: '1', layer: '领域对象层', what: '井 / 区块 / 指标 / 受效关系这些对象与口径的定义方式', take: <span>复用 90% 以上</span> },
  { key: '2', layer: '映射层', what: '客户源系统的表怎么对到对象——逐张表的对应规则库', take: <span>复用 70% 以上——<b>护城河所在</b></span> },
  { key: '3', layer: '客户定制层', what: '各家的特殊报表与个性化流程', take: '逐客重做' }
]

const MAP_COLUMNS = [
  { title: '映射位', dataIndex: 'slot', width: 160 },
  { title: '平台内对应', dataIndex: 'maps' }
]
const MAPPING = [
  { key: '1', slot: '调工具（查）', maps: '内部工具注册表按可见性过滤后的清单' },
  { key: '2', slot: '反问（缺参）', maps: '平台既有缺参澄清问答' },
  { key: '3', slot: '任务号（长活）', maps: '异步任务队列：受理即回＋凭号取结果' }
]

const VOUCHER_PREVIEW = `well_id | prod_date  | oil_output(吨) | liquid_output(方) | water_cut(%)
N-02    | 2026-09-14 | 48.60          | 165.30            | 70.6
N-11    | 2026-09-14 | 12.40（单位误录，质检问题单在办） | 96.00 | 87.1
……（预览只放样本行，完整内容凭下载直链自取）`

export default function F1Expose() {
  const [voucherOpen, setVoucherOpen] = useState(false)

  const usagePanel = (
    <div>
      <div className="code-block">{`请求：{ 工具："按井查产量", 参数：{ 井号："N-02", 月份："2026-08" } }
返回：{ 产油量：1,4xx 吨，口径：产量完成率口径 v3，出处：汇总层日报表 · 质检通过 }`}</div>
      <Table
        size="small" style={{ marginTop: 12 }}
        columns={TOOL_COLUMNS} dataSource={TOOLS} pagination={false}
      />
      <div style={{ fontSize: 12, color: '#8a94a3', marginTop: 8 }}>
        对外清单＝内部工具注册表按可见性过滤的结果：内部能用什么，外部就见什么，一件不多、一件不少——和内部用户同权同闸。
      </div>
    </div>
  )

  const askBackPanel = (
    <div>
      <div className="code-block">{`对方：查一下上个月的产量
平台：缺一个必要参数——你要哪个区块？（渤南 / 渤中 / 渤西）
对方：渤中
平台：好，渤中 2026 年 8 月产油 x,xxx 吨（口径版本 v3 · 出处见附）`}</div>
      <div style={{ fontSize: 12, color: '#8a94a3', marginTop: 8 }}>
        缺参数就走"反问"，不做默认猜数——复用平台对内部用户同款的澄清问答。
      </div>
    </div>
  )

  const taskPanel = (
    <div>
      <div className="code-block">{`对方：把渤南区块月度产量做成汇报材料
平台：已受理，任务号 task-7c2d。完成后可凭号取结果（也可订阅完成通知）。
（稍后）对方：task-7c2d 好了吗？
平台：好了 → 取货凭证见下（大结果不给正文，凭凭证自取）。`}</div>
      <div style={{ fontSize: 12, color: '#8a94a3', marginTop: 8 }}>
        与内部"做汇报"走同一条异步任务链：受理即回＋任务号＋完成可查。
      </div>
    </div>
  )

  return (
    <div>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
        平台的用户不再只有人——上级单位、合作方的智能助手也能用它查数、查口径；这一页管三件事：对方怎么调（三种用法）、大结果怎么给（取货凭证不塞正文）、权限怎么不松（内外同一套安检），并提供平台名片与对外配置登记。
      </Typography.Paragraph>

      <Row gutter={16} align="top">
        <Col span={16}>
          <Card title="① 外部智能助手的三种用法" size="small">
            <Tabs
              defaultActiveKey="tool"
              items={[
                { key: 'tool', label: '直接调工具', children: usagePanel },
                { key: 'ask', label: '参数不够时反问', children: askBackPanel },
                { key: 'task', label: '长任务给任务号', children: taskPanel }
              ]}
            />
          </Card>

          <Card title={'② 大结果给"取货凭证"，不给正文（不撑爆对方）'} size="small" style={{ marginTop: 16 }}>
            对方要"全部在产井一整年的日产量明细"——几万行数据如果原样塞进对话，对方根本装不下。
            平台的做法：<b>大结果落成生成文件，只发一张取货凭证</b>＝几行预览＋一条下载直链，内容由对方凭凭证自取。
            <div style={{ marginTop: 12 }}>
              <Button onClick={() => setVoucherOpen(v => !v)}>看一张取货凭证长什么样</Button>
            </div>
            {voucherOpen && (
              <Card size="small" style={{ marginTop: 12, borderColor: '#91caff' }} title="取货凭证（生成文件 art-9f2c7）">
                <div>内容：在产井 2025-09 ~ 2026-09 日产量明细（约 43,800 行 · 约 1.1 MB）</div>
                <div className="code-block" style={{ marginTop: 8 }}>{VOUCHER_PREVIEW}</div>
                <div style={{ fontSize: 12, color: '#8a94a3', marginTop: 8 }}>
                  下载直链：/files/art-9f2c7?token=…（7 天有效）
                </div>
              </Card>
            )}
          </Card>

          <Card title="③ 行业化复用：这套东西搬去别的油田，什么能带走？" size="small" style={{ marginTop: 16 }}>
            <Table size="small" columns={REUSE_COLUMNS} dataSource={REUSE} pagination={false} />
            <div style={{ fontSize: 12, color: '#8a94a3', marginTop: 8 }}>
              核心论断："护城河不是对象清单，而是源系统→对象的对应规则库"；落地要配前置部署工程师（懂业务的人判断"200 列宽表拆成哪几个对象"），是行内陪跑不是替代决策的架构师。
            </div>
          </Card>
        </Col>

        <Col span={8}>
          <Card title="④ 内外同一套权限——外部 AI 不能绕安检" size="small">
            <Typography.Paragraph style={{ marginBottom: 10 }}>
              外部智能助手走的门，和内部用户是<b>同一扇</b>：查询安全检查一道不少——只放行查看类语句、只认白名单里的表、按对方身份过滤数据行、强制限量。<b>外部 AI 不能绕安检、不能多看一行。</b>
            </Typography.Paragraph>
            <Typography.Paragraph style={{ marginBottom: 10 }}>
              "改定义"是另一扇门：外部对口径/术语只能<b>提修改建议＋人工审批</b>，而那条通道根本碰不到数据；日常这扇门能读、能执行动作，但改不了任何定义。
            </Typography.Paragraph>
            <Typography.Paragraph style={{ marginBottom: 0 }}>
              <b>例：</b>上级单位的 AI 系统问"渤海油田本月递减率"——它读到的是审定口径的数，不是原始表。
            </Typography.Paragraph>
          </Card>

          <Card title="⑤ 平台名片（给别的平台看的自我介绍）" size="small" style={{ marginTop: 16 }}>
            我会什么、怎么连我、要什么认证——都写在这一页名片上，别的平台读它就知道怎么接入。
            <div style={{ marginTop: 12 }}>
              <a href="../agent-card.html">打开平台名片（agent-card.html）</a>
            </div>
          </Card>
        </Col>
      </Row>

      <Card title="对外配置" size="small" style={{ marginTop: 16 }}>
        <Row gutter={16}>
          <Col span={14}>
            <Table size="small" columns={MAP_COLUMNS} dataSource={MAPPING} pagination={false} />
          </Col>
          <Col span={10}>
            <Card size="small" style={{ background: '#f6f8fa', height: '100%' }}>
              <b>对外放行清单：</b>查询类工具（查产量 / 查口径 / 查井档案）放行；写操作与外发类不在对外清单——写操作内部都要人工点批准，对外更不开放。
              <div style={{ fontSize: 12, color: '#8a94a3', marginTop: 8 }}>
                <Tag>关联</Tag>查询安检规则在 D3 安全与权限设置里配。
              </div>
            </Card>
          </Col>
        </Row>
      </Card>
    </div>
  )
}
