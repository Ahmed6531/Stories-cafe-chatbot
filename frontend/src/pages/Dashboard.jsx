import { useSession } from '../hooks/useSession'

export default function Dashboard() {
  const { user } = useSession()

  return (
    <div style={{ padding: "20px" }}>
      <h1>Dashboard</h1>
      <p><strong>Name:</strong> {user?.name ?? '—'}</p>
      <p><strong>Email:</strong> {user?.email}</p>
      <p><strong>Role:</strong> {user?.role}</p>
    </div>
  )
}
