import type { CrewModel, ModelStatus } from "../providers/providerTypes.js";

function statusBonus(status: ModelStatus): number {
  switch (status) {
    case "ready":
      return 25;
    case "busy":
      return -10;
    case "slow":
      return -5;
    case "rate_limited":
      return -20;
    case "cooldown":
      return -25;
    case "key_required":
    case "paid_locked":
      return -35;
    case "checking":
      return -50;
    default:
      return -100;
  }
}

export function recommendationScore(model: Pick<CrewModel, "capabilities" | "status" | "pricing" | "recentFailureCount">): number {
  const c = model.capabilities;
  const paidPenalty = ["paid", "key_required"].includes(model.pricing) ? 30 : 0;
  const recentFailurePenalty = (model.recentFailureCount ?? 0) * 12;

  return Math.round(
    c.coding * 0.25 +
      c.reasoning * 0.25 +
      c.instructionFollowing * 0.15 +
      c.context * 0.15 +
      c.speed * 0.1 +
      c.reliability * 0.1 +
      statusBonus(model.status) -
      recentFailurePenalty -
      paidPenalty
  );
}
