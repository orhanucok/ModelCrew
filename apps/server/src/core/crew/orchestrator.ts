import { randomUUID } from "node:crypto";
import type { AgentRole } from "../providers/providerTypes.js";
import type { AgentAssignment, AgentOutput, CrewRun, CrewSubtask, ForgeCrewConfig, RunStopReason } from "./crewTypes.js";
import { getModel, getSelectedReadyModels } from "../storage/modelsRepository.js";
import { createRun, getRun, saveRun } from "../storage/runsRepository.js";
import { createBlackboard } from "./blackboard.js";
import { assignRoles } from "./roleAssignment.js";
import { emitRunEvent } from "./runEvents.js";
import { setRunState } from "./runStateMachine.js";
import { plannerInstruction } from "./planner.js";
import { reviewerInstruction } from "./reviewer.js";
import { synthesizerInstruction } from "./synthesizer.js";
import { runAgentStep } from "./agentRunner.js";
import { scoreRunQuality } from "./stopCriteria.js";
import { asUserMessage } from "../../utils/errors.js";
import { redactSecrets } from "../security/secretsRedactor.js";
import { getProvider } from "../providers/providerRegistry.js";
import { estimateTokens } from "../../utils/tokenEstimate.js";

function assignmentFor(assignments: AgentAssignment[], role: AgentRole): AgentAssignment {
  const assignment = assignments.find((item) => item.role === role);
  if (!assignment) throw new Error(`No assignment for ${role}.`);
  return assignment;
}

function assignmentsFor(assignments: AgentAssignment[], role: AgentRole): AgentAssignment[] {
  return assignments.filter((item) => item.role === role);
}

function subtasksFromPlan(plan: string): CrewSubtask[] {
  const lines = plan
    .split("\n")
    .map((line) => line.replace(/^[-*\d.\s]+/, "").trim())
    .filter((line) => line.length > 8)
    .slice(0, 6);

  const safeLines = lines.length ? lines : ["Produce the main response.", "Review and synthesize the result."];
  return safeLines.map((line, index) => ({
    id: `subtask-${index + 1}`,
    title: line.slice(0, 80),
    description: line,
    status: "pending"
  }));
}

export function createCrewRun(userTask: string): CrewRun {
  const selectedModels = getSelectedReadyModels();
  const safeTask = redactSecrets(userTask);
  const now = Date.now();
  const run: CrewRun = {
    id: randomUUID(),
    runMode: "forge_crew",
    userTask: safeTask,
    selectedModels,
    state: "created",
    currentRound: 1,
    maxRounds: 3,
    blackboard: createBlackboard(safeTask, selectedModels),
    outputs: [],
    errors: [],
    createdAt: now,
    updatedAt: now
  };

  return createRun(run);
}

function selectedReadyModel(modelId: string) {
  const model = getModel(modelId);
  if (!model || !model.selected || model.status !== "ready" || !model.selectable) {
    throw new Error("No model selected. Go to Models and select at least one Ready model.");
  }
  return model;
}

function uniqueModelIds(config: ForgeCrewConfig): string[] {
  return [
    config.orchestratorModelId,
    config.plannerModelId,
    ...config.workerModelIds.slice(0, config.workerCount),
    config.reviewerModelId,
    config.synthesizerModelId
  ].filter(Boolean);
}

function manualAssignments(config: ForgeCrewConfig): AgentAssignment[] {
  const workerCount = Math.max(1, Math.min(5, config.workerCount));
  const assignments: AgentAssignment[] = [
    {
      role: "orchestrator",
      modelId: config.orchestratorModelId,
      providerId: selectedReadyModel(config.orchestratorModelId).provider,
      score: 100
    },
    {
      role: "planner",
      modelId: config.plannerModelId,
      providerId: selectedReadyModel(config.plannerModelId).provider,
      score: 100
    }
  ];

  for (const modelId of config.workerModelIds.slice(0, workerCount)) {
    const model = selectedReadyModel(modelId);
    assignments.push({
      role: "worker",
      modelId: model.id,
      providerId: model.provider,
      score: 100
    });
  }

  assignments.push(
    {
      role: "reviewer",
      modelId: config.reviewerModelId,
      providerId: selectedReadyModel(config.reviewerModelId).provider,
      score: 100
    },
    {
      role: "synthesizer",
      modelId: config.synthesizerModelId,
      providerId: selectedReadyModel(config.synthesizerModelId).provider,
      score: 100
    }
  );

  return assignments;
}

