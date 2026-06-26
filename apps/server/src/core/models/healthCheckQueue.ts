import type { CrewModel, ModelStatus, ProviderId } from "../providers/providerTypes.js";
import { randomUUID } from "node:crypto";
import { getProvider } from "../providers/providerRegistry.js";
import { getSettings } from "../storage/settingsRepository.js";
import { getModel, listModels, updateModelHealth } from "../storage/modelsRepository.js";
import { recommendedRolesFor, scoreCapabilities } from "./capabilityScoring.js";
import { recommendationScore } from "./recommendationScoring.js";
import { cacheTtlFor, shouldRetryHealthCheck } from "./healthCheck.js";
import { logger } from "../../utils/logger.js";

export type HealthCheckJob = {
  id: string;
  providerId: ProviderId;
  modelId: string;
  endpoint?: string;
  priority: "high" | "normal" | "low";
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  result?: ModelStatus;
  errorMessage?: string;
  retryCount: number;
};

export type ProviderCooldown = {
  providerId: ProviderId;
  cooldownUntil: number;
  reason: "rate_limited" | "provider_busy" | "too_many_failures";
};

type HealthCacheEntry = {
  result: ModelStatus;
  expiresAt: number;
  latencyMs?: number;
};

const priorityWeight = {
  high: 0,
  normal: 1,
  low: 2
};

class HealthCheckQueue {
  private jobs: HealthCheckJob[] = [];
  private running = 0;
  private cache = new Map<string, HealthCacheEntry>();
  private cooldowns = new Map<ProviderId, ProviderCooldown>();
  private failuresByProvider = new Map<ProviderId, number>();

  enqueue(models: CrewModel[]): HealthCheckJob[] {
    const created: HealthCheckJob[] = [];

    for (const model of models) {
      if (model.status !== "checking") continue;
      if (this.cache.has(model.id)) {
        const cached = this.cache.get(model.id);
        if (cached && cached.expiresAt > Date.now()) {
          this.applyResult(model, cached.result, cached.latencyMs, "completed");
          continue;
        }
      }

      if (this.jobs.some((job) => job.modelId === model.id && ["queued", "running"].includes(job.status))) {
        continue;
      }

      const job: HealthCheckJob = {
        id: randomUUID(),
        providerId: model.provider,
        modelId: model.id,
        endpoint: model.endpoint,
        priority: this.priorityFor(model),
        status: "queued",
        createdAt: Date.now(),
        retryCount: 0
      };
      this.jobs.push(job);
      created.push(job);
      updateModelHealth(model.id, { healthState: "queued", status: "checking" });
    }

    this.jobs.sort((a, b) => priorityWeight[a.priority] - priorityWeight[b.priority] || a.createdAt - b.createdAt);
    this.tick();
    return created;
  }

  enqueueAllCurrent(): HealthCheckJob[] {
    return this.enqueue(listModels());
  }

  getJobs(): HealthCheckJob[] {
    return [...this.jobs].sort((a, b) => b.createdAt - a.createdAt).slice(0, 200);
  }

  getCooldowns(): ProviderCooldown[] {
    const now = Date.now();
    return [...this.cooldowns.values()].filter((cooldown) => cooldown.cooldownUntil > now);
  }

  getStats() {
    const jobs = this.getJobs();
    return {
      queued: jobs.filter((job) => job.status === "queued").length,
      running: jobs.filter((job) => job.status === "running").length,
      completed: jobs.filter((job) => job.status === "completed").length,
      failed: jobs.filter((job) => job.status === "failed").length,
      concurrency: getSettings().healthCheckConcurrency,
      cooldowns: this.getCooldowns()
    };
  }

  private tick(): void {
    const concurrency = Math.max(1, Math.min(10, getSettings().healthCheckConcurrency || 5));

    while (this.running < concurrency) {
      const job = this.jobs.find((candidate) => candidate.status === "queued" && !this.isProviderCoolingDown(candidate.providerId));
      if (!job) break;
      void this.runJob(job);
    }
  }

