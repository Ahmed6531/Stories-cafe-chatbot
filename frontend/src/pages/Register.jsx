import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthShell from '../components/auth/AuthShell'
import { authInputStyle, authLabelStyle } from '../components/auth/authStyles'

export default function Register() {
  const [formData, setFormData] = useState({ name: '', email: '', password: '', confirmPassword: '' })
  const navigate = useNavigate()

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (formData.password !== formData.confirmPassword) {
      alert('Passwords do not match')
      return
    }
    // TODO: Implement actual registration logic
    navigate('/login')
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
    </AuthShell>
  )
}
