import { Outlet, useLocation, useNavigate, Link } from 'react-router-dom'
import { useMemo, useState, useEffect, useRef } from 'react'
import { useCart } from '../state/useCart'
import { fetchMenuItemById } from '../API/menuApi'
import { styled } from '@mui/material/styles'
import Drawer from '@mui/material/Drawer'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Box from '@mui/material/Box'
import HomeIcon from '@mui/icons-material/Home'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart'

const DRAWER_OPEN_WIDTH = 240
const DRAWER_CLOSED_WIDTH = 64

const paperStyles = {
  borderRight: '1px solid #e9e9e9',
  backgroundColor: '#fff',
}

const openedMixin = (theme) => ({
  width: DRAWER_OPEN_WIDTH,
  transition: theme.transitions.create('width', {
    easing: theme.transitions.easing.sharp,
    duration: 250,
  }),
  overflowX: 'hidden',
  ...paperStyles,
})

const closedMixin = (theme) => ({
  width: DRAWER_CLOSED_WIDTH,
  transition: theme.transitions.create('width', {
    easing: theme.transitions.easing.sharp,
    duration: 250,
  }),
  overflowX: 'hidden',
  ...paperStyles,
})

const StyledDrawer = styled(Drawer, { shouldForwardProp: (prop) => prop !== 'open' })(
  ({ theme, open }) => ({
    width: open ? DRAWER_OPEN_WIDTH : DRAWER_CLOSED_WIDTH,
    flexShrink: 0,
    whiteSpace: 'nowrap',
    boxSizing: 'border-box',
    ...(open
      ? {
          ...openedMixin(theme),
          '& .MuiDrawer-paper': openedMixin(theme),
        }
      : {
          ...closedMixin(theme),
          '& .MuiDrawer-paper': closedMixin(theme),
        }),
  })
)

function useBreadcrumb() {
  const location = useLocation()
  const [item, setItem] = useState(null)

  // Derive prevCategory directly from URL — no setState in effect needed
  const prevCategory = useMemo(() => {
    if (location.pathname === '/menu') {
      const params = new URLSearchParams(location.search)
      const category = params.get('category')
      return category && category !== 'All' ? category : null
    }
    return null
  }, [location.pathname, location.search])

  useEffect(() => {
    const fetchItem = async () => {
      if (location.pathname.startsWith('/item/')) {
        const id = location.pathname.split('/item/')[1]
        if (id) {
          try {
            const data = await fetchMenuItemById(id)
            setItem(data)
          } catch (err) {
            console.error('Failed to fetch item for breadcrumb:', err)
            setItem(null)
          }
        }
      } else {
        setItem(null)
      }
    }
    fetchItem()
  }, [location.pathname])

  return useMemo(() => {
    const crumbs = [{ label: 'Home', to: '/' }]
    const params = new URLSearchParams(location.search)

    if (location.pathname.startsWith('/menu')) {
      crumbs.push({ label: 'Menu', to: '/menu' })
      const category = params.get('category')
      if (category && category !== 'All') {
        crumbs.push({ label: category, to: `/menu?category=${encodeURIComponent(category)}` })
      }
    }

    if (location.pathname.startsWith('/cart')) crumbs.push({ label: 'Cart', to: '/cart' })
    if (location.pathname.startsWith('/login')) crumbs.push({ label: 'Login', to: '/login' })
    if (location.pathname.startsWith('/register')) crumbs.push({ label: 'Register', to: '/register' })

    if (location.pathname.startsWith('/item/')) {
      crumbs.push({ label: 'Menu', to: '/menu' })
      if (item) {
        crumbs.push({ label: item.category, to: `/menu?category=${encodeURIComponent(item.category)}` })
        crumbs.push({ label: item.name, to: location.pathname })
      } else {
        if (prevCategory) {
          crumbs.push({ label: prevCategory, to: `/menu?category=${encodeURIComponent(prevCategory)}` })
        } else {
          crumbs.push({ label: '---', to: '#' })
        }
        crumbs.push({ label: '---', to: '#' })
      }
    }

    return crumbs
  }, [location.pathname, location.search, item, prevCategory])
}

