import { Router } from "express";
import { getSettings, resetSettings, updateSettings } from "../core/storage/settingsRepository.js";
import { deleteProviderKey } from "../core/security/keyStorage.js";
import { clearModels } from "../core/storage/modelsRepository.js";
import { clearRuns } from "../core/storage/runsRepository.js";

export const settingsRouter = Router();

settingsRouter.get("/", (_req, res) => {
  res.json({ settings: getSettings() });
});

settingsRouter.patch("/", (req, res) => {
  res.json({ settings: updateSettings(req.body ?? {}) });
});

settingsRouter.post("/reset", (_req, res) => {
  res.json({ settings: resetSettings() });
});

settingsRouter.delete("/saved-keys", (_req, res) => {
  deleteProviderKey();
  res.json({ ok: true });
});

settingsRouter.delete("/model-cache", (_req, res) => {
  clearModels();
  res.json({ ok: true });
});

settingsRouter.delete("/run-history", (_req, res) => {
  clearRuns();
  res.json({ ok: true });
});
