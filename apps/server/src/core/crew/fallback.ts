import type { AgentRole, CrewModel } from "../providers/providerTypes.js";
import type { FallbackPolicy } from "./crewTypes.js";

export const defaultFallbackPolicy: FallbackPolicy = {
  maxRetriesPerModel: 1,
  retryDelayMs: 1000,
  fallbackToSameRoleModel: true,
  fallbackToAnyReadyModel: true,
  allowPaidFallback: false
};

export function findFallbackModel(args: {
  models: CrewModel[];
  currentModelId: string;
  role: AgentRole;
  policy?: FallbackPolicy;
}): CrewModel | undefined {
  const policy = args.policy ?? defaultFallbackPolicy;
  const ready = args.models.filter((model) => {
    if (model.id === args.currentModelId) return false;
    if (model.status !== "ready" || !model.selectable) return false;
    if (!policy.allowPaidFallback && ["paid", "key_required"].includes(model.pricing)) return false;
    return true;
  });

  if (policy.fallbackToSameRoleModel) {
    const sameRole = ready
      .filter((model) => model.recommendedRoles.includes(args.role))
      .sort((a, b) => b.recommendationScore - a.recommendationScore)[0];
    if (sameRole) return sameRole;
  }

  if (policy.fallbackToAnyReadyModel) {
    return ready.sort((a, b) => b.recommendationScore - a.recommendationScore)[0];
  }

  return undefined;
}
