import { Save, ShieldCheck, Trash2, Wifi } from "lucide-react";
import { useState } from "react";
import type { CrewForgeSettings, ProviderConnection } from "../lib/types";
import { formatDate, titleCase } from "../lib/formatters";
import { ApiKeyInput } from "./ApiKeyInput";
import { ModelStatusBadge } from "./ModelStatusBadge";

type Props = {
  provider: ProviderConnection;
  settings: CrewForgeSettings;
  onSaveKey: (providerId: string, apiKey: string) => Promise<void>;
  onTest: (providerId: string) => Promise<void>;
  onDeleteKey: (providerId: string) => Promise<void>;
};

export function ProviderCard({ provider, settings, onSaveKey, onTest, onDeleteKey }: Props) {
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
      setApiKey("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="card provider-card">
      <div className="card-header">
        <div>
          <h3>{provider.displayName}</h3>
          <p>
            {provider.requiresApiKey ? "API key" : "No key"} {provider.experimental ? " · Experimental" : ""}
          </p>
        </div>
        <ModelStatusBadge status={provider.status} />
      </div>

      <div className="meta-grid">
        <span>Key</span>
        <strong>{provider.keySaved ? provider.keyPreview || "Saved" : "Not saved"}</strong>
        <span>Last tested</span>
        <strong>{formatDate(provider.lastTestedAt)}</strong>
        <span>Storage</span>
        <strong>{titleCase(settings.keyStorageMode)}</strong>
      </div>

      {provider.message ? <p className="notice">{provider.message}</p> : null}

      {provider.requiresApiKey ? (
        <ApiKeyInput value={apiKey} onChange={setApiKey} placeholder={`${provider.displayName} key`} />
      ) : (
        <div className="inline-note">
          <ShieldCheck size={16} />
          Public or local connection
        </div>
      )}

      <div className="button-row">
        {provider.requiresApiKey ? (
          <button
            type="button"
            className="button primary"
            disabled={!apiKey.trim() || busy}
            onClick={() => run(() => onSaveKey(provider.id, apiKey))}
          >
            <Save size={16} />
            Save key
          </button>
        ) : null}
        <button type="button" className="button" disabled={busy} onClick={() => run(() => onTest(provider.id))}>
          <Wifi size={16} />
          Test
        </button>
        {provider.keySaved ? (
          <button type="button" className="button danger" disabled={busy} onClick={() => run(() => onDeleteKey(provider.id))}>
            <Trash2 size={16} />
            Delete
          </button>
        ) : null}
      </div>
    </article>
  );
}
