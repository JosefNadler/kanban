# Project Management MVP

## Part 2 scaffold run

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
- Rename a column or edit cards, then refresh and confirm changes persist.
- Confirm `http://localhost:8000/api/hello` returns JSON.

## Backend board API (Part 6)

The board API expects an `X-User` header.

- `GET /api/board`
  - `X-User: user` returns current board JSON.
  - Missing `X-User` returns `401`.
- `PUT /api/board`
  - `X-User: user` with valid board JSON replaces the stored board.
  - Invalid board payload returns `422`.
