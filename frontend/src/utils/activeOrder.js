const KEY = 'activeOrder'
const TTL_MS = 2 * 60 * 60 * 1000 // 2 hours

export function getActiveOrder() {
  const raw = localStorage.getItem(KEY)
  if (!raw) return null

  try {
    const { orderNumber, placedAt } = JSON.parse(raw)
    if (Date.now() - placedAt > TTL_MS) {
      localStorage.removeItem(KEY)
      return null
    }
    return orderNumber
  } catch {
    // Legacy plain string — treat as expired
    localStorage.removeItem(KEY)
    return null
  }
}

export function clearActiveOrder() {
  localStorage.removeItem(KEY)
}
