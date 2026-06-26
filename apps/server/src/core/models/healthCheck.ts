import type { ModelStatus } from "../providers/providerTypes.js";

export function isTerminalBrokenStatus(status: ModelStatus): boolean {
  return ["broken", "passive", "failed", "unavailable"].includes(status);
}

export function shouldRetryHealthCheck(status: ModelStatus): boolean {
  return ["failed", "slow", "busy", "unavailable"].includes(status);
}

export function cacheTtlFor(status: ModelStatus): number {
  return status === "ready" ? 5 * 60 * 1000 : 2 * 60 * 1000;
}

export function userBucketForStatus(status: ModelStatus): "ready" | "transient" | "locked" | "broken" | "checking" {
  if (status === "checking") return "checking";
  if (status === "ready") return "ready";
  if (["busy", "slow", "rate_limited", "cooldown"].includes(status)) return "transient";
  if (["key_required", "paid_locked"].includes(status)) return "locked";
  return "broken";
}
