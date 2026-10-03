# Code review

Date: 2026-10-03. Scope: the whole repository (backend, frontend, Docker/scripts, tests, docs) as of commit `525e14b` plus uncommitted working-tree changes.

## Verification performed

| Check | Result |
|---|---|
| Backend `uv run pytest` (on a copy with `main.py` from HEAD) | 13 passed |
| Backend import of working-tree `app/main.py` | **SyntaxError** (see C1) |
| Frontend `npm run lint` | clean |
| Frontend `npx vitest run` | 15 passed |
| Frontend `npm run build` | succeeds |
| Frontend `npx tsc --noEmit` | 60 errors, all in test files (see L5) |
| Playwright e2e | not run (mocked API; does not exercise backend) |

Overall: the codebase is small, readable, and close to the AGENTS.md simplicity goal. Board validation is solid and the backend tests cover auth, persistence and AI-response validation well. The main risks are one broken file, a duplicated chat message sent to the model, client-side save races, a missing MVP feature (card editing), and a non-reproducible Docker build.

## Findings and actions

Severity: Critical = app does not run; High = wrong behavior or missing requirement users will hit; Medium = correctness/robustness gap; Low = hygiene.

### Critical

**C1. Uncommitted change breaks the backend** -- `backend/app/main.py:90`
A git remote URL (`git@github.com:JosefNadler/kanban.git`) was pasted into the file, replacing a blank line. Python fails to import the module, so the container and all backend tests fail.
- Action: `git checkout backend/app/main.py` (or delete line 90 and restore the blank line).

### High

**H1. The latest user message is sent to the model twice** -- `frontend/src/components/KanbanBoard.tsx:209-218`, `backend/app/main.py:76-78`
The frontend appends the new prompt to `history` and also sends it as `prompt`; the backend then appends `prompt` again after `history`. Every chat request ends with two identical user turns. Retry (`addUserMessage: false`) has the same effect. The unit test at `KanbanBoard.test.tsx:93-97` asserts this behavior, and no backend test uses non-empty history, so it went unnoticed.
- Action: send `history` as the messages *before* the current prompt (i.e. `chatMessages`, not `nextMessages`). Update the unit test and add a backend test asserting the message list sent to the client for a non-empty history.

**H2. Card editing is not implemented** -- `frontend/src/components/KanbanCard.tsx`
AGENTS.md requires "cards ... can be moved with drag and drop, and edited". The UI supports add, remove and move only; titles/details can only be changed via the AI chat.
- Action: add an inline edit mode on `KanbanCard` (title + details, save/cancel) wired through a `handleEditCard` in `KanbanBoard` using the existing `applyBoardChange`. Add unit and e2e coverage.

**H3. Concurrent saves can persist a stale board** -- `frontend/src/components/KanbanBoard.tsx:91-128`
Every edit fires a full-board `PUT` immediately and in parallel. `latestSaveId` only discards stale *responses* in the UI; on the server, requests run in a threadpool and can commit out of order, so the DB can end up with an older board than the UI shows. Column rename makes this frequent (see M1).
- Action: serialize saves -- keep at most one request in flight and, when it completes, send only the latest pending board. This is a few lines in `persistBoard` and removes the race without server changes.

**H4. AI board updates race with in-flight saves** -- `frontend/src/components/KanbanBoard.tsx:223-226`
- The AI builds its update from the DB board, which may not include an edit whose save is still in flight; the AI's board then silently drops that edit.
- `setBoard(result.boardUpdate)` does not bump `latestSaveId`, so a save response arriving afterwards overwrites the AI result in the UI with the older board.
- Action: with H3 in place, wait for the save queue to drain before sending a chat request (or disable chat send while `isSaving`), and increment `latestSaveId` when applying an AI board update.