  private async runJob(job: HealthCheckJob): Promise<void> {
    job.status = "running";
    job.startedAt = Date.now();
    this.running += 1;
    updateModelHealth(job.modelId, { healthState: "running" });

    try {
      const provider = getProvider(job.providerId);
      const startedAt = Date.now();
      const result = await provider.healthCheck(job.modelId);
      const latencyMs = Date.now() - startedAt;

      job.result = result;
      job.finishedAt = Date.now();

      if (shouldRetryHealthCheck(result) && job.retryCount < 1) {
        job.retryCount += 1;
        job.status = "queued";
        await new Promise((resolve) => setTimeout(resolve, 700));
      } else {
        job.status = result === "failed" ? "failed" : "completed";
        this.cache.set(job.modelId, {
          result,
          expiresAt: Date.now() + cacheTtlFor(result),
          latencyMs
        });
        this.applyResult(getModel(job.modelId), result, latencyMs, job.status);
        this.applyProviderBackoff(job.providerId, result);
      }
    } catch (error) {
      logger.warn(`Health check failed for ${job.modelId}`, error);
      job.status = "failed";
      job.finishedAt = Date.now();
      job.result = "failed";
      job.errorMessage = error instanceof Error ? error.message : "Health check failed.";
      this.applyResult(getModel(job.modelId), "failed", undefined, "failed");
    } finally {
      this.running = Math.max(0, this.running - 1);
      this.tick();
    }
  }

  private applyResult(
    model: CrewModel | undefined,
    status: ModelStatus,
    latencyMs: number | undefined,
    healthState: "completed" | "failed"
  ): void {
    if (!model) return;

    const recentFailureCount =
      status === "ready" ? 0 : Math.min((model.recentFailureCount ?? 0) + (status === "checking" ? 0 : 1), 10);

    const capabilities = scoreCapabilities({
      id: model.id,
      displayName: model.displayName,
      kind: model.kind,
      provider: model.provider,
      status,
      contextWindow: model.contextWindow,
      latencyMs,
      recentFailureCount,
      recentInvalidOutputCount: model.recentInvalidOutputCount
    });
    const updatedModel: CrewModel = {
      ...model,
      status,
      capabilities,
      recommendationScore: 0,
      recommendedRoles: recommendedRolesFor(capabilities),
      lastCheckedAt: Date.now(),
      healthState,
      recentFailureCount
    };
    updatedModel.recommendationScore = recommendationScore(updatedModel);
    updateModelHealth(model.id, {
      status,
      capabilities,
      recommendationScore: updatedModel.recommendationScore,
      recommendedRoles: updatedModel.recommendedRoles,
      lastCheckedAt: updatedModel.lastCheckedAt,
      healthState,
      recentFailureCount
    });
  }

  private applyProviderBackoff(providerId: ProviderId, status: ModelStatus): void {
    if (status === "ready") {
      this.failuresByProvider.set(providerId, 0);
      return;
    }

    const failureCount = (this.failuresByProvider.get(providerId) ?? 0) + 1;
    this.failuresByProvider.set(providerId, failureCount);

    if (status === "rate_limited") {
      this.cooldowns.set(providerId, {
        providerId,
        cooldownUntil: Date.now() + 45_000,
        reason: "rate_limited"
      });
      return;
    }

    if (status === "busy") {
      this.cooldowns.set(providerId, {
        providerId,
        cooldownUntil: Date.now() + 20_000,
        reason: "provider_busy"
      });
      return;
    }

    if (failureCount >= 5) {
      this.cooldowns.set(providerId, {
        providerId,
        cooldownUntil: Date.now() + 60_000,
        reason: "too_many_failures"
      });
    }
  }

  private isProviderCoolingDown(providerId: ProviderId): boolean {
    const cooldown = this.cooldowns.get(providerId);
    if (!cooldown) return false;
    if (cooldown.cooldownUntil <= Date.now()) {
      this.cooldowns.delete(providerId);
      return false;
    }
    return true;
  }

  private priorityFor(model: CrewModel): HealthCheckJob["priority"] {
    if (model.selected) return "high";
    if (["free", "free_tier", "no_key"].includes(model.pricing)) return "normal";
    return "low";
  }
}

export const healthCheckQueue = new HealthCheckQueue();
