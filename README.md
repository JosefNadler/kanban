# Project Management MVP

## Run

### Linux

```bash
./scripts/start-linux.sh
```

Stop:

```bash
./scripts/stop-linux.sh
```

### macOS

```bash
./scripts/start-mac.sh
```

Stop:

```bash
./scripts/stop-mac.sh
```

### Windows (PowerShell)

```powershell
./scripts/start-windows.ps1
```

Stop:

```powershell
./scripts/stop-windows.ps1
```

## Verify

- Open `http://localhost:8000` and confirm the sign-in page appears.
- Sign in with `user` / `password` and confirm the Kanban board appears.
- Rename a column, add/edit/move cards, then refresh and confirm changes persist.
- Confirm `http://localhost:8000/api/hello` returns JSON.

## Board API

The board API expects an `X-User` header.

- `GET /api/board`
  - `X-User: user` returns current board JSON.
  - Missing `X-User` returns `401`.
- `PUT /api/board`
  - `X-User: user` with valid board JSON replaces the stored board.
  - Invalid board payload returns `422`.
  - Columns are fixed: changing column ids or order returns `422` (titles can change).

## OpenRouter diagnostic API

The backend uses OpenRouter model `openai/gpt-oss-120b`.

- Set `OPENROUTER_API_KEY` in root `.env`.
- Docker Compose loads root `.env` for the backend container.
- After changing `.env`, restart with `./scripts/stop-linux.sh` then `./scripts/start-linux.sh` (or platform equivalent).
- `POST /api/ai/diagnostic`
  - Requires `X-User: user`.
  - Request body: `{ "prompt": "2+2" }`
  - Response body: `{ "model": "openai/gpt-oss-120b", "output": "4" }` (example)
  - Missing API key returns `500`.
  - Upstream OpenRouter failures return `502`.

## AI chat API

- `POST /api/ai/chat`
  - Requires `X-User: user`.
  - Request body:
    - `prompt` (string)
    - `history` (optional array of `{ "role": "user" | "assistant", "content": "..." }`): earlier messages only, not including `prompt`
  - Response body:
    - `message` (assistant text)
    - `boardUpdate` (`null` or full board payload with `schemaVersion: 1`)
  - If `boardUpdate` is present and valid, backend persists it as the latest board state.
  - Non-JSON model output, schema mismatch, or a changed column set returns `502`.

## Sidebar AI chat UI

- The board screen includes an AI chat sidebar.
- Prompts are sent to `POST /api/ai/chat` with conversation history.
- Assistant replies are shown in the sidebar message history.
- If `boardUpdate` is returned, board columns/cards refresh automatically in the UI.
- Chat includes sending, error, and retry states.
- Pending board saves finish before a prompt is sent, and the board is read-only while the AI is working.
