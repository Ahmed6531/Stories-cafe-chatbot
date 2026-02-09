import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const http = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" }
});

http.interceptors.request.use((config) => {
  const cartId = localStorage.getItem("cartId");
  if (cartId) config.headers["x-cart-id"] = cartId;
  return config;
});

http.interceptors.response.use((res) => {
  const cartId = res.headers?.["x-cart-id"];
  if (cartId) localStorage.setItem("cartId", cartId);
  return res;
});

export default http;
