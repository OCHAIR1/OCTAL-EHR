import { useState, useRef, useEffect } from 'react'
import { supabase, supabaseAdmin } from '../../lib/supabase'
import { searchDrugs } from '../../lib/drug-dictionary'
import { isClinicPC } from '../../components/StaffSidebar'

// ── Offline visit queue ──────────────────────────────────────
// When offline on a Clinic PC, visits are saved to localStorage
// and synced when internet returns.

function queueOfflineVisit(visitData) {
  try {
    const queue = JSON.parse(localStorage.getItem('octal_visit_queue') || '[]')
    queue.push({ ...visitData, queuedAt: Date.now() })
    localStorage.setItem('octal_visit_queue', JSON.stringify(queue))
  } catch {}
}

export async function syncOfflineVisits() {
  if (!navigator.onLine) return
  try {
    const queue = JSON.parse(localStorage.getItem('octal_visit_queue') || '[]')
    if (queue.length === 0) return

    const synced = []
    for (const entry of queue) {
      try {
        await saveVisitToDb(entry)
        synced.push(entry.queuedAt)
      } catch {
        // leave failed ones in queue
      }
    }

    // Remove synced entries
    const remaining = queue.filter(e => !synced.includes(e.queuedAt))
    localStorage.setItem('octal_visit_queue', JSON.stringify(remaining))
  } catch {}
}

async function saveVisitToDb({ studentId, complaint, notes, vitals, diagnoses, prescriptions }) {
  const user = (await supabase.auth.getUser()).data.user
  const { data: staffData } = await supabase
    .from('staff')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  const staffId = staffData?.id || null

  // 1. Create visit — use supabaseAdmin to bypass RLS, correct column names from Phase 1 schema
  const { data: visit, error: visitErr } = await supabaseAdmin
    .from('visits')
    .insert({
      student_id: studentId,
      presenting_complaint_enc: complaint || 'General Visit',
      notes_enc: notes || null,
      attending_staff_id: staffId,
      visit_date: new Date().toISOString(),
      status: 'open'
    })
    .select('id')
    .single()

  if (visitErr) throw visitErr

  // 2. Insert vitals (only if any were recorded)
  const hasVitals = Object.values(vitals).some(v => v !== '')
  if (hasVitals) {
    await supabaseAdmin.from('vitals').insert({
      visit_id: visit.id,
      blood_pressure: vitals.blood_pressure || null,
      temperature: vitals.temperature ? parseFloat(vitals.temperature) : null,
      weight: vitals.weight ? parseFloat(vitals.weight) : null,
      height: vitals.height ? parseFloat(vitals.height) : null,
      pulse: vitals.pulse ? parseInt(vitals.pulse) : null,
      respiratory_rate: vitals.respiratory_rate ? parseInt(vitals.respiratory_rate) : null,
      spo2: vitals.spo2 ? parseInt(vitals.spo2) : null,
      recorded_by: staffId
    })
  }

  // 3. Insert diagnoses (only if any were entered)
  const validDiagnoses = diagnoses.filter(d => d.description.trim())
  if (validDiagnoses.length > 0) {
    await supabaseAdmin.from('diagnoses').insert(
      validDiagnoses.map(d => ({
        visit_id: visit.id,
        description_enc: d.description,
        icd_code: d.icd_code || null,
        notes_enc: d.notes || null,
        diagnosed_by: staffId
      }))
    )
  }

  // 4. Insert prescriptions (only if any were entered)
  const validPrescriptions = prescriptions.filter(p => p.drug.trim())
  if (validPrescriptions.length > 0) {
    await supabaseAdmin.from('prescriptions').insert(
      validPrescriptions.map(p => ({
        visit_id: visit.id,
        drug_enc: p.drug,
        dosage: p.dosage || null,
        frequency: p.frequency || null,
        duration: p.duration || null,
        prescribed_by: staffId
      }))
    )
  }

  // 5. Audit log
  await supabase.from('audit_log').insert({
    actor_id: user.id,
    actor_role: 'staff',
    action: 'CREATE_VISIT',
    resource_type: 'visits',
    resource_id: visit.id,
    metadata: { student_id: studentId }
  })

  return visit.id
}

// ── Drug Autocomplete Component ──────────────────────────────

