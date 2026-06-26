import type { ModelPricing, ModelStatus, ProviderStatus, RunState } from "./types";

export function formatDate(value?: number): string {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(value);
}

export function formatDuration(start?: number, end?: number): string {
  if (!start || !end) return "In progress";
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function titleCase(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function statusTone(status: ModelStatus | ProviderStatus | RunState): "green" | "yellow" | "red" | "blue" | "gray" {
  if (["ready", "completed"].includes(status)) return "green";
  if (["checking", "planning", "assigning", "running_agents", "reviewing", "repairing", "synthesizing"].includes(status)) {
    return "blue";
  }
  if (["busy", "slow", "rate_limited", "cooldown", "experimental"].includes(status)) return "yellow";
  if (["key_required", "paid_locked", "not_configured", "created"].includes(status)) return "gray";
  return "red";
}

export function pricingLabel(pricing: ModelPricing): string {
  return titleCase(pricing);
}
