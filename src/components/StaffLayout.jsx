import StaffSidebar from '../components/StaffSidebar'

/**
 * StaffLayout — wraps all staff pages with the sidebar.
 * The sidebar is fixed-position, so children render normally.
 */
export default function StaffLayout({ children }) {
  return (
    <>
      <StaffSidebar />
      {children}
    </>
  )
}
