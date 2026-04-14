import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthShell from '../components/auth/AuthShell'
import { authInputStyle, authLabelStyle } from '../components/auth/authStyles'
import http from '../API/http'
import { useSession } from '../hooks/useSession'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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
      const raw = err.response?.data?.message
        || err.response?.data?.error?.message
        || ''
      const message =
        raw.toLowerCase().includes('verify')
          ? 'Check your inbox — we sent you a verification email.'
          : raw.toLowerCase().includes('invalid')
            ? 'Email or password is incorrect.'
            : 'Something went wrong, please try again.'
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
        <div style={{ position: 'relative' }}>
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ ...authInputStyle, paddingRight: '40px' }}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            style={{
              position: 'absolute',
              right: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '2px',
              color: '#888',
              display: 'flex',
              alignItems: 'center',
            }}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            )}
          </button>
        </div>
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
