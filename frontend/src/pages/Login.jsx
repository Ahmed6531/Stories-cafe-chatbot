import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthShell from '../components/auth/AuthShell'
import { authInputStyle, authLabelStyle } from '../components/auth/authStyles'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState({ type: '', message: '' })
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setStatus({ type: '', message: '' })

    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (res.ok && data.token) {
        localStorage.setItem('token', data.token)
        navigate('/dashboard')
      } else {
        setStatus({ type: 'error', message: data.message || 'Login failed' })
      }
    } catch (err) {
      console.error(err)
      setStatus({ type: 'error', message: 'Server error, please try again' })
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
