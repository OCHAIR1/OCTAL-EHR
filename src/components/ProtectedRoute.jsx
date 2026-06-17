import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export function StudentProtectedRoute({ children }) {
  const [loading, setLoading] = useState(true)
  const [isStudent, setIsStudent] = useState(false)

  useEffect(() => {
    let active = true
    async function checkAuth() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          if (active) {
            setIsStudent(false)
            setLoading(false)
          }
          return
        }

        // Fast metadata check — if they are staff, they are not allowed
        if (user.user_metadata?.role === 'staff') {
          await supabase.auth.signOut()
          if (active) {
            setIsStudent(false)
            setLoading(false)
          }
          return
        }

        // DB check against staff table
        const { data: staffMember } = await supabase
          .from('staff')
          .select('id')
          .eq('auth_user_id', user.id)
          .maybeSingle()

        if (staffMember) {
          await supabase.auth.signOut()
          if (active) {
            setIsStudent(false)
            setLoading(false)
          }
          return
        }

        // Check if student row exists
        const { data: student } = await supabase
          .from('students')
          .select('id')
          .eq('auth_user_id', user.id)
          .maybeSingle()

        if (student || user.user_metadata?.role === 'student') {
          if (active) {
            setIsStudent(true)
            setLoading(false)
          }
        } else {
          // If neither staff nor student, it might be an uncompleted onboarding student
          // But they should have user_metadata.role === 'student'
          await supabase.auth.signOut()
          if (active) {
            setIsStudent(false)
            setLoading(false)
          }
        }
      } catch (err) {
        console.error('Error verifying student role:', err)
        if (active) {
          setIsStudent(false)
          setLoading(false)
        }
      }
    }
    checkAuth()
    return () => { active = false }
  }, [])

  if (loading) {
    return (
      <div className="centered-state" style={{ padding: '40px', textAlign: 'center' }}>
        <div className="spinner" />
        <p style={{ fontFamily: 'Outfit, sans-serif', color: 'var(--muted)' }}>Verifying student access...</p>
      </div>
    )
  }

  if (!isStudent) {
    return <Navigate to="/student/login" replace />
  }

  return children
}

export function StaffProtectedRoute({ children }) {
  const [loading, setLoading] = useState(true)
  const [isStaff, setIsStaff] = useState(false)

  useEffect(() => {
    let active = true

    // Offline check: if offline, check if staff session is cached
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      try {
        const raw = localStorage.getItem('octal_staff_session')
        if (raw) {
          if (active) {
            setIsStaff(true)
            setLoading(false)
          }
          return
        }
      } catch (err) {
        console.error('Offline session retrieval failed:', err)
      }
    }

    async function checkAuth() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          if (active) {
            setIsStaff(false)
            setLoading(false)
          }
          return
        }

        // Fast metadata check — if they are student, they are not allowed
        if (user.user_metadata?.role === 'student') {
          await supabase.auth.signOut()
          if (active) {
            setIsStaff(false)
            setLoading(false)
          }
          return
        }

        // Check staff table
        const { data: staffMember } = await supabase
          .from('staff')
          .select('id')
          .eq('auth_user_id', user.id)
          .maybeSingle()

        if (staffMember || user.user_metadata?.role === 'staff') {
          if (active) {
            setIsStaff(true)
            setLoading(false)
          }
        } else {
          await supabase.auth.signOut()
          if (active) {
            setIsStaff(false)
            setLoading(false)
          }
        }
      } catch (err) {
        console.error('Error verifying staff role:', err)
        if (active) {
          setIsStaff(false)
          setLoading(false)
        }
      }
    }
    checkAuth()
    return () => { active = false }
  }, [])

  if (loading) {
    return (
      <div className="centered-state" style={{ padding: '40px', textAlign: 'center' }}>
        <div className="spinner" />
        <p style={{ fontFamily: 'Outfit, sans-serif', color: 'var(--muted)' }}>Verifying staff access...</p>
      </div>
    )
  }

  if (!isStaff) {
    return <Navigate to="/staff/login" replace />
  }

  return children
}
