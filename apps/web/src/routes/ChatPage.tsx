import { CirclePlus, MessageSquareText, Send, Square, Wand2, UsersRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AgentProgressBubble } from "../components/AgentProgressBubble";
import { ChatMessage } from "../components/ChatMessage";
import { CrewSummary } from "../components/CrewSummary";
import { ModelStatusBadge } from "../components/ModelStatusBadge";
import { API_BASE, api } from "../lib/api";
import type { AgentRole, ChatMode, CrewModel, CrewRun, ForgeCrewConfig, RunStreamEvent } from "../lib/types";
import { titleCase } from "../lib/formatters";

type AgentBubbleState = {
  role: AgentRole;
  modelId?: string;
  status: "running" | "completed";
  content?: string;
};

type TranscriptItem = {
  id: string;
  role: "user" | "model";
  modelId?: string;
  content: string;
};

const activeForgeRunKey = "crewforge.activeForgeRunId";
const terminalRunStates = new Set(["completed", "failed", "cancelled"]);

function isTerminalRun(run: CrewRun): boolean {
  return terminalRunStates.has(run.state);
}

function contextSize(model: CrewModel): number {
  return model.contextWindow ?? model.capabilities.context * 1000;
}

function scoreFor(role: "orchestrator" | "planner" | "worker" | "reviewer" | "synthesizer", model: CrewModel): number {
  const c = model.capabilities;
  if (role === "orchestrator") return c.reasoning * 0.4 + c.context * 0.25 + c.instructionFollowing * 0.2 + c.speed * 0.1;
  if (role === "planner") return c.reasoning * 0.45 + c.instructionFollowing * 0.25 + c.context * 0.2;
  if (role === "worker") return c.coding * 0.35 + c.reasoning * 0.25 + c.speed * 0.2 + c.instructionFollowing * 0.2;
  if (role === "reviewer") return c.reasoning * 0.35 + c.reliability * 0.25 + c.instructionFollowing * 0.2 + c.coding * 0.2;
  return c.context * 0.62 + c.reasoning * 0.18 + c.instructionFollowing * 0.12 + c.reliability * 0.08 + contextSize(model) / 20_000;
}

function bestModelId(models: CrewModel[], role: Parameters<typeof scoreFor>[0], offset = 0): string {
  const ranked = [...models].sort((a, b) => {
    if (role === "synthesizer") {
      return contextSize(b) - contextSize(a) || scoreFor(role, b) - scoreFor(role, a) || b.recommendationScore - a.recommendationScore;
    }
    return scoreFor(role, b) - scoreFor(role, a) || b.recommendationScore - a.recommendationScore;
  });
  return ranked[offset % Math.max(1, ranked.length)]?.id ?? "";
}

function buildAutoConfig(models: CrewModel[], workerCount = 2): ForgeCrewConfig {
  const count = Math.max(1, Math.min(5, workerCount));
  return {
    orchestratorModelId: bestModelId(models, "orchestrator"),
    plannerModelId: bestModelId(models, "planner"),
    workerCount: count,
    workerModelIds: Array.from({ length: count }, (_value, index) => bestModelId(models, "worker", index)),
    reviewerModelId: bestModelId(models, "reviewer"),
    synthesizerModelId: bestModelId(models, "synthesizer")
  };
}

function normalizeWorkerCount(config: ForgeCrewConfig, models: CrewModel[], workerCount: number): ForgeCrewConfig {
  const count = Math.max(1, Math.min(5, workerCount));
  const workerModelIds = Array.from({ length: count }, (_value, index) => config.workerModelIds[index] || bestModelId(models, "worker", index));
  return { ...config, workerCount: count, workerModelIds };
}

