import { useNavigate } from 'react-router-dom'
export default function KPITemplates() {
  const navigate = useNavigate()
  return (
    <div style={{ display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:'60vh',gap:16 }}>
      <span className="material-icons" style={{ fontSize:72,opacity:.3,color:'var(--gold)' }}>construction</span>
      <h2 style={{ fontSize:22,fontWeight:800 }}>Coming soon</h2>
      <button className="btn btn-secondary" onClick={() => navigate('/module/hr')}>← HR Home</button>
    </div>
  )
}
