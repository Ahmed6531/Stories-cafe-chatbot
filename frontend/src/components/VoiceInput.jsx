import { useEffect, useRef } from "react";

const SILENCE_THRESHOLD = 6;
const CONFIRMED_SPEECH_MS = 300;
const MIN_VOICED_DURATION_MS = 300;
const MIN_RECORDING_DURATION_MS = 1000;
const SILENCE_DURATION = 2000;
const MAX_VOICED_FRAME_MS = 80;
const SAMPLE_RATE = 16000;
const CHUNK_MS = 90;
const PCM_CHUNK_SAMPLES = Math.max(1, Math.round((SAMPLE_RATE * CHUNK_MS) / 1000));
const PCM_WORKLET_NAME = "pcm-chunk-capture";
const PCM_PROCESSOR_BUFFER_SIZE = 2048;
const PCM_WORKLET_FLUSH_TIMEOUT_MS = 500;
const INITIAL_SPEECH_TIMEOUT_MS = 5000;
const STREAMING_INACTIVITY_TIMEOUT_MS = 6000;
const POST_STOP_FINALIZATION_TIMEOUT_MS = 15000;
const PCM_WORKLET_MODULE_URL = new URL("../audio/pcm-capture.worklet.js", import.meta.url);

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

function isBusyPhase(phase) {
  return phase !== SESSION_PHASE.IDLE;
}

