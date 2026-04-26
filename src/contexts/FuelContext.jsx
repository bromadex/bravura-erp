import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

const FuelContext = createContext(null)

// Tank constant (from original HTML – ZUFTA10)
const TANK_MAX_LITRES = 10103
const DIPSTICK_TABLE = [
  [0.00,0],[0.01,6],[0.02,17],[0.03,31],[0.04,48],[0.05,67],[0.06,88],[0.07,111],[0.08,136],[0.09,162],
  [0.10,189],[0.11,218],[0.12,247],[0.13,279],[0.14,311],[0.15,344],[0.16,379],[0.17,414],[0.18,450],[0.19,488],
  [0.20,526],[0.21,565],[0.22,605],[0.23,645],[0.24,687],[0.25,729],[0.26,772],[0.27,815],[0.28,860],[0.29,905],
  [0.30,950],[0.31,997],[0.32,1043],[0.33,1091],[0.34,1139],[0.35,1188],[0.36,1237],[0.37,1286],[0.38,1337],[0.39,1387],
  [0.40,1439],[0.41,1490],[0.42,1542],[0.43,1595],[0.44,1648],[0.45,1702],[0.46,1755],[0.47,1810],[0.48,1865],[0.49,1920],
  [0.50,1975],[0.51,2031],[0.52,2087],[0.53,2144],[0.54,2201],[0.55,2258],[0.56,2316],[0.57,2374],[0.58,2432],[0.59,2490],
  [0.60,2549],[0.61,2608],[0.62,2668],[0.63,2727],[0.64,2787],[0.65,2847],[0.66,2908],[0.67,2968],[0.68,3029],[0.69,3090],
  [0.70,3151],[0.71,3213],[0.72,3275],[0.73,3336],[0.74,3398],[0.75,3461],[0.76,3523],[0.77,3585],[0.78,3648],[0.79,3711],
  [0.80,3774],[0.81,3837],[0.82,3900],[0.83,3964],[0.84,4027],[0.85,4091],[0.86,4154],[0.87,4218],[0.88,4282],[0.89,4346],
  [0.90,4410],[0.91,4474],[0.92,4538],[0.93,4602],[0.94,4666],[0.95,4730],[0.96,4794],[0.97,4859],[0.98,4923],[0.99,4987],
  [1.00,5052],[1.01,5116],[1.02,5180],[1.03,5245],[1.04,5309],[1.05,5373],[1.06,5437],[1.07,5502],[1.08,5566],[1.09,5630],
  [1.10,5694],[1.11,5758],[1.12,5822],[1.13,5885],[1.14,5949],[1.15,6013],[1.16,6076],[1.17,6140],[1.18,6203],[1.19,6266],
  [1.20,6329],[1.21,6392],[1.22,6455],[1.23,6518],[1.24,6580],[1.25,6643],[1.26,6705],[1.27,6767],[1.28,6829],[1.29,6890],
  [1.30,6952],[1.31,7013],[1.32,7074],[1.33,7135],[1.34,7196],[1.35,7256],[1.36,7316],[1.37,7376],[1.38,7436],[1.39,7495],
  [1.40,7554],[1.41,7613],[1.42,7671],[1.43,7730],[1.44,7788],[1.45,7845],[1.46,7902],[1.47,7959],[1.48,8016],[1.49,8072],
  [1.50,8128],[1.51,8184],[1.52,8239],[1.53,8294],[1.54,8348],[1.55,8402],[1.56,8455],[1.57,8508],[1.58,8561],[1.59,8613],
  [1.60,8665],[1.61,8716],[1.62,8767],[1.63,8817],[1.64,8867],[1.65,8916],[1.66,8964],[1.67,9012],[1.68,9060],[1.69,9107],
  [1.70,9153],[1.71,9199],[1.72,9244],[1.73,9288],[1.74,9332],[1.75,9374],[1.76,9417],[1.77,9458],[1.78,9499],[1.79,9539],
  [1.80,9578],[1.81,9616],[1.82,9653],[1.83,9689],[1.84,9725],[1.85,9759],[1.86,9792],[1.87,9825],[1.88,9856],[1.89,9886],
  [1.90,9914],[1.91,9942],[1.92,9968],[1.93,9992],[1.94,10015],[1.95,10036],[1.96,10055],[1.97,10072],[1.98,10086],[1.99,10097],[2.00,10103]
]

export function FuelProvider({ children }) {
  const [issuances, setIssuances] = useState([])
  const [deliveries, setDeliveries] = useState([])
  const [dipstickLog, setDipstickLog] = useState([])
  const [loading, setLoading] = useState(true)

  const generateId = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [iRes, dRes, dipRes] = await Promise.all([
        supabase.from('fuel_log').select('*').order('date', { ascending: false }),
        supabase.from('fuel_deliveries').select('*').order('date', { ascending: false }),
        supabase.from('dipstick_log').select('*').order('date', { ascending: false }),
      ])
      if (iRes.data) setIssuances(iRes.data)
      if (dRes.data) setDeliveries(dRes.data)
      if (dipRes.data) setDipstickLog(dipRes.data)
    } catch (err) {
      console.error(err)
      toast.error('Failed to load fuel data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Helper: convert cm to litres using DIPSTICK_TABLE
  const getLitresFromCm = (cm) => {
    if (cm === null || cm === undefined || isNaN(cm)) return 0
    if (cm <= 0) return 0
    if (cm >= 2.0) return TANK_MAX_LITRES
    for (let i = 0; i < DIPSTICK_TABLE.length - 1; i++) {
      const [d0, l0] = DIPSTICK_TABLE[i]
      const [d1, l1] = DIPSTICK_TABLE[i + 1]
      if (cm >= d0 && cm <= d1) {
        const frac = (cm - d0) / (d1 - d0)
        return Math.round(l0 + frac * (l1 - l0))
      }
    }
    return 0
  }

  // Add fuel issuance
  const addIssuance = async (issuance) => {
    const id = generateId()
    const { error } = await supabase.from('fuel_log').insert([{ id, ...issuance, created_at: new Date().toISOString() }])
    if (error) throw error
    await fetchAll()
  }

  // Add fuel delivery
  const addDelivery = async (delivery) => {
    const id = generateId()
    const { error } = await supabase.from('fuel_deliveries').insert([{ id, ...delivery, created_at: new Date().toISOString() }])
    if (error) throw error
    await fetchAll()
  }

  // Add dipstick record (with automatic calculation)
  const addDipstick = async (record) => {
    const id = generateId()
    const { error } = await supabase.from('dipstick_log').insert([{ id, ...record, created_at: new Date().toISOString() }])
    if (error) throw error
    await fetchAll()
  }

  // Get current tank level from latest dipstick (end reading)
  const getCurrentTankLevel = () => {
    if (!dipstickLog.length) return 0
    const latest = [...dipstickLog].sort((a,b) => new Date(b.date) - new Date(a.date))[0]
    return latest.fuel_end || latest.end_litres || 0
  }

  // Get tank percentage
  const getTankPercentage = () => {
    return (getCurrentTankLevel() / TANK_MAX_LITRES) * 100
  }

  return (
    <FuelContext.Provider value={{
      issuances, deliveries, dipstickLog, loading,
      addIssuance, addDelivery, addDipstick,
      getLitresFromCm, getCurrentTankLevel, getTankPercentage,
      TANK_MAX_LITRES,
      fetchAll,
    }}>
      {children}
    </FuelContext.Provider>
  )
}

export function useFuel() {
  const ctx = useContext(FuelContext)
  if (!ctx) throw new Error('useFuel must be used inside FuelProvider')
  return ctx
}
