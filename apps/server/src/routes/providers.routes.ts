import { Router } from "express";
import type { ProviderId } from "../core/providers/providerTypes.js";
import { listProviderConnections, updateProviderConnection } from "../core/storage/providersRepository.js";
import { deleteProviderKey, saveProviderKey } from "../core/security/keyStorage.js";
import { getSettings } from "../core/storage/settingsRepository.js";
import { refreshAllProviderStatuses, testProviderConnection } from "../core/providers/providerRegistry.js";

export const providersRouter = Router();

providersRouter.get("/", async (_req, res, next) => {
  try {
    await refreshAllProviderStatuses();
    res.json({ providers: listProviderConnections() });
  } catch (error) {
    next(error);
  }
});

providersRouter.post("/:providerId/key", (req, res, next) => {
  try {
    const providerId = req.params.providerId as ProviderId;
    const apiKey = String(req.body?.apiKey ?? "");
    const storageMode = req.body?.storageMode ?? getSettings().keyStorageMode;
    saveProviderKey(providerId, apiKey, storageMode);
    res.json({ provider: listProviderConnections().find((provider) => provider.id === providerId) });
  } catch (error) {
    next(error);
  }
});

providersRouter.post("/:providerId/test", async (req, res, next) => {
  try {
    const providerId = req.params.providerId as ProviderId;
    await testProviderConnection(providerId);
    res.json({ provider: listProviderConnections().find((provider) => provider.id === providerId) });
  } catch (error) {
    next(error);
  }
});

providersRouter.delete("/:providerId/key", (req, res, next) => {
  try {
    const providerId = req.params.providerId as ProviderId;
    deleteProviderKey(providerId);
    updateProviderConnection(providerId, {
      keySaved: false,
      keyPreview: "",
      status: "not_configured",
      message: "Key deleted."
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

providersRouter.delete("/keys/all", (_req, res, next) => {
  try {
    deleteProviderKey();
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
