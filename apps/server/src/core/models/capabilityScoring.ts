import type { AgentRole, CrewModel, ModelCapabilities, ModelStatus } from "../providers/providerTypes.js";
import { defaultCapabilities } from "../providers/providerTypes.js";

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function statusReliability(status: ModelStatus): number {
  switch (status) {
    case "ready":
      return 82;
    case "slow":
      return 62;
    case "busy":
    case "rate_limited":
    case "cooldown":
      return 45;
    case "checking":
      return 35;
    default:
      return 15;
  }
}

export function scoreCapabilities(input: {
  id: string;
  displayName: string;
  kind: CrewModel["kind"];
  provider: CrewModel["provider"];
  status: ModelStatus;
  contextWindow?: number;
  latencyMs?: number;
  recentFailureCount?: number;
  recentInvalidOutputCount?: number;
}): ModelCapabilities {
  const text = `${input.id} ${input.displayName}`.toLowerCase();
  const scores: ModelCapabilities = { ...defaultCapabilities };

  if (input.kind === "code" || /coder|code|codestral|deepseek|qwen/.test(text)) {
    scores.coding += 25;
    scores.instructionFollowing += 8;
  }

  if (/reason|r1|o1|o3|sonnet|opus|gemini|gpt-4|llama-3.3|mixtral/.test(text)) {
    scores.reasoning += 22;
    scores.synthesis += 12;
  }

  if (/search|online|perplexity|gemini|openrouter/.test(text)) {
    scores.research += 12;
  }

  if (/mini|fast|flash|8b|small|haiku|groq/.test(text)) {
    scores.speed += 22;
  }

  if (/large|70b|405b|opus|sonnet|pro|gpt-4|gemini-1.5|gemini-2/.test(text)) {
    scores.context += 15;
    scores.reasoning += 12;
    scores.speed -= 7;
  }

  if (input.contextWindow) {
    scores.context += input.contextWindow >= 100_000 ? 25 : input.contextWindow >= 32_000 ? 15 : 5;
  }

  if (input.latencyMs) {
    scores.speed += input.latencyMs < 2000 ? 18 : input.latencyMs < 6000 ? 8 : -12;
  }

  scores.reliability = statusReliability(input.status);
  scores.reliability -= (input.recentFailureCount ?? 0) * 12;
  scores.instructionFollowing -= (input.recentInvalidOutputCount ?? 0) * 10;

  return {
    coding: clamp(scores.coding),
    reasoning: clamp(scores.reasoning),
    research: clamp(scores.research),
    instructionFollowing: clamp(scores.instructionFollowing),
    context: clamp(scores.context),
    speed: clamp(scores.speed),
    reliability: clamp(scores.reliability),
    synthesis: clamp(scores.synthesis)
  };
}

export function recommendedRolesFor(capabilities: ModelCapabilities): AgentRole[] {
  const roleScores: Array<[AgentRole, number]> = [
    ["orchestrator", capabilities.reasoning * 0.4 + capabilities.context * 0.25 + capabilities.instructionFollowing * 0.2],
    ["planner", capabilities.reasoning * 0.45 + capabilities.instructionFollowing * 0.2 + capabilities.context * 0.2],
    ["builder", capabilities.coding * 0.4 + capabilities.instructionFollowing * 0.25 + capabilities.reasoning * 0.15],
    ["reviewer", capabilities.reasoning * 0.35 + capabilities.coding * 0.2 + capabilities.reliability * 0.15],
    ["synthesizer", capabilities.context * 0.35 + capabilities.reasoning * 0.35 + capabilities.instructionFollowing * 0.2]
  ];

  return roleScores
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([role]) => role);
}
