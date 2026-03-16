import { Link, useNavigate } from "react-router-dom";
import { Button } from "@mui/material";

const cardStyle = {
  padding: "28px",
  borderRadius: "18px",
  border: "1px solid #dfe9e1",
  background: "#f8fff8",
  textDecoration: "none",
  color: "#2e7d32",
  fontWeight: 700,
  fontSize: "20px",
  boxShadow: "0 6px 18px rgba(0,0,0,0.05)",
  display: "flex",
  flexDirection: "column",
  gap: "10px",
  minHeight: "150px",
  justifyContent: "center",
};

export default function AdminDashboard() {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("adminToken");
    navigate("/admin/login");
  };

  return (
    <div
      style={{
        display: "grid",
        gap: 24,
        paddingTop: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              color: "#2e7d32",
              fontSize: "2.1rem",
              fontWeight: 800,
            }}
          >
            Admin Dashboard
          </h2>
          <p
            style={{
              marginTop: 10,
              marginBottom: 0,
              fontSize: "1.05rem",
              color: "#4f5f53",
            }}
          >
            Manage menu items and track customer orders.
          </p>
        </div>

        <Button variant="outlined" color="error" onClick={handleLogout}>
          Logout
        </Button>
      </div>

      <div
        style={{
          display: "grid",
          gap: 20,
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        }}
      >
        <Link to="/admin/items" style={cardStyle}>
          <span>Manage Menu Items</span>
          <span style={{ fontSize: "15px", fontWeight: 500, color: "#5f6f65" }}>
            Add, update, and organize products shown to customers.
          </span>
        </Link>

        <Link to="/admin/orders" style={cardStyle}>
          <span>Order History</span>
          <span style={{ fontSize: "15px", fontWeight: 500, color: "#5f6f65" }}>
            Track all customer orders and monitor their status.
          </span>
        </Link>
      </div>
    </div>
  );
}