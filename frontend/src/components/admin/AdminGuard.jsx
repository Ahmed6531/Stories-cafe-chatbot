import { Navigate } from "react-router-dom";

function isTokenValid(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1]));
    return payload.exp && payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export default function AdminGuard({ children }) {
  const token = localStorage.getItem("adminToken");

  if (!token || !isTokenValid(token)) {
    if (token) localStorage.removeItem("adminToken");
    return <Navigate to="/admin/login" replace />;
  }

  return children;
}
