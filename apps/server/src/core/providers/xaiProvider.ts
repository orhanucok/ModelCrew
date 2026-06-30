import type { AIProvider, CrewModel, ModelStatus } from "./providerTypes.js";
import { getProviderKey } from "../security/keyStorage.js";
import { recommendedRolesFor, scoreCapabilities } from "../models/capabilityScoring.js";
import { recommendationScore } from "../models/recommendationScoring.js";
import { mapProviderError, openAICompatibleChat, statusFromHealthResponse } from "./openAICompatible.js";

function strip(modelId: string): string {
  return modelId.replace(/^xai:/, "");
}

export class XAIProvider implements AIProvider {
  id = "xai" as const;
  displayName = "xAI";
  requiresApiKey = true;

  async getStatus() {
    return getProviderKey(this.id) ? ("ready" as const) : ("not_configured" as const);
  }

  async listModels(): Promise<CrewModel[]> {
    if (!getProviderKey(this.id)) return [];
    const ids = ["grok-3", "grok-3-mini"];
    return ids.map((id) => {
      const capabilities = scoreCapabilities({
        id,
        displayName: id,
        kind: "chat",
        provider: this.id,
        status: "paid_locked"
      });
      const model: CrewModel = {
        id: `xai:${id}`,
        provider: this.id,
        displayName: id,
        kind: "chat",
        pricing: "paid",
        status: "paid_locked",
        selectable: false,
        selected: false,
        capabilities,
        recommendationScore: 0,
        recommendedRoles: recommendedRolesFor(capabilities),
        recentFailureCount: 0,
        recentInvalidOutputCount: 0,
        healthState: "completed"
      };
      model.recommendationScore = recommendationScore(model);
      return model;
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
    if (!apiKey) throw Object.assign(new Error("xAI requires an API key."), { status: 401 });
    return openAICompatibleChat({
      baseUrl: "https://api.x.ai/v1",
      apiKey,
      modelId: strip(args.modelId),
      messages: args.messages,
      temperature: args.temperature,
      timeoutMs: args.timeoutMs,
      abortSignal: args.abortSignal
    });
  }
}
