import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { signOut } from '../lib/supabase'
import { clearCache } from '../lib/offlineCache'

// ── Claude-style SVG icons (clean line art, 20x20) ──────────
const Icons = {
  menu: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <line x1="3" y1="5" x2="17" y2="5" />
      <line x1="3" y1="10" x2="17" y2="10" />
      <line x1="3" y1="15" x2="17" y2="15" />
    </svg>
  ),
  search: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="8.5" cy="8.5" r="5.5" />
      <line x1="13" y1="13" x2="17" y2="17" />
    </svg>
  ),
  register: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="6" r="3.5" />
      <path d="M2 17c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <line x1="16" y1="8" x2="16" y2="14" />
      <line x1="13" y1="11" x2="19" y2="11" />
    </svg>
  ),
  logout: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 3H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h3" />
      <polyline points="11 15 16 10 11 5" />
      <line x1="16" y1="10" x2="7" y2="10" />
    </svg>
  ),
  close: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <line x1="5" y1="5" x2="15" y2="15" />
      <line x1="15" y1="5" x2="5" y2="15" />
    </svg>
  ),
  sync: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="3" width="12" height="14" rx="2" />
      <line x1="8" y1="7" x2="12" y2="7" />
      <line x1="8" y1="10" x2="12" y2="10" />
      <line x1="8" y1="13" x2="10" y2="13" />
    </svg>
  ),
}

const NAV_ITEMS = [
  { id: 'search',   label: 'Patient Lookup',   icon: Icons.search,   path: '/staff/search' },
  { id: 'register', label: 'Register Students', icon: Icons.register, path: '/staff/register' },
]

/** Check if this device is set as a clinic PC */
export function isClinicPC() {
  try { return localStorage.getItem('octal_sync_mode') === 'clinic' } catch { return false }
}

export default function StaffSidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const [isOpen, setIsOpen] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [syncMode, setSyncMode] = useState(isClinicPC())
  const sidebarRef = useRef(null)

  // Close sidebar on route change
  useEffect(() => {
    setIsOpen(false)
    setIsHovered(false)
  }, [location.pathname])

  // Close sidebar when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (isOpen && sidebarRef.current && !sidebarRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  // Close on Escape
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        if (showLogoutConfirm) { setShowLogoutConfirm(false); return }
        setIsOpen(false)
        setIsHovered(false)
      }
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [showLogoutConfirm])

  const handleLogout = async () => {
    await clearCache()
    await signOut()
    try { localStorage.removeItem('octal_staff_session') } catch {}
    navigate('/staff/login')
  }

  const toggleSyncMode = () => {
    const next = !syncMode
    setSyncMode(next)
    try {
      if (next) localStorage.setItem('octal_sync_mode', 'clinic')
      else {
        localStorage.removeItem('octal_sync_mode')
        localStorage.removeItem('octal_staff_session') // clear cached creds when disabling
      }
    } catch {}
  }

  const isExpanded = isOpen || isHovered
  const currentPath = location.pathname

  return (
    <>
      {/* Overlay backdrop — when sidebar is open OR logout confirm showing */}
      {(isOpen || showLogoutConfirm) && (
        <div
          className="sidebar-backdrop"
          onClick={() => {
            if (showLogoutConfirm) setShowLogoutConfirm(false)
            else setIsOpen(false)
          }}
        />
      )}

      {/* Logout confirmation modal */}
      {showLogoutConfirm && (
        <div className="logout-modal">
          <div className="logout-modal-icon">
            {Icons.logout}
          </div>
          <h3 className="logout-modal-title">Sign out?</h3>
          <p className="logout-modal-desc">
            You will need to sign in again to access patient records.
          </p>
          <div className="logout-modal-actions">
            <button className="logout-modal-cancel" onClick={() => setShowLogoutConfirm(false)}>
              Cancel
            </button>
            <button className="logout-modal-confirm" onClick={handleLogout}>
              Sign Out
            </button>
          </div>
        </div>
      )}

      {/* Sidebar panel */}
      <div
        ref={sidebarRef}
        className={`sidebar ${isExpanded ? 'sidebar--expanded' : ''} ${isOpen ? 'sidebar--open' : ''}`}
        onMouseEnter={() => { if (!isOpen) setIsHovered(true) }}
        onMouseLeave={() => { if (!isOpen) setIsHovered(false) }}
      >
        {/* Sidebar header */}
        <div className="sidebar-header">
          {isExpanded ? (
            <>
              <div className="sidebar-brand">
                <span className="sidebar-brand-text">OCTAL-EHR</span>
                <span className="sidebar-brand-sub">Staff Panel</span>
              </div>
              <button className="sidebar-close" onClick={() => { setIsOpen(false); setIsHovered(false) }}>
                {Icons.close}
              </button>
            </>
          ) : (
            <button className="sidebar-toggle" onClick={() => setIsOpen(true)}>
              {Icons.menu}
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => {
            const isActive = currentPath === item.path
            return (
              <button
                key={item.id}
                className={`sidebar-item ${isActive ? 'sidebar-item--active' : ''}`}
                onClick={() => {
                  navigate(item.path)
                  setIsOpen(false)
                  setIsHovered(false)
                }}
                title={!isExpanded ? item.label : undefined}
              >
                <span className="sidebar-item-icon">{item.icon}</span>
                {isExpanded && <span className="sidebar-item-label">{item.label}</span>}
              </button>
            )
          })}
        </nav>

        {/* Footer — sync toggle + logout */}
        <div className="sidebar-footer">
          {/* Sync toggle — only visible when expanded */}
          {isExpanded && (
            <div className="sidebar-sync" onClick={toggleSyncMode}>
              <span className="sidebar-item-icon">{Icons.sync}</span>
              <span className="sidebar-sync-label">Clinic PC</span>
              <div className={`sidebar-toggle-switch ${syncMode ? 'sidebar-toggle-switch--on' : ''}`}>
                <div className="sidebar-toggle-knob" />
              </div>
            </div>
          )}

          {/* Collapsed: show sync dot indicator */}
          {!isExpanded && syncMode && (
            <div className="sidebar-sync-dot" title="Clinic PC — offline sync active" />
          )}

          <button
            className="sidebar-item sidebar-item--danger"
            onClick={() => setShowLogoutConfirm(true)}
            title={!isExpanded ? 'Sign Out' : undefined}
          >
            <span className="sidebar-item-icon">{Icons.logout}</span>
            {isExpanded && <span className="sidebar-item-label">Sign Out</span>}
          </button>
        </div>
      </div>
    </>
  )
}
