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

    if (cartIdFromHeader) {
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