export default function VoiceInput({
  active,
  onEvent,
  sourceName = "unknown",
}) {
  const mountedRef = useRef(false);
  const desiredActiveRef = useRef(active);
  const phaseRef = useRef(SESSION_PHASE.IDLE);
  const streamRef = useRef(null);
  const ctxRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const processorNodeRef = useRef(null);
  const monitorNodeRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const wsRef = useRef(null);
  const initialSpeechTimeoutRef = useRef(null);
  const streamingInactivityTimeoutRef = useRef(null);
  const postStopFinalizationTimeoutRef = useRef(null);
  const liveTranscriptRef = useRef("");
  const pcmBufferRef = useRef(new Int16Array(0));
  const instanceId = useRef(Math.random().toString(36).slice(2, 8));
  const captureModeRef = useRef("idle");
  const pendingWorkletFlushRef = useRef(null);
  const workletFlushRequestIdRef = useRef(0);
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
    onEvent?.({ type: "state", state });
  }

  function setPhase(nextPhase) {
    const previousPhase = phaseRef.current;
    if (previousPhase === nextPhase) return;
    phaseRef.current = nextPhase;
    logVoiceUi("phase_change", { from: previousPhase, to: nextPhase });
    onEvent?.({ type: "busy", busy: isBusyPhase(nextPhase) });
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

  function stopAudioCapture() {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (pendingWorkletFlushRef.current) {
      window.clearTimeout(pendingWorkletFlushRef.current.timeoutId);
      pendingWorkletFlushRef.current.resolve(false);
      pendingWorkletFlushRef.current = null;
    }

    if (processorNodeRef.current) {
      if (processorNodeRef.current.port) {
        processorNodeRef.current.port.onmessage = null;
      }
      processorNodeRef.current.onaudioprocess = null;
      processorNodeRef.current.disconnect();
      processorNodeRef.current = null;
    }

    sourceNodeRef.current?.disconnect();
    sourceNodeRef.current = null;

    monitorNodeRef.current?.disconnect();
    monitorNodeRef.current = null;

    analyserRef.current = null;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    const audioContext = ctxRef.current;
    ctxRef.current = null;
    captureModeRef.current = "idle";
    if (audioContext) {
      void audioContext.close().catch(() => {});
    }
  }

  function releaseResources() {
    stopAudioCapture();
    wsRef.current?.close();

    wsRef.current = null;
    pcmBufferRef.current = new Int16Array(0);
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
      onEvent?.({ type: "partial", text: "" });
    } else {
      liveTranscriptRef.current = "";
    }
    setPhase(SESSION_PHASE.IDLE);
    releaseResources();
  }

  function sendPcmChunk(samples) {
    if (!samples.length) return;

    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      logVoiceUi("dropping_chunk_socket_not_open", {
        samples: samples.length,
        phase: phaseRef.current,
        readyState: socket?.readyState ?? "none",
      });
      return;
    }

    const chunkBytes = samples.buffer.slice(samples.byteOffset, samples.byteOffset + samples.byteLength);
    logVoiceUi("sending_chunk", {
      samples: samples.length,
      size: chunkBytes.byteLength,
      phase: phaseRef.current,
      readyState: socket.readyState,
    });
    socket.send(chunkBytes);
    touchStreamingActivity("chunk_sent");
  }

  function flushPcmBuffer({ force = false } = {}) {
    let buffer = pcmBufferRef.current;

    while (buffer.length >= PCM_CHUNK_SAMPLES || (force && buffer.length > 0)) {
      const chunkSampleCount = force && buffer.length < PCM_CHUNK_SAMPLES
        ? buffer.length
        : PCM_CHUNK_SAMPLES;
      const chunk = buffer.slice(0, chunkSampleCount);
      buffer = buffer.slice(chunkSampleCount);
      sendPcmChunk(chunk);
    }

    pcmBufferRef.current = buffer;
  }

  function pushPcmSamples(floatSamples, inputSampleRate) {
    if (!floatSamples?.length) return;

    const downsampled = downsampleFloat32Buffer(floatSamples, inputSampleRate, SAMPLE_RATE);
    if (!downsampled.length) return;

    const pcmSamples = float32ToInt16(downsampled);
    pcmBufferRef.current = appendInt16Buffer(pcmBufferRef.current, pcmSamples);
    flushPcmBuffer();
  }

  async function finalizeStreamingStop() {
    logVoiceUi("processor_stop_fired", { phase: phaseRef.current });
    if (phaseRef.current !== SESSION_PHASE.STOPPING) {
      return;
    }

    await flushCaptureProcessor();
    stopAudioCapture();
    flushPcmBuffer({ force: true });

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
  }

  function handleWorkletMessage(event, inputSampleRate) {
    const payload = event.data;
    if (!payload || typeof payload !== "object") return;

    if (payload.type === "chunk") {
      pushPcmSamples(payload.samples, inputSampleRate);
      return;
    }

    if (payload.type === "flush_complete" && pendingWorkletFlushRef.current) {
      const pendingFlush = pendingWorkletFlushRef.current;
      if (pendingFlush.requestId === payload.requestId) {
        window.clearTimeout(pendingFlush.timeoutId);
        pendingWorkletFlushRef.current = null;
        pendingFlush.resolve(true);
      }
    }
  }

  async function flushCaptureProcessor() {
    if (captureModeRef.current !== "worklet") {
      return false;
    }

    const node = processorNodeRef.current;
    if (!node?.port) {
      return false;
    }

    if (pendingWorkletFlushRef.current) {
      return pendingWorkletFlushRef.current.promise;
    }

    const requestId = workletFlushRequestIdRef.current + 1;
    workletFlushRequestIdRef.current = requestId;

    const promise = new Promise((resolve) => {
      const timeoutId = window.setTimeout(() => {
        if (pendingWorkletFlushRef.current?.requestId === requestId) {
          pendingWorkletFlushRef.current = null;
          resolve(false);
        }
      }, PCM_WORKLET_FLUSH_TIMEOUT_MS);

      pendingWorkletFlushRef.current = {
        requestId,
        resolve,
        timeoutId,
        promise: null,
      };
    });

    pendingWorkletFlushRef.current.promise = promise;
    node.port.postMessage({ type: "flush", requestId });
    return promise;
  }

  function setupScriptProcessorCapture(ctx, source, monitor) {
    const processor = ctx.createScriptProcessor(PCM_PROCESSOR_BUFFER_SIZE, 1, 1);
    processorNodeRef.current = processor;
    captureModeRef.current = "script";
    source.connect(processor);
    processor.connect(monitor);
    processor.onaudioprocess = (event) => {
      if (phaseRef.current !== SESSION_PHASE.RECORDING) return;

      const channelData = event.inputBuffer.getChannelData(0);
      if (!channelData || channelData.length === 0) return;

      pushPcmSamples(channelData, event.inputBuffer.sampleRate);
    };

    logVoiceUi("capture_processor_ready", {
      mode: "script",
      inputSampleRate: ctx.sampleRate,
      targetSampleRate: SAMPLE_RATE,
      processorBufferSize: PCM_PROCESSOR_BUFFER_SIZE,
      chunkSamples: PCM_CHUNK_SAMPLES,
    });
  }

  async function setupAudioProcessor(ctx, source, monitor) {
    if (ctx.audioWorklet && typeof AudioWorkletNode !== "undefined") {
      try {
        await ctx.audioWorklet.addModule(PCM_WORKLET_MODULE_URL);
        const workletNode = new AudioWorkletNode(ctx, PCM_WORKLET_NAME, {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [1],
          processorOptions: {
            chunkFrames: Math.max(1, Math.round((ctx.sampleRate * CHUNK_MS) / 1000)),
          },
        });
        workletNode.port.onmessage = (event) => handleWorkletMessage(event, ctx.sampleRate);
        processorNodeRef.current = workletNode;
        captureModeRef.current = "worklet";
        source.connect(workletNode);
        workletNode.connect(monitor);

        logVoiceUi("capture_processor_ready", {
          mode: "worklet",
          inputSampleRate: ctx.sampleRate,
          targetSampleRate: SAMPLE_RATE,
          chunkSamples: Math.max(1, Math.round((ctx.sampleRate * CHUNK_MS) / 1000)),
        });
        return;
      } catch (error) {
        logVoiceUi("audio_worklet_unavailable", error?.message || "unknown");
      }
    }

    setupScriptProcessorCapture(ctx, source, monitor);
  }

  function requestStop(reason) {
    const phase = phaseRef.current;
    stopReasonRef.current = reason;
    logVoiceUi("request_stop", { reason, phase, speechStats: getSpeechStats() });

    if (phase === SESSION_PHASE.RECORDING) {
      setPhase(SESSION_PHASE.STOPPING);
      emitVoiceState("finalizing");
      void finalizeStreamingStop();
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
      onEvent?.({
        type: "error",
        kind: kind === "timeout" ? "timeout" : "error",
        message,
      });
      finalizeSession(kind);
      return;
    }

    if (kind === "no_speech") {
      emitVoiceState("no-speech");
      onEvent?.({
        type: "error",
        kind: "no_speech",
        message: message || "Could not transcribe. Please try again.",
      });
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
    pcmBufferRef.current = new Int16Array(0);
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
        },
      });

      if (!mountedRef.current || !desiredActiveRef.current) {
        logVoiceUi("capture_aborted_after_media");
        stream.getTracks().forEach((track) => track.stop());
        finalizeSession("aborted_before_start");
        return;
      }

      streamRef.current = stream;

      const ctx = new AudioContext({ sampleRate: SAMPLE_RATE, latencyHint: "interactive" });
      ctxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      sourceNodeRef.current = source;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyserRef.current = analyser;
      source.connect(analyser);

      const monitor = ctx.createGain();
      monitor.gain.value = 0;
      monitorNodeRef.current = monitor;
      monitor.connect(ctx.destination);
      await setupAudioProcessor(ctx, source, monitor);

      let finalReceived = false;
      liveTranscriptRef.current = "";

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);

          if (payload?.type === "partial") {
            const snapshot = (payload.snapshot || "").trim();
            const delta = (payload.delta || "").trim();

            if (snapshot) {
              liveTranscriptRef.current = snapshot;
            } else if (delta) {
              liveTranscriptRef.current = appendDelta(liveTranscriptRef.current, delta);
            }

            onEvent?.({ type: "partial", text: liveTranscriptRef.current });
            return;
          }

          if (payload?.type === "final") {
            finalReceived = true;
            const text = (payload.transcript || "").trim();
            if (text) {
              onEvent?.({ type: "final", text });
            } else {
              resolveTerminal("error", "Could not transcribe. Please try again.");
              return;
            }
            resolveTerminal("final");
            return;
          }

          if (payload?.type === "no_speech") {
            finalReceived = true;
            resolveTerminal("no_speech", "Could not transcribe. Please try again.");
            return;
          }

          if (payload?.type === "error") {
            finalReceived = true;
            resolveTerminal(payload.kind === "timeout" ? "timeout" : "error", payload.message || "Transcription failed");
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
        audio_format: "linear16",
        sample_rate_hertz: SAMPLE_RATE,
      };

      logVoiceUi("sending_start", {
        readyState: ws.readyState,
        audioFormat: startPayload.audio_format,
        sampleRateHertz: startPayload.sample_rate_hertz,
        utteranceId: startPayload.utterance_id,
      });
      ws.send(JSON.stringify(startPayload));

      recordingStartedAtRef.current = Date.now();
      setPhase(SESSION_PHASE.RECORDING);
      logVoiceUi("pcm_capture_started", {
        mode: captureModeRef.current,
        chunkMs: CHUNK_MS,
        inputSampleRate: ctx.sampleRate,
        targetSampleRate: SAMPLE_RATE,
      });
      emitVoiceState("listening");
      armInitialSpeechTimeout();
      touchStreamingActivity("recording_started");

      const buffer = new Uint8Array(analyser.fftSize);
      let silenceStart = null;

      function tick() {
        if (phaseRef.current !== SESSION_PHASE.RECORDING || !processorNodeRef.current) return;

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
      onEvent?.({
        type: "error",
        kind: "error",
        message: error.message || "Microphone access denied",
      });
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
    onEvent?.({ type: "busy", busy: false });
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

function appendInt16Buffer(base, addition) {
  if (!base.length) return addition;
  if (!addition.length) return base;

  const merged = new Int16Array(base.length + addition.length);
  merged.set(base, 0);
  merged.set(addition, base.length);
  return merged;
}

function downsampleFloat32Buffer(buffer, inputSampleRate, outputSampleRate) {
  if (!buffer.length) return new Float32Array(0);
  if (inputSampleRate === outputSampleRate || inputSampleRate < outputSampleRate) {
    return buffer.slice();
  }

  const sampleRateRatio = inputSampleRate / outputSampleRate;
  const newLength = Math.max(1, Math.round(buffer.length / sampleRateRatio));
  const result = new Float32Array(newLength);
  let offsetBuffer = 0;

  for (let index = 0; index < newLength; index += 1) {
    const nextOffsetBuffer = Math.min(
      buffer.length,
      Math.round((index + 1) * sampleRateRatio),
    );

    let sum = 0;
    let count = 0;
    for (let sampleIndex = offsetBuffer; sampleIndex < nextOffsetBuffer; sampleIndex += 1) {
      sum += buffer[sampleIndex];
      count += 1;
    }

    result[index] = count > 0
      ? sum / count
      : buffer[Math.min(offsetBuffer, buffer.length - 1)] ?? 0;
    offsetBuffer = nextOffsetBuffer;
  }

  return result;
}

function float32ToInt16(buffer) {
  const result = new Int16Array(buffer.length);

  for (let index = 0; index < buffer.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, buffer[index]));
    result[index] = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff);
  }

  return result;
}
