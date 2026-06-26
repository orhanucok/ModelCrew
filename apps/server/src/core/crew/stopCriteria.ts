import type { AgentOutput, RunQualityScore } from "./crewTypes.js";

export function scoreRunQuality(outputs: AgentOutput[]): RunQualityScore {
  const reviewer = [...outputs].reverse().find((output: AgentOutput) => output.role === "reviewer");
  const builder = [...outputs].reverse().find((output: AgentOutput) => output.role === "worker" || output.role === "builder");
  const issueCount = reviewer?.issues.length ?? 0;
  const missingCount = reviewer?.missingInfo.length ?? 0;
  const builderConfidence = builder?.confidence ?? 0.6;
  const reviewerConfidence = reviewer?.confidence ?? 0.6;

  const completeness = Math.round(Math.min(95, builderConfidence * 75 + Math.max(0, 20 - missingCount * 8)));
  const correctness = Math.round(Math.min(95, reviewerConfidence * 70 + Math.max(0, 25 - issueCount * 7)));
  const clarity = Math.round(Math.min(95, ((builder?.content.length ?? 0) > 400 ? 78 : 62) + reviewerConfidence * 10));
  const riskLevel = issueCount >= 4 || missingCount >= 3 ? "high" : issueCount >= 2 ? "medium" : "low";

  return {
    completeness,
    correctness,
    clarity,
    riskLevel,
    needsAnotherRound: !(completeness >= 80 && correctness >= 75 && riskLevel !== "high")
  };
}
