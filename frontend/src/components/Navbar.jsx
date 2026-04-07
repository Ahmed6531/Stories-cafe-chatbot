import { Outlet, useLocation, useNavigate, Link } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { useCart } from '../state/useCart'
import { useSession } from '../hooks/useSession'
import { styled, keyframes, useTheme } from '@mui/material/styles'
import Box from '@mui/material/Box'
import Tooltip from '@mui/material/Tooltip'
import ChatWidget from './ChatWidget/ChatWidget'
import '../styles/index.css'

const CHAT_STORAGE_KEY = 'chatMessages'
const CHAT_STORAGE_TS_KEY = 'chatMessagesSavedAt'

const Topbar = styled('header')(({ theme }) => ({
  padding: '0 20px',
  minHeight: '52px',
  display: 'flex',
  flexDirection: 'row',
  justifyContent: 'space-between',
  borderBottom: `1px solid ${theme.brand.borderLight}`,
  alignItems: 'center',
  position: 'sticky',
  top: 0,
  zIndex: 500,
  backgroundColor: '#fff',
  gap: '12px',
}))

const TopbarLeft = styled(Box)(() => ({
  display: 'flex',
  flexDirection: 'row',
  gap: '4px',
  alignItems: 'center',
  flexShrink: 0,
}))

const TopNavLink = styled(Link, {
  shouldForwardProp: (prop) => prop !== 'isActive',
})(({ theme, isActive }) => ({
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  height: '52px',
  fontSize: '14px',
  fontWeight: 600,
  fontFamily: theme.brand.fontBase,
  color: isActive ? theme.brand.primary : '#4b5563',
  textDecoration: 'none',
  padding: '0 10px',
  borderRadius: '0',
  whiteSpace: 'nowrap',
  transition: 'color 0.2s ease',
  '&::after': {
    content: '""',
    position: 'absolute',
    left: 0,
    bottom: 0,
    width: '100%',
    height: '2px',
    backgroundColor: theme.brand.primary,
    transformOrigin: 'center',
    transform: isActive ? 'scaleX(1)' : 'scaleX(0)',
    transition: 'transform 0.25s ease',
  },
  '&:hover': {
    color: theme.brand.primary,
  },
  '&:hover::after': {
    transform: 'scaleX(1)',
  },
}))

const TopPillBtn = styled('button', {
  shouldForwardProp: (prop) => prop !== 'isAuth',
})(({ theme, isAuth }) => ({
  backgroundColor: 'transparent',
  border: `1.5px solid ${theme.brand.primary}`,
  color: theme.brand.primary,
  borderRadius: '20px',
  height: '32px',
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  padding: '0 14px',
  gap: '6px',
  fontSize: '13px',
  fontFamily: theme.brand.fontBase,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  ...(isAuth && { marginLeft: 'auto' }),
  '&:hover': {
    transform: 'translateY(-1px)',
    backgroundColor: 'rgba(0, 112, 74, 0.08)',
  },
}))

const CartBadge = styled(Box)(({ theme }) => ({
  display: 'inline-grid',
  placeItems: 'center',
  width: '20px',
  height: '20px',
  backgroundColor: theme.brand.primary,
  color: '#ffffff',
  borderRadius: '50%',
  fontSize: '11px',
  fontWeight: 700,
  lineHeight: '20px',
}))

const menuSlideIn = keyframes`
  from { transform: translateX(100%); }
  to   { transform: translateX(0); }
`
const menuSlideOut = keyframes`
  from { transform: translateX(0); }
  to   { transform: translateX(100%); }
`
const backdropFadeIn = keyframes`
  from { opacity: 0; }
  to   { opacity: 1; }
`
const backdropFadeOut = keyframes`
  from { opacity: 1; }
  to   { opacity: 0; }
`

const HamburgerBtn = styled('button')(() => ({
  display: 'none',
  '@media (max-width: 850px)': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    border: 'none',
    background: 'transparent',
    color: '#374151',
    cursor: 'pointer',
    borderRadius: '8px',
    padding: 0,
    flexShrink: 0,
    '&:hover': { background: 'rgba(0,0,0,0.05)' },
  },
}))

const MenuBackdrop = styled('div', {
  shouldForwardProp: (p) => p !== 'isClosing',
})(({ isClosing }) => ({
  position: 'fixed',
  top: '0',
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0,0,0,0.22)',
  zIndex: 400,
  animation: `${isClosing ? backdropFadeOut : backdropFadeIn} 0.38s ease forwards`,
}))

