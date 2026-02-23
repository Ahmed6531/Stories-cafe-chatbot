import { NavLink, Outlet } from "react-router-dom"

export default function AdminLayout() {
  return (
    <div className="app-shell">
      {/* Admin Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-top">
          <div style={{ padding: "12px 10px", fontWeight: 700 }}>
            Admin Panel
          </div>

          <nav className="side-nav">
            <NavLink
              to="/admin"
              end
              className={({ isActive }) => `side-link ${isActive ? "active" : ""}`}
            >
              Dashboard
            </NavLink>

            <NavLink
              to="/admin/items"
              className={({ isActive }) => `side-link ${isActive ? "active" : ""}`}
            >
              Menu Items
            </NavLink>

            <NavLink
              to="/admin/categories"
              className={({ isActive }) => `side-link ${isActive ? "active" : ""}`}
            >
              Categories
            </NavLink>
          </nav>
        </div>

        <div className="sidebar-bottom" />
      </aside>

      {/* Admin Main */}
      <main className="main">
        <header className="topbar">
          <div style={{ fontWeight: 700 }}>Stories Café — Admin</div>
        </header>

        <div className="page">
          <Outlet />
        </div>
      </main>
    </div>
  )
}