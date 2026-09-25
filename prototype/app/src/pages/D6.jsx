import { useEffect, useState } from 'react'
import { Card, Collapse, Empty, Skeleton, Space, Table, Tabs, Tag } from 'antd'

window.__guides = Object.assign(window.__guides || {}, {
  D6: [
    '看顶部 8 个源标签——所有数据先原样入库，一个字不改。',
    '切"三条清洗路径"——规整表格自动认列、嵌套数据炸开、扫描件走人工复核。',
    '重点看路径三——人工复核是必选步，不许跳。',
    '切"三层加工"——原始层 8 张表、清洗层 6 条规则、汇总层星型大表。',
    '在汇总层看星型模型——事实表一行＝一口井×一天，两边挂井维度和日期维度。',
    '点"井档案 well_info"表名——展开映射四件套，看一行数据怎么变成"井"对象。',
    '看右下"两个坑"——追加模式新旧并存、双源时间差，各有一条应对口径。'
  ]
})
window.__traces = Object.assign(window.__traces || {}, {
  D6: 'F53 接入落地链路 · F17 维度建模 · m20 数据建模与转换分层 / m22 知识管线枢纽'
})

const SOURCES = ['生产日报（A/B 班手抄汇总）', '注水日报', '检修台账', '措施台账', '化验单', '设备状态', '月度结算', '井档案']

const PATH_TABS = [
  {
    key: 'p1', label: '路径一 · 规整表格自动识别',
    children: (
      <PathPanel
        when="Excel / CSV 这类列清楚的表格。"
        how="平台自动认出每列是什么（井号/日期/产油量…）并挂上单位"
        eg="日产计量日报（设定书 §A.2）"
        guard={'单位混写（个别行"吨"误录成"方"）在这里按区块密度统一折算（设定书 §4 规则 3）'}
      />
    )
  },
  {
    key: 'p2', label: '路径二 · 嵌套数据炸开',
    children: (
      <PathPanel
        when="一个格子里塞了多条记录的嵌套数据（JSON）。"
        how={'把嵌套摊平：一张大记录拆成两张小表、用编号互相关联（演示样例：一张作业工单含两个作业段 → 拆成"工单表＋作业段表"）'}
        eg={<>注水日报的分层字段（P1:60,P2:40，设定书 §A.3）同属"一格多值"，分层口径不一、偶为累计值——同类问题在<a href="#/E2">数据质量台</a>登记规则。</>}
        guard="拆开后编号必须对得上，回查不丢行"
      />
    )
  },
  {
    key: 'p3', label: '路径三 · 扫描件识别＋人工复核',
    children: (
      <PathPanel
        when="扫描件、手抄件——机器认得出来但不敢保证全对。"
        how={<>机器识别 → 规则校验 → 按把握程度过滤 → <b>抽样人工核对</b>，拿不准的进异常队列</>}
        eg="班次手抄日报：同井同日 A/B 两班各报一行，平台不会悄悄替人决定哪行算数，走人工复核确认"
        guard={<>人工复核是<b>必选步</b>，不许跳——最容易被跳过的恰恰是这一步</>}
      />
    )
  }
]

function PathPanel({ when, how, eg, guard }) {
  return (
    <div style={{ fontSize: 13 }}>
      <div style={{ padding: '4px 0' }}><b>什么时候用：</b>{when}</div>
      <div style={{ padding: '4px 0' }}><b>怎么做：</b>{how}</div>
      <div style={{ padding: '4px 0' }}><b>油田例子（对照）：</b>{eg}</div>
      <div style={{ padding: '4px 0' }}><b>防什么错：</b>{guard}</div>
    </div>
  )
}

const RAW_ROWS = [
  { key: 1, t: '生产日报（原始）', s: 'A/B 班手抄汇总（含重复行，原样保留）' },
  { key: 2, t: '注水日报（原始）', s: '分层注水记录' },
  { key: 3, t: '检修台账（原始）', s: '检泵等检修记录（含补录批次）' },
  { key: 4, t: '措施台账（原始）', s: '压裂/酸化等措施' },
  { key: 5, t: '化验单（原始）', s: '含水/密度化验' },
  { key: 6, t: '设备状态（原始）', s: '设备状态流水' },
  { key: 7, t: '月度结算（原始）', s: '经营口径' },
  { key: 8, t: '井档案（原始）', s: '一井一行' }
]

const CLEAN_ROWS = [
  { key: 1, t: '生产日报（已去重·已统一单位）', s: '同井同日 A/B 重复行按唯一性规则处理；"吨/方"混写按区块密度折算（规则 1/3）' },
  { key: 2, t: '生产日报（值域核查）', s: '含水率 0–100、开井时长 0–24，越界标异常（规则 5）' },
  { key: 3, t: '井档案（井号已归一）', s: 'N2 / N-2 → N-02（规则 7）' },
  { key: 4, t: '设备状态（停机原因码已归一）', s: '新旧编码并存 → 映射表统一（规则 8）' },
  { key: 5, t: '检修台账（批次已标注）', s: '补录批次（如 T-3）标注水位，不静默混入当期' },
  { key: 6, t: '注水日报 / 化验单（已核对）', s: '计量与化验含水率偏差超 5 个百分点标出（规则 4）' }
]

const LAYER_TABS = [
  {
    key: 'raw', label: '原始层',
    children: (
      <LayerPanel
        into="各源系统的原样数据" out="贴上来源与批次标签的原始明细"
        guard="漏接、错接（源头丢数先在这发现）"
        cols={['本层表清单', '来自']}
        rows={RAW_ROWS.map(r => ({ key: r.key, t: r.t, s: r.s }))}
      />
    )
  },
  {
    key: 'clean', label: '清洗层',
    children: (
      <LayerPanel
        into="原始层明细" out="去重、统一单位、编码归一后的干净明细"
        guard="脏数据带病上行——错在这层拦最便宜"
        cols={['本层表清单', '在这层做了什么（设定书 §4 质量规则）']}
        rows={CLEAN_ROWS.map(r => ({ key: r.key, t: r.t, s: r.s }))}
        foot={<>发现的问题单流转（分发→认领→整改→复核→关闭）在<a href="#/E2">数据质量台</a>。</>}
      />
    )
  },
  {
    key: 'agg', label: '汇总层',
    children: (
      <div>
        <LayerPanel
          into="清洗层的干净明细" out="问数直接用的星型大表"
          guard={<>不先声明"一行是什么"就不许建模型（<b>粒度先行</b>）</>}
          cols={null} rows={null}
        />
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 8, margin: '12px 0' }}>
          <StarBox title="井维度表" note="含区块、油田层级——查「渤南」不用再连表" />
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', fontSize: 20, color: '#1677ff' }}>→</div>
          <StarBox fact title="事实表 · 日产计量" note="一行＝一口井 × 一天（统计粒度先定死）；事实数字：产油 / 产液 / 压力" />
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', fontSize: 20, color: '#1677ff' }}>←</div>
          <StarBox title="日期维度表" note="按月/季汇总的对照" />
        </div>
        <div style={{ fontSize: 12, color: '#8a94a3' }}>
          问数页的表选谁，只认汇总层就绪的大表（→ <a href="#/A1">问一问 · 问数据</a>）。
        </div>
      </div>
    )
  }
]

function LayerPanel({ into, out, guard, cols, rows, foot }) {
  return (
    <div>
      <div style={{ fontSize: 13, padding: '2px 0' }}><b>进什么：</b>{into}　<b>出什么：</b>{out}　<b>防什么错：</b>{guard}</div>
      {rows && (
        <Table
          style={{ marginTop: 8 }} size="small" pagination={false}
          columns={[{ title: cols[0], dataIndex: 't', width: 260 }, { title: cols[1], dataIndex: 's' }]}
          dataSource={rows}
        />
      )}
      {foot && <div style={{ fontSize: 12, color: '#8a94a3', marginTop: 8 }}>{foot}</div>}
    </div>
  )
}

function StarBox({ fact, title, note }) {
  return (
    <div style={{
      flex: 1, border: fact ? '2px solid #1677ff' : '1px solid #b9c2ce', borderRadius: 8,
      padding: '10px 12px', background: fact ? '#f0f7ff' : '#fff'
    }}>
      <b style={{ fontSize: 13 }}>{title}</b>
      <div style={{ fontSize: 12, color: '#8a94a3', marginTop: 4 }}>{note}</div>
    </div>
  )
}

