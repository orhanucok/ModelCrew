import type { CrewModel } from "../providers/providerTypes.js";
import { listProviders, refreshProviderStatus } from "../providers/providerRegistry.js";
import { getSettings } from "../storage/settingsRepository.js";
import { upsertModels } from "../storage/modelsRepository.js";
import { healthCheckQueue } from "./healthCheckQueue.js";
import { logger } from "../../utils/logger.js";
import { asUserMessage } from "../../utils/errors.js";

export type DiscoveryResult = {
  discovered: number;
  queued: number;
  models: CrewModel[];
  errors: Array<{ providerId: string; message: string }>;
};

export async function discoverModels(): Promise<DiscoveryResult> {
  const settings = getSettings();
  const models: CrewModel[] = [];
  const errors: DiscoveryResult["errors"] = [];

  for (const provider of listProviders()) {
    if (provider.experimental && !settings.experimentalProviders) {
      continue;
    }

    try {
      await refreshProviderStatus(provider.id);
      const providerModels = await provider.listModels();
      models.push(...providerModels);
    } catch (error) {
      logger.warn(`Model discovery failed for ${provider.id}`, error);
      errors.push({
        providerId: provider.id,
        message: asUserMessage(error)
      });
    }
  }

  upsertModels(models);
  const queued = healthCheckQueue.enqueue(models).length;

  return {
    discovered: models.length,
    queued,
    models,
    errors
  };
}
