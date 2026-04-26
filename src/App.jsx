// ... other imports
import { FleetProvider } from './contexts/FleetContext'
import Vehicles from './pages/Fleet/Vehicles'
import Generators from './pages/Fleet/Generators'
import HeavyEquipment from './pages/Fleet/HeavyEquipment'

// ... inside AppRoutes, after Fuel routes:
<Route path="/module/fleet" element={
  <ProtectedRoute>
    <FleetProvider>
      <Layout module="fleet" />
    </FleetProvider>
  </ProtectedRoute>
}>
  <Route index element={<Vehicles />} />
  <Route path="vehicles" element={<Vehicles />} />
  <Route path="generators" element={<Generators />} />
  <Route path="heavy-equipment" element={<HeavyEquipment />} />
</Route>
