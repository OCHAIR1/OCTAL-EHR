/**
 * Allergy Banner — ALWAYS at the top of every patient view.
 * Cannot be dismissed, collapsed, or scrolled past.
 * This is a patient safety feature.
 */
export default function AllergyBanner({ allergies = [] }) {
  if (!allergies || allergies.length === 0) {
    return (
      <div className="card" style={{ background: 'var(--green-pale)', borderColor: 'var(--green-light)', marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: 1 }}>
          ✓ No known allergies
        </div>
      </div>
    )
  }

  const hasSevere = allergies.some(a =>
    a.severity === 'severe' || a.severity === 'life_threatening'
  )

  return (
    <div className="allergy-banner" style={!hasSevere ? {
      background: 'var(--warn-bg)', borderColor: 'var(--warn)'
    } : {}}>
      <span className="allergy-banner-icon">{hasSevere ? '🚨' : '⚠️'}</span>
      <div>
        <div className="allergy-banner-label" style={!hasSevere ? { color: 'var(--warn)' } : {}}>
          {hasSevere ? 'CRITICAL ALLERGIES' : 'ALLERGIES'}
        </div>
        <div className="allergy-pills">
          {allergies.map((a, i) => (
            <span key={i} className={`allergy-pill allergy-pill--${a.severity || 'moderate'}`}>
              {a.allergen}
              {(a.severity === 'severe' || a.severity === 'life_threatening') && ' ⚠'}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
