import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthShell from '../components/auth/AuthShell'
import { authInputStyle, authLabelStyle } from '../components/auth/authStyles'
import http from '../API/http'
import { useSession } from '../hooks/useSession'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState({ type: '', message: '' })
  const navigate = useNavigate()
  const { refreshSession } = useSession()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setStatus({ type: '', message: '' })

    try {
      await http.post('/auth/login', { email, password })
      await refreshSession()
      navigate('/dashboard')
    } catch (err) {
      const message = err.response?.data?.error?.message || 'Login failed'
      setStatus({ type: 'error', message })
    }
  }

  return (
    <AuthShell
      title="Login"
      onSubmit={handleSubmit}
      submitLabel="Login"
      footerText="Don't have an account?"
      footerActionLabel="Register"
      onFooterAction={() => navigate('/register')}
    >
      <div>
        <label style={authLabelStyle}>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={authInputStyle}
        />
      </div>

      <div>
        <label style={authLabelStyle}>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={authInputStyle}
        />
      </div>

      {status.message && (
        <p
          role="status"
          style={{
            margin: '-6px 0 0 0',
            color: status.type === 'error' ? '#d93025' : '#00704a',
            fontStyle: 'italic',
            fontWeight: 600,
            fontSize: '12px',
          }}
        >
          {status.message}
        </p>
      )}
    </AuthShell>
  )
}
