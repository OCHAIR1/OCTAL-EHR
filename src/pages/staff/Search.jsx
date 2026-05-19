import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { hashMatricNo } from '../../lib/crypto'
import { isOnline, cacheStudentRecord, getCachedStudentRecord } from '../../lib/offlineCache'
import { isClinicPC } from '../../components/StaffSidebar'

export default function StaffSearch() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [offline, setOffline] = useState(!navigator.onLine)
  const navigate = useNavigate()

  // Track online/offline status
  useEffect(() => {
    const goOnline = () => setOffline(false)
    const goOffline = () => setOffline(true)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  /**
   * SEARCH LOGIC:
   *   1. Hash the matric number
   *   2. Check navigator.onLine
   *      a. ONLINE  → query Supabase (live, encrypted), cache the result, navigate to patient view
   *      b. OFFLINE → check IndexedDB for a cached record
   *         - Found & fresh → navigate to patient view (data was cached from prior online session)
   *         - Not found     → show "Offline — record not cached" message
   */
  const handleSearch = async (e) => {
    e.preventDefault()
    if (!query.trim()) return

    setLoading(true)
    setError(null)
    setNotFound(false)

    try {
      const hash = await hashMatricNo(query)

      if (isOnline()) {
        // ── ONLINE PATH ────────────────────────────────────────
        const { data, error: dbErr } = await supabase
          .from('students')
          .select('id, matric_no_enc, full_name_enc, blood_group, genotype, gender, department, faculty, level, status, photo_url_enc, profile_verified')
          .eq('matric_no_hash', hash)
          .not('status', 'in', '("deleted","pending_deletion")')
          .single()

        if (dbErr || !data) {
          setNotFound(true)
          return
        }

        // Cache the result for offline use — only on Clinic PCs
        if (isClinicPC()) {
          await cacheStudentRecord(hash, data)
        }

        // Audit log
        const user = (await supabase.auth.getUser()).data.user
        await supabase.from('audit_log').insert({
          actor_id: user?.id,
          actor_role: 'staff',
          action: 'VIEW_RECORD',
          resource_type: 'students',
          resource_id: data.id,
          metadata: { search_query_hash: hash }
        })

        navigate(`/staff/patient/${data.id}`)
      } else {
        // ── OFFLINE PATH ───────────────────────────────────────
        const cached = await getCachedStudentRecord(hash)

        if (!cached) {
          setNotFound(true)
          setError("You are offline. This student's record has not been cached. Search while connected to load it.")
          return
        }

        // Navigate using cached student ID — PatientView will use IndexedDB data
        navigate(`/staff/patient/${cached.student_id}?offline=1`)
      }
    } catch (err) {
      setError(err.message || 'Search failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app-shell app-shell--staff">
      <div className="header">
        <div>
          <div className="header-brand">OCTAL-EHR</div>
          <div className="header-sub">Medical Staff Dashboard</div>
        </div>
      </div>

      {/* Offline indicator */}
      {offline && (
        <div style={{
          background: 'var(--warning)',
          color: '#fff',
          fontSize: 12,
          fontFamily: 'Outfit, sans-serif',
          padding: '6px 20px',
          textAlign: 'center',
          fontWeight: 600
        }}>
          ⚡ Offline mode — only previously cached records are searchable
        </div>
      )}

      <div className="content content--staff">
        <h1 className="page-title">Patient Lookup</h1>
        <p className="page-desc">
          Enter a student's matric number to pull up their medical record.
          {offline && ' (Offline — cached records only)'}
        </p>

        <form onSubmit={handleSearch}>
          <div className="search-bar">
            <input
              type="text"
              placeholder="e.g. 24/15554"
              value={query}
              onChange={e => setQuery(e.target.value.toUpperCase())}
              maxLength={20}
            />
            <button type="submit" disabled={loading || !query.trim()}>
              {loading ? 'Searching…' : 'Search'}
            </button>
          </div>
        </form>

        {error && <div className={`${offline ? 'warning-box' : 'error-box'}`} style={{ marginTop: 12 }}>⚠ {error}</div>}

        {notFound && !error && (
          <div className="empty-state">
            <div className="empty-state-icon">🔍</div>
            <h3>No record found</h3>
            <p>
              No student found with matric number <strong>{query}</strong>.
              {offline ? ' They may not have been searched while online.' : ' Check the number and try again.'}
            </p>
          </div>
        )}

        {!notFound && !error && !loading && (
          <div className="empty-state">
            <div className="empty-state-icon">🏥</div>
            <h3>Caleb University Health Center</h3>
            <p>
              {offline
                ? 'You are offline. Search for a student whose record was cached during a prior online session.'
                : 'Search for a student by their matric number to view their medical record.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
