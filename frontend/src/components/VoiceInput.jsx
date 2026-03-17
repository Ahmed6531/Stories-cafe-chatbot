import { useEffect, useRef } from "react";
import axios from "axios";

// ─── Tuning ───────────────────────────────────────────────────────────────────
// THRESHOLD : raise if background noise falsely triggers; lower for quiet speakers (range 5–20)
// DURATION  : raise if pauses mid-order cut speech early; 1400ms is snappy for short orders
// MIN_MS    : clips shorter than this are noise/coughs and get dropped
const SILENCE_THRESHOLD = 12;
const SILENCE_DURATION  = 2200; // ms
const MIN_SPEECH_MS     = 350;  // ms
const SAMPLE_RATE       = 16000; // Whisper is trained on 16 kHz mono
// ─────────────────────────────────────────────────────────────────────────────

/** Encode a Float32Array of PCM samples to a WAV Blob. */
function encodeWav(samples, sampleRate) {
  const bps = 2; // bytes per sample (16-bit)
  const buf  = new ArrayBuffer(44 + samples.length * bps);
  const view = new DataView(buf);
  const str  = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };

  str(0,  'RIFF');
  view.setUint32( 4, 36 + samples.length * bps,  true);
  str(8,  'WAVE');
  str(12, 'fmt ');
  view.setUint32(16, 16,          true); // PCM chunk size
  view.setUint16(20,  1,          true); // PCM format
  view.setUint16(22,  1,          true); // mono
  view.setUint32(24, sampleRate,  true);
  view.setUint32(28, sampleRate * bps, true);
  view.setUint16(32, bps,         true);
  view.setUint16(34, 16,          true); // 16-bit depth
  str(36, 'data');
  view.setUint32(40, samples.length * bps, true);

  let off = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    off += bps;
  }
  return new Blob([view], { type: 'audio/wav' });
}

function pickMimeType() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg'];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
}

export default function VoiceInput({ active, onTranscript, onListeningChange, onProcessingChange, onError }) {
  const stopped    = useRef(false);
  const streamRef  = useRef(null);
  const ctxRef     = useRef(null);
  const recRef     = useRef(null);
  const rafRef     = useRef(null);
  const maxTimerRef = useRef(null);

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
      const ctx      = new AudioContext({ sampleRate: SAMPLE_RATE });
      ctxRef.current = ctx;
      const source   = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      // MediaRecorder collects the raw compressed chunks (used only for timing/data)
      const mimeType = pickMimeType();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recRef.current = rec;
      const chunks  = [];
      let speechStart = null;

      rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      rec.onstop = async () => {
        if (stopped.current) return;

        const speechMs = speechStart ? Date.now() - speechStart : 0;
        if (speechMs < MIN_SPEECH_MS) { onProcessingChange?.(false); return; }

        const raw = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });

        // Decode recorded audio → PCM → re-encode as 16 kHz mono WAV.
        // AudioContext({ sampleRate: 16000 }) resamples to Whisper's native rate,
        // eliminating the lossy-codec artefacts that hurt consonant accuracy.
        try {
          const tempCtx  = new AudioContext({ sampleRate: SAMPLE_RATE });
          const arrayBuf = await raw.arrayBuffer();
          const audioBuf = await tempCtx.decodeAudioData(arrayBuf);
          await tempCtx.close();
          const wav = encodeWav(audioBuf.getChannelData(0), SAMPLE_RATE);
          await transcribe(wav, 'audio/wav');
        } catch {
          // Decode failed — fall back to sending the compressed blob as-is
          await transcribe(raw, rec.mimeType);
        }
      };

      rec.start();
      onListeningChange?.(true);

      // Hard cap — mic always stops after 15 s regardless of silence detection
      maxTimerRef.current = setTimeout(() => {
        if (rec.state === 'recording') {
          onListeningChange?.(false);
          onProcessingChange?.(true);
          rec.stop();
        }
      }, 15000);

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
            if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
            onListeningChange?.(false);
            onProcessingChange?.(true);
            rec.stop(); // triggers onstop → WAV encode → transcribe
            return;
          }
        }

        rafRef.current = requestAnimationFrame(tick);
      }

      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      onError?.(err.message || 'Microphone access denied');
    }
  }

  async function transcribe(blob, mimeType) {
    try {
      const ext = (mimeType || '').includes('wav') ? 'wav'
                : (mimeType || '').includes('ogg') ? 'ogg' : 'webm';
      const formData = new FormData();
      formData.append('audio', blob, `speech.${ext}`);

      // Use chatbot endpoint for transcription
      const chatbotUrl = import.meta.env.VITE_CHATBOT_URL || "http://localhost:8000";
      const response = await axios.post(`${chatbotUrl}/voice/transcribe`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30000,
      });

      const text = (response.data?.transcript || '').trim();
      if (!text) { onError?.('Could not transcribe. Please try again.'); return; }
      onTranscript?.(text);
    } catch (err) {
      onError?.(err?.response?.data?.detail || err?.message || 'Transcription failed');
    } finally {
      onProcessingChange?.(false);
    }
  }

  function cleanup() {
    if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (recRef.current?.state === 'recording') recRef.current.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    ctxRef.current?.close();
    streamRef.current = null;
    recRef.current    = null;
    ctxRef.current    = null;
    rafRef.current    = null;
    onListeningChange?.(false);
  }

  return null;
}
