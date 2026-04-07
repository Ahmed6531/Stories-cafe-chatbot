class PcmChunkCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const requestedChunkFrames = options?.processorOptions?.chunkFrames;
    this.chunkFrames = Math.max(
      1,
      Number.isFinite(requestedChunkFrames)
        ? Math.round(requestedChunkFrames)
        : Math.round(sampleRate * 0.09),
    );
    this.buffer = new Float32Array(this.chunkFrames);
    this.bufferedFrames = 0;

    this.port.onmessage = (event) => {
      const payload = event.data;
      if (!payload || payload.type !== "flush") return;
      this.flushBufferedFrames();
      this.port.postMessage({
        type: "flush_complete",
        requestId: payload.requestId,
      });
    };
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input || input.length === 0) {
      return true;
    }

    let offset = 0;
    while (offset < input.length) {
      const framesToCopy = Math.min(
        input.length - offset,
        this.chunkFrames - this.bufferedFrames,
      );
      this.buffer.set(input.subarray(offset, offset + framesToCopy), this.bufferedFrames);
      this.bufferedFrames += framesToCopy;
      offset += framesToCopy;

      if (this.bufferedFrames === this.chunkFrames) {
        this.postChunk(this.buffer);
        this.bufferedFrames = 0;
      }
    }

    return true;
  }

  flushBufferedFrames() {
    if (this.bufferedFrames === 0) return;

    const remaining = this.buffer.slice(0, this.bufferedFrames);
    this.postChunk(remaining);
    this.bufferedFrames = 0;
  }

  postChunk(samples) {
    const chunk = new Float32Array(samples.length);
    chunk.set(samples);
    this.port.postMessage(
      {
        type: "chunk",
        samples: chunk,
      },
      [chunk.buffer],
    );
  }
}

registerProcessor("pcm-chunk-capture", PcmChunkCaptureProcessor);