export function createForgeCrewRun(userTask: string, config: ForgeCrewConfig): CrewRun {
  const safeTask = redactSecrets(userTask);
  const selectedModels = [...new Set(uniqueModelIds(config))].map(selectedReadyModel);
  const assignments = manualAssignments(config);
  const now = Date.now();
  const run: CrewRun = {
    id: randomUUID(),
    runMode: "forge_crew",
    forgeConfig: {
      ...config,
      workerCount: Math.max(1, Math.min(5, config.workerCount)),
      workerModelIds: config.workerModelIds.slice(0, Math.max(1, Math.min(5, config.workerCount)))
    },
    userTask: safeTask,
    selectedModels,
    state: "created",
    currentRound: 1,
    maxRounds: 3,
    blackboard: createBlackboard(safeTask, selectedModels),
    outputs: [],
    errors: [],
    createdAt: now,
    updatedAt: now
  };
  run.blackboard.assignments = assignments;
  return createRun(run);
}

export async function runSingleChat(args: {
  modelId: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
}): Promise<{ modelId: string; providerId: string; content: string; createdAt: number }> {
  const model = selectedReadyModel(args.modelId);
  const provider = getProvider(model.provider);
  const safeMessages = args.messages.map((message) => ({
    ...message,
    content: redactSecrets(message.content)
  }));
  const latestUserMessage = [...safeMessages].reverse().find((message) => message.role === "user")?.content ?? "Chat message";
  const startedAt = Date.now();
  const response = await provider.callModel({
    modelId: model.id,
    messages: safeMessages,
    temperature: 0.2,
    timeoutMs: 60_000
  });
  const content = redactSecrets(response.text);
  const finishedAt = Date.now();
  const output: AgentOutput = {
    role: "worker",
    modelId: model.id,
    providerId: model.provider,
    round: 1,
    content,
    confidence: 0.8,
    issues: [],
    assumptions: [],
    missingInfo: [],
    suggestedNextAction: "stop",
    metadata: {
      startedAt,
      finishedAt,
      latencyMs: finishedAt - startedAt,
      retryCount: 0,
      tokenEstimate: estimateTokens(content)
    }
  };
  const run = createRun({
    id: randomUUID(),
    runMode: "chat",
    userTask: latestUserMessage,
    selectedModels: [model],
    state: "completed",
    currentRound: 1,
    maxRounds: 1,
    stopReason: "quality_threshold_met",
    blackboard: {
      ...createBlackboard(latestUserMessage, [model]),
      assignments: [{ role: "worker", modelId: model.id, providerId: model.provider, score: 100 }],
      outputs: [output],
      finalResult: content
    },
    outputs: [output],
    errors: [],
    finalAnswer: content,
    createdAt: startedAt,
    updatedAt: finishedAt
  });

  return {
    modelId: model.id,
    providerId: model.provider,
    content: run.finalAnswer ?? content,
    createdAt: run.createdAt
  };
}

function recordOutput(run: CrewRun, output: Awaited<ReturnType<typeof runAgentStep>>): void {
  run.outputs.push(output);
  run.blackboard.outputs.push(output);
  run.updatedAt = Date.now();
  saveRun(run);
}

function failRun(run: CrewRun, message: string, stopReason: RunStopReason = "fatal_error"): void {
  run.state = "failed";
  run.stopReason = stopReason;
  run.errors.push({ message, timestamp: Date.now() });
  run.blackboard.errors.push({ message, timestamp: Date.now() });
  run.updatedAt = Date.now();
  saveRun(run);
  emitRunEvent({
    type: "run_failed",
    runId: run.id,
    message,
    timestamp: Date.now()
  });
}

export async function runCrew(runId: string): Promise<void> {
  const run = getRun(runId);
  if (!run) return;

  emitRunEvent({ type: "run_started", runId: run.id, timestamp: Date.now() });

  try {
    if (!run.selectedModels.length) {
      failRun(
        run,
        "No usable free model is available right now. Add another provider key, select more models, or try again later.",
        "no_usable_models"
      );
      return;
    }

    const assignments = run.blackboard.assignments.length ? run.blackboard.assignments : assignRoles(run.selectedModels);
    if (!assignments.length) {
      failRun(run, "No usable model is selected. Go to Models and select at least one Ready model.", "no_usable_models");
      return;
    }

    run.blackboard.assignments = assignments;
    run.updatedAt = Date.now();
    saveRun(run);

    setRunState(run, "planning");
    const orchestratorOutput = await runAgentStep({
      run,
      assignment: assignmentFor(assignments, "orchestrator"),
      roleInstruction:
        "Understand the task, choose a strategy, identify constraints, and hand off a compact plan request to the planner."
    });
    recordOutput(run, orchestratorOutput);

    const plannerOutput = await runAgentStep({
      run,
      assignment: assignmentFor(assignments, "planner"),
      roleInstruction: plannerInstruction
    });
    run.blackboard.plan = plannerOutput.content;
    run.blackboard.subtasks = subtasksFromPlan(plannerOutput.content);
    recordOutput(run, plannerOutput);

    setRunState(run, "assigning");
    run.updatedAt = Date.now();
    saveRun(run);

    setRunState(run, "running_agents");
    const workerAssignments = assignmentsFor(assignments, "worker");
    const legacyBuilder = assignments.find((assignment) => assignment.role === "builder");
    const activeWorkers = workerAssignments.length ? workerAssignments : legacyBuilder ? [legacyBuilder] : [];
    if (!activeWorkers.length) {
      throw new Error("Forge Crew needs at least one Worker model.");
    }

    const workItemCount = Math.max(run.blackboard.subtasks.length, activeWorkers.length);
    for (let index = 0; index < workItemCount; index += 1) {
      const workerAssignment = activeWorkers[index % activeWorkers.length];
      const subtask = run.blackboard.subtasks[index];
      const workerOutput = await runAgentStep({
        run,
        assignment: workerAssignment,
        currentSubtask:
          subtask?.description ??
          `Alternative solution perspective ${index + 1}: produce a useful independent pass on the user's task.`,
        roleInstruction:
          "Act as a Worker. Produce concrete output for the assigned subtask or perspective. Do not review; focus on useful work."
      });
      recordOutput(run, workerOutput);
    }

    setRunState(run, "reviewing");
    const reviewerOutput = await runAgentStep({
      run,
      assignment: assignmentFor(assignments, "reviewer"),
      roleInstruction: reviewerInstruction
    });
    run.blackboard.reviewNotes.push(reviewerOutput.content);
    recordOutput(run, reviewerOutput);
    emitRunEvent({
      type: "review_completed",
      runId: run.id,
      issues: reviewerOutput.issues,
      timestamp: Date.now()
    });

    const quality = scoreRunQuality(run.outputs);
    if (quality.needsAnotherRound && run.currentRound < run.maxRounds) {
      setRunState(run, "repairing");
      run.currentRound += 1;
      run.blackboard.currentRound = run.currentRound;
      saveRun(run);
      const repairOutput = await runAgentStep({
        run,
        assignment: activeWorkers[0],
        roleInstruction:
          "Act as a Worker and revise the worker outputs using reviewer notes. Focus only on material improvements and unresolved risks.",
        reviewerNotes: reviewerOutput.issues.length ? reviewerOutput.issues : [reviewerOutput.content]
      });
      recordOutput(run, repairOutput);
    }

    setRunState(run, "synthesizing");
    const synthesizerOutput = await runAgentStep({
      run,
      assignment: assignmentFor(assignments, "synthesizer"),
      roleInstruction: synthesizerInstruction
    });
    run.blackboard.synthesisNotes.push(synthesizerOutput.content);
    run.blackboard.finalResult = synthesizerOutput.content;
    recordOutput(run, synthesizerOutput);

    const finalQuality = scoreRunQuality(run.outputs);
    run.finalAnswer = synthesizerOutput.content;
    run.stopReason =
      finalQuality.needsAnotherRound && run.currentRound >= run.maxRounds ? "max_rounds_reached" : "reviewer_approved";
    run.state = "completed";
    run.updatedAt = Date.now();
    saveRun(run);

    emitRunEvent({
      type: "run_completed",
      runId: run.id,
      finalAnswer: run.finalAnswer,
      stopReason: run.stopReason,
      timestamp: Date.now()
    });
  } catch (error) {
    failRun(run, asUserMessage(error));
  }
}
