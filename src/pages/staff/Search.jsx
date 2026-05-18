import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, signOut } from '../../lib/supabase'
import { hashMatricNo } from '../../lib/crypto'

export default function StaffSearch() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const navigate = useNavigate()

  const handleSearch = async (e) => {
    e.preventDefault()
    if (!query.trim()) return

    setLoading(true)
    setError(null)
    setNotFound(false)

    try {
      const hash = await hashMatricNo(query)

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

      // Log access in audit trail
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
    } catch (err) {
      setError(err.message || 'Search failed.')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    await signOut()
    navigate('/staff/login')
  }

  return (
    <div className="app-shell app-shell--staff">
      <div className="header">
        <div>
          <div className="header-brand">OCTAL-EHR</div>
          <div className="header-sub">Medical Staff Dashboard</div>
        </div>
        <div className="header-actions">
          <button className="btn-logout" onClick={handleLogout}>Logout</button>
        </div>
      </div>

      <div className="content content--staff">
        <h1 className="page-title">Patient Lookup</h1>
        <p className="page-desc">
          Enter a student's matric number to pull up their medical record.
        </p>

        <form onSubmit={handleSearch}>
          <div className="search-bar">
            <input
              type="text"
              placeholder="e.g. CSC/2021/001"
              value={query}
              onChange={e => setQuery(e.target.value.toUpperCase())}
              maxLength={20}
            />
            <button type="submit" disabled={loading || !query.trim()}>
              {loading ? 'Searching…' : 'Search'}
            </button>
          </div>
        </form>

        {error && <div className="error-box">⚠ {error}</div>}

        {notFound && (
          <div className="empty-state">
            <div className="empty-state-icon">🔍</div>
            <h3>No record found</h3>
            <p>
              No student found with matric number <strong>{query}</strong>.
              Check the number and try again.
            </p>
          </div>
        )}

        {!notFound && !error && !loading && (
          <div className="empty-state">
            <div className="empty-state-icon">🏥</div>
            <h3>Caleb University Health Center</h3>
            <p>Search for a student by their matric number to view their medical record.</p>
          </div>
        )}
      </div>
    </div>
  )
}
