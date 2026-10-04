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
uv run pytest tests/test_board_api.py::test_missing_user_header_is_rejected   # single test
uv run uvicorn app.main:app --reload --port 8000
```

Frontend (run from `frontend/`):

```bash
npm run dev            # Next.js dev server on :3000
npm run lint
npm run test           # Vitest unit tests (src/**/*.test.ts[x])
npx vitest run src/lib/kanban.test.ts   # single unit test file
npm run test:e2e       # Playwright; auto-starts dev server on 127.0.0.1:3000
npx playwright test -g "<test name>"   # single e2e test
npm run test:all       # unit + e2e
npm run build          # static export to frontend/out
```

## Architecture

- **Single container**: the Dockerfile builds the Next.js app as a static export (`output: "export"`), copies `frontend/out` into `backend/app/static`, and FastAPI serves it. `backend/app/static/index.html` in git is only a placeholder; it is overwritten in the image. A catch-all route in `app/main.py` serves static files and falls back to `index.html`, so all `/api/*` routes must be declared before it.
- **No dev proxy**: the Next dev server does not forward `/api` to FastAPI. Playwright e2e tests mock `/api/board` and `/api/ai/chat` with `page.route`, so they run without the backend. Testing the real integration means building the container.
- **Auth (MVP)**: login is client-side only (hardcoded `user`/`password`, flag in localStorage `pm-authenticated`). The backend identifies the user solely via the `X-User` header (401 if missing, 403 if unknown user); `frontend/src/lib/boardApi.ts` sets it.
- **Persistence**: SQLite at `backend/data/pm.db` (override with `PM_DB_PATH`; tests use this with `tmp_path`). Startup (`lifespan` -> `initialize_database`) creates the schema and seeds the default user and board. One board per user is enforced by `UNIQUE(user_id)`. The whole board is stored as a single JSON blob; the frontend `PUT`s the full board after every edit (no partial updates). Saves are serialized in `KanbanBoard.tsx` (one request in flight, newest pending board sent next). Columns are fixed: the backend rejects updates that change column ids or order.
- **Board shape** (`schemaVersion: 1`): `columns[]` each with `id`, `title`, `cardIds[]`, plus a `cards` map keyed by card id. `BoardPayload` in `backend/app/schemas.py` validates consistency (unique ids, card keys match ids, card references valid). The TS mirror is in `frontend/src/lib/kanban.ts`. Change both together.
- **AI chat**: `POST /api/ai/chat` sends a system prompt with the current board JSON, plus history and the prompt, to OpenRouter (`openai/gpt-oss-120b`, stdlib `urllib` client in `app/openrouter.py`). `history` holds earlier messages only (not the current prompt). The model must return JSON `{"message", "boardUpdate": null | BoardPayload}`. Do not add OpenRouter `response_format: json_schema`: with this model it produced invalid output and took ~2 min. The backend validates it (502 on non-JSON or schema mismatch) and persists `boardUpdate` if present. The frontend then replaces its board state with the returned board. Pending saves are flushed before a prompt is sent, and the board is read-only while the AI request is in flight. Backend tests override the `get_openrouter_client` dependency to mock the model. `POST /api/ai/diagnostic` is a plain prompt-in/text-out connectivity check.
- **Frontend state**: `KanbanBoard.tsx` owns board state, the dnd-kit context (collision detection is `pointerWithin` with `closestCorners` fallback so drops into empty columns work), save/loading/error states, and the `AIChatSidebar`. Tests depend on `data-testid` attributes on columns and cards.
