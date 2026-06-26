import { Clock3, Trash2 } from "lucide-react";
import type { CrewRun } from "../lib/types";
import { formatDate, formatDuration, titleCase } from "../lib/formatters";
import { ModelStatusBadge } from "./ModelStatusBadge";

type Props = {
  run: CrewRun;
  selected?: boolean;
  onOpen: () => void;
  onDelete: () => void;
};

export function RunCard({ run, selected, onOpen, onDelete }: Props) {
  const title = run.userTask.slice(0, 90) || "Untitled run";

  return (
    <article className={`card run-card ${selected ? "selected" : ""}`}>
      <button type="button" className="run-main" onClick={onOpen}>
        <div className="card-header">
          <div>
            <h3>{title}</h3>
            <p>{formatDate(run.createdAt)}</p>
          </div>
          <ModelStatusBadge status={run.state} />
        </div>
        <div className="run-meta">
          <span>
            <Clock3 size={14} />
            {formatDuration(run.createdAt, run.state === "completed" || run.state === "failed" ? run.updatedAt : undefined)}
          </span>
          <span>{run.runMode === "chat" ? "Chat Mode" : "Forge Crew"}</span>
          <span>{titleCase(run.blackboard.crewMode)}</span>
          <span>{run.selectedModels.length} models</span>
        </div>
      </button>
      <button type="button" className="icon-button danger" onClick={onDelete} title="Delete run" aria-label="Delete run">
        <Trash2 size={16} />
      </button>
    </article>
  );
}
