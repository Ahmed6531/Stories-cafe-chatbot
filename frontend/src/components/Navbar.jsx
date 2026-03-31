import { Outlet, useLocation, useNavigate, Link } from 'react-router-dom'
import { useState, useEffect, useRef, useMemo } from 'react'
import { useCart } from '../state/useCart'
import { useSession } from '../hooks/useSession'
import { styled, keyframes, useTheme } from '@mui/material/styles'
import axios from 'axios'
import { isDeadCart } from '../API/http'
import Box from '@mui/material/Box'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import Tooltip from '@mui/material/Tooltip'
import VoiceInput from './VoiceInput'
import '../styles/index.css'

const CHATBOT_URL = import.meta.env.VITE_CHATBOT_URL || 'http://localhost:8000'

function getChatSessionId() {
  let id = localStorage.getItem('chatSessionId')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('chatSessionId', id)
  }
  return id
}

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

// Hamburger button — visible only on mobile
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

// Faint shadow backdrop — sits below the topbar
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

// Slide-in panel from the right — starts below the topbar
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

// Hide topbar nav links on mobile
const TopbarNavWrap = styled(Box)(() => ({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  '@media (max-width: 850px)': { display: 'none' },
}))

// Hide topbar pill buttons on mobile — hamburger handles them
const TopbarActionsWrap = styled(Box)(() => ({
  display: 'flex',
  flexDirection: 'row',
  gap: '8px',
  alignItems: 'center',
  '@media (max-width: 850px)': { display: 'none' },
}))

const CHAT_PANEL_WIDTH = 420
const CHAT_STORAGE_KEY = 'chatMessages'
const CHAT_STORAGE_TS_KEY = 'chatMessagesSavedAt'
const CHAT_TTL_MS = 24 * 60 * 60 * 1000

const formatLL = (amount) => 'LBP ' + Number(amount).toLocaleString('en-US')

function BillSummaryCard({ bill, stale = false, onConfirm }) {
  return (
    <div style={{
      width: '100%',
      maxWidth: '310px',
      background: '#fff',
      border: '0.5px solid #e5e7eb',
      borderRadius: '12px',
      overflow: 'hidden',
      marginTop: '8px',
    }}>
      <div style={{
        padding: '10px 14px 8px',
        borderBottom: '0.5px solid #e5e7eb',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}>
        <div style={{
          width: 28, height: 28,
          background: '#e1f5ee',
          borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="#0f6e56" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 11 12 14 22 4"/>
            <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>Your order</div>
          <div style={{ fontSize: 11.5, color: '#6b7280', marginTop: 1 }}>
            {bill.item_count} {bill.item_count === 1 ? 'item' : 'items'}
          </div>
        </div>
      </div>

      <div style={{ padding: '10px 14px' }}>
        {bill.items.map((item, i) => (
          <div key={i} style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            padding: '5px 0',
            fontSize: 13,
            borderBottom: i < bill.items.length - 1 ? '0.5px solid #e5e7eb' : 'none',
          }}>
            <span style={{ color: '#111' }}>
              {item.item_name}
              <span style={{ fontSize: 11.5, color: '#9ca3af', marginLeft: 4 }}>×{item.quantity}</span>
            </span>
            <span style={{ color: '#111', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
              {formatLL(item.line_total)}
            </span>
          </div>
        ))}
      </div>

      <div style={{
        padding: '8px 14px 12px',
        borderTop: '0.5px solid #e5e7eb',
        background: '#f9fafb',
      }}>
        {[
          ['Subtotal', formatLL(bill.subtotal)],
          [`Tax (${Math.round(bill.tax_rate * 100)}%)`, formatLL(bill.tax_amount)],
        ].map(([label, value]) => (
          <div key={label} style={{
            display: 'flex', justifyContent: 'space-between',
            fontSize: 12.5, color: '#6b7280', padding: '3px 0',
          }}>
            <span>{label}</span><span>{value}</span>
          </div>
        ))}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          fontSize: 14, fontWeight: 500, color: '#111',
          paddingTop: 7, marginTop: 4,
          borderTop: '0.5px solid #e5e7eb',
        }}>
          <span>Total</span>
          <span>{formatLL(bill.total)}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={stale ? undefined : onConfirm}
        disabled={stale}
        style={{
          display: 'block',
          width: 'calc(100% - 28px)',
          margin: '0 14px 12px',
          padding: '9px 0',
          background: stale ? '#9ca3af' : '#00704a',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 500,
          cursor: stale ? 'not-allowed' : 'pointer',
          transition: 'background 0.2s',
        }}
      >
        {stale ? 'Looks like something changed' : 'Go to checkout'}
      </button>
    </div>
  )
}

function Bubble({ msg, prevTime, onSuggestionClick, onConfirm }) {
  const isUser = msg.role === 'user'
  const showTime = msg.time !== prevTime
  const hasSuggestions = msg.suggestions && msg.suggestions.length > 0

  return (
    <div className={`msg-row ${isUser ? 'msg-row-user' : 'msg-row-bot'}`}>
      <div className={`msg-bubble ${isUser ? 'msg-bubble-user' : 'msg-bubble-bot'}`}>
        {msg.text.split('\n').map((line, i, arr) => (
          <span key={i}>
            {line}
            {i < arr.length - 1 && <br />}
          </span>
        ))}
        {hasSuggestions && (
          <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {msg.suggestions.map((s, idx) => (
              <button
                key={idx}
                onClick={() => onSuggestionClick(`add ${s.item_name}`)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '16px',
                  border: '1px solid #e5e7eb',
                  background: '#f3f4f6',
                  color: '#374151',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 500,
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = '#e5e7eb'
                  e.target.style.borderColor = '#d1d5db'
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = '#f3f4f6'
                  e.target.style.borderColor = '#e5e7eb'
                }}
              >
                {s.item_name}
              </button>
            ))}
          </div>
        )}
      </div>
      {msg.bill && <BillSummaryCard bill={msg.bill} stale={msg.billStale ?? false} onConfirm={onConfirm} />}
      {showTime && <span className="msg-time">{msg.time}</span>}
    </div>
  )
}

