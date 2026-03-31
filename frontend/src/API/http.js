import axios from "axios";

// Get base URL from environment or default to localhost
const BASE_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || "http://localhost:5000";

const http = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: { "Content-Type": "application/json" }
});

function isCartRequest(url) {
  return typeof url === "string" && url.includes("/cart");
}

/**
 * Call after a successful order with the completed cart's ID.
 * The response interceptor will block that specific ID from being
 * re-saved, while allowing any new cartId through freely.
 */
export function lockDeadCart(cartId) {
  if (cartId) sessionStorage.setItem("deadCartId", cartId);
}

export function isDeadCart(cartId) {
  return cartId && cartId === sessionStorage.getItem("deadCartId");
}

// Request interceptor for cart session management
http.interceptors.request.use((config) => {
  const cartId = localStorage.getItem("cartId");
  if (cartId) config.headers["x-cart-id"] = cartId;
  return config;
});
http.interceptors.request.use((config) => {
  const token = localStorage.getItem('token') || localStorage.getItem('adminToken')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

// Response interceptor for cart ID capturing and error handling
http.interceptors.response.use(
  (res) => {
    const cartIdFromHeader = res.headers?.["x-cart-id"];
    const cartIdFromBody = Object.prototype.hasOwnProperty.call(res.data || {}, "cartId")
      ? res.data.cartId
      : undefined;

    const incomingCartId = cartIdFromHeader || cartIdFromBody;

    if (isDeadCart(incomingCartId)) {
      // This is the old completed-order cart — don't resurrect it
    } else if (cartIdFromHeader) {
      localStorage.setItem("cartId", cartIdFromHeader);
    } else if (isCartRequest(res.config?.url) && cartIdFromBody === null) {
      localStorage.removeItem("cartId");
    } else if (isCartRequest(res.config?.url) && cartIdFromBody) {
      localStorage.setItem("cartId", cartIdFromBody);
    }

    return res;
  },
  (error) => {
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

export default http;
