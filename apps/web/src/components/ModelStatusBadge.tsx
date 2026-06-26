import { AlertCircle, CheckCircle2, Clock3, KeyRound, Loader2 } from "lucide-react";
import type { ModelStatus, ProviderStatus, RunState } from "../lib/types";
import { statusTone, titleCase } from "../lib/formatters";

type Props = {
  status: ModelStatus | ProviderStatus | RunState;
};

export function ModelStatusBadge({ status }: Props) {
  const tone = statusTone(status);
  const Icon =
    status === "ready" || status === "completed"
      ? CheckCircle2
      : status === "checking"
        ? Loader2
        : ["key_required", "paid_locked", "not_configured"].includes(status)
          ? KeyRound
          : ["busy", "slow", "rate_limited", "cooldown", "experimental"].includes(status)
            ? Clock3
            : AlertCircle;

  return (
    <span className={`badge badge-${tone}`}>
      <Icon size={14} className={status === "checking" ? "spin" : ""} />
      {status === "checking" ? "Checking..." : titleCase(status)}
    </span>
  );
}
