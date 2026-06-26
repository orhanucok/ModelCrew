import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { RunCard } from "../components/RunCard";
import { api } from "../lib/api";
import type { CrewRun } from "../lib/types";
import { formatDate, titleCase } from "../lib/formatters";

export function RunsPage() {
  const [runs, setRuns] = useState<CrewRun[]>([]);
  const [selected, setSelected] = useState<CrewRun | undefined>();
  const [message, setMessage] = useState("");

  async function load() {
    try {
      const data = await api.runs();
      setRuns(data.runs);
      setSelected((current) => current ?? data.runs[0]);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Runs could not load.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function openRun(runId: string) {
    const data = await api.run(runId);
    setSelected(data.run);
  }

  async function deleteRun(runId: string) {
    await api.deleteRun(runId);
    setRuns((current) => current.filter((run) => run.id !== runId));
    setSelected((current) => (current?.id === runId ? undefined : current));
  }

  return (
    <main className="page runs-page">
      <section className="page-header">
        <div>
          <h1>Runs</h1>
          <p>Saved crew work and final answers.</p>
        </div>
        <button type="button" className="button" onClick={load}>
          <RefreshCw size={16} />
          Refresh
        </button>
      </section>

      {message ? <p className="error-text">{message}</p> : null}

      <section className="runs-layout">
        <div className="run-list">
          {runs.length ? (
            runs.map((run) => (
              <RunCard
                key={run.id}
                run={run}
                selected={selected?.id === run.id}
                onOpen={() => void openRun(run.id)}
                onDelete={() => void deleteRun(run.id)}
              />
            ))
          ) : (
            <p className="empty-state">No runs yet.</p>
          )}
        </div>

        <aside className="run-detail">
          {selected ? (
            <>
              <div className="detail-head">
                <h2>{selected.userTask.slice(0, 80)}</h2>
                <span>{formatDate(selected.createdAt)}</span>
              </div>
              <dl className="detail-grid">
                <dt>State</dt>
                <dd>{titleCase(selected.state)}</dd>
                <dt>Mode</dt>
                <dd>{selected.runMode === "chat" ? "Chat Mode" : "Forge Crew Mode"}</dd>
                <dt>Crew mode</dt>
                <dd>{titleCase(selected.blackboard.crewMode)}</dd>
                <dt>Stop reason</dt>
                <dd>{selected.stopReason ? titleCase(selected.stopReason) : "In progress"}</dd>
                <dt>Models</dt>
                <dd>{selected.selectedModels.map((model) => model.displayName).join(", ")}</dd>
              </dl>
              <h3>Plan</h3>
              <p>{selected.blackboard.plan ?? "No plan saved yet."}</p>
              <h3>Agent outputs</h3>
              <div className="output-stack">
                {selected.outputs.map((output, index) => (
                  <article key={`${output.role}-${index}`} className="output-card">
                    <strong>{titleCase(output.role)}</strong>
                    <p>{output.content}</p>
                    {output.issues.length ? <span>Issues: {output.issues.join(", ")}</span> : null}
                  </article>
                ))}
              </div>
              <h3>Final answer</h3>
              <p>{selected.finalAnswer ?? "Not available yet."}</p>
              {selected.errors.length ? (
                <>
                  <h3>Errors</h3>
                  {selected.errors.map((error) => (
                    <p className="error-text" key={`${error.timestamp}-${error.message}`}>
                      {error.message}
                    </p>
                  ))}
                </>
              ) : null}
            </>
          ) : (
            <p className="empty-state">Open a run to inspect it.</p>
          )}
        </aside>
      </section>
    </main>
  );
}
