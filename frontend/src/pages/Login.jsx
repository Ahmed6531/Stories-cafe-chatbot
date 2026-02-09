import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const navigate = useNavigate()

  const handleSubmit = (e) => {
    e.preventDefault()
    // TODO: Implement actual login logic
    navigate('/')
  }

  return (
    <div className="page-wrap" style={{ maxWidth: '400px', margin: '0 auto' }}>
      <h1 className="menu-title">Login</h1>

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
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
          Login
        </button>
      </form>

      <p style={{ textAlign: 'center', marginTop: '16px' }}>
        Don't have an account?{' '}
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
          onClick={() => navigate('/register')}
        >
          Register
        </button>
      </p>
    </div>
  )

}