function DrugInput({ value, onChange, placeholder }) {
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(-1)
  const wrapperRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleChange = (e) => {
    const val = e.target.value
    onChange(val)
    const results = searchDrugs(val)
    setSuggestions(results)
    setShowSuggestions(results.length > 0)
    setSelectedIdx(-1)
  }

  const handleKeyDown = (e) => {
    if (!showSuggestions) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx(prev => Math.min(prev + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx(prev => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter' && selectedIdx >= 0) {
      e.preventDefault()
      onChange(suggestions[selectedIdx])
      setShowSuggestions(false)
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }

  const selectSuggestion = (drug) => {
    onChange(drug)
    setShowSuggestions(false)
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          const results = searchDrugs(value)
          if (results.length > 0) { setSuggestions(results); setShowSuggestions(true) }
        }}
      />
      {showSuggestions && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
          background: 'var(--white)', border: '1.5px solid var(--green-light)',
          borderRadius: 'var(--radius)', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          maxHeight: 200, overflowY: 'auto', marginTop: 4
        }}>
          {suggestions.map((drug, i) => (
            <div
              key={i}
              onClick={() => selectSuggestion(drug)}
              style={{
                padding: '10px 14px', cursor: 'pointer', fontSize: 13,
                fontFamily: "'Outfit', sans-serif", color: 'var(--text)',
                background: i === selectedIdx ? 'var(--green-pale)' : 'transparent',
                borderBottom: i < suggestions.length - 1 ? '1px solid var(--border)' : 'none',
                transition: 'background 0.1s'
              }}
              onMouseEnter={() => setSelectedIdx(i)}
            >
              {drug}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main Form Component ──────────────────────────────────────

export default function NewVisitForm({ studentId, onComplete, onCancel }) {
  const [step, setStep] = useState(0) // 0: complaint, 1: vitals, 2: diagnosis, 3: prescriptions, 4: review
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Complaint
  const [complaint, setComplaint] = useState('')
  const [notes, setNotes] = useState('')

  // Vitals
  const [vitals, setVitals] = useState({
    blood_pressure: '', temperature: '', weight: '', height: '',
    pulse: '', respiratory_rate: '', spo2: ''
  })

  // Diagnoses
  const [diagnoses, setDiagnoses] = useState([{ description: '', icd_code: '', notes: '' }])

  // Prescriptions
  const [prescriptions, setPrescriptions] = useState([{ drug: '', dosage: '', frequency: '', duration: '' }])

  const updateVital = (key, val) => setVitals(prev => ({ ...prev, [key]: val }))

  const addDiagnosis = () => setDiagnoses(prev => [...prev, { description: '', icd_code: '', notes: '' }])
  const updateDiagnosis = (i, key, val) => setDiagnoses(prev => prev.map((d, idx) => idx === i ? { ...d, [key]: val } : d))
  const removeDiagnosis = (i) => setDiagnoses(prev => prev.filter((_, idx) => idx !== i))

  const addPrescription = () => setPrescriptions(prev => [...prev, { drug: '', dosage: '', frequency: '', duration: '' }])
  const updatePrescription = (i, key, val) => setPrescriptions(prev => prev.map((p, idx) => idx === i ? { ...p, [key]: val } : p))
  const removePrescription = (i) => setPrescriptions(prev => prev.filter((_, idx) => idx !== i))

  const handleSave = async () => {
    setSaving(true)
    setError(null)

    const visitData = { studentId, complaint, notes, vitals, diagnoses, prescriptions }

    try {
      if (navigator.onLine) {
        await saveVisitToDb(visitData)
      } else {
        // Offline — only on Clinic PC
        if (!isClinicPC()) {
          setError('You are offline and this device is not set as a Clinic PC. Connect to the internet to save.')
          setSaving(false)
          return
        }
        queueOfflineVisit(visitData)
      }

      if (onComplete) onComplete()
    } catch (err) {
      setError(err.message || 'Failed to save visit.')
    } finally {
      setSaving(false)
    }
  }

  // Try syncing queued visits when this component mounts (if online)
  useEffect(() => { syncOfflineVisits() }, [])

  const renderStepIndicator = () => {
    const steps = ['Complaint', 'Vitals', 'Diagnosis', 'Rx', 'Review']
    return (
      <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
        {steps.map((s, i) => (
          <div key={i} style={{
            flex: 1, textAlign: 'center', padding: '8px 0',
            fontSize: 11, fontWeight: 700, letterSpacing: 1,
            textTransform: 'uppercase',
            background: i === step ? 'var(--green)' : i < step ? 'var(--green-light)' : 'var(--surface)',
            color: i <= step ? 'white' : 'var(--muted)',
            borderRadius: 'var(--radius)',
            cursor: i < step ? 'pointer' : 'default',
            transition: 'all 0.2s'
          }} onClick={() => i < step && setStep(i)}>
            {s}
          </div>
        ))}
      </div>
    )
  }

  // ── Step 0: Complaint ───────────────────────────────
  const renderComplaint = () => (
    <>
      <h2 className="page-title" style={{ fontSize: 22 }}>Chief Complaint</h2>
      <p className="page-desc">What is the student presenting with? Leave complaint blank for a general visit.</p>

      <div className="field">
        <label>Complaint (optional)</label>
        <input
          type="text"
          placeholder="e.g. Headache, fever, suspected malaria — leave blank for General Visit"
          value={complaint}
          onChange={e => setComplaint(e.target.value)}
        />
      </div>

      <div className="field">
        <label>Clinical Notes *</label>
        <textarea
          style={{
            width: '100%', minHeight: 100, border: `2px solid ${notes.trim() ? 'var(--green-light)' : 'var(--border)'}`,
            borderRadius: 'var(--radius)', padding: 16, fontFamily: "'Outfit', sans-serif",
            fontSize: 14, resize: 'vertical', outline: 'none', color: 'var(--text)'
          }}
          placeholder="Observations, history of present illness, reason for visit..."
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />
        {!notes.trim() && <div style={{ fontSize: 11, color: 'var(--alert)', marginTop: 4 }}>Notes are required for every visit</div>}
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
        <button className="btn-primary" disabled={!notes.trim()} onClick={() => setStep(1)}>
          Next: Vitals →
        </button>
        <button className="btn-primary" disabled={!notes.trim()} style={{ marginTop: 0, background: 'var(--green-light)' }} onClick={() => setStep(4)}>
          Skip to Review →
        </button>
        <button className="btn-secondary" style={{ marginTop: 0 }} onClick={onCancel}>Cancel</button>
      </div>
    </>
  )

  // ── Step 1: Vitals ──────────────────────────────────
  const renderVitals = () => {
    // Auto-calculate BMI
    const bmi = (vitals.weight && vitals.height)
      ? (parseFloat(vitals.weight) / ((parseFloat(vitals.height) / 100) ** 2)).toFixed(1)
      : null

    return (
      <>
        <h2 className="page-title" style={{ fontSize: 22 }}>Vitals</h2>
        <p className="page-desc">Record patient vitals. Leave blank if not measured.</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <div className="field">
            <label>Blood Pressure</label>
            <input type="text" placeholder="120/80" value={vitals.blood_pressure} onChange={e => updateVital('blood_pressure', e.target.value)} />
          </div>
          <div className="field">
            <label>Temperature (°C)</label>
            <input type="number" step="0.1" placeholder="36.5" value={vitals.temperature} onChange={e => updateVital('temperature', e.target.value)} />
          </div>
          <div className="field">
            <label>Weight (kg)</label>
            <input type="number" step="0.1" placeholder="65.0" value={vitals.weight} onChange={e => updateVital('weight', e.target.value)} />
          </div>
          <div className="field">
            <label>Height (cm)</label>
            <input type="number" step="0.1" placeholder="170.0" value={vitals.height} onChange={e => updateVital('height', e.target.value)} />
          </div>
          <div className="field">
            <label>Pulse (bpm)</label>
            <input type="number" placeholder="72" value={vitals.pulse} onChange={e => updateVital('pulse', e.target.value)} />
          </div>
          <div className="field">
            <label>Respiratory Rate</label>
            <input type="number" placeholder="18" value={vitals.respiratory_rate} onChange={e => updateVital('respiratory_rate', e.target.value)} />
          </div>
          <div className="field">
            <label>SpO2 (%)</label>
            <input type="number" placeholder="98" value={vitals.spo2} onChange={e => updateVital('spo2', e.target.value)} />
          </div>
          {bmi && (
            <div className="field">
              <label>BMI (auto)</label>
              <div style={{
                padding: '10px 14px', background: 'var(--surface)', borderRadius: 'var(--radius)',
                fontFamily: "'DM Mono', monospace", fontSize: 14, fontWeight: 700, color: 'var(--green)'
              }}>
                {bmi} kg/m²
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
          <button className="btn-secondary" style={{ marginTop: 0 }} onClick={() => setStep(0)}>← Back</button>
          <button className="btn-primary" onClick={() => setStep(2)}>Next: Diagnosis →</button>
          <button className="btn-primary" style={{ marginTop: 0, background: 'var(--green-light)' }} onClick={() => setStep(4)}>Skip to Review →</button>
        </div>
      </>
    )
  }

  // ── Step 2: Diagnoses ───────────────────────────────
  const renderDiagnosis = () => (
    <>
      <h2 className="page-title" style={{ fontSize: 22 }}>Diagnosis</h2>
      <p className="page-desc">Record clinical diagnoses for this visit.</p>

      {diagnoses.map((d, i) => (
        <div key={i} className="card" style={{ position: 'relative' }}>
          {diagnoses.length > 1 && (
            <button onClick={() => removeDiagnosis(i)} style={{
              position: 'absolute', top: 12, right: 12, background: 'none',
              border: 'none', fontSize: 16, cursor: 'pointer', color: 'var(--alert)'
            }}>✕</button>
          )}
          <div className="field">
            <label>Diagnosis *</label>
            <input type="text" placeholder="e.g. Acute malaria" value={d.description}
              onChange={e => updateDiagnosis(i, 'description', e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <div className="field">
              <label>ICD-10 Code (optional)</label>
              <input type="text" className="mono" placeholder="B50.9" value={d.icd_code}
                onChange={e => updateDiagnosis(i, 'icd_code', e.target.value)} />
            </div>
            <div className="field">
              <label>Notes</label>
              <input type="text" placeholder="Additional details" value={d.notes}
                onChange={e => updateDiagnosis(i, 'notes', e.target.value)} />
            </div>
          </div>
        </div>
      ))}

      <button onClick={addDiagnosis} style={{
        background: 'none', border: '2px dashed var(--border)', borderRadius: 'var(--radius)',
        padding: '12px 0', width: '100%', fontSize: 13, fontWeight: 700, color: 'var(--green)',
        cursor: 'pointer', fontFamily: "'Outfit', sans-serif", marginBottom: 16
      }}>+ Add another diagnosis</button>

      <div style={{ display: 'flex', gap: 12 }}>
        <button className="btn-secondary" style={{ marginTop: 0 }} onClick={() => setStep(1)}>← Back</button>
        <button className="btn-primary" onClick={() => setStep(3)}>Next: Prescriptions →</button>
        <button className="btn-primary" style={{ marginTop: 0, background: 'var(--green-light)' }} onClick={() => setStep(4)}>Skip to Review →</button>
      </div>
    </>
  )

  // ── Step 3: Prescriptions ───────────────────────────
  const renderPrescriptions = () => (
    <>
      <h2 className="page-title" style={{ fontSize: 22 }}>Prescriptions</h2>
      <p className="page-desc">Record medications prescribed. Leave empty if no prescriptions needed.</p>

      {prescriptions.map((p, i) => (
        <div key={i} className="card" style={{ position: 'relative' }}>
          {prescriptions.length > 1 && (
            <button onClick={() => removePrescription(i)} style={{
              position: 'absolute', top: 12, right: 12, background: 'none',
              border: 'none', fontSize: 16, cursor: 'pointer', color: 'var(--alert)'
            }}>✕</button>
          )}
          <div className="field">
            <label>Drug Name *</label>
            <DrugInput
              placeholder="Start typing — e.g. Paracetamol, Amoxicillin"
              value={p.drug}
              onChange={val => updatePrescription(i, 'drug', val)}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 12px' }}>
            <div className="field">
              <label>Dosage</label>
              <input type="text" placeholder="500mg" value={p.dosage}
                onChange={e => updatePrescription(i, 'dosage', e.target.value)} />
            </div>
            <div className="field">
              <label>Frequency</label>
              <input type="text" placeholder="Twice daily" value={p.frequency}
                onChange={e => updatePrescription(i, 'frequency', e.target.value)} />
            </div>
            <div className="field">
              <label>Duration</label>
              <input type="text" placeholder="3 days" value={p.duration}
                onChange={e => updatePrescription(i, 'duration', e.target.value)} />
            </div>
          </div>
        </div>
      ))}

      <button onClick={addPrescription} style={{
        background: 'none', border: '2px dashed var(--border)', borderRadius: 'var(--radius)',
        padding: '12px 0', width: '100%', fontSize: 13, fontWeight: 700, color: 'var(--green)',
        cursor: 'pointer', fontFamily: "'Outfit', sans-serif", marginBottom: 16
      }}>+ Add another prescription</button>

      <div style={{ display: 'flex', gap: 12 }}>
        <button className="btn-secondary" style={{ marginTop: 0 }} onClick={() => setStep(2)}>← Back</button>
        <button className="btn-primary" onClick={() => setStep(4)}>Review Visit →</button>
      </div>
    </>
  )

  // ── Step 4: Review ──────────────────────────────────
  const renderReview = () => (
    <>
      <h2 className="page-title" style={{ fontSize: 22 }}>Review & Save</h2>
      <p className="page-desc">Confirm all details before saving this visit record.</p>

      {!navigator.onLine && (
        <div className="warning-box" style={{ marginBottom: 16 }}>
          📡 You are offline. {isClinicPC() ? 'This visit will be saved locally and synced when internet returns.' : 'Connect to the internet to save.'}
        </div>
      )}

      <div className="card">
        <div className="section-label" style={{ margin: '0 0 8px' }}>Complaint</div>
        <p style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>{complaint}</p>
        {notes && <p style={{ fontSize: 13, color: 'var(--muted)' }}>{notes}</p>}
      </div>

      {Object.values(vitals).some(v => v) && (
        <div className="card">
          <div className="section-label" style={{ margin: '0 0 8px' }}>Vitals</div>
          {vitals.blood_pressure && <DataRow label="BP" value={vitals.blood_pressure} />}
          {vitals.temperature && <DataRow label="Temp" value={`${vitals.temperature}°C`} />}
          {vitals.weight && <DataRow label="Weight" value={`${vitals.weight} kg`} />}
          {vitals.height && <DataRow label="Height" value={`${vitals.height} cm`} />}
          {vitals.pulse && <DataRow label="Pulse" value={`${vitals.pulse} bpm`} />}
          {vitals.respiratory_rate && <DataRow label="RR" value={vitals.respiratory_rate} />}
          {vitals.spo2 && <DataRow label="SpO2" value={`${vitals.spo2}%`} />}
          {vitals.weight && vitals.height && (
            <DataRow label="BMI" value={`${(parseFloat(vitals.weight) / ((parseFloat(vitals.height) / 100) ** 2)).toFixed(1)} kg/m²`} />
          )}
        </div>
      )}

      {diagnoses.filter(d => d.description).length > 0 && (
        <div className="card">
          <div className="section-label" style={{ margin: '0 0 8px' }}>Diagnoses</div>
          {diagnoses.filter(d => d.description).map((d, i) => (
            <DataRow key={i} label={d.icd_code || `#${i + 1}`} value={`${d.description}${d.notes ? ' — ' + d.notes : ''}`} />
          ))}
        </div>
      )}

      {prescriptions.filter(p => p.drug).length > 0 && (
        <div className="card">
          <div className="section-label" style={{ margin: '0 0 8px' }}>Prescriptions</div>
          {prescriptions.filter(p => p.drug).map((p, i) => (
            <DataRow key={i} label={p.drug} value={[p.dosage, p.frequency, p.duration].filter(Boolean).join(' · ')} />
          ))}
        </div>
      )}

      {error && <div className="error-box">⚠ {error}</div>}

      <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
        <button className="btn-secondary" style={{ marginTop: 0 }} onClick={() => setStep(3)}>← Edit</button>
        <button className="btn-primary" disabled={saving} onClick={handleSave}>
          {saving ? 'Saving…' : navigator.onLine ? '✓ Save Visit Record' : '✓ Save Offline'}
        </button>
      </div>
    </>
  )

  return (
    <div className="card" style={{ border: '2px solid var(--green)', padding: 28 }}>
      {renderStepIndicator()}
      {step === 0 && renderComplaint()}
      {step === 1 && renderVitals()}
      {step === 2 && renderDiagnosis()}
      {step === 3 && renderPrescriptions()}
      {step === 4 && renderReview()}
    </div>
  )
}

function DataRow({ label, value }) {
  return (
    <div className="data-row">
      <span className="data-key">{label}</span>
      <span className="data-val">{value || '—'}</span>
    </div>
  )
}
