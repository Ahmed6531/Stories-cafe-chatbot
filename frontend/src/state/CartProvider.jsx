import { useEffect, useMemo, useReducer, useCallback, useRef } from 'react'
import { CartContext } from './CartContext'
import { cartReducer, initialCartState } from './cartReducer'
import { fetchCart, addToCartApi, updateCartItemApi, updateCartItemFull, removeFromCartApi, clearCartApi } from '../API/cartApi'

function normalizeCartPayload(data) {
  return {
    cartId: data?.cartId ?? null,
    count: data?.count ?? 0,
    items: Array.isArray(data?.items) ? data.items : [],
  }
}

function snapshotCartState(state) {
  return {
    cartId: state.cartId ?? null,
    count: state.count ?? 0,
    items: Array.isArray(state.items) ? state.items : [],
  }
}

export function CartProvider({ children }) {
  const [state, dispatch] = useReducer(cartReducer, initialCartState)
  const abortRef = useRef(null)
  const seqRef = useRef(0)
  const stateRef = useRef(state)

  useEffect(() => {
    stateRef.current = state
  })

  const loadCart = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()

    dispatch({ type: 'CART_LOADING' })
    const seq = seqRef.current
    try {
      const data = await fetchCart({ signal: abortRef.current.signal })
      if (seq >= seqRef.current) dispatch({ type: 'CART_LOADED', payload: normalizeCartPayload(data) })
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
      dispatch({
        type: 'CART_ITEM_ADDED',
        payload: {
          cart: normalizeCartPayload(data),
          lastAddedItem: item.image ? { image: item.image } : null,
        },
      })
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

  const editCartItem = useCallback(async (lineId, payload) => {
  abortRef.current?.abort()
  try {
    const data = await updateCartItemFull(lineId, payload)
    dispatch({ type: 'CART_LOADED', payload: normalizeCartPayload(data) })
  } catch (err) {
    dispatch({ type: 'CART_ERROR', payload: err.message })
    throw err
  }
}, [])

  const removeFromCart = useCallback(async (lineId) => {
    abortRef.current?.abort()
    const snapshot = snapshotCartState(stateRef.current)

    // Optimistic update: remove from state immediately
    dispatch({ type: 'REMOVE_ITEM', payload: lineId })
    seqRef.current += 1
    const seq = seqRef.current

    try {
      const data = await removeFromCartApi(lineId)
      if (seq >= seqRef.current) dispatch({ type: 'CART_LOADED', payload: normalizeCartPayload(data) })
    } catch (err) {
      dispatch({ type: 'RESTORE_CART', payload: snapshot })
      dispatch({ type: 'CART_ERROR', payload: err.message })
      // After restoring the last known-good state, try to re-sync with the server.
      void loadCart()
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
    abortRef.current?.abort()
    seqRef.current += 1
    dispatch({ type: 'CART_RESET' })
  }, [])

  const value = useMemo(
    () => ({
      state,
      cartCount: state.count,
      lastAddedItem: state.lastAddedItem,
      addToCart,
      updateQty,
      editCartItem,
      removeFromCart,
      clearCart,
      resetCart,
      refreshCart: loadCart,
    }),
    [state, addToCart, updateQty, editCartItem, removeFromCart, clearCart, resetCart, loadCart]
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}
