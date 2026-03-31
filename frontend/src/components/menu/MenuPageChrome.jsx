import { Box, Typography, styled } from '@mui/material'

export const PageWrap = styled(Box)(() => ({
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
}))

export const SectionHeading = styled(Box)(() => ({
  marginTop: '4px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '4px',
}))

export const SectionLabel = styled(Typography)(({ theme }) => ({
  fontFamily: theme.brand.fontDisplay,
  fontSize: '1.5rem',
  fontWeight: 900,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: theme.brand.primary,
  margin: 0,
  textAlign: 'center',
  position: 'relative',
  paddingBottom: '8px',

  [theme.breakpoints.down('md')]: {
    fontSize: '1.25rem',
    letterSpacing: '0.04em',
    paddingBottom: '4px',
  },
}))

export const StatusText = styled(Typography, {
  shouldForwardProp: (prop) => prop !== 'isError',
})(({ theme, isError }) => ({
  fontFamily: theme.brand.fontBase,
  fontSize: '16px',
  fontWeight: 500,
  color: isError ? '#b91c1c' : theme.brand.textSecondary,
  margin: 0,
}))
