import type { AIProvider, CrewModel, ModelStatus } from "./providerTypes.js";
import { getProviderKey } from "../security/keyStorage.js";
import { recommendedRolesFor, scoreCapabilities } from "../models/capabilityScoring.js";
import { recommendationScore } from "../models/recommendationScoring.js";
import { withTimeout } from "../../utils/timeout.js";

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

  async callModel(args: {
    modelId: string;
    messages: import("./providerTypes.js").AIMessage[];
    temperature?: number;
    timeoutMs?: number;
    abortSignal?: AbortSignal;
  }): ReturnType<AIProvider["callModel"]> {
    const apiKey = getProviderKey(this.id);
    if (!apiKey) {
      throw Object.assign(new Error("Anthropic API key is required."), { status: 401 });
    }

    const { Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey });

    // Anthropic requires system prompt to be passed separately
    const systemMessages = args.messages.filter(m => m.role === "system");
    const system = systemMessages.map(m => m.content).join("\n\n");

    const userAndAssistantMessages = args.messages
      .filter(m => m.role !== "system")
      .map(m => ({
        role: m.role as "user" | "assistant",
        content: m.content
      }));

    // Extract the actual model name (remove the "anthropic:" prefix)
    const model = args.modelId.replace("anthropic:", "");

    try {
      const response = await withTimeout(
        (signal) => client.messages.create({
          model,
          messages: userAndAssistantMessages,
          system: system || undefined,
          max_tokens: 4096,
          temperature: args.temperature ?? 0.7,
        }, { signal }),
        args.timeoutMs ?? 60_000,
        args.abortSignal
      );

      const textBlock = response.content.find(c => c.type === "text");
      const text = textBlock && textBlock.type === "text" ? textBlock.text : "";

      return {
        text,
        raw: response,
      };
    } catch (error: any) {
      throw Object.assign(new Error(error?.message || "Anthropic call failed"), { status: error?.status || 500 });
    }
  }
}
