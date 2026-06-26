import type { AIProvider, CrewModel, ModelStatus } from "./providerTypes.js";
import { getProviderKey } from "../security/keyStorage.js";
import { classifyModelKind, isMvpUsableModel } from "../models/modelClassifier.js";
import { recommendedRolesFor, scoreCapabilities } from "../models/capabilityScoring.js";
import { recommendationScore } from "../models/recommendationScoring.js";
import { mapProviderError, openAICompatibleChat, statusFromHealthResponse } from "./openAICompatible.js";

type OpenAIModel = { id: string };

function strip(modelId: string): string {
  return modelId.replace(/^openai:/, "");
}

export class OpenAIProvider implements AIProvider {
  id = "openai" as const;
  displayName = "OpenAI";
  requiresApiKey = true;

  async getStatus() {
    return getProviderKey(this.id) ? ("ready" as const) : ("not_configured" as const);
  }

  async listModels(): Promise<CrewModel[]> {
    const apiKey = getProviderKey(this.id);
    if (!apiKey) return [];
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    if (!response.ok) throw Object.assign(new Error(`OpenAI returned ${response.status}.`), { status: response.status });
    const json = (await response.json()) as { data?: OpenAIModel[] };
    return (json.data ?? [])
      .filter((model) => isMvpUsableModel(model.id))
      .map((model) => {
        const kind = classifyModelKind(model.id);
        const capabilities = scoreCapabilities({
          id: model.id,
          displayName: model.id,
          kind,
          provider: this.id,
          status: "paid_locked"
        });
        const crewModel: CrewModel = {
          id: `openai:${model.id}`,
          provider: this.id,
          displayName: model.id,
          kind,
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
    if (!apiKey) throw Object.assign(new Error("OpenAI requires an API key."), { status: 401 });
    return openAICompatibleChat({
      baseUrl: "https://api.openai.com/v1",
      apiKey,
      modelId: strip(args.modelId),
      messages: args.messages,
      temperature: args.temperature,
      timeoutMs: args.timeoutMs
    });
  }
}
