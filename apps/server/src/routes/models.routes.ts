import { Router } from "express";
import {
  clearModelSelection,
  clearModels,
  listModels,
  selectReadyFreeModels,
  setModelSelected
} from "../core/storage/modelsRepository.js";
import { discoverModels } from "../core/models/modelDiscovery.js";
import { healthCheckQueue } from "../core/models/healthCheckQueue.js";

export const modelsRouter = Router();

modelsRouter.get("/", (_req, res) => {
  res.json({
    models: listModels(),
    health: healthCheckQueue.getStats(),
    jobs: healthCheckQueue.getJobs()
  });
});

modelsRouter.post("/discover", async (_req, res, next) => {
  try {
    const result = await discoverModels();
    res.json({
      ...result,
      models: listModels(),
      health: healthCheckQueue.getStats(),
      jobs: healthCheckQueue.getJobs()
    });
  } catch (error) {
    next(error);
  }
});

modelsRouter.post("/refresh-health", (_req, res) => {
  const queued = healthCheckQueue.enqueueAllCurrent().length;
  res.json({
    queued,
    models: listModels(),
    health: healthCheckQueue.getStats(),
    jobs: healthCheckQueue.getJobs()
  });
});

modelsRouter.post("/select-ready-free", (_req, res) => {
  const selected = selectReadyFreeModels();
  res.json({ selected, models: listModels() });
});

modelsRouter.post("/clear-selection", (_req, res) => {
  clearModelSelection();
  res.json({ models: listModels() });
});

modelsRouter.delete("/cache", (_req, res) => {
  clearModels();
  res.json({ ok: true, models: [] });
});

modelsRouter.post("/:modelId/select", (req, res) => {
  const selected = Boolean(req.body?.selected);
  const model = setModelSelected(req.params.modelId, selected);
  res.json({ model, models: listModels() });
});
