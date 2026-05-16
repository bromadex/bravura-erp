// src/pages/Assets/AssetImport.jsx
// One-time import wizard to pull existing fleet/equipment records into the unified registry.

import { useState } from 'react'
import { useAssetRegistry } from '../../contexts/AssetRegistryContext'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'

const SOURCES = [
  {
    key: 'vehicles',
    label: 'Vehicles (Fleet)',
    icon: 'directions_car',
    color: '#34d399',
    description: 'Trucks, pickups, buses, tankers — currently under Fleet → Vehicles. Maps to Vehicle category with km measurement.',
  },
  {
    key: 'earth_movers',
    label: 'Earth Movers (Heavy Equipment)',
    icon: 'construction',
    color: '#f97316',
    description: 'Excavators, graders, rollers, dozers — currently under Fleet → Heavy Equipment. Maps to Heavy Equipment category with hours measurement.',
  },
  {
    key: 'generators',
    label: 'Generators',
    icon: 'bolt',
    color: '#fbbf24',
    description: 'Generators currently under Fleet → Generators. Maps to Generator category with hours measurement.',
  },
]

export default function AssetImport() {
  const { importFromVehicles, importFromEarthMovers, importFromGenerators } = useAssetRegistry()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin' || user?.role === 'fleet_manager'

  const [results, setResults]   = useState({})  // key → {count, status, error}
  const [loading, setLoading]   = useState({})

  const handleImport = async (source) => {
    setLoading(l => ({ ...l, [source.key]: true }))
    try {
      let count
      if (source.key === 'vehicles')     count = await importFromVehicles()
      if (source.key === 'earth_movers') count = await importFromEarthMovers()
      if (source.key === 'generators')   count = await importFromGenerators()
      setResults(r => ({ ...r, [source.key]: { count, status: 'done' } }))
      if (count === 0) {
        toast.success('All records already imported — nothing new to add')
      } else {
        toast.success(`${count} records imported`)
      }
    } catch (err) {
      setResults(r => ({ ...r, [source.key]: { status: 'error', error: err.message } }))
      toast.error(err.message)
    } finally {
      setLoading(l => ({ ...l, [source.key]: false }))
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Import Existing Assets</h1>
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 20, borderColor: 'var(--gold)' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span className="material-icons" style={{ color: 'var(--gold)', fontSize: 24, flexShrink: 0 }}>info</span>
          <div style={{ fontSize: 13 }}>
            <strong>How import works:</strong> Each source table is scanned for records not yet in the Asset Registry.
            Only new records are added — existing ones are skipped (idempotent). You can re-run this any time.
            After import, assets can be reclassified individually if needed.
          </div>
        </div>
      </div>

      {!isAdmin && (
        <div className="card" style={{ padding: 16, borderColor: 'var(--red)', background: 'rgba(239,68,68,.08)' }}>
          <span className="material-icons" style={{ color: 'var(--red)', verticalAlign: 'middle', marginRight: 6 }}>lock</span>
          Asset import requires admin or fleet manager role.
        </div>
      )}

      {isAdmin && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {SOURCES.map(source => {
            const result  = results[source.key]
            const busy    = loading[source.key]
            return (
              <div key={source.key} className="card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: `${source.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-icons" style={{ color: source.color, fontSize: 26 }}>{source.icon}</span>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{source.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>{source.key}</div>
                  </div>
                </div>

                <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 16, lineHeight: 1.5 }}>
                  {source.description}
                </div>

                {result && (
                  <div style={{ marginBottom: 12, padding: 10, borderRadius: 6,
                    background: result.status === 'done' ? 'rgba(34,197,94,.1)' : 'rgba(239,68,68,.1)',
                    color: result.status === 'done' ? 'var(--green)' : 'var(--red)',
                    fontSize: 13, fontWeight: 600 }}>
                    {result.status === 'done'
                      ? result.count === 0
                        ? '✓ Already up to date'
                        : `✓ ${result.count} record${result.count !== 1 ? 's' : ''} imported`
                      : `✗ ${result.error}`}
                  </div>
                )}

                <button className="btn btn-primary" style={{ width: '100%' }}
                  disabled={busy} onClick={() => handleImport(source)}>
                  <span className="material-icons" style={{ fontSize: 16 }}>
                    {busy ? 'hourglass_empty' : 'download'}
                  </span>
                  {busy ? 'Importing…' : 'Import from ' + source.key}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
