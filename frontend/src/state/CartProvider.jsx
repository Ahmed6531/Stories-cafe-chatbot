import { useMemo, useReducer } from 'react'
import { CartContext } from './CartContext'
import { cartReducer, initialCartState } from './cartReducer'

export function CartProvider({ children }) {
  const [state, dispatch] = useReducer(cartReducer, initialCartState)

  // TODO: Revert to dynamic cart count calculation
  // Original: const cartCount = useMemo(() => state.items.reduce((sum, x) => sum + (x.qty || 0), 0), [state.items])
  // Missing: Dynamic item counting from state.items
  const cartCount = 0 // Static: always 0 for static cart UI

  const value = useMemo(
    () => ({ state, dispatch, cartCount }),
    [state, dispatch, cartCount]
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}
