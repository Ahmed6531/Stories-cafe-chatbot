import { Link } from 'react-router-dom'

export default function Unauthorized() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '16px' }}>
      <h1>403 — Access Denied</h1>
      <p>You do not have permission to view this page.</p>
      <Link to="/">Go home</Link>
    </div>
  )
}
