import type { AIProvider, CrewModel, ModelStatus } from "./providerTypes.js";
import { getProviderKey } from "../security/keyStorage.js";
import { recommendedRolesFor, scoreCapabilities } from "../models/capabilityScoring.js";
import { recommendationScore } from "../models/recommendationScoring.js";

export class AnthropicProvider implements AIProvider {
  id = "anthropic" as const;
  displayName = "Anthropic";
  requiresApiKey = true;

  async getStatus() {
    return getProviderKey(this.id) ? ("ready" as const) : ("not_configured" as const);
  }

  async listModels(): Promise<CrewModel[]> {
    if (!getProviderKey(this.id)) return [];
    const ids = ["claude-3-5-sonnet-latest", "claude-3-5-haiku-latest"];
    return ids.map((id) => {
      const capabilities = scoreCapabilities({
        id,
        displayName: id,
        kind: "chat",
        provider: this.id,
        status: "paid_locked"
      });
      const model: CrewModel = {
        id: `anthropic:${id}`,
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

  async healthCheck(): Promise<ModelStatus> {
    return getProviderKey(this.id) ? "paid_locked" : "key_required";
  }

  async callModel(): ReturnType<AIProvider["callModel"]> {
    throw Object.assign(new Error("Anthropic calls are coming later."), { status: 402 });
  }
}
