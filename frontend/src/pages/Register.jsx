import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthShell from '../components/auth/AuthShell'
import { authInputStyle, authLabelStyle } from '../components/auth/authStyles'

export default function Register() {
  const [formData, setFormData] = useState({ name: '', email: '', password: '', confirmPassword: '' })
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
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
        }),
      })

      const data = await res.json()

      if (res.ok) {
        setStatus({ type: 'success', message: 'Registration successful. Check your email to verify your account.' })
      } else {
        setStatus({ type: 'error', message: data.message || 'Registration failed' })
      }
    } catch (err) {
      console.error(err)
      setStatus({ type: 'error', message: 'Server error, please try again' })
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
        <input type="password" name="password" value={formData.password} onChange={handleChange} required style={authInputStyle} />
      </div>
      <div>
        <label style={authLabelStyle}>Confirm Password</label>
        <input type="password" name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} required style={authInputStyle} />
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
