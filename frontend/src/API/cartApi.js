import http from './http'

function cartHeaders() {
  const cartId = localStorage.getItem("cartId");
  return cartId ? { "x-cart-id": cartId } : {};
}

export async function fetchCart({ signal } = {}) {
  const response = await http.get('/cart', { signal }, { headers: cartHeaders() })
  return response.data
}

export async function addToCartApi(payload) {
  const response = await http.post('/cart/items', payload, { headers: cartHeaders() })
  return response.data
}

export async function updateCartItemApi(lineId, qty) {
  const response = await http.patch(`/cart/items/${lineId}`, { qty }, { headers: cartHeaders() })
  return response.data
}

export async function removeFromCartApi(lineId) {
  const response = await http.delete(`/cart/items/${lineId}`, { headers: cartHeaders() })
  return response.data
}

export async function clearCartApi() {
  const response = await http.delete('/cart', { headers: cartHeaders() })
  return response.data
}
