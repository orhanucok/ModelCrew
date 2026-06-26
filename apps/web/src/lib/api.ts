import type { CrewForgeSettings, CrewModel, CrewRun, ForgeCrewConfig, HealthStats, ProviderConnection } from "./types";

const defaultApiBase = typeof window === "undefined" ? "http://127.0.0.1:8787" : window.location.origin;

export const API_BASE = import.meta.env.VITE_API_BASE || defaultApiBase;

function friendlyMessage(message?: string): string {
  if (!message) return "Request failed.";
  if (message.toLowerCase() === "fetch failed") {
    return "Provider connection failed. Check internet access, the saved API key, or provider availability.";
  }
  return message;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  } catch {
    throw new Error("CrewForge local server connection failed. Make sure pnpm dev is running and open the app from the shown localhost URL.");
  }

  const data = (await response.json().catch(() => ({}))) as { message?: string };
  if (!response.ok) {
    throw new Error(friendlyMessage(data.message));
  }
  return data as T;
}

export const api = {
  providers: () => request<{ providers: ProviderConnection[] }>("/api/providers"),
  saveProviderKey: (providerId: string, apiKey: string, storageMode: string) =>
    request<{ provider: ProviderConnection }>(`/api/providers/${providerId}/key`, {
      method: "POST",
      body: JSON.stringify({ apiKey, storageMode })
    }),
  testProvider: (providerId: string) =>
    request<{ provider: ProviderConnection }>(`/api/providers/${providerId}/test`, { method: "POST" }),
  deleteProviderKey: (providerId: string) =>
    request<{ ok: boolean }>(`/api/providers/${providerId}/key`, { method: "DELETE" }),

  models: () =>
    request<{ models: CrewModel[]; health: HealthStats; jobs: unknown[] }>("/api/models"),
  discoverModels: () =>
    request<{ models: CrewModel[]; health: HealthStats; discovered: number; queued: number; errors: Array<{ message: string }> }>(
      "/api/models/discover",
      { method: "POST" }
    ),
  refreshHealth: () =>
    request<{ models: CrewModel[]; health: HealthStats; queued: number }>("/api/models/refresh-health", { method: "POST" }),
  selectModel: (modelId: string, selected: boolean) =>
    request<{ models: CrewModel[] }>(`/api/models/${encodeURIComponent(modelId)}/select`, {
      method: "POST",
      body: JSON.stringify({ selected })
    }),
  selectReadyFree: () => request<{ models: CrewModel[] }>("/api/models/select-ready-free", { method: "POST" }),
  clearSelection: () => request<{ models: CrewModel[] }>("/api/models/clear-selection", { method: "POST" }),
  clearModelCache: () => request<{ ok: boolean }>("/api/models/cache", { method: "DELETE" }),

  settings: () => request<{ settings: CrewForgeSettings }>("/api/settings"),
  updateSettings: (patch: Partial<CrewForgeSettings>) =>
    request<{ settings: CrewForgeSettings }>("/api/settings", {
      method: "PATCH",
      body: JSON.stringify(patch)
    }),
  resetSettings: () => request<{ settings: CrewForgeSettings }>("/api/settings/reset", { method: "POST" }),
  deleteSavedKeys: () => request<{ ok: boolean }>("/api/settings/saved-keys", { method: "DELETE" }),
  clearRunHistory: () => request<{ ok: boolean }>("/api/settings/run-history", { method: "DELETE" }),

  singleChat: (
    modelId: string,
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>
  ) =>
    request<{ modelId: string; providerId: string; content: string; createdAt: number }>("/api/chat/single", {
      method: "POST",
      body: JSON.stringify({ modelId, messages })
    }),
  startForgeRun: (task: string, config: ForgeCrewConfig) =>
    request<{ runId: string; eventStreamUrl: string }>("/api/runs", {
      method: "POST",
      body: JSON.stringify({ mode: "forge_crew", task, config })
    }),
  runs: () => request<{ runs: CrewRun[] }>("/api/runs"),
  run: (runId: string) => request<{ run: CrewRun }>(`/api/runs/${runId}`),
  deleteRun: (runId: string) => request<{ ok: boolean }>(`/api/runs/${runId}`, { method: "DELETE" })
};
