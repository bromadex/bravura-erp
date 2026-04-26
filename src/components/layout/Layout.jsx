import { Outlet } from 'react-router-dom'
import TopBar from './TopBar'
import Sidebar from './Sidebar'

export default function Layout({ module }) {
  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden' }}>
      <Sidebar module={module} />
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <TopBar />
        <main style={{ flex:1, overflowY:'auto', padding:'24px' }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
