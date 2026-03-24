import { useState, useEffect, useRef, useMemo } from 'react'
import axios from 'axios'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import VoiceInput from '../VoiceInput'
import { normalizeTranscriptForRouting, normalizeTranscriptForUi } from '../../utils/voiceTranscript'

const CHATBOT_URL = import.meta.env.VITE_CHATBOT_URL || 'http://localhost:8000'
const CHAT_STORAGE_KEY = 'chatMessages'
const CHAT_STORAGE_TS_KEY = 'chatMessagesSavedAt'
const CHAT_TTL_MS = 24 * 60 * 60 * 1000
const PARTIAL_TRANSCRIPT_DEBOUNCE_MS = 120
const CHAT_PANEL_WIDTH = 420

const MIC_MODE = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  LISTENING: 'listening',
  FINALIZING: 'finalizing',
  THINKING: 'thinking',
  NO_SPEECH: 'no-speech',
  TIMED_OUT: 'timed-out',
  ERROR: 'error',
}

function getChatSessionId() {
  let id = sessionStorage.getItem('chatSessionId')
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem('chatSessionId', id)
  }
  return id
}

function getMicLabel(mode) {
  if (mode === MIC_MODE.CONNECTING) return 'Connecting...'
  if (mode === MIC_MODE.LISTENING) return 'Listening'
  if (mode === MIC_MODE.FINALIZING) return 'Finalizing...'
  if (mode === MIC_MODE.THINKING) return 'Thinking...'
  if (mode === MIC_MODE.NO_SPEECH) return 'No speech detected'
  if (mode === MIC_MODE.TIMED_OUT) return 'Timed out'
  if (mode === MIC_MODE.ERROR) return 'Voice error'
  return 'tap to speak'
}

function getMicAriaLabel(mode) {
  if (mode === MIC_MODE.CONNECTING) return 'Connecting microphone'
  if (mode === MIC_MODE.LISTENING) return 'Listening, tap to stop'
  if (mode === MIC_MODE.FINALIZING) return 'Finalizing your speech'
  if (mode === MIC_MODE.THINKING) return 'Processing your message'
  if (mode === MIC_MODE.NO_SPEECH) return 'No speech detected, tap to try again'
  if (mode === MIC_MODE.TIMED_OUT) return 'Voice input timed out, tap to try again'
  if (mode === MIC_MODE.ERROR) return 'Voice input error, tap to try again'
  return 'Tap to speak'
}

function Bubble({ msg, prevTime, onSuggestionClick }) {
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
      {showTime && <span className="msg-time">{msg.time}</span>}
    </div>
  )
}

