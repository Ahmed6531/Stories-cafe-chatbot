import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'

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

  const inputStyle = { width: '100%', padding: '12px', border: '1px solid #e0e0e0', borderRadius: '8px', fontSize: '14px', fontFamily: 'inherit', boxSizing: 'border-box' }
  const labelStyle = { display: 'block', marginBottom: '8px', fontWeight: 'bold' }

  return (
    <Box sx={{ maxWidth: '400px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <h1 style={{ fontFamily: "'DIN Alternate Bold', 'Montserrat', sans-serif", fontSize: '28px', fontWeight: 700, color: '#00704a', margin: 0 }}>
        Register
      </h1>

      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '20px', border: '1px solid #e0e0e0', borderRadius: '12px' }}
      >
        <div>
          <label style={labelStyle}>Full Name</label>
          <input type="text" name="name" value={formData.name} onChange={handleChange} required style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Email</label>
          <input type="email" name="email" value={formData.email} onChange={handleChange} required style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Password</label>
          <input type="password" name="password" value={formData.password} onChange={handleChange} required style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Confirm Password</label>
          <input type="password" name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} required style={inputStyle} />
        </div>

        <button
          type="submit"
          style={{ marginTop: '12px', border: 0, background: '#00704a', color: '#fff', fontWeight: 900, borderRadius: '12px', padding: '12px 14px', cursor: 'pointer', width: '100%', fontSize: '16px', fontFamily: 'inherit' }}
        >
          Register
        </button>
      </form>

      <p style={{ textAlign: 'center', marginTop: '16px' }}>
        Already have an account?{' '}
        <button
          type="button"
          style={{ background: 'none', border: 'none', color: '#00704a', textDecoration: 'underline', cursor: 'pointer', fontWeight: 'bold' }}
          onClick={() => navigate('/login')}
        >
          Login
        </button>
      </p>
    </Box>
  )
}