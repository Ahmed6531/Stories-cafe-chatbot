import { useEffect, useRef } from "react";

// ─── Tuning ───────────────────────────────────────────────────────────────────
// THRESHOLD : raise if background noise falsely triggers; lower for quiet speakers (range 5–20)
// DURATION  : raise if pauses mid-order cut speech early; 1400ms is snappy for short orders
// MIN_MS    : clips shorter than this are noise/coughs and get dropped
const SILENCE_THRESHOLD = 6;
const SILENCE_DURATION = 1400; // ms
const MIN_SPEECH_MS = 350; // ms
const SAMPLE_RATE = 16000; // Whisper is trained on 16 kHz mono
const CHUNK_MS = 150; // MediaRecorder chunk interval for websocket streaming
const FINAL_TIMEOUT_MS = 15000; // wait for backend final event after sending end
// ─────────────────────────────────────────────────────────────────────────────

function getChatSessionId() {
  let id = sessionStorage.getItem("chatSessionId");
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem("chatSessionId", id);
  }
  return id;
}

function toWebSocketUrl(baseUrl) {
  const trimmed = (baseUrl || "").replace(/\/$/, "");
  if (trimmed.startsWith("https://")) return trimmed.replace("https://", "wss://");
  if (trimmed.startsWith("http://")) return trimmed.replace("http://", "ws://");
  return trimmed;
}

function pickMimeType() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/ogg"];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

