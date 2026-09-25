import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider, App as AntApp } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import 'dayjs/locale/zh-cn'
import Shell from './shell/Shell.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <ConfigProvider
    locale={zhCN}
    theme={{
      token: { colorPrimary: '#1677ff', borderRadius: 6, fontSize: 14 },
      components: { Layout: { siderBg: '#0b2e59', triggerBg: '#0b2e59' } }
    }}
  >
    <AntApp>
      <Shell />
    </AntApp>
  </ConfigProvider>
)
