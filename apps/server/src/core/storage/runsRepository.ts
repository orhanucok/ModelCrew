import { db } from "./db.js";
import type { CrewRun, RunStreamEvent } from "../crew/crewTypes.js";

type RunRow = {
  id: string;
  run_mode?: CrewRun["runMode"];
  forge_config_json?: string;
  user_task: string;
  selected_models_json: string;
  state: CrewRun["state"];
  current_round: number;
  max_rounds: number;
  stop_reason?: CrewRun["stopReason"];
  blackboard_json: string;
  outputs_json: string;
  errors_json: string;
  final_answer?: string;
  events_json: string;
  created_at: number;
  updated_at: number;
};

function fromRow(row: RunRow): CrewRun & { events: RunStreamEvent[] } {
  return {
    id: row.id,
    runMode: row.run_mode ?? "forge_crew",
    forgeConfig: row.forge_config_json ? JSON.parse(row.forge_config_json) : undefined,
    userTask: row.user_task,
    selectedModels: JSON.parse(row.selected_models_json),
    state: row.state,
    currentRound: row.current_round,
    maxRounds: row.max_rounds,
    stopReason: row.stop_reason,
    blackboard: JSON.parse(row.blackboard_json),
    outputs: JSON.parse(row.outputs_json),
    errors: JSON.parse(row.errors_json),
    finalAnswer: row.final_answer ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    events: JSON.parse(row.events_json) as RunStreamEvent[]
  };
}

export function createRun(run: CrewRun): CrewRun {
  db.prepare(`
    INSERT INTO runs (
      id, run_mode, forge_config_json, user_task, selected_models_json, state, current_round, max_rounds, stop_reason,
      blackboard_json, outputs_json, errors_json, final_answer, events_json, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?)
  `).run(
    run.id,
    run.runMode,
    run.forgeConfig ? JSON.stringify(run.forgeConfig) : null,
    run.userTask,
    JSON.stringify(run.selectedModels),
    run.state,
    run.currentRound,
    run.maxRounds,
    run.stopReason ?? null,
    JSON.stringify(run.blackboard),
    JSON.stringify(run.outputs),
    JSON.stringify(run.errors),
    run.finalAnswer ?? null,
    run.createdAt,
    run.updatedAt
  );
  return run;
}

export function saveRun(run: CrewRun): void {
  db.prepare(`
    UPDATE runs
    SET run_mode = ?, forge_config_json = ?, selected_models_json = ?, state = ?, current_round = ?, max_rounds = ?, stop_reason = ?,
        blackboard_json = ?, outputs_json = ?, errors_json = ?, final_answer = ?, updated_at = ?
    WHERE id = ?
  `).run(
    run.runMode,
    run.forgeConfig ? JSON.stringify(run.forgeConfig) : null,
    JSON.stringify(run.selectedModels),
    run.state,
    run.currentRound,
    run.maxRounds,
    run.stopReason ?? null,
    JSON.stringify(run.blackboard),
    JSON.stringify(run.outputs),
    JSON.stringify(run.errors),
    run.finalAnswer ?? null,
    run.updatedAt,
    run.id
  );
}

export function appendRunEvent(runId: string, event: RunStreamEvent): void {
  const run = getRunWithEvents(runId);
  if (!run) return;
  const events = [...run.events, event];
  db.prepare("UPDATE runs SET events_json = ?, updated_at = ? WHERE id = ?").run(
    JSON.stringify(events),
    Date.now(),
    runId
  );
}

export function getRun(id: string): CrewRun | undefined {
  const run = getRunWithEvents(id);
  if (!run) return undefined;
  const { events: _events, ...cleanRun } = run;
  return cleanRun;
}

export function getRunWithEvents(id: string): (CrewRun & { events: RunStreamEvent[] }) | undefined {
  const row = db.prepare("SELECT * FROM runs WHERE id = ?").get(id) as RunRow | undefined;
  return row ? fromRow(row) : undefined;
}

export function listRuns(): CrewRun[] {
  const rows = db.prepare("SELECT * FROM runs ORDER BY created_at DESC").all() as RunRow[];
  return rows.map((row) => {
    const { events: _events, ...run } = fromRow(row);
    return run;
  });
}

export function deleteRun(id: string): void {
  db.prepare("DELETE FROM runs WHERE id = ?").run(id);
}

export function clearRuns(): void {
  db.prepare("DELETE FROM runs").run();
}
