import http from './http'

export async function fetchCart() {
  const response = await http.get('/cart')
  return response.data
}

export async function addToCartApi(payload) {
  const response = await http.post('/cart/items', payload)
  return response.data
}

export async function updateCartItemApi(lineId, qty) {
  const response = await http.patch(`/cart/items/${lineId}`, { qty })
  return response.data
}

export async function removeFromCartApi(lineId) {
  const response = await http.delete(`/cart/items/${lineId}`)
  return response.data
}

export async function clearCartApi() {
  const response = await http.delete('/cart')
  return response.data
}
