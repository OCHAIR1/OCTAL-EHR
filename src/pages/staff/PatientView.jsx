import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase, supabaseAdmin } from '../../lib/supabase'
import { purgeStudentFiles } from '../../lib/offlineCache'
import { getR2DownloadUrl, deleteFromR2 } from '../../lib/r2-storage'
import AllergyBanner from '../../components/AllergyBanner'
import VisitHistory from './VisitHistory'
import NewVisitForm from './NewVisitForm'

export default function PatientView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [patient, setPatient] = useState(null)
  const [allergies, setAllergies] = useState([])
  const [history, setHistory] = useState([])
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showNewVisit, setShowNewVisit] = useState(false)
  const [visitRefreshKey, setVisitRefreshKey] = useState(0)

  // Account reset state
  const [showResetModal, setShowResetModal] = useState(false)
  const [resetConfirmMatric, setResetConfirmMatric] = useState('')
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState(null)

  useEffect(() => {
    loadPatient()
  }, [id])

  const loadPatient = async () => {
    setLoading(true)
    try {
      // Fetch student
      const { data: student, error: sErr } = await supabase
        .from('students')
        .select('*')
        .eq('id', id)
        .single()
      if (sErr) throw sErr
      setPatient(student)

      // Fetch allergies
      const { data: allergyData } = await supabase
        .from('allergies')
        .select('*')
        .eq('student_id', id)
      setAllergies(allergyData || [])

      // Fetch medical history
      const { data: histData } = await supabase
        .from('medical_history')
        .select('*')
        .eq('student_id', id)
      setHistory(histData || [])

      // Fetch documents
      const { data: docData } = await supabase
        .from('documents')
        .select('*')
        .eq('student_id', id)
        .order('created_at', { ascending: false })
      setDocuments(docData || [])

    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const toggleProfileOpen = async (open) => {
    const { error: toggleErr } = await supabase
      .from('students')
      .update({ profile_open: open, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (!toggleErr) {
      setPatient(prev => ({ ...prev, profile_open: open }))

      // Audit log
      const user = (await supabase.auth.getUser()).data.user
      await supabase.from('audit_log').insert({
        actor_id: user?.id,
        actor_role: 'staff',
        action: open ? 'PROFILE_OPENED' : 'PROFILE_CLOSED',
        resource_type: 'students',
        resource_id: id,
        metadata: { profile_open: open }
      })
    }
  }

  // ── Account Reset ────────────────────────────────────────
  const handleAccountReset = async () => {
    setResetting(true)
    setResetError(null)

    try {
      // 1. Delete all allergies
      await supabase.from('allergies').delete().eq('student_id', id)

      // 2. Delete all medical history
      await supabase.from('medical_history').delete().eq('student_id', id)

      // 3. Delete uploaded files from R2 and document records
      const r2Paths = documents
        .map(doc => doc.storage_path_enc)
        .filter(Boolean)
      if (r2Paths.length > 0) {
        try { await deleteFromR2(r2Paths) } catch {}
      }
      await supabase.from('documents').delete().eq('student_id', id)

      // 3b. Purge local file cache for this student
      await purgeStudentFiles(id)

      // 4. Delete all visits (cascades to vitals, diagnoses, prescriptions)
      await supabase.from('visits').delete().eq('student_id', id)

      // 5. Reset the student row — keep matric hash + matric_no_enc, wipe everything else
      const { error: updateErr } = await supabase.from('students').update({
        full_name_enc: '',
        date_of_birth_enc: null,
        phone_number_enc: null,
        home_address_enc: null,
        email_enc: null,
        photo_url_enc: null,
        emergency_contact_enc: null,
        blood_group: 'unknown',
        genotype: 'unknown',
        gender: null,
        department: null,
        faculty: null,
        level: null,
        ndpr_consent: false,
        ndpr_consent_at: null,
        ai_extraction_raw: null,
        profile_verified: false,
        profile_open: true,
        updated_at: new Date().toISOString()
      }).eq('id', id)

      if (updateErr) throw updateErr

      // 6. Reset password to default — direct admin control, no email needed
      if (patient.auth_user_id) {
        await supabaseAdmin.auth.admin.updateUserById(patient.auth_user_id, {
          password: 'Calebuniv'
        })
      }

      // 7. Audit log
      const user = (await supabase.auth.getUser()).data.user
      await supabase.from('audit_log').insert({
        actor_id: user?.id,
        actor_role: 'staff',
        action: 'ACCOUNT_RESET',
        resource_type: 'students',
        resource_id: id,
        metadata: { matric_no_hash: patient.matric_no_hash, matric_no_enc: patient.matric_no_enc }
      })

      // Done — redirect back to search
      setShowResetModal(false)
      navigate('/staff/search')
    } catch (err) {
      setResetError(err.message || 'Reset failed. Try again.')
    } finally {
      setResetting(false)
    }
  }

  const downloadDoc = async (doc) => {
    try {
      const url = await getR2DownloadUrl(doc.storage_path_enc)
      window.open(url, '_blank')
    } catch (err) {
      console.error('Download failed:', err)
    }
  }

  const getPhotoUrl = () => {
    if (!patient?.photo_url_enc) return null
    const { data } = supabase.storage
      .from('profile-photos')
      .getPublicUrl(patient.photo_url_enc)
    return data?.publicUrl
  }

  if (loading) {
    return (
      <div className="app-shell app-shell--staff">
        <div className="header">
          <div>
            <div className="header-brand">OCTAL-EHR</div>
            <div className="header-sub">Patient Record</div>
          </div>
        </div>
        <div className="content content--staff">
          <div className="centered-state">
            <div className="spinner" />
            <p className="page-desc">Loading patient record…</p>
          </div>
        </div>
      </div>
    )
  }

  if (error || !patient) {
    return (
      <div className="app-shell app-shell--staff">
        <div className="header">
          <div>
            <div className="header-brand">OCTAL-EHR</div>
            <div className="header-sub">Patient Record</div>
          </div>
        </div>
        <div className="content content--staff">
          <div className="error-box">⚠ {error || 'Patient not found'}</div>
          <button className="btn-secondary" onClick={() => navigate('/staff/search')}>← Back to Search</button>
        </div>
      </div>
    )
  }

  const photoUrl = getPhotoUrl()

  return (
    <div className="app-shell app-shell--staff">
      <div className="header">
        <div>
          <div className="header-brand">OCTAL-EHR</div>
          <div className="header-sub">Patient Record</div>
        </div>
      </div>

      <div className="content content--staff">
        {/* ALLERGIES — ALWAYS FIRST, NON-NEGOTIABLE */}
        <AllergyBanner allergies={allergies.map(a => ({
          allergen: a.allergen_enc,
          severity: a.severity
        }))} />

        {/* Patient header */}
        <div className="card">
          <div className="patient-header">
            {photoUrl ? (
              <img src={photoUrl} alt="Patient" className="patient-photo" />
            ) : (
              <div className="patient-photo" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, color: 'var(--border)' }}>
                👤
              </div>
            )}
            <div className="patient-info">
              <h2>{patient.full_name_enc || 'Unknown'}</h2>
              <div className="patient-matric">{patient.matric_no_enc}</div>
              <div className="patient-meta">
                <span>Blood: <strong>{patient.blood_group || '—'}</strong></span>
                <span>Genotype: <strong>{patient.genotype || '—'}</strong></span>
                <span>Gender: <strong>{patient.gender || '—'}</strong></span>
              </div>
              <div className="patient-meta" style={{ marginTop: 4 }}>
                <span>Dept: <strong>{patient.department || '—'}</strong></span>
                <span>Level: <strong>{patient.level || '—'}</strong></span>
                <span>Status: <strong style={{ textTransform: 'capitalize' }}>{patient.status}</strong></span>
              </div>
            </div>
          </div>

          {/* Profile Open/Close Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, padding: '12px 16px', background: patient.profile_open ? 'var(--warn-bg)' : 'var(--green-pale)', borderRadius: 'var(--radius)', border: `1.5px solid ${patient.profile_open ? 'var(--warn)' : 'var(--green-light)'}` }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: patient.profile_open ? 'var(--warn)' : 'var(--green)', marginBottom: 2 }}>
                {patient.profile_open ? '🔓 Profile Open — Student can edit' : '🔒 Profile Locked — Read only'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                {patient.profile_open ? 'Student can currently modify their profile data.' : 'Student cannot modify their profile until you re-open it.'}
              </div>
            </div>
            {patient.profile_open ? (
              <button onClick={() => toggleProfileOpen(false)} style={{ background: 'var(--warn)', color: 'white', border: 'none', padding: '8px 16px', borderRadius: 'var(--radius)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: "'Outfit', sans-serif", whiteSpace: 'nowrap' }}>
                🔒 Close Profile
              </button>
            ) : (
              <button onClick={() => toggleProfileOpen(true)} style={{ background: 'var(--green)', color: 'white', border: 'none', padding: '8px 16px', borderRadius: 'var(--radius)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: "'Outfit', sans-serif", whiteSpace: 'nowrap' }}>
                🔓 Open for Edit
              </button>
            )}
          </div>
        </div>

        {/* Emergency Contact */}
        {patient.emergency_contact_enc && (
          <div className="card">
            <div className="section-label" style={{ margin: '0 0 12px' }}>Emergency Contact</div>
            {(() => {
              try {
                const ec = typeof patient.emergency_contact_enc === 'string'
                  ? JSON.parse(patient.emergency_contact_enc)
                  : patient.emergency_contact_enc
                return (
                  <>
                    <DataRow label="Name" value={ec.name} />
                    <DataRow label="Relation" value={ec.relationship} />
                    <DataRow label="Phone" value={ec.phone} />
                  </>
                )
              } catch { return <p style={{ fontSize: 13, color: 'var(--muted)' }}>Unable to parse contact info</p> }
            })()}
          </div>
        )}

        {/* Medical History */}
        {history.length > 0 && (
          <div className="card">
            <div className="section-label" style={{ margin: '0 0 12px' }}>Medical History</div>
            {history.map((h, i) => (
              <DataRow key={i} label={h.condition_enc} value={`${h.status} ${h.notes_enc ? '— ' + h.notes_enc : ''}`} />
            ))}
          </div>
        )}

        {/* Current Medications — from extraction data */}
        {(() => {
          const raw = patient.ai_extraction_raw
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

        {/* Vaccinations — from extraction data */}
        {(() => {
          const raw = patient.ai_extraction_raw
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

        {/* VISITS — Phase 2 */}
        {showNewVisit ? (
          <NewVisitForm
            studentId={id}
            onComplete={() => { setShowNewVisit(false); setVisitRefreshKey(k => k + 1) }}
            onCancel={() => setShowNewVisit(false)}
          />
        ) : (
          <button className="btn-primary" style={{ marginBottom: 16 }} onClick={() => setShowNewVisit(true)}>
            + Log New Visit
          </button>
        )}

        <VisitHistory studentId={id} refreshKey={visitRefreshKey} />

        {/* Documents */}
        <div className="card">
          <div className="section-label" style={{ margin: '0 0 12px' }}>Uploaded Documents</div>
          {documents.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>No documents uploaded</p>
          ) : (
            documents.map((doc, i) => (
              <div key={i} className="doc-item">
                <div>
                  <div className="doc-item-name">{doc.original_filename || 'Document'}</div>
                  <div className="doc-item-meta">
                    {doc.document_type} · {doc.file_size_bytes ? `${Math.round(doc.file_size_bytes / 1024)}KB` : ''}
                  </div>
                </div>
                <span className="doc-item-dl" onClick={() => downloadDoc(doc)}>Download ↓</span>
              </div>
            ))
          )}
        </div>

        {/* ── Account Reset ── */}
        <div style={{
          marginTop: 32, padding: 20, borderRadius: 'var(--radius-lg)',
          border: '1.5px solid var(--alert)', background: 'var(--alert-bg)'
        }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--alert)', marginBottom: 4 }}>
            ⚠ Danger Zone
          </div>
          <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 12 }}>
            Reset this student's account. This permanently deletes all their medical data,
            uploaded documents, visit history, and resets their password to the default.
            The student will need to onboard again from scratch.
          </p>
          <button
            onClick={() => { setShowResetModal(true); setResetConfirmMatric(''); setResetError(null) }}
            style={{
              background: 'var(--alert)', color: 'white', border: 'none',
              padding: '10px 20px', borderRadius: 'var(--radius)',
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
              fontFamily: "'Outfit', sans-serif"
            }}
          >
            ⚠ Reset Student Account
          </button>
        </div>

        {/* ── Reset Confirmation Modal ── */}
        {showResetModal && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, padding: 20
          }}>
            <div style={{
              background: 'var(--white)', borderRadius: 'var(--radius-lg)',
              padding: 32, maxWidth: 420, width: '100%',
              boxShadow: '0 24px 48px rgba(0,0,0,0.15)'
            }}>
              <h3 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, marginBottom: 8, color: 'var(--alert)' }}>
                ⚠ Reset Account
              </h3>
              <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 16 }}>
                This will <strong style={{ color: 'var(--alert)' }}>permanently delete</strong> all medical data
                for <strong>{patient.matric_no_enc}</strong> and reset their password to the default.
                The student will need to onboard again. <strong>This cannot be undone.</strong>
              </p>

              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
                Type the matric number to confirm:
              </p>
              <input
                type="text"
                placeholder={patient.matric_no_enc}
                value={resetConfirmMatric}
                onChange={e => setResetConfirmMatric(e.target.value.toUpperCase())}
                style={{
                  width: '100%', height: 48, border: '2px solid var(--alert)',
                  borderRadius: 'var(--radius)', padding: '0 16px',
                  fontFamily: "'DM Mono', monospace", fontSize: 14,
                  letterSpacing: 1, textTransform: 'uppercase',
                  color: 'var(--text)', background: 'var(--white)', outline: 'none',
                  marginBottom: 16
                }}
              />

              {resetError && <div className="error-box">⚠ {resetError}</div>}

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  disabled={resetConfirmMatric !== patient.matric_no_enc || resetting}
                  onClick={handleAccountReset}
                  style={{
                    flex: 1, height: 48, background: resetConfirmMatric === patient.matric_no_enc ? 'var(--alert)' : 'var(--border)',
                    color: resetConfirmMatric === patient.matric_no_enc ? 'white' : 'var(--muted)',
                    border: 'none', borderRadius: 'var(--radius)',
                    fontSize: 13, fontWeight: 700, cursor: resetConfirmMatric === patient.matric_no_enc ? 'pointer' : 'not-allowed',
                    fontFamily: "'Outfit', sans-serif"
                  }}
                >
                  {resetting ? 'Resetting…' : 'Permanently Reset'}
                </button>
                <button
                  onClick={() => setShowResetModal(false)}
                  style={{
                    flex: 1, height: 48, background: 'transparent',
                    color: 'var(--text)', border: '2px solid var(--border)',
                    borderRadius: 'var(--radius)', fontSize: 13, fontWeight: 700,
                    cursor: 'pointer', fontFamily: "'Outfit', sans-serif"
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function DataRow({ label, value }) {
  const isNull = !value || value === 'null' || value === 'undefined'
  return (
    <div className="data-row">
      <span className="data-key">{label}</span>
      <span className={`data-val ${isNull ? 'data-val--null' : ''}`}>
        {isNull ? '—' : String(value)}
      </span>
    </div>
  )
}
