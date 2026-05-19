import React, { useState, useEffect, useRef } from 'react'
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
  const [visitDetails, setVisitDetails] = useState({})
  const [userEmail, setUserEmail] = useState('')
  const [changePwSending, setChangePwSending] = useState(false)
  const [changePwMsg, setChangePwMsg] = useState(null)
  const printRef = useRef(null)

  useEffect(() => {
    loadDashboard()
  }, [])

  const loadDashboard = async () => {
    setLoading(true)
    try {
      const user = await getUser()
      if (!user) { navigate('/student/login'); return }

      setUserEmail(user.email || '')

      // Fetch student profile
      const { data: studentData, error: sErr } = await supabase
        .from('students')
        .select('*')
        .eq('auth_user_id', user.id)
        .maybeSingle()

      if (sErr) throw sErr
      if (!studentData || !studentData.profile_verified) {
        // No profile or reset account — send to onboarding
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

  // ── Change Password (sends email link) ──
  const handleChangePassword = async () => {
    if (!userEmail) return
    setChangePwSending(true)
    setChangePwMsg(null)
    try {
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(userEmail, {
        redirectTo: `${window.location.origin}/student/login`
      })
      if (resetErr) throw resetErr
      setChangePwMsg({ type: 'success', text: 'Password reset link sent to your email. Check your inbox and spam folder.' })
    } catch (err) {
      setChangePwMsg({ type: 'error', text: err.message || 'Failed to send reset email.' })
    } finally {
      setChangePwSending(false)
    }
  }

  // ── Print Visits ──
  const handlePrintVisits = () => {
    window.print()
  }

  if (loading) {
    return (
      <div className="app-shell app-shell--student" style={{ maxWidth: 600 }}>
        <div className="header no-print">
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
        <div className="header no-print">
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
    <div className="app-shell app-shell--student" style={{ maxWidth: 600 }} ref={printRef}>
      <div className="header no-print">
        <div>
          <div className="header-brand">OCTAL-EHR</div>
          <div className="header-sub">My Health Record</div>
        </div>
        <div className="header-actions">
          <button className="btn-logout" onClick={handleLogout}>Logout</button>
        </div>
      </div>

      {/* ── Print-Only Header ── */}
      <div className="print-only print-header">
        <h1 className="print-title">Caleb University Medicals</h1>
        <p className="print-subtitle">Student Health Record</p>
        <div className="print-patient-info">
          <span><strong>Name:</strong> {student.full_name_enc}</span>
          <span><strong>Matric:</strong> {student.matric_no_enc}</span>
          {student.blood_group && student.blood_group !== 'unknown' && (
            <span><strong>Blood:</strong> {student.blood_group}</span>
          )}
          {student.genotype && student.genotype !== 'unknown' && (
            <span><strong>Genotype:</strong> {student.genotype}</span>
          )}
          {student.gender && (
            <span><strong>Gender:</strong> {student.gender}</span>
          )}
        </div>
        <div className="print-divider" />
      </div>

      <div className="content" style={{ padding: '24px 20px' }}>

        {/* ── Student Identity Card ── */}
        <div className="card no-print" style={{ textAlign: 'center', paddingTop: 32, paddingBottom: 28 }}>
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
        <div className="card no-print">
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
        <div className="card" id="visits-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div className="section-label" style={{ margin: 0 }}>
              Clinic Visits ({visits.length})
            </div>
            {visits.length > 0 && (
              <button
                className="btn-print no-print"
                onClick={handlePrintVisits}
                title="Print visit history"
              >
                🖨 Print
              </button>
            )}
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
                    className="visit-card"
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
                      <span className="no-print" style={{ fontSize: 12, color: 'var(--muted)', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                        ▼
                      </span>
                    </div>

                    {/* Always show details in print, toggle on screen */}
                    <div className={isOpen ? '' : 'visit-details-collapsed'} style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)' }}>
                      {(() => {
                        // Lazy-load visit details when expanded
                        if (isOpen && !visitDetails[v.id]) {
                          // Fetch details
                          Promise.all([
                            supabase.from('vitals').select('*').eq('visit_id', v.id),
                            supabase.from('diagnoses').select('*').eq('visit_id', v.id),
                            supabase.from('prescriptions').select('*').eq('visit_id', v.id)
                          ]).then(([vitalsRes, diagRes, rxRes]) => {
                            setVisitDetails(prev => ({
                              ...prev,
                              [v.id]: {
                                vitals: vitalsRes.data || [],
                                diagnoses: diagRes.data || [],
                                prescriptions: rxRes.data || []
                              }
                            }))
                          })
                          return <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 12 }}>Loading details…</p>
                        }

                        const det = visitDetails[v.id]
                        return (
                          <>
                            {v.notes_enc && (
                              <div style={{ marginTop: 12 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--muted)', marginBottom: 4 }}>
                                  Notes
                                </div>
                                <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>{v.notes_enc}</p>
                              </div>
                            )}

                            {/* Vitals */}
                            {det?.vitals?.length > 0 && (
                              <div style={{ marginTop: 12 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--muted)', marginBottom: 6 }}>
                                  Vitals
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                  {det.vitals.map(vt => (
                                    <React.Fragment key={vt.id}>
                                      {vt.blood_pressure && <VitalChip label="BP" value={vt.blood_pressure} />}
                                      {vt.temperature && <VitalChip label="Temp" value={`${vt.temperature}°C`} />}
                                      {vt.pulse && <VitalChip label="Pulse" value={`${vt.pulse} bpm`} />}
                                      {vt.weight && <VitalChip label="Weight" value={`${vt.weight} kg`} />}
                                      {vt.height && <VitalChip label="Height" value={`${vt.height} cm`} />}
                                      {vt.spo2 && <VitalChip label="SpO2" value={`${vt.spo2}%`} />}
                                      {vt.respiratory_rate && <VitalChip label="RR" value={vt.respiratory_rate} />}
                                    </React.Fragment>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Diagnoses */}
                            {det?.diagnoses?.length > 0 && (
                              <div style={{ marginTop: 12 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--muted)', marginBottom: 4 }}>
                                  Diagnoses
                                </div>
                                {det.diagnoses.map(d => (
                                  <div key={d.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                                      {d.description_enc}
                                      {d.icd_code && <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--muted)', marginLeft: 6 }}>{d.icd_code}</span>}
                                    </div>
                                    {d.notes_enc && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{d.notes_enc}</div>}
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Prescriptions / Medications */}
                            {det?.prescriptions?.length > 0 && (
                              <div style={{ marginTop: 12 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--muted)', marginBottom: 4 }}>
                                  💊 Medications
                                </div>
                                {det.prescriptions.map(p => (
                                  <div key={p.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{p.drug_enc}</div>
                                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                                      {[p.dosage, p.frequency, p.duration].filter(Boolean).join(' · ')}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {!v.notes_enc && !det?.vitals?.length && !det?.diagnoses?.length && !det?.prescriptions?.length && (
                              <p style={{ marginTop: 12, fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>No additional details recorded.</p>
                            )}
                          </>
                        )
                      })()}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Documents ── */}
        {documents.length > 0 && (
          <div className="card no-print">
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

        {/* ── Update Profile (when admin opened) ── */}
        {student.profile_open && (
          <div className="card no-print" style={{
            border: '1.5px solid var(--warn)', background: 'var(--warn-bg)'
          }}>
            <div className="section-label" style={{ margin: '0 0 8px', color: 'var(--warn)' }}>
              🔓 Profile Open for Update
            </div>
            <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 12 }}>
              The health center staff has opened your profile for updates. You can re-upload a medical document to refresh your personal and clinical details. Your visit history will be preserved.
            </p>
            <button
              className="btn-primary"
              style={{ width: '100%' }}
              onClick={() => navigate('/student/onboarding')}
            >
              📄 Update Profile via Document Upload
            </button>
          </div>
        )}

        {/* ── Account Actions ── */}
        <div className="card no-print">
          <div className="section-label" style={{ margin: '0 0 12px' }}>Account</div>

          {/* Change Password */}
          <div style={{
            padding: '14px 16px', background: 'var(--surface)', borderRadius: 'var(--radius)',
            border: '1px solid var(--border)', marginBottom: 8
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Change Password</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                  We'll send a reset link to {userEmail || 'your email'}
                </div>
              </div>
              <button
                className="btn-secondary"
                style={{ padding: '6px 16px', fontSize: 12, whiteSpace: 'nowrap' }}
                onClick={handleChangePassword}
                disabled={changePwSending}
              >
                {changePwSending ? 'Sending…' : '🔒 Change'}
              </button>
            </div>
            {changePwMsg && (
              <div style={{
                marginTop: 8, padding: '8px 12px', borderRadius: 'var(--radius)', fontSize: 12,
                background: changePwMsg.type === 'success' ? 'var(--green-pale)' : 'var(--alert-bg)',
                color: changePwMsg.type === 'success' ? 'var(--green)' : 'var(--alert)',
                border: `1px solid ${changePwMsg.type === 'success' ? 'var(--green-light)' : 'var(--alert)'}`,
                lineHeight: 1.5
              }}>
                {changePwMsg.type === 'success' ? '✓ ' : '⚠ '}{changePwMsg.text}
              </div>
            )}
          </div>

          {/* Edit notice (only show when profile is locked) */}
          {!student.profile_open && (
            <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6, margin: '8px 0 0' }}>
              📝 Need to update your information? Visit the Health Center and ask staff to open your profile for editing.
            </p>
          )}
        </div>
      </div>

      {/* ── Print Footer ── */}
      <div className="print-only print-footer">
        <div className="print-divider" />
        <p>Printed on {new Date().toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        <p className="print-partner">Powered by OCTAL · Technology Partner</p>
      </div>

      <div className="footer no-print">
        Encrypted · NDPR Compliant · OCTAL {new Date().getFullYear()}
      </div>
    </div>
  )
}

function VitalChip({ label, value }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: '4px 10px',
      fontSize: 11, fontWeight: 500, display: 'inline-flex', gap: 4
    }}>
      <span style={{ color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}:</span>
      <span style={{ color: 'var(--text)', fontFamily: "'DM Mono', monospace" }}>{value}</span>
    </div>
  )
}
