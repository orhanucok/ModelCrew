# CrewForge

[![CI](https://github.com/orhanucok/ModelCrew/actions/workflows/ci.yml/badge.svg)](https://github.com/orhanucok/ModelCrew/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

One local workspace for all your text AI models.

CrewForge is a modern localhost web app for connecting text/code AI providers, discovering models, running server-side health checks, separating free/paid/broken models, selecting a usable crew, and running a planned multi-agent workflow with saved run history. It provides a premium, responsive interface and robust local-first secure storage.

## Features

- **Multi-Provider Support:** Seamlessly connect to G4F, OpenRouter, Gemini, Groq, OpenAI, xAI, Ollama, and Anthropic.
- **Two Chat Modes:**
  - *Direct Chat:* Converse with a single AI model.
  - *Forge Crew:* Automate complex tasks using a multi-agent workflow (Orchestrator → Planner → Workers → Reviewer → Synthesizer).
- **Secure by Default:** API keys are encrypted and stored locally. They are never sent to the frontend or included in logs.
- **Run History:** Easily review past workflows, agent outputs, and final results.
- **Premium UI:** Designed with modern web aesthetics, including glassmorphism, fluid animations, and robust light/dark mode support.

## Prerequisites

- **Node.js 22.5+** (the server uses the built-in `node:sqlite` module).
- **pnpm 11+** (`npm install -g pnpm`).

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

## Project Structure

```txt
crewforge/
├── apps/
│   ├── server/   # Node + Express + TypeScript API, SQLite storage, provider adapters, crew orchestration
│   └── web/      # React + Vite + TypeScript frontend
├── package.json  # pnpm workspace root with dev/build/typecheck scripts
└── pnpm-workspace.yaml
```

## What Is Included

- React + Vite + TypeScript frontend.
- Node + Express + TypeScript backend.
- SQLite local storage using Node's built-in SQLite module.
- Setup, Models, Chat, Runs, and Settings pages.
- Chat page with two usage modes:
  - Chat Mode: send a message directly to one selected model.
  - Forge Crew Mode: manually assign selected models to Orchestrator, Planner, Workers, Reviewer, and Synthesizer.
- Provider adapters for G4F public endpoints, OpenRouter, Gemini, Groq, OpenAI, xAI, Ollama, and Anthropic.
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

- Paid model use is visible but remains locked for some automated selection paths; automatic paid fallback is experimental.
- Public no-key endpoints can be slow, unavailable, or rate limited depending on external factors.
- OS keychain mode is represented in settings but securely falls back to session-only behavior to avoid cross-platform native dependency friction.

## License

Released under the [MIT License](LICENSE).
