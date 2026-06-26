import { redactSecrets } from "../core/security/secretsRedactor.js";

type LogLevel = "info" | "warn" | "error" | "debug";

function write(level: LogLevel, message: string, meta?: unknown): void {
  const payload = meta === undefined ? "" : ` ${redactSecrets(JSON.stringify(meta))}`;
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${redactSecrets(message)}${payload}`;

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
}

export const logger = {
  info: (message: string, meta?: unknown) => write("info", message, meta),
  warn: (message: string, meta?: unknown) => write("warn", message, meta),
  error: (message: string, meta?: unknown) => write("error", message, meta),
  debug: (message: string, meta?: unknown) => {
    if (process.env.CREWFORGE_LOG_LEVEL === "verbose") {
      write("debug", message, meta);
    }
  }
};
