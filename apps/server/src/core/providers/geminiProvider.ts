import type { AIProvider, AIMessage, CrewModel, ModelStatus } from "./providerTypes.js";
import { getProviderKey } from "../security/keyStorage.js";
import { classifyModelKind, isMvpUsableModel } from "../models/modelClassifier.js";
import { recommendedRolesFor, scoreCapabilities } from "../models/capabilityScoring.js";
import { recommendationScore } from "../models/recommendationScoring.js";
import { mapProviderError, statusFromHealthResponse } from "./openAICompatible.js";
import { withTimeout } from "../../utils/timeout.js";

type GeminiModel = {
  name: string;
  displayName?: string;
  inputTokenLimit?: number;
  supportedGenerationMethods?: string[];
};

function strip(modelId: string): string {
  return modelId.replace(/^gemini:/, "");
}

function toGeminiContents(messages: AIMessage[]) {
  return messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }]
    }));
}

export class GeminiProvider implements AIProvider {
  id = "gemini" as const;
  displayName = "Gemini";
  requiresApiKey = true;

  async getStatus() {
    return getProviderKey(this.id) ? ("ready" as const) : ("not_configured" as const);
  }

  async listModels(): Promise<CrewModel[]> {
    const apiKey = getProviderKey(this.id);
    if (!apiKey) return [];

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);
    if (!response.ok) {
      throw Object.assign(new Error(`Gemini returned ${response.status}.`), { status: response.status });
    }

    const json = (await response.json()) as { models?: GeminiModel[] };
    return (json.models ?? [])
      .filter((model) => model.supportedGenerationMethods?.includes("generateContent"))
      .filter((model) => isMvpUsableModel(model.name, model.displayName ?? model.name))
      .map((model) => {
        const displayName = model.displayName ?? model.name.replace("models/", "");
        const providerModelId = model.name.replace("models/", "");
        const kind = classifyModelKind(providerModelId, displayName);
        const capabilities = scoreCapabilities({
          id: providerModelId,
          displayName,
          kind,
          provider: this.id,
          status: "checking",
          contextWindow: model.inputTokenLimit
        });
        const crewModel: CrewModel = {
          id: `gemini:${providerModelId}`,
          provider: this.id,
          displayName,
          kind,
          pricing: "free_tier",
          status: "checking",
          selectable: false,
          selected: false,
          capabilities,
          contextWindow: model.inputTokenLimit,
          recommendationScore: 0,
          recommendedRoles: recommendedRolesFor(capabilities),
          recentFailureCount: 0,
          recentInvalidOutputCount: 0,
          healthState: "queued"
        };
        crewModel.recommendationScore = recommendationScore(crewModel);
        return crewModel;
      });
  }

  async healthCheck(modelId: string): Promise<ModelStatus> {
    if (!getProviderKey(this.id)) return "key_required";
    try {
      const result = await this.callModel({
        modelId,
        messages: [{ role: "user", content: "Reply with exactly: OK" }],
        temperature: 0,
        timeoutMs: 8_000
      });
      return statusFromHealthResponse(result.text);
    } catch (error) {
      return mapProviderError(error);
    }
  }

  async callModel(args: Parameters<AIProvider["callModel"]>[0]): ReturnType<AIProvider["callModel"]> {
    const apiKey = getProviderKey(this.id);
    if (!apiKey) throw Object.assign(new Error("Gemini requires an API key."), { status: 401 });
    const systemInstruction = args.messages.find((message) => message.role === "system")?.content;

    const response = await withTimeout(
      (signal) =>
        fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${strip(args.modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`,
          {
            method: "POST",
            signal,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}),
              contents: toGeminiContents(args.messages),
              generationConfig: {
                temperature: args.temperature ?? 0.2
              }
            })
          }
        ),
      args.timeoutMs ?? 30_000
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw Object.assign(new Error(`Gemini returned ${response.status}: ${text.slice(0, 300)}`), {
        status: response.status
      });
    }

    const raw = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = raw.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
    return { text: text.trim(), raw };
  }
}