**H5. Docker build ignores `uv.lock` and installs dev dependencies** -- `Dockerfile:20-21`
Only `pyproject.toml` is copied before `uv sync`, so dependencies are re-resolved on every build (not reproducible) and pytest/httpx2 ship in the runtime image.
- Action: copy `uv.lock` too and run `uv sync --frozen --no-dev`. Use `uv run --no-sync` (or the venv's `uvicorn` directly) in `CMD` so startup never re-resolves.

### Medium

**M1. Column rename saves on every keystroke and errors when the title is cleared** -- `frontend/src/components/KanbanColumn.tsx:42-46`
`onChange` calls `onRename`, which `PUT`s the full board per character. Clearing the field sends `title: ""`, which the backend rejects (422, `min_length=1`), showing "Request failed with status 422." while local state diverges from the DB.
- Action: keep a local draft in `KanbanColumn` and call `onRename` on blur/Enter only, ignoring empty or unchanged titles.

**M2. SQLite connections are never closed** -- `backend/app/main.py:35-38`, `backend/app/db.py:294`
`with sqlite3.connect(...)` only commits/rolls back; it does not close. Each request leaks a connection until garbage collection.
- Action: in `get_connection`, `try: yield connection finally: connection.close()`; same in `initialize_database` (e.g. `contextlib.closing`).

**M3. "Fixed columns" is not enforced for AI updates** -- `backend/app/schemas.py`, `backend/app/main.py:160-161`
AGENTS.md says columns are fixed (rename only). `BoardPayload` accepts any column set, so the model can add, remove or reorder columns. The UI hardcodes five (`lg:grid-cols-5`, "One board. Five columns.") and would render oddly.
- Action: in `ai_chat` (and `PUT /api/board`), reject updates whose ordered column ids differ from the current board's, returning 502/422 respectively. State the rule in the system prompt.

**M4. Model output format is only requested by prompt text** -- `backend/app/openrouter.py:402-405`, `backend/app/main.py:62-79`
- No `response_format` is sent, so the model may wrap JSON in prose or code fences; any such reply becomes a 502.
- The system prompt describes `BoardPayload` only by name, giving the model no field-level schema.
- Action: send `response_format: {"type": "json_schema", ...}` built from `AIChatResponse.model_json_schema(by_alias=True)` (OpenRouter supports structured outputs; confirm this model/provider honors it with a live call), and include a short example board shape in the system prompt.

**M5. 30s upstream timeout is tight for a reasoning model** -- `backend/app/openrouter.py:418`
`gpt-oss-120b` with a full board in context can exceed 30s, surfacing as "Failed to reach OpenRouter: timed out".
- Action: raise to ~90s.

**M6. Save failures leave the UI diverged from the DB** -- `frontend/src/components/KanbanBoard.tsx:104-113`
On a failed `PUT` the optimistic board stays on screen with an error message; a reload silently loses the change. The header still says "All changes saved" once `isSaving` clears.
- Action: show "Unsaved changes" with a retry-save button when the last save failed, instead of "All changes saved".

### Low

**L1. Seed board duplicated three times** -- `backend/app/db.py:23`, `frontend/src/lib/kanban.ts:18` (`initialData`), `frontend/src/lib/kanban-fixture.json`
`initialData` is now used only by tests. Tests should share one fixture.
- Action: delete `initialData` and import `kanban-fixture.json` in the unit tests, as the e2e test already does.

**L2. Backend allows identity spoofing via `X-User`** -- `backend/app/main.py:41-52`
Any client can act as any user by setting the header; login is client-side only. Acceptable for the documented MVP, but it blocks the multi-user goal.
- Action: none for MVP. Record in PLAN.md as the first item for any multi-user work (server-side login issuing a session cookie).

**L3. Unknown `/api/*` paths return `index.html` with 200** -- `backend/app/main.py:166-185`
A typo'd API path returns HTML, which shows up in the frontend as a JSON parse error rather than a 404.
- Action: raise 404 in `serve_frontend` when `full_path` starts with `api/`.

**L4. `.dockerignore` gaps** -- `.dockerignore`
`backend/data/` (a local `pm.db` would be baked into the image and seed a fresh `pm-data` volume) and `frontend/out` are not excluded.
- Action: add `backend/data` and `frontend/out`.

**L5. TypeScript errors in tests** -- `frontend/tsconfig.json`
Vitest globals are enabled but their types are not, so `tsc --noEmit` reports 60 errors and editors show red squiggles in tests.
- Action: add `"types": ["vitest/globals"]` to `compilerOptions`.

**L6. Playwright artifact tracked in git** -- `frontend/test-results/.last-run.json`
- Action: `git rm --cached` it and add `test-results/` to `frontend/.gitignore`.

**L7. Container runs as root** -- `Dockerfile`
- Action: optional for a local MVP; add a non-root `USER` if this is ever deployed.

**L8. Documentation drift**
- `docs/PLAN.md`: "Confirmed design decisions" stops at Part 7 (no AI contract); quality-gate boxes unchecked.
- `backend/AGENTS.md` says "Parts 2-9" and does not mention `/api/hello` being unused by the app.
- `frontend/AGENTS.md` still calls itself the "frontend-only implementation".
- `README.md` headings still reference "Part 2 scaffold" and "Part 6".
- Action: one doc pass after the fixes above.

## Recommended order of work

1. C1 (one line, unblocks everything).
2. H1, M2, M5 -- small, isolated backend/frontend fixes with tests.
3. H3 + H4 + M1 + M6 together -- they all touch the save path in `KanbanBoard.tsx`/`KanbanColumn.tsx`.
4. H2 -- card editing feature.
5. M3 + M4 -- tighten the AI contract.
6. H5, L4, L7 -- Docker image.
7. L1, L3, L5, L6, L8 -- cleanup and docs.

## Resolution status (2026-10-03)

| ID | Status | Notes |
|---|---|---|
| C1 | Fixed | Fixed by the user. The same stray URL was also in `docs/PLAN.md` line 27; removed. |
| H1 | Fixed | Frontend sends earlier messages as `history`; retry drops the already-shown prompt. Backend test `test_ai_chat_sends_history_before_prompt_once`. |
| H2 | Fixed | Inline card edit (`CardForm` shared with add). Unit test + e2e `edits a card and keeps it after reload`. |
| H3 | Fixed | Saves serialized in `KanbanBoard.tsx`; save responses no longer overwrite local state. Unit test `sends only the latest board after an in-flight save`. |
| H4 | Fixed | Chat waits for pending saves (aborts with a message if a save failed); board is read-only while chat is in flight. |
| H5 | Fixed | `uv.lock` copied, `uv sync --frozen --no-dev`, `uv run --no-sync`. Image built and smoke-tested; pytest absent from image. |
| M1 | Fixed | Rename commits on blur/Enter; empty title reverts. Two unit tests. |
| M2 | Fixed | Connections closed in `get_connection` and `initialize_database`. |
| M3 | Fixed | Column ids/order enforced on `PUT` (422) and AI updates (502). Two backend tests. |
| M4 | Partly fixed | System prompt now states the board shape and rules. `response_format: json_schema` was implemented and tested live, then reverted: with `gpt-oss-120b` it returned invalid JSON after 121s, while the same request without it succeeded in 2-3s. |
| M5 | Fixed | Timeout raised to 90s. Live calls with the final prompt took ~17s. |
| M6 | Fixed | Header shows "Unsaved changes" plus a "Retry save" button. Unit test. |
| L1 | Fixed | `initialData` removed; unit tests use `kanban-fixture.json`. |
| L2 | Deferred | MVP scope; recorded here. |
| L3 | Fixed | Unknown `/api/*` returns 404. Backend test. |
| L4 | Fixed | `backend/data`, `frontend/out`, `frontend/test-results` added to `.dockerignore`. |
| L5 | Fixed | `"types": ["vitest/globals"]`; `tsc --noEmit` is clean. |
| L6 | Fixed | Untracked and ignored (`git rm --cached`). |
| L7 | Not done | A non-root user could not write to the existing root-owned `pm-data` volume without a migration step; not worth it for a local MVP. |
| L8 | Fixed | README, PLAN.md, backend/frontend AGENTS.md, and CLAUDE.md updated. |

Final verification: backend 17 passed; frontend lint clean, `tsc` clean, 19 unit tests passed, 9 e2e passed, `npm run build` OK; Docker image built and served `/`, `/api/board`, and 404 for unknown `/api/*`; two live `/api/ai/chat` calls updated the board correctly.
