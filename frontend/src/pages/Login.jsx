import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthShell from '../components/auth/AuthShell'
import { authInputStyle, authLabelStyle } from '../components/auth/authStyles'

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
    </AuthShell>
  )
}