const MenuPanel = styled('nav', {
  shouldForwardProp: (p) => p !== 'isClosing',
})(({ isClosing }) => ({
  display: 'flex',
  flexDirection: 'column',
  position: 'fixed',
  top: '0',
  right: 0,
  bottom: 0,
  width: '72vw',
  maxWidth: '280px',
  background: '#fff',
  zIndex: 401,
  boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
  animation: `${isClosing ? menuSlideOut : menuSlideIn} 0.38s cubic-bezier(0.4,0,0.2,1) forwards`,
  overflowY: 'auto',
  paddingTop: '50px',
}))

const MenuPanelItem = styled('button', {
  shouldForwardProp: (prop) => prop !== 'isActive',
})(({ theme, isActive }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: '14px',
  width: '100%',
  padding: '14px 20px',
  border: 'none',
  borderLeft: isActive ? `3px solid ${theme.brand.primary}` : '3px solid transparent',
  background: isActive ? 'rgba(0, 112, 74, 0.06)' : 'transparent',
  color: isActive ? theme.brand.primary : '#374151',
  fontFamily: theme.brand.fontBase,
  fontSize: '15px',
  fontWeight: 600,
  cursor: 'pointer',
  textAlign: 'left',
  transition: 'background 0.15s, color 0.15s',
  '&:hover': { background: 'rgba(0, 112, 74, 0.06)', color: theme.brand.primary },
}))

const TopbarNavWrap = styled(Box)(() => ({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  '@media (max-width: 850px)': { display: 'none' },
}))

const TopbarActionsWrap = styled(Box)(() => ({
  display: 'flex',
  flexDirection: 'row',
  gap: '8px',
  alignItems: 'center',
  '@media (max-width: 850px)': { display: 'none' },
}))

