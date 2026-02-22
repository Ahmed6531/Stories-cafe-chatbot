import { Link } from "react-router-dom"

export default function AdminDashboard() {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h2 style={{ margin: 0 }}>Admin Dashboard</h2>
      <p style={{ marginTop: 0 }}>
        Manage menu items, upload images, and manage categories.
      </p>

      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        }}
      >
        <Link
          to="/admin/items"
          className="top-pill outline"
          style={{ textDecoration: "none", display: "inline-block" }}
        >
          Manage Menu Items →
        </Link>

        <Link
          to="/admin/categories"
          className="top-pill outline"
          style={{ textDecoration: "none", display: "inline-block" }}
        >
          Manage Categories →
        </Link>
      </div>
    </div>
  )
}
