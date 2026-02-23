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

// migrated from main.css
const brand = {
  primary: '#00704a',
  primaryHover: '#147d56',
  primaryActive: '#004a34',
  primaryDark: '#1e5631',
  textPrimary: '#2b2b2b',
  textSecondary: '#79747e',
  border: '#e0e0e0',
  borderLight: '#e9e9e9',
  bgLight: '#f8f9f8',
  shadowSm: '0 0 6px rgba(0,0,0,0.06)',
  shadowHover: '0 4px 12px rgba(0,0,0,0.15)',
  fontBase: "'Montserrat', sans-serif",
  fontDisplay: "'DIN Alternate Bold', 'Montserrat', sans-serif",
}

const Topbar = styled('header')(() => ({
  padding: '6px 14px',
  minHeight: '52px',
  display: 'flex',
  flexDirection: 'row',
  justifyContent: 'space-between',
  borderBottom: `1px solid ${brand.borderLight}`,
  alignItems: 'center',
}))

const TopbarLeft = styled(Box)(() => ({
  display: 'flex',
  flexDirection: 'row',
  gap: '12px',
  minWidth: 0,
  flex: 1,
  alignItems: 'center',
}))

const TopbarActions = styled(Box)(() => ({
  display: 'flex',
  flexDirection: 'row',
  gap: '8px',
  alignItems: 'center',
}))

const BreadcrumbNav = styled(Box)(() => ({
  fontSize: '12px',
  fontWeight: 500,
  color: '#8b8f96',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}))

const CrumbLink = styled(Link)(() => ({
  color: '#8b8f96',
  padding: '1px 3px',
  borderRadius: '4px',
  textDecoration: 'none',
  transition: 'all 0.2s ease',
  '&:hover': {
    color: brand.primary,
    textDecoration: 'underline',
  },
}))

const CrumbSep = styled('span')(() => ({
  margin: '0 6px',
  opacity: 0.6,
}))

const TopPillBtn = styled('button', {
  shouldForwardProp: (prop) => prop !== 'isAuth',
})(({ isAuth }) => ({
  backgroundColor: 'transparent',
  border: `1.5px solid ${brand.primary}`,
  color: brand.primary,
  borderRadius: '20px',
  height: '32px',
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  padding: '0 14px',
  gap: '6px',
  fontSize: '13px',
  fontFamily: brand.fontBase,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  ...(isAuth && { marginLeft: 'auto' }),
  '&:hover': {
    transform: 'translateY(-1px)',
    backgroundColor: 'rgba(0, 112, 74, 0.08)',
  },
}))

const CartBadge = styled(Box)(() => ({
  display: 'inline-grid',
  placeItems: 'center',
  width: '20px',
  height: '20px',
  backgroundColor: brand.primary,
  color: '#ffffff',
  borderRadius: '50%',
  fontSize: '11px',
  fontWeight: 700,
  lineHeight: '20px',
}))

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
  const [isAuthed] = useState(false)
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
      const t = window.setTimeout(() => {
        setChatClosing(false)
        setChatOpen(false)
        setMicMode('idle')
        setTyping(false)
        if (pendingReplyTimeoutRef.current) {
          window.clearTimeout(pendingReplyTimeoutRef.current)
          pendingReplyTimeoutRef.current = null
        }
        setMessages([])
        setChipsVisible(true)
      }, 0)
      return () => window.clearTimeout(t)
    }
    return undefined
  }, [isChatAllowedRoute, chatOpen, chatClosing])

  useEffect(() => {
    if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight
  }, [messages, typing])

  const handleResizeStart = (event) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = chatWidth

    const handleMouseMove = (e) => {
      const delta = startX - e.clientX
      setChatWidth(Math.min(600, Math.max(280, startWidth + delta)))
    }

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  const stopPendingReply = () => {
    if (pendingReplyTimeoutRef.current) {
      window.clearTimeout(pendingReplyTimeoutRef.current)
      pendingReplyTimeoutRef.current = null
    }
    setTyping(false)
    setMicMode('listening')
  }

  const cycleMicMode = () => {
    if (typing || micMode === 'thinking') {
      stopPendingReply()
      return
    }
    setMicMode((m) => (m === 'idle' ? 'listening' : m === 'listening' ? 'thinking' : 'idle'))
  }

  const handleInputMicClick = () => {
    if (typing || micMode === 'thinking') {
      stopPendingReply()
      return
    }
    if (micMode === 'idle') setMicMode('listening')
    else if (micMode === 'listening') setMicMode('thinking')
  }

  const sendMessage = (text) => {
    const trimmed = text.trim()
    if (!trimmed) return
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    if (messages.length === 0) {
      setChipsVisible(false)
    }

    setMessages((m) => [...m, { id: Date.now(), role: 'user', text: trimmed, time: now }])
    setChatInput('')
    setMicMode('thinking')
    setTyping(true)

    if (pendingReplyTimeoutRef.current) {
      window.clearTimeout(pendingReplyTimeoutRef.current)
    }
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

  const handleChipClick = (text) => sendMessage(text)
  const handleSend = () => sendMessage(chatInput)

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
            <Box
              component="img"
              src="/stories-logo.png"
              alt="Stories"
              sx={{ maxWidth: '118px', maxHeight: '28px', objectFit: 'contain', ml: '4px' }}
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
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
            const isActive = item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to)
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
                    '&:hover': { bgcolor: 'rgba(26,74,53,.08)', color: '#1a4a35' },
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
            if (!drawerOpen) return <Tooltip key={item.to} title={item.label} placement="right">{navButton}</Tooltip>
            return navButton
          })}
        </List>
      </StyledDrawer>

      <div className="content-shell">
        <main className="main">
          <Topbar>
            <TopbarLeft>
              {!drawerOpen && (
                <>
                  <Box
                    component="img"
                    src="/stories-logo.png"
                    alt="Stories"
                    className="topbar-logo"
                    sx={{ maxWidth: '112px', maxHeight: '24px', objectFit: 'contain', width: 'auto' }}
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                    }}
                  />
                  {/* // TODO: move topbarLogoIn keyframe to styled() in Phase 3 */}
                </>
              )}
              {location.pathname !== '/' && (
                <BreadcrumbNav component="nav">
                  {crumbs.map((c, idx) => (
                    <span key={c.to + idx} className="crumb">
                      <CrumbLink to={c.to}>{c.label}</CrumbLink>
                      {idx < crumbs.length - 1 && <CrumbSep>/</CrumbSep>}
                    </span>
                  ))}
                </BreadcrumbNav>
              )}
            </TopbarLeft>
            <TopbarActions>
              {isAuthed ? (
                <TopPillBtn isAuth type="button" onClick={() => navigate(-1)}>Back</TopPillBtn>
              ) : (
                <TopPillBtn type="button" onClick={() => navigate('/login')}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                  </svg>
                  <span>Login</span>
                </TopPillBtn>
              )}
              <TopPillBtn type="button" onClick={() => navigate('/cart')}>
                <Box component="span" aria-hidden="true" sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="9" cy="21" r="1" />
                    <circle cx="20" cy="21" r="1" />
                    <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 001.95-1.57L23 6H6" />
                  </svg>
                </Box>
                <span>Cart</span>
                {cartCount > 0 && <CartBadge>{cartCount}</CartBadge>}
              </TopPillBtn>
            </TopbarActions>
          </Topbar>

          <div ref={pageRef} className="page">
            <Outlet />
          </div>
        </main>

        {isChatAllowedRoute && (chatOpen || chatClosing) && (
          <div
            className={`chat-unit${chatClosing ? ' chat-unit-closing' : ''}`}
            style={{ '--chat-panel-width': `${chatWidth}px` }}
            onAnimationEnd={handleAnimationEnd}
          >
            <div className="resize-handle" onMouseDown={handleResizeStart} />
            <div className="chat-panel-shell">
              <aside className="chat-panel">
                <div className="cp-header">
                  <div className="chat-assistant-meta">
                    <span className="chat-assistant-title">Stories Assistant</span>
                    <span className="chat-assistant-badge">NEW</span>
                  </div>
                  <button
                    className="chat-panel-close"
                    type="button"
                    aria-label="Close"
                    onClick={closeChat}
                  >
                    <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <line x1="1" y1="1" x2="13" y2="13" />
                      <line x1="13" y1="1" x2="1" y2="13" />
                    </svg>
                  </button>
                </div>

                <section className="chat-conversation" aria-label="Conversation area">
                  {hasConversation && (
                    <div ref={msgsRef} className="chat-msgs">
                      {messages.map((msg) => <Bubble key={msg.id} msg={msg} />)}
                      {typing && (
                        <div className="msg-row msg-row-bot">
                          <div className="msg-bubble msg-bubble-bot msg-typing-dots">
                            <span className="typing-dot" />
                            <span className="typing-dot" />
                            <span className="typing-dot" />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className={`chat-mic-fade ${hasConversation ? 'chat-mic-fade-visible' : ''}`} />

                  <div className={`chat-mic-zone ${hasConversation ? 'chat-mic-zone-active' : 'chat-mic-zone-fresh'}`} data-mode={micMode}>
                    <div className="voice-mic-wrapper" data-mode={micMode}>
                      <span className="voice-ring voice-ring-1" />
                      <span className="voice-ring voice-ring-2" />
                      <span className="voice-ring voice-ring-3" />
                      <svg className="voice-arc-svg" viewBox="0 0 90 90" fill="none">
                        <circle className="voice-arc-circle" cx="45" cy="45" r="40" stroke="#1a6b3c" strokeWidth="3.5" strokeLinecap="round" />
                      </svg>
                      <svg className="voice-arc-svg-2" viewBox="0 0 90 90" fill="none">
                        <circle className="voice-arc-circle" cx="45" cy="45" r="40" stroke="#1a6b3c" strokeWidth="3.5" strokeLinecap="round" />
                      </svg>
                      <button className="voice-mic-btn" type="button" aria-label="Tap to speak" onClick={cycleMicMode}>
                        <svg width="26" height="26" viewBox="0 0 100 100" fill="none" overflow="visible">
                          <path d="M65.732 77.6329C65.2176 71.801 63.7431 66.1064 61.5486 60.7204C59.4226 55.3002 56.1993 50.3945 52.7703 45.7633L47.0782 38.9022C46.0495 37.7015 45.1922 36.3979 44.2664 35.1286C43.4435 33.7907 42.5176 32.4871 41.8318 31.0463C38.78 25.4545 37.0312 18.9365 37.1684 12.3842C37.237 8.57633 37.9228 4.80274 39.0543 1.20068C37.6142 1.50943 36.174 1.88679 34.8024 2.33276C34.8024 2.40137 34.7338 2.43568 34.7338 2.50429C32.1621 7.82161 30.6533 13.6192 30.6876 19.4168C30.7562 25.2144 32.4021 30.8748 35.2824 35.8147C38.0256 40.9262 42.1747 44.8027 46.1867 49.6398C49.9243 54.4768 53.4904 59.6226 55.8907 65.4202C58.3939 71.1492 60.1084 77.2556 60.7942 83.5678C61.3085 88.6449 61.1714 93.7907 60.3827 98.8336C61.4457 98.5935 62.5087 98.3533 63.5717 98.0446C65.5948 91.4237 66.3492 84.4597 65.7662 77.6672L65.732 77.6329Z" fill="white" />
                          <path d="M54.1417 84.0482C53.9017 78.4221 52.7015 72.8647 50.747 67.5131C48.8954 62.0928 45.8778 57.1185 42.6546 52.3501C39.3284 47.7875 34.9393 43.0534 32.3676 37.393C29.5901 31.8355 28.1842 25.5576 28.4928 19.3827C28.8014 13.5508 30.6188 7.92472 33.2934 2.88184C13.9538 9.7772 0.0664062 28.2335 0.0664062 49.9487C0.0664062 77.5302 22.4235 99.8973 49.9926 99.8973C50.7813 99.8973 51.57 99.8973 52.3586 99.8287C53.7302 94.7172 54.416 89.3655 54.1417 84.0139V84.0482Z" fill="white" />
                          <path d="M99.9189 49.9485C99.9189 22.3671 77.5618 0 49.9926 0C49.1697 0 48.3467 0 47.5237 0.0686106C45.5349 4.04803 44.1976 8.33619 43.8204 12.693C43.4089 18.0446 44.4376 23.5334 46.8036 28.6106C48.9982 33.7907 52.7701 38.0103 56.3705 43.1904C59.6967 48.3362 62.7828 53.7221 64.6687 59.5883C66.6575 65.3859 67.8234 71.458 67.9606 77.5643C68.0977 84.4597 66.9662 91.3551 64.6344 97.7358C85.037 91.458 99.8846 72.4528 99.8846 49.9828L99.9189 49.9485Z" fill="white" />
                        </svg>
                      </button>
                    </div>
                    <p className="voice-state-label" data-mode={micMode}>
                      {micMode === 'listening' ? 'Listening...' : micMode === 'thinking' ? 'Thinking...' : 'tap to speak'}
                    </p>
                    <div className="voice-wave-bars">
                      <span className="voice-wave-bar" />
                      <span className="voice-wave-bar" />
                      <span className="voice-wave-bar" />
                      <span className="voice-wave-bar" />
                      <span className="voice-wave-bar" />
                    </div>
                    <div className={`chat-suggestions ${!chipsVisible ? 'chat-suggestions-hidden' : ''}`} role="list" aria-label="Suggestions">
                      <button className="chat-suggestion-chip" type="button" onClick={() => handleChipClick("What's good today?")}>
                        &quot;What&apos;s good today?&quot;
                      </button>
                      <button className="chat-suggestion-chip" type="button" onClick={() => handleChipClick('Repeat my last order')}>
                        &quot;Repeat my last order&quot;
                      </button>
                      <button className="chat-suggestion-chip" type="button" onClick={() => handleChipClick('Surprise me')}>
                        &quot;Surprise me&quot;
                      </button>
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
                      onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    />
                    {chatInput && (
                      <button className="chat-input-send" type="button" aria-label="Send" onClick={handleSend}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="22" y1="2" x2="11" y2="13" />
                          <polygon points="22 2 15 22 11 13 2 9 22 2" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <button
                    className={`chat-input-mic ${micMode === 'listening' ? 'active' : ''} ${micMode === 'thinking' ? 'active listening-stop' : ''}`}
                    type="button"
                    aria-label="Voice input"
                    onClick={handleInputMicClick}
                  >
                    {micMode === 'thinking' ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <rect x="5.5" y="5.5" width="13" height="13" rx="2.4" />
                      </svg>
                    ) : micMode === 'listening' ? (
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
            setChatClosing(false)
            setChatOpen(true)
          }}
        >
          <svg width="28" height="28" viewBox="0 0 100 100" fill="none">
            <path d="M65.732 77.6329C65.2176 71.801 63.7431 66.1064 61.5486 60.7204C59.4226 55.3002 56.1993 50.3945 52.7703 45.7633L47.0782 38.9022C46.0495 37.7015 45.1922 36.3979 44.2664 35.1286C43.4435 33.7907 42.5176 32.4871 41.8318 31.0463C38.78 25.4545 37.0312 18.9365 37.1684 12.3842C37.237 8.57633 37.9228 4.80274 39.0543 1.20068C37.6142 1.50943 36.174 1.88679 34.8024 2.33276C34.8024 2.40137 34.7338 2.43568 34.7338 2.50429C32.1621 7.82161 30.6533 13.6192 30.6876 19.4168C30.7562 25.2144 32.4021 30.8748 35.2824 35.8147C38.0256 40.9262 42.1747 44.8027 46.1867 49.6398C49.9243 54.4768 53.4904 59.6226 55.8907 65.4202C58.3939 71.1492 60.1084 77.2556 60.7942 83.5678C61.3085 88.6449 61.1714 93.7907 60.3827 98.8336C61.4457 98.5935 62.5087 98.3533 63.5717 98.0446C65.5948 91.4237 66.3492 84.4597 65.7662 77.6672L65.732 77.6329Z" fill="white" />
            <path d="M54.1417 84.0482C53.9017 78.4221 52.7015 72.8647 50.747 67.5131C48.8954 62.0928 45.8778 57.1185 42.6546 52.3501C39.3284 47.7875 34.9393 43.0534 32.3676 37.393C29.5901 31.8355 28.1842 25.5576 28.4928 19.3827C28.8014 13.5508 30.6188 7.92472 33.2934 2.88184C13.9538 9.7772 0.0664062 28.2335 0.0664062 49.9487C0.0664062 77.5302 22.4235 99.8973 49.9926 99.8973C50.7813 99.8973 51.57 99.8973 52.3586 99.8287C53.7302 94.7172 54.416 89.3655 54.1417 84.0139V84.0482Z" fill="white" />
            <path d="M99.9189 49.9485C99.9189 22.3671 77.5618 0 49.9926 0C49.1697 0 48.3467 0 47.5237 0.0686106C45.5349 4.04803 44.1976 8.33619 43.8204 12.693C43.4089 18.0446 44.4376 23.5334 46.8036 28.6106C48.9982 33.7907 52.7701 38.0103 56.3705 43.1904C59.6967 48.3362 62.7828 53.7221 64.6687 59.5883C66.6575 65.3859 67.8234 71.458 67.9606 77.5643C68.0977 84.4597 66.9662 91.3551 64.6344 97.7358C85.037 91.458 99.8846 72.4528 99.8846 49.9828L99.9189 49.9485Z" fill="white" />
          </svg>
        </button>
      )}
    </div>
  )
}

// Removed classes from main.css dependency:
// .topbar, .topbar-left, .topbar-actions, .breadcrumb, .crumb-link, .crumb-sep, .top-pill, .cart-badge
