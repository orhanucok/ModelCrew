import type { AgentRole, CrewModel } from "../providers/providerTypes.js";
import type { AgentAssignment, AgentOutput, CrewRun } from "./crewTypes.js";
import { getProvider } from "../providers/providerRegistry.js";
import { buildAgentMessages } from "./contextBudget.js";
import { defaultFallbackPolicy, findFallbackModel } from "./fallback.js";
import { emitRunEvent } from "./runEvents.js";
import { sleep } from "../../utils/timeout.js";
import { estimateTokens } from "../../utils/tokenEstimate.js";
import { asUserMessage } from "../../utils/errors.js";

function asArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function normalizeAction(value: unknown): AgentOutput["suggestedNextAction"] {
  const text = String(value ?? "continue");
  if (["continue", "revise", "ask_user", "handoff_to_reviewer", "handoff_to_synthesizer", "stop"].includes(text)) {
    return text as AgentOutput["suggestedNextAction"];
  }
  return "continue";
}

function extractJson(raw: string): Record<string, unknown> | undefined {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(cleaned.slice(first, last + 1)) as Record<string, unknown>;
      } catch {
        return undefined;
      }
    }
  }

  return undefined;
}

function toAgentOutput(args: {
  role: AgentRole;
  model: CrewModel;
  round: number;
  rawText: string;
  startedAt: number;
  retryCount: number;
  invalidStructure: boolean;
}): AgentOutput {
  const parsed = args.invalidStructure ? undefined : extractJson(args.rawText);
  let confidence = Number(parsed?.confidence ?? 0.55);
  if (confidence > 1) confidence = confidence / 100;

  return {
    role: args.role,
    modelId: args.model.id,
    providerId: args.model.provider,
    round: args.round,
    content: String(parsed?.content ?? args.rawText).trim(),
    confidence: Math.max(0, Math.min(1, confidence)),
    issues: asArray(parsed?.issues),
    assumptions: asArray(parsed?.assumptions),
    missingInfo: asArray(parsed?.missingInfo),
    suggestedNextAction: normalizeAction(parsed?.suggestedNextAction),
    metadata: {
      startedAt: args.startedAt,
      finishedAt: Date.now(),
      latencyMs: Date.now() - args.startedAt,
      retryCount: args.retryCount,
      tokenEstimate: estimateTokens(args.rawText),
      invalidStructure: args.invalidStructure
    }
  };
}

async function callRole(args: {
  run: CrewRun;
  model: CrewModel;
  role: AgentRole;
  roleInstruction: string;
  currentSubtask?: string;
  reviewerNotes?: string[];
  stricter?: boolean;
  retryCount: number;
  abortSignal?: AbortSignal;
}): Promise<{ rawText: string; startedAt: number }> {
  const provider = getProvider(args.model.provider);
  const startedAt = Date.now();

  emitRunEvent({
    type: "agent_started",
    runId: args.run.id,
    role: args.role,
    modelId: args.model.id,
    providerId: args.model.provider,
    round: args.run.currentRound,
    timestamp: Date.now()
  });

  const response = await provider.callModel({
    modelId: args.model.id,
    messages: buildAgentMessages({
      role: args.role,
      roleInstruction: args.roleInstruction,
      blackboard: args.run.blackboard,
      currentSubtask: args.currentSubtask,
      reviewerNotes: args.reviewerNotes,
      stricter: args.stricter
    }),
    temperature: args.role === "reviewer" ? 0.1 : 0.2,
    timeoutMs: 60_000,
    abortSignal: args.abortSignal
  });

  const rawText = response.text.trim();
  emitRunEvent({
    type: "agent_delta",
    runId: args.run.id,
    role: args.role,
    modelId: args.model.id,
    contentDelta: rawText,
    timestamp: Date.now()
  });

  return { rawText, startedAt };
}

export async function runAgentStep(args: {
  run: CrewRun;
  assignment: AgentAssignment;
  roleInstruction: string;
  currentSubtask?: string;
  reviewerNotes?: string[];
  abortSignal?: AbortSignal;
}): Promise<AgentOutput> {
  let model = args.run.selectedModels.find((candidate) => candidate.id === args.assignment.modelId);
  if (!model) {
    throw new Error(`Assigned model ${args.assignment.modelId} is unavailable.`);
  }

  let retryCount = 0;

  for (;;) {
    try {
      let firstCall = await callRole({
        run: args.run,
        model,
        role: args.assignment.role,
        roleInstruction: args.roleInstruction,
        currentSubtask: args.currentSubtask,
        reviewerNotes: args.reviewerNotes,
        retryCount,
        abortSignal: args.abortSignal
      });

      let invalidStructure = !extractJson(firstCall.rawText);
      if (invalidStructure) {
        retryCount += 1;
        firstCall = await callRole({
          run: args.run,
          model,
          role: args.assignment.role,
          roleInstruction: args.roleInstruction,
          currentSubtask: args.currentSubtask,
          reviewerNotes: args.reviewerNotes,
          stricter: true,
          retryCount,
          abortSignal: args.abortSignal
        });
        invalidStructure = !extractJson(firstCall.rawText);
      }

      const output = toAgentOutput({
        role: args.assignment.role,
        model,
        round: args.run.currentRound,
        rawText: firstCall.rawText,
        startedAt: firstCall.startedAt,
        retryCount,
        invalidStructure
      });

      emitRunEvent({
        type: "agent_completed",
        runId: args.run.id,
        output,
        timestamp: Date.now()
      });

      return output;
    } catch (error) {
      if (retryCount < defaultFallbackPolicy.maxRetriesPerModel) {
        retryCount += 1;
        await sleep(defaultFallbackPolicy.retryDelayMs);
        continue;
      }

      const fallback = findFallbackModel({
        models: args.run.selectedModels,
        currentModelId: model.id,
        role: args.assignment.role
      });

      if (!fallback) {
        throw new Error(asUserMessage(error));
      }

      emitRunEvent({
        type: "fallback_triggered",
        runId: args.run.id,
        fromModelId: model.id,
        toModelId: fallback.id,
        reason: asUserMessage(error),
        timestamp: Date.now()
      });

      model = fallback;
      retryCount = 0;
    }
  }
}
