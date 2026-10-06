# Backend guide

FastAPI backend: JSON API under `/api` plus the statically exported frontend at `/`.

## Structure

- [app/main.py](./app/main.py): app setup, router registration, `/api/health`, static file catch-all (registered last). `PM_STATIC_DIR` overrides the static directory.
- [app/deps.py](./app/deps.py): request dependencies: DB connection, bearer-token auth (`get_current_user`, `require_admin`), board access (`get_board_access`, `require_board_editor`, `require_board_owner`).
- [app/db.py](./app/db.py): schema, v1 -> v2 migration, seed data, and all SQL.
- [app/security.py](./app/security.py): scrypt password hashing and session tokens (stdlib only).
- [app/schemas.py](./app/schemas.py): Pydantic models (camelCase JSON aliases) including board JSON validation.
- [app/openrouter.py](./app/openrouter.py): OpenRouter client (stdlib `urllib`).
- [app/routes/](./app/routes): `auth.py`, `users.py`, `boards.py`, `ai.py`.

## API

All endpoints except register, login and health need `Authorization: Bearer <token>` (401 otherwise).

Auth:
- `POST /api/auth/register` `{username, password, displayName?}` -> 201 `{token, user}`; creates an empty starter board. 409 if taken.
- `POST /api/auth/login` `{username, password}` -> `{token, user}`; 401 on bad credentials.
- `POST /api/auth/logout` -> 204, `GET /api/auth/me`, `PATCH /api/auth/me` `{displayName}`.
- `POST /api/auth/me/password` `{currentPassword, newPassword}` -> 204; signs out the user's other sessions.

Users:
- `GET /api/users` (any user, for sharing).
- Admin only: `POST /api/users`, `PATCH /api/users/{id}` `{displayName?, isAdmin?, password?}`, `DELETE /api/users/{id}`. Admins cannot demote or delete themselves; a password reset signs the user out.

Boards (404 if the board does not exist or the user has no access):
- `GET /api/boards` -> summaries `{id, name, description, owner, role, cardCount, createdAt, updatedAt}`.
- `POST /api/boards` `{name, description?}` -> 201 detail (summary + `data`), with five empty default columns.
- `GET /api/boards/{id}` -> detail. `PATCH /api/boards/{id}` `{name?, description?}` (editor).
- `PUT /api/boards/{id}/data` full board JSON (editor). `DELETE /api/boards/{id}` (owner).
- `GET /api/boards/{id}/members`; `PUT /api/boards/{id}/members/{username}` `{role: editor|viewer}` (owner); `DELETE /api/boards/{id}/members/{username}` (owner, or a member leaving).

AI:
- `POST /api/boards/{id}/ai/chat` `{prompt, history}` (editor) -> `{message, boardUpdate}`; a valid `boardUpdate` is saved. 502 on non-JSON or invalid model output, 500 without `OPENROUTER_API_KEY`.
- `POST /api/ai/diagnostic` `{prompt}` -> `{model, output}`.

## Tests

`uv run pytest` (add `--cov=app --cov-report=term-missing` for coverage). Fixtures in [tests/conftest.py](./tests/conftest.py) give each test a fresh DB (`client`) and a signed-in admin (`admin`); `register()` and `login()` create more sessions. AI tests override `get_openrouter_client` from `app.routes.ai`.
