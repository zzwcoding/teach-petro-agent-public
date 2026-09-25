import { Suspense, lazy, useEffect, useState } from 'react'
import { Layout, Skeleton } from 'antd'
import { ROLES, menuForRole } from '../roles.js'
import SideMenu from './SideMenu.jsx'
import HeaderBar from './HeaderBar.jsx'
import GuideModal from './GuideModal.jsx'
import TraceBar, { DEV } from './TraceBar.jsx'
import A1Chat, { A1_GUIDE, A1_TRACE } from '../pages/A1Chat.jsx'
import Stub from '../pages/Stub.jsx'

window.__roles = ROLES
window.__menuForRole = menuForRole

// 懒加载页面（P1–P5 阶段产出 src/pages/<KEY>.jsx；各页文件副作用注册导览/溯源）：
const LAZY = {}
for (const key of ['A2','A3','B1','B2','B3','B4','B5','C1','C2','C3','C4',
  'D1','D2','D3','D4','D5','D6','E1','E2','E3','F1','INDEX']) {
  LAZY[key] = lazy(() => import(`../pages/${key}.jsx`))
}

function pageFromHash() {
  return (location.hash || '').replace(/^#\/?/, '') || 'A1'
}

export default function Shell() {
  const [role, setRole] = useState('laowang')
  const [page, setPage] = useState(pageFromHash())
  const [guide, setGuide] = useState(false)

  useEffect(() => {
    const onHash = () => setPage(pageFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const navigate = key => { location.hash = '/' + key }
  const title = page === 'A1' ? '问一问'
    : (window.__menuForRole(role).flatMap(g => g.items).find(i => i.key === page)?.label || page)
  const guideSteps = page === 'A1' ? A1_GUIDE : (window.__guides?.[page] || ['本页导览配置待补。'])
  const traceText = page === 'A1' ? A1_TRACE : (window.__traces?.[page] || '')
  const Page = LAZY[page]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <SideMenu role={role} current={page} onNavigate={navigate} />
      <Layout>
        <HeaderBar title={title} crumb="工作台 · 全体业务用户"
          role={role} setRole={setRole} onGuide={() => setGuide(true)} />
        <Layout.Content style={{ padding: DEV ? '16px 20px 48px' : '16px 20px' }}>
          {page === 'A1' ? <A1Chat /> : Page ? (
            <Suspense fallback={<Skeleton active />}>
              <Page />
            </Suspense>
          ) : <Stub pageKey={page} />}
        </Layout.Content>
      </Layout>
      <GuideModal open={guide} onClose={() => setGuide(false)} steps={guideSteps} />
      <TraceBar text={traceText} />
    </Layout>
  )
}
