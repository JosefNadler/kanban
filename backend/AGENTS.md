# Backend guide

This folder contains the FastAPI backend for the Project Management MVP.

## Current scope

- Serves statically exported frontend files at `/` from [app/static/](./app/static)
- Serves a demo JSON API endpoint at `/api/hello` (scaffold check, unused by the app)
- Returns 404 for unknown `/api/*` paths; all other unknown paths fall back to `index.html`
- Persists Kanban board data in SQLite
- Exposes authenticated board APIs:
  - `GET /api/board`
  - `PUT /api/board` (column ids and order are fixed; changes return 422)
- Exposes authenticated AI diagnostic API:
  - `POST /api/ai/diagnostic`
- Exposes authenticated AI chat API with structured output:
  - `POST /api/ai/chat`
- Runs with `uv` using dependencies defined in [pyproject.toml](./pyproject.toml)

## Structure

- [app/main.py](./app/main.py): FastAPI app entrypoint and routes.
- [app/db.py](./app/db.py): SQLite initialization, bootstrap, and board persistence helpers.
- [app/openrouter.py](./app/openrouter.py): OpenRouter API client for diagnostic and chat calls.
- [app/schemas.py](./app/schemas.py): Board payload models, AI request/response models, and validation rules.
- [app/static/](./app/static): statically exported frontend build artifacts copied in Docker build.
- [pyproject.toml](./pyproject.toml): backend dependencies and uv project config.
- [tests/test_board_api.py](./tests/test_board_api.py): backend unit tests for DB bootstrap, auth, validation, persistence, AI diagnostic behavior, and structured AI chat behavior.