import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Register() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
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
    <div className="page-wrap" style={{ maxWidth: '400px', margin: '0 auto' }}>
      <h1 className="menu-title">Register</h1>

      <form
        onSubmit={handleSubmit}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          padding: '20px',
          border: '1px solid #e0e0e0',
          borderRadius: '12px',
        }}
      >
        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            Full Name
          </label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
            style={{
              width: '100%',
              padding: '12px',
              border: '1px solid #e0e0e0',
              borderRadius: '8px',
              fontSize: '14px',
              fontFamily: 'inherit',
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            Email
          </label>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            required
            style={{
              width: '100%',
              padding: '12px',
              border: '1px solid #e0e0e0',
              borderRadius: '8px',
              fontSize: '14px',
              fontFamily: 'inherit',
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            Password
          </label>
          <input
            type="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            required
            style={{
              width: '100%',
              padding: '12px',
              border: '1px solid #e0e0e0',
              borderRadius: '8px',
              fontSize: '14px',
              fontFamily: 'inherit',
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            Confirm Password
          </label>
          <input
            type="password"
            name="confirmPassword"
            value={formData.confirmPassword}
            onChange={handleChange}
            required
            style={{
              width: '100%',
              padding: '12px',
              border: '1px solid #e0e0e0',
              borderRadius: '8px',
              fontSize: '14px',
              fontFamily: 'inherit',
            }}
          />
        </div>

        <button type="submit" className="primary-btn" style={{ marginTop: '12px' }}>
          Register
        </button>
      </form>

      <p style={{ textAlign: 'center', marginTop: '16px' }}>
        Already have an account?{' '}
        <button
          type="button"
          style={{
            background: 'none',
            border: 'none',
            color: '#00704a',
            textDecoration: 'underline',
            cursor: 'pointer',
            fontWeight: 'bold',
          }}
          onClick={() => navigate('/login')}
        >
          Login
        </button>
      </p>
    </div>
  )
}