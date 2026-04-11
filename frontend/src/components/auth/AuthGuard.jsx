import { Navigate, Outlet } from 'react-router-dom'
import { useSession } from '../../hooks/useSession'

export default function AuthGuard({ children }) {
  const { user, loading } = useSession()

  if (loading) return null

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return children ?? <Outlet />
}
