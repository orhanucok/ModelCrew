import { db } from "./db.js";

export function migrate(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS providers (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      requires_api_key INTEGER NOT NULL DEFAULT 0,
      experimental INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'not_configured',
      key_saved INTEGER NOT NULL DEFAULT 0,
      key_preview TEXT,
      last_tested_at INTEGER,
      message TEXT,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS provider_keys (
      provider_id TEXT PRIMARY KEY,
      storage_mode TEXT NOT NULL,
      encrypted_key TEXT,
      key_preview TEXT,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS models (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      endpoint TEXT,
      display_name TEXT NOT NULL,
      kind TEXT NOT NULL,
      pricing TEXT NOT NULL,
      status TEXT NOT NULL,
      selectable INTEGER NOT NULL DEFAULT 0,
      selected INTEGER NOT NULL DEFAULT 0,
      capabilities_json TEXT NOT NULL,
      context_window INTEGER,
      recommendation_score REAL NOT NULL DEFAULT 0,
      recommended_roles_json TEXT NOT NULL,
      last_checked_at INTEGER,
      recent_failure_count INTEGER NOT NULL DEFAULT 0,
      recent_invalid_output_count INTEGER NOT NULL DEFAULT 0,
      health_state TEXT,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      run_mode TEXT NOT NULL DEFAULT 'forge_crew',
      forge_config_json TEXT,
      user_task TEXT NOT NULL,
      selected_models_json TEXT NOT NULL,
      state TEXT NOT NULL,
      current_round INTEGER NOT NULL,
      max_rounds INTEGER NOT NULL,
      stop_reason TEXT,
      blackboard_json TEXT NOT NULL,
      outputs_json TEXT NOT NULL,
      errors_json TEXT NOT NULL,
      final_answer TEXT,
      events_json TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  const runColumns = db.prepare("PRAGMA table_info(runs)").all() as Array<{ name: string }>;
  const hasColumn = (name: string) => runColumns.some((column) => column.name === name);

  if (!hasColumn("run_mode")) {
    db.exec("ALTER TABLE runs ADD COLUMN run_mode TEXT NOT NULL DEFAULT 'forge_crew';");
  }

  if (!hasColumn("forge_config_json")) {
    db.exec("ALTER TABLE runs ADD COLUMN forge_config_json TEXT;");
  }
}
