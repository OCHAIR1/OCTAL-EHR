import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import StudentLogin from './pages/student/Login'
import StudentOnboarding from './pages/student/Onboarding'
import StudentDashboard from './pages/student/Dashboard'
import StaffLogin from './pages/staff/Login'
import StaffSearch from './pages/staff/Search'
import PatientView from './pages/staff/PatientView'
import StaffStudentOnboarding from './pages/staff/StudentOnboarding'
import StaffLayout from './components/StaffLayout'
import { StudentProtectedRoute, StaffProtectedRoute } from './components/ProtectedRoute'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Default route */}
        <Route path="/" element={<Navigate to="/student/login" replace />} />

        {/* Student routes */}
        <Route path="/student/login" element={<StudentLogin />} />
        <Route path="/student/onboarding" element={<StudentProtectedRoute><StudentOnboarding /></StudentProtectedRoute>} />
        <Route path="/student/dashboard" element={<StudentProtectedRoute><StudentDashboard /></StudentProtectedRoute>} />

        {/* Staff routes — wrapped with sidebar layout */}
        <Route path="/staff/login" element={<StaffLogin />} />
        <Route path="/staff/search" element={<StaffProtectedRoute><StaffLayout><StaffSearch /></StaffLayout></StaffProtectedRoute>} />
        <Route path="/staff/patient/:id" element={<StaffProtectedRoute><StaffLayout><PatientView /></StaffLayout></StaffProtectedRoute>} />
        <Route path="/staff/register" element={<StaffProtectedRoute><StaffLayout><StaffStudentOnboarding /></StaffLayout></StaffProtectedRoute>} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/student/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
