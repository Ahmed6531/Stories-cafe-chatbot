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
import DashboardIcon from '@mui/icons-material/Dashboard'
import HistoryIcon from '@mui/icons-material/History'

import '../styles/index.css'

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

    if (location.pathname.startsWith('/menu')) {
      crumbs.push({ label: 'Menu', to: '/menu' })
      const params = new URLSearchParams(location.search)
      const category = params.get('category')
      if (category && category !== 'All') {
        crumbs.push({ label: category, to: `/menu?category=${encodeURIComponent(category)}` })
      }
    }

    if (location.pathname.startsWith('/cart')) crumbs.push({ label: 'Cart', to: '/cart' })
    if (location.pathname.startsWith('/checkout')) crumbs.push({ label: 'Checkout', to: '/checkout' })
    if (location.pathname.startsWith('/success')) crumbs.push({ label: 'Success', to: '/success' })
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
        }
        crumbs.push({ label: '...', to: '#' })
      }
    }

    return crumbs
  }, [location.pathname, location.search, item, prevCategory])
}

function Bubble({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`msg-row ${isUser ? 'msg-row-user' : 'msg-row-bot'}`}>
      <div className={`msg-bubble ${isUser ? 'msg-bubble-user' : 'msg-bubble-bot'}`}>
        {msg.text.split('\n').map((line, i, arr) => (
          <span key={i}>
            {line}
            {i < arr.length - 1 && <br />}
          </span>
        ))}
      </div>
      <span className="msg-time">{msg.time}</span>
    </div>
  )
}