export function ChatPage() {
  const [models, setModels] = useState<CrewModel[]>([]);
  const [mode, setMode] = useState<ChatMode>("chat");
  const [task, setTask] = useState("");
  const [chatModelId, setChatModelId] = useState("");
  const [chatMessages, setChatMessages] = useState<TranscriptItem[]>([]);
  const [forgeConfig, setForgeConfig] = useState<ForgeCrewConfig>(buildAutoConfig([], 2));
  const [run, setRun] = useState<CrewRun | undefined>();
  const [agentBubbles, setAgentBubbles] = useState<Record<string, AgentBubbleState>>({});
  const [finalAnswer, setFinalAnswer] = useState("");
  const [connection, setConnection] = useState<"idle" | "connected" | "reconnecting" | "closed">("idle");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);

  async function loadModels() {
    const data = await api.models();
    setModels(data.models);
  }

  useEffect(() => {
    void loadModels();
    void resumeForgeRun();
    return () => sourceRef.current?.close();
  }, []);

  const selectedModels = useMemo(
    () => models.filter((model) => model.selected && model.status === "ready" && model.selectable),
    [models]
  );

  useEffect(() => {
    if (!selectedModels.length) {
      setChatModelId("");
      setForgeConfig(buildAutoConfig([], 2));
      return;
    }

    if (!chatModelId || !selectedModels.some((model) => model.id === chatModelId)) {
      setChatModelId(selectedModels[0].id);
    }

    setForgeConfig((current) => {
      const currentValues = [
        current.orchestratorModelId,
        current.plannerModelId,
        current.reviewerModelId,
        current.synthesizerModelId,
        ...current.workerModelIds
      ].filter(Boolean);
      const stillValid = currentValues.every((modelId) => selectedModels.some((model) => model.id === modelId));
      return stillValid && currentValues.length ? normalizeWorkerCount(current, selectedModels, current.workerCount) : buildAutoConfig(selectedModels, 2);
    });
  }, [selectedModels, chatModelId]);

  function applyEvent(event: RunStreamEvent) {
    if (event.type === "state_changed") {
      setRun((current) => (current ? { ...current, state: event.state, updatedAt: event.timestamp } : current));
      return;
    }

    if (event.type === "agent_started") {
      const key = `${event.role}:${event.modelId}`;
      setAgentBubbles((current) => ({
        ...current,
        [key]: { role: event.role, modelId: event.modelId, status: "running" }
      }));
      return;
    }

    if (event.type === "agent_delta") {
      const key = `${event.role}:${event.modelId ?? event.role}`;
      setAgentBubbles((current) => ({
        ...current,
        [key]: {
          role: event.role,
          modelId: event.modelId ?? current[key]?.modelId,
          status: "running",
          content: event.contentDelta
        }
      }));
      return;
    }

    if (event.type === "agent_completed") {
      const key = `${event.output.role}:${event.output.modelId}:${event.output.metadata.startedAt}`;
      setAgentBubbles((current) => ({
        ...current,
        [key]: {
          role: event.output.role,
          modelId: event.output.modelId,
          status: "completed",
          content: event.output.content
        }
      }));
      return;
    }

    if (event.type === "fallback_triggered") {
      setMessage(`CrewForge is trying another selected model. ${event.reason}`);
      return;
    }

    if (event.type === "run_completed") {
      setFinalAnswer(event.finalAnswer);
      setConnection("closed");
      setRun((current) =>
        current ? { ...current, state: "completed", finalAnswer: event.finalAnswer, stopReason: event.stopReason } : current
      );
      sourceRef.current?.close();
      return;
    }

    if (event.type === "run_failed") {
      setMessage(event.message);
      setConnection("closed");
      setRun((current) => (current ? { ...current, state: "failed" } : current));
      sourceRef.current?.close();
    }
  }

  function hydrateRunState(nextRun: CrewRun) {
    setMode("forge_crew");
    setRun(nextRun);
    setFinalAnswer(nextRun.finalAnswer ?? "");
    setConnection(isTerminalRun(nextRun) ? "closed" : "idle");
    if (nextRun.forgeConfig) {
      setForgeConfig(nextRun.forgeConfig);
    }
    setAgentBubbles(
      nextRun.outputs.reduce<Record<string, AgentBubbleState>>((acc, output, index) => {
        acc[`${output.role}:${output.modelId}:${output.metadata.startedAt || index}`] = {
          role: output.role,
          modelId: output.modelId,
          status: "completed",
          content: output.content
        };
        return acc;
      }, {})
    );
  }

  async function resumeForgeRun() {
    const storedRunId = window.localStorage.getItem(activeForgeRunKey);
    let candidate: CrewRun | undefined;

    if (storedRunId) {
      try {
        candidate = (await api.run(storedRunId)).run;
      } catch {
        window.localStorage.removeItem(activeForgeRunKey);
      }
    }

    if (!candidate || candidate.runMode !== "forge_crew") {
      const data = await api.runs();
      candidate = data.runs.find((item) => item.runMode === "forge_crew" && !isTerminalRun(item));
    }

    if (!candidate || candidate.runMode !== "forge_crew") return;

    window.localStorage.setItem(activeForgeRunKey, candidate.id);
    hydrateRunState(candidate);
    if (!isTerminalRun(candidate)) {
      setMessage("Recovered the running Forge Crew run and reconnected to live progress.");
      connect(candidate.id);
    }
  }

  function connect(runId: string) {
    sourceRef.current?.close();
    const source = new EventSource(`${API_BASE}/api/runs/${runId}/events`);
    sourceRef.current = source;
    source.onopen = () => setConnection("connected");
    source.onmessage = (event) => {
      const parsed = JSON.parse(event.data) as RunStreamEvent;
      applyEvent(parsed);
    };
    source.onerror = () => {
      setConnection("reconnecting");
      void api.run(runId).then((data) => {
        setRun(data.run);
        setFinalAnswer(data.run.finalAnswer ?? "");
      });
    };
  }

  async function sendSingleChat() {
    if (!chatModelId || !task.trim()) return;
    const userMessage: TranscriptItem = {
      id: crypto.randomUUID(),
      role: "user",
      content: task.trim()
    };
    const nextMessages = [...chatMessages, userMessage];
    setChatMessages(nextMessages);
    setTask("");
    setMessage("");
    setBusy(true);

    try {
      const response = await api.singleChat(
        chatModelId,
        nextMessages.map((item) => ({
          role: item.role === "user" ? ("user" as const) : ("assistant" as const),
          content: item.content
        }))
      );
      setChatMessages((current) => [
        ...current,
        {
          id: `${response.createdAt}`,
          role: "model",
          modelId: response.modelId,
          content: response.content
        }
      ]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Chat request failed.");
    } finally {
      setBusy(false);
    }
  }

  function configIsComplete(): boolean {
    if (!selectedModels.length) return false;
    return Boolean(
      forgeConfig.orchestratorModelId &&
        forgeConfig.plannerModelId &&
        forgeConfig.reviewerModelId &&
        forgeConfig.synthesizerModelId &&
        forgeConfig.workerModelIds.length === forgeConfig.workerCount &&
        forgeConfig.workerModelIds.every(Boolean)
    );
  }

  async function startForgeRun() {
    if (!task.trim() || !configIsComplete()) return;
    setMessage("");
    setFinalAnswer("");
    setAgentBubbles({});
    setBusy(true);
    try {
      const data = await api.startForgeRun(task.trim(), forgeConfig);
      window.localStorage.setItem(activeForgeRunKey, data.runId);
      const runData = await api.run(data.runId);
      setRun(runData.run);
      connect(data.runId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Forge Crew run could not start.");
    } finally {
      setBusy(false);
    }
  }

  function resetConversation() {
    setTask("");
    setRun(undefined);
    setFinalAnswer("");
    setAgentBubbles({});
    setChatMessages([]);
    setMessage("");
    setConnection("idle");
    window.localStorage.removeItem(activeForgeRunKey);
    sourceRef.current?.close();
  }

  const selectedChatModel = selectedModels.find((model) => model.id === chatModelId);

  return (
    <main className="page chat-page">
      <section className="page-header">
        <div>
          <h1>Chat</h1>
          <p>Use one selected model directly, or build a small AI team and assign models to roles.</p>
        </div>
        {run ? <ModelStatusBadge status={run.state} /> : null}
      </section>

      <section className="mode-toggle" aria-label="Chat mode">
        <button type="button" className={mode === "chat" ? "active" : ""} onClick={() => setMode("chat")}>
          <MessageSquareText size={16} />
          Chat
        </button>
        <button type="button" className={mode === "forge_crew" ? "active" : ""} onClick={() => setMode("forge_crew")}>
          <UsersRound size={16} />
          Forge Crew
        </button>
      </section>

      <CrewSummary models={selectedModels} />

      {!selectedModels.length ? (
        <p className="empty-state">No model selected. Go to Models and select at least one Ready model.</p>
      ) : mode === "chat" ? (
        <section className="mode-panel">
          <div className="mode-copy">
            <strong>Chat Mode</strong>
            <span>Use one selected model directly.</span>
          </div>
          <label>
            Model
            <select value={chatModelId} onChange={(event) => setChatModelId(event.target.value)}>
              {selectedModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.displayName}
                </option>
              ))}
            </select>
          </label>
          {selectedChatModel ? (
            <div className="selected-model-badge">
              <ModelStatusBadge status={selectedChatModel.status} />
              <span>{selectedChatModel.displayName}</span>
            </div>
          ) : null}
        </section>
      ) : (
        <ForgeCrewPanel
          models={selectedModels}
          config={forgeConfig}
          onChange={setForgeConfig}
          onAutoFill={() => setForgeConfig(buildAutoConfig(selectedModels, forgeConfig.workerCount))}
        />
      )}

      <section className="composer">
        <textarea
          value={task}
          onChange={(event) => setTask(event.target.value)}
          placeholder={mode === "chat" ? "Write a message..." : "Write the task for your Forge Crew..."}
          rows={7}
        />
        <div className="button-row">
          <button
            type="button"
            className="button primary"
            disabled={busy || !task.trim() || (mode === "chat" ? !chatModelId : !configIsComplete())}
            onClick={mode === "chat" ? sendSingleChat : startForgeRun}
          >
            <Send size={16} />
            {mode === "chat" ? "Send" : "Run Forge Crew"}
          </button>
          <button type="button" className="button" onClick={resetConversation}>
            <CirclePlus size={16} />
            New
          </button>
          {mode === "forge_crew" ? (
            <button type="button" className="button" disabled={!run || connection === "closed"} onClick={() => {
              sourceRef.current?.close();
              setConnection("closed");
            }}>
              <Square size={16} />
              Stop stream
            </button>
          ) : null}
        </div>
      </section>

      {mode === "forge_crew" && run ? (
        <section className="resume-strip">
          <strong>Saved run</strong>
          <span>{run.state === "completed" ? "Completed" : isTerminalRun(run) ? titleCase(run.state) : "Running or resumable"} - {run.id}</span>
        </section>
      ) : null}

      {message ? <ChatMessage title="Notice" body={message} /> : null}
      {connection === "reconnecting" ? <ChatMessage title="Connection" body="Connection lost. Reconnecting..." /> : null}

      <section className="chat-stream">
        {mode === "chat"
          ? chatMessages.map((item) => (
              <ChatMessage
                key={item.id}
                tone={item.role === "user" ? "user" : "final"}
                title={item.role === "user" ? "You" : selectedModels.find((model) => model.id === item.modelId)?.displayName ?? "Model"}
                body={item.content}
              />
            ))
          : null}
        {mode === "forge_crew" && run ? <ChatMessage tone="user" title="Task" body={run.userTask} /> : null}
        {mode === "forge_crew"
          ? Object.entries(agentBubbles).map(([key, bubble]) => <AgentProgressBubble key={key} {...bubble} />)
          : null}
        {mode === "forge_crew" && finalAnswer ? <ChatMessage tone="final" title="Final Answer" body={finalAnswer} /> : null}
      </section>

      {mode === "forge_crew" && run?.blackboard.assignments?.length ? (
        <section className="assignment-strip">
          {run.blackboard.assignments.map((assignment, index) => (
            <span key={`${assignment.role}-${assignment.modelId}-${index}`}>
              {titleCase(assignment.role)} - {assignment.modelId}
            </span>
          ))}
        </section>
      ) : null}
    </main>
  );
}

function ForgeCrewPanel({
  models,
  config,
  onChange,
  onAutoFill
}: {
  models: CrewModel[];
  config: ForgeCrewConfig;
  onChange: (config: ForgeCrewConfig) => void;
  onAutoFill: () => void;
}) {
  function update(patch: Partial<ForgeCrewConfig>) {
    onChange({ ...config, ...patch });
  }

  function updateWorker(index: number, modelId: string) {
    const workerModelIds = [...config.workerModelIds];
    workerModelIds[index] = modelId;
    update({ workerModelIds });
  }

  return (
    <section className="mode-panel forge-panel">
      <div className="mode-copy">
        <strong>Forge Crew Mode</strong>
        <span>Build a small AI team and assign models to roles.</span>
      </div>
      <button type="button" className="button" onClick={onAutoFill}>
        <Wand2 size={16} />
        Auto-fill best crew
      </button>
      <p className="panel-hint">Auto-fill picks the widest-context selected model for Synthesizer.</p>
      <RoleSelector label="Orchestrator" value={config.orchestratorModelId} models={models} onChange={(value) => update({ orchestratorModelId: value })} />
      <RoleSelector label="Planner" value={config.plannerModelId} models={models} onChange={(value) => update({ plannerModelId: value })} />
      <label>
        Workers
        <select
          value={config.workerCount}
          onChange={(event) => onChange(normalizeWorkerCount(config, models, Number(event.target.value)))}
        >
          {[1, 2, 3, 4, 5].map((count) => (
            <option key={count} value={count}>
              {count}
            </option>
          ))}
        </select>
      </label>
      {Array.from({ length: config.workerCount }, (_value, index) => (
        <RoleSelector
          key={index}
          label={`Worker ${index + 1}`}
          value={config.workerModelIds[index] ?? ""}
          models={models}
          onChange={(value) => updateWorker(index, value)}
        />
      ))}
      <RoleSelector label="Reviewer" value={config.reviewerModelId} models={models} onChange={(value) => update({ reviewerModelId: value })} />
      <RoleSelector label="Synthesizer" value={config.synthesizerModelId} models={models} onChange={(value) => update({ synthesizerModelId: value })} />
    </section>
  );
}

function RoleSelector({
  label,
  value,
  models,
  onChange
}: {
  label: string;
  value: string;
  models: CrewModel[];
  onChange: (value: string) => void;
}) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {models.map((model) => (
          <option key={model.id} value={model.id}>
            {model.displayName}
          </option>
        ))}
      </select>
    </label>
  );
}
