import { CheckCheck, CircleOff, FlaskConical, RefreshCw, RotateCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ModelCard } from "../components/ModelCard";
import { api } from "../lib/api";
import type { CrewForgeSettings, CrewModel, HealthStats } from "../lib/types";

function broken(model: CrewModel) {
  return ["broken", "passive", "failed", "unavailable"].includes(model.status);
}

function paid(model: CrewModel) {
  return ["paid", "key_required"].includes(model.pricing) || ["key_required", "paid_locked"].includes(model.status);
}

export function ModelsPage() {
  const [models, setModels] = useState<CrewModel[]>([]);
  const [health, setHealth] = useState<HealthStats | undefined>();
  const [settings, setSettings] = useState<CrewForgeSettings | undefined>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const [modelData, settingsData] = await Promise.all([api.models(), api.settings()]);
    setModels(modelData.models);
    setHealth(modelData.health);
    setSettings(settingsData.settings);
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if ((health?.queued ?? 0) > 0 || (health?.running ?? 0) > 0 || models.some((model) => model.status === "checking")) {
        void load();
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [health, models]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Model action failed.");
    } finally {
      setBusy(false);
    }
  }

  const sections = useMemo(
    () => ({
      free: models.filter((model) => !broken(model) && !paid(model)),
      paid: models.filter((model) => !broken(model) && paid(model)),
      broken: models.filter(broken)
    }),
    [models]
  );

  const totalJobs = (health?.queued ?? 0) + (health?.running ?? 0) + (health?.completed ?? 0) + (health?.failed ?? 0);
  const doneJobs = (health?.completed ?? 0) + (health?.failed ?? 0);
  const progress = totalJobs ? Math.min(100, Math.round((doneJobs / totalJobs) * 100)) : 0;

  return (
    <main className="page">
      <section className="page-header">
        <div>
          <h1>Models</h1>
          <p>Discover, test, classify, and select usable models.</p>
        </div>
        <div className="button-row">
          <button type="button" className="button primary" disabled={busy} onClick={() => run(async () => {
            const data = await api.discoverModels();
            setModels(data.models);
            setHealth(data.health);
          })}>
            <RefreshCw size={16} className={busy ? "spin" : ""} />
            Discover
          </button>
          <button type="button" className="button" disabled={busy} onClick={() => run(async () => {
            const data = await api.refreshHealth();
            setModels(data.models);
            setHealth(data.health);
          })}>
            <RotateCw size={16} />
            Refresh status
          </button>
        </div>
      </section>

      <section className="toolbar wrap">
        <button type="button" className="button" disabled={busy} onClick={() => run(async () => {
          const data = await api.selectReadyFree();
          setModels(data.models);
        })}>
          <CheckCheck size={16} />
          Select Ready free
        </button>
        <button type="button" className="button" disabled={busy} onClick={() => run(async () => {
          const data = await api.clearSelection();
          setModels(data.models);
        })}>
          <CircleOff size={16} />
          Clear selection
        </button>
        {settings ? (
          <>
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={settings.experimentalProviders}
                onChange={(event) => run(async () => {
                  const response = await api.updateSettings({ experimentalProviders: event.currentTarget.checked });
                  setSettings(response.settings);
                })}
              />
              <FlaskConical size={16} />
              Experimental public providers
            </label>
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={settings.paidModelsEnabled}
                onChange={(event) => run(async () => {
                  const response = await api.updateSettings({ paidModelsEnabled: event.currentTarget.checked });
                  setSettings(response.settings);
                })}
              />
              Enable paid/key models
            </label>
          </>
        ) : null}
      </section>

      <section className="health-panel">
        <div>
          <strong>Health checks</strong>
          <span>
            {health?.running ?? 0} running · {health?.queued ?? 0} queued · concurrency {health?.concurrency ?? 5}
          </span>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </section>

      {message ? <p className="error-text">{message}</p> : null}

      <ModelSection title="Free / No-key / Free-tier Models" models={sections.free} onSelect={async (id, selected) => {
        const data = await api.selectModel(id, selected);
        setModels(data.models);
      }} />
      <ModelSection title="Paid / Key Required Models" models={sections.paid} onSelect={async (id, selected) => {
        const data = await api.selectModel(id, selected);
        setModels(data.models);
      }} />
      <ModelSection title="Broken / Passive Models" models={sections.broken} onSelect={async (id, selected) => {
        const data = await api.selectModel(id, selected);
        setModels(data.models);
      }} />
    </main>
  );
}

function ModelSection({ title, models, onSelect }: { title: string; models: CrewModel[]; onSelect: (id: string, selected: boolean) => void }) {
  return (
    <section className="model-section">
      <div className="section-heading">
        <h2>{title}</h2>
        <span>{models.length}</span>
      </div>
      {models.length ? (
        <div className="model-grid">
          {models.map((model) => (
            <ModelCard key={model.id} model={model} onSelect={onSelect} />
          ))}
        </div>
      ) : (
        <p className="empty-state">No models in this section.</p>
      )}
    </section>
  );
}
