# Project plan

This plan is execution-oriented. Each part contains:
- a checklist of concrete substeps
- validation tests to run
- success criteria that must be true before moving on

## Part 1: Planning and baseline documentation

### Checklist
- [x] Expand [PLAN.md](./PLAN.md) with detailed substeps, tests, and success criteria for all parts.
- [x] Create [frontend/AGENTS.md](../frontend/AGENTS.md) documenting the existing frontend code structure and behavior.
- [x] User review and explicit approval of this plan before implementation work starts.

### Validation tests
- Manual review that all 10 parts include checklist, tests, and success criteria.
- Manual review that [frontend/AGENTS.md](../frontend/AGENTS.md) matches actual frontend code.

### Success criteria
- Plan is specific enough to execute without guessing.
- Dependencies between parts are clear.
- User approves plan.

## Part 2: Scaffolding (Docker + FastAPI hello world)

### Checklist
- [x] Create backend scaffold under `backend/` using FastAPI.
- [x] Add Dockerfile and supporting container files at repo root (or agreed location).
- [x] Add scripts in `scripts/` for start/stop on Linux, macOS, and Windows.
- [x] Serve simple static HTML from FastAPI at `/`.
- [x] Add a simple API endpoint (for example `/api/health`) and wire static page to call it.
- [x] Document local run flow in README sections relevant to scaffolding.

### Validation tests
- Build container image successfully.
- Start app via scripts on target platform (at least Linux in current environment).
- `GET /` returns hello-world HTML.
- API call from page to backend endpoint succeeds.

### Success criteria
- One command/script path starts the full MVP container locally.
- Browser shows hello world page and confirmed backend API response.
- Stop scripts reliably terminate service.

## Part 3: Frontend integration (serve current Kanban demo)

### Checklist
- [x] Add frontend build step into container workflow.
- [x] Configure FastAPI to serve built Next.js static output at `/`.
- [x] Preserve existing Kanban behavior and visual style.
- [x] Ensure static assets resolve correctly behind FastAPI static serving.
- [x] Add/update integration tests around served frontend.

### Validation tests
- Frontend unit tests pass.
- End-to-end test verifies `/` shows Kanban board with 5 columns.
- Build and run in container; UI loads without missing asset errors.

### Success criteria
- Current demo board appears from FastAPI-served root route.
- No regression in column rename, add card, remove card, drag/drop.

## Part 4: Dummy sign-in flow

### Checklist
- [x] Add sign-in page/experience shown before board access.
- [x] Hardcode credentials check to `user` / `password`.
- [x] Add authenticated session mechanism suitable for local MVP.
- [x] Add logout control that clears auth state.
- [x] Guard board route so unauthenticated users are redirected or blocked.

### Validation tests
- Unit tests for auth state transitions (login success/failure, logout).
- Integration/e2e tests for:
  - blocked board access before login
  - successful login with valid credentials
  - rejection with invalid credentials
  - logout returns to sign-in screen

### Success criteria
- Only authenticated users can access Kanban UI.
- Dummy credentials work exactly as specified.

## Part 5: Database modeling and sign-off

### Checklist
- [x] Propose SQLite schema for users and one board per user.
- [x] Model board content as JSON payload with clear versionable shape.
- [x] Document schema, constraints, and migration strategy in `docs/`.
- [x] Define how DB file is created if missing.
- [x] Request and obtain user sign-off before backend persistence implementation.

### Validation tests
- Review SQL/schema against requirements:
  - supports multiple users
  - one board per user for MVP
  - board stored/retrieved as JSON
- Sanity test creating a fresh DB file from zero state.

### Success criteria
- Schema is approved by user.
- Documentation is sufficient for implementation in Parts 6-7.

## Part 6: Backend Kanban API + persistence

### Checklist
- [x] Implement DB initialization on startup if DB does not exist.
- [x] Add backend routes to read and update board for authenticated user.
- [x] Add backend validation for payload shape and error responses.
- [x] Ensure one-board-per-user behavior is enforced.
- [x] Add backend unit tests for success and failure cases.

### Validation tests
- Backend test suite covering:
  - create/read/update board
  - missing user/unauthorized access
  - invalid payload rejection
  - DB bootstrap path
- Manual API smoke tests with curl.

