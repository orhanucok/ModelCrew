import { db, secretPath } from "../storage/db.js";
import type { ProviderId } from "../providers/providerTypes.js";
import type { CrewForgeSettings } from "../storage/settingsRepository.js";
import { decryptText, encryptText } from "./encryption.js";
import { keyPreview } from "./secretsRedactor.js";
import { deleteProviderKeyMetadata, updateProviderConnection } from "../storage/providersRepository.js";

type KeyStorageMode = CrewForgeSettings["keyStorageMode"];

const sessionKeys = new Map<ProviderId, string>();

export function saveProviderKey(providerId: ProviderId, apiKey: string, mode: KeyStorageMode): void {
  const trimmed = apiKey.trim();
  const now = Date.now();

  if (!trimmed) {
    throw new Error("API key is empty.");
  }

  if (mode === "session_only" || mode === "os_keychain") {
    sessionKeys.set(providerId, trimmed);
    db.prepare(`
      INSERT INTO provider_keys (provider_id, storage_mode, encrypted_key, key_preview, updated_at)
      VALUES (?, ?, NULL, ?, ?)
      ON CONFLICT(provider_id) DO UPDATE SET
        storage_mode = excluded.storage_mode,
        encrypted_key = NULL,
        key_preview = excluded.key_preview,
        updated_at = excluded.updated_at
    `).run(providerId, mode, keyPreview(trimmed), now);
  } else {
    sessionKeys.delete(providerId);
    db.prepare(`
      INSERT INTO provider_keys (provider_id, storage_mode, encrypted_key, key_preview, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(provider_id) DO UPDATE SET
        storage_mode = excluded.storage_mode,
        encrypted_key = excluded.encrypted_key,
        key_preview = excluded.key_preview,
        updated_at = excluded.updated_at
    `).run(providerId, mode, encryptText(trimmed, secretPath), keyPreview(trimmed), now);
  }

  updateProviderConnection(providerId, {
    keySaved: true,
    keyPreview: keyPreview(trimmed),
    message:
      mode === "os_keychain"
        ? "OS keychain mode is coming later; this key is kept for this session only."
        : "Key saved locally."
  });
}

export function getProviderKey(providerId: ProviderId): string | undefined {
  const sessionValue = sessionKeys.get(providerId);
  if (sessionValue) return sessionValue;

  const row = db
    .prepare("SELECT storage_mode, encrypted_key FROM provider_keys WHERE provider_id = ?")
    .get(providerId) as { storage_mode: KeyStorageMode; encrypted_key?: string } | undefined;

  if (!row) return undefined;
  if (row.storage_mode !== "encrypted_local" || !row.encrypted_key) return undefined;
  return decryptText(row.encrypted_key, secretPath);
}

export function hasProviderKey(providerId: ProviderId): boolean {
  return Boolean(getProviderKey(providerId));
}

export function deleteProviderKey(providerId?: ProviderId): void {
  if (providerId) {
    sessionKeys.delete(providerId);
    db.prepare("DELETE FROM provider_keys WHERE provider_id = ?").run(providerId);
    updateProviderConnection(providerId, {
      keySaved: false,
      keyPreview: "",
      status: "not_configured",
      message: "Key deleted."
    });
    return;
  }

  sessionKeys.clear();
  db.prepare("DELETE FROM provider_keys").run();
  deleteProviderKeyMetadata();
}
