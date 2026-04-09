import { Navigate, Outlet } from 'react-router-dom'
import { useSession } from '../../hooks/useSession'

export default function AdminGuard({ children }) {
  const { user, loading } = useSession()

  if (loading) return null

  if (!user) {
    return <Navigate to="/admin/login" replace />
  }

  if (user.role !== 'admin') {
    return <Navigate to="/unauthorized" replace />
  }

  return children ?? <Outlet />
}
