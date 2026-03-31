import { useNavigate, useLocation } from 'react-router-dom'
import { Box, Typography, useTheme } from '@mui/material'
import { useSession } from '../hooks/useSession'
import { useOrderStatus } from '../hooks/useOrderStatus'

const STATUS_CONFIG = {
  received:    { label: 'Order received',      bg: '#f0f4ff', color: '#4b6bcc' },
  in_progress: { label: 'Brewing your order...', bg: '#fff7ed', color: '#c2410c' },
  completed:   { label: 'Ready for pickup!',     bg: '#f0fdf4', color: '#15803d' },
  cancelled:   { label: 'Order cancelled',       bg: '#fef2f2', color: '#b91c1c' },
}

export default function Success() {
  const navigate = useNavigate()
  const location = useLocation()
  const theme = useTheme()
  const { user } = useSession()
  const orderNumber = location.state?.orderNumber || 'SC-2026020712345'
  const { status, loading } = useOrderStatus(orderNumber)
  const cfg = STATUS_CONFIG[status]
  const isPolling = status === 'in_progress'

  return (
    <Box sx={{
      width: '100%',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '48px 24px',
      '& .MuiTypography-root': { fontFamily: theme.brand.fontBase },
    }}>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '48px' }}>
        <Box
          component="img"
          src="/stories-logo.png"
          alt="Stories"
          sx={{ maxWidth: '112px', maxHeight: '26px', objectFit: 'contain' }}
          onError={(e) => { e.currentTarget.style.display = 'none' }}
        />
      </Box>

      <Box sx={{
        width: 76,
        height: 76,
        borderRadius: '50%',
        backgroundColor: '#e1f5ee',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '24px',
        animation: 'popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        '@keyframes popIn': {
          from: { transform: 'scale(0)', opacity: 0 },
          to: { transform: 'scale(1)', opacity: 1 },
        },
      }}>
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#0f6e56" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </Box>

      <Typography component="h1" sx={{
        fontFamily: theme.brand.fontDisplay,
        fontSize: '22px',
        fontWeight: 700,
        color: theme.brand.primary,
        margin: '0 0 8px',
        textAlign: 'center',
      }}>
        Order placed successfully
      </Typography>

      <Typography sx={{
        fontSize: '15px',
        color: theme.brand.textSecondary,
        margin: '0 0 28px',
        textAlign: 'center',
      }}>
        Your order is in good hands — we'll have it ready shortly.
      </Typography>

      <Box sx={{
        backgroundColor: '#f8f9f8',
        borderRadius: '12px',
        padding: '16px 28px',
        marginBottom: '28px',
        minWidth: '320px',
        textAlign: 'center',
      }}>
        <Typography sx={{ fontSize: '11px', color: theme.brand.textSecondary, letterSpacing: '0.06em', textTransform: 'uppercase', margin: '0 0 4px' }}>
          Order number
        </Typography>
        <Typography sx={{ fontSize: '18px', fontWeight: 700, color: theme.brand.textPrimary, margin: '0 0 12px', letterSpacing: '0.03em' }}>
          #{orderNumber}
        </Typography>

        {!loading && cfg && (
          <Box sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: cfg.bg,
            color: cfg.color,
            borderRadius: '999px',
            padding: '4px 12px',
            fontSize: '12px',
            fontWeight: 600,
            fontFamily: theme.brand.fontBase,
          }}>
            {isPolling && (
              <Box sx={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: cfg.color,
                animation: 'pulse 1.5s ease-in-out infinite',
                '@keyframes pulse': {
                  '0%, 100%': { opacity: 1 },
                  '50%': { opacity: 0.3 },
                },
              }} />
            )}
            {cfg.label}
          </Box>
        )}
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', width: '100%', maxWidth: '320px' }}>
        {user && (
          <Box
            component="button"
            type="button"
            onClick={() => navigate('/dashboard')}
            sx={{
              width: '100%',
              border: 'none',
              backgroundColor: theme.brand.primaryDark,
              color: theme.palette.common.white,
              fontWeight: 600,
              borderRadius: '8px',
              padding: '13px 0',
              cursor: 'pointer',
              fontSize: '15px',
              fontFamily: theme.brand.fontBase,
              transition: 'all 0.3s ease',
              '&:hover': {
                backgroundColor: theme.brand.primaryDark,
                transform: 'translateY(-2px)',
                boxShadow: '0 4px 12px rgba(15, 110, 86, 0.25)',
              },
            }}
          >
            Track your order →
          </Box>
        )}

        <Box
          component="button"
          type="button"
          onClick={() => navigate('/')}
          sx={{
            width: '100%',
            ...(user ? {
              backgroundColor: 'transparent',
              color: theme.brand.primary,
              border: `1.5px solid ${theme.brand.primary}`,
              padding: '12px 0',
              '&:hover': {
                backgroundColor: 'rgba(0, 112, 74, 0.05)',
              },
            } : {
              border: 'none',
              backgroundColor: theme.brand.primaryDark,
              color: theme.palette.common.white,
              padding: '13px 0',
              '&:hover': {
                backgroundColor: theme.brand.primaryDark,
                transform: 'translateY(-2px)',
                boxShadow: '0 4px 12px rgba(15, 110, 86, 0.25)',
              },
            }),
            fontWeight: 600,
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '15px',
            fontFamily: theme.brand.fontBase,
            transition: 'all 0.3s ease',
          }}
        >
          Back to home
        </Box>
      </Box>

      <Typography sx={{ fontSize: '12px', color: theme.brand.textSecondary, marginTop: '40px' }}>
        Stories Café · Beirut
      </Typography>
    </Box>
  )
}
