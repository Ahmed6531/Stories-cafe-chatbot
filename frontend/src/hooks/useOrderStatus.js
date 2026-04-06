import { useEffect, useRef, useState } from 'react'
import { getOrderStatus } from '../API/ordersApi'

const TERMINAL = ['completed', 'cancelled']
const POLL_MS = 10_000

export function useOrderStatus(orderNumber) {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const intervalRef = useRef(null)

  useEffect(() => {
    if (!orderNumber) return

    let cancelled = false

    const fetch = async () => {
      try {
        const data = await getOrderStatus(orderNumber)
        if (cancelled) return
        setStatus(data.status)
        setLoading(false)
        if (TERMINAL.includes(data.status) && intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      } catch {
        if (!cancelled) setLoading(false)
      }
    }

    fetch()
    intervalRef.current = setInterval(fetch, POLL_MS)

    return () => {
      cancelled = true
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [orderNumber])

  return { status, loading }
}
