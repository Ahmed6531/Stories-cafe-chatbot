import { useEffect, useRef } from "react";

const SILENCE_THRESHOLD = 6;
const CONFIRMED_SPEECH_MS = 300;
const MIN_VOICED_MS = 300;
const MIN_RECORDING_MS = 1000;
const SILENCE_DURATION = 2000;
const MAX_VOICED_FRAME_MS = 80;
const INITIAL_SPEECH_TIMEOUT_MS = 5000;
const INACTIVITY_TIMEOUT_MS = 6000;
const FINALIZATION_TIMEOUT_MS = 15000;
const TIMESLICE_MS = 60;
const MIME = "audio/webm;codecs=opus";
const BITS = 128000;
const PHASE = {
  IDLE: "idle",
  CONNECTING: "connecting",
  RECORDING: "recording",
  STOPPING: "stopping",
  WAITING_FINAL: "waiting_final",
};

function getSessionId() {
  let id = sessionStorage.getItem("chatSessionId");
  if (!id) { id = crypto.randomUUID(); sessionStorage.setItem("chatSessionId", id); }
  return id;
}

function toWsUrl(url) {
  const s = (url || "").replace(/\/$/, "");
  return s.startsWith("https://") ? s.replace("https://", "wss://") : s.replace("http://", "ws://");
}

