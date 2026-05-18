import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signIn } from '../../lib/supabase'

export default function StaffLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleLogin = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      await signIn(email, password)
      navigate('/staff/search')
    } catch (err) {
      setError(err.message || 'Login failed. Check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-brand">OCTAL-EHR</h1>
        <p className="login-sub">Medical Staff Portal</p>

        <form onSubmit={handleLogin}>
          <div className="field">
            <label>Staff Email</label>
            <input
              type="email"
              placeholder="staff@caleb.edu.ng"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <label>Password</label>
            <input
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <div className="error-box">⚠ {error}</div>}

          <div className="btn-row" style={{ marginTop: 20, paddingBottom: 0 }}>
            <button className="btn-primary" type="submit" disabled={loading || !email || !password}>
              {loading ? 'Signing in…' : 'Staff Sign In →'}
            </button>
          </div>
        </form>

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: 'var(--muted)' }}>
          Student? <a href="/student/login" style={{ color: 'var(--green)', fontWeight: 700, textDecoration: 'none' }}>Student Login →</a>
        </p>
      </div>
    </div>
  )
}
