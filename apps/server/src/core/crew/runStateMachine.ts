import type { CrewRun, RunState } from "./crewTypes.js";
import { saveRun } from "../storage/runsRepository.js";
import { emitRunEvent } from "./runEvents.js";

export function setRunState(run: CrewRun, state: RunState): CrewRun {
  run.state = state;
  run.updatedAt = Date.now();
  saveRun(run);
  emitRunEvent({
    type: "state_changed",
    runId: run.id,
    state,
    timestamp: Date.now()
  });
  return run;
}
