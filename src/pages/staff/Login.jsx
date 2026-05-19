import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signIn, supabase } from '../../lib/supabase'
import { isClinicPC } from '../../components/StaffSidebar'

/**
 * OFFLINE AUTH STRATEGY:
 * On successful online login → hash credentials and store in localStorage.
 * On offline login attempt → compare against stored hash.
 * This allows staff to access cached records when the clinic has no internet.
 */
async function hashCredentials(email, password) {
  const encoder = new TextEncoder()
  const data = encoder.encode(`${email.toLowerCase()}:${password}`)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function saveOfflineSession(email, credHash) {
  try {
    localStorage.setItem('octal_staff_session', JSON.stringify({
      email,
      credHash,
      savedAt: Date.now()
    }))
  } catch {}
}

function getOfflineSession() {
  try {
    const raw = localStorage.getItem('octal_staff_session')
    if (!raw) return null
    return JSON.parse(raw)
  } catch { return null }
}

export default function StaffLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  // Forgot password state
  const [showForgot, setShowForgot] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)
  const [forgotError, setForgotError] = useState(null)

  const handleLogin = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (navigator.onLine) {
        // ── ONLINE: authenticate with Supabase ──
        await signIn(email, password)

        // Cache credentials ONLY on Clinic PC
        if (isClinicPC()) {
          const credHash = await hashCredentials(email, password)
          saveOfflineSession(email, credHash)
        }

        navigate('/staff/search')
      } else {
        // ── OFFLINE: only works on Clinic PC ──
        if (!isClinicPC()) {
          setError('This device is not set up for offline access. Sign in on a Clinic PC, or connect to the internet.')
          return
        }

        const session = getOfflineSession()
        if (!session) {
          setError('No cached session found. Sign in online at least once on this Clinic PC first.')
          return
        }

        const credHash = await hashCredentials(email, password)
        if (credHash === session.credHash) {
          navigate('/staff/search')
        } else {
          setError('Invalid credentials. Offline login uses your last successful login.')
        }
      }
    } catch (err) {
      setError(err.message || 'Login failed. Check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async (e) => {
    e.preventDefault()
    setForgotError(null)
    setForgotLoading(true)

    try {
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/staff/login`
      })
      if (resetErr) throw resetErr
      setForgotSent(true)
    } catch (err) {
      setForgotError(err.message || 'Failed to send reset email.')
    } finally {
      setForgotLoading(false)
    }
  }

  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine

  // ── Forgot Password View ──
  if (showForgot) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1 className="login-brand">OCTAL-EHR</h1>
          <p className="login-sub">Staff Password Recovery</p>

          {forgotSent ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>✉</div>
              <p style={{ fontSize: 14, color: 'var(--text)', fontWeight: 600, marginBottom: 8 }}>
                Reset link sent!
              </p>
              <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 24 }}>
                If that email is registered, a password reset link has been sent.
                Check your inbox and spam folder.
              </p>
              <button className="btn-secondary" onClick={() => { setShowForgot(false); setForgotSent(false); setForgotEmail('') }}>
                ← Back to Login
              </button>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword}>
              <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 20 }}>
                Enter your staff email address. We'll send a password reset link if the account exists.
              </p>

              <div className="field">
                <label>Staff Email</label>
                <input
                  type="email"
                  placeholder="staff@calebuniversity.edu.ng"
                  value={forgotEmail}
                  onChange={e => setForgotEmail(e.target.value)}
                  required
                />
              </div>

              {forgotError && <div className="error-box">⚠ {forgotError}</div>}

              <div className="btn-row" style={{ marginTop: 20, paddingBottom: 0 }}>
                <button className="btn-primary" type="submit" disabled={forgotLoading || !forgotEmail.trim()}>
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
        <p className="login-sub">Medical Staff Portal</p>

        {isOffline && (
          <div style={{
            background: 'var(--warn-bg)',
            color: 'var(--warn)',
            fontSize: 12,
            padding: '8px 12px',
            borderRadius: 'var(--radius)',
            marginBottom: 16,
            fontWeight: 600,
            textAlign: 'center'
          }}>
            ⚡ Offline — signing in with cached credentials
          </div>
        )}

        <form onSubmit={handleLogin}>
          <div className="field">
            <label>Staff Email</label>
            <input
              type="email"
              placeholder="staff@calebuniversity.edu.ng"
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
              {loading ? 'Signing in…' : isOffline ? '🔒 Offline Sign In →' : 'Staff Sign In →'}
            </button>
          </div>
        </form>

        {!isOffline && (
          <p style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: 'var(--muted)' }}>
            <a
              href="#"
              onClick={(e) => { e.preventDefault(); setShowForgot(true); setForgotEmail(email) }}
              style={{ color: 'var(--green-light)', fontWeight: 600, textDecoration: 'none' }}
            >
              Forgot password?
            </a>
          </p>
        )}

        <p style={{ textAlign: 'center', marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>
          Student? <a href="/student/login" style={{ color: 'var(--green)', fontWeight: 700, textDecoration: 'none' }}>Student Login →</a>
        </p>
      </div>
    </div>
  )
}
