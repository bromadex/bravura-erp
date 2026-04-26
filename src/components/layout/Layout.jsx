import { Outlet } from 'react-router-dom'
import TopBar from './TopBar'
import Sidebar from './Sidebar'

export default function Layout({ module }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar module={module} onNavigate={(path) => window.location.href = path} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <TopBar />
        <main style={{ padding: '20px 24px' }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
