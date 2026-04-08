export const initialCartState = {
  cartId: null,
  count: 0,
  items: [],
  loading: false,
  error: null,
  lastAddedItem: null,
};

export function cartReducer(state, action) {
  switch (action.type) {
    case "CART_LOADING":
      return { ...state, loading: true, error: null };
    case "CART_LOADED":
      return {
        ...state,
        loading: false,
        error: null,
        cartId: action.payload.cartId,
        count: action.payload.count || 0,
        items: action.payload.items || [],
        lastAddedItem: null,
      };
    case "CART_ITEM_ADDED":
      return {
        ...state,
        loading: false,
        error: null,
        cartId: action.payload.cart.cartId,
        count: action.payload.cart.count || 0,
        items: action.payload.cart.items || [],
        lastAddedItem: action.payload.lastAddedItem, // { image }
      };
    case "CART_RESET":
      return { ...initialCartState };
    case "CART_ERROR":
      return { ...state, loading: false, error: action.payload || "Cart error" };
    case "REMOVE_ITEM":
      return {
        ...state,
        items: state.items.filter(item => item.lineId !== action.payload),
        count: state.items.reduce((acc, item) => item.lineId === action.payload ? acc : acc + item.qty, 0)
      };
    case "RESTORE_CART":
      return {
        ...state,
        loading: false,
        cartId: action.payload.cartId ?? null,
        count: action.payload.count || 0,
        items: action.payload.items || []
      };
    default:
      return state;
  }
}
