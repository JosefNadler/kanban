import json
import os
import sqlite3
from contextlib import closing
from pathlib import Path

from app.schemas import BoardPayload

DEFAULT_USERNAME = "user"
DEFAULT_DB_PATH = Path(__file__).resolve().parents[1] / "data" / "pm.db"

SCHEMA_SQL = """
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
"""


def default_board_payload() -> dict:
    return {
        "schemaVersion": 1,
        "columns": [
            {"id": "col-backlog", "title": "Backlog", "cardIds": ["card-1", "card-2"]},
            {"id": "col-discovery", "title": "Discovery", "cardIds": ["card-3"]},
            {
                "id": "col-progress",
                "title": "In Progress",
                "cardIds": ["card-4", "card-5"],
            },
            {"id": "col-review", "title": "Review", "cardIds": ["card-6"]},
            {"id": "col-done", "title": "Done", "cardIds": ["card-7", "card-8"]},
        ],
        "cards": {
            "card-1": {
                "id": "card-1",
                "title": "Align roadmap themes",
                "details": "Draft quarterly themes with impact statements and metrics.",
            },
            "card-2": {
                "id": "card-2",
                "title": "Gather customer signals",
                "details": "Review support tags, sales notes, and churn feedback.",
            },
            "card-3": {
                "id": "card-3",
                "title": "Prototype analytics view",
                "details": "Sketch initial dashboard layout and key drill-downs.",
            },
            "card-4": {
                "id": "card-4",
                "title": "Refine status language",
                "details": "Standardize column labels and tone across the board.",
            },
            "card-5": {
                "id": "card-5",
                "title": "Design card layout",
                "details": "Add hierarchy and spacing for scanning dense lists.",
            },
            "card-6": {
                "id": "card-6",
                "title": "QA micro-interactions",
                "details": "Verify hover, focus, and loading states.",
            },
            "card-7": {
                "id": "card-7",
                "title": "Ship marketing page",
                "details": "Final copy approved and asset pack delivered.",
            },
            "card-8": {
                "id": "card-8",
                "title": "Close onboarding sprint",
                "details": "Document release notes and share internally.",
            },
        },
    }


def get_db_path() -> Path:
    configured_path = os.getenv("PM_DB_PATH")
    return Path(configured_path) if configured_path else DEFAULT_DB_PATH


def connect_db(db_path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(db_path, check_same_thread=False)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_database() -> None:
    db_path = get_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)

    with closing(connect_db(db_path)) as connection:
        connection.executescript(SCHEMA_SQL)
        connection.execute("PRAGMA user_version = 1")
        ensure_default_user_board(connection)
        connection.commit()


def ensure_default_user_board(connection: sqlite3.Connection) -> None:
    connection.execute(
        "INSERT OR IGNORE INTO users (username) VALUES (?)",
        (DEFAULT_USERNAME,),
    )

    user_row = connection.execute(
        "SELECT id FROM users WHERE username = ?",
        (DEFAULT_USERNAME,),
    ).fetchone()

    if user_row is None:
        raise RuntimeError("Failed to initialize default user.")

    default_board = BoardPayload.model_validate(default_board_payload())
    connection.execute(
        """
        INSERT OR IGNORE INTO boards (user_id, board_json, schema_version)
        VALUES (?, ?, ?)
        """,
        (
            user_row["id"],
            json.dumps(default_board.model_dump(by_alias=True)),
            default_board.schema_version,
        ),
    )


def get_user_id(connection: sqlite3.Connection, username: str) -> int | None:
    row = connection.execute(
        "SELECT id FROM users WHERE username = ?",
        (username,),
    ).fetchone()
    return int(row["id"]) if row else None


def get_board_for_user(connection: sqlite3.Connection, user_id: int) -> BoardPayload | None:
    row = connection.execute(
        "SELECT board_json FROM boards WHERE user_id = ?",
        (user_id,),
    ).fetchone()

    if row is None:
        return None

    payload = json.loads(row["board_json"])
    return BoardPayload.model_validate(payload)


def save_board_for_user(
    connection: sqlite3.Connection,
    user_id: int,
    board: BoardPayload,
) -> None:
    serialized_board = json.dumps(board.model_dump(by_alias=True))
    connection.execute(
        """
        INSERT INTO boards (user_id, board_json, schema_version)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          board_json = excluded.board_json,
          schema_version = excluded.schema_version,
          updated_at = datetime('now')
        """,
        (user_id, serialized_board, board.schema_version),
    )
    connection.commit()
