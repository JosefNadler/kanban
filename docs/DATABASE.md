# Database design

SQLite, accessed with the stdlib `sqlite3` module from [backend/app/db.py](../backend/app/db.py).

## File location

- default: `backend/data/pm.db` (in Docker: the `pm-data` volume)
- override: environment variable `PM_DB_PATH` (tests use a temporary file)

Startup creates the parent directory, the file, and the schema if missing.

## Schema (version 2)

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL DEFAULT '',      -- scrypt$<salt hex>$<hash hex>
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,                 -- sha256 of the bearer token
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL                     -- 30 days after creation
);

CREATE TABLE boards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  board_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE board_members (
  board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
  PRIMARY KEY (board_id, user_id)
);
```

Notes:
- Usernames are unique case-insensitively.
- A user may own any number of boards. The owner is not stored in `board_members`; a user's role on a board is `owner` if they own it, otherwise their `board_members.role`.
- Deleting a user deletes their sessions, the boards they own, and their memberships.
- On a fresh database, the admin user `user` / `password` is seeded with one demo board ("My first board").

## Board JSON (`schemaVersion: 2`)

```json
{
  "schemaVersion": 2,
  "columns": [{ "id": "col-backlog", "title": "Backlog", "cardIds": ["card-1"] }],
  "cards": {
    "card-1": {
      "id": "card-1",
      "title": "Example card",
      "details": "",
      "priority": "high",
      "dueDate": "2026-12-01",
      "labels": ["planning"],
      "assignee": "user"
    }
  }
}
```

Validation (`BoardPayload` in [backend/app/schemas.py](../backend/app/schemas.py)):
- 1 to 12 columns with unique ids; titles 1-60 characters.
- every card is referenced by exactly one column, and each `cards` key equals the card id.
- `priority` is `null`, `low`, `medium` or `high`; `dueDate` is `null` or `YYYY-MM-DD`.
- up to 10 unique labels of 1-30 characters.
- `assignee` is a username or `null` (not checked against members, so removing a member keeps old assignments readable).

## Migrations

`PRAGMA user_version` holds the schema version.

- `1`: original MVP (one board per user, no passwords).
- `2`: `migrate_v1_to_v2` renames the old tables, creates the v2 schema, copies users, gives `user` the password `password` and admin rights, copies each board as "My first board" upgraded to board JSON v2, then drops the old tables.

To add a migration: bump `DB_VERSION`, add a `migrate_vN_to_vN+1` function, and call it from `initialize_database`.
