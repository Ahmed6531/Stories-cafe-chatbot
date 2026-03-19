import { useEffect, useMemo, useReducer, useCallback, useRef } from 'react'
import { CartContext } from './CartContext'
import { cartReducer, initialCartState } from './cartReducer'
import { fetchCart, addToCartApi, updateCartItemApi, removeFromCartApi, clearCartApi } from '../API/cartApi'

function normalizeCartPayload(data) {
  return {
    cartId: data?.cartId ?? null,
    count: data?.count ?? 0,
    items: Array.isArray(data?.items) ? data.items : [],
  }
}

export function CartProvider({ children }) {
  const [state, dispatch] = useReducer(cartReducer, initialCartState)
  const abortRef = useRef(null)

  const loadCart = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()

    dispatch({ type: 'CART_LOADING' })
    try {
      const data = await fetchCart({ signal: abortRef.current.signal })
      dispatch({ type: 'CART_LOADED', payload: normalizeCartPayload(data) })
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') return
      dispatch({ type: 'CART_ERROR', payload: err.message })
    }
  }, [])

  useEffect(() => {
    loadCart()
  }, [loadCart])

  const addToCart = useCallback(async (item) => {
    try {
      const data = await addToCartApi(item)
      dispatch({ type: 'CART_LOADED', payload: normalizeCartPayload(data) })
      return data
    } catch (err) {
      dispatch({ type: 'CART_ERROR', payload: err.message })
      throw err
    }
  }, [])

  const updateQty = useCallback(async (lineId, qty) => {
    abortRef.current?.abort()

    try {
      const data = await updateCartItemApi(lineId, qty)
      dispatch({ type: 'CART_LOADED', payload: normalizeCartPayload(data) })
    } catch (err) {
      dispatch({ type: 'CART_ERROR', payload: err.message })
    }
  }, [])

  const removeFromCart = useCallback(async (lineId) => {
    abortRef.current?.abort()

    // Optimistic update: remove from state immediately
    dispatch({ type: 'REMOVE_ITEM', payload: lineId })

    try {
      const data = await removeFromCartApi(lineId)
      dispatch({ type: 'CART_LOADED', payload: normalizeCartPayload(data) })
    } catch (err) {
      dispatch({ type: 'CART_ERROR', payload: err.message })
      // On error, reload full cart to restore state
      await loadCart()
    }
  }, [loadCart])

  const clearCart = useCallback(async () => {
    try {
      await clearCartApi()
      dispatch({ type: 'CART_LOADED', payload: normalizeCartPayload({ cartId: null, items: [], count: 0 }) })
    } catch (err) {
      dispatch({ type: 'CART_ERROR', payload: err.message })
    }
  }, [])

  const resetCart = useCallback(() => {
    dispatch({ type: 'CART_RESET' })
  }, [])

  const value = useMemo(
    () => ({
      state,
      cartCount: state.count,
      addToCart,
      updateQty,
      removeFromCart,
      clearCart,
      resetCart,
      refreshCart: loadCart
    }),
    [state, addToCart, updateQty, removeFromCart, clearCart, resetCart, loadCart]
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}
