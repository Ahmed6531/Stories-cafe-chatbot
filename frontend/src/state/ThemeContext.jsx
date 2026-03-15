import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'

const STORAGE_KEY = 'stories-color-mode'

const ThemeModeContext = createContext({
  mode: 'light',
  toggleMode: () => {},
})

export function useThemeMode() {
  return useContext(ThemeModeContext)
}

function buildMuiTheme(mode) {
  const isDark = mode === 'dark'
  return createTheme({
    palette: {
      mode,
      primary: { main: '#00704a', contrastText: '#ffffff' },
      background: {
        default: isDark ? '#1a1a1a' : '#ffffff',
paper:   isDark ? '#242424' : '#ffffff',
      },
      text: {
        primary:   isDark ? '#f0f0f0' : '#2b2b2b',
secondary: isDark ? '#b0b0b0' : '#79747e',
      },
      divider: isDark ? 'rgba(255,255,255,0.10)' : '#e9e9e9',
    },
    shape: { borderRadius: 12 },
    typography: {
      fontFamily: "'Montserrat', -apple-system, BlinkMacSystemFont, sans-serif",
    },
  })
}

function applyCssVars(mode) {
  const isDark = mode === 'dark'
  const root = document.documentElement
  root.setAttribute('data-color-mode', mode)
  if (isDark) {
    root.style.setProperty('--color-bg',      '#1a1a1a')
root.style.setProperty('--color-surface', '#242424')
    root.style.setProperty('--color-border',         'rgba(255,255,255,0.10)')
    root.style.setProperty('--color-text-primary',   '#f0f0f0')
root.style.setProperty('--color-text-secondary', '#b0b0b0')
  } else {
    root.style.setProperty('--color-bg',             '#ffffff')
    root.style.setProperty('--color-surface',        '#ffffff')
    root.style.setProperty('--color-border',         '#e9e9e9')
    root.style.setProperty('--color-text-primary',   '#2b2b2b')
    root.style.setProperty('--color-text-secondary', '#79747e')
  }
}

export function AppThemeProvider({ children }) {
  const [mode, setMode] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) || 'light' } catch { return 'light' }
  })

  useEffect(() => { applyCssVars(mode) }, [mode])

  const toggleMode = useCallback(() => {
    setMode((prev) => {
      const next = prev === 'light' ? 'dark' : 'light'
      try { localStorage.setItem(STORAGE_KEY, next) } catch { }
      return next
    })
  }, [])

  const ctxValue = useMemo(() => ({ mode, toggleMode }), [mode, toggleMode])
  const muiTheme = useMemo(() => buildMuiTheme(mode), [mode])

  return (
    <ThemeModeContext.Provider value={ctxValue}>
      <ThemeProvider theme={muiTheme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeModeContext.Provider>
  )
}