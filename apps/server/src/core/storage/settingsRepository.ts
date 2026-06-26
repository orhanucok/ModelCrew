import { db } from "./db.js";

export type CrewForgeSettings = {
  theme: "system" | "light" | "dark";
  keyStorageMode: "session_only" | "encrypted_local" | "os_keychain";
  experimentalProviders: boolean;
  healthCheckConcurrency: number;
  runHistoryRetention: "keep_all" | "clear_manually";
  logs: "normal" | "verbose";
  paidModelsEnabled: boolean;
};

const defaults: CrewForgeSettings = {
  theme: "system",
  keyStorageMode: "encrypted_local",
  experimentalProviders: true,
  healthCheckConcurrency: 5,
  runHistoryRetention: "keep_all",
  logs: "normal",
  paidModelsEnabled: false
};

function readValue<T>(key: keyof CrewForgeSettings, fallback: T): T {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(String(key)) as
    | { value: string }
    | undefined;

  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

export function getSettings(): CrewForgeSettings {
  return {
    theme: readValue("theme", defaults.theme),
    keyStorageMode: readValue("keyStorageMode", defaults.keyStorageMode),
    experimentalProviders: readValue("experimentalProviders", defaults.experimentalProviders),
    healthCheckConcurrency: readValue("healthCheckConcurrency", defaults.healthCheckConcurrency),
    runHistoryRetention: readValue("runHistoryRetention", defaults.runHistoryRetention),
    logs: readValue("logs", defaults.logs),
    paidModelsEnabled: readValue("paidModelsEnabled", defaults.paidModelsEnabled)
  };
}

export function updateSettings(patch: Partial<CrewForgeSettings>): CrewForgeSettings {
  const statement = db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `);
  const now = Date.now();

  for (const [key, value] of Object.entries(patch)) {
    statement.run(key, JSON.stringify(value), now);
  }

  return getSettings();
}

export function resetSettings(): CrewForgeSettings {
  db.prepare("DELETE FROM settings").run();
  return getSettings();
}
