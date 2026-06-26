import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const dataDir = join(process.cwd(), "data");
export const dbPath = join(dataDir, "crewforge.sqlite");
export const secretPath = join(dataDir, "local-secret.bin");

mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");
