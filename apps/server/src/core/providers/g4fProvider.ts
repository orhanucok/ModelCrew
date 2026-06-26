import type { AIProvider, CrewModel, ModelStatus } from "./providerTypes.js";
import { defaultCapabilities } from "./providerTypes.js";
import { classifyModelKind, isMvpUsableModel } from "../models/modelClassifier.js";
import { recommendedRolesFor, scoreCapabilities } from "../models/capabilityScoring.js";
import { recommendationScore } from "../models/recommendationScoring.js";
import { mapProviderError, openAICompatibleChat, statusFromHealthResponse } from "./openAICompatible.js";

type PublicEndpoint = {
  id: string;
  name: string;
  baseUrl: string;
  models: string[];
  enabled: boolean;
};

const endpoints: PublicEndpoint[] = [
  {
    id: "pollinations",
    name: "Pollinations",
    baseUrl: "https://text.pollinations.ai/openai",
    enabled: true,
    models: ["openai", "openai-fast", "mistral", "llama", "qwen-coder"]
  },
  {
    id: "public-groq",
    name: "G4F public Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    enabled: false,
    models: []
  },
  {
    id: "public-nvidia",
    name: "G4F public Nvidia",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    enabled: false,
    models: []
  },
  {
    id: "public-gemini",
    name: "G4F public Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    enabled: false,
    models: []
  }
];

function modelKey(endpointId: string, model: string): string {
  return `g4f:${endpointId}:${model}`;
}

function parseModelId(modelId: string): { endpoint: PublicEndpoint; providerModel: string } {
  const [, endpointId, ...modelParts] = modelId.split(":");
  const endpoint = endpoints.find((candidate) => candidate.id === endpointId && candidate.enabled);
  if (!endpoint) {
    throw new Error("Public endpoint is unavailable.");
  }
  return { endpoint, providerModel: modelParts.join(":") };
}

export class G4FProvider implements AIProvider {
  id = "g4f" as const;
  displayName = "G4F Public Endpoints";
  requiresApiKey = false;
  experimental = true;

  async getStatus() {
    return "experimental" as const;
  }

  async listModels(): Promise<CrewModel[]> {
    const models: CrewModel[] = [];

    for (const endpoint of endpoints) {
      if (!endpoint.enabled) continue;

      for (const providerModel of endpoint.models) {
        const displayName = `${providerModel} (${endpoint.name})`;
        if (!isMvpUsableModel(providerModel, displayName)) continue;

        const kind = classifyModelKind(providerModel, displayName);
        const capabilities = scoreCapabilities({
          id: modelKey(endpoint.id, providerModel),
          displayName,
          kind,
          provider: this.id,
          status: "checking"
        });

        const model: CrewModel = {
          id: modelKey(endpoint.id, providerModel),
          provider: this.id,
          endpoint: endpoint.name,
          displayName,
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
        model.recommendationScore = recommendationScore(model);
        models.push(model);
      }
    }

    return models;
  }

  async healthCheck(modelId: string): Promise<ModelStatus> {
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
    const { endpoint, providerModel } = parseModelId(args.modelId);
    return openAICompatibleChat({
      baseUrl: endpoint.baseUrl,
      modelId: providerModel,
      messages: args.messages,
      temperature: args.temperature,
      timeoutMs: args.timeoutMs
    });
  }
}
