import type { CrewModel } from "../providers/providerTypes.js";
import type { ProjectBlackboard } from "./crewTypes.js";

export function createBlackboard(userTask: string, selectedModels: CrewModel[]): ProjectBlackboard {
  const crewMode = selectedModels.length <= 1 ? "single" : selectedModels.length < 5 ? "small" : "full";

  return {
    userGoal: userTask,
    constraints: [
      "Work only with the user's task text.",
      "Do not run shell commands.",
      "Do not write files.",
      "Do not expose provider secrets."
    ],
    selectedModelIds: selectedModels.map((model) => model.id),
    crewMode,
    currentRound: 1,
    subtasks: [],
    assignments: [],
    outputs: [],
    reviewNotes: [],
    synthesisNotes: [],
    openQuestions: [],
    errors: []
  };
}
