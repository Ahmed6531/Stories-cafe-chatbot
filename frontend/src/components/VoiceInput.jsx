import { useEffect, useRef } from "react";

const SILENCE_THRESHOLD = 6;
const CONFIRMED_SPEECH_MS = 300;
const MIN_VOICED_DURATION_MS = 300;
const MIN_RECORDING_DURATION_MS = 1000;
const SILENCE_DURATION = 2000;
const MAX_VOICED_FRAME_MS = 80;
const SAMPLE_RATE = 16000;
const CHUNK_MS = 150;
const INITIAL_SPEECH_TIMEOUT_MS = 5000;
const STREAMING_INACTIVITY_TIMEOUT_MS = 6000;
const POST_STOP_FINALIZATION_TIMEOUT_MS = 15000;

const SESSION_PHASE = {
  IDLE: "idle",
  CONNECTING: "connecting",
  RECORDING: "recording",
  STOPPING: "stopping",
  WAITING_FINAL: "waiting_final",
};

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
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function isBusyPhase(phase) {
  return phase !== SESSION_PHASE.IDLE;
}

export default function VoiceInput({
  active,
  onTranscript,
  onPartialTranscript,
  onListeningChange,
  onProcessingChange,
  onError,
  onSessionBusyChange,
  onVoiceStateChange,
  sourceName = "unknown",
}) {
  const mountedRef = useRef(false);
  const desiredActiveRef = useRef(active);
  const phaseRef = useRef(SESSION_PHASE.IDLE);
  const streamRef = useRef(null);
  const ctxRef = useRef(null);
  const recRef = useRef(null);
  const rafRef = useRef(null);
  const wsRef = useRef(null);
  const initialSpeechTimeoutRef = useRef(null);
  const streamingInactivityTimeoutRef = useRef(null);
  const postStopFinalizationTimeoutRef = useRef(null);
  const liveTranscriptRef = useRef("");
  const instanceId = useRef(Math.random().toString(36).slice(2, 8));
  const pendingChunkSendsRef = useRef(new Set());
  const speechDetectedRef = useRef(false);
  const speechConfirmedRef = useRef(false);
  const lastVoicedTickAtRef = useRef(null);
  const voicedDurationMsRef = useRef(0);
  const recordingStartedAtRef = useRef(null);
  const stopReasonRef = useRef("unknown");
  const terminalResolvedRef = useRef(false);

  function logVoiceUi(event, details) {
    if (details === undefined) {
      console.log("[VOICE_UI]", instanceId.current, sourceName, event);
      return;
    }
    console.log("[VOICE_UI]", instanceId.current, sourceName, event, details);
  }

  function emitVoiceState(state) {
    logVoiceUi("voice_state", state);
    onVoiceStateChange?.(state);
  }

  function setPhase(nextPhase) {
    const previousPhase = phaseRef.current;
    if (previousPhase === nextPhase) return;
    phaseRef.current = nextPhase;
    logVoiceUi("phase_change", { from: previousPhase, to: nextPhase });
    onSessionBusyChange?.(isBusyPhase(nextPhase));
  }

  function clearInitialSpeechTimeout() {
    if (initialSpeechTimeoutRef.current) {
      window.clearTimeout(initialSpeechTimeoutRef.current);
      initialSpeechTimeoutRef.current = null;
    }
  }

  function clearStreamingInactivityTimeout() {
    if (streamingInactivityTimeoutRef.current) {
      window.clearTimeout(streamingInactivityTimeoutRef.current);
      streamingInactivityTimeoutRef.current = null;
    }
  }

  function clearPostStopFinalizationTimeout() {
    if (postStopFinalizationTimeoutRef.current) {
      window.clearTimeout(postStopFinalizationTimeoutRef.current);
      postStopFinalizationTimeoutRef.current = null;
    }
  }

  function clearPhaseTimeouts() {
    clearInitialSpeechTimeout();
    clearStreamingInactivityTimeout();
    clearPostStopFinalizationTimeout();
  }

  function armInitialSpeechTimeout() {
    clearInitialSpeechTimeout();
    initialSpeechTimeoutRef.current = window.setTimeout(() => {
      if (
        phaseRef.current === SESSION_PHASE.RECORDING &&
        !speechDetectedRef.current &&
        !terminalResolvedRef.current
      ) {
        logVoiceUi("initial_speech_timeout");
        requestStop("initial_speech_timeout");
      }
    }, INITIAL_SPEECH_TIMEOUT_MS);
  }

  function touchStreamingActivity(reason) {
    clearStreamingInactivityTimeout();
    if (phaseRef.current !== SESSION_PHASE.RECORDING || terminalResolvedRef.current) {
      return;
    }

    streamingInactivityTimeoutRef.current = window.setTimeout(() => {
      if (phaseRef.current === SESSION_PHASE.RECORDING && !terminalResolvedRef.current) {
        logVoiceUi("streaming_inactivity_timeout", { reason });
        resolveTerminal("timeout", "Voice recording timed out during active streaming.");
      }
    }, STREAMING_INACTIVITY_TIMEOUT_MS);
  }

  async function waitForPendingChunkSends() {
    while (pendingChunkSendsRef.current.size > 0) {
      await Promise.allSettled(Array.from(pendingChunkSendsRef.current));
    }
  }

  function getSpeechStats() {
    const now = Date.now();
    const recordingStartedAt = recordingStartedAtRef.current;
    return {
      speech_detected: speechDetectedRef.current,
      speech_confirmed: speechConfirmedRef.current,
      voiced_duration_ms: Math.round(voicedDurationMsRef.current),
      recording_duration_ms: recordingStartedAt ? Math.max(0, now - recordingStartedAt) : 0,
      confirmed_speech_ms: CONFIRMED_SPEECH_MS,
      min_voiced_duration_ms: MIN_VOICED_DURATION_MS,
      min_recording_duration_ms: MIN_RECORDING_DURATION_MS,
      silence_duration_ms: SILENCE_DURATION,
      silence_threshold: SILENCE_THRESHOLD,
    };
  }

  function releaseResources() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    ctxRef.current?.close();
    wsRef.current?.close();

    streamRef.current = null;
    ctxRef.current = null;
    recRef.current = null;
    rafRef.current = null;
    wsRef.current = null;
    pendingChunkSendsRef.current = new Set();
    speechDetectedRef.current = false;
    speechConfirmedRef.current = false;
    lastVoicedTickAtRef.current = null;
    voicedDurationMsRef.current = 0;
    recordingStartedAtRef.current = null;
    stopReasonRef.current = "unknown";
    terminalResolvedRef.current = false;
  }

  function finalizeSession(reason, options = {}) {
    const { clearTranscript = true } = options;
    logVoiceUi("finalize_session", reason);
    clearPhaseTimeouts();
    if (clearTranscript) {
      liveTranscriptRef.current = "";
      onPartialTranscript?.("");
    } else {
      liveTranscriptRef.current = "";
    }
    onListeningChange?.(false);
    onProcessingChange?.(false);
    setPhase(SESSION_PHASE.IDLE);
    releaseResources();
  }

  function requestStop(reason) {
    const phase = phaseRef.current;
    stopReasonRef.current = reason;
    logVoiceUi("request_stop", { reason, phase, speechStats: getSpeechStats() });

    if (phase === SESSION_PHASE.RECORDING) {
      setPhase(SESSION_PHASE.STOPPING);
      emitVoiceState("finalizing");
      onListeningChange?.(false);
      onProcessingChange?.(true);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (recRef.current?.state === "recording") {
        recRef.current.stop();
      }
      return;
    }

    if (phase === SESSION_PHASE.CONNECTING) {
      return;
    }
  }

  function resolveTerminal(kind, message = "") {
    if (terminalResolvedRef.current) {
      logVoiceUi("duplicate_terminal_ignored", kind);
      return;
    }

    terminalResolvedRef.current = true;
    logVoiceUi("terminal_received", { kind, phase: phaseRef.current, message });
    clearPhaseTimeouts();

    if (kind === "error" || kind === "timeout" || kind === "close_before_terminal") {
      emitVoiceState(kind === "timeout" ? "timed-out" : "error");
      onError?.(message);
      finalizeSession(kind);
      return;
    }

    if (kind === "no_speech") {
      emitVoiceState("no-speech");
      onError?.(message || "Could not transcribe. Please try again.");
      finalizeSession(kind);
      return;
    }

    finalizeSession(kind, { clearTranscript: false });
  }

  async function capture() {
    if (phaseRef.current !== SESSION_PHASE.IDLE) {
      logVoiceUi("capture_skipped", { phase: phaseRef.current });
      return;
    }

    setPhase(SESSION_PHASE.CONNECTING);
    emitVoiceState("connecting");
    pendingChunkSendsRef.current = new Set();
    terminalResolvedRef.current = false;

    try {
      const chatbotUrl = import.meta.env.VITE_CHATBOT_URL || "http://localhost:8000";
      const wsUrl = `${toWebSocketUrl(chatbotUrl)}/voice/stream`;
      const ws = await connectWebSocket(wsUrl);

      if (!mountedRef.current || !desiredActiveRef.current) {
        logVoiceUi("capture_aborted_after_socket_open");
        ws.close();
        finalizeSession("aborted_before_start");
        return;
      }

      wsRef.current = ws;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: SAMPLE_RATE,
        },
      });

      if (!mountedRef.current || !desiredActiveRef.current) {
        logVoiceUi("capture_aborted_after_media");
        stream.getTracks().forEach((track) => track.stop());
        finalizeSession("aborted_before_start");
        return;
      }

      streamRef.current = stream;

      const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
      ctxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      const mimeType = pickMimeType();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recRef.current = rec;
      logVoiceUi("recorder_created", rec.mimeType || mimeType || "audio/webm");

      let finalReceived = false;
      liveTranscriptRef.current = "";

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);

          if (payload?.type === "partial_transcript") {
            const snapshot = (payload.snapshot || "").trim();
            const delta = (payload.delta || "").trim();

            if (snapshot) {
              liveTranscriptRef.current = snapshot;
            } else if (delta) {
              liveTranscriptRef.current = appendDelta(liveTranscriptRef.current, delta);
            }

            onPartialTranscript?.(liveTranscriptRef.current);
            return;
          }

          if (payload?.type === "final_transcript") {
            finalReceived = true;
            const text = (payload.transcript || "").trim();
            if (text) {
              onTranscript?.(text);
            } else {
              resolveTerminal("error", "Could not transcribe. Please try again.");
              return;
            }
            resolveTerminal("final_transcript");
            return;
          }

          if (payload?.type === "no_speech") {
            finalReceived = true;
            resolveTerminal("no_speech", "Could not transcribe. Please try again.");
            return;
          }

          if (payload?.type === "timeout") {
            finalReceived = true;
            resolveTerminal("timeout", payload.message || "Transcription timed out. Please try again.");
            return;
          }

          if (payload?.type === "error") {
            finalReceived = true;
            resolveTerminal("error", payload.message || "Transcription failed");
            return;
          }

          if (
            payload?.type === "ready" ||
            payload?.type === "recording_started" ||
            payload?.type === "progress" ||
            payload?.type === "pong"
          ) {
            return;
          }

          logVoiceUi("unexpected_message_type", payload?.type ?? "unknown");
        } catch {
          // Ignore non-JSON websocket messages.
        }
      };

      ws.onerror = () => {
        logVoiceUi("websocket_error_runtime", { phase: phaseRef.current });
      };

      ws.onclose = () => {
        logVoiceUi("websocket_close_runtime", {
          phase: phaseRef.current,
          terminalResolved: terminalResolvedRef.current,
          finalReceived,
        });
        wsRef.current = null;
        if (
          mountedRef.current &&
          !terminalResolvedRef.current &&
          phaseRef.current === SESSION_PHASE.WAITING_FINAL
        ) {
          resolveTerminal("close_before_terminal", "Voice transcription connection closed before final result");
        }
      };

      const startPayload = {
        type: "start",
        session_id: getChatSessionId(),
        utterance_id: crypto.randomUUID(),
        mime_type: rec.mimeType || mimeType || "audio/webm",
      };

      logVoiceUi("sending_start", {
        readyState: ws.readyState,
        mimeType: startPayload.mime_type,
        utteranceId: startPayload.utterance_id,
      });
      ws.send(JSON.stringify(startPayload));

      rec.ondataavailable = async (event) => {
        if (!event.data || event.data.size === 0) return;
        if (phaseRef.current === SESSION_PHASE.IDLE) {
          logVoiceUi("dropping_chunk_after_idle", { size: event.data.size });
          return;
        }

        const sendPromise = (async () => {
          const socket = wsRef.current;
          if (!socket || socket.readyState !== WebSocket.OPEN) {
            logVoiceUi("dropping_chunk_socket_not_open", {
              size: event.data.size,
              phase: phaseRef.current,
              readyState: socket?.readyState ?? "none",
            });
            return;
          }

          const bytes = await event.data.arrayBuffer();
          const activeSocket = wsRef.current;
          if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN) {
            logVoiceUi("dropping_chunk_after_buffer", {
              size: bytes.byteLength,
              phase: phaseRef.current,
              readyState: activeSocket?.readyState ?? "none",
            });
            return;
          }

          logVoiceUi("sending_chunk", {
            size: bytes.byteLength,
            phase: phaseRef.current,
            readyState: activeSocket.readyState,
          });
          activeSocket.send(bytes);
          touchStreamingActivity("chunk_sent");
        })();

        pendingChunkSendsRef.current.add(sendPromise);
        try {
          await sendPromise;
        } finally {
          pendingChunkSendsRef.current.delete(sendPromise);
        }
      };

      rec.onstop = async () => {
        logVoiceUi("recorder_onstop_fired", { phase: phaseRef.current });
        if (phaseRef.current !== SESSION_PHASE.STOPPING) {
          return;
        }

        await waitForPendingChunkSends();

        const socket = wsRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN) {
          resolveTerminal("error", "Voice transcription connection is not open");
          return;
        }

        clearInitialSpeechTimeout();
        clearStreamingInactivityTimeout();
        setPhase(SESSION_PHASE.WAITING_FINAL);
        const stopPayload = {
          type: "stop",
          reason: stopReasonRef.current,
          speech_stats: getSpeechStats(),
        };
        socket.send(JSON.stringify(stopPayload));
        logVoiceUi("sending_websocket_stop", { readyState: socket.readyState, ...stopPayload });

        postStopFinalizationTimeoutRef.current = window.setTimeout(() => {
          if (!terminalResolvedRef.current) {
            logVoiceUi("post_stop_finalization_timeout");
            resolveTerminal("timeout", "Transcription timed out while finalizing.");
          }
        }, POST_STOP_FINALIZATION_TIMEOUT_MS);
      };

      rec.start(CHUNK_MS);
      recordingStartedAtRef.current = Date.now();
      setPhase(SESSION_PHASE.RECORDING);
      logVoiceUi("recorder_started", {
        chunkMs: CHUNK_MS,
        mimeType: rec.mimeType || mimeType || "audio/webm",
      });
      onListeningChange?.(true);
      onProcessingChange?.(false);
      emitVoiceState("listening");
      armInitialSpeechTimeout();
      touchStreamingActivity("recording_started");

      const buffer = new Uint8Array(analyser.fftSize);
      let silenceStart = null;

      function tick() {
        if (phaseRef.current !== SESSION_PHASE.RECORDING || rec.state !== "recording") return;

        analyser.getByteTimeDomainData(buffer);
        const rms = Math.sqrt(buffer.reduce((sum, value) => sum + (value - 128) ** 2, 0) / buffer.length);
        const now = Date.now();

        if (rms > SILENCE_THRESHOLD) {
          if (!speechDetectedRef.current) {
            speechDetectedRef.current = true;
            logVoiceUi("speech_threshold_crossed", { rms });
          }
          if (lastVoicedTickAtRef.current) {
            voicedDurationMsRef.current += Math.min(
              now - lastVoicedTickAtRef.current,
              MAX_VOICED_FRAME_MS,
            );
          } else {
            voicedDurationMsRef.current += Math.min(CHUNK_MS, MAX_VOICED_FRAME_MS);
          }
          lastVoicedTickAtRef.current = now;
          if (
            !speechConfirmedRef.current &&
            voicedDurationMsRef.current >= CONFIRMED_SPEECH_MS
          ) {
            speechConfirmedRef.current = true;
            clearInitialSpeechTimeout();
            logVoiceUi("speech_confirmed", { speechStats: getSpeechStats() });
          }
          silenceStart = null;
          touchStreamingActivity("speech_detected");
        } else {
          lastVoicedTickAtRef.current = null;
          if (!speechConfirmedRef.current) {
            rafRef.current = requestAnimationFrame(tick);
            return;
          }
          if (!silenceStart) {
            silenceStart = now;
          } else if (now - silenceStart > SILENCE_DURATION) {
            const speechStats = getSpeechStats();
            const autoStopEligible =
              speechStats.voiced_duration_ms >= MIN_VOICED_DURATION_MS &&
              speechStats.recording_duration_ms >= MIN_RECORDING_DURATION_MS;
            if (!autoStopEligible) {
              logVoiceUi("silence_stop_deferred", { speechStats });
              rafRef.current = requestAnimationFrame(tick);
              return;
            }
            logVoiceUi("silence_stop_triggered", { speechStats });
            requestStop("silence_detected");
            return;
          }
        }

        rafRef.current = requestAnimationFrame(tick);
      }

      rafRef.current = requestAnimationFrame(tick);

      if (!desiredActiveRef.current) {
        requestStop("active_false_after_start");
      }
    } catch (error) {
      emitVoiceState("error");
      onError?.(error.message || "Microphone access denied");
      finalizeSession("capture_error");
    }
  }

  function connectWebSocket(url) {
    return new Promise((resolve, reject) => {
      logVoiceUi("websocket_created", url);
      const ws = new WebSocket(url);
      ws.onopen = () => {
        logVoiceUi("websocket_open");
        resolve(ws);
      };
      ws.onerror = () => {
        logVoiceUi("websocket_error_connect");
        reject(new Error("Could not open voice websocket"));
      };
    });
  }

  useEffect(() => {
    mountedRef.current = true;
    onSessionBusyChange?.(false);
    logVoiceUi("mounted");

    return () => {
      mountedRef.current = false;
      logVoiceUi("unmounted");
      finalizeSession("unmount");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    desiredActiveRef.current = active;

    if (active) {
      if (phaseRef.current === SESSION_PHASE.IDLE) {
        capture();
      }
      return;
    }

    if (phaseRef.current === SESSION_PHASE.CONNECTING || phaseRef.current === SESSION_PHASE.RECORDING) {
      requestStop("active_false");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return null;
}

function appendDelta(base, delta) {
  if (!base) return delta;
  if (!delta) return base;
  if (base.endsWith(" ")) return `${base}${delta}`;
  if ([",", ".", "!", "?", ":", ";"].some((punctuation) => delta.startsWith(punctuation))) {
    return `${base}${delta}`;
  }
  return `${base} ${delta}`;
}
