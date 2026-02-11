// frontend/src/theme/theme.js
import { createTheme } from '@mui/material/styles'

export const theme = createTheme({
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
