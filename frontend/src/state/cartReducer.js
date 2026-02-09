export const initialCartState = {
  cartId: null,
  count: 0,
  items: [],
  loading: false,
  error: null
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
        items: action.payload.items || []
      };
    case "CART_ERROR":
      return { ...state, loading: false, error: action.payload || "Cart error" };
    default:
      return state;
  }
}
