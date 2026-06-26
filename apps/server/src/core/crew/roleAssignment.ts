import type { AgentRole, CrewModel } from "../providers/providerTypes.js";
import type { AgentAssignment } from "./crewTypes.js";

const mvpRoles: AgentRole[] = ["orchestrator", "planner", "worker", "reviewer", "synthesizer"];

function roleFit(role: AgentRole, model: CrewModel): number {
  const c = model.capabilities;
  switch (role) {
    case "orchestrator":
      return c.reasoning * 0.4 + c.context * 0.25 + c.instructionFollowing * 0.2 + c.speed * 0.1 + c.coding * 0.05;
    case "planner":
      return c.reasoning * 0.45 + c.instructionFollowing * 0.2 + c.context * 0.2 + c.research * 0.1 + c.speed * 0.05;
    case "builder":
    case "worker":
      return c.coding * 0.4 + c.instructionFollowing * 0.25 + c.reasoning * 0.15 + c.context * 0.1 + c.speed * 0.1;
    case "reviewer":
      return c.reasoning * 0.35 + c.coding * 0.2 + c.instructionFollowing * 0.2 + c.reliability * 0.15 + c.context * 0.1;
    case "synthesizer":
      return c.context * 0.6 + c.reasoning * 0.2 + c.instructionFollowing * 0.12 + c.reliability * 0.08 + (model.contextWindow ?? 0) / 20_000;
    default:
      return model.recommendationScore;
  }
}

export function assignRoles(models: CrewModel[]): AgentAssignment[] {
  const readyModels = models.filter((model) => model.status === "ready" && model.selectable);
  if (readyModels.length === 0) return [];

  const assignments: AgentAssignment[] = [];
  const used = new Set<string>();
  const allowReuse = readyModels.length < mvpRoles.length;

  for (const role of mvpRoles) {
    const candidates = [...readyModels]
      .filter((model) => allowReuse || !used.has(model.id))
      .sort((a, b) => roleFit(role, b) - roleFit(role, a) || b.recommendationScore - a.recommendationScore);

    const model = candidates[0] ?? readyModels[0];
    used.add(model.id);
    assignments.push({
      role,
      modelId: model.id,
      providerId: model.provider,
      score: Math.round(roleFit(role, model))
    });
  }

  return assignments;
}
