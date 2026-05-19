import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, getUser, signOut } from '../../lib/supabase'

function DataRow({ label, value }) {
  const isNull = value === null || value === undefined || value === '' || value === 'null'
  return (
    <div className="data-row">
      <span className="data-key">{label}</span>
      <span className={`data-val ${isNull ? 'data-val--null' : ''}`}>
        {isNull ? '—' : String(value)}
      </span>
    </div>
  )
}

export default function StudentDashboard() {
  const navigate = useNavigate()
  const [student, setStudent] = useState(null)
  const [allergies, setAllergies] = useState([])
  const [history, setHistory] = useState([])
  const [visits, setVisits] = useState([])
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedVisit, setExpandedVisit] = useState(null)

  useEffect(() => {
    loadDashboard()
  }, [])

  const loadDashboard = async () => {
    setLoading(true)
    try {
      const user = await getUser()
      if (!user) { navigate('/student/login'); return }

      // Fetch student profile
      const { data: studentData, error: sErr } = await supabase
        .from('students')
        .select('*')
        .eq('auth_user_id', user.id)
        .maybeSingle()

      if (sErr) throw sErr
      if (!studentData) {
        // No profile yet — send to onboarding
        navigate('/student/onboarding')
        return
      }

      setStudent(studentData)

      // Fetch allergies
      const { data: allergyData } = await supabase
        .from('allergies')
        .select('*')
        .eq('student_id', studentData.id)
      setAllergies(allergyData || [])

      // Fetch medical history
      const { data: histData } = await supabase
        .from('medical_history')
        .select('*')
        .eq('student_id', studentData.id)
      setHistory(histData || [])

      // Fetch visits with vitals, diagnoses, prescriptions
      const { data: visitData } = await supabase
        .from('visits')
        .select('*')
        .eq('student_id', studentData.id)
        .order('visit_date', { ascending: false })
      setVisits(visitData || [])

      // Fetch documents
      const { data: docData } = await supabase
        .from('documents')
        .select('*')
        .eq('student_id', studentData.id)
        .order('created_at', { ascending: false })
      setDocuments(docData || [])

    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    await signOut()
    navigate('/student/login')
  }

  if (loading) {
    return (
      <div className="app-shell app-shell--student" style={{ maxWidth: 600 }}>
        <div className="header">
          <div>
            <div className="header-brand">OCTAL-EHR</div>
            <div className="header-sub">My Health Record</div>
          </div>
        </div>
        <div className="content">
          <div className="centered-state">
            <div className="spinner" />
            <p className="page-desc">Loading your health record…</p>
          </div>
        </div>
      </div>
    )
  }

  if (error || !student) {
    return (
      <div className="app-shell app-shell--student" style={{ maxWidth: 600 }}>
        <div className="header">
          <div>
            <div className="header-brand">OCTAL-EHR</div>
            <div className="header-sub">My Health Record</div>
          </div>
        </div>
        <div className="content">
          <div className="error-box">⚠ {error || 'Profile not found'}</div>
          <button className="btn-secondary" onClick={() => navigate('/student/login')}>← Back to Login</button>
        </div>
      </div>
    )
  }

  const emergencyContact = (() => {
    try {
      if (!student.emergency_contact_enc) return null
      return typeof student.emergency_contact_enc === 'string'
        ? JSON.parse(student.emergency_contact_enc)
        : student.emergency_contact_enc
    } catch { return null }
  })()

  return (
    <div className="app-shell app-shell--student" style={{ maxWidth: 600 }}>
      <div className="header">
        <div>
          <div className="header-brand">OCTAL-EHR</div>
          <div className="header-sub">My Health Record</div>
        </div>
        <div className="header-actions">
          <button className="btn-logout" onClick={handleLogout}>Logout</button>
        </div>
      </div>

      <div className="content" style={{ padding: '24px 20px' }}>

        {/* ── Student Identity Card ── */}
        <div className="card" style={{ textAlign: 'center', paddingTop: 32, paddingBottom: 28 }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%', background: 'var(--green)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', fontSize: 28, color: 'white', fontFamily: "'DM Serif Display', serif"
          }}>
            {(student.full_name_enc || '?')[0]?.toUpperCase()}
          </div>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, marginBottom: 4 }}>
            {student.full_name_enc || 'Profile Incomplete'}
          </h2>
          <div className="patient-matric" style={{ textAlign: 'center' }}>{student.matric_no_enc}</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
            {student.blood_group && student.blood_group !== 'unknown' && (
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>Blood: <strong style={{ color: 'var(--text)' }}>{student.blood_group}</strong></span>
            )}
            {student.genotype && student.genotype !== 'unknown' && (
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>Genotype: <strong style={{ color: 'var(--text)' }}>{student.genotype}</strong></span>
            )}
            {student.gender && (
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>Gender: <strong style={{ color: 'var(--text)', textTransform: 'capitalize' }}>{student.gender}</strong></span>
            )}
          </div>
        </div>

        {/* ── Allergies ── */}
        <div className="card" style={allergies.length > 0 ? {
          border: '1.5px solid var(--alert)', background: 'var(--alert-bg)'
        } : {}}>
          <div className="section-label" style={{
            margin: '0 0 12px',
            color: allergies.length > 0 ? 'var(--alert)' : undefined
          }}>
            {allergies.length > 0 ? '⚠ Known Allergies' : 'Allergies'}
          </div>
          {allergies.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {allergies.map((a, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 14px', background: 'rgba(255,255,255,0.7)', borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)'
                }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                    {a.allergen_enc}
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1,
                    padding: '4px 10px', borderRadius: 100,
                    background: a.severity === 'life_threatening' || a.severity === 'severe'
                      ? 'var(--alert)' : a.severity === 'moderate' ? 'var(--warn)' : '#94a3b8',
                    color: 'white'
                  }}>
                    {(a.severity || 'unknown').replace('_', ' ')}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>No known allergies on record.</p>
          )}
        </div>

        {/* ── Medical Conditions ── */}
        <div className="card">
          <div className="section-label" style={{ margin: '0 0 12px' }}>Medical Conditions</div>
          {history.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {history.map((h, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 14px', background: 'var(--surface)', borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)'
                }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                      {h.condition_enc}
                    </div>
                    {h.notes_enc && (
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{h.notes_enc}</div>
                    )}
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1,
                    padding: '4px 10px', borderRadius: 100,
                    background: h.status === 'active' ? 'var(--warn)' : h.status === 'managed' ? '#3b82f6' : 'var(--green)',
                    color: 'white'
                  }}>
                    {h.status || 'unknown'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>No medical conditions on record.</p>
          )}
        </div>

        {/* ── Personal Information ── */}
        <div className="card">
          <div className="section-label" style={{ margin: '0 0 12px' }}>Personal Information</div>
          <DataRow label="Full Name" value={student.full_name_enc} />
          <DataRow label="Date of Birth" value={student.date_of_birth_enc} />
          <DataRow label="Gender" value={student.gender} />
          <DataRow label="Phone" value={student.phone_number_enc} />
          <DataRow label="Email" value={student.email_enc} />
          <DataRow label="Address" value={student.home_address_enc} />
          {student.department && <DataRow label="Department" value={student.department} />}
          {student.level && <DataRow label="Level" value={student.level} />}
        </div>

        {/* ── Emergency Contact ── */}
        {emergencyContact && (
          <div className="card">
            <div className="section-label" style={{ margin: '0 0 12px' }}>Emergency Contact</div>
            <DataRow label="Name" value={emergencyContact.name} />
            <DataRow label="Relation" value={emergencyContact.relationship} />
            <DataRow label="Phone" value={emergencyContact.phone} />
          </div>
        )}

        {/* ── Current Medications ── */}
        {(() => {
          const raw = student.ai_extraction_raw
          const meds = typeof raw === 'string' ? JSON.parse(raw)?.clinical?.current_medications : raw?.clinical?.current_medications
          if (!meds || meds.length === 0) return null
          return (
            <div className="card">
              <div className="section-label" style={{ margin: '0 0 12px' }}>Current Medications</div>
              {meds.map((m, i) => (
                <DataRow key={i} label={m.drug} value={[m.dosage, m.frequency].filter(Boolean).join(' · ') || '—'} />
              ))}
            </div>
          )
        })()}

        {/* ── Vaccinations ── */}
        {(() => {
          const raw = student.ai_extraction_raw
          const vax = typeof raw === 'string' ? JSON.parse(raw)?.clinical?.vaccinations : raw?.clinical?.vaccinations
          if (!vax || vax.length === 0) return null
          return (
            <div className="card">
              <div className="section-label" style={{ margin: '0 0 12px' }}>Vaccinations</div>
              {vax.map((v, i) => (
                <DataRow key={i} label={v.vaccine} value={v.date || 'Date not specified'} />
              ))}
            </div>
          )
        })()}

        {/* ── Visit History ── */}
        <div className="card">
          <div className="section-label" style={{ margin: '0 0 12px' }}>
            Clinic Visits ({visits.length})
          </div>
          {visits.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
              No clinic visits on record yet.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {visits.map((v) => {
                const isOpen = expandedVisit === v.id
                const date = new Date(v.visit_date).toLocaleDateString('en-NG', {
                  year: 'numeric', month: 'short', day: 'numeric'
                })
                return (
                  <div key={v.id}
                    style={{
                      border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                      background: isOpen ? 'var(--surface)' : 'var(--white)',
                      overflow: 'hidden', transition: 'background 0.2s'
                    }}
                  >
                    <div
                      onClick={() => setExpandedVisit(isOpen ? null : v.id)}
                      style={{
                        padding: '12px 16px', cursor: 'pointer',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                          {v.presenting_complaint_enc || 'General Visit'}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                          {date} · {v.status === 'open' ? '🟢 Open' : v.status === 'referred' ? '🔵 Referred' : '⚫ Closed'}
                        </div>
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--muted)', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                        ▼
                      </span>
                    </div>

                    {isOpen && (
                      <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)' }}>
                        {v.notes_enc && (
                          <div style={{ marginTop: 12 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--muted)', marginBottom: 4 }}>
                              Notes
                            </div>
                            <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>{v.notes_enc}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Documents ── */}
        {documents.length > 0 && (
          <div className="card">
            <div className="section-label" style={{ margin: '0 0 12px' }}>Uploaded Documents</div>
            {documents.map((doc, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 0', borderBottom: i < documents.length - 1 ? '1px solid var(--border)' : 'none'
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                    {doc.original_filename || 'Document'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                    {doc.document_type} · {doc.file_size_bytes ? `${Math.round(doc.file_size_bytes / 1024)}KB` : '—'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Edit Notice ── */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: 16, marginTop: 8, marginBottom: 24
        }}>
          <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6, margin: 0 }}>
            📝 Need to update your information? Visit the Health Center and ask staff to open your profile for editing.
          </p>
        </div>
      </div>

      <div className="footer">
        Encrypted · NDPR Compliant · OCTAL {new Date().getFullYear()}
      </div>
    </div>
  )
}
