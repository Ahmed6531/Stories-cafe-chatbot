import { useCallback, useEffect, useRef, useState } from 'react'
import { sendChatMessage } from '../../API/chatbotApi'
import { useCart } from '../../state/useCart'
import { getChatSessionId } from './useChatSession'

export function useChatbot({ appendMessage, onCheckoutRedirect }) {
  const { refreshCart } = useCart()
  const [typing, setTyping] = useState(false)
  const [voiceActive, setVoiceActive] = useState(false)
  const [micMode, setMicMode] = useState('idle')
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [voiceError, setVoiceError] = useState('')
  const [chatInput, setChatInput] = useState('')

  const pendingReplyTimeoutRef = useRef(null)
  const pendingCheckoutRef = useRef(false)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => {
      setIsOnline(false)
      setVoiceActive(false)
      setMicMode('idle')
      setVoiceError("You're offline. Reconnect to use voice input.")
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const stopPendingReply = useCallback(() => {
    if (pendingReplyTimeoutRef.current) {
      window.clearTimeout(pendingReplyTimeoutRef.current)
      pendingReplyTimeoutRef.current = null
    }

    setTyping(false)
    setVoiceActive(false)
    setMicMode('idle')
  }, [])

  const resetChatbot = useCallback(() => {
    stopPendingReply()
    setChatInput('')
  }, [stopPendingReply])

  const toggleVoiceCapture = useCallback(() => {
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
  }, [isOnline, typing, micMode, stopPendingReply, voiceActive])

  const sendMessage = useCallback(async (text) => {
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
      console.log('[CHAT REQUEST]', {
        session_id,
        cart_id,
        message: trimmed,
        timestamp: Date.now(),
      })

      const response = await sendChatMessage({ session_id, message: trimmed, cart_id })
      const data = response.data

      console.log('[CHAT RESPONSE]', {
        status: response.status,
        session_id: data.session_id,
        cart_updated: data.cart_updated,
        returned_cart_id: data.cart_id,
        intent: data.intent,
        suggestions: data.suggestions?.length,
      })

      if (cart_id !== data.cart_id) {
        console.warn('[CHAT CART SYNC]', { previous: cart_id, new: data.cart_id })
      }

      if (data.cart_id) {
        localStorage.setItem('cartId', data.cart_id)
      } else if (data.cart_updated && !data.cart_id) {
        localStorage.removeItem('cartId')
      }

      if (data.cart_updated) {
        refreshCart()
      }

      appendMessage({
        id: Date.now() + 1,
        role: 'bot',
        text: data.reply,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        suggestions: data.suggestions || [],
      })

      if (data.intent === 'checkout' && data.metadata?.pipeline_stage === 'checkout_redirect') {
        pendingReplyTimeoutRef.current = window.setTimeout(() => {
          pendingReplyTimeoutRef.current = null
          pendingCheckoutRef.current = true
          onCheckoutRedirect()
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
  }, [appendMessage, onCheckoutRedirect, refreshCart])

  const handleSend = useCallback(() => sendMessage(chatInput), [chatInput, sendMessage])
  const handleChipClick = useCallback((text) => sendMessage(text), [sendMessage])

  return {
    typing,
    setTyping,
    voiceActive,
    setVoiceActive,
    micMode,
    setMicMode,
    isOnline,
    voiceError,
    setVoiceError,
    chatInput,
    setChatInput,
    sendMessage,
    stopPendingReply,
    resetChatbot,
    cycleMicMode: toggleVoiceCapture,
    handleSend,
    handleChipClick,
    pendingCheckoutRef,
  }
}
