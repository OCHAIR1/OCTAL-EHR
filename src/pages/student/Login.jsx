import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signIn, supabase } from '../../lib/supabase'
import { hashMatricNo } from '../../lib/crypto'

export default function StudentLogin() {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  // Forgot password state
  const [showForgot, setShowForgot] = useState(false)
  const [forgotInput, setForgotInput] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)
  const [forgotError, setForgotError] = useState(null)

  /**
   * Resolve the login email from identifier.
   * If it contains '@', it's an email — use directly.
   * Otherwise, treat as matric number — hash it, call server-side lookup.
   */
  const resolveEmail = async (input) => {
    const trimmed = input.trim()
    if (trimmed.includes('@')) return trimmed.toLowerCase()

    // Matric number — hash it and look up via server API (bypasses RLS)
    const hash = await hashMatricNo(trimmed.toUpperCase())
    const res = await fetch('/api/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matric_hash: hash })
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'No account found for this matric number. Contact the health center to register.')
    }

    const data = await res.json()
    return data.email
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const email = await resolveEmail(identifier)
      await signIn(email, password)

      // Check if student already has a completed profile
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: student } = await supabase
          .from('students')
          .select('id, profile_verified, profile_open')
          .eq('auth_user_id', user.id)
          .maybeSingle()

        if (student && student.profile_verified && !student.profile_open) {
          navigate('/student/dashboard')
        } else {
          navigate('/student/onboarding')
        }
      } else {
        navigate('/student/onboarding')
      }
    } catch (err) {
      setError(err.message || 'Login failed. Check your matric number and password.')
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async (e) => {
    e.preventDefault()
    setForgotError(null)
    setForgotLoading(true)

    try {
      const email = await resolveEmail(forgotInput)
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/student/login`
      })
      if (resetErr) throw resetErr
      setForgotSent(true)
    } catch (err) {
      setForgotError(err.message || 'Failed to send reset email.')
    } finally {
      setForgotLoading(false)
    }
  }

  // ── Forgot Password View ──
  if (showForgot) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1 className="login-brand">OCTAL-EHR</h1>
          <p className="login-sub">Password Recovery</p>

          {forgotSent ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>✉</div>
              <p style={{ fontSize: 14, color: 'var(--text)', fontWeight: 600, marginBottom: 8 }}>
                Reset link sent!
              </p>
              <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 24 }}>
                If that account exists, a password reset link has been sent to the associated email.
                Check your inbox and spam folder.
              </p>
              <button className="btn-secondary" onClick={() => { setShowForgot(false); setForgotSent(false); setForgotInput('') }}>
                ← Back to Login
              </button>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword}>
              <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 20 }}>
                Enter your matric number or email address. We'll send a password reset link if the account exists.
              </p>

              <div className="field">
                <label>Matric Number or Email</label>
                <input
                  type="text"
                  placeholder="e.g. 24/15554 or your email"
                  value={forgotInput}
                  onChange={e => setForgotInput(e.target.value)}
                  required
                />
              </div>

              {forgotError && <div className="error-box">⚠ {forgotError}</div>}

              <div className="btn-row" style={{ marginTop: 20, paddingBottom: 0 }}>
                <button className="btn-primary" type="submit" disabled={forgotLoading || !forgotInput.trim()}>
                  {forgotLoading ? 'Sending…' : 'Send Reset Link'}
                </button>
              </div>

              <p style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: 'var(--muted)' }}>
                <a
                  href="#"
                  onClick={(e) => { e.preventDefault(); setShowForgot(false); setForgotError(null) }}
                  style={{ color: 'var(--green)', fontWeight: 700, textDecoration: 'none' }}
                >
                  ← Back to Login
                </a>
              </p>
            </form>
          )}
        </div>
      </div>
    )
  }

  // ── Login View ──
  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-brand">OCTAL-EHR</h1>
        <p className="login-sub">Caleb University Health Center</p>

        <form onSubmit={handleLogin}>
          <div className="field">
            <label>Matric Number or Email</label>
            <input
              type="text"
              placeholder="e.g. 24/15554 or your email"
              value={identifier}
              onChange={e => setIdentifier(e.target.value)}
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
            <button className="btn-primary" type="submit" disabled={loading || !identifier || !password}>
              {loading ? 'Signing in…' : 'Sign In →'}
            </button>
          </div>
        </form>

        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: 'var(--muted)' }}>
          <a
            href="#"
            onClick={(e) => { e.preventDefault(); setShowForgot(true); setForgotInput(identifier) }}
            style={{ color: 'var(--green-light)', fontWeight: 600, textDecoration: 'none' }}
          >
            Forgot password?
          </a>
        </p>

        <p style={{ textAlign: 'center', marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>
          Medical Staff? <a href="/staff/login" style={{ color: 'var(--green)', fontWeight: 700, textDecoration: 'none' }}>Staff Login →</a>
        </p>
      </div>
    </div>
  )
}
