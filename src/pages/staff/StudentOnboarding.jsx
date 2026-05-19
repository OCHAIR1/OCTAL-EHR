import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, supabaseAdmin } from '../../lib/supabase'
import { hashMatricNo } from '../../lib/crypto'
import { GoogleGenerativeAI } from '@google/generative-ai'

// ── Constants ────────────────────────────────────────────────
const DEFAULT_PASSWORD = 'Calebuniv'

// ── Gemini matric scraper ────────────────────────────────────
const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY)

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function getMime(file) {
  if (file.type) return file.type
  const ext = file.name?.split('.').pop()?.toLowerCase()
  const map = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', csv: 'text/plain', txt: 'text/plain' }
  return map[ext] || 'text/plain'
}

async function scrapeMatricNumbers(file) {
  const mime = getMime(file)
  const isBinary = mime.includes('pdf') || mime.includes('image')

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: { temperature: 0, responseMimeType: 'application/json' }
  })

  let parts = []

  if (isBinary) {
    const base64 = await fileToBase64(file)
    parts = [
      { inlineData: { mimeType: mime, data: base64 } },
      { text: 'Extract ALL student matric numbers from this document. Nigerian universities use formats like 24/15554, CSC/2021/001, ENG/2020/042, 19/0101, etc. Return ONLY valid JSON: {"matric_numbers": ["...", "..."]}. No explanation.' }
    ]
  } else {
    const text = await file.text()
    parts = [
      { text: `Extract ALL student matric numbers from this text. Nigerian universities use formats like 24/15554, CSC/2021/001, ENG/2020/042, 19/0101, etc.\n\nText:\n${text}\n\nReturn ONLY valid JSON: {"matric_numbers": ["...", "..."]}. No explanation.` }
    ]
  }

  const result = await model.generateContent(parts)
  let raw = result.response.text()

  try {
    const parsed = JSON.parse(raw)
    return (parsed.matric_numbers || []).map(m => m.trim().toUpperCase()).filter(Boolean)
  } catch {
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(cleaned)
    return (parsed.matric_numbers || []).map(m => m.trim().toUpperCase()).filter(Boolean)
  }
}

// ── Component ───────────────────────────────────────────────
const TABS = ['Upload File', 'Enter Manually']

