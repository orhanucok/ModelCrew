import type { AIProvider, CrewModel, ModelPricing, ModelStatus } from "./providerTypes.js";
import { getProviderKey } from "../security/keyStorage.js";
import { classifyModelKind, isMvpUsableModel } from "../models/modelClassifier.js";
import { recommendedRolesFor, scoreCapabilities } from "../models/capabilityScoring.js";
import { recommendationScore } from "../models/recommendationScoring.js";
import { mapProviderError, openAICompatibleChat, statusFromHealthResponse } from "./openAICompatible.js";

type OpenRouterModel = {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: {
    prompt?: string;
    completion?: string;
  };
};

function strip(modelId: string): string {
  return modelId.replace(/^openrouter:/, "");
}

function pricingFor(model: OpenRouterModel, hasKey: boolean): ModelPricing {
  if (!hasKey) return "key_required";
  const promptPrice = Number(model.pricing?.prompt ?? "1");
  const completionPrice = Number(model.pricing?.completion ?? "1");
  if (promptPrice === 0 && completionPrice === 0) return "free_tier";
  return "paid";
}

export class OpenRouterProvider implements AIProvider {
  id = "openrouter" as const;
  displayName = "OpenRouter";
  requiresApiKey = true;

  async getStatus() {
    return getProviderKey(this.id) ? ("ready" as const) : ("not_configured" as const);
  }

  async listModels(): Promise<CrewModel[]> {
    const apiKey = getProviderKey(this.id);
    if (!apiKey) return [];

    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` }
    });

    if (!response.ok) {
      throw Object.assign(new Error(`OpenRouter returned ${response.status}.`), { status: response.status });
    }

    const json = (await response.json()) as { data?: OpenRouterModel[] };
    return (json.data ?? [])
      .filter((model) => isMvpUsableModel(model.id, model.name ?? model.id))
      .slice(0, 120)
      .map((model) => {
        const kind = classifyModelKind(model.id, model.name ?? model.id);
        const pricing = pricingFor(model, Boolean(apiKey));
        const status: ModelStatus = pricing === "paid" ? "paid_locked" : "checking";
        const capabilities = scoreCapabilities({
          id: model.id,
          displayName: model.name ?? model.id,
          kind,
          provider: this.id,
          status,
          contextWindow: model.context_length
        });
        const crewModel: CrewModel = {
          id: `openrouter:${model.id}`,
          provider: this.id,
          displayName: model.name ?? model.id,
          kind,
          pricing,
          status,
          selectable: false,
          selected: false,
          capabilities,
          contextWindow: model.context_length,
          recommendationScore: 0,
          recommendedRoles: recommendedRolesFor(capabilities),
          recentFailureCount: 0,
          recentInvalidOutputCount: 0,
          healthState: status === "checking" ? "queued" : "completed"
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
    if (!apiKey) {
      throw Object.assign(new Error("OpenRouter requires an API key."), { status: 401 });
    }

    return openAICompatibleChat({
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey,
      modelId: strip(args.modelId),
      messages: args.messages,
      temperature: args.temperature,
      timeoutMs: args.timeoutMs,
      headers: {
        "HTTP-Referer": "http://localhost:5173",
        "X-Title": "CrewForge"
      }
    });
  }
}
