import { Bot, CheckCircle2, Loader2 } from "lucide-react";
import type { AgentRole } from "../lib/types";
import { titleCase } from "../lib/formatters";

type Props = {
  role: AgentRole;
  modelId?: string;
  status: "running" | "completed";
  content?: string;
};

export function AgentProgressBubble({ role, modelId, status, content }: Props) {
  return (
    <article className="agent-bubble">
      <div className="agent-head">
        {status === "running" ? <Loader2 className="spin" size={16} /> : <CheckCircle2 size={16} />}
        <strong>{titleCase(role)}</strong>
        {modelId ? <span>{modelId}</span> : null}
      </div>
      {content ? <p>{content}</p> : <p className="muted">Working...</p>}
    </article>
  );
}
