import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'

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
    <Box sx={{ maxWidth: '400px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <h1 style={{ fontFamily: "'DIN Alternate Bold', 'Montserrat', sans-serif", fontSize: '28px', fontWeight: 700, color: '#00704a', margin: 0 }}>
        Login
      </h1>

      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '20px', border: '1px solid #e0e0e0', borderRadius: '12px' }}
      >
        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ width: '100%', padding: '12px', border: '1px solid #e0e0e0', borderRadius: '8px', fontSize: '14px', fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ width: '100%', padding: '12px', border: '1px solid #e0e0e0', borderRadius: '8px', fontSize: '14px', fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
        </div>

        <button
          type="submit"
          style={{ marginTop: '12px', border: 0, background: '#00704a', color: '#fff', fontWeight: 900, borderRadius: '12px', padding: '12px 14px', cursor: 'pointer', width: '100%', fontSize: '16px', fontFamily: 'inherit' }}
        >
          Login
        </button>
      </form>

      <p style={{ textAlign: 'center', marginTop: '16px' }}>
        Don't have an account?{' '}
        <button
          type="button"
          style={{ background: 'none', border: 'none', color: '#00704a', textDecoration: 'underline', cursor: 'pointer', fontWeight: 'bold' }}
          onClick={() => navigate('/register')}
        >
          Register
        </button>
      </p>
    </Box>
  )
}