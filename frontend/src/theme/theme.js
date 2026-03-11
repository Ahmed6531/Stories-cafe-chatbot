// frontend/src/theme/theme.js
import { createTheme } from '@mui/material/styles'

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
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
  },
})
