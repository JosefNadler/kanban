# Frontend code guide

Next.js (App Router, static export), React, TypeScript, Tailwind CSS v4, dnd-kit. Vitest + Testing Library for unit tests, Playwright for full-stack e2e tests.

## Structure

- [src/app/page.tsx](./src/app/page.tsx) renders `AppShell`; [globals.css](./src/app/globals.css) holds the color variables.
- [src/lib/api.ts](./src/lib/api.ts): typed client for every backend endpoint. Sends `Authorization: Bearer <token>`, throws `ApiError` (with `status`) using the backend `detail`, and dispatches the `pm-unauthorized` window event on a 401 for an authenticated request.
- [src/lib/kanban.ts](./src/lib/kanban.ts): board types (mirror of backend `BoardPayload`) and pure helpers: `moveCard`, card and column operations, filters, `isOverdue`, `parseLabels`.
- [src/lib/kanban-fixture.json](./src/lib/kanban-fixture.json): the backend seed board (`default_board_payload()`), used by unit and e2e tests. Regenerate it when the seed changes.

## Components

- `AppShell`: session. Token in localStorage `pm-token`; loads `/api/auth/me`; clears the session on `pm-unauthorized`. Shows `AuthScreen` (sign in / create account) or `Workspace`.
- `Workspace`: header with navigation (Boards, Account, Users for admins), `BoardList` sidebar (create and select boards; the selected board is remembered per user in `pm-board-<username>`), and the active view.
- `KanbanBoard`: one board. Loads board + members, owns board state and the dnd-kit context, serializes saves (one `PUT` in flight; newest pending board sent next), and shows save/error/retry states. Board header: inline name/description editing, AI assistant toggle (`pm-chat-open`), share/members panel (`BoardMembers`), delete (owner) or leave (member). Viewers get a read-only board without the AI chat. Dragging is disabled while a filter is active.
- `KanbanColumn` (rename, move left/right, delete when empty), `KanbanCard`, `CardForm` (title, details, priority, due date, labels, assignee), `CardMeta` (badges), `BoardFilters`, `AIChatSidebar`.
- `AccountSettings` (display name, password) and `UserAdmin` (admin user management).
- `ui.tsx`: shared buttons, field, panel and error text styles.

Tests rely on `data-testid` attributes (`column-<id>`, `card-<id>`, `board-members`, `user-row-<username>`, `current-user`) and on accessible names.

## Tests

- Unit tests live next to the code (`*.test.ts[x]`) and mock `@/lib/api` with `vi.mock(..., importOriginal)`.
- E2E tests in [tests/](./tests) run against the real stack: [tests/e2e-server.sh](./tests/e2e-server.sh) builds the static export and starts the FastAPI backend on port 8123 with a temporary DB (needs `uv`). Each test creates its own users via the API ([tests/support.ts](./tests/support.ts)). Only the AI chat endpoint is mocked with `page.route`.

## NPM scripts

- `npm run dev`, `npm run build`, `npm run lint`
- `npm run test` (unit), `npm run test:coverage`, `npm run test:e2e`, `npm run test:all`
