import { useRef, useState } from "react";
import axios from "axios";
import VoiceInput from "../VoiceInput";
import MicIcon from "@mui/icons-material/Mic";
import CircularProgress from "@mui/material/CircularProgress";

const CHATBOT_URL = import.meta.env.VITE_CHATBOT_URL || "http://localhost:8000";

// Stable session ID for the lifetime of the page
function getSessionId() {
  let id = sessionStorage.getItem("chatSessionId");
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem("chatSessionId", id);
  }
  return id;
}

export default function ChatWidget() {
  const [voiceActive, setVoiceActive] = useState(false);
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);

  const sendMessage = async (text) => {
    try {
      const cartId = localStorage.getItem("cartId") || undefined;

      const response = await axios.post(`${CHATBOT_URL}/chat/message`, {
        session_id: getSessionId(),
        message: text,
        cart_id: cartId ?? null,
      });

      const data = response.data;

      // Persist cart_id if the chatbot created/updated one
      if (data.cart_id) {
        localStorage.setItem("cartId", data.cart_id);
      }

      console.log("Bot:", data.reply);
    } catch (err) {
      console.error(err);
      setError("Failed to send message to chatbot.");
    }
  };

  const handleTranscript = (text) => {
    setVoiceActive(false);
    setError(null);
    sendMessage(text);
  };

  const toggleMic = () => {
    if (processing) return;
    setError(null);
    setVoiceActive((prev) => !prev);
  };

  return (
    <div className="chat-container">

      {/* Existing chatbot messages UI would normally be here */}

      <div className="chat-input">
        <button
          onClick={toggleMic}
          disabled={processing}
          className={listening ? "active-mic" : ""}
        >
          {processing ? (
            <CircularProgress size={20} />
          ) : (
            <MicIcon color={listening ? "error" : "action"} />
          )}
        </button>

        {listening && <span style={{ marginLeft: 8 }}>Listening...</span>}
        {processing && <span style={{ marginLeft: 8 }}>Processing...</span>}
      </div>

      <VoiceInput
        active={voiceActive}
        onListeningChange={(state) => setListening(state)}
        onProcessingChange={(state) => setProcessing(state)}
        onTranscript={handleTranscript}
        onError={(msg) => setError(msg)}
      />

      {error && (
        <p className="error-msg" style={{ color: "red" }}>
          {error}
        </p>
      )}

    </div>
  );
}