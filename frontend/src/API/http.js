import axios from "axios";

// Get base URL from environment or default to localhost
const BASE_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || "http://localhost:5000";

const http = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: { "Content-Type": "application/json" }
});

// Request interceptor for cart session management
http.interceptors.request.use((config) => {
  const cartId = localStorage.getItem("cartId");
  if (cartId) config.headers["x-cart-id"] = cartId;
  return config;
});

// Response interceptor for cart ID capturing and error handling
http.interceptors.response.use(
  (res) => {
    const cartId = res.headers?.["x-cart-id"];
    if (cartId) localStorage.setItem("cartId", cartId);
    return res;
  },
  (error) => {
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

export default http;