const MAPPINGS = [
  {
    key: '1', head: <>井档案 <code>well_info</code> → 对象类型「井」</>,
    rows: [
      ['表 → 对象类型', <>井档案 → <b>井</b></>],
      ['行 → 对象', <>一行＝一口井；井号列当身份：<code>N-02</code> → 井「渤中28-1-N2」（设定书 §A.1）</>],
      ['列 → 属性', '井名 / 井别（采油·注水）/ 投产日 / 平台 / 区块 / 状态'],
      ['外键 → 关系', <>区块列 → 井 —隶属→ 区块 —隶属→ 油田（设定书 §5）</>]
    ]
  },
  {
    key: '2', head: <>措施台账 <code>well_measures</code> → 对象类型「措施」</>,
    rows: [
      ['表 → 对象类型', <>措施台账 → <b>措施</b></>],
      ['行 → 对象', '一行＝一次措施（井号＋措施次）'],
      ['列 → 属性', '措施类型（压裂/酸化/补孔/调剖）/ 施工日 / 有效期起止 / 年增油（设定书 §A.5）'],
      ['外键 → 关系', <>井号列 → 措施 —作用于→ 井（设定书 §5）</>]
    ]
  },
  {
    key: '3', head: <>化验样 <code>fluid_test</code> → 对象类型「化验样」</>,
    rows: [
      ['表 → 对象类型', <>化验样 → <b>化验样</b></>],
      ['行 → 对象', '一行＝一个样品（井号＋取样日期）'],
      ['列 → 属性', '化验含水率 / 密度 / API 度（设定书 §A.6）'],
      ['外键 → 关系', <>井号列 → 化验样 —取样自→ 井（设定书 §5）</>]
    ]
  },
  {
    key: '4', head: <>设备状态 <code>equip_status</code> → 对象类型「设备」</>,
    rows: [
      ['表 → 对象类型', <>设备状态 → <b>设备</b></>],
      ['行 → 对象', '一行＝一条设备状态记录（设备号＋时间戳）'],
      ['列 → 属性', '设备类型（电泵/螺杆泵/加热炉）/ 负载 / 电流 / 停机原因码（设定书 §A.7）'],
      ['外键 → 关系', '经井号列挂到对应井对象']
    ]
  }
]

export default function D6Pipeline() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 500)
    return () => clearTimeout(t)
  }, [])

  return (
    <div>
      <Card title="① 接入原则：原样入库，先不改一个字" size="small" style={{ marginBottom: 16 }}>
        <Space size={16} align="start" style={{ display: 'flex' }}>
          <div style={{ flex: 1 }}>
            <Space wrap size={[8, 8]}>
              {SOURCES.map(s => <Tag key={s} color="blue">{s}</Tag>)}
            </Space>
            <div style={{ fontSize: 12, color: '#8a94a3', marginTop: 8 }}>设定书 §2 生产域 8 表</div>
          </div>
          <Card size="small" style={{ width: 320, background: '#f6f8fa' }}>
            <b>原样入库换来什么</b>
            <div style={{ fontSize: 13, marginTop: 6 }}>
              端到端血缘：报表上一个数对不上，能一路指回<b>原始文件的某一行</b>——月底对账不扯皮。
            </div>
          </Card>
        </Space>
      </Card>

      <Card title="② 三条清洗路径" size="small" style={{ marginBottom: 16 }}>
        <Tabs defaultActiveKey="p1" items={PATH_TABS} />
      </Card>

      <Card title="③ 三层加工视图" size="small" style={{ marginBottom: 16 }}>
        {ready ? <Tabs defaultActiveKey="raw" items={LAYER_TABS} /> : <Skeleton active paragraph={{ rows: 5 }} />}
      </Card>

      <Card title="④ 表 → 业务对象映射" size="small" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: '#8a94a3', marginBottom: 8 }}>
          映射四件套：表→对象类型 / 行→对象 / 列→属性 / 外键→关系。一种对象类型只对一张表——几十列的大宽表要先拆小再映射。
        </div>
        <Collapse
          items={MAPPINGS.map(m => ({
            key: m.key, label: m.head,
            children: (
              <Table
                size="small" pagination={false}
                columns={[{ title: '映射项', dataIndex: 'k', width: 130 }, { title: '内容', dataIndex: 'v' }]}
                dataSource={m.rows.map(([k, v], i) => ({ key: i, k, v }))}
              />
            )
          }))}
        />
        <Empty
          style={{ marginTop: 16 }} image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <span style={{ fontSize: 12 }}>
              其余表（日产计量 / 注水日报 / 检修台账 / 月度结算）目前只进加工统计层、未注册为业务对象——如实标注，不硬造映射（对象清单＝设定书 §5：井/井筒/区块/油田/平台/设备/措施/化验样/受效关系/配注层）。
            </span>
          }
        />
      </Card>

      <Card title="⑤ 增量更新与已知风险" size="small">
        <div style={{ fontSize: 13 }}>每天只加工新到的行；对象档案只更新变化的部分，不整表重刷。两个已知的坑：</div>
        <div style={{ fontSize: 13, padding: '6px 0' }}>
          <b>坑一 · 追加模式新旧并存：</b>数据只增不改的接入方式下，同一口井改了状态会出现新旧两条记录并存——按批次取最新，不混用；
        </div>
        <div style={{ fontSize: 13, padding: '6px 0' }}>
          <b>坑二 · 双源时间差：</b>月度结算与井口日报到账时间不同，对不上先查到账批次，不先怀疑数错了。
        </div>
      </Card>
    </div>
  )
}
