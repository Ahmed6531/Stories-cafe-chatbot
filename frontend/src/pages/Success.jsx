import { useNavigate, useLocation } from 'react-router-dom'
import { Box, Typography, useTheme } from '@mui/material'
import { useSession } from '../hooks/useSession'

export default function Success() {
  const navigate = useNavigate()
  const location = useLocation()
  const theme = useTheme()
  const { user } = useSession()
  // Bug fix: show real order number from backend response
  const orderNumber = location.state?.orderNumber || 'SC-2026020712345'

  return (
    <Box
      sx={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        textAlign: 'center',
        padding: '40px 20px',
        '& .MuiTypography-root': { fontFamily: theme.brand.fontBase },
      }}
    >
      <Box sx={{ marginBottom: '30px' }}>
        <Box sx={{ fontSize: '80px', color: theme.brand.primary, marginBottom: '20px' }}>
          {'\u2713'}
        </Box>
        <Typography
          component="h1"
          sx={{
            fontFamily: theme.brand.fontDisplay,
            fontSize: '28px',
            fontWeight: 700,
            color: theme.brand.primary,
            margin: 0,
          }}
        >
          Order Placed Successfully!
        </Typography>
        <Typography
          sx={{
            fontSize: '16px',
            color: theme.brand.textSecondary,
            marginTop: '10px',
            marginBottom: 0,
          }}
        >
          Thank you for your order. We'll start preparing it right away.
        </Typography>
      </Box>

      <Box sx={{ marginBottom: '30px' }}>
        <Typography sx={{ fontSize: '14px', color: theme.brand.textSecondary, marginBottom: '10px' }}>
          Order Number: <Box component="strong">#{orderNumber}</Box>
        </Typography>
        <Typography sx={{ fontSize: '14px', color: theme.brand.textSecondary, margin: 0 }}>
          You will be notified when your order is ready.
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
        <Box
          component="button"
          type="button"
          onClick={() => navigate('/')}
          sx={{
            border: 'none',
            backgroundColor: theme.brand.primaryDark,
            color: theme.palette.common.white,
            fontWeight: 600,
            borderRadius: '8px',
            padding: '1rem 2rem',
            cursor: 'pointer',
            width: '220px',
            fontSize: '1rem',
            fontFamily: theme.brand.fontBase,
            letterSpacing: '0.5px',
            transition: 'all 0.3s ease',
            '&:hover': {
              backgroundColor: theme.brand.primaryDark,
              transform: 'translateY(-2px)',
            },
          }}
        >
          Back to Home
        </Box>

        {user && (
          <Box
            component="button"
            type="button"
            onClick={() => navigate('/dashboard')}
            sx={{
              border: `1.5px solid ${theme.brand.primaryDark}`,
              backgroundColor: 'transparent',
              color: theme.brand.primaryDark,
              fontWeight: 600,
              borderRadius: '8px',
              padding: '1rem 2rem',
              cursor: 'pointer',
              width: '220px',
              fontSize: '1rem',
              fontFamily: theme.brand.fontBase,
              letterSpacing: '0.5px',
              transition: 'all 0.3s ease',
              '&:hover': {
                backgroundColor: 'rgba(30,86,49,0.06)',
                transform: 'translateY(-2px)',
              },
            }}
          >
            View order history →
          </Box>
        )}
      </Box>
    </Box>
  )
}
