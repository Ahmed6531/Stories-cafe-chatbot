import { useEffect, useMemo, useReducer, useCallback } from 'react'
import { CartContext } from './CartContext'
import { cartReducer, initialCartState } from './cartReducer'
import { fetchCart, addToCartApi, updateCartItemApi, removeFromCartApi, clearCartApi } from '../API/cartApi'

export function CartProvider({ children }) {
  const [state, dispatch] = useReducer(cartReducer, initialCartState)

  const loadCart = useCallback(async () => {
    dispatch({ type: 'CART_LOADING' })
    try {
      const data = await fetchCart()
      dispatch({ type: 'CART_LOADED', payload: data })
    } catch (err) {
      dispatch({ type: 'CART_ERROR', payload: err.message })
    }
  }, [])

  useEffect(() => {
    loadCart()
  }, [loadCart])

  const addToCart = async (item) => {
    try {
      const data = await addToCartApi(item)
      dispatch({ type: 'CART_LOADED', payload: data })
    } catch (err) {
      dispatch({ type: 'CART_ERROR', payload: err.message })
    }
  }

  const updateQty = async (lineId, qty) => {
    try {
      const data = await updateCartItemApi(lineId, qty)
      dispatch({ type: 'CART_LOADED', payload: data })
    } catch (err) {
      dispatch({ type: 'CART_ERROR', payload: err.message })
    }
  }

  const removeFromCart = async (lineId) => {
    // Optimistic update: remove from state immediately
    dispatch({ type: 'REMOVE_ITEM', payload: lineId });

    try {
      const data = await removeFromCartApi(lineId);
      // Sync state with backend response
      dispatch({ type: 'CART_LOADED', payload: data });
    } catch (err) {
      dispatch({ type: 'CART_ERROR', payload: err.message });
      // On error, reload full cart to restore state
      loadCart();
    }
  }

  const clearCart = async () => {
    try {
      const data = await clearCartApi()
      dispatch({ type: 'CART_LOADED', payload: { items: [], count: 0 } })
    } catch (err) {
      dispatch({ type: 'CART_ERROR', payload: err.message })
    }
  }

  const value = useMemo(
    () => ({
      state,
      cartCount: state.count,
      addToCart,
      updateQty,
      removeFromCart,
      clearCart,
      refreshCart: loadCart
    }),
    [state, loadCart]
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}
