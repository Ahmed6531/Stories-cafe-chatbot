import { Link, useNavigate } from "react-router-dom";
import { Button } from "@mui/material";

export default function AdminDashboard() {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("adminToken");
    navigate("/admin/login");
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <h2 style={{ margin: 0 }}>Admin Dashboard</h2>

        <Button
          variant="outlined"
          color="error"
          onClick={handleLogout}
        >
          Logout
        </Button>
      </div>

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
  );
}
