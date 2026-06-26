import type { AIProvider, CrewModel, ModelStatus } from "./providerTypes.js";
import { classifyModelKind, isMvpUsableModel } from "../models/modelClassifier.js";
import { recommendedRolesFor, scoreCapabilities } from "../models/capabilityScoring.js";
import { recommendationScore } from "../models/recommendationScoring.js";
import { withTimeout } from "../../utils/timeout.js";

type OllamaModel = { name: string; details?: { family?: string }; model?: string };

function strip(modelId: string): string {
  return modelId.replace(/^ollama:/, "");
}

export class OllamaProvider implements AIProvider {
  id = "ollama" as const;
  displayName = "Ollama Local";
  requiresApiKey = false;

  async getStatus() {
    try {
      const response = await withTimeout((signal) => fetch("http://127.0.0.1:11434/api/tags", { signal }), 1500);
      return response.ok ? ("ready" as const) : ("failed" as const);
    } catch {
      return "not_configured" as const;
    }
  }

  async listModels(): Promise<CrewModel[]> {
    try {
      const response = await withTimeout((signal) => fetch("http://127.0.0.1:11434/api/tags", { signal }), 1500);
      if (!response.ok) return [];
      const json = (await response.json()) as { models?: OllamaModel[] };
      return (json.models ?? [])
        .filter((model) => isMvpUsableModel(model.name))
        .map((model) => {
          const kind = classifyModelKind(model.name);
          const capabilities = scoreCapabilities({
            id: model.name,
            displayName: model.name,
            kind,
            provider: this.id,
            status: "checking"
          });
          const crewModel: CrewModel = {
            id: `ollama:${model.name}`,
            provider: this.id,
            displayName: model.name,
            kind,
            pricing: "no_key",
            status: "checking",
            selectable: false,
            selected: false,
            capabilities,
            recommendationScore: 0,
            recommendedRoles: recommendedRolesFor(capabilities),
            recentFailureCount: 0,
            recentInvalidOutputCount: 0,
            healthState: "queued"
          };
          crewModel.recommendationScore = recommendationScore(crewModel);
          return crewModel;
        });
    } catch {
      return [];
    }
  }

  async healthCheck(modelId: string): Promise<ModelStatus> {
    try {
      const result = await this.callModel({
        modelId,
        messages: [{ role: "user", content: "Reply with exactly: OK" }],
        temperature: 0,
        timeoutMs: 8_000
      });
      return result.text.trim() === "OK" ? "ready" : result.text ? "failed" : "passive";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "slow";
      return "unavailable";
    }
  }

  async callModel(args: Parameters<AIProvider["callModel"]>[0]): ReturnType<AIProvider["callModel"]> {
    const response = await withTimeout(
      (signal) =>
        fetch("http://127.0.0.1:11434/api/chat", {
          method: "POST",
          signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: strip(args.modelId),
            messages: args.messages,
            stream: false,
            options: { temperature: args.temperature ?? 0.2 }
          })
        }),
      args.timeoutMs ?? 30_000
    );

    if (!response.ok) {
      throw Object.assign(new Error(`Ollama returned ${response.status}.`), { status: response.status });
    }

    const raw = (await response.json()) as { message?: { content?: string } };
    return { text: raw.message?.content?.trim() ?? "", raw };
  }
}
