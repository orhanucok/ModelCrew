import { Router } from "express";
import { clearRuns, deleteRun, getRun, listRuns } from "../core/storage/runsRepository.js";
import { getStoredRunEvents, subscribeToRunEvents } from "../core/crew/runEvents.js";
import { createForgeCrewRun, runCrew, cancelRun } from "../core/crew/orchestrator.js";
import { userError } from "../utils/errors.js";

export const runsRouter = Router();

runsRouter.delete("/:runId/cancel", (req, res) => {
  const stopped = cancelRun(req.params.runId);
  res.json({ ok: stopped });
});

runsRouter.get("/", (_req, res) => {
  res.json({ runs: listRuns() });
});

runsRouter.post("/", (req, res, next) => {
  try {
    if (req.body?.mode !== "forge_crew") {
      throw userError("Forge Crew runs must use mode forge_crew.");
    }

    const task = String(req.body?.task ?? "").trim();
    if (!task) throw userError("Write a task before starting a Forge Crew run.");

    const config = req.body?.config;
    if (!config || typeof config !== "object") {
      throw userError("Choose models for every Forge Crew role before running.");
    }

    const workerCount = Math.max(1, Math.min(5, Number(config.workerCount ?? 2)));
    const workerModelIds: string[] = Array.isArray(config.workerModelIds)
      ? config.workerModelIds.map((modelId: unknown) => String(modelId)).slice(0, workerCount)
      : [];
    if (!config.orchestratorModelId || !config.plannerModelId || !config.reviewerModelId || !config.synthesizerModelId) {
      throw userError("Choose models for Orchestrator, Planner, Reviewer, and Synthesizer.");
    }
    if (workerModelIds.length !== workerCount || workerModelIds.some((modelId) => !modelId)) {
      throw userError("Choose one selected model for each Worker.");
    }

    const run = createForgeCrewRun(task, {
      orchestratorModelId: String(config.orchestratorModelId),
      plannerModelId: String(config.plannerModelId),
      workerCount,
      workerModelIds,
      reviewerModelId: String(config.reviewerModelId),
      synthesizerModelId: String(config.synthesizerModelId)
    });

    res.status(201).json({
      runId: run.id,
      eventStreamUrl: `/api/runs/${run.id}/events`
    });
    setImmediate(() => {
      void runCrew(run.id);
    });
  } catch (error) {
    next(error);
  }
});

runsRouter.delete("/", (_req, res) => {
  clearRuns();
  res.json({ ok: true });
});

runsRouter.get("/:runId/events", (req, res) => {
  const runId = req.params.runId;
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive"
  });

  const send = (event: unknown) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  for (const event of getStoredRunEvents(runId)) {
    send(event);
  }

  const heartbeat = setInterval(() => {
    res.write(": keep-alive\n\n");
  }, 15_000);

  const unsubscribe = subscribeToRunEvents(runId, send);
  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  });
});

runsRouter.get("/:runId", (req, res) => {
  const run = getRun(req.params.runId);
  if (!run) {
    res.status(404).json({ message: "Run not found." });
    return;
  }
  res.json({ run });
});

runsRouter.delete("/:runId", (req, res) => {
  deleteRun(req.params.runId);
  res.json({ ok: true });
});