export default function ChatWidget({
  chatClosing,
  chatRouteClosing,
  isChatAllowedRoute,
  onCloseComplete,
  onClose,
  onVoiceSessionBusyChange,
  isOnline,
  refreshCart,
  isSuccessRoute,
}) {
  const initialMessages = useMemo(() => {
    try {
      const saved = localStorage.getItem(CHAT_STORAGE_KEY)
      if (!saved) return []
      const savedAtRaw = localStorage.getItem(CHAT_STORAGE_TS_KEY)
      const savedAt = Number(savedAtRaw)
      if (!Number.isFinite(savedAt) || Date.now() - savedAt > CHAT_TTL_MS) {
        localStorage.removeItem(CHAT_STORAGE_KEY)
        localStorage.removeItem(CHAT_STORAGE_TS_KEY)
        return []
      }
      const parsed = JSON.parse(saved)
      return Array.isArray(parsed) ? parsed : []
    } catch (e) {
      console.error('Failed to restore chat history:', e)
      localStorage.removeItem(CHAT_STORAGE_KEY)
      localStorage.removeItem(CHAT_STORAGE_TS_KEY)
      return []
    }
  }, [])

  const [messages, setMessages] = useState(initialMessages)
  const [chatInput, setChatInput] = useState('')
  const [typing, setTyping] = useState(false)
  const [chipsVisible, setChipsVisible] = useState(initialMessages.length === 0)
  const [micMode, setMicMode] = useState(MIC_MODE.IDLE)
  const [voiceActive, setVoiceActive] = useState(false)
  const [voiceSessionBusy, setVoiceSessionBusy] = useState(false)
  const [voiceError, setVoiceError] = useState('')

  const msgsRef = useRef(null)
  const pendingReplyTimeoutRef = useRef(null)
  const partialTranscriptTimeoutRef = useRef(null)
  const pendingPartialTranscriptRef = useRef('')
  const firstPartialRenderedRef = useRef(false)

  const hasConversation = messages.length > 0

  // Define before the effects that call it
  const flushPartialTranscript = (nextText = pendingPartialTranscriptRef.current) => {
    if (partialTranscriptTimeoutRef.current) {
      window.clearTimeout(partialTranscriptTimeoutRef.current)
      partialTranscriptTimeoutRef.current = null
    }
    const normalized = normalizeTranscriptForUi(nextText)
    pendingPartialTranscriptRef.current = normalized
    firstPartialRenderedRef.current = Boolean(normalized)
    setChatInput((current) => (current === normalized ? current : normalized))
  }

  const schedulePartialTranscript = (nextText) => {
    const normalized = normalizeTranscriptForUi(nextText)
    pendingPartialTranscriptRef.current = normalized

    if (!normalized) {
      flushPartialTranscript('')
      return
    }

    if (!firstPartialRenderedRef.current) {
      flushPartialTranscript(normalized)
      return
    }

    if (partialTranscriptTimeoutRef.current) {
      window.clearTimeout(partialTranscriptTimeoutRef.current)
    }

    partialTranscriptTimeoutRef.current = window.setTimeout(() => {
      partialTranscriptTimeoutRef.current = null
      setChatInput((current) => (
        current === pendingPartialTranscriptRef.current ? current : pendingPartialTranscriptRef.current
      ))
    }, PARTIAL_TRANSCRIPT_DEBOUNCE_MS)
  }

  const stopPendingReply = () => {
    if (pendingReplyTimeoutRef.current) {
      window.clearTimeout(pendingReplyTimeoutRef.current)
      pendingReplyTimeoutRef.current = null
    }
    flushPartialTranscript('')
    setTyping(false)
    setVoiceActive(false)
    setMicMode(MIC_MODE.IDLE)
  }

  useEffect(() => {
    if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight
  }, [messages, typing])

  useEffect(() => {
    if (messages.length === 0) {
      localStorage.removeItem(CHAT_STORAGE_KEY)
      localStorage.removeItem(CHAT_STORAGE_TS_KEY)
      return
    }
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages))
    localStorage.setItem(CHAT_STORAGE_TS_KEY, String(Date.now()))
  }, [messages])

  useEffect(() => () => {
    if (partialTranscriptTimeoutRef.current) {
      window.clearTimeout(partialTranscriptTimeoutRef.current)
      partialTranscriptTimeoutRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!isSuccessRoute) return
    if (pendingReplyTimeoutRef.current) {
      window.clearTimeout(pendingReplyTimeoutRef.current)
      pendingReplyTimeoutRef.current = null
    }
    setTyping(false)
    setVoiceActive(false)
    setMicMode(MIC_MODE.IDLE)
    flushPartialTranscript('')
    setChatInput('')
    setMessages([])
    setChipsVisible(true)
    localStorage.removeItem(CHAT_STORAGE_KEY)
    localStorage.removeItem(CHAT_STORAGE_TS_KEY)
  }, [isSuccessRoute])

  useEffect(() => {
    if (!isChatAllowedRoute) {
      if (pendingReplyTimeoutRef.current) {
        window.clearTimeout(pendingReplyTimeoutRef.current)
        pendingReplyTimeoutRef.current = null
      }
      setVoiceActive(false)
      setMicMode(MIC_MODE.IDLE)
      setTyping(false)
    }
  }, [isChatAllowedRoute])

  useEffect(() => {
    onVoiceSessionBusyChange?.(voiceSessionBusy)
  }, [voiceSessionBusy, onVoiceSessionBusyChange])

  useEffect(() => {
    if (!isOnline) {
      setVoiceActive(false)
      setMicMode(MIC_MODE.IDLE)
      setVoiceError("You're offline. Reconnect to use voice input.")
    }
  }, [isOnline])

  const toggleVoiceCapture = () => {
    if (!isOnline) {
      setVoiceError("You're offline. Reconnect to use voice input.")
      return
    }
    if (micMode === MIC_MODE.FINALIZING) {
      return
    }
    if (typing || micMode === MIC_MODE.THINKING) {
      stopPendingReply()
      return
    }
    if (voiceActive) {
      setVoiceActive(false)
      if (micMode === MIC_MODE.LISTENING || micMode === MIC_MODE.CONNECTING) {
        setMicMode(MIC_MODE.FINALIZING)
      }
      return
    }
    setVoiceError('')
    setVoiceActive(true)
    setMicMode(MIC_MODE.CONNECTING)
  }

  const cycleMicMode = () => toggleVoiceCapture()

  const appendMessage = (message) => {
    setChipsVisible(false)
    setMessages((m) => [...m, message])
  }

  const sendMessage = async (text) => {
    const trimmed = text.trim()
    if (!trimmed) return
    const routedText = normalizeTranscriptForRouting(trimmed) || trimmed
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    flushPartialTranscript('')
    setVoiceActive(false)
    appendMessage({ id: Date.now(), role: 'user', text: trimmed, time: now })
    setChatInput('')
    setMicMode(MIC_MODE.THINKING)
    setTyping(true)

    try {
      const cartId = localStorage.getItem('cartId') || null
      const response = await axios.post(`${CHATBOT_URL}/chat/message`, {
        session_id: getChatSessionId(),
        message: routedText,
        cart_id: cartId,
      })
      const data = response.data
      if (data.cart_id) localStorage.setItem('cartId', data.cart_id)
      if (data.cart_updated) refreshCart()
      appendMessage({
        id: Date.now() + 1,
        role: 'bot',
        text: data.reply,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        suggestions: data.suggestions || [],
      })
    } catch {
      appendMessage({
        id: Date.now() + 1,
        role: 'bot',
        text: "Sorry, I couldn't reach the assistant. Please try again.",
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      })
    } finally {
      setTyping(false)
      setMicMode(MIC_MODE.IDLE)
    }
  }

  const handleChipClick = (text) => sendMessage(text)
  const handleSend = () => sendMessage(chatInput)

  const handleCloseClick = () => {
    if (pendingReplyTimeoutRef.current) {
      window.clearTimeout(pendingReplyTimeoutRef.current)
      pendingReplyTimeoutRef.current = null
    }
    if (voiceSessionBusy) {
      setVoiceActive(false)
    }
    onClose()
  }

  const handleAnimationEnd = (e) => {
    const closingAnimations = ['chatUnitPushOut', 'chatMobileFadeOut']
    if (chatClosing && closingAnimations.includes(e.animationName)) {
      setVoiceActive(false)
      setMicMode(MIC_MODE.IDLE)
      setTyping(false)
      onCloseComplete()
    }
  }

  return (
    <>
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
              sourceName="Navbar"
              onListeningChange={(listening) => {
                if (listening) setMicMode(MIC_MODE.LISTENING)
              }}
              onProcessingChange={(processing) => {
                if (processing) setMicMode(MIC_MODE.FINALIZING)
              }}
              onSessionBusyChange={setVoiceSessionBusy}
              onVoiceStateChange={(state) => {
                if (!state) return
                setMicMode(state)
                if (
                  state === MIC_MODE.CONNECTING ||
                  state === MIC_MODE.LISTENING ||
                  state === MIC_MODE.FINALIZING ||
                  state === MIC_MODE.THINKING ||
                  state === MIC_MODE.IDLE
                ) {
                  setVoiceError('')
                }
              }}
              onPartialTranscript={(text) => {
                schedulePartialTranscript(text)
              }}
              onTranscript={(text) => {
                flushPartialTranscript(text)
                setMicMode(MIC_MODE.THINKING)
                setTimeout(() => sendMessage(text), 500)
              }}
              onError={(message) => {
                flushPartialTranscript('')
                setVoiceActive(false)
                setVoiceError(message ? `Couldn't hear that, try again. ${message}` : "Couldn't hear that, try again.")
              }}
            />
            <div className="cp-header">
              <div className="chat-assistant-meta">
                <span className="chat-assistant-title">Stories Assistant</span>
                <span className="chat-assistant-badge">NEW</span>
              </div>
              <button className="chat-panel-close" type="button" aria-label="Close" onClick={handleCloseClick}>
                <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <line x1="1" y1="1" x2="13" y2="13" />
                  <line x1="13" y1="1" x2="1" y2="13" />
                </svg>
              </button>
            </div>

            <section className="chat-conversation" aria-label="Conversation area">
              {(hasConversation || micMode === MIC_MODE.THINKING || micMode === MIC_MODE.FINALIZING) && (
                <div ref={msgsRef} className="chat-msgs" role="log" aria-live="polite" aria-relevant="additions text">
                  {messages.map((msg, i) => (
                    <Bubble
                      key={msg.id}
                      msg={msg}
                      prevTime={i > 0 ? messages[i - 1].time : null}
                      onSuggestionClick={sendMessage}
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
                    aria-label={getMicAriaLabel(micMode)}
                    onClick={cycleMicMode}
                    disabled={!isOnline || micMode === MIC_MODE.FINALIZING}
                  >
                    <svg width="26" height="26" viewBox="0 0 100 100" fill="none" overflow="visible">
                      <path d="M65.732 77.6329C65.2176 71.801 63.7431 66.1064 61.5486 60.7204C59.4226 55.3002 56.1993 50.3945 52.7703 45.7633L47.0782 38.9022C46.0495 37.7015 45.1922 36.3979 44.2664 35.1286C43.4435 33.7907 42.5176 32.4871 41.8318 31.0463C38.78 25.4545 37.0312 18.9365 37.1684 12.3842C37.237 8.57633 37.9228 4.80274 39.0543 1.20068C37.6142 1.50943 36.174 1.88679 34.8024 2.33276C34.8024 2.40137 34.7338 2.43568 34.7338 2.50429C32.1621 7.82161 30.6533 13.6192 30.6876 19.4168C30.7562 25.2144 32.4021 30.8748 35.2824 35.8147C38.0256 40.9262 42.1747 44.8027 46.1867 49.6398C49.9243 54.4768 53.4904 59.6226 55.8907 65.4202C58.3939 71.1492 60.1084 77.2556 60.7942 83.5678C61.3085 88.6449 61.1714 93.7907 60.3827 98.8336C61.4457 98.5935 62.5087 98.3533 63.5717 98.0446C65.5948 91.4237 66.3492 84.4597 65.7662 77.6672L65.732 77.6329Z" fill="white" />
                      <path d="M54.1417 84.0482C53.9017 78.4221 52.7015 72.8647 50.747 67.5131C48.8954 62.0928 45.8778 57.1185 42.6546 52.3501C39.3284 47.7875 34.9393 43.0534 32.3676 37.393C29.5901 31.8355 28.1842 25.5576 28.4928 19.3827C28.8014 13.5508 30.6188 7.92472 33.2934 2.88184C13.9538 9.7772 0.0664062 28.2335 0.0664062 49.9487C0.0664062 77.5302 22.4235 99.8973 49.9926 99.8973C50.7813 99.8973 51.57 99.8973 52.3586 99.8287C53.7302 94.7172 54.416 89.3655 54.1417 84.0139V84.0482Z" fill="white" />
                      <path d="M99.9189 49.9485C99.9189 22.3671 77.5618 0 49.9926 0C49.1697 0 48.3467 0 47.5237 0.0686106C45.5349 4.04803 44.1976 8.33619 43.8204 12.693C43.4089 18.0446 44.4376 23.5334 46.8036 28.6106C48.9982 33.7907 52.7701 38.0103 56.3705 43.1904C59.6967 48.3362 62.7828 53.7221 64.6687 59.5883C66.6575 65.3859 67.8234 71.458 67.9606 77.5643C68.0977 84.4597 66.9662 91.3551 64.6344 97.7358C85.037 91.458 99.8846 72.4528 99.8846 49.9828L99.9189 49.9485Z" fill="white" />
                    </svg>
                  </button>
                </div>
                <p className="voice-state-label" data-mode={micMode}>
                  {getMicLabel(micMode)}
                </p>
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
            </div>
          </aside>
        </div>
      </div>
      <Snackbar open={Boolean(voiceError)} autoHideDuration={3800} onClose={() => setVoiceError('')} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setVoiceError('')} severity="error" variant="filled" sx={{ width: '100%' }}>
          {voiceError}
        </Alert>
      </Snackbar>
    </>
  )
}