### Success criteria
- Backend can persist and return board state per user reliably.
- Fresh environment auto-creates usable DB.

## Part 7: Frontend + backend persistence wiring

### Checklist
- [x] Replace frontend in-memory board state bootstrap with backend fetch.
- [x] Send board updates to backend for rename/add/delete/move operations.
- [x] Handle loading, save-in-progress, and error states clearly.
- [x] Keep UX responsive while preserving consistency with persisted state.
- [x] Add frontend integration tests for persisted behavior.

### Validation tests
- Unit/integration tests for API client and state synchronization.
- E2E test:
  - make board changes
  - refresh page
  - verify changes persist

### Success criteria
- Board state is durable across reloads and restarts (with persistent DB volume/file).
- Frontend and backend stay in sync without data loss on normal operations.

## Part 8: OpenRouter connectivity

### Checklist
- [x] Add backend OpenRouter client integration using `.env` API key.
- [x] Configure model to `openai/gpt-oss-120b`.
- [x] Add simple diagnostic endpoint or internal test path for AI call.
- [x] Implement clear errors for missing/invalid API key and API failures.

### Validation tests
- Automated/backend test with mocked OpenRouter client for happy/error paths.
- Manual live connectivity test asking `2+2`.

### Success criteria
- Backend can successfully call OpenRouter and return AI output.
- Failure modes are explicit and debuggable.

## Part 9: Structured AI response for chat + optional board update

### Checklist
- [x] Define structured output schema:
  - user-facing assistant message
  - optional board update payload
- [x] Send current board JSON + user prompt + conversation history to model.
- [x] Validate and parse model structured output safely.
- [x] If update is present and valid, apply and persist board mutation.
- [x] Add tests for valid response, invalid schema, and no-update case.

### Validation tests
- Backend unit tests with mocked AI responses:
  - response-only
  - response + valid board update
  - malformed structured output
- Contract tests to confirm schema conformance.

### Success criteria
- AI responses are deterministic in shape.
- Optional AI-driven board updates are validated and persisted.

## Part 10: Sidebar AI chat UI + board refresh

### Checklist
- [ ] Build sidebar chat UI aligned with project color scheme.
- [ ] Support chat message history and submit behavior.
- [ ] Integrate with backend AI endpoint.
- [ ] When backend returns board update, refresh board state automatically.
- [ ] Add robust UI states (loading, error, retry where appropriate).
- [ ] Add unit and e2e tests for chat and board update flows.

### Validation tests
- Frontend unit/integration tests for chat interactions.
- E2E tests for:
  - sending a prompt and rendering reply
  - AI-triggered card create/edit/move reflected on board
  - persistence after refresh

### Success criteria
- Sidebar chat is fully functional.
- AI can update board through structured output path end-to-end.
- User sees board refresh automatically after AI-driven changes.

## Global sequencing and quality gates

### Dependencies
- Part 1 must be approved before Parts 2-10.
- Part 5 must be approved before Part 6 persistence implementation.
- Part 8 must be complete before Parts 9-10.
- Part 6 and Part 7 are both required before meaningful Part 10 validation.

## Confirmed design decisions implemented through Part 7

- Frontend delivery: Next.js app is statically exported and served by FastAPI from `/`.
- Authentication model (MVP): client-side login with hardcoded credentials (`user` / `password`), with frontend session state in localStorage.
- Backend board authorization contract: board API requires `X-User` header; current MVP board operations target `user`.
- Persistence model: SQLite with one board per user (`UNIQUE(user_id)`), board stored as JSON with `schemaVersion: 1`.
- Startup bootstrap: backend auto-creates DB file/schema, ensures default user and default board exist.
- Frontend persistence strategy: load board via `GET /api/board` and persist edits via `PUT /api/board` for rename/add/delete/move.
- UX state decisions: explicit loading, saving, error, and retry states for board fetch/save.
- Drag-and-drop collision behavior: `pointerWithin` is used first (with `closestCorners` fallback) to support dropping cards into empty columns reliably.

### Quality gates per part
- [ ] Relevant tests for the part pass.
- [ ] No regression in previously completed behavior.
- [ ] Documentation updated for changed run/test flow.
- [ ] User checkpoint performed where required (Parts 1 and 5).