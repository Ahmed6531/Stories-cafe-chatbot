import { Navigate } from "react-router-dom";

export default function AdminGuard({ children }) {
  const token = localStorage.getItem("adminToken");

  if (!token) {
    return <Navigate to="/admin/login" replace />;
  }

  return children;
}