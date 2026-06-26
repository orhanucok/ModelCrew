# CrewForge

One local workspace for all your text AI models.

CrewForge is a localhost web app for connecting text/code AI providers, discovering models, running server-side health checks, separating free/paid/broken models, selecting a usable crew, and running a planned multi-agent workflow with saved run history.

## Run Locally

```bash
pnpm install
pnpm dev
```

Open:

```txt
http://127.0.0.1:8787
```

The local server serves both the API and the built React app from the same localhost origin.

## What Is Included

- React + Vite + TypeScript frontend.
- Node + Express + TypeScript backend.
- SQLite local storage using Node's built-in SQLite module.
- Setup, Models, Chat, Runs, and Settings pages.
- Chat page with two usage modes:
  - Chat Mode: send a message directly to one selected model.
  - Forge Crew Mode: manually assign selected models to Orchestrator, Planner, Workers, Reviewer, and Synthesizer.
- Provider adapters for G4F public endpoints, OpenRouter, Gemini, Groq, OpenAI, xAI, Ollama, plus a safe Anthropic stub.
- Local API key storage modes, including encrypted local storage and session-only storage.
- Secret redaction for logs, SSE events, and run storage.
- Model discovery, text/code filtering, health-check queue, health cache, and provider cooldowns.
- Free/no-key/free-tier, paid/key-required, and broken/passive model sections.
- Ready-only model selection.
- SSE live run events.
- Single-model direct chat.
- Manual Forge Crew configuration with 1 to 5 Workers and optional auto-fill.
- Orchestrator, planner, worker, reviewer, and synthesizer flow.
- Active Forge Crew runs survive page navigation; the Chat page reconnects to saved live progress when reopened.
- Auto-fill prefers the selected model with the widest context window for Synthesizer.
- Theme setting supports System, Light, and Dark modes.
- Fallback across selected ready free models.
- Run history with agent outputs, reviewer notes, final answer, and errors.

## Chat Modes

Chat Mode uses only one model selected on the Models page:

```txt
User -> Selected Model -> Response
```

Forge Crew Mode uses only models selected on the Models page, then streams progress from:

```txt
Orchestrator -> Planner -> Workers -> Reviewer -> Synthesizer
```

Useful endpoints:

```txt
POST /api/chat/single
POST /api/runs
GET /api/runs/:runId/events
```

## Provider Notes

G4F Public Endpoints is experimental. The MVP only uses public no-key style endpoints and does not use cookies, HAR files, browser scraping, private sessions, or `g4f.space/v1` as a no-key endpoint.

OpenRouter, Gemini, Groq, OpenAI, xAI, and Anthropic require API keys for practical use. Paid/key-required models are locked by default and are not selected automatically.

Ollama is local-only and is discovered from:

```txt
http://127.0.0.1:11434
```

## Security

CrewForge never returns saved API keys to the frontend. Keys are never included in health checks, SSE events, or run history. Health checks use only:

```txt
Reply with exactly: OK
```

## Current Limitations

- Anthropic is a non-crashing provider stub in this MVP.
- Paid model use is visible but remains locked; automatic paid fallback is not implemented.
- Public no-key endpoints can be slow, unavailable, or rate limited.
- Stop run currently stops the browser stream, not the already-started server-side run.
- OS keychain mode is represented in settings but falls back to session-only behavior until a keychain integration is added.
