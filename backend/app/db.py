import json
import os
import sqlite3
from contextlib import closing
from pathlib import Path

from app.schemas import BOARD_SCHEMA_VERSION, BoardPayload
from app.security import hash_password, hash_token, new_session_token

DB_VERSION = 2
DEFAULT_USERNAME = "user"
DEFAULT_PASSWORD = "password"
DEFAULT_DB_PATH = Path(__file__).resolve().parents[1] / "data" / "pm.db"
SESSION_DAYS = 30

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL DEFAULT '',
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS boards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  board_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_boards_owner ON boards(owner_id);

CREATE TABLE IF NOT EXISTS board_members (
  board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
  PRIMARY KEY (board_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_board_members_user ON board_members(user_id);
"""

DEFAULT_COLUMNS = [
    ("col-backlog", "Backlog"),
    ("col-discovery", "Discovery"),
    ("col-progress", "In Progress"),
    ("col-review", "Review"),
    ("col-done", "Done"),
]


def empty_board_payload() -> dict:
    return {
        "schemaVersion": BOARD_SCHEMA_VERSION,
        "columns": [{"id": column_id, "title": title, "cardIds": []} for column_id, title in DEFAULT_COLUMNS],
        "cards": {},
    }


def default_board_payload() -> dict:
    return {
        "schemaVersion": BOARD_SCHEMA_VERSION,
        "columns": [
            {"id": "col-backlog", "title": "Backlog", "cardIds": ["card-1", "card-2"]},
            {"id": "col-discovery", "title": "Discovery", "cardIds": ["card-3"]},
            {"id": "col-progress", "title": "In Progress", "cardIds": ["card-4", "card-5"]},
            {"id": "col-review", "title": "Review", "cardIds": ["card-6"]},
            {"id": "col-done", "title": "Done", "cardIds": ["card-7", "card-8"]},
        ],
        "cards": {
            "card-1": {
                "id": "card-1",
                "title": "Align roadmap themes",
                "details": "Draft quarterly themes with impact statements and metrics.",
                "priority": "high",
                "labels": ["planning"],
            },
            "card-2": {
                "id": "card-2",
                "title": "Gather customer signals",
                "details": "Review support tags, sales notes, and churn feedback.",
                "labels": ["research"],
            },
            "card-3": {
                "id": "card-3",
                "title": "Prototype analytics view",
                "details": "Sketch initial dashboard layout and key drill-downs.",
                "priority": "medium",
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
                "priority": "low",
                "labels": ["design"],
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


def serialize_board(board: BoardPayload) -> str:
    return json.dumps(board.model_dump(by_alias=True, mode="json"))


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
        version = connection.execute("PRAGMA user_version").fetchone()[0]
        if version == 1:
            migrate_v1_to_v2(connection)
        connection.executescript(SCHEMA_SQL)
        connection.execute(f"PRAGMA user_version = {DB_VERSION}")
        seed_default_user(connection)
        connection.commit()


def migrate_v1_to_v2(connection: sqlite3.Connection) -> None:
    """v1 had one board per user and no passwords; v2 adds accounts, named boards, and sharing."""
    connection.execute("PRAGMA foreign_keys = OFF")
    connection.execute("ALTER TABLE users RENAME TO users_v1")
    connection.execute("ALTER TABLE boards RENAME TO boards_v1")
    connection.executescript(SCHEMA_SQL)
    connection.execute("INSERT INTO users (id, username, created_at) SELECT id, username, created_at FROM users_v1")
    connection.execute(
        "UPDATE users SET password_hash = ?, is_admin = 1 WHERE username = ?",
        (hash_password(DEFAULT_PASSWORD), DEFAULT_USERNAME),
    )

    for row in connection.execute("SELECT * FROM boards_v1").fetchall():
        payload = json.loads(row["board_json"])
        payload["schemaVersion"] = BOARD_SCHEMA_VERSION
        board = BoardPayload.model_validate(payload)
        connection.execute(
            """
            INSERT INTO boards (owner_id, name, board_json, schema_version, created_at, updated_at)
            VALUES (?, 'My first board', ?, ?, ?, ?)
            """,
            (row["user_id"], serialize_board(board), BOARD_SCHEMA_VERSION, row["created_at"], row["updated_at"]),
        )

    connection.execute("DROP TABLE boards_v1")
    connection.execute("DROP TABLE users_v1")
    connection.commit()
    connection.execute("PRAGMA foreign_keys = ON")


def seed_default_user(connection: sqlite3.Connection) -> None:
    if connection.execute("SELECT COUNT(*) FROM users").fetchone()[0] > 0:
        return

    user_id = create_user(connection, DEFAULT_USERNAME, DEFAULT_PASSWORD, "Demo User", is_admin=True)
    create_board(
        connection,
        user_id,
        "My first board",
        "Demo project board.",
        BoardPayload.model_validate(default_board_payload()),
    )


# Users


USER_COLUMNS = "id, username, display_name, is_admin, created_at"


def create_user(
    connection: sqlite3.Connection,
    username: str,
    password: str,
    display_name: str,
    is_admin: bool = False,
) -> int:
    """Raises sqlite3.IntegrityError if the username is taken."""
    cursor = connection.execute(
        "INSERT INTO users (username, display_name, password_hash, is_admin) VALUES (?, ?, ?, ?)",
        (username, display_name, hash_password(password), int(is_admin)),
    )
    connection.commit()
    return int(cursor.lastrowid)


def get_user(connection: sqlite3.Connection, user_id: int) -> sqlite3.Row | None:
    return connection.execute(f"SELECT {USER_COLUMNS} FROM users WHERE id = ?", (user_id,)).fetchone()


def get_user_by_username(connection: sqlite3.Connection, username: str) -> sqlite3.Row | None:
    return connection.execute(
        f"SELECT {USER_COLUMNS}, password_hash FROM users WHERE username = ?",
        (username,),
    ).fetchone()


def get_password_hash(connection: sqlite3.Connection, user_id: int) -> str:
    return connection.execute("SELECT password_hash FROM users WHERE id = ?", (user_id,)).fetchone()[0]


def list_users(connection: sqlite3.Connection) -> list[sqlite3.Row]:
    return connection.execute(f"SELECT {USER_COLUMNS} FROM users ORDER BY username").fetchall()


def update_user(
    connection: sqlite3.Connection,
    user_id: int,
    *,
    display_name: str | None = None,
    is_admin: bool | None = None,
    password: str | None = None,
) -> None:
    if display_name is not None:
        connection.execute("UPDATE users SET display_name = ? WHERE id = ?", (display_name, user_id))
    if is_admin is not None:
        connection.execute("UPDATE users SET is_admin = ? WHERE id = ?", (int(is_admin), user_id))
    if password is not None:
        connection.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hash_password(password), user_id))
    connection.commit()


def delete_user(connection: sqlite3.Connection, user_id: int) -> None:
    connection.execute("DELETE FROM users WHERE id = ?", (user_id,))
    connection.commit()


# Sessions


def create_session(connection: sqlite3.Connection, user_id: int) -> str:
    token = new_session_token()
    # Pruning on sign-in keeps the table small without a background job.
    connection.execute("DELETE FROM sessions WHERE expires_at <= datetime('now')")
    connection.execute(
        "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', ?))",
        (hash_token(token), user_id, f"+{SESSION_DAYS} days"),
    )
    connection.commit()
    return token


def get_session_user_id(connection: sqlite3.Connection, token: str) -> int | None:
    row = connection.execute(
        "SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > datetime('now')",
        (hash_token(token),),
    ).fetchone()
    return int(row["user_id"]) if row else None


def delete_session(connection: sqlite3.Connection, token: str) -> None:
    connection.execute("DELETE FROM sessions WHERE token_hash = ?", (hash_token(token),))
    connection.commit()


def delete_other_sessions(connection: sqlite3.Connection, user_id: int, keep_token: str | None) -> None:
    connection.execute(
        "DELETE FROM sessions WHERE user_id = ? AND token_hash != ?",
        (user_id, hash_token(keep_token) if keep_token else ""),
    )
    connection.commit()


# Boards

BOARD_SUMMARY_SQL = """
SELECT
  b.id, b.name, b.description, b.created_at, b.updated_at,
  owner.username AS owner,
  CASE WHEN b.owner_id = :user_id THEN 'owner' ELSE m.role END AS role,
  (SELECT COUNT(*) FROM json_each(b.board_json, '$.cards')) AS card_count
FROM boards b
JOIN users owner ON owner.id = b.owner_id
LEFT JOIN board_members m ON m.board_id = b.id AND m.user_id = :user_id
WHERE (b.owner_id = :user_id OR m.user_id IS NOT NULL)
"""


def list_boards(connection: sqlite3.Connection, user_id: int) -> list[sqlite3.Row]:
    return connection.execute(
        BOARD_SUMMARY_SQL + " ORDER BY b.created_at, b.id",
        {"user_id": user_id},
    ).fetchall()


def get_board_summary(connection: sqlite3.Connection, board_id: int, user_id: int) -> sqlite3.Row | None:
    """Returns None when the board does not exist or the user has no access to it."""
    return connection.execute(
        BOARD_SUMMARY_SQL + " AND b.id = :board_id",
        {"user_id": user_id, "board_id": board_id},
    ).fetchone()


def get_board_data(connection: sqlite3.Connection, board_id: int) -> BoardPayload:
    row = connection.execute("SELECT board_json FROM boards WHERE id = ?", (board_id,)).fetchone()
    return BoardPayload.model_validate(json.loads(row["board_json"]))


def create_board(
    connection: sqlite3.Connection,
    owner_id: int,
    name: str,
    description: str,
    board: BoardPayload,
) -> int:
    cursor = connection.execute(
        "INSERT INTO boards (owner_id, name, description, board_json, schema_version) VALUES (?, ?, ?, ?, ?)",
        (owner_id, name, description, serialize_board(board), board.schema_version),
    )
    connection.commit()
    return int(cursor.lastrowid)


def update_board_meta(
    connection: sqlite3.Connection,
    board_id: int,
    *,
    name: str | None = None,
    description: str | None = None,
) -> None:
    if name is not None:
        connection.execute("UPDATE boards SET name = ? WHERE id = ?", (name, board_id))
    if description is not None:
        connection.execute("UPDATE boards SET description = ? WHERE id = ?", (description, board_id))
    connection.execute("UPDATE boards SET updated_at = datetime('now') WHERE id = ?", (board_id,))
    connection.commit()


def save_board_data(connection: sqlite3.Connection, board_id: int, board: BoardPayload) -> None:
    connection.execute(
        "UPDATE boards SET board_json = ?, schema_version = ?, updated_at = datetime('now') WHERE id = ?",
        (serialize_board(board), board.schema_version, board_id),
    )
    connection.commit()


def delete_board(connection: sqlite3.Connection, board_id: int) -> None:
    connection.execute("DELETE FROM boards WHERE id = ?", (board_id,))
    connection.commit()


# Board members


def list_members(connection: sqlite3.Connection, board_id: int) -> list[sqlite3.Row]:
    return connection.execute(
        """
        SELECT u.username, u.display_name, 'owner' AS role, 0 AS sort_order
        FROM boards b JOIN users u ON u.id = b.owner_id WHERE b.id = :board_id
        UNION ALL
        SELECT u.username, u.display_name, m.role, 1 AS sort_order
        FROM board_members m JOIN users u ON u.id = m.user_id WHERE m.board_id = :board_id
        ORDER BY sort_order, username
        """,
        {"board_id": board_id},
    ).fetchall()


def set_member(connection: sqlite3.Connection, board_id: int, user_id: int, role: str) -> None:
    connection.execute(
        """
        INSERT INTO board_members (board_id, user_id, role) VALUES (?, ?, ?)
        ON CONFLICT(board_id, user_id) DO UPDATE SET role = excluded.role
        """,
        (board_id, user_id, role),
    )
    connection.commit()


def remove_member(connection: sqlite3.Connection, board_id: int, user_id: int) -> None:
    connection.execute("DELETE FROM board_members WHERE board_id = ? AND user_id = ?", (board_id, user_id))
    connection.commit()
