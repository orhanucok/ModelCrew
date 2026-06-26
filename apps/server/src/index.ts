import express from "express";
import cors from "cors";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "./core/storage/schema.js";
import { initializeProviderRegistry, refreshAllProviderStatuses } from "./core/providers/providerRegistry.js";
import { providersRouter } from "./routes/providers.routes.js";
import { modelsRouter } from "./routes/models.routes.js";
import { chatRouter } from "./routes/chat.routes.js";
import { runsRouter } from "./routes/runs.routes.js";
import { settingsRouter } from "./routes/settings.routes.js";
import { asUserMessage } from "./utils/errors.js";
import { logger } from "./utils/logger.js";
import { redactSecrets } from "./core/security/secretsRedactor.js";

const port = Number(process.env.PORT ?? 8787);
const distDir = dirname(fileURLToPath(import.meta.url));
const webDistPath = join(distDir, "../../web/dist");
const webIndexPath = join(webDistPath, "index.html");

migrate();
initializeProviderRegistry();
void refreshAllProviderStatuses();

const app = express();
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || /^http:\/\/(127\.0\.0\.1|localhost):(5173|8787)$/.test(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    }
  })
);
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, name: "CrewForge" });
});

app.use("/api/providers", providersRouter);
app.use("/api/models", modelsRouter);
app.use("/api/chat", chatRouter);
app.use("/api/runs", runsRouter);
app.use("/api/settings", settingsRouter);

if (existsSync(webIndexPath)) {
  app.use(express.static(webDistPath));
  app.get("*", (_req, res) => {
    res.sendFile(webIndexPath);
  });
}

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error("Request failed", err);
  const status = typeof err === "object" && err && "statusCode" in err ? Number(err.statusCode) : 500;
  res.status(Number.isFinite(status) ? status : 500).json({
    message: redactSecrets(asUserMessage(err))
  });
});

app.listen(port, "127.0.0.1", () => {
  logger.info(`CrewForge server listening on http://127.0.0.1:${port}`);
});
