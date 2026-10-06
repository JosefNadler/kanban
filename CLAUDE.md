# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Project requirements, coding standards, and color scheme live in `AGENTS.md` (root). Folder-level guides are in `backend/AGENTS.md`, `frontend/AGENTS.md`, and `scripts/AGENTS.md`. The execution plan is `docs/PLAN.md` and the DB design is `docs/DATABASE.md` -- review PLAN.md before starting work, and keep these docs updated when behavior or run/test flow changes.

Key rules from AGENTS.md: keep it simple (no over-engineering, no unnecessary defensive code, no extra features), keep the README minimal, never use emojis, and find the root cause with evidence before fixing anything.

## Commands

Full app (Docker, serves on http://localhost:8000, loads root `.env`, which must set `OPENROUTER_API_KEY` for the AI endpoints):

```bash
./scripts/start-linux.sh   # docker compose up --build -d
./scripts/stop-linux.sh
```

The DB lives in the named volume `pm-data`, so it survives rebuilds. To reset to seed data, run `docker compose down -v`. Mac and Windows scripts are also in `scripts/`.

Backend (run from `backend/`, uses uv):

```bash
uv sync
uv run pytest                                              # all tests
uv run pytest tests/test_auth.py::test_logout_invalidates_token   # single test
uv run pytest --cov=app --cov-report=term-missing          # coverage
uv run uvicorn app.main:app --reload --port 8000
```

Frontend (run from `frontend/`):

```bash
npm run dev            # Next.js dev server on :3000 (no API: there is no dev proxy)
npm run lint
npm run test           # Vitest unit tests (src/**/*.test.ts[x])
npx vitest run src/lib/kanban.test.ts   # single unit test file
npm run test:coverage
npm run test:e2e       # Playwright against the real stack (see below)
npx playwright test -g "<test name>"   # single e2e test
npm run test:all       # unit + e2e
npm run build          # static export to frontend/out
```

## Architecture

- **Single container**: the Dockerfile builds the Next.js app as a static export (`output: "export"`), copies `frontend/out` into `backend/app/static`, and FastAPI serves it. `backend/app/static/index.html` in git is only a placeholder. `PM_STATIC_DIR` points the backend at another build (used by e2e). A catch-all route in `app/main.py` serves static files and falls back to `index.html`; routers are included before it, so all `/api/*` routes must live in `app/routes/`.
- **E2E tests are full stack**: `frontend/tests/e2e-server.sh` runs `npm run build`, then uvicorn on port 8123 with a temp `PM_DB_PATH`, so e2e needs `uv`. Each test registers its own users through the API (`tests/support.ts`); only `/api/boards/*/ai/chat` is mocked. Viewport is 1600x1000 so all columns are visible for drag tests.
- **Auth**: username/password accounts (scrypt via stdlib `hashlib`), bearer-token sessions stored as sha256 in `sessions` (30 days). The frontend keeps the token in localStorage `pm-token`; `src/lib/api.ts` sends it and fires the `pm-unauthorized` event on a 401, which signs the user out. Seed admin is `user` / `password`. Admins manage users at `/api/users`.
- **Persistence**: SQLite at `backend/data/pm.db` (override with `PM_DB_PATH`; backend tests get a fresh `tmp_path` DB via the `client` fixture). Schema version is `PRAGMA user_version` (currently 2); `initialize_database` migrates v1 databases. See `docs/DATABASE.md`.
- **Boards**: a user owns many boards and can share them with `editor` or `viewer` members (`board_members`). Role checks are FastAPI dependencies in `app/deps.py`; boards a user cannot access return 404. Each board's content is one JSON blob; the frontend `PUT`s the whole board to `/api/boards/{id}/data` after every edit. Saves are serialized in `KanbanBoard.tsx` (one request in flight, newest pending board sent next).
- **Board shape** (`schemaVersion: 2`): `columns[]` each with `id`, `title`, `cardIds[]`, plus a `cards` map keyed by card id; cards have `title`, `details`, `priority`, `dueDate`, `labels`, `assignee`. Columns can be added, renamed, reordered, and deleted (the UI only deletes empty ones). `BoardPayload` in `backend/app/schemas.py` validates consistency; the TS mirror is `frontend/src/lib/kanban.ts`. Change both together. Likewise, the seed board (`default_board_payload()` in `backend/app/db.py`) is mirrored by `frontend/src/lib/kanban-fixture.json`.
- **AI chat**: `POST /api/boards/{id}/ai/chat` (editors only) sends a system prompt with the board JSON, today's date and member usernames, plus history and the prompt, to OpenRouter (`openai/gpt-oss-120b`, stdlib `urllib` client in `app/openrouter.py`). `history` holds earlier messages only. The model must return JSON `{"message", "boardUpdate": null | BoardPayload}`. Do not add OpenRouter `response_format: json_schema`: with this model it produced invalid output and took ~2 min. The backend validates it (502 on non-JSON or schema mismatch) and saves `boardUpdate`. Pending saves are flushed before a prompt is sent, and the board is read-only while the AI request is in flight. Backend tests override `app.routes.ai.get_openrouter_client`.
- **Frontend state**: `AppShell` (session) -> `Workspace` (board list, views) -> `KanbanBoard` (one board, dnd-kit with `pointerWithin` then `closestCorners` collision detection so drops into empty columns work). Tests depend on `data-testid` attributes and accessible names; see `frontend/AGENTS.md`.
