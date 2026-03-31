import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

export default function VerifyEmail() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState('loading') // 'loading' | 'success' | 'error'
  const [message, setMessage] = useState('')

  useEffect(() => {
    const token = searchParams.get('token')
    if (!token) {
      setStatus('error')
      setMessage('No verification token found.')
      return
    }

    fetch(`${import.meta.env.VITE_API_BASE_URL}/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json()
        if (res.ok) {
          setStatus('success')
          setTimeout(() => navigate('/login'), 3000)
        } else {
          setStatus('error')
          setMessage(data.error?.message || 'Verification failed.')
        }
      })
      .catch(() => {
        setStatus('error')
        setMessage('Server error. Please try again.')
      })
  }, [])

  return (
    <Box sx={{ maxWidth: '400px', margin: '80px auto', width: '100%', textAlign: 'center', padding: '0 16px' }}>
      <Typography
        component="h1"
        sx={{
          fontFamily: (theme) => theme.brand.fontDisplay,
          fontSize: '28px',
          fontWeight: 700,
          color: (theme) => theme.brand.primary,
          marginBottom: '24px',
        }}
      >
        Email Verification
      </Typography>

      <Box sx={{ padding: '24px', border: '1px solid #e0e0e0', borderRadius: '12px' }}>
        {status === 'loading' && (
          <Typography sx={{ color: '#555', fontSize: '14px' }}>Verifying your email...</Typography>
        )}

        {status === 'success' && (
          <>
            <Typography sx={{ color: '#00704a', fontWeight: 600, fontSize: '15px', marginBottom: '8px' }}>
              Your email has been verified!
            </Typography>
            <Typography sx={{ color: '#555', fontSize: '13px' }}>
              Redirecting you to login...
            </Typography>
          </>
        )}

        {status === 'error' && (
          <>
            <Typography sx={{ color: '#d93025', fontWeight: 600, fontSize: '15px', marginBottom: '16px' }}>
              {message}
            </Typography>
            <button
              type="button"
              onClick={() => navigate('/login')}
              style={{
                padding: '10px 24px',
                backgroundColor: '#1e5631',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '14px',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Go to Login
            </button>
          </>
        )}
      </Box>
    </Box>
  )
}