export default function Navbar() {
  const theme = useTheme()
  const { brand } = theme
  const { user, loading: sessionLoading, logout } = useSession()

  const [menuOpen, setMenuOpen] = useState(false)
  const [menuClosing, setMenuClosing] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatClosing, setChatClosing] = useState(false)
  const [chatRouteClosing, setChatRouteClosing] = useState(false)
  const [voiceSessionBusy, setVoiceSessionBusy] = useState(false)
  const [deferredChatClose, setDeferredChatClose] = useState(null)
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)

  const pageRef = useRef(null)
  const pendingCheckoutRef = useRef(false)

  const { cartCount, refreshCart, resetCart } = useCart()
  const location = useLocation()
  const navigate = useNavigate()

  const isAuthed = !sessionLoading && !!user
  const showGuestActions = !sessionLoading && !user
  const isChatAllowedRoute =
    location.pathname === '/' ||
    location.pathname.startsWith('/menu') ||
    location.pathname === '/cart' ||
    location.pathname.startsWith('/item/')
  const isSuccessRoute = location.pathname === '/success'

  useEffect(() => {
    pageRef.current?.scrollTo({ top: 0, behavior: 'auto' })
  }, [location.pathname, location.search])

  const handleLogout = async () => {
    await logout()
    localStorage.removeItem('cartId')
    localStorage.removeItem('chatSessionId')
    localStorage.removeItem(CHAT_STORAGE_KEY)
    localStorage.removeItem(CHAT_STORAGE_TS_KEY)
    resetCart()
    if (location.pathname.startsWith('/dashboard')) {
      navigate('/')
    }
  }

  const closeMenu = () => {
    if (menuClosing) return
    setMenuClosing(true)
    setTimeout(() => {
      setMenuClosing(false)
      setMenuOpen(false)
    }, 380)
  }

  const closeChat = () => {
    if (voiceSessionBusy) {
      setDeferredChatClose('panel')
      return
    }
    setDeferredChatClose(null)
    setChatRouteClosing(false)
    setChatClosing(true)
  }

  const handleCloseComplete = () => {
    setChatClosing(false)
    setChatOpen(false)
    setChatRouteClosing(false)
    setDeferredChatClose(null)
    if (pendingCheckoutRef.current) {
      pendingCheckoutRef.current = false
      navigate('/checkout')
    }
  }

  useEffect(() => {
    if (!isChatAllowedRoute && chatOpen && !chatClosing && !chatRouteClosing) {
      const timeoutId = window.setTimeout(() => {
        if (voiceSessionBusy) {
          setDeferredChatClose('route')
          return
        }
        setChatRouteClosing(true)
        setChatClosing(true)
      }, 0)
      return () => window.clearTimeout(timeoutId)
    }
    return undefined
  }, [isChatAllowedRoute, chatOpen, chatClosing, chatRouteClosing, voiceSessionBusy])

  useEffect(() => {
    if (!deferredChatClose || voiceSessionBusy || chatClosing) return
    const timeoutId = window.setTimeout(() => {
      setChatRouteClosing(deferredChatClose === 'route')
      setChatClosing(true)
      setDeferredChatClose(null)
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [deferredChatClose, voiceSessionBusy, chatClosing])

  useEffect(() => {
    const setOnline = () => setIsOnline(true)
    const setOffline = () => setIsOnline(false)
    window.addEventListener('online', setOnline)
    window.addEventListener('offline', setOffline)
    return () => {
      window.removeEventListener('online', setOnline)
      window.removeEventListener('offline', setOffline)
    }
  }, [])

  const openChat = () => {
    if (!isOnline) return
    if (menuClosing) {
      setMenuClosing(false)
    }
    if (menuOpen) {
      setMenuOpen(false)
    }
    setChatRouteClosing(false)
    setChatClosing(false)
    setChatOpen(true)
  }

  return (
    <div className="app-shell">
      <div className="content-shell">
        <main className="main">
          {!isSuccessRoute && (
            <Topbar>
              <TopbarLeft>
                <Box
                  component="img"
                  src="/stories-logo.png"
                  alt="Stories"
                  sx={{ maxWidth: '112px', maxHeight: '26px', objectFit: 'contain', flexShrink: 0 }}
                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                />
                <TopbarNavWrap>
                  <Box sx={{ width: '1px', height: '18px', bgcolor: '#e9e9e9', mx: '6px', flexShrink: 0 }} />
                  <TopNavLink to="/" isActive={location.pathname === '/'}>Home</TopNavLink>
                  <TopNavLink to="/menu" isActive={location.pathname.startsWith('/menu')}>Menu</TopNavLink>
                  {isAuthed && (
                    <TopNavLink to="/dashboard" isActive={location.pathname === '/dashboard'}>
                      My Orders
                    </TopNavLink>
                  )}
                </TopbarNavWrap>
              </TopbarLeft>

              <TopbarActionsWrap>
                {isAuthed ? (
                  <TopPillBtn isAuth type="button" onClick={handleLogout}>Logout</TopPillBtn>
                ) : showGuestActions ? (
                  <TopPillBtn type="button" onClick={() => navigate('/login')}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="8" r="4" />
                      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                    </svg>
                    <span>Login</span>
                  </TopPillBtn>
                ) : null}

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
              </TopbarActionsWrap>

              <HamburgerBtn
                type="button"
                aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                onClick={() => {
                  if (menuClosing) return
                  if (menuOpen) closeMenu()
                  else setMenuOpen(true)
                }}
              >
                {menuOpen ? (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="3" y1="3" x2="21" y2="21" />
                    <line x1="21" y1="3" x2="3" y2="21" />
                  </svg>
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="18" x2="21" y2="18" />
                  </svg>
                )}
              </HamburgerBtn>
            </Topbar>
          )}

          <div ref={pageRef} className="page">
            <div className={isSuccessRoute ? undefined : 'page-content'}>
              <Outlet />
            </div>
          </div>
        </main>

        {(chatClosing || (isChatAllowedRoute && chatOpen) || chatRouteClosing) && (
          <ChatWidget
            chatClosing={chatClosing}
            chatRouteClosing={chatRouteClosing}
            isChatAllowedRoute={isChatAllowedRoute}
            onCloseComplete={handleCloseComplete}
            onClose={closeChat}
            onVoiceSessionBusyChange={setVoiceSessionBusy}
            isOnline={isOnline}
            refreshCart={refreshCart}
            isSuccessRoute={isSuccessRoute}
          />
        )}
      </div>

      {(menuOpen || menuClosing) && !isSuccessRoute && (
        <>
          <MenuBackdrop isClosing={menuClosing} onClick={closeMenu} />
          <MenuPanel isClosing={menuClosing} aria-label="Mobile navigation">
            <MenuPanelItem type="button" isActive={location.pathname === '/'} onClick={() => { closeMenu(); navigate('/') }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              Home
            </MenuPanelItem>

            <MenuPanelItem type="button" isActive={location.pathname.startsWith('/menu')} onClick={() => { closeMenu(); navigate('/menu') }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" /><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
              </svg>
              Menu
            </MenuPanelItem>

            <MenuPanelItem type="button" isActive={location.pathname.startsWith('/cart')} onClick={() => { closeMenu(); navigate('/cart') }}>
              <Box sx={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
                  <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 001.95-1.57L23 6H6" />
                </svg>
                {cartCount > 0 && (
                  <Box sx={{ position: 'absolute', top: -5, right: -7, width: 15, height: 15, bgcolor: brand.primary, color: '#fff', borderRadius: '50%', fontSize: '9px', fontWeight: 700, display: 'grid', placeItems: 'center' }}>
                    {cartCount}
                  </Box>
                )}
              </Box>
              Cart
            </MenuPanelItem>

            {isAuthed && (
              <MenuPanelItem
                type="button"
                isActive={location.pathname === '/dashboard'}
                onClick={() => { closeMenu(); navigate('/dashboard') }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
                  <rect x="9" y="3" width="6" height="4" rx="1" />
                  <path d="M9 12h6M9 16h4" />
                </svg>
                My Orders
              </MenuPanelItem>
            )}

            {isAuthed ? (
              <MenuPanelItem type="button" onClick={() => { closeMenu(); void handleLogout() }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Logout
              </MenuPanelItem>
            ) : showGuestActions ? (
              <MenuPanelItem type="button" isActive={location.pathname.startsWith('/login')} onClick={() => { closeMenu(); navigate('/login') }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                </svg>
                Login
              </MenuPanelItem>
            ) : null}
          </MenuPanel>
        </>
      )}

      {isChatAllowedRoute && !chatOpen && !menuOpen && !menuClosing && (
        <Tooltip title={!isOnline ? 'Voice input unavailable while offline' : ''}>
          <span>
            <button
              className="voice-fab"
              type="button"
              aria-label="Open chat"
              disabled={!isOnline}
              onClick={openChat}
            >
              <svg width="28" height="28" viewBox="0 0 100 100" fill="none">
                <path d="M65.732 77.6329C65.2176 71.801 63.7431 66.1064 61.5486 60.7204C59.4226 55.3002 56.1993 50.3945 52.7703 45.7633L47.0782 38.9022C46.0495 37.7015 45.1922 36.3979 44.2664 35.1286C43.4435 33.7907 42.5176 32.4871 41.8318 31.0463C38.78 25.4545 37.0312 18.9365 37.1684 12.3842C37.237 8.57633 37.9228 4.80274 39.0543 1.20068C37.6142 1.50943 36.174 1.88679 34.8024 2.33276C34.8024 2.40137 34.7338 2.43568 34.7338 2.50429C32.1621 7.82161 30.6533 13.6192 30.6876 19.4168C30.7562 25.2144 32.4021 30.8748 35.2824 35.8147C38.0256 40.9262 42.1747 44.8027 46.1867 49.6398C49.9243 54.4768 53.4904 59.6226 55.8907 65.4202C58.3939 71.1492 60.1084 77.2556 60.7942 83.5678C61.3085 88.6449 61.1714 93.7907 60.3827 98.8336C61.4457 98.5935 62.5087 98.3533 63.5717 98.0446C65.5948 91.4237 66.3492 84.4597 65.7662 77.6672L65.732 77.6329Z" fill="white" />
                <path d="M54.1417 84.0482C53.9017 78.4221 52.7015 72.8647 50.747 67.5131C48.8954 62.0928 45.8778 57.1185 42.6546 52.3501C39.3284 47.7875 34.9393 43.0534 32.3676 37.393C29.5901 31.8355 28.1842 25.5576 28.4928 19.3827C28.8014 13.5508 30.6188 7.92472 33.2934 2.88184C13.9538 9.7772 0.0664062 28.2335 0.0664062 49.9487C0.0664062 77.5302 22.4235 99.8973 49.9926 99.8973C50.7813 99.8973 51.57 99.8973 52.3586 99.8287C53.7302 94.7172 54.416 89.3655 54.1417 84.0139V84.0482Z" fill="white" />
                <path d="M99.9189 49.9485C99.9189 22.3671 77.5618 0 49.9926 0C49.1697 0 48.3467 0 47.5237 0.0686106C45.5349 4.04803 44.1976 8.33619 43.8204 12.693C43.4089 18.0446 44.4376 23.5334 46.8036 28.6106C48.9982 33.7907 52.7701 38.0103 56.3705 43.1904C59.6967 48.3362 62.7828 53.7221 64.6687 59.5883C66.6575 65.3859 67.8234 71.458 67.9606 77.5643C68.0977 84.4597 66.9662 91.3551 64.6344 97.7358C85.037 91.458 99.8846 72.4528 99.8846 49.9828L99.9189 49.9485Z" fill="white" />
              </svg>
            </button>
          </span>
        </Tooltip>
      )}
    </div>
  )
}
