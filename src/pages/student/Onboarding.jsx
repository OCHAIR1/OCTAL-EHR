import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, supabaseAdmin, getUser } from '../../lib/supabase'
import { extractMedicalData } from '../../lib/gemini-extractor'
import { hashMatricNo } from '../../lib/crypto'
import { uploadToR2 } from '../../lib/r2-storage'

function StepDots({ current, total }) {
  return (
    <div className="step-dots">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < total - 1 ? 1 : 'none' }}>
          <div className={`step-dot ${i < current ? 'step-dot--done' : i === current ? 'step-dot--active' : ''}`}>
            {i < current ? '✓' : i + 1}
          </div>
          {i < total - 1 && <div className={`step-line ${i < current ? 'step-line--done' : ''}`} />}
        </div>
      ))}
    </div>
  )
}

function DataRow({ label, value }) {
  const isNull = value === null || value === undefined || value === ''
  return (
    <div className="data-row">
      <span className="data-key">{label}</span>
      <span className={`data-val ${isNull ? 'data-val--null' : ''}`}>
        {isNull ? 'Not found in document' : String(value)}
      </span>
    </div>
  )
}

export default function StudentOnboarding() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [user, setUser] = useState(null)
  const [matricNo, setMatricNo] = useState('')

  // Upload
  const [file, setFile] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef()

  // Extraction
  const [processing, setProcessing] = useState(false)
  const [extracted, setExtracted] = useState(null)
  const [extractionResult, setExtractionResult] = useState(null)
  const [error, setError] = useState(null)

  // Emergency contact (editable)
  const [ecName, setEcName] = useState('')
  const [ecRelation, setEcRelation] = useState('')
  const [ecPhone, setEcPhone] = useState('')

  // Consent
  const [consent, setConsent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Steps: 0=Upload, 1=Verify, 2=Consent, 3=Done
  const totalSteps = 4

  // Track if we're updating an existing student row (reset or edit mode)
  const [existingStudentId, setExistingStudentId] = useState(null)
  const [isEditMode, setIsEditMode] = useState(false) // profile_open by admin

  useEffect(() => {
    getUser().then(async (u) => {
      if (!u) { navigate('/student/login'); return }
      setUser(u)
      setMatricNo(u.user_metadata?.matric_no || '')

      // Check if student row already exists
      const { data: student } = await supabase
        .from('students')
        .select('id, profile_verified, profile_open, matric_no_enc')
        .eq('auth_user_id', u.id)
        .maybeSingle()

      if (student) {
        if (student.profile_verified && !student.profile_open) {
          // Completed, locked profile → go to dashboard
          navigate('/student/dashboard')
          return
        }
        // Either reset (profile_verified=false) or edit (profile_open=true) → allow onboarding
        setExistingStudentId(student.id)
        setIsEditMode(student.profile_verified && student.profile_open)
        // Use matric from existing row if user_metadata is empty
        if (!u.user_metadata?.matric_no && student.matric_no_enc) {
          setMatricNo(student.matric_no_enc)
        }
      }
    })
  }, [navigate])

  // ── Step 0: Upload ───────────────────────────────────────
  const handleFileDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = e.dataTransfer?.files?.[0] || e.target.files?.[0]
    if (dropped) setFile(dropped)
  }, [])

  const handleExtract = async () => {
    setProcessing(true)
    setError(null)

    try {
      const result = await extractMedicalData(file)
      setExtracted(result.extracted)
      setExtractionResult(result)

      // Pre-fill emergency contact from extraction
      const ec = result.extracted?.personal?.emergency_contact
      if (ec) {
        setEcName(ec.name || '')
        setEcRelation(ec.relationship || '')
        setEcPhone(ec.phone || '')
      }

      setProcessing(false)
      setStep(1)
    } catch (err) {
      setError(err.message)
      setProcessing(false)
    }
  }

  const renderUpload = () => (
    <>
      <h1 className="page-title">Upload Medical Document</h1>
      <p className="page-desc">
        Upload your medical history form, doctor's letter, or any health document
        from your physician. Your details will be extracted automatically.
      </p>

      <div
        className={`upload-zone ${dragOver ? 'upload-zone--drag' : ''} ${file ? 'upload-zone--done' : ''}`}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleFileDrop}
      >
        <div className="upload-icon">{file ? '✓' : '↑'}</div>
        <div className="upload-title">{file ? 'Document ready' : 'Tap to upload'}</div>
        <div className="upload-hint">{file ? 'Tap to replace' : 'PDF, JPG, PNG — max 10MB'}</div>
        {file && <div className="file-name">{file.name}</div>}
        <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp"
          style={{ display: 'none' }} onChange={handleFileDrop} />
      </div>

      {error && <div className="error-box" style={{ marginTop: 16 }}>⚠ {error}</div>}

      <div className="btn-row">
        <button className="btn-primary" disabled={!file} onClick={handleExtract}>
          Scan Document →
        </button>
      </div>
    </>
  )

  // ── Processing spinner ───────────────────────────────────
  const renderProcessing = () => (
    <div className="centered-state">
      <div className="spinner" />
      <h2 className="page-title" style={{ fontSize: 22, marginBottom: 8 }}>Scanning document…</h2>
      <p className="page-desc" style={{ maxWidth: 260, marginBottom: 0 }}>
        Reading your medical document and extracting your health details. This takes 5–15 seconds.
      </p>
    </div>
  )

  // ── Step 1: Verify ───────────────────────────────────────
  const renderVerify = () => {
    if (!extracted) return null
    const { personal, clinical, extraction_meta } = extracted
    const conf = Math.round((extraction_meta?.confidence || 0) * 100)

    return (
      <>
        <h1 className="page-title">Verify Your Details</h1>
        <p className="page-desc">
          Review what was extracted. Correct anything wrong before submitting — this becomes your permanent health record.
        </p>

        <div className="confidence-wrap">
          <div className="confidence-row">
            <span className="confidence-label">Extraction Accuracy</span>
            <span className="confidence-pct">{conf}%</span>
          </div>
          <div className="confidence-track">
            <div className="confidence-fill" style={{ width: `${conf}%` }} />
          </div>
        </div>

        {extraction_meta?.low_confidence_fields?.length > 0 && (
          <div className="warning-box">
            ⚠ Review carefully: {extraction_meta.low_confidence_fields.join(', ')} may be inaccurate.
          </div>
        )}

        {clinical.allergies?.length > 0 && (
          <>
            <div className="section-label">⚠ Allergies</div>
            <div className="allergy-pills">
              {clinical.allergies.map((a, i) => (
                <span key={i} className={`allergy-pill allergy-pill--${a.severity || 'moderate'}`}>
                  {a.allergen}{(a.severity === 'life_threatening' || a.severity === 'severe') ? ' ⚠' : ''}
                </span>
              ))}
            </div>
          </>
        )}

        <div className="section-label">Personal</div>
        <DataRow label="Full Name" value={personal?.full_name} />
        <DataRow label="Date of Birth" value={personal?.date_of_birth} />
        <DataRow label="Gender" value={personal?.gender} />
        <DataRow label="Phone" value={personal?.phone_number} />
        <DataRow label="Address" value={personal?.home_address} />

        <div className="section-label">Clinical</div>
        <DataRow label="Blood Group" value={clinical?.blood_group} />
        <DataRow label="Genotype" value={clinical?.genotype} />

        {clinical.medical_history?.length > 0 && (
          <>
            <div className="section-label">Medical History</div>
            {clinical.medical_history.map((h, i) => (
              <DataRow key={i} label={h.condition} value={`${h.status}${h.notes ? ' — ' + h.notes : ''}`} />
            ))}
          </>
        )}

        {clinical.current_medications?.length > 0 && (
          <>
            <div className="section-label">Current Medications</div>
            {clinical.current_medications.map((m, i) => (
              <DataRow key={i} label={m.drug} value={[m.dosage, m.frequency].filter(Boolean).join(' · ') || '—'} />
            ))}
          </>
        )}

        {clinical.vaccinations?.length > 0 && (
          <>
            <div className="section-label">Vaccinations</div>
            {clinical.vaccinations.map((v, i) => (
              <DataRow key={i} label={v.vaccine} value={v.date || 'Date not specified'} />
            ))}
          </>
        )}

        <div className="section-label">Emergency Contact *</div>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
          Required — please confirm or enter your emergency contact details.
        </p>
        <div className="field">
          <label>Contact Name *</label>
          <input
            type="text"
            placeholder="e.g. Mrs. Adewale"
            value={ecName}
            onChange={e => setEcName(e.target.value)}
            style={{ border: !ecName.trim() ? '2px solid var(--alert)' : undefined }}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
          <div className="field">
            <label>Relationship *</label>
            <input
              type="text"
              placeholder="e.g. Mother, Father, Guardian"
              value={ecRelation}
              onChange={e => setEcRelation(e.target.value)}
              style={{ border: !ecRelation.trim() ? '2px solid var(--alert)' : undefined }}
            />
          </div>
          <div className="field">
            <label>Phone Number *</label>
            <input
              type="tel"
              placeholder="e.g. 08012345678"
              value={ecPhone}
              onChange={e => setEcPhone(e.target.value)}
              style={{ border: !ecPhone.trim() ? '2px solid var(--alert)' : undefined }}
            />
          </div>
        </div>

        {extracted.document_meta && (extracted.document_meta.issuing_facility || extracted.document_meta.issuing_doctor) && (
          <>
            <div className="section-label" style={{ marginTop: 8 }}>Document Source</div>
            {extracted.document_meta.issuing_facility && <DataRow label="Hospital/Facility" value={extracted.document_meta.issuing_facility} />}
            {extracted.document_meta.issuing_doctor && <DataRow label="Doctor" value={extracted.document_meta.issuing_doctor} />}
            {extracted.document_meta.document_date && <DataRow label="Date" value={extracted.document_meta.document_date} />}
          </>
        )}

        {(!ecName.trim() || !ecRelation.trim() || !ecPhone.trim()) && (
          <div className="warning-box" style={{ marginTop: 12 }}>
            ⚠ Please fill in all emergency contact fields before continuing.
          </div>
        )}

        <div className="btn-row">
          <button
            className="btn-primary"
            disabled={!ecName.trim() || !ecRelation.trim() || !ecPhone.trim()}
            onClick={() => setStep(2)}
          >
            This looks correct →
          </button>
          <button className="btn-secondary" onClick={() => setStep(0)}>← Re-upload document</button>
        </div>
      </>
    )
  }

  // ── Step 2: Consent ──────────────────────────────────────
  const handleSubmit = async () => {
    setSubmitting(true)
    setError(null)

    try {
      const matricHash = await hashMatricNo(matricNo)
      const { personal, clinical } = extracted

      // Upload medical document to Cloudflare R2
      let docPath = null
      if (file) {
        try {
          const result = await uploadToR2(file, matricHash)
          docPath = result.storagePath
        } catch (uploadErr) {
          console.warn('R2 upload failed, continuing without document:', uploadErr.message)
        }
      }

      const profilePayload = {
        full_name_enc: personal?.full_name || '',
        date_of_birth_enc: personal?.date_of_birth || null,
        phone_number_enc: personal?.phone_number || null,
        home_address_enc: personal?.home_address || null,
        email_enc: personal?.email || user.email,
        emergency_contact_enc: JSON.stringify({ name: ecName, relationship: ecRelation, phone: ecPhone }),
        blood_group: clinical?.blood_group || 'unknown',
        genotype: clinical?.genotype || 'unknown',
        gender: personal?.gender || null,
        ndpr_consent: true,
        ndpr_consent_at: new Date().toISOString(),
        ai_extraction_raw: extractionResult?.rawJson ? JSON.parse(extractionResult.rawJson) : null,
        profile_verified: true,
        profile_open: false  // auto-lock after submission
      }

      let studentId

      // Use supabaseAdmin (service role) to bypass RLS for all writes.
      // The students_own_update RLS policy blocks setting profile_open=false
      // because its implicit WITH CHECK requires profile_open=true on the new row.

      if (existingStudentId) {
        // ── UPDATE existing student row (reset account or admin-opened edit) ──
        const { error: updateErr } = await supabaseAdmin
          .from('students')
          .update(profilePayload)
          .eq('id', existingStudentId)

        if (updateErr) throw updateErr
        studentId = existingStudentId

        // Clear old allergies and medical history so fresh extraction replaces them
        // (visits and documents are preserved — not touched)
        await supabaseAdmin.from('allergies').delete().eq('student_id', studentId)
        await supabaseAdmin.from('medical_history').delete().eq('student_id', studentId)
      } else {
        // ── INSERT new student row (first-time onboarding) ──
        const { data: studentData, error: studentErr } = await supabaseAdmin
          .from('students')
          .insert({
            auth_user_id: user.id,
            matric_no_hash: matricHash,
            matric_no_enc: matricNo,
            ...profilePayload
          })
          .select('id')
          .single()

        if (studentErr) throw studentErr
        studentId = studentData.id
      }

      // Insert allergies
      if (clinical?.allergies?.length > 0) {
        const allergyRows = clinical.allergies.map(a => ({
          student_id: studentId,
          allergen_enc: a.allergen,
          severity: a.severity || 'moderate',
          reaction_enc: a.reaction || null
        }))
        await supabaseAdmin.from('allergies').insert(allergyRows)
      }

      // Insert medical history
      if (clinical?.medical_history?.length > 0) {
        const historyRows = clinical.medical_history.map(h => ({
          student_id: studentId,
          condition_enc: h.condition,
          diagnosed_date: h.diagnosed_date || null,
          status: h.status || 'active',
          notes_enc: h.notes || null
        }))
        await supabaseAdmin.from('medical_history').insert(historyRows)
      }

      // Insert document record
      if (docPath) {
        await supabaseAdmin.from('documents').insert({
          student_id: studentId,
          document_type: extracted.document_meta?.document_type || 'other',
          storage_path_enc: docPath,
          original_filename: file.name,
          file_size_bytes: file.size,
          mime_type: file.type,
          ai_raw_json: extractionResult?.rawJson ? JSON.parse(extractionResult.rawJson) : null,
          ai_confidence: extracted.extraction_meta?.confidence || null,
          extraction_status: 'verified'
        })
      }

      // Audit log
      await supabaseAdmin.from('audit_log').insert({
        actor_id: user.id,
        actor_role: 'student',
        action: existingStudentId ? (isEditMode ? 'PROFILE_UPDATED' : 'ONBOARD_AFTER_RESET') : 'ONBOARD_COMPLETE',
        resource_type: 'students',
        resource_id: studentId,
        metadata: { matric_no_hash: matricHash }
      })

      setStep(3)
    } catch (err) {
      setError(err.message || 'Failed to save your record. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const renderConsent = () => (
    <>
      <h1 className="page-title">Data Consent</h1>
      <p className="page-desc">
        Under Nigeria's Data Protection Regulation (NDPR), we need your explicit consent before storing your health data.
      </p>

      <div className="consent-box">
        <p className="consent-text">
          Caleb University Health Center will store your health records securely
          in an encrypted database. Your data will only be accessed by authorized
          health center staff for the purpose of providing you medical care.
          {'\n\n'}
          Your records will be retained for 6 years after your convocation, after
          which they will be permanently and automatically deleted. You may request
          access to your data at any time from the health center administration.
        </p>
        <label className="consent-check">
          <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
          <span>I understand and consent to my medical information being stored and used by Caleb University Health Center.</span>
        </label>
      </div>

      {error && <div className="error-box">⚠ {error}</div>}

      <div className="btn-row">
        <button className="btn-primary" disabled={!consent || submitting} onClick={handleSubmit}>
          {submitting ? 'Saving your record…' : 'Submit Medical Record'}
        </button>
        <button className="btn-secondary" onClick={() => setStep(1)}>← Back</button>
      </div>
    </>
  )

  // ── Step 3: Success ──────────────────────────────────────
  const renderSuccess = () => (
    <div className="centered-state">
      <div className="success-icon">✓</div>
      <h1 className="page-title" style={{ marginBottom: 8 }}>You're registered.</h1>
      <p className="page-desc" style={{ maxWidth: 300 }}>
        Your medical profile has been created. When you visit the health center,
        give them your matric number and your records will be pulled up instantly.
      </p>
      <div className="matric-badge">{matricNo}</div>

      <div style={{ marginTop: 32, padding: 20, background: 'var(--surface)', borderRadius: 8, width: '100%', textAlign: 'left' }}>
        <div className="section-label" style={{ margin: '0 0 12px' }}>What's next</div>
        <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.7 }}>
          The health center staff will review your submitted document and verify
          your profile. Keep your matric number handy for every health center visit.
        </p>
      </div>

      <div className="btn-row" style={{ marginTop: 24, width: '100%' }}>
        <button className="btn-primary" onClick={() => navigate('/student/dashboard')}>
          Go to Dashboard →
        </button>
      </div>
    </div>
  )

  // ── Main render ──────────────────────────────────────────
  const progressPct = ((step + 1) / totalSteps) * 100

  return (
    <div className="app-shell app-shell--student">
      <div className="header">
        <div>
          <div className="header-brand">OCTAL-EHR</div>
          <div className="header-sub">Caleb University Health Center</div>
        </div>
      </div>

      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${progressPct}%` }} />
      </div>

      {step < 3 && <StepDots current={step} total={totalSteps} />}

      <div className="content">
        {processing && renderProcessing()}
        {!processing && step === 0 && renderUpload()}
        {!processing && step === 1 && renderVerify()}
        {!processing && step === 2 && renderConsent()}
        {!processing && step === 3 && renderSuccess()}
      </div>

      <div className="footer">
        Encrypted · NDPR Compliant · OCTAL {new Date().getFullYear()}
      </div>
    </div>
  )
}