export default function VoiceInput({ active, onTranscript, onPartialTranscript, onListeningChange, onProcessingChange, onError }) {
  const stopped = useRef(false);
  const streamRef = useRef(null);
  const ctxRef = useRef(null);
  const recRef = useRef(null);
  const rafRef = useRef(null);
  const wsRef = useRef(null);
  const finalTimeoutRef = useRef(null);
  const liveTranscriptRef = useRef("");

  useEffect(() => {
    if (active) {
      stopped.current = false;
      capture();
    } else {
      stopped.current = true;
      cleanup();
    }
    return () => {
      stopped.current = true;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  async function capture() {
    try {
      const chatbotUrl = import.meta.env.VITE_CHATBOT_URL || "http://localhost:8000";
      const wsUrl = `${toWebSocketUrl(chatbotUrl)}/voice/stream`;
      const ws = await connectWebSocket(wsUrl);
      if (stopped.current) {
        ws.close();
        return;
      }
      wsRef.current = ws;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: SAMPLE_RATE, // hint — browser may honour it
        },
      });

      if (stopped.current) { stream.getTracks().forEach((t) => t.stop()); return; }

      streamRef.current = stream;

      // AudioContext at 16 kHz — Web Audio API resamples the mic stream to match
      const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
      ctxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      // MediaRecorder chunk stream is sent directly as websocket binary frames.
      const mimeType = pickMimeType();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recRef.current = rec;
      let speechStart = null;
      let streamEnded = false;
      let finalReceived = false;
      liveTranscriptRef.current = "";

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload?.type === "final") {
            finalReceived = true;
            clearFinalTimeout();
            const text = (payload.transcript || "").trim();
            if (!text) {
              onError?.("Could not transcribe. Please try again.");
            } else {
              liveTranscriptRef.current = "";
              onPartialTranscript?.("");
              onTranscript?.(text);
            }
            onProcessingChange?.(false);
            ws.close();
          } else if (payload?.type === "partial") {
            const snapshot = (payload.snapshot || "").trim();
            const delta = (payload.delta || "").trim();

            if (snapshot) {
              liveTranscriptRef.current = snapshot;
            } else if (delta) {
              liveTranscriptRef.current = appendDelta(liveTranscriptRef.current, delta);
            }

            if (liveTranscriptRef.current) onPartialTranscript?.(liveTranscriptRef.current);
          } else if (payload?.type === "error") {
            clearFinalTimeout();
            liveTranscriptRef.current = "";
            onPartialTranscript?.("");
            onProcessingChange?.(false);
            onError?.(payload.message || "Transcription failed");
            ws.close();
          }
        } catch {
          // Ignore non-JSON websocket messages.
        }
      };

      ws.onerror = () => {
        if (!stopped.current) {
          clearFinalTimeout();
          onProcessingChange?.(false);
          onError?.("Voice websocket error");
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (streamEnded && !finalReceived && !stopped.current) {
          clearFinalTimeout();
          onProcessingChange?.(false);
          onError?.("Voice transcription connection closed before final result");
        }
      };

      ws.send(JSON.stringify({
        type: "start",
        session_id: getChatSessionId(),
        utterance_id: crypto.randomUUID(),
        mime_type: rec.mimeType || mimeType || "audio/webm",
      }));

      rec.ondataavailable = async (e) => {
        if (!e.data || e.data.size === 0) return;
        const socket = wsRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN) return;
        const bytes = await e.data.arrayBuffer();
        socket.send(bytes);
      };

      rec.onstop = async () => {
        if (stopped.current) return;

        const speechMs = speechStart ? Date.now() - speechStart : 0;
        if (speechMs < MIN_SPEECH_MS) {
          liveTranscriptRef.current = "";
          onPartialTranscript?.("");
          onProcessingChange?.(false);
          ws.close();
          return;
        }

        streamEnded = true;
        const socket = wsRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN) {
          onProcessingChange?.(false);
          onError?.("Voice transcription connection is not open");
          return;
        }

        socket.send(JSON.stringify({ type: "end" }));
        finalTimeoutRef.current = window.setTimeout(() => {
          if (!finalReceived && !stopped.current) {
            onProcessingChange?.(false);
            onError?.("Transcription timed out. Please try again.");
            socket.close();
          }
        }, FINAL_TIMEOUT_MS);
      };

      rec.start(CHUNK_MS);
      onListeningChange?.(true);

      // Silence-detection loop — RMS deviation from 128 (waveform midpoint)
      const buf = new Uint8Array(analyser.fftSize);
      let hasSpeech    = false;
      let silenceStart = null;

      function tick() {
        if (stopped.current || rec.state !== 'recording') return;

        analyser.getByteTimeDomainData(buf);
        const rms = Math.sqrt(buf.reduce((s, v) => s + (v - 128) ** 2, 0) / buf.length);

        if (rms > SILENCE_THRESHOLD) {
          if (!hasSpeech) speechStart = Date.now();
          hasSpeech    = true;
          silenceStart = null;
        } else if (hasSpeech) {
          if (!silenceStart) {
            silenceStart = Date.now();
          } else if (Date.now() - silenceStart > SILENCE_DURATION) {
            onListeningChange?.(false);
            onProcessingChange?.(true);
            rec.stop(); // triggers onstop → end event → websocket final transcript
            return;
          }
        }

        rafRef.current = requestAnimationFrame(tick);
      }

      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      onError?.(err.message || "Microphone access denied");
      liveTranscriptRef.current = "";
      onPartialTranscript?.("");
      onProcessingChange?.(false);
    }
  }

  function appendDelta(base, delta) {
    if (!base) return delta;
    if (!delta) return base;
    if (base.endsWith(" ")) return `${base}${delta}`;
    if ([",", ".", "!", "?", ":", ";"].some((p) => delta.startsWith(p))) return `${base}${delta}`;
    return `${base} ${delta}`;
  }

  function clearFinalTimeout() {
    if (finalTimeoutRef.current) {
      window.clearTimeout(finalTimeoutRef.current);
      finalTimeoutRef.current = null;
    }
  }

  function connectWebSocket(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.onopen = () => resolve(ws);
      ws.onerror = () => reject(new Error("Could not open voice websocket"));
    });
  }

  function cleanup() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    clearFinalTimeout();
    if (recRef.current?.state === 'recording') recRef.current.stop();
    wsRef.current?.close();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    ctxRef.current?.close();
    streamRef.current = null;
    recRef.current = null;
    ctxRef.current = null;
    rafRef.current = null;
    wsRef.current = null;
    liveTranscriptRef.current = "";
    onPartialTranscript?.("");
    onListeningChange?.(false);
    onProcessingChange?.(false);
  }

  return null;
}
