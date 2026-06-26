import { db } from "./db.js";
import type { ProviderConnection, ProviderId, ProviderStatus } from "../providers/providerTypes.js";

type ProviderMeta = {
  id: ProviderId;
  displayName: string;
  requiresApiKey: boolean;
  experimental?: boolean;
};

type ProviderRow = {
  id: ProviderId;
  display_name: string;
  requires_api_key: number;
  experimental: number;
  status: ProviderStatus;
  key_saved: number;
  key_preview?: string;
  last_tested_at?: number;
  message?: string;
};

export function ensureProviders(providers: ProviderMeta[]): void {
  const statement = db.prepare(`
    INSERT INTO providers (
      id, display_name, requires_api_key, experimental, status, key_saved, updated_at
    )
    VALUES (?, ?, ?, ?, ?, 0, ?)
    ON CONFLICT(id) DO UPDATE SET
      display_name = excluded.display_name,
      requires_api_key = excluded.requires_api_key,
      experimental = excluded.experimental,
      updated_at = excluded.updated_at
  `);
  const now = Date.now();

  for (const provider of providers) {
    statement.run(
      provider.id,
      provider.displayName,
      provider.requiresApiKey ? 1 : 0,
      provider.experimental ? 1 : 0,
      provider.experimental ? "experimental" : "not_configured",
      now
    );
  }
}

export function listProviderConnections(): ProviderConnection[] {
  const rows = db.prepare("SELECT * FROM providers ORDER BY experimental DESC, display_name").all() as ProviderRow[];
  return rows.map((row) => ({
    id: row.id,
    displayName: row.display_name,
    requiresApiKey: Boolean(row.requires_api_key),
    experimental: Boolean(row.experimental),
    status: row.status,
    keySaved: Boolean(row.key_saved),
    keyPreview: row.key_preview,
    lastTestedAt: row.last_tested_at,
    message: row.message
  }));
}

export function updateProviderConnection(
  id: ProviderId,
  patch: Partial<Pick<ProviderConnection, "status" | "keySaved" | "keyPreview" | "lastTestedAt" | "message">>
): void {
  const current = db.prepare("SELECT * FROM providers WHERE id = ?").get(id) as ProviderRow | undefined;
  if (!current) return;

  db.prepare(`
    UPDATE providers
    SET status = ?, key_saved = ?, key_preview = ?, last_tested_at = ?, message = ?, updated_at = ?
    WHERE id = ?
  `).run(
    patch.status ?? current.status,
    patch.keySaved === undefined ? current.key_saved : patch.keySaved ? 1 : 0,
    patch.keyPreview ?? current.key_preview ?? null,
    patch.lastTestedAt ?? current.last_tested_at ?? null,
    patch.message ?? current.message ?? null,
    Date.now(),
    id
  );
}

export function deleteProviderKeyMetadata(providerId?: ProviderId): void {
  if (providerId) {
    db.prepare("DELETE FROM provider_keys WHERE provider_id = ?").run(providerId);
    updateProviderConnection(providerId, {
      keySaved: false,
      keyPreview: undefined,
      status: "not_configured",
      message: "Key deleted."
    });
    return;
  }

  db.prepare("DELETE FROM provider_keys").run();
  db.prepare(`
    UPDATE providers
    SET key_saved = 0, key_preview = NULL, status = 'not_configured', message = 'Key deleted.', updated_at = ?
  `).run(Date.now());
}
