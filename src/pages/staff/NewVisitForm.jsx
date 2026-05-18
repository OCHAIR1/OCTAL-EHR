import { useState } from 'react'
import { supabase } from '../../lib/supabase'

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

    try {
      const user = (await supabase.auth.getUser()).data.user

      // Get staff record
      const { data: staffData } = await supabase
        .from('staff')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      const staffId = staffData?.id || null

      // 1. Create visit
      const { data: visit, error: visitErr } = await supabase
        .from('visits')
        .insert({
          student_id: studentId,
          complaint_enc: complaint,
          notes_enc: notes || null,
          seen_by: staffId,
          status: 'open'
        })
        .select('id')
        .single()

      if (visitErr) throw visitErr

      // 2. Insert vitals
      const hasVitals = Object.values(vitals).some(v => v !== '')
      if (hasVitals) {
        await supabase.from('vitals').insert({
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

      // 3. Insert diagnoses
      const validDiagnoses = diagnoses.filter(d => d.description.trim())
      if (validDiagnoses.length > 0) {
        await supabase.from('diagnoses').insert(
          validDiagnoses.map(d => ({
            visit_id: visit.id,
            description_enc: d.description,
            icd_code: d.icd_code || null,
            notes_enc: d.notes || null,
            diagnosed_by: staffId
          }))
        )
      }

      // 4. Insert prescriptions
      const validPrescriptions = prescriptions.filter(p => p.drug.trim())
      if (validPrescriptions.length > 0) {
        await supabase.from('prescriptions').insert(
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

      if (onComplete) onComplete(visit.id)
    } catch (err) {
      setError(err.message || 'Failed to save visit.')
    } finally {
      setSaving(false)
    }
  }

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
      <p className="page-desc">What is the student presenting with?</p>

      <div className="field">
        <label>Complaint *</label>
        <input
          type="text"
          placeholder="e.g. Headache, fever, suspected malaria"
          value={complaint}
          onChange={e => setComplaint(e.target.value)}
        />
      </div>

      <div className="field">
        <label>Initial Notes (optional)</label>
        <textarea
          style={{
            width: '100%', minHeight: 100, border: '2px solid var(--border)',
            borderRadius: 'var(--radius)', padding: 16, fontFamily: "'Outfit', sans-serif",
            fontSize: 14, resize: 'vertical', outline: 'none', color: 'var(--text)'
          }}
          placeholder="Additional observations, history of present illness..."
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
        <button className="btn-primary" disabled={!complaint.trim()} onClick={() => setStep(1)}>
          Next: Vitals →
        </button>
        <button className="btn-secondary" style={{ marginTop: 0 }} onClick={onCancel}>Cancel</button>
      </div>
    </>
  )

  // ── Step 1: Vitals ──────────────────────────────────
  const renderVitals = () => (
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
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
        <button className="btn-secondary" style={{ marginTop: 0 }} onClick={() => setStep(0)}>← Back</button>
        <button className="btn-primary" onClick={() => setStep(2)}>Next: Diagnosis →</button>
      </div>
    </>
  )

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
            <input type="text" placeholder="e.g. Artemether-Lumefantrine" value={p.drug}
              onChange={e => updatePrescription(i, 'drug', e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 12px' }}>
            <div className="field">
              <label>Dosage</label>
              <input type="text" placeholder="80/480mg" value={p.dosage}
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
          {saving ? 'Saving…' : '✓ Save Visit Record'}
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
