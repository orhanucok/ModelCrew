import { DatabaseZap, KeyRound, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { CrewForgeSettings } from "../lib/types";

export function SettingsPage() {
  const [settings, setSettings] = useState<CrewForgeSettings | undefined>();
  const [message, setMessage] = useState("");

  async function load() {
    const data = await api.settings();
    setSettings(data.settings);
  }

  useEffect(() => {
    void load();
  }, []);

  async function patch(value: Partial<CrewForgeSettings>) {
    const data = await api.updateSettings(value);
    setSettings(data.settings);
    window.dispatchEvent(new Event("crewforge:settings-updated"));
  }

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      setMessage(success);
      await load();
      window.dispatchEvent(new Event("crewforge:settings-updated"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed.");
    }
  }

  if (!settings) return <main className="page">Loading settings...</main>;

  return (
    <main className="page">
      <section className="page-header">
        <div>
          <h1>Settings</h1>
          <p>Local preferences, security, and data.</p>
        </div>
      </section>

      {message ? <p className="notice">{message}</p> : null}

      <section className="settings-grid">
        <label className="setting-row">
          <span>Theme</span>
          <select value={settings.theme} onChange={(event) => void patch({ theme: event.target.value as CrewForgeSettings["theme"] })}>
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>

        <label className="setting-row">
          <span>Key storage mode</span>
          <select
            value={settings.keyStorageMode}
            onChange={(event) => void patch({ keyStorageMode: event.target.value as CrewForgeSettings["keyStorageMode"] })}
          >
            <option value="session_only">Session only</option>
            <option value="encrypted_local">Encrypted local</option>
            <option value="os_keychain">OS keychain</option>
          </select>
        </label>

        <label className="setting-row">
          <span>Experimental providers</span>
          <input
            type="checkbox"
            checked={settings.experimentalProviders}
            onChange={(event) => void patch({ experimentalProviders: event.target.checked })}
          />
        </label>

        <label className="setting-row">
          <span>Health check concurrency</span>
          <input
            type="number"
            min={1}
            max={10}
            value={settings.healthCheckConcurrency}
            onChange={(event) => void patch({ healthCheckConcurrency: Number(event.target.value) })}
          />
        </label>

        <label className="setting-row">
          <span>Run history retention</span>
          <select
            value={settings.runHistoryRetention}
            onChange={(event) => void patch({ runHistoryRetention: event.target.value as CrewForgeSettings["runHistoryRetention"] })}
          >
            <option value="keep_all">Keep all</option>
            <option value="clear_manually">Clear manually</option>
          </select>
        </label>

        <label className="setting-row">
          <span>Logs</span>
          <select value={settings.logs} onChange={(event) => void patch({ logs: event.target.value as CrewForgeSettings["logs"] })}>
            <option value="normal">Normal</option>
            <option value="verbose">Verbose</option>
          </select>
        </label>
      </section>

      <section className="danger-zone">
        <button type="button" className="button danger" onClick={() => run(api.deleteSavedKeys, "Saved API keys deleted.")}>
          <KeyRound size={16} />
          Delete saved keys
        </button>
        <button type="button" className="button danger" onClick={() => run(api.clearRunHistory, "Run history cleared.")}>
          <Trash2 size={16} />
          Clear run history
        </button>
        <button type="button" className="button danger" onClick={() => run(api.clearModelCache, "Model cache cleared.")}>
          <DatabaseZap size={16} />
          Clear model cache
        </button>
        <button type="button" className="button" onClick={() => run(api.resetSettings, "Settings reset.")}>
          <RotateCcw size={16} />
          Reset settings
        </button>
      </section>

      <section className="notice-band">
        <strong>CrewForge</strong>
        <span>One local workspace for all your text AI models.</span>
        <p>Experimental public providers may be unreliable and can stop working at any time.</p>
      </section>
    </main>
  );
}
