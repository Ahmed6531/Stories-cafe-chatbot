import { useState, useEffect, useRef } from 'react'

const CHAT_STORAGE_KEY = 'chatMessages'
const CHAT_STORAGE_TS_KEY = 'chatMessagesSavedAt'
const CHAT_TTL_MS = 24 * 60 * 60 * 1000

export function getChatSessionId() {
  let id = sessionStorage.getItem('chatSessionId')
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem('chatSessionId', id)
  }
  return id
}

export function clearChatStorage() {
  localStorage.removeItem(CHAT_STORAGE_KEY)
  localStorage.removeItem(CHAT_STORAGE_TS_KEY)
}

export function useChatSession() {
  const [messages, setMessages] = useState([])
  const [chipsVisible, setChipsVisible] = useState(true)
  const hydratedRef = useRef(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(CHAT_STORAGE_KEY)
      if (!saved) {
        hydratedRef.current = true
        return
      }

      const savedAt = Number(localStorage.getItem(CHAT_STORAGE_TS_KEY))
      if (!Number.isFinite(savedAt) || Date.now() - savedAt > CHAT_TTL_MS) {
        clearChatStorage()
        hydratedRef.current = true
        return
      }

      const parsed = JSON.parse(saved)
      const restoredMessages = Array.isArray(parsed) ? parsed : []
      setMessages(restoredMessages)
      setChipsVisible(restoredMessages.length === 0)
    } catch (e) {
      console.error('Failed to restore chat history:', e)
      clearChatStorage()
    } finally {
      hydratedRef.current = true
    }
  }, [])

  useEffect(() => {
    if (!hydratedRef.current) return

    if (messages.length === 0) {
      clearChatStorage()
      return
    }
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages))
    localStorage.setItem(CHAT_STORAGE_TS_KEY, String(Date.now()))
  }, [messages])

  const appendMessage = (message) => {
    setChipsVisible(false)
    setMessages((m) => [...m, message])
  }

  return {
    messages,
    setMessages,
    chipsVisible,
    setChipsVisible,
    appendMessage,
  }
}
