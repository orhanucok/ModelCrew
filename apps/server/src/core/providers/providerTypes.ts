export type ProviderId =
  | "openrouter"
  | "gemini"
  | "groq"
  | "openai"
  | "anthropic"
  | "xai"
  | "g4f"
  | "ollama";

export type ProviderStatus =
  | "not_configured"
  | "ready"
  | "invalid_key"
  | "rate_limited"
  | "failed"
  | "experimental";

export type ModelKind =
  | "text"
  | "code"
  | "chat"
  | "reasoning"
  | "image"
  | "audio"
  | "video"
  | "embedding"
  | "moderation"
  | "unknown";

export type ModelStatus =
  | "checking"
  | "ready"
  | "busy"
  | "slow"
  | "rate_limited"
  | "cooldown"
  | "key_required"
  | "paid_locked"
  | "broken"
  | "passive"
  | "failed"
  | "unavailable";

export type ModelPricing =
  | "free"
  | "free_tier"
  | "no_key"
  | "paid"
  | "key_required"
  | "unknown";

export type AgentRole =
  | "orchestrator"
  | "planner"
  | "worker"
  | "architect"
  | "builder"
  | "reviewer"
  | "synthesizer"
  | "researcher"
  | "tester";

export type ModelCapabilities = {
  coding: number;
  reasoning: number;
  research: number;
  instructionFollowing: number;
  context: number;
  speed: number;
  reliability: number;
  synthesis: number;
};

export type CrewModel = {
  id: string;
  provider: ProviderId;
  endpoint?: string;
  displayName: string;
  kind: ModelKind;
  pricing: ModelPricing;
  status: ModelStatus;
  selectable: boolean;
  selected: boolean;
  capabilities: ModelCapabilities;
  contextWindow?: number;
  recommendationScore: number;
  recommendedRoles: AgentRole[];
  lastCheckedAt?: number;
  recentFailureCount?: number;
  recentInvalidOutputCount?: number;
  healthState?: "queued" | "running" | "completed" | "failed";
};

export type ProviderConnection = {
  id: ProviderId;
  displayName: string;
  requiresApiKey: boolean;
  experimental?: boolean;
  status: ProviderStatus;
  keySaved: boolean;
  keyPreview?: string;
  lastTestedAt?: number;
  message?: string;
};

export type AIMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AIProvider = {
  id: ProviderId;
  displayName: string;
  requiresApiKey: boolean;
  experimental?: boolean;
  getStatus(): Promise<ProviderStatus>;
  listModels(): Promise<CrewModel[]>;
  healthCheck(modelId: string): Promise<ModelStatus>;
  callModel(args: {
    modelId: string;
    messages: AIMessage[];
    temperature?: number;
    timeoutMs?: number;
  }): Promise<{
    text: string;
    raw?: unknown;
  }>;
};

export const selectableKinds: ModelKind[] = ["text", "code", "chat", "reasoning"];

export const providerPriority: ProviderId[] = [
  "g4f",
  "openrouter",
  "gemini",
  "groq",
  "openai",
  "anthropic",
  "xai",
  "ollama"
];

export const defaultCapabilities: ModelCapabilities = {
  coding: 45,
  reasoning: 45,
  research: 40,
  instructionFollowing: 45,
  context: 40,
  speed: 50,
  reliability: 40,
  synthesis: 45
};

export function isSelectableKind(kind: ModelKind): boolean {
  return selectableKinds.includes(kind);
}
