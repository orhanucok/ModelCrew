import { UsersRound } from "lucide-react";
import type { CrewModel } from "../lib/types";
import { titleCase } from "../lib/formatters";

type Props = {
  models: CrewModel[];
};

export function CrewSummary({ models }: Props) {
  const ready = models.filter((model) => model.selected && model.status === "ready" && model.selectable);
  const mode = ready.length <= 1 ? "single-model" : ready.length < 5 ? "small crew" : "full crew";

  return (
    <section className="crew-summary">
      <div>
        <UsersRound size={18} />
        <strong>{ready.length} selected</strong>
        <span>{mode}</span>
      </div>
      <div className="crew-chips">
        {ready.length ? ready.map((model) => <span key={model.id}>{model.displayName}</span>) : <span>No Ready model selected</span>}
      </div>
      {ready.length === 0 ? (
        <p>No usable model is selected. Go to Models and select at least one Ready model.</p>
      ) : ready.length === 1 ? (
        <p>Only one usable model is available. CrewForge will run in single-model crew mode.</p>
      ) : (
        <p>CrewForge will distribute work across your selected AI crew.</p>
      )}
    </section>
  );
}
