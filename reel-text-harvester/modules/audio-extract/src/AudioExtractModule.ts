import { NativeModule, requireNativeModule } from "expo";

export type ExtractResult = {
  /** False when the video has no audio track; no file is written then. */
  hasAudio: boolean;
  durationMs: number;
};

declare class AudioExtractNative extends NativeModule {
  extractWavAsync(inputUri: string, outputUri: string, sampleRate: number): Promise<ExtractResult>;
}

const native = requireNativeModule<AudioExtractNative>("AudioExtract");

/**
 * Decode the first audio track of a local video (file:// URI) to a mono,
 * 16-bit little-endian PCM WAV at `sampleRate` (Whisper wants 16000).
 */
export function extractWavAsync(inputUri: string, outputUri: string, sampleRate = 16000): Promise<ExtractResult> {
  return native.extractWavAsync(inputUri, outputUri, sampleRate);
}
