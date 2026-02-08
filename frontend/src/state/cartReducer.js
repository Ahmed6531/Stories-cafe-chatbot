export const initialCartState = {
  items: [], // {id, name, price, image, qty, selectedOption}
}

// TODO: Revert to full cart reducer logic
// Original reducer handled ADD_TO_CART, REMOVE_FROM_CART, CLEAR_CART with state mutations
// Missing: All cart item management logic (adding, removing, clearing items)
export function cartReducer(state, _action) { // eslint-disable-line no-unused-vars
  // Static: no state changes, just return current state
  return state
}
