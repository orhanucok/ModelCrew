import type { ModelCapabilities } from "../lib/types";
import { titleCase } from "../lib/formatters";

type Props = {
  capabilities: ModelCapabilities;
};

const keys: Array<keyof ModelCapabilities> = [
  "coding",
  "reasoning",
  "instructionFollowing",
  "context",
  "speed",
  "reliability"
];

export function CapabilityScoreRow({ capabilities }: Props) {
  return (
    <div className="score-grid">
      {keys.map((key) => (
        <div className="score-row" key={key}>
          <span>{titleCase(key)}</span>
          <div className="score-track">
            <div className="score-fill" style={{ width: `${capabilities[key]}%` }} />
          </div>
          <strong>{capabilities[key]}</strong>
        </div>
      ))}
    </div>
  );
}
