import { Directory, File, Paths } from "expo-file-system";
import { initWhisper, type WhisperContext } from "whisper.rn";

// On-device speech-to-text with whisper.cpp (via whisper.rn). The model is
// downloaded once into app documents; audio never leaves the phone.

const MODEL_NAME = "ggml-base.bin";
const MODEL_URL = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${MODEL_NAME}`;
/** Approximate download size, shown in the UI. */
export const MODEL_SIZE_MB = 148;

const modelDir = new Directory(Paths.document, "models");
const modelFile = new File(modelDir, MODEL_NAME);

let context: Promise<WhisperContext> | null = null;

export function isModelDownloaded(): boolean {
  return modelFile.exists && (modelFile.size ?? 0) > 1_000_000;
}

export async function ensureModel(): Promise<void> {
  if (isModelDownloaded()) return;
  modelDir.create({ intermediates: true, idempotent: true });
  const partial = new File(modelDir, `${MODEL_NAME}.part`);
  if (partial.exists) partial.delete();
  await File.downloadFileAsync(MODEL_URL, partial, { idempotent: true });
  if (modelFile.exists) modelFile.delete();
  await partial.move(modelFile);
}

function getContext(): Promise<WhisperContext> {
  if (!context) {
    context = initWhisper({ filePath: modelFile.uri }).catch((e: unknown) => {
      context = null;
      throw e;
    });
  }
  return context;
}

/** Transcribe a 16 kHz mono WAV file. */
export async function transcribeWav(wavUri: string, language: string): Promise<string> {
  const whisper = await getContext();
  const { promise } = whisper.transcribe(wavUri, { language });
  const result = await promise;
  return result.result.trim();
}
