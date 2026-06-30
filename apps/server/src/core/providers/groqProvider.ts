import type { AIProvider, CrewModel, ModelStatus } from "./providerTypes.js";
import { getProviderKey } from "../security/keyStorage.js";
import { classifyModelKind, isMvpUsableModel } from "../models/modelClassifier.js";
import { recommendedRolesFor, scoreCapabilities } from "../models/capabilityScoring.js";
import { recommendationScore } from "../models/recommendationScoring.js";
import { mapProviderError, openAICompatibleChat, statusFromHealthResponse } from "./openAICompatible.js";

type GroqModel = { id: string; active?: boolean; context_window?: number };

function strip(modelId: string): string {
  return modelId.replace(/^groq:/, "");
}

export class GroqProvider implements AIProvider {
  id = "groq" as const;
  displayName = "Groq";
  requiresApiKey = true;

  async getStatus() {
    return getProviderKey(this.id) ? ("ready" as const) : ("not_configured" as const);
  }

  async listModels(): Promise<CrewModel[]> {
    const apiKey = getProviderKey(this.id);
    if (!apiKey) return [];

    const response = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` }
    });

    if (!response.ok) {
      throw Object.assign(new Error(`Groq returned ${response.status}.`), { status: response.status });
    }

    const json = (await response.json()) as { data?: GroqModel[] };
    return (json.data ?? [])
      .filter((model) => model.active !== false && isMvpUsableModel(model.id))
      .map((model) => {
        const kind = classifyModelKind(model.id);
        const capabilities = scoreCapabilities({
          id: model.id,
          displayName: model.id,
          kind,
          provider: this.id,
          status: "checking",
          contextWindow: model.context_window
        });
        const crewModel: CrewModel = {
          id: `groq:${model.id}`,
          provider: this.id,
          displayName: model.id,
          kind,
          pricing: "free_tier",
          status: "checking",
          selectable: false,
          selected: false,
          capabilities,
          contextWindow: model.context_window,
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
    if (!apiKey) throw Object.assign(new Error("Groq requires an API key."), { status: 401 });
    return openAICompatibleChat({
      baseUrl: "https://api.groq.com/openai/v1",
      apiKey,
      modelId: strip(args.modelId),
      messages: args.messages,
      temperature: args.temperature,
      timeoutMs: args.timeoutMs,
      abortSignal: args.abortSignal
    });
  }
}
