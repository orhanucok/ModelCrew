import { EventEmitter } from "node:events";
import type { RunStreamEvent } from "./crewTypes.js";
import { appendRunEvent, getRunWithEvents } from "../storage/runsRepository.js";
import { redactSecrets } from "../security/secretsRedactor.js";

const emitter = new EventEmitter();
emitter.setMaxListeners(200);

export function emitRunEvent(event: RunStreamEvent): void {
  const safeEvent = JSON.parse(redactSecrets(JSON.stringify(event))) as RunStreamEvent;
  appendRunEvent(safeEvent.runId, safeEvent);
  emitter.emit(safeEvent.runId, safeEvent);
}

export function subscribeToRunEvents(runId: string, listener: (event: RunStreamEvent) => void): () => void {
  emitter.on(runId, listener);
  return () => emitter.off(runId, listener);
}

export function getStoredRunEvents(runId: string): RunStreamEvent[] {
  return getRunWithEvents(runId)?.events ?? [];
}
