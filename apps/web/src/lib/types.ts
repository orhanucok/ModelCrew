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

export type ModelPricing = "free" | "free_tier" | "no_key" | "paid" | "key_required" | "unknown";

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

export type HealthStats = {
  queued: number;
  running: number;
  completed: number;
  failed: number;
  concurrency: number;
  cooldowns: Array<{
    providerId: ProviderId;
    cooldownUntil: number;
    reason: string;
  }>;
};

export type CrewForgeSettings = {
  theme: "system" | "light" | "dark";
  keyStorageMode: "session_only" | "encrypted_local" | "os_keychain";
  experimentalProviders: boolean;
  healthCheckConcurrency: number;
  runHistoryRetention: "keep_all" | "clear_manually";
  logs: "normal" | "verbose";
  paidModelsEnabled: boolean;
};

export type RunState =
  | "created"
  | "selecting_models"
  | "planning"
  | "assigning"
  | "running_agents"
  | "reviewing"
  | "repairing"
  | "synthesizing"
  | "completed"
  | "waiting_for_user"
  | "failed"
  | "cancelled";

export type RunStopReason =
  | "max_rounds_reached"
  | "quality_threshold_met"
  | "reviewer_approved"
  | "user_approval_required"
  | "no_usable_models"
  | "fatal_error";

export type ChatMode = "chat" | "forge_crew";

export type ForgeCrewConfig = {
  orchestratorModelId: string;
  plannerModelId: string;
  workerCount: number;
  workerModelIds: string[];
  reviewerModelId: string;
  synthesizerModelId: string;
};

export type ChatAvailableModel = {
  id: string;
  provider: ProviderId;
  displayName: string;
  status: ModelStatus;
  capabilities: ModelCapabilities;
};

export type AgentOutput = {
  role: AgentRole;
  modelId: string;
  providerId: ProviderId;
  round: number;
  content: string;
  confidence: number;
  issues: string[];
  assumptions: string[];
  missingInfo: string[];
  suggestedNextAction: string;
  metadata: {
    startedAt: number;
    finishedAt: number;
    latencyMs: number;
    retryCount: number;
    tokenEstimate?: number;
    invalidStructure?: boolean;
  };
};

export type ProjectBlackboard = {
  userGoal: string;
  constraints: string[];
  selectedModelIds: string[];
  crewMode: "single" | "small" | "full";
  currentRound: number;
  plan?: string;
  subtasks: Array<{ id: string; title: string; description: string; status: string }>;
  assignments: Array<{ role: AgentRole; modelId: string; providerId: ProviderId; score: number }>;
  outputs: AgentOutput[];
  reviewNotes: string[];
  synthesisNotes: string[];
  finalResult?: string;
  openQuestions: string[];
  errors: Array<{ message: string; timestamp: number }>;
};

export type CrewRun = {
  id: string;
  runMode: ChatMode;
  forgeConfig?: ForgeCrewConfig;
  userTask: string;
  selectedModels: CrewModel[];
  state: RunState;
  currentRound: number;
  maxRounds: number;
  stopReason?: RunStopReason;
  blackboard: ProjectBlackboard;
  outputs: AgentOutput[];
  errors: Array<{ message: string; timestamp: number }>;
  finalAnswer?: string;
  createdAt: number;
  updatedAt: number;
};

export type RunStreamEvent =
  | { type: "run_started"; runId: string; timestamp: number }
  | { type: "state_changed"; runId: string; state: RunState; timestamp: number }
  | {
      type: "agent_started";
      runId: string;
      role: AgentRole;
      modelId: string;
      providerId: ProviderId;
      round: number;
      timestamp: number;
    }
  | { type: "agent_delta"; runId: string; role: AgentRole; modelId?: string; contentDelta: string; timestamp: number }
  | { type: "agent_completed"; runId: string; output: AgentOutput; timestamp: number }
  | { type: "review_completed"; runId: string; issues: string[]; timestamp: number }
  | { type: "fallback_triggered"; runId: string; fromModelId: string; toModelId?: string; reason: string; timestamp: number }
  | { type: "run_completed"; runId: string; finalAnswer: string; stopReason: RunStopReason; timestamp: number }
  | { type: "run_failed"; runId: string; message: string; timestamp: number };
