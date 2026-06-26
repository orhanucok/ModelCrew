import { Lock, Star, ToggleLeft, ToggleRight } from "lucide-react";
import type { CrewModel } from "../lib/types";
import { formatDate, pricingLabel, titleCase } from "../lib/formatters";
import { CapabilityScoreRow } from "./CapabilityScoreRow";
import { ModelStatusBadge } from "./ModelStatusBadge";

type Props = {
  model: CrewModel;
  onSelect: (modelId: string, selected: boolean) => void;
};

export function ModelCard({ model, onSelect }: Props) {
  const locked = !model.selectable;

  return (
    <article className={`card model-card ${model.selected ? "selected" : ""}`}>
      <div className="card-header">
        <div>
          <h3>{model.displayName}</h3>
          <p>
            {titleCase(model.provider)} · {titleCase(model.kind)} · {pricingLabel(model.pricing)}
          </p>
        </div>
        <ModelStatusBadge status={model.status} />
      </div>

      <div className="model-line">
        <span className="score-pill">
          <Star size={14} />
          {model.recommendationScore}
        </span>
        <span>{model.recommendedRoles.map(titleCase).join(", ") || "Role fit pending"}</span>
      </div>

      <CapabilityScoreRow capabilities={model.capabilities} />

      <div className="model-footer">
        <span>Checked {formatDate(model.lastCheckedAt)}</span>
        <button
          type="button"
          className={`toggle-button ${model.selected ? "on" : ""}`}
          disabled={locked}
          onClick={() => onSelect(model.id, !model.selected)}
          title={locked ? "Locked until ready" : model.selected ? "Remove from crew" : "Add to crew"}
        >
          {locked ? <Lock size={16} /> : model.selected ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
          {locked ? "Locked" : model.selected ? "Selected" : "Select"}
        </button>
      </div>
    </article>
  );
}
