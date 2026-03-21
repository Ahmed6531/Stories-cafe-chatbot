import axios from 'axios'

const CHATBOT_URL = import.meta.env.VITE_CHATBOT_URL || 'http://localhost:8000'

/**
 * @param {{ session_id: string, message: string, cart_id: string | null }} payload
 * @returns {Promise<import('axios').AxiosResponse>}
 */
export function sendChatMessage(payload) {
  return axios.post(`${CHATBOT_URL}/chat/message`, payload)
}