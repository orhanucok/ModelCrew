import type { AgentRole, CrewModel, ProviderId } from "../providers/providerTypes.js";

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
  | "aborted"
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

export type CrewSubtask = {
  id: string;
  title: string;
  description: string;
  status: "pending" | "running" | "completed" | "failed";
};

export type AgentAssignment = {
  role: AgentRole;
  modelId: string;
  providerId: ProviderId;
  score: number;
};

export type AgentOutput = {
  role: AgentRole;
  modelId: string;
  providerId: ProviderId;
  round: number;
  subtaskId?: string;
  content: string;
  confidence: number;
  issues: string[];
  assumptions: string[];
  missingInfo: string[];
  suggestedNextAction:
    | "continue"
    | "revise"
    | "ask_user"
    | "handoff_to_reviewer"
    | "handoff_to_synthesizer"
    | "stop";
  metadata: {
    startedAt: number;
    finishedAt: number;
    latencyMs: number;
    retryCount: number;
    tokenEstimate?: number;
    invalidStructure?: boolean;
  };
};

export type RunError = {
  message: string;
  role?: AgentRole;
  modelId?: string;
  providerId?: ProviderId;
  timestamp: number;
};

export type ProjectBlackboard = {
  userGoal: string;
  constraints: string[];
  selectedModelIds: string[];
  crewMode: "single" | "small" | "full";
  currentRound: number;
  plan?: string;
  subtasks: CrewSubtask[];
  assignments: AgentAssignment[];
  outputs: AgentOutput[];
  reviewNotes: string[];
  synthesisNotes: string[];
  finalResult?: string;
  openQuestions: string[];
  errors: RunError[];
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
  errors: RunError[];
  finalAnswer?: string;
  createdAt: number;
  updatedAt: number;
};

export type RunQualityScore = {
  completeness: number;
  correctness: number;
  clarity: number;
  riskLevel: "low" | "medium" | "high";
  needsAnotherRound: boolean;
};

export type FallbackPolicy = {
  maxRetriesPerModel: number;
  retryDelayMs: number;
  fallbackToSameRoleModel: boolean;
  fallbackToAnyReadyModel: boolean;
  allowPaidFallback: boolean;
};

export type RunStreamEvent =
  | {
      type: "run_started";
      runId: string;
      timestamp: number;
    }
  | {
      type: "state_changed";
      runId: string;
      state: RunState;
      timestamp: number;
    }
  | {
      type: "agent_started";
      runId: string;
      role: AgentRole;
      modelId: string;
      providerId: ProviderId;
      round: number;
      timestamp: number;
    }
  | {
      type: "agent_delta";
      runId: string;
      role: AgentRole;
      modelId?: string;
      contentDelta: string;
      timestamp: number;
    }
  | {
      type: "agent_completed";
      runId: string;
      output: AgentOutput;
      timestamp: number;
    }
  | {
      type: "review_completed";
      runId: string;
      issues: string[];
      timestamp: number;
    }
  | {
      type: "fallback_triggered";
      runId: string;
      fromModelId: string;
      toModelId?: string;
      reason: string;
      timestamp: number;
    }
  | {
      type: "run_completed";
      runId: string;
      finalAnswer: string;
      stopReason: RunStopReason;
      timestamp: number;
    }
  | {
      type: "run_failed";
      runId: string;
      message: string;
      timestamp: number;
    };
