import axios from "axios";

const CHATBOT_URL =
  import.meta.env.VITE_CHATBOT_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  "http://localhost:8000";

const chatbotHttp = axios.create({
  baseURL: CHATBOT_URL,
  timeout: 30000,
  withCredentials: true,
});

export default chatbotHttp;