export default function Navbar() {
  const theme = useTheme()
  const { brand } = theme
  const initialMessages = useMemo(() => {
    try {
      const saved = localStorage.getItem(CHAT_STORAGE_KEY)
      if (!saved) return []
      const savedAtRaw = localStorage.getItem(CHAT_STORAGE_TS_KEY)
      const savedAt = Number(savedAtRaw)
      if (!Number.isFinite(savedAt) || Date.now() - savedAt > CHAT_TTL_MS) {
        localStorage.removeItem(CHAT_STORAGE_KEY)
        localStorage.removeItem(CHAT_STORAGE_TS_KEY)
        localStorage.removeItem('chatSessionId')
        return []
      }
      const parsed = JSON.parse(saved)
      return Array.isArray(parsed) ? parsed : []
    } catch (e) {
      console.error('Failed to restore chat history:', e)
      localStorage.removeItem(CHAT_STORAGE_KEY)
      localStorage.removeItem(CHAT_STORAGE_TS_KEY)
      localStorage.removeItem('chatSessionId')
      return []
    }
  }, [])

  const { user, logout } = useSession()
  const isAuthed = !!user
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuClosing, setMenuClosing] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatClosing, setChatClosing] = useState(false)
  const [chatRouteClosing, setChatRouteClosing] = useState(false)
  const [voiceActive, setVoiceActive] = useState(false)
  const [micMode, setMicMode] = useState('idle')
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [voiceError, setVoiceError] = useState('')

  const [chatInput, setChatInput] = useState('')
  const [messages, setMessages] = useState(initialMessages)
  const [typing, setTyping] = useState(false)
  const [chipsVisible, setChipsVisible] = useState(initialMessages.length === 0)

  const pageRef = useRef(null)
  const msgsRef = useRef(null)
  const pendingReplyTimeoutRef = useRef(null)
  const pendingCheckoutRef = useRef(false)

  const { cartCount, refreshCart, resetCart, state: cartState } = useCart()
  const items = useMemo(() => cartState?.items ?? [], [cartState?.items])
  const location = useLocation()
  const navigate = useNavigate()
  const hasConversation = messages.length > 0

  const isChatAllowedRoute =
    location.pathname === '/' ||
    location.pathname.startsWith('/menu') ||
    location.pathname === '/cart' ||
    location.pathname.startsWith('/item/')

  const isSuccessRoute = location.pathname === '/success'

  useEffect(() => {
    pageRef.current?.scrollTo({ top: 0, behavior: 'auto' })
  }, [location.pathname, location.search])

  useEffect(() => {
    setMessages((prev) => {
      if (!prev.some((m) => m.bill && !m.billStale)) return prev
      return prev.map((m) => {
        if (!m.bill || m.billStale) return m
        const billSig = m.bill.items
          .map((i) => `${i.item_name}:${i.quantity}`)
          .sort()
          .join(',')
        const cartSig = items
          .map((i) => `${i.name}:${i.qty}`)
          .sort()
          .join(',')
        return billSig === cartSig ? m : { ...m, billStale: true }
      })
    })
  }, [items])

  const handleLogout = async () => {
    await logout()
    localStorage.removeItem('cartId')
    localStorage.removeItem('chatSessionId')
    localStorage.removeItem(CHAT_STORAGE_KEY)
    localStorage.removeItem(CHAT_STORAGE_TS_KEY)
    resetCart()
    setMessages([])
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
    if (pendingReplyTimeoutRef.current) {
      window.clearTimeout(pendingReplyTimeoutRef.current)
      pendingReplyTimeoutRef.current = null
    }
    setChatRouteClosing(false)
    setChatClosing(true)
  }

  const handleAnimationEnd = (e) => {
    const closingAnimations = ['chatUnitPushOut', 'chatMobileFadeOut']
    if (chatClosing && closingAnimations.includes(e.animationName)) {
      setChatClosing(false)
      setChatOpen(false)
      setChatRouteClosing(false)
      setVoiceActive(false)
      setMicMode('idle')
      setTyping(false)
      if (pendingCheckoutRef.current) {
        pendingCheckoutRef.current = false
        navigate('/checkout')
      }
    }
  }

  useEffect(() => {
    if (!isChatAllowedRoute && chatOpen && !chatClosing && !chatRouteClosing) {
      if (pendingReplyTimeoutRef.current) {
        window.clearTimeout(pendingReplyTimeoutRef.current)
        pendingReplyTimeoutRef.current = null
      }
      setVoiceActive(false)
      setMicMode('idle')
      setTyping(false)
      setChatRouteClosing(true)
      setChatClosing(true)
    }
    return undefined
  }, [isChatAllowedRoute, chatOpen, chatClosing, chatRouteClosing])

  useEffect(() => {
    if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight
  }, [messages, typing])

  useEffect(() => {
    const setOnline = () => setIsOnline(true)
    const setOffline = () => {
      setIsOnline(false)
      setVoiceActive(false)
      setMicMode('idle')
      setVoiceError("You're offline. Reconnect to use voice input.")
    }
    window.addEventListener('online', setOnline)
    window.addEventListener('offline', setOffline)
    return () => {
      window.removeEventListener('online', setOnline)
      window.removeEventListener('offline', setOffline)
    }
  }, [])

  useEffect(() => {
    if (messages.length === 0) {
      localStorage.removeItem(CHAT_STORAGE_KEY)
      localStorage.removeItem(CHAT_STORAGE_TS_KEY)
      return
    }
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages))
    localStorage.setItem(CHAT_STORAGE_TS_KEY, String(Date.now()))
  }, [messages])

  const stopPendingReply = () => {
    if (pendingReplyTimeoutRef.current) {
      window.clearTimeout(pendingReplyTimeoutRef.current)
      pendingReplyTimeoutRef.current = null
    }
    setTyping(false)
    setVoiceActive(false)
    setMicMode('idle')
  }

  useEffect(() => {
    if (!isSuccessRoute) return
    if (pendingReplyTimeoutRef.current) {
      window.clearTimeout(pendingReplyTimeoutRef.current)
      pendingReplyTimeoutRef.current = null
    }
    setTyping(false)
    setVoiceActive(false)
    setMicMode('idle')
    setChatInput('')
    setMessages([])
    setChipsVisible(true)
    localStorage.removeItem(CHAT_STORAGE_KEY)
    localStorage.removeItem(CHAT_STORAGE_TS_KEY)
    localStorage.removeItem('chatSessionId')
  }, [isSuccessRoute])

  const toggleVoiceCapture = () => {
    if (!isOnline) {
      setVoiceError("You're offline. Reconnect to use voice input.")
      return
    }
    if (typing || micMode === 'thinking') {
      stopPendingReply()
      return
    }
    if (voiceActive) {
      setVoiceActive(false)
      setMicMode('idle')
      return
    }
    setVoiceActive(true)
    setMicMode('listening')
  }

  const cycleMicMode = () => toggleVoiceCapture()

  const appendMessage = (message) => {
    setChipsVisible(false)
    setMessages((m) => [...m, message])
  }

  const sendMessage = async (text) => {
    const trimmed = text.trim()
    if (!trimmed) return

    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const session_id = getChatSessionId()
    const cart_id = localStorage.getItem('cartId') || null

    setVoiceActive(false)
    appendMessage({ id: Date.now(), role: 'user', text: trimmed, time: now })
    setChatInput('')
    setMicMode('thinking')
    setTyping(true)

    try {
      console.log("[CHAT REQUEST]", {
        session_id,
        cart_id,
        message: trimmed,
        timestamp: Date.now(),
      })

      const response = await axios.post(`${CHATBOT_URL}/chat/message`, {
        session_id,
        message: trimmed,
        cart_id,
      })
      const data = response.data

      console.log("[CHAT RESPONSE]", {
        status: response.status,
        session_id: data.session_id,
        cart_updated: data.cart_updated,
        returned_cart_id: data.cart_id,
        intent: data.intent,
        suggestions: data.suggestions?.length,
      })

      if (cart_id !== data.cart_id) {
        console.warn("[CHAT CART SYNC]", { previous: cart_id, new: data.cart_id })
      }

      if (data.cart_id && !isDeadCart(data.cart_id)) {
        localStorage.setItem('cartId', data.cart_id)
      } else if (data.cart_updated && !data.cart_id) {
        localStorage.removeItem('cartId')
      }
      if (data.cart_updated) refreshCart()
      appendMessage({
        id: Date.now() + 1,
        role: 'bot',
        text: data.reply,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        suggestions: data.suggestions || [],
        bill: data.metadata?.bill || null,
        intent: data.intent || null,
      })
      if (data.intent === 'confirm_checkout' && data.metadata?.pipeline_stage === 'checkout_redirect') {
        setTimeout(() => {
          pendingCheckoutRef.current = true
          closeChat()
        }, 1500)
      }
    } catch {
      appendMessage({
        id: Date.now() + 1,
        role: 'bot',
        text: "Sorry, I couldn't reach the assistant. Please try again.",
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      })
    } finally {
      setTyping(false)
      setMicMode('idle')
    }
  }

  const handleChipClick = (text) => sendMessage(text)
  const handleConfirmCheckout = () => {
    if (cartCount === 0) {
      appendMessage({
        id: Date.now(),
        role: 'bot',
        text: "Oops! Your cart is empty now! Add some items and we'll get you checked out.",
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      })
      return
    }
    pendingCheckoutRef.current = true
    closeChat()
  }
  const handleSend = () => sendMessage(chatInput)
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

        {(chatOpen || chatClosing || chatRouteClosing) && (
          <div
            className={`chat-unit${chatClosing ? ' chat-unit-closing' : ''}`}
            style={
              chatRouteClosing
                ? {
                    '--chat-panel-width': `${CHAT_PANEL_WIDTH}px`,
                    position: 'fixed',
                    top: 0,
                    right: 0,
                    height: '100vh',
                    zIndex: 700,
                  }
                : {
                    '--chat-panel-width': `${CHAT_PANEL_WIDTH}px`,
                  }
            }
            onAnimationEnd={handleAnimationEnd}
          >
            <div className="resize-handle" aria-hidden="true" />
            <div className="chat-panel-shell">
              <aside className="chat-panel">
                <VoiceInput
                  active={voiceActive}
                  onListeningChange={(listening) => {
                    if (listening) setMicMode('listening')
                  }}
                  onProcessingChange={(processing) => {
                    setVoiceActive(false)
                    if (processing) setMicMode('thinking')
                  }}
                  onTranscript={(text) => {
                    sendMessage(text)
                  }}
                  onError={(message) => {
                    setVoiceActive(false)
                    setMicMode('idle')
                    setVoiceError(message ? `Couldn't hear that, try again. ${message}` : "Couldn't hear that, try again.")
                  }}
                />
                <div className="cp-header">
                  <div className="chat-assistant-meta">
                    <span className="chat-assistant-title">Stories Assistant</span>
                    <span className="chat-assistant-badge">NEW</span>
                  </div>
                  <button className="chat-panel-close" type="button" aria-label="Close" onClick={closeChat}>
                    <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <line x1="1" y1="1" x2="13" y2="13" />
                      <line x1="13" y1="1" x2="1" y2="13" />
                    </svg>
                  </button>
                </div>

                <section className="chat-conversation" aria-label="Conversation area">
                  {(hasConversation || micMode === 'thinking') && (
                    <div ref={msgsRef} className="chat-msgs" role="log" aria-live="polite" aria-relevant="additions text">
                      {messages.map((msg, i) => (
                        <Bubble
                          key={msg.id}
                          msg={msg}
                          prevTime={i > 0 ? messages[i - 1].time : null}
                          onSuggestionClick={sendMessage}
                          onConfirm={handleConfirmCheckout}
                        />
                      ))}
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
                      <button
                        className="voice-mic-btn"
                        type="button"
                        aria-label={micMode === 'listening' ? 'Listening, tap to stop' : micMode === 'thinking' ? 'Processing your message' : 'Tap to speak'}
                        onClick={cycleMicMode}
                        disabled={!isOnline}
                      >
                        <svg width="26" height="26" viewBox="0 0 100 100" fill="none" overflow="visible">
                          <path d="M65.732 77.6329C65.2176 71.801 63.7431 66.1064 61.5486 60.7204C59.4226 55.3002 56.1993 50.3945 52.7703 45.7633L47.0782 38.9022C46.0495 37.7015 45.1922 36.3979 44.2664 35.1286C43.4435 33.7907 42.5176 32.4871 41.8318 31.0463C38.78 25.4545 37.0312 18.9365 37.1684 12.3842C37.237 8.57633 37.9228 4.80274 39.0543 1.20068C37.6142 1.50943 36.174 1.88679 34.8024 2.33276C34.8024 2.40137 34.7338 2.43568 34.7338 2.50429C32.1621 7.82161 30.6533 13.6192 30.6876 19.4168C30.7562 25.2144 32.4021 30.8748 35.2824 35.8147C38.0256 40.9262 42.1747 44.8027 46.1867 49.6398C49.9243 54.4768 53.4904 59.6226 55.8907 65.4202C58.3939 71.1492 60.1084 77.2556 60.7942 83.5678C61.3085 88.6449 61.1714 93.7907 60.3827 98.8336C61.4457 98.5935 62.5087 98.3533 63.5717 98.0446C65.5948 91.4237 66.3492 84.4597 65.7662 77.6672L65.732 77.6329Z" fill="white" />
                          <path d="M54.1417 84.0482C53.9017 78.4221 52.7015 72.8647 50.747 67.5131C48.8954 62.0928 45.8778 57.1185 42.6546 52.3501C39.3284 47.7875 34.9393 43.0534 32.3676 37.393C29.5901 31.8355 28.1842 25.5576 28.4928 19.3827C28.8014 13.5508 30.6188 7.92472 33.2934 2.88184C13.9538 9.7772 0.0664062 28.2335 0.0664062 49.9487C0.0664062 77.5302 22.4235 99.8973 49.9926 99.8973C50.7813 99.8973 51.57 99.8973 52.3586 99.8287C53.7302 94.7172 54.416 89.3655 54.1417 84.0139V84.0482Z" fill="white" />
                          <path d="M99.9189 49.9485C99.9189 22.3671 77.5618 0 49.9926 0C49.1697 0 48.3467 0 47.5237 0.0686106C45.5349 4.04803 44.1976 8.33619 43.8204 12.693C43.4089 18.0446 44.4376 23.5334 46.8036 28.6106C48.9982 33.7907 52.7701 38.0103 56.3705 43.1904C59.6967 48.3362 62.7828 53.7221 64.6687 59.5883C66.6575 65.3859 67.8234 71.458 67.9606 77.5643C68.0977 84.4597 66.9662 91.3551 64.6344 97.7358C85.037 91.458 99.8846 72.4528 99.8846 49.9828L99.9189 49.9485Z" fill="white" />
                        </svg>
                      </button>
                    </div>
                    <p className="voice-state-label" data-mode={micMode}>
                      {micMode === 'listening' ? 'Listening' : micMode === 'thinking' ? 'Thinking...' : 'tap to speak'}
                    </p>
                    <div className={`chat-suggestions ${!chipsVisible ? 'chat-suggestions-hidden' : ''}`} role="list" aria-label="Suggestions">
                      <button className="chat-suggestion-chip" type="button" onClick={() => handleChipClick("What's good today?")}>
                        &quot;What&apos;s good today?&quot;
                      </button>
                      <button className="chat-suggestion-chip" type="button" onClick={() => handleChipClick("What's in my cart?")}>
                        &quot;What&apos;s in my cart?&quot;
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
                </div>
              </aside>
            </div>
          </div>
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
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
                  <rect x="9" y="3" width="6" height="4" rx="1" />
                  <path d="M9 12h6M9 16h4" />
                </svg>
                My Orders
              </MenuPanelItem>
            )}

            {isAuthed ? (
              <MenuPanelItem type="button" onClick={() => { closeMenu(); handleLogout() }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Logout
              </MenuPanelItem>
            ) : (
              <MenuPanelItem type="button" isActive={location.pathname.startsWith('/login')} onClick={() => { closeMenu(); navigate('/login') }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                </svg>
                Login
              </MenuPanelItem>
            )}
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
      <Snackbar open={Boolean(voiceError)} autoHideDuration={3800} onClose={() => setVoiceError('')} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setVoiceError('')} severity="error" variant="filled" sx={{ width: '100%' }}>
          {voiceError}
        </Alert>
      </Snackbar>
    </div>
  )
}
