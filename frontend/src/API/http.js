import axios from "axios";

// Get base URL from environment or default to localhost
const BASE_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || "http://localhost:5000";

const http = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
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

    if (error.response?.status === 401) {
      const pathname = window.location.pathname;
      const requestUrl = error.config?.url || "";
      const isSessionBootstrap = requestUrl.includes("/auth/me");
      const isAuthPage =
        pathname === "/login" ||
        pathname === "/register" ||
        pathname === "/admin/login" ||
        pathname === "/unauthorized";

      if (!isSessionBootstrap && !isAuthPage) {
        const isAdmin = pathname.startsWith("/admin");
        window.location.replace(isAdmin ? "/admin/login" : "/login");
      }
    }

    return Promise.reject(error);
  }
);

export default http;
