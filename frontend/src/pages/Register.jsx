import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import http from '../API/http'
import AuthShell from '../components/auth/AuthShell'
import { authInputStyle, authLabelStyle } from '../components/auth/authStyles'

export default function Register() {
  const [formData, setFormData] = useState({ name: '', email: '', password: '', confirmPassword: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [status, setStatus] = useState({ type: '', message: '' })
  const navigate = useNavigate()

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setStatus({ type: '', message: '' })

    if (formData.password !== formData.confirmPassword) {
      setStatus({ type: 'error', message: 'Passwords do not match' })
      return
    }

    try {
      await http.post('/auth/register', {
        name: formData.name,
        email: formData.email,
        password: formData.password,
      })
      setStatus({ type: 'success', message: 'Registration successful. Check your email to verify your account.' })
    } catch (err) {
      const data = err.response?.data
      const message = data?.message
        || data?.error?.fields?.[0]?.message
        || data?.error?.message
        || 'Registration failed'
      setStatus({ type: 'error', message: err.response ? message : 'Server error, please try again' })
    }
  }

  return (
    <AuthShell
      title="Register"
      onSubmit={handleSubmit}
      submitLabel="Register"
      footerText="Already have an account?"
      footerActionLabel="Login"
      onFooterAction={() => navigate('/login')}
    >
      <div>
        <label style={authLabelStyle}>Full Name</label>
        <input type="text" name="name" value={formData.name} onChange={handleChange} required style={authInputStyle} />
      </div>
      <div>
        <label style={authLabelStyle}>Email</label>
        <input type="email" name="email" value={formData.email} onChange={handleChange} required style={authInputStyle} />
      </div>
      <div>
        <label style={authLabelStyle}>Password</label>
        <div style={{ position: 'relative' }}>
          <input
            type={showPassword ? 'text' : 'password'}
            name="password"
            value={formData.password}
            onChange={handleChange}
            required
            style={{ ...authInputStyle, paddingRight: '40px' }}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: '#888', display: 'flex', alignItems: 'center' }}
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
      <div>
        <label style={authLabelStyle}>Confirm Password</label>
        <div style={{ position: 'relative' }}>
          <input
            type={showConfirmPassword ? 'text' : 'password'}
            name="confirmPassword"
            value={formData.confirmPassword}
            onChange={handleChange}
            required
            style={{ ...authInputStyle, paddingRight: '40px' }}
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword((v) => !v)}
            style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: '#888', display: 'flex', alignItems: 'center' }}
            aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
          >
            {showConfirmPassword ? (
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
