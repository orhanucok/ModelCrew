import type { AIMessage, ModelStatus } from "./providerTypes.js";
import { withTimeout } from "../../utils/timeout.js";

export type OpenAICompatibleCallArgs = {
  baseUrl: string;
  apiKey?: string;
  modelId: string;
  messages: AIMessage[];
  temperature?: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
};

export async function openAICompatibleChat(args: OpenAICompatibleCallArgs): Promise<{ text: string; raw: unknown }> {
  const response = await withTimeout(
    (signal) =>
      fetch(`${args.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        signal,
        headers: {
          "Content-Type": "application/json",
          ...(args.apiKey ? { Authorization: `Bearer ${args.apiKey}` } : {}),
          ...args.headers
        },
        body: JSON.stringify({
          model: args.modelId,
          messages: args.messages,
          temperature: args.temperature ?? 0.2
        })
      }),
    args.timeoutMs ?? 30_000
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const error = new Error(`Provider returned ${response.status}: ${text.slice(0, 400)}`);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }

  const raw = (await response.json()) as {
    choices?: Array<{ message?: { content?: string }; text?: string }>;
  };
  const text = raw.choices?.[0]?.message?.content ?? raw.choices?.[0]?.text ?? "";
  return { text: text.trim(), raw };
}

export function mapProviderError(error: unknown): ModelStatus {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "slow";
  }

  const status = (error as { status?: number } | undefined)?.status;
  if (status === 401 || status === 403) return "key_required";
  if (status === 402) return "paid_locked";
  if (status === 429) return "rate_limited";
  if (status === 503) return "busy";
  if (status && status >= 500) return "unavailable";
  return "failed";
}

export function statusFromHealthResponse(text: string): ModelStatus {
  const normalized = text.trim();
  if (normalized === "OK") return "ready";
  if (!normalized) return "passive";
  return "failed";
}
