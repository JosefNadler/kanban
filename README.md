# Kanban Studio

Project management with multiple Kanban boards per user, board sharing, user management, and an AI assistant.

## Run

Requires Docker and a root `.env` with `OPENROUTER_API_KEY` (only the AI assistant needs it).

```bash
./scripts/start-linux.sh   # or start-mac.sh / start-windows.ps1
./scripts/stop-linux.sh
```

Open http://localhost:8000 and sign in as `user` / `password` (an admin), or create an account. Data lives in the `pm-data` Docker volume; `docker compose down -v` resets it.

## Test

```bash
cd backend && uv run pytest
cd frontend && npm run test && npm run test:e2e
```

The e2e tests start the real backend with a temporary database. API reference: [backend/AGENTS.md](backend/AGENTS.md).
