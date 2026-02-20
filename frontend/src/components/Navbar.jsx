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
  const [chatWidth, setChatWidth] = useState(380)
  const pageRef = useRef(null)
  const { cartCount } = useCart()
  const crumbs = useBreadcrumb()
  const location = useLocation()
  const navigate = useNavigate()

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
              style={{ height: 30, width: 'auto', marginLeft: 4 }}
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
              <button
                className="chat-toggle-btn"
                type="button"
                aria-label={chatOpen ? 'Close chat panel' : 'Open chat panel'}
                onClick={() => {
                  setChatOpen((prev) => {
                    const next = !prev
                    if (next) setDrawerOpen(false)
                    return next
                  })
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a4 4 0 0 1-4 4H8l-5 4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
                </svg>
              </button>
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
        {chatOpen && (
          <div className="chat-unit" style={{ '--chat-panel-width': `${chatWidth}px` }}>
            <div className="resize-handle" onMouseDown={handleResizeStart} />
            <div className="chat-panel-shell">
              <aside className="chat-panel">
                <button className="chat-panel-close" type="button" aria-label="Close chat panel" onClick={() => setChatOpen(false)}>
                  x
                </button>

                <section className="chat-conversation" aria-label="Conversation area">
                  <div className="chat-idle">
                    <button className="chat-idle-mic" type="button" aria-label="Tap to speak">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="3" width="6" height="11" rx="3" />
                        <path d="M5 11a7 7 0 0 0 14 0" />
                        <line x1="12" y1="18" x2="12" y2="21" />
                        <line x1="8" y1="21" x2="16" y2="21" />
                      </svg>
                    </button>
                    <p className="chat-idle-label">tap to speak</p>
                    <div className="chat-suggestions" role="list" aria-label="Suggestions">
                      <button className="chat-suggestion-chip" type="button">What&apos;s good today?</button>
                      <button className="chat-suggestion-chip" type="button">Repeat my last order</button>
                      <button className="chat-suggestion-chip" type="button">Surprise me</button>
                    </div>
                  </div>
                </section>

                <div className="chat-input-bar">
                  <input className="chat-input" type="text" placeholder="Type your order..." />
                  <button className="chat-input-mic" type="button" aria-label="Use microphone">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="3" width="6" height="11" rx="3" />
                      <path d="M5 11a7 7 0 0 0 14 0" />
                      <line x1="12" y1="18" x2="12" y2="21" />
                      <line x1="8" y1="21" x2="16" y2="21" />
                    </svg>
                  </button>
                </div>
              </aside>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

