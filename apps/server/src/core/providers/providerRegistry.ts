import type { AIProvider, ProviderId } from "./providerTypes.js";
import { providerPriority } from "./providerTypes.js";
import { AnthropicProvider } from "./anthropicProvider.js";
import { G4FProvider } from "./g4fProvider.js";
import { GeminiProvider } from "./geminiProvider.js";
import { GroqProvider } from "./groqProvider.js";
import { OllamaProvider } from "./ollamaProvider.js";
import { OpenAIProvider } from "./openAIProvider.js";
import { OpenRouterProvider } from "./openRouterProvider.js";
import { XAIProvider } from "./xaiProvider.js";
import { ensureProviders, updateProviderConnection } from "../storage/providersRepository.js";
import { logger } from "../../utils/logger.js";
import { asUserMessage } from "../../utils/errors.js";

const providers: Record<ProviderId, AIProvider> = {
  g4f: new G4FProvider(),
  openrouter: new OpenRouterProvider(),
  gemini: new GeminiProvider(),
  groq: new GroqProvider(),
  openai: new OpenAIProvider(),
  anthropic: new AnthropicProvider(),
  xai: new XAIProvider(),
  ollama: new OllamaProvider()
};

export function initializeProviderRegistry(): void {
  ensureProviders(
    providerPriority.map((id) => ({
      id,
      displayName: providers[id].displayName,
      requiresApiKey: providers[id].requiresApiKey,
      experimental: providers[id].experimental
    }))
  );
}

export function getProvider(id: ProviderId): AIProvider {
  return providers[id];
}

export function listProviders(): AIProvider[] {
  return providerPriority.map((id) => providers[id]);
}

export async function refreshProviderStatus(id: ProviderId): Promise<void> {
  const provider = getProvider(id);
  try {
    const status = await provider.getStatus();
    updateProviderConnection(id, {
      status,
      lastTestedAt: Date.now(),
      message:
        status === "ready"
          ? "Key saved. Use Test to verify provider connection."
          : status === "experimental"
            ? "Experimental public provider."
            : status === "not_configured"
              ? "Not configured."
              : "Provider is not ready."
    });
  } catch (error) {
    logger.warn(`Provider status check failed for ${id}`, error);
    updateProviderConnection(id, {
      status: "failed",
      lastTestedAt: Date.now(),
      message: "Connection failed."
    });
  }
}

export async function testProviderConnection(id: ProviderId): Promise<void> {
  const provider = getProvider(id);
  try {
    const status = await provider.getStatus();

    if (status === "not_configured") {
      updateProviderConnection(id, {
        status,
        lastTestedAt: Date.now(),
        message: "Not configured."
      });
      return;
    }

    if (provider.experimental) {
      updateProviderConnection(id, {
        status,
        lastTestedAt: Date.now(),
        message: "Experimental public provider. Discovery will verify individual models."
      });
      return;
    }

    const models = await provider.listModels();
    updateProviderConnection(id, {
      status: "ready",
      lastTestedAt: Date.now(),
      message: models.length ? `Connection ready. ${models.length} models found.` : "Connection ready. No usable text models found yet."
    });
  } catch (error) {
    logger.warn(`Provider connection test failed for ${id}`, error);
    updateProviderConnection(id, {
      status: "failed",
      lastTestedAt: Date.now(),
      message: asUserMessage(error)
    });
  }
}

export async function refreshAllProviderStatuses(): Promise<void> {
  await Promise.all(providerPriority.map((id) => refreshProviderStatus(id)));
}
