import type { AIMessage, AgentRole } from "../providers/providerTypes.js";
import type { ProjectBlackboard } from "./crewTypes.js";
import { estimateTokens } from "../../utils/tokenEstimate.js";

function compactOutputs(role: AgentRole, blackboard: ProjectBlackboard): string {
  if (role === "synthesizer") {
    return blackboard.outputs
      .map((output, index) => {
        const prefix = `${index + 1}. ${output.role} via ${output.modelId}`;
        return `${prefix}:\n${output.content.slice(0, 2600)}`;
      })
      .join("\n\n");
  }

  if (role === "reviewer") {
    return blackboard.outputs
      .filter((output) => ["planner", "worker", "builder"].includes(output.role))
      .slice(-8)
      .map((output, index) => `${index + 1}. ${output.role} via ${output.modelId}:\n${output.content.slice(0, 1800)}`)
      .join("\n\n");
  }

  return blackboard.outputs
    .slice(-4)
    .map((output) => `${output.role}: ${output.content.slice(0, 1400)}`)
    .join("\n\n");
}

export function buildAgentMessages(args: {
  role: AgentRole;
  roleInstruction: string;
  blackboard: ProjectBlackboard;
  currentSubtask?: string;
  reviewerNotes?: string[];
  stricter?: boolean;
}): AIMessage[] {
  const previous = compactOutputs(args.role, args.blackboard);
  const notes = args.reviewerNotes?.length ? args.reviewerNotes.join("\n") : args.blackboard.reviewNotes.join("\n");
  const payload = [
    `Original user task:\n${args.blackboard.userGoal}`,
    `Current role:\n${args.role}`,
    `Role instruction:\n${args.roleInstruction}`,
    args.currentSubtask ? `Current subtask:\n${args.currentSubtask}` : "",
    `Relevant constraints:\n${args.blackboard.constraints.join("\n")}`,
    previous ? `Relevant previous outputs:\n${previous}` : "",
    notes ? `Reviewer notes:\n${notes}` : "",
    `Expected JSON shape:
{
  "content": "main answer for this role",
  "confidence": 0.0,
  "issues": [],
  "assumptions": [],
  "missingInfo": [],
  "suggestedNextAction": "continue"
}`
  ]
    .filter(Boolean)
    .join("\n\n");

  const maxChars = args.role === "synthesizer" ? 42_000 : args.role === "reviewer" ? 30_000 : 18_000;
  const trimmedPayload = estimateTokens(payload) > maxChars / 4 ? payload.slice(0, maxChars) : payload;

  return [
    {
      role: "system",
      content: `You are a CrewForge ${args.role}. Return JSON only. No markdown fences. ${
        args.stricter ? "The previous response was invalid; return valid compact JSON and nothing else." : ""
      }`
    },
    {
      role: "user",
      content: trimmedPayload
    }
  ];
}
