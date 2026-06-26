import type { ModelKind } from "../providers/providerTypes.js";

const blockedTerms = [
  "image",
  "vision",
  "audio",
  "tts",
  "speech",
  "whisper",
  "embedding",
  "embed",
  "moderation",
  "safety",
  "guard",
  "rerank",
  "video"
];

export function classifyModelKind(modelId: string, displayName = modelId): ModelKind {
  const text = `${modelId} ${displayName}`.toLowerCase();

  if (text.includes("embedding") || text.includes("embed")) return "embedding";
  if (text.includes("moderation") || text.includes("guard") || text.includes("safety")) return "moderation";
  if (text.includes("image") || text.includes("vision")) return "image";
  if (text.includes("audio") || text.includes("speech") || text.includes("whisper") || text.includes("tts")) return "audio";
  if (text.includes("video")) return "video";
  if (text.includes("code") || text.includes("coder") || text.includes("codestral")) return "code";
  if (text.includes("reason") || text.includes("o1") || text.includes("o3") || text.includes("r1")) return "reasoning";
  if (text.includes("chat") || text.includes("instruct") || text.includes("turbo")) return "chat";
  return "text";
}

export function isMvpUsableModel(modelId: string, displayName = modelId): boolean {
  const text = `${modelId} ${displayName}`.toLowerCase();
  return !blockedTerms.some((term) => text.includes(term));
}