export default function Navbar() {
  const [isAuthed] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(true)
  const [chatOpen, setChatOpen] = useState(false)
  const [micMode, setMicMode] = useState('idle') // 'idle' | 'listening' | 'thinking'
  const [chatInput, setChatInput] = useState('')
  const [chatWidth, setChatWidth] = useState(380)
  const pageRef = useRef(null)
  const { cartCount } = useCart()
  const crumbs = useBreadcrumb()
  const location = useLocation()
  const navigate = useNavigate()
  const isChatAllowedRoute =
    location.pathname === '/' ||
    location.pathname === '/menu' ||
    location.pathname === '/cart' ||
    location.pathname.startsWith('/item/')

  const navItems = [
    { label: 'Home', to: '/', icon: <HomeIcon /> },
    { label: 'Menu', to: '/menu', icon: <MenuBookIcon /> },
    { label: 'Cart', to: '/cart', icon: <ShoppingCartIcon /> },
  ]

  useEffect(() => {
    if (pageRef.current) {
      pageRef.current.scrollTop = 0
    }
  }, [location.pathname, location.search])

  useEffect(() => {
    if (!isChatAllowedRoute && chatOpen) {
      const closeTimer = window.setTimeout(() => {
        setChatOpen(false)
        setMicMode('idle')
      }, 0)

      return () => window.clearTimeout(closeTimer)
    }

    return undefined
  }, [isChatAllowedRoute, chatOpen])

  const handleResizeStart = (event) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = chatWidth

    const handleMouseMove = (moveEvent) => {
      const delta = startX - moveEvent.clientX
      const nextWidth = Math.min(600, Math.max(280, startWidth + delta))
      setChatWidth(nextWidth)
    }

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  const cycleMicMode = () => {
    setMicMode((m) => (m === 'idle' ? 'listening' : m === 'listening' ? 'thinking' : 'idle'))
  }

  const handleInputMicClick = () => {
    if (micMode === 'idle') {
      setMicMode('listening')
      return
    }

    if (micMode === 'listening') {
      setMicMode('thinking')
    }
  }

  return (
    <div className="app-shell">
      <StyledDrawer variant="permanent" open={drawerOpen}>
        <Box
          sx={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: drawerOpen ? 'space-between' : 'center',
            px: drawerOpen ? 2 : 0,
            pt: 0.5,
          }}
        >
          {drawerOpen ? (
            <img
              src="/stories-logo.png"
              alt="Stories"
              className="drawer-logo"
              onError={(e) => { e.currentTarget.style.display = 'none' }}
            />
          ) : null}
          <IconButton
            onClick={() => setDrawerOpen((prev) => !prev)}
            aria-label="Toggle drawer"
            sx={{
              width: 36,
              height: 36,
              borderRadius: '8px',
              color: '#1a4a35',
              ml: drawerOpen ? 1 : 0,
              mt: 0,
              '&:hover': { bgcolor: 'rgba(26,74,53,.08)' },
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </IconButton>
        </Box>

        <List>
          {navItems.map((item) => {
            const isActive =
              item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to)

            const navButton = (
              <ListItem key={item.to} disablePadding sx={{ display: 'block', my: 0.25 }}>
                <ListItemButton
                  onClick={() => navigate(item.to)}
                  selected={isActive}
                  sx={{
                    minHeight: 44,
                    justifyContent: drawerOpen ? 'initial' : 'center',
                    px: drawerOpen ? 2 : 1.5,
                    mx: 1,
                    my: 0.5,
                    mt: drawerOpen ? 0.5 : 0.75,
                    borderRadius: '20px',
                    color: isActive ? '#fff' : '#1a4a35',
                    fontFamily: 'Montserrat, sans-serif',
                    fontWeight: 600,
                    position: 'relative',
                    '&.Mui-selected': {
                      bgcolor: 'rgba(26,107,58,0.10)',
                      color: '#1a4a35',
                      '& .MuiListItemIcon-root': { color: '#1a6b3a !important' },
                      '&::before': {
                        content: '""',
                        position: 'absolute',
                        left: 0,
                        top: 10,
                        bottom: 10,
                        width: 3,
                        borderRadius: 3,
                        backgroundColor: '#1a6b3a',
                      },
                      '&:hover': { bgcolor: 'rgba(26,107,58,0.14)' },
                    },
                    '&:hover': {
                      bgcolor: 'rgba(26,74,53,.08)',
                      color: '#1a4a35',
                    },
                  }}
                >
                  <ListItemIcon
                    sx={{
                      minWidth: 0,
                      mr: drawerOpen ? 1.5 : 'auto',
                      ml: drawerOpen ? -0.5 : 0,
                      justifyContent: 'center',
                      color: isActive ? '#fff' : '#555',
                    }}
                  >
                    {item.icon}
                  </ListItemIcon>
                  {drawerOpen && (
                    <ListItemText
                      primary={item.label}
                      primaryTypographyProps={{
                        fontFamily: 'Montserrat, sans-serif',
                        fontWeight: 600,
                        fontSize: 16,
                      }}
                    />
                  )}
                </ListItemButton>
              </ListItem>
            )

            if (!drawerOpen) {
              return (
                <Tooltip key={item.to} title={item.label} placement="right">
                  {navButton}
                </Tooltip>
              )
            }

            return navButton
          })}
        </List>

      </StyledDrawer>

      <div className="content-shell">
        <main className="main">
          <header className="topbar">
            <div className="topbar-left">
              {!drawerOpen && (
                <img
                  src="/stories-logo.png"
                  alt="Stories"
                  className="topbar-logo"
                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                />
              )}
              {location.pathname !== '/' && (
                <div className="breadcrumb">
                  {crumbs.map((c, idx) => (
                    <span key={c.to + idx} className="crumb">
                      <Link to={c.to} className="crumb-link">{c.label}</Link>
                      {idx < crumbs.length - 1 && <span className="crumb-sep">/</span>}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="topbar-actions">
              {isAuthed ? (
                <button className="top-pill auth" type="button" onClick={() => navigate(-1)}>
                  Back
                </button>
              ) : (
                <button className="top-pill outline" type="button" onClick={() => navigate('/login')}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                  </svg>
                  <span>Login</span>
                </button>
              )}
              <button className="top-pill outline" type="button" onClick={() => navigate('/cart')}>
                <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="9" cy="21" r="1" />
                    <circle cx="20" cy="21" r="1" />
                    <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 001.95-1.57L23 6H6" />
                  </svg>
                </span>
                <span>Cart</span>
                {cartCount > 0 && <span className="cart-badge">{cartCount}</span>}
              </button>
            </div>
          </header>

          <div ref={pageRef} className="page">
            <Outlet />
          </div>
        </main>
        {isChatAllowedRoute && chatOpen && (
          <div className="chat-unit" style={{ '--chat-panel-width': `${chatWidth}px` }}>
            <div className="resize-handle" onMouseDown={handleResizeStart} />
            <div className="chat-panel-shell">
              <aside className="chat-panel">
                <div className="cp-header">
                  <button
                    className="chat-panel-close"
                    type="button"
                    aria-label="Close"
                    onClick={() => {
                      setChatOpen(false)
                      setMicMode('idle')
                    }}
                  >
                    <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <line x1="1" y1="1" x2="13" y2="13" />
                      <line x1="13" y1="1" x2="1" y2="13" />
                    </svg>
                  </button>
                </div>

                <section className="chat-conversation" aria-label="Conversation area">
                  <div className="chat-idle" data-mode={micMode}>
                    <div className="voice-mic-wrapper" data-mode={micMode}>
                      <span className="voice-ring voice-ring-1" />
                      <span className="voice-ring voice-ring-2" />
                      <span className="voice-ring voice-ring-3" />

                      <svg className="voice-arc-svg" viewBox="0 0 90 90" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle
                          className="voice-arc-circle"
                          cx="45"
                          cy="45"
                          r="40"
                          stroke="#1a6b3c"
                          strokeWidth="3.5"
                          strokeLinecap="round"
                        />
                      </svg>
                      <svg className="voice-arc-svg-2" viewBox="0 0 90 90" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle
                          className="voice-arc-circle"
                          cx="45"
                          cy="45"
                          r="40"
                          stroke="#1a6b3c"
                          strokeWidth="3.5"
                          strokeLinecap="round"
                        />
                      </svg>

                      <button
                        className="voice-mic-btn"
                        type="button"
                        aria-label="Tap to speak"
                        onClick={cycleMicMode}
                      >
                        <svg width="30" height="30" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M65.732 77.6329C65.2176 71.801 63.7431 66.1064 61.5486 60.7204C59.4226 55.3002 56.1993 50.3945 52.7703 45.7633L47.0782 38.9022C46.0495 37.7015 45.1922 36.3979 44.2664 35.1286C43.4435 33.7907 42.5176 32.4871 41.8318 31.0463C38.78 25.4545 37.0312 18.9365 37.1684 12.3842C37.237 8.57633 37.9228 4.80274 39.0543 1.20068C37.6142 1.50943 36.174 1.88679 34.8024 2.33276C34.8024 2.40137 34.7338 2.43568 34.7338 2.50429C32.1621 7.82161 30.6533 13.6192 30.6876 19.4168C30.7562 25.2144 32.4021 30.8748 35.2824 35.8147C38.0256 40.9262 42.1747 44.8027 46.1867 49.6398C49.9243 54.4768 53.4904 59.6226 55.8907 65.4202C58.3939 71.1492 60.1084 77.2556 60.7942 83.5678C61.3085 88.6449 61.1714 93.7907 60.3827 98.8336C61.4457 98.5935 62.5087 98.3533 63.5717 98.0446C65.5948 91.4237 66.3492 84.4597 65.7662 77.6672L65.732 77.6329Z" fill="white"/>
                          <path d="M54.1417 84.0482C53.9017 78.4221 52.7015 72.8647 50.747 67.5131C48.8954 62.0928 45.8778 57.1185 42.6546 52.3501C39.3284 47.7875 34.9393 43.0534 32.3676 37.393C29.5901 31.8355 28.1842 25.5576 28.4928 19.3827C28.8014 13.5508 30.6188 7.92472 33.2934 2.88184C13.9538 9.7772 0.0664062 28.2335 0.0664062 49.9487C0.0664062 77.5302 22.4235 99.8973 49.9926 99.8973C50.7813 99.8973 51.57 99.8973 52.3586 99.8287C53.7302 94.7172 54.416 89.3655 54.1417 84.0139V84.0482Z" fill="white"/>
                          <path d="M99.9189 49.9485C99.9189 22.3671 77.5618 0 49.9926 0C49.1697 0 48.3467 0 47.5237 0.0686106C45.5349 4.04803 44.1976 8.33619 43.8204 12.693C43.4089 18.0446 44.4376 23.5334 46.8036 28.6106C48.9982 33.7907 52.7701 38.0103 56.3705 43.1904C59.6967 48.3362 62.7828 53.7221 64.6687 59.5883C66.6575 65.3859 67.8234 71.458 67.9606 77.5643C68.0977 84.4597 66.9662 91.3551 64.6344 97.7358C85.037 91.458 99.8846 72.4528 99.8846 49.9828L99.9189 49.9485Z" fill="white"/>
                        </svg>
                      </button>
                    </div>
                    <p className="voice-state-label" data-mode={micMode}>
                      {micMode === 'listening' ? 'Listening...' : micMode === 'thinking' ? 'Thinking...' : 'tap to speak'}
                    </p>
                    <div className="chat-suggestions" role="list" aria-label="Suggestions">
                      <button className="chat-suggestion-chip" type="button">&quot;What&apos;s good today?&quot;</button>
                      <button className="chat-suggestion-chip" type="button">&quot;Repeat my last order&quot;</button>
                      <button className="chat-suggestion-chip" type="button">&quot;Surprise me&quot;</button>
                    </div>
                  </div>
                </section>

                <div className="chat-input-bar">
                  <div className="chat-input-wrap">
                    <input
                      className="chat-input"
                      type="text"
                      placeholder="Type your order..."
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                    />
                    {chatInput && (
                      <button className="chat-input-send" type="button" aria-label="Send">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="22" y1="2" x2="11" y2="13" />
                          <polygon points="22 2 15 22 11 13 2 9 22 2" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <button
                    className={`chat-input-mic ${micMode === 'listening' ? 'active' : ''}`}
                    type="button"
                    aria-label="Voice input"
                    onClick={handleInputMicClick}
                  >
                    {micMode === 'listening' ? (
                      <span className="chat-input-mic-wave" aria-hidden="true">
                        <span className="chat-input-mic-bar" />
                        <span className="chat-input-mic-bar" />
                        <span className="chat-input-mic-bar" />
                      </span>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="3" width="6" height="11" rx="3" />
                        <path d="M5 11a7 7 0 0 0 14 0" />
                        <line x1="12" y1="18" x2="12" y2="21" />
                        <line x1="8" y1="21" x2="16" y2="21" />
                      </svg>
                    )}
                  </button>
                </div>
              </aside>
            </div>
          </div>
        )}
      </div>
      {isChatAllowedRoute && !chatOpen && (
        <button
          className="voice-fab"
          type="button"
          aria-label="Open chat"
          onClick={() => {
            setDrawerOpen(false)
            setChatOpen(true)
          }}
        >
          <svg width="28" height="28" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M65.732 77.6329C65.2176 71.801 63.7431 66.1064 61.5486 60.7204C59.4226 55.3002 56.1993 50.3945 52.7703 45.7633L47.0782 38.9022C46.0495 37.7015 45.1922 36.3979 44.2664 35.1286C43.4435 33.7907 42.5176 32.4871 41.8318 31.0463C38.78 25.4545 37.0312 18.9365 37.1684 12.3842C37.237 8.57633 37.9228 4.80274 39.0543 1.20068C37.6142 1.50943 36.174 1.88679 34.8024 2.33276C34.8024 2.40137 34.7338 2.43568 34.7338 2.50429C32.1621 7.82161 30.6533 13.6192 30.6876 19.4168C30.7562 25.2144 32.4021 30.8748 35.2824 35.8147C38.0256 40.9262 42.1747 44.8027 46.1867 49.6398C49.9243 54.4768 53.4904 59.6226 55.8907 65.4202C58.3939 71.1492 60.1084 77.2556 60.7942 83.5678C61.3085 88.6449 61.1714 93.7907 60.3827 98.8336C61.4457 98.5935 62.5087 98.3533 63.5717 98.0446C65.5948 91.4237 66.3492 84.4597 65.7662 77.6672L65.732 77.6329Z" fill="white"/>
            <path d="M54.1417 84.0482C53.9017 78.4221 52.7015 72.8647 50.747 67.5131C48.8954 62.0928 45.8778 57.1185 42.6546 52.3501C39.3284 47.7875 34.9393 43.0534 32.3676 37.393C29.5901 31.8355 28.1842 25.5576 28.4928 19.3827C28.8014 13.5508 30.6188 7.92472 33.2934 2.88184C13.9538 9.7772 0.0664062 28.2335 0.0664062 49.9487C0.0664062 77.5302 22.4235 99.8973 49.9926 99.8973C50.7813 99.8973 51.57 99.8973 52.3586 99.8287C53.7302 94.7172 54.416 89.3655 54.1417 84.0139V84.0482Z" fill="white"/>
            <path d="M99.9189 49.9485C99.9189 22.3671 77.5618 0 49.9926 0C49.1697 0 48.3467 0 47.5237 0.0686106C45.5349 4.04803 44.1976 8.33619 43.8204 12.693C43.4089 18.0446 44.4376 23.5334 46.8036 28.6106C48.9982 33.7907 52.7701 38.0103 56.3705 43.1904C59.6967 48.3362 62.7828 53.7221 64.6687 59.5883C66.6575 65.3859 67.8234 71.458 67.9606 77.5643C68.0977 84.4597 66.9662 91.3551 64.6344 97.7358C85.037 91.458 99.8846 72.4528 99.8846 49.9828L99.9189 49.9485Z" fill="white"/>
          </svg>
        </button>
      )}
    </div>
  )
}

