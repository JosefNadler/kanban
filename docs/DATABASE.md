# Database design for Part 5

This document defines the SQLite model for the MVP and the implementation rules for Parts 6-7.

## Goals

- Support multiple users in schema design.
- Enforce one Kanban board per user for MVP.
- Store the full board as JSON for simple persistence and easy evolution.
- Create the DB automatically if missing.

## SQLite file location

Backend will use:

- default DB path: `backend/data/pm.db`
- optional override: environment variable `PM_DB_PATH`

If the file or parent directory does not exist, backend startup should create both.

## Schema (SQL)

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS boards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  board_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
```

Notes:
- `users.username` is unique.
- `boards.user_id` is unique, which enforces one board per user.
- `board_json` stores canonical board state JSON.
- `schema_version` supports future payload upgrades.

## Board JSON shape (v1)

`board_json` stores this object:

```json
{
  "schemaVersion": 1,
  "columns": [
    { "id": "col-backlog", "title": "Backlog", "cardIds": ["card-1"] }
  ],
  "cards": {
    "card-1": {
      "id": "card-1",
      "title": "Example card",
      "details": "Example details"
    }
  }
}
```

### v1 constraints

- `schemaVersion` must be `1`.
- `columns` is an ordered array.
- each column has `id`, `title`, and ordered `cardIds`.
- `cards` is a dictionary keyed by card ID.
- every ID in `cardIds` must exist in `cards`.
- every card should be referenced exactly once across all columns.

## Startup and creation flow

On backend startup:

1. Resolve DB path (`PM_DB_PATH` or default).
2. Ensure parent directory exists.
3. Open SQLite connection.
4. Enable `PRAGMA foreign_keys = ON`.
5. Run `CREATE TABLE IF NOT EXISTS` statements.
6. Ensure MVP user row exists for `username='user'`.
7. Ensure this user has one board row initialized with default board JSON.

This guarantees first run from an empty filesystem becomes usable with no manual DB step.

## Migration strategy

Use SQLite `PRAGMA user_version` as schema migration version.

- `user_version = 1`: initial schema above.
- Future migrations:
  - add SQL migration scripts in version order
  - run them in a transaction
  - bump `user_version`
- If `board_json.schemaVersion` needs to evolve, migrate payloads in code during read/write path.

For MVP, no external migration framework is required.

## Why this model

- Simple and stable persistence boundary (`board_json`).
- Works with current frontend board structure.
- Keeps SQL constraints where they matter (`one board per user`, foreign keys, uniqueness).
- Leaves room to normalize cards/columns later without blocking MVP delivery.
