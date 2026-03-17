import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

export default function AuthShell({
  title,
  onSubmit,
  submitLabel,
  footerText,
  footerActionLabel,
  onFooterAction,
  children,
}) {
  return (
    <Box sx={{ maxWidth: '400px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <Typography
        component="h1"
        sx={{
          fontFamily: (theme) => theme.brand.fontDisplay,
          fontSize: '28px',
          fontWeight: 700,
          color: (theme) => theme.brand.primary,
          margin: 0,
        }}
      >
        {title}
      </Typography>

      <Box
        component="form"
        onSubmit={onSubmit}
        sx={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '20px', border: '1px solid #e0e0e0', borderRadius: '12px' }}
      >
        {children}

        <Box
          component="button"
          type="submit"
          sx={{
            marginTop: '12px',
            border: 'none',
            backgroundColor: (theme) => theme.brand.primaryDark,
            color: '#fff',
            fontWeight: 600,
            borderRadius: '8px',
            padding: '1rem 2rem',
            cursor: 'pointer',
            width: '100%',
            fontSize: '1rem',
            fontFamily: (theme) => theme.brand.fontBase,
            letterSpacing: '0.5px',
            transition: 'all 0.3s ease',
            '&:hover': {
              backgroundColor: (theme) => theme.brand.primaryDark,
              transform: 'translateY(-2px)',
            },
          }}
        >
          {submitLabel}
        </Box>
      </Box>

      <Box component="p" sx={{ textAlign: 'center', marginTop: '16px', marginBottom: 0 }}>
        {footerText}{' '}
        <button
          type="button"
          style={{ background: 'none', border: 'none', color: '#00704a', textDecoration: 'underline', cursor: 'pointer', fontWeight: 'bold' }}
          onClick={onFooterAction}
        >
          {footerActionLabel}
        </button>
      </Box>
    </Box>
  )
}
