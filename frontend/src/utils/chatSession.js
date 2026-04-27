export const CHAT_SESSION_STORAGE_KEY = 'chatSessionId'
export const CHAT_STORAGE_KEY = 'chatMessages'
export const CHAT_STORAGE_TS_KEY = 'chatMessagesSavedAt'

export function getOrCreateChatSessionId() {
  let id = sessionStorage.getItem(CHAT_SESSION_STORAGE_KEY)
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem(CHAT_SESSION_STORAGE_KEY, id)
  }
  return id
}

export function resetChatClientState() {
  sessionStorage.removeItem(CHAT_SESSION_STORAGE_KEY)
  localStorage.removeItem(CHAT_SESSION_STORAGE_KEY)
  localStorage.removeItem(CHAT_STORAGE_KEY)
  localStorage.removeItem(CHAT_STORAGE_TS_KEY)
}
