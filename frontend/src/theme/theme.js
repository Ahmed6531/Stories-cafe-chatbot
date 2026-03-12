// frontend/src/theme/theme.js
import { createTheme } from '@mui/material/styles'

const brand = {
  primary: '#00704a',
  primaryHover: '#147d56',
  primaryDark: '#1e5631',
  textPrimary: '#2b2b2b',
  textSecondary: '#79747e',
  border: '#e0e0e0',
  borderCard: '#e5e7eb',
  borderLight: '#e9e9e9',
  borderSoft: '#edf2ef',
  bgLight: '#f8f9f8',
  shadowSm: '0 0 6px rgba(0,0,0,0.06)',
  shadowHover: '0 4px 12px rgba(0,0,0,0.15)',
  fontBase: "'Montserrat', sans-serif",
  fontDisplay: "'DIN Alternate Bold', 'Montserrat', sans-serif",
}

export const theme = createTheme({
  breakpoints: {
    values: {
      xs: 0,
      sm: 600,
      md: 850,
      lg: 1200,
      xl: 1536,
    },
  },
  palette: {
    primary: {
      main: '#0B6B4F', // Stories-like green
      contrastText: '#FFFFFF',
    },
  },
  shape: {
    borderRadius: 12,
  },
  typography: {
    fontFamily: brand.fontBase,
  },
})

theme.brand = brand