export default function VoiceInput({ active, onEvent }) {
  const mountedRef    = useRef(false);
  const desiredRef    = useRef(active);
  const phaseRef      = useRef(PHASE.IDLE);
  const streamRef     = useRef(null);
  const ctxRef        = useRef(null);
  const recRef        = useRef(null);
  const wsRef         = useRef(null);
  const analyserRef   = useRef(null);
  const rafRef        = useRef(null);
  const chunksRef     = useRef(new Set());
  const timers        = useRef({});
  const speechRef     = useRef(false);
  const confirmedRef  = useRef(false);
  const lastVoicedRef = useRef(null);
  const voicedMsRef   = useRef(0);
  const recStartRef   = useRef(null);
  const stopReasonRef = useRef("unknown");
  const terminalRef   = useRef(false);

  const setTimer = (key, fn, ms) => { window.clearTimeout(timers.current[key]); timers.current[key] = window.setTimeout(fn, ms); };
  const clearTimer = (key) => { window.clearTimeout(timers.current[key]); delete timers.current[key]; };
  const clearAllTimers = () => Object.keys(timers.current).forEach(clearTimer);

  function setPhase(next) {
    if (phaseRef.current === next) return;
    phaseRef.current = next;
    onEvent?.({ type: "busy", busy: next !== PHASE.IDLE });
  }

  function emitState(state) { onEvent?.({ type: "state", state }); }

  function releaseResources() {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    ctxRef.current?.close().catch(() => {});
    wsRef.current?.close();
    streamRef.current = ctxRef.current = analyserRef.current = recRef.current = wsRef.current = null;
    chunksRef.current = new Set();
    speechRef.current = confirmedRef.current = false;
    lastVoicedRef.current = null;
    voicedMsRef.current = 0;
    recStartRef.current = null;
    stopReasonRef.current = "unknown";
    terminalRef.current = false;
  }

  function finalizeSession(clearPartials = true) {
    clearAllTimers();
    if (clearPartials) onEvent?.({ type: "partial", confirmed: "", interim: "" });
    setPhase(PHASE.IDLE);
    releaseResources();
  }

  function resolveTerminal(kind, message = "") {
    if (terminalRef.current) return;
    terminalRef.current = true;
    clearAllTimers();
    if (kind === "error" || kind === "timeout" || kind === "close_before_terminal") {
      emitState(kind === "timeout" ? "timed-out" : "error");
      onEvent?.({ type: "error", kind: kind === "timeout" ? "timeout" : "error", message });
      finalizeSession();
    } else if (kind === "no_speech") {
      emitState("no-speech");
      onEvent?.({ type: "error", kind: "no_speech", message: message || "Could not transcribe. Please try again." });
      finalizeSession();
    } else {
      finalizeSession(false);
    }
  }

  async function waitChunks() {
    while (chunksRef.current.size > 0) await Promise.allSettled(Array.from(chunksRef.current));
  }

  function requestStop(reason) {
    if (phaseRef.current !== PHASE.RECORDING) return;
    stopReasonRef.current = reason;
    setPhase(PHASE.STOPPING);
    emitState("finalizing");
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (recRef.current?.state === "recording") recRef.current.stop();
  }

  function connectWs(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.onopen = () => resolve(ws);
      ws.onerror = () => reject(new Error("Could not open voice WebSocket"));
    });
  }

  async function capture() {
    if (phaseRef.current !== PHASE.IDLE) return;

    if (!MediaRecorder.isTypeSupported(MIME)) {
      emitState("error");
      onEvent?.({ type: "error", kind: "error", message: `Browser does not support ${MIME}` });
      return;
    }

    setPhase(PHASE.CONNECTING);
    emitState("connecting");
    terminalRef.current = false;
    chunksRef.current = new Set();

    try {
      const base = import.meta.env.VITE_CHATBOT_URL || "http://localhost:8000";
      const ws = await connectWs(`${toWsUrl(base)}/voice/stream`);
      if (!mountedRef.current || !desiredRef.current) { ws.close(); finalizeSession(); return; }
      wsRef.current = ws;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (!mountedRef.current || !desiredRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        finalizeSession();
        return;
      }

      streamRef.current = stream;
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyserRef.current = analyser;
      ctx.createMediaStreamSource(stream).connect(analyser);

      const rec = new MediaRecorder(stream, { mimeType: MIME, audioBitsPerSecond: BITS });
      recRef.current = rec;

      ws.onmessage = (evt) => {
        try {
          const p = JSON.parse(evt.data);
          if (p?.type === "partial") {
            onEvent?.({ type: "partial", confirmed: (p.confirmed || "").trim(), interim: (p.interim || "").trim() });
            return;
          }
          if (p?.type === "final") {
            const text = (p.text || "").trim();
            if (!text) { resolveTerminal("error", "Could not transcribe."); return; }
            onEvent?.({ type: "final", text });
            resolveTerminal("final");
            return;
          }
          if (p?.type === "no_speech") { resolveTerminal("no_speech"); return; }
          if (p?.type === "error") {
            resolveTerminal(p.kind === "timeout" ? "timeout" : "error", p.message || "Transcription failed");
          }
        } catch {} // eslint-disable-line no-empty
      };

      ws.onerror = () => {};
      ws.onclose = () => {
        wsRef.current = null;
        if (mountedRef.current && !terminalRef.current && phaseRef.current === PHASE.WAITING_FINAL) {
          resolveTerminal("close_before_terminal", "Connection closed before final result");
        }
      };

      rec.ondataavailable = (evt) => {
        if (!evt.data?.size || phaseRef.current === PHASE.IDLE) return;
        const p = (async () => {
          if (wsRef.current?.readyState !== WebSocket.OPEN) return;
          const bytes = await evt.data.arrayBuffer();
          if (wsRef.current?.readyState !== WebSocket.OPEN) return;
          wsRef.current.send(bytes);
          setTimer("inactivity", () => { if (!terminalRef.current) resolveTerminal("timeout", "Voice recording timed out."); }, INACTIVITY_TIMEOUT_MS);
        })();
        chunksRef.current.add(p);
        p.finally(() => chunksRef.current.delete(p));
      };

      rec.onstop = async () => {
        if (phaseRef.current !== PHASE.STOPPING) return;
        await waitChunks();
        const sock = wsRef.current;
        if (!sock || sock.readyState !== WebSocket.OPEN) { resolveTerminal("error", "Connection not open"); return; }
        clearTimer("initial");
        clearTimer("inactivity");
        setPhase(PHASE.WAITING_FINAL);
        sock.send(JSON.stringify({ type: "stop", reason: stopReasonRef.current }));
        setTimer("finalization", () => { if (!terminalRef.current) resolveTerminal("timeout", "Transcription timed out."); }, FINALIZATION_TIMEOUT_MS);
      };

      ws.send(JSON.stringify({ type: "start", session_id: getSessionId(), utterance_id: crypto.randomUUID(), mime_type: rec.mimeType }));
      rec.start(TIMESLICE_MS);
      recStartRef.current = Date.now();
      setPhase(PHASE.RECORDING);
      emitState("listening");
      setTimer("initial", () => { if (!speechRef.current && !terminalRef.current) requestStop("initial_speech_timeout"); }, INITIAL_SPEECH_TIMEOUT_MS);
      setTimer("inactivity", () => { if (!terminalRef.current) resolveTerminal("timeout", "Voice recording timed out."); }, INACTIVITY_TIMEOUT_MS);

      const buf = new Uint8Array(analyser.fftSize);
      let silenceStart = null;

      function silenceTick() {
        if (phaseRef.current !== PHASE.RECORDING || rec.state !== "recording") return;
        analyser.getByteTimeDomainData(buf);
        const rms = Math.sqrt(buf.reduce((s, v) => s + (v - 128) ** 2, 0) / buf.length);
        const now = Date.now();
        if (rms > SILENCE_THRESHOLD) {
          speechRef.current = true;
          voicedMsRef.current += lastVoicedRef.current
            ? Math.min(now - lastVoicedRef.current, MAX_VOICED_FRAME_MS)
            : Math.min(TIMESLICE_MS, MAX_VOICED_FRAME_MS);
          lastVoicedRef.current = now;
          if (!confirmedRef.current && voicedMsRef.current >= CONFIRMED_SPEECH_MS) {
            confirmedRef.current = true;
            clearTimer("initial");
          }
          silenceStart = null;
        } else {
          lastVoicedRef.current = null;
          if (!confirmedRef.current) { rafRef.current = requestAnimationFrame(silenceTick); return; }
          if (!silenceStart) silenceStart = now;
          else if (now - silenceStart > SILENCE_DURATION) {
            const recMs = recStartRef.current ? now - recStartRef.current : 0;
            if (voicedMsRef.current >= MIN_VOICED_MS && recMs >= MIN_RECORDING_MS) { requestStop("silence_detected"); return; }
          }
        }
        rafRef.current = requestAnimationFrame(silenceTick);
      }

      rafRef.current = requestAnimationFrame(silenceTick);
      if (!desiredRef.current) requestStop("active_false_after_start");
    } catch (error) {
      emitState("error");
      onEvent?.({ type: "error", kind: "error", message: error.message || "Microphone access denied" });
      finalizeSession();
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    onEvent?.({ type: "busy", busy: false });
    return () => { mountedRef.current = false; finalizeSession(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    desiredRef.current = active;
    if (active && phaseRef.current === PHASE.IDLE) { capture(); return; }
    if (!active && (phaseRef.current === PHASE.CONNECTING || phaseRef.current === PHASE.RECORDING)) {
      requestStop("active_false");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return null;
}
