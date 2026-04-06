import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import http from '../API/http'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { useTheme } from '@mui/material/styles'

export default function VerifyEmail() {
  const [searchParams] = useSearchParams()
  const theme = useTheme()
  const token = searchParams.get('token')
  const [status, setStatus] = useState(token ? 'loading' : 'error')
  const [message, setMessage] = useState(token ? '' : 'No verification token found.')

  useEffect(() => {
    if (!token) return

    http.get(`/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(() => {
        setStatus('success')
      })
      .catch((err) => {
        setStatus('error')
        setMessage(err.response?.data?.error?.message || 'Verification failed.')
      })
  }, [token])

  if (status === 'loading') {
    return (
      <Box
        sx={{
          width: '100%',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          '& .MuiTypography-root': { fontFamily: theme.brand.fontBase },
        }}
      >
        <Typography sx={{ fontSize: '15px', color: theme.brand.textSecondary }}>
          Verifying your email...
        </Typography>
      </Box>
    )
  }

  if (status === 'error') {
    return (
      <Box
        sx={{
          width: '100%',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px 24px',
          '& .MuiTypography-root': { fontFamily: theme.brand.fontBase },
        }}
      >
        <Typography
          component="h1"
          sx={{
            fontFamily: theme.brand.fontDisplay,
            fontSize: '22px',
            fontWeight: 700,
            color: theme.brand.textPrimary,
            margin: '0 0 8px',
            textAlign: 'center',
          }}
        >
          Verification failed
        </Typography>
        <Typography
          sx={{
            fontSize: '15px',
            color: theme.brand.textSecondary,
            textAlign: 'center',
          }}
        >
          {message}
        </Typography>
      </Box>
    )
  }

  return (
    <Box
      sx={{
        width: '100%',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        '& .MuiTypography-root': { fontFamily: theme.brand.fontBase },
      }}
    >
      <Box
        sx={{
          width: 76,
          height: 76,
          borderRadius: '50%',
          backgroundColor: '#e1f5ee',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '20px',
        }}
      >
        <svg
          width="36"
          height="36"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#0f6e56"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </Box>

      <Typography
        component="h1"
        sx={{
          fontFamily: theme.brand.fontDisplay,
          fontSize: '22px',
          fontWeight: 700,
          color: theme.brand.primary,
          margin: '0 0 8px',
          textAlign: 'center',
        }}
      >
        Email verified
      </Typography>

      <Typography
        sx={{
          fontSize: '15px',
          color: theme.brand.textSecondary,
          margin: 0,
          textAlign: 'center',
        }}
      >
        Your account is ready to go. You can close this tab and log in.
      </Typography>
    </Box>
  )
}
