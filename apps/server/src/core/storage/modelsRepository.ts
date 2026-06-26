import { db } from "./db.js";
import type {
  AgentRole,
  CrewModel,
  ModelCapabilities,
  ModelStatus,
  ProviderId
} from "../providers/providerTypes.js";
import { isSelectableKind } from "../providers/providerTypes.js";

type ModelRow = {
  id: string;
  provider: ProviderId;
  endpoint?: string;
  display_name: string;
  kind: CrewModel["kind"];
  pricing: CrewModel["pricing"];
  status: ModelStatus;
  selectable: number;
  selected: number;
  capabilities_json: string;
  context_window?: number;
  recommendation_score: number;
  recommended_roles_json: string;
  last_checked_at?: number;
  recent_failure_count: number;
  recent_invalid_output_count: number;
  health_state?: CrewModel["healthState"];
};

function canSelect(model: CrewModel): boolean {
  return (
    model.status === "ready" &&
    isSelectableKind(model.kind) &&
    !["paid", "key_required", "unknown"].includes(model.pricing)
  );
}

function fromRow(row: ModelRow): CrewModel {
  return {
    id: row.id,
    provider: row.provider,
    endpoint: row.endpoint ?? undefined,
    displayName: row.display_name,
    kind: row.kind,
    pricing: row.pricing,
    status: row.status,
    selectable: Boolean(row.selectable),
    selected: Boolean(row.selected),
    capabilities: JSON.parse(row.capabilities_json) as ModelCapabilities,
    contextWindow: row.context_window ?? undefined,
    recommendationScore: row.recommendation_score,
    recommendedRoles: JSON.parse(row.recommended_roles_json) as AgentRole[],
    lastCheckedAt: row.last_checked_at ?? undefined,
    recentFailureCount: row.recent_failure_count,
    recentInvalidOutputCount: row.recent_invalid_output_count,
    healthState: row.health_state ?? undefined
  };
}

export function upsertModels(models: CrewModel[]): void {
  const statement = db.prepare(`
    INSERT INTO models (
      id, provider, endpoint, display_name, kind, pricing, status, selectable, selected,
      capabilities_json, context_window, recommendation_score, recommended_roles_json,
      last_checked_at, recent_failure_count, recent_invalid_output_count, health_state, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      provider = excluded.provider,
      endpoint = excluded.endpoint,
      display_name = excluded.display_name,
      kind = excluded.kind,
      pricing = excluded.pricing,
      status = excluded.status,
      selectable = excluded.selectable,
      capabilities_json = excluded.capabilities_json,
      context_window = excluded.context_window,
      recommendation_score = excluded.recommendation_score,
      recommended_roles_json = excluded.recommended_roles_json,
      last_checked_at = excluded.last_checked_at,
      recent_failure_count = excluded.recent_failure_count,
      recent_invalid_output_count = excluded.recent_invalid_output_count,
      health_state = excluded.health_state,
      updated_at = excluded.updated_at
  `);
  const now = Date.now();

  for (const model of models) {
    const existing = getModel(model.id);
    const selectable = canSelect(model);
    statement.run(
      model.id,
      model.provider,
      model.endpoint ?? null,
      model.displayName,
      model.kind,
      model.pricing,
      model.status,
      selectable ? 1 : 0,
      existing?.selected && selectable ? 1 : model.selected && selectable ? 1 : 0,
      JSON.stringify(model.capabilities),
      model.contextWindow ?? null,
      model.recommendationScore,
      JSON.stringify(model.recommendedRoles),
      model.lastCheckedAt ?? null,
      model.recentFailureCount ?? 0,
      model.recentInvalidOutputCount ?? 0,
      model.healthState ?? null,
      now
    );
  }
}

export function listModels(): CrewModel[] {
  const rows = db.prepare("SELECT * FROM models").all() as ModelRow[];
  return rows.map(fromRow).sort(sortModels);
}

export function getModel(id: string): CrewModel | undefined {
  const row = db.prepare("SELECT * FROM models WHERE id = ?").get(id) as ModelRow | undefined;
  return row ? fromRow(row) : undefined;
}

export function getSelectedReadyModels(): CrewModel[] {
  return listModels().filter((model) => model.selected && model.selectable && model.status === "ready");
}

export function setModelSelected(modelId: string, selected: boolean): CrewModel | undefined {
  const model = getModel(modelId);
  if (!model) return undefined;

  const nextSelected = selected && model.selectable && model.status === "ready";
  db.prepare("UPDATE models SET selected = ?, updated_at = ? WHERE id = ?").run(
    nextSelected ? 1 : 0,
    Date.now(),
    modelId
  );
  return getModel(modelId);
}

export function clearModelSelection(): void {
  db.prepare("UPDATE models SET selected = 0, updated_at = ?").run(Date.now());
}

export function selectReadyFreeModels(): CrewModel[] {
  db.prepare(`
    UPDATE models
    SET selected = CASE WHEN selectable = 1 AND status = 'ready' THEN 1 ELSE 0 END,
        updated_at = ?
  `).run(Date.now());
  return getSelectedReadyModels();
}

export function updateModelHealth(
  modelId: string,
  patch: Partial<Pick<CrewModel, "status" | "selectable" | "lastCheckedAt" | "healthState" | "recommendationScore" | "capabilities" | "recommendedRoles" | "recentFailureCount">>
): CrewModel | undefined {
  const model = getModel(modelId);
  if (!model) return undefined;
  const merged: CrewModel = { ...model, ...patch };
  merged.selectable = canSelect(merged);
  merged.selected = merged.selected && merged.selectable;

  db.prepare(`
    UPDATE models
    SET status = ?, selectable = ?, selected = ?, capabilities_json = ?, recommendation_score = ?,
        recommended_roles_json = ?, last_checked_at = ?, recent_failure_count = ?, health_state = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    merged.status,
    merged.selectable ? 1 : 0,
    merged.selected ? 1 : 0,
    JSON.stringify(merged.capabilities),
    merged.recommendationScore,
    JSON.stringify(merged.recommendedRoles),
    merged.lastCheckedAt ?? null,
    merged.recentFailureCount ?? 0,
    merged.healthState ?? null,
    Date.now(),
    modelId
  );
  return getModel(modelId);
}

export function clearModels(): void {
  db.prepare("DELETE FROM models").run();
}

function sortBucket(model: CrewModel): number {
  if (model.status === "ready" && ["free", "free_tier", "no_key"].includes(model.pricing)) return 0;
  if (["busy", "slow", "rate_limited", "cooldown"].includes(model.status) && ["free", "free_tier", "no_key"].includes(model.pricing)) return 1;
  if (["key_required", "paid_locked"].includes(model.status) || ["paid", "key_required"].includes(model.pricing)) return 2;
  return 3;
}

function sortModels(a: CrewModel, b: CrewModel): number {
  const bucket = sortBucket(a) - sortBucket(b);
  if (bucket !== 0) return bucket;
  return b.recommendationScore - a.recommendationScore || a.displayName.localeCompare(b.displayName);
}
