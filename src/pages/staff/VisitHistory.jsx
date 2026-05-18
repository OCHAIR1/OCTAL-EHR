import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

export default function VisitHistory({ studentId, refreshKey }) {
  const [visits, setVisits] = useState([])
  const [expanded, setExpanded] = useState(null)
  const [details, setDetails] = useState({}) // visit_id -> { vitals, diagnoses, prescriptions }
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadVisits()
  }, [studentId, refreshKey])

  const loadVisits = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('visits')
      .select('*, staff:seen_by(full_name)')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })

    setVisits(data || [])
    setLoading(false)
  }

  const toggleExpand = async (visitId) => {
    if (expanded === visitId) {
      setExpanded(null)
      return
    }

    setExpanded(visitId)

    if (!details[visitId]) {
      const [vitalsRes, diagRes, rxRes] = await Promise.all([
        supabase.from('vitals').select('*').eq('visit_id', visitId),
        supabase.from('diagnoses').select('*').eq('visit_id', visitId),
        supabase.from('prescriptions').select('*').eq('visit_id', visitId)
      ])

      setDetails(prev => ({
        ...prev,
        [visitId]: {
          vitals: vitalsRes.data || [],
          diagnoses: diagRes.data || [],
          prescriptions: rxRes.data || []
        }
      }))
    }
  }

  const closeVisit = async (visitId) => {
    await supabase
      .from('visits')
      .update({ status: 'closed', closed_at: new Date().toISOString() })
      .eq('id', visitId)

    loadVisits()
  }

  const formatDate = (d) => {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-NG', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  if (loading) return <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Loading visits…</div>

  if (visits.length === 0) {
    return (
      <div className="card">
        <div className="section-label" style={{ margin: '0 0 12px' }}>Visit History</div>
        <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '20px 0' }}>
          No visits recorded yet.
        </p>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="section-label" style={{ margin: '0 0 16px' }}>Visit History ({visits.length})</div>

      {visits.map(visit => (
        <div key={visit.id} style={{
          border: '1.5px solid var(--border)', borderRadius: 'var(--radius-lg)',
          marginBottom: 12, overflow: 'hidden', transition: 'all 0.2s',
          borderColor: expanded === visit.id ? 'var(--green-light)' : 'var(--border)'
        }}>
          {/* Header row */}
          <div
            onClick={() => toggleExpand(visit.id)}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '14px 16px', cursor: 'pointer', background: expanded === visit.id ? 'var(--green-pale)' : 'transparent',
              transition: 'background 0.2s'
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>
                {visit.complaint_enc}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                {formatDate(visit.created_at)} {visit.staff?.full_name ? `· ${visit.staff.full_name}` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1,
                padding: '4px 10px', borderRadius: 100,
                background: visit.status === 'open' ? 'var(--warn-bg)' : visit.status === 'referred' ? '#E3F2FD' : 'var(--green-pale)',
                color: visit.status === 'open' ? 'var(--warn)' : visit.status === 'referred' ? '#1565C0' : 'var(--green)'
              }}>
                {visit.status}
              </span>
              <span style={{ fontSize: 12, color: 'var(--muted)', transition: 'transform 0.2s', transform: expanded === visit.id ? 'rotate(180deg)' : 'none' }}>▼</span>
            </div>
          </div>

          {/* Expanded details */}
          {expanded === visit.id && details[visit.id] && (
            <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)' }}>
              {visit.notes_enc && (
                <div style={{ fontSize: 13, color: 'var(--muted)', padding: '12px 0', lineHeight: 1.6, borderBottom: '1px solid var(--border)' }}>
                  {visit.notes_enc}
                </div>
              )}

              {/* Vitals */}
              {details[visit.id].vitals.length > 0 && (
                <>
                  <div className="section-label" style={{ marginTop: 12, marginBottom: 8 }}>Vitals</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {details[visit.id].vitals.map(v => (
                      <div key={v.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, width: '100%' }}>
                        {v.blood_pressure && <VitalChip label="BP" value={v.blood_pressure} />}
                        {v.temperature && <VitalChip label="Temp" value={`${v.temperature}°C`} />}
                        {v.pulse && <VitalChip label="Pulse" value={`${v.pulse} bpm`} />}
                        {v.weight && <VitalChip label="Weight" value={`${v.weight} kg`} />}
                        {v.spo2 && <VitalChip label="SpO2" value={`${v.spo2}%`} />}
                        {v.respiratory_rate && <VitalChip label="RR" value={v.respiratory_rate} />}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Diagnoses */}
              {details[visit.id].diagnoses.length > 0 && (
                <>
                  <div className="section-label" style={{ marginTop: 16, marginBottom: 8 }}>Diagnoses</div>
                  {details[visit.id].diagnoses.map(d => (
                    <div key={d.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                        {d.description_enc}
                        {d.icd_code && <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--muted)', marginLeft: 8 }}>{d.icd_code}</span>}
                      </div>
                      {d.notes_enc && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{d.notes_enc}</div>}
                    </div>
                  ))}
                </>
              )}

              {/* Prescriptions */}
              {details[visit.id].prescriptions.length > 0 && (
                <>
                  <div className="section-label" style={{ marginTop: 16, marginBottom: 8 }}>Prescriptions</div>
                  {details[visit.id].prescriptions.map(p => (
                    <div key={p.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{p.drug_enc}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {[p.dosage, p.frequency, p.duration].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                  ))}
                </>
              )}

              {/* Actions */}
              {visit.status === 'open' && (
                <button onClick={() => closeVisit(visit.id)} style={{
                  marginTop: 16, background: 'var(--green)', color: 'white',
                  border: 'none', padding: '10px 20px', borderRadius: 'var(--radius)',
                  fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Outfit', sans-serif"
                }}>✓ Close Visit</button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function VitalChip({ label, value }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: '6px 12px',
      fontSize: 12, fontWeight: 500, display: 'inline-flex', gap: 4
    }}>
      <span style={{ color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}:</span>
      <span style={{ color: 'var(--text)', fontFamily: "'DM Mono', monospace" }}>{value}</span>
    </div>
  )
}
