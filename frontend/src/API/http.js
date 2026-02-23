import axios from 'axios'

// Get base URL from environment or default to localhost
const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'

// Create axios instance with base config
const http = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})
http.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
 console.log("Sending request to:", config.url, "with token:", token)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

// Response interceptor for error handling
http.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.response?.data || error.message)
    return Promise.reject(error)
  }
)

export default http