export default function Navbar() {
  const [isAuthed, setIsAuthed] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(true)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatClosing, setChatClosing] = useState(false)
  const [micMode, setMicMode] = useState('idle')
  const [chatInput, setChatInput] = useState('')
  const [chatWidth, setChatWidth] = useState(380)
  const [messages, setMessages] = useState([])
  const [typing, setTyping] = useState(false)
  const [chipsVisible, setChipsVisible] = useState(true)

  const pageRef = useRef(null)
  const msgsRef = useRef(null)
  const pendingReplyTimeoutRef = useRef(null)

  const { cartCount } = useCart()
  const crumbs = useBreadcrumb()
  const location = useLocation()
  const navigate = useNavigate()

  const hasConversation = messages.length > 0

  useEffect(() => {
    const token = localStorage.getItem('token')
    setIsAuthed(!!token)
  }, [location.pathname])

  const handleLogout = () => {
    localStorage.removeItem('token')
    setIsAuthed(false)
    navigate('/login')
  }

  const isChatAllowedRoute =
    location.pathname === '/' ||
    location.pathname === '/menu' ||
    location.pathname === '/cart' ||
    location.pathname.startsWith('/item/')

  const navItems = [
    { label: 'Home', to: '/', icon: <HomeIcon /> },
    { label: 'Menu', to: '/menu', icon: <MenuBookIcon /> },
    { label: 'Cart', to: '/cart', icon: <ShoppingCartIcon /> },
    ...(isAuthed ? [
      { label: 'Dashboard', to: '/dashboard', icon: <DashboardIcon /> },
      { label: 'Orders', to: '/orders', icon: <HistoryIcon /> }
    ] : [])
  ]

  useEffect(() => {
    if (pageRef.current) pageRef.current.scrollTop = 0
  }, [location.pathname, location.search])

  const closeChat = () => {
    if (pendingReplyTimeoutRef.current) {
      window.clearTimeout(pendingReplyTimeoutRef.current)
      pendingReplyTimeoutRef.current = null
    }
    setChatClosing(true)
  }

  const handleAnimationEnd = (e) => {
    if (chatClosing && e.animationName === 'chatUnitPushOut') {
      setChatClosing(false)
      setChatOpen(false)
      setMicMode('idle')
      setTyping(false)
      setMessages([])
      setChipsVisible(true)
    }
  }

  useEffect(() => {
    if (!isChatAllowedRoute && (chatOpen || chatClosing)) {
      setChatClosing(false)
      setChatOpen(false)
    }
  }, [isChatAllowedRoute, chatOpen, chatClosing])

  const sendMessage = (text) => {
    const trimmed = text.trim()
    if (!trimmed) return
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    if (messages.length === 0) setChipsVisible(false)

    setMessages((m) => [...m, { id: Date.now(), role: 'user', text: trimmed, time: now }])
    setChatInput('')
    setMicMode('thinking')
    setTyping(true)

    if (pendingReplyTimeoutRef.current) window.clearTimeout(pendingReplyTimeoutRef.current)
    pendingReplyTimeoutRef.current = window.setTimeout(() => {
      setTyping(false)
      setMessages((m) => [
        ...m,
        {
          id: Date.now() + 1,
          role: 'bot',
          text: "Got it! I'll have that ready for you shortly. Anything else I can add?",
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ])
      setMicMode('idle')
      pendingReplyTimeoutRef.current = null
    }, 1400)
  }

  return (
    <div className="app-shell">
      <StyledDrawer variant="permanent" open={drawerOpen}>
        <Box sx={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: drawerOpen ? 'space-between' : 'center', px: drawerOpen ? 2 : 0 }}>
          {drawerOpen && <img src="/stories-logo.png" alt="Stories" className="drawer-logo" height="40" />}
          <IconButton onClick={() => setDrawerOpen(!drawerOpen)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
          </IconButton>
        </Box>
        <List>
          {navItems.map((item) => (
            <ListItem key={item.to} disablePadding>
              <ListItemButton
                onClick={() => navigate(item.to)}
                selected={location.pathname === item.to}
                sx={{ borderRadius: '12px', mx: 1, my: 0.5 }}
              >
                <ListItemIcon sx={{ color: location.pathname === item.to ? 'primary.main' : 'inherit' }}>
                  {item.icon}
                </ListItemIcon>
                {drawerOpen && <ListItemText primary={item.label} />}
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </StyledDrawer>

      <div className="content-shell">
        <main className="main">
          <header className="topbar">
            <div className="topbar-left">
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
                <button className="top-pill auth" type="button" onClick={handleLogout}>Logout</button>
              ) : (
                <button className="top-pill outline" type="button" onClick={() => navigate('/login')}>Login</button>
              )}
              <button className="top-pill outline" type="button" onClick={() => navigate('/cart')}>
                Cart {cartCount > 0 && <span className="cart-badge">{cartCount}</span>}
              </button>
            </div>
          </header>

          <div ref={pageRef} className="page">
            <Outlet />
          </div>
        </main>

        {isChatAllowedRoute && (chatOpen || chatClosing) && (
          <div className={`chat-unit${chatClosing ? ' chat-unit-closing' : ''}`} style={{ '--chat-panel-width': `${chatWidth}px` }} onAnimationEnd={handleAnimationEnd}>
            <div className="chat-panel">
              <div className="cp-header">
                <Typography variant="h6" fontWeight={800}>Ai Barista</Typography>
                <IconButton onClick={closeChat} size="small"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2"><line x1="1" y1="1" x2="13" y2="13" /><line x1="13" y1="1" x2="1" y2="13" /></svg></IconButton>
              </div>
              <section className="chat-conversation">
                {hasConversation ? (
                  <div ref={msgsRef} className="chat-msgs">
                    {messages.map((msg) => <Bubble key={msg.id} msg={msg} />)}
                    {typing && <div className="msg-typing">...</div>}
                  </div>
                ) : (
                  <Box sx={{ p: 4, textAlign: 'center' }}>
                    <Typography variant="h5" fontWeight={800} gutterBottom>Hello! 👋</Typography>
                    <Typography variant="body1">I'm your AI barista. What can I get started for you today?</Typography>
                  </Box>
                )}
                {chipsVisible && (
                  <div className="chat-suggestions">
                    <button onClick={() => sendMessage("What's freshly brewed?")}>Freshly Brewed?</button>
                    <button onClick={() => sendMessage("Surprise me!")}>Surprise me!</button>
                  </div>
                )}
              </section>
              <div className="chat-input-bar">
                <input
                  className="chat-input"
                  placeholder="Type to order..."
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendMessage(chatInput)}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {isChatAllowedRoute && !chatOpen && (
        <button className="voice-fab" type="button" onClick={() => { setChatOpen(true); setChatClosing(false); }}>
          ☕
        </button>
      )}
    </div>
  )
}
