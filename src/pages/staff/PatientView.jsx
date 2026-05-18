import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
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

  const downloadDoc = async (doc) => {
    const { data, error } = await supabase.storage
      .from('medical-documents')
      .createSignedUrl(doc.storage_path_enc, 300) // 5 min expiry

    if (!error && data?.signedUrl) {
      window.open(data.signedUrl, '_blank')
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
        <div className="header-actions">
          <button className="btn-logout" onClick={() => navigate('/staff/search')}>← Search</button>
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
                    {doc.document_type} · {doc.file_size_bytes ? `${Math.round(doc.file_size_bytes / 1024)}KB` : ''} · Confidence: {doc.ai_confidence ? `${Math.round(doc.ai_confidence * 100)}%` : '—'}
                  </div>
                </div>
                <span className="doc-item-dl" onClick={() => downloadDoc(doc)}>Download ↓</span>
              </div>
            ))
          )}
        </div>
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