export default function StaffStudentOnboarding() {
  const navigate = useNavigate()
  const [tab, setTab] = useState(0)

  // File upload state
  const [file, setFile] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef()
  const [scraping, setScraping] = useState(false)
  const [scrapeError, setScrapeError] = useState(null)
  const [scrapedMatrics, setScrapedMatrics] = useState([])
  const [editableMatrics, setEditableMatrics] = useState([])

  // Manual entry state
  const [manualMatric, setManualMatric] = useState('')
  const [manualEmail, setManualEmail] = useState('')
  const [manualList, setManualList] = useState([]) // Array of { matric, email }

  // Creation state
  const [creating, setCreating] = useState(false)
  const [results, setResults] = useState(null)
  const [createError, setCreateError] = useState(null)

  const handleFileDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = e.dataTransfer?.files?.[0] || e.target.files?.[0]
    if (dropped) {
      setFile(dropped)
      setScrapedMatrics([])
      setEditableMatrics([])
      setScrapeError(null)
      setResults(null)
    }
  }, [])

  const handleScrape = async () => {
    if (!file) return
    setScraping(true)
    setScrapeError(null)
    try {
      const matrics = await scrapeMatricNumbers(file)
      if (matrics.length === 0) {
        setScrapeError('No matric numbers found in this file. Try a different file or enter them manually.')
      } else {
        setScrapedMatrics(matrics)
        setEditableMatrics([...matrics])
      }
    } catch (err) {
      setScrapeError(err.message || 'Failed to read the file.')
    } finally {
      setScraping(false)
    }
  }

  const handleRemoveMatric = (idx) => {
    setEditableMatrics(prev => prev.filter((_, i) => i !== idx))
  }

  const handleAddManual = () => {
    const trimmedMatric = manualMatric.trim().toUpperCase()
    if (!trimmedMatric) return
    if (manualList.some(item => item.matric === trimmedMatric)) return
    const trimmedEmail = manualEmail.trim().toLowerCase()
    setManualList(prev => [...prev, { matric: trimmedMatric, email: trimmedEmail || '' }])
    setManualMatric('')
    setManualEmail('')
  }

  const handleRemoveManual = (idx) => {
    setManualList(prev => prev.filter((_, i) => i !== idx))
  }

  // For file upload tab: list of matric strings
  // For manual tab: list of { matric, email } objects
  const getActiveEntries = () => {
    if (tab === 0) return editableMatrics.map(m => ({ matric: m, email: '' }))
    return manualList
  }

  const handleCreate = async () => {
    const entries = getActiveEntries()
    if (entries.length === 0) return
    setCreating(true)
    setCreateError(null)
    setResults(null)

    const created = []
    const skipped = []
    const errors = []

    for (const entry of entries) {
      const { matric, email: providedEmail } = entry
      try {
        const hash = await hashMatricNo(matric)

        // Check if already exists
        const { data: existing } = await supabase
          .from('students')
          .select('id')
          .eq('matric_no_hash', hash)
          .maybeSingle()

        if (existing) {
          skipped.push({ matric, reason: 'Already registered' })
          continue
        }

        // Email is required — staff must provide it
        const email = providedEmail
        if (!email) {
          errors.push({ matric, reason: 'Email is required' })
          continue
        }

        // Create auth account — admin API (service role key)
        // No email verification needed. Instant account creation.
        const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
          email,
          password: DEFAULT_PASSWORD,
          email_confirm: true,  // auto-confirm — no verification email sent
          user_metadata: { matric_no: matric, role: 'student' }
        })

        if (authErr) {
          // Handle "already registered" gracefully
          if (authErr.message?.includes('already') || authErr.status === 422) {
            skipped.push({ matric, reason: 'Email already registered' })
          } else {
            errors.push({ matric, reason: authErr.message })
          }
          continue
        }

        const userId = authData.user.id

        // Create student row (empty profile, open for student to fill)
        const { error: rowErr } = await supabase.from('students').insert({
          auth_user_id: userId,
          matric_no_hash: hash,
          matric_no_enc: matric,
          email_enc: email,
          full_name_enc: '',
          profile_open: true,
          profile_verified: false
        })

        if (rowErr) {
          errors.push({ matric, reason: rowErr.message })
          continue
        }

        // Audit log
        const staffUser = (await supabase.auth.getUser()).data.user
        await supabase.from('audit_log').insert({
          actor_id: staffUser?.id,
          actor_role: 'staff',
          action: 'CREATE_STUDENT_ACCOUNT',
          resource_type: 'students',
          metadata: { matric_no_hash: hash }
        })

        created.push({ matric, email, password: DEFAULT_PASSWORD })
      } catch (err) {
        errors.push({ matric, reason: err.message || 'Unknown error' })
      }
    }

    setResults({ created, skipped, errors })
    setCreating(false)
    if (tab === 0) setEditableMatrics([])
    else setManualList([])
  }

  const activeCount = tab === 0 ? editableMatrics.length : manualList.length

  return (
    <div className="app-shell app-shell--staff">
      <div className="header">
        <div>
          <div className="header-brand">OCTAL-EHR</div>
          <div className="header-sub">Student Registration</div>
        </div>
      </div>

      <div className="content content--staff">
        <h1 className="page-title">Register Students</h1>
        <p className="page-desc">
          Create login accounts for students. Upload a file containing matric numbers,
          or enter them one by one. All accounts start with the default password: <strong>{DEFAULT_PASSWORD}</strong>
        </p>

        {/* Tabs */}
        <div className="tab-bar" style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '2px solid var(--border)' }}>
          {TABS.map((label, i) => (
            <button
              key={i}
              onClick={() => { setTab(i); setResults(null) }}
              style={{
                background: 'none',
                border: 'none',
                padding: '10px 20px',
                fontFamily: 'Outfit, sans-serif',
                fontSize: 14,
                fontWeight: tab === i ? 700 : 400,
                color: tab === i ? 'var(--primary)' : 'var(--muted)',
                borderBottom: tab === i ? '2px solid var(--green)' : '2px solid transparent',
                marginBottom: -2,
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Tab 0: File Upload ── */}
        {tab === 0 && (
          <>
            <div
              className={`upload-zone ${dragOver ? 'upload-zone--drag' : ''} ${file ? 'upload-zone--done' : ''}`}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleFileDrop}
            >
              <div className="upload-icon">{file ? '✓' : '↑'}</div>
              <div className="upload-title">{file ? 'File ready' : 'Upload matric list'}</div>
              <div className="upload-hint">
                {file ? file.name : 'CSV, TXT, Excel, PDF, or image'}
              </div>
              <input ref={fileRef} type="file"
                accept=".csv,.txt,.pdf,.xlsx,.xls,.jpg,.jpeg,.png"
                style={{ display: 'none' }} onChange={handleFileDrop} />
            </div>

            {scrapeError && <div className="error-box" style={{ marginTop: 12 }}>⚠ {scrapeError}</div>}

            {file && scrapedMatrics.length === 0 && (
              <div className="btn-row" style={{ marginTop: 16 }}>
                <button className="btn-primary" disabled={scraping} onClick={handleScrape}>
                  {scraping ? 'Reading file…' : 'Extract Matric Numbers →'}
                </button>
              </div>
            )}

            {editableMatrics.length > 0 && (
              <>
                <div className="section-label" style={{ marginTop: 24 }}>
                  Found {editableMatrics.length} matric number{editableMatrics.length !== 1 ? 's' : ''}
                  <span style={{ fontWeight: 400, color: 'var(--muted)', marginLeft: 8 }}>— remove any that are wrong</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                  {editableMatrics.map((m, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      borderRadius: 6, padding: '4px 10px',
                      fontFamily: 'DM Mono, monospace', fontSize: 12
                    }}>
                      {m}
                      <button
                        onClick={() => handleRemoveMatric(i)}
                        style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}
                      >×</button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* ── Tab 1: Manual Entry ── */}
        {tab === 1 && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  className="search-input"
                  placeholder="Matric no. e.g. 24/15554"
                  value={manualMatric}
                  onChange={e => setManualMatric(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && handleAddManual()}
                  style={{
                    flex: 1, height: 48, border: '2px solid var(--border)', borderRadius: 'var(--radius)',
                    padding: '0 16px', fontFamily: "'DM Mono', monospace", fontSize: 14, letterSpacing: 0.5,
                    textTransform: 'uppercase', color: 'var(--text)', background: 'var(--white)', outline: 'none'
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="email"
                  placeholder="Student email e.g. ochuko@calebuniversity.edu.ng"
                  value={manualEmail}
                  onChange={e => setManualEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddManual()}
                  required
                  style={{
                    flex: 1, height: 48, border: '2px solid var(--border)', borderRadius: 'var(--radius)',
                    padding: '0 16px', fontFamily: "'Outfit', sans-serif", fontSize: 14,
                    color: 'var(--text)', background: 'var(--white)', outline: 'none'
                  }}
                />
                <button
                  className="btn-primary"
                  onClick={handleAddManual}
                  disabled={!manualMatric.trim() || !manualEmail.trim()}
                  style={{ width: 80, height: 48 }}
                >
                  Add
                </button>
              </div>
            </div>

            {manualList.length > 0 && (
              <>
                <div className="section-label">
                  {manualList.length} student{manualList.length !== 1 ? 's' : ''} queued
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                  {manualList.map((item, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      borderRadius: 6, padding: '8px 12px'
                    }}>
                      <div>
                        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, fontWeight: 500 }}>
                          {item.matric}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                          {item.email || matricToEmail(item.matric)}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveManual(i)}
                        style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '4px 8px' }}
                      >×</button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* ── Create Button ── */}
        {activeCount > 0 && !results && (
          <div className="btn-row" style={{ marginTop: 24 }}>
            <button className="btn-primary" disabled={creating} onClick={handleCreate}>
              {creating
                ? `Creating accounts… (${activeCount} students)`
                : `Create ${activeCount} Student Account${activeCount !== 1 ? 's' : ''}`}
            </button>
          </div>
        )}

        {createError && <div className="error-box" style={{ marginTop: 12 }}>⚠ {createError}</div>}

        {/* ── Results ── */}
        {results && (
          <div style={{ marginTop: 24 }}>
            {results.created.length > 0 && (
              <>
                <div className="section-label" style={{ color: 'var(--green)' }}>
                  ✓ {results.created.length} accounts created
                </div>
                <div style={{
                  background: 'var(--white)', border: '1px solid var(--border)',
                  borderRadius: 8, overflow: 'hidden', marginBottom: 16
                }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: 'var(--surface)' }}>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontFamily: 'Outfit, sans-serif', fontWeight: 700 }}>Matric No</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontFamily: 'Outfit, sans-serif', fontWeight: 700 }}>Email</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontFamily: 'Outfit, sans-serif', fontWeight: 700 }}>Password</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.created.map((r, i) => (
                        <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={{ padding: '8px 12px', fontFamily: 'DM Mono, monospace' }}>{r.matric}</td>
                          <td style={{ padding: '8px 12px', fontFamily: 'DM Mono, monospace', fontSize: 11 }}>{r.email}</td>
                          <td style={{ padding: '8px 12px', fontFamily: 'DM Mono, monospace' }}>{r.password}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {results.skipped.length > 0 && (
              <>
                <div className="section-label" style={{ color: 'var(--muted)' }}>
                  ↩ {results.skipped.length} already registered (skipped)
                </div>
                <div style={{ marginBottom: 12 }}>
                  {results.skipped.map((s, i) => (
                    <div key={i} style={{ fontSize: 12, fontFamily: 'DM Mono, monospace', color: 'var(--muted)', marginBottom: 4 }}>
                      {s.matric} — {s.reason}
                    </div>
                  ))}
                </div>
              </>
            )}

            {results.errors.length > 0 && (
              <>
                <div className="section-label" style={{ color: 'var(--alert)' }}>
                  ⚠ {results.errors.length} failed
                </div>
                <div style={{ marginBottom: 12 }}>
                  {results.errors.map((e, i) => (
                    <div key={i} style={{ fontSize: 12, fontFamily: 'DM Mono, monospace', color: 'var(--alert)', marginBottom: 4 }}>
                      {e.matric} — {e.reason}
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="warning-box" style={{ marginTop: 8 }}>
              ⚠ Share these credentials with the students securely. Default password is <strong>{DEFAULT_PASSWORD}</strong> — students should change it after first login.
            </div>

            <div className="btn-row" style={{ marginTop: 16 }}>
              <button className="btn-secondary" onClick={() => {
                setResults(null)
                setFile(null)
                setScrapedMatrics([])
                setEditableMatrics([])
                setManualList([])
                setManualMatric('')
                setManualEmail('')
              }}>
                Register More Students
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
