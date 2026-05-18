import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import StudentLogin from './pages/student/Login'
import StudentOnboarding from './pages/student/Onboarding'
import StaffLogin from './pages/staff/Login'
import StaffSearch from './pages/staff/Search'
import PatientView from './pages/staff/PatientView'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Default route */}
        <Route path="/" element={<Navigate to="/student/login" replace />} />

        {/* Student routes */}
        <Route path="/student/login" element={<StudentLogin />} />
        <Route path="/student/onboarding" element={<StudentOnboarding />} />

        {/* Staff routes */}
        <Route path="/staff/login" element={<StaffLogin />} />
        <Route path="/staff/search" element={<StaffSearch />} />
        <Route path="/staff/patient/:id" element={<PatientView />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/student/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
