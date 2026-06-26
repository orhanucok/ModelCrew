import { RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { ProviderCard } from "../components/ProviderCard";
import { api } from "../lib/api";
import type { CrewForgeSettings, ProviderConnection } from "../lib/types";
import { titleCase } from "../lib/formatters";

export function SetupPage() {
  const [providers, setProviders] = useState<ProviderConnection[]>([]);
  const [settings, setSettings] = useState<CrewForgeSettings | undefined>();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [providerData, settingsData] = await Promise.all([api.providers(), api.settings()]);
      setProviders(providerData.providers);
      setSettings(settingsData.settings);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Setup could not load.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function updateKeyStorageMode(value: CrewForgeSettings["keyStorageMode"]) {
    const response = await api.updateSettings({ keyStorageMode: value });
    setSettings(response.settings);
  }

  async function saveKey(providerId: string, apiKey: string) {
    if (!settings) return;
    await api.saveProviderKey(providerId, apiKey, settings.keyStorageMode);
    await load();
  }

  async function testProvider(providerId: string) {
    await api.testProvider(providerId);
    await load();
  }

  async function deleteKey(providerId: string) {
    await api.deleteProviderKey(providerId);
    await load();
  }

  if (!settings) {
    return <main className="page">{loading ? "Loading setup..." : message}</main>;
  }

  return (
    <main className="page">
      <section className="page-header">
        <div>
          <h1>Setup</h1>
          <p>Connect providers and keep keys local.</p>
        </div>
        <button type="button" className="button" onClick={load} disabled={loading}>
          <RefreshCw size={16} className={loading ? "spin" : ""} />
          Refresh
        </button>
      </section>

      <section className="toolbar">
        <label>
          Key storage
          <select value={settings.keyStorageMode} onChange={(event) => void updateKeyStorageMode(event.target.value as CrewForgeSettings["keyStorageMode"])}>
            <option value="session_only">Session only</option>
            <option value="encrypted_local">Encrypted local</option>
            <option value="os_keychain">OS keychain</option>
          </select>
        </label>
        <div className="security-note">
          <ShieldCheck size={16} />
          API keys are stored locally only. CrewForge never logs or exposes saved keys.
        </div>
      </section>

      {message ? <p className="error-text">{message}</p> : null}

      <section className="provider-grid">
        {providers.map((provider) => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            settings={settings}
            onSaveKey={saveKey}
            onTest={testProvider}
            onDeleteKey={deleteKey}
          />
        ))}
      </section>

      <section className="notice-band">
        <strong>Experimental public providers</strong>
        <span>
          {settings.experimentalProviders ? "Enabled" : "Disabled"} · {titleCase(settings.logs)} logs
        </span>
        <p>Experimental public providers may be unreliable and can stop working at any time.</p>
      </section>
    </main>
  );
}
