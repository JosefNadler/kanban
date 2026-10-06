import json
import sqlite3

from fastapi.testclient import TestClient

from app import main
from app.main import app
from conftest import login

V1_SCHEMA = """
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE boards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  board_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_users_username ON users(username);
PRAGMA user_version = 1;
"""

V1_BOARD = {
    "schemaVersion": 1,
    "columns": [
        {"id": "col-backlog", "title": "My Ideas", "cardIds": ["card-1"]},
        {"id": "col-done", "title": "Done", "cardIds": []},
    ],
    "cards": {"card-1": {"id": "card-1", "title": "Kept card", "details": "From v1"}},
}


def test_fresh_database_is_created_and_seeded(db_path) -> None:
    with TestClient(app) as client:
        headers = login(client)
        assert len(client.get("/api/boards", headers=headers).json()) == 1

    assert db_path.exists()
    with sqlite3.connect(db_path) as connection:
        assert connection.execute("PRAGMA user_version").fetchone()[0] == 2
        password_hash = connection.execute("SELECT password_hash FROM users").fetchone()[0]
        assert password_hash.startswith("scrypt$")
        assert "password" not in password_hash


def test_restart_does_not_reseed(db_path) -> None:
    with TestClient(app) as client:
        headers = login(client)
        board_id = client.get("/api/boards", headers=headers).json()[0]["id"]
        client.patch(f"/api/boards/{board_id}", headers=headers, json={"name": "Kept"})

    with TestClient(app) as client:
        headers = login(client)
        assert [board["name"] for board in client.get("/api/boards", headers=headers).json()] == ["Kept"]


def test_v1_database_is_migrated(db_path) -> None:
    with sqlite3.connect(db_path) as connection:
        connection.executescript(V1_SCHEMA)
        connection.execute("INSERT INTO users (username) VALUES ('user')")
        connection.execute(
            "INSERT INTO boards (user_id, board_json) VALUES (1, ?)",
            (json.dumps(V1_BOARD),),
        )

    with TestClient(app) as client:
        headers = login(client)
        me = client.get("/api/auth/me", headers=headers).json()
        assert me["isAdmin"] is True

        boards = client.get("/api/boards", headers=headers).json()
        assert [board["name"] for board in boards] == ["My first board"]

        data = client.get(f"/api/boards/{boards[0]['id']}", headers=headers).json()["data"]
        assert data["schemaVersion"] == 2
        assert data["columns"][0]["title"] == "My Ideas"
        assert data["cards"]["card-1"] == {
            "id": "card-1",
            "title": "Kept card",
            "details": "From v1",
            "priority": None,
            "dueDate": None,
            "labels": [],
            "assignee": None,
        }

        # One-board-per-user is gone after the migration.
        assert client.post("/api/boards", headers=headers, json={"name": "Second"}).status_code == 201

    with sqlite3.connect(db_path) as connection:
        assert connection.execute("PRAGMA user_version").fetchone()[0] == 2
        tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
        assert "users_v1" not in tables
        assert "boards_v1" not in tables
        assert connection.execute("PRAGMA foreign_key_check").fetchall() == []


def test_health_and_unknown_api_path(client) -> None:
    assert client.get("/api/health").json() == {"status": "ok"}
    assert client.get("/api/does-not-exist").status_code == 404


def test_frontend_fallback_serves_index(client) -> None:
    response = client.get("/some/client/route")
    assert response.status_code == 200
    assert "<html" in response.text


def test_static_files_are_served(client, tmp_path, monkeypatch) -> None:
    static_dir = tmp_path / "static"
    (static_dir / "nested").mkdir(parents=True)
    (static_dir / "index.html").write_text("<html>root</html>")
    (static_dir / "nested" / "index.html").write_text("<html>nested</html>")
    (static_dir / "app.js").write_text("console.log(1)")
    monkeypatch.setattr(main, "STATIC_DIR", static_dir)
    monkeypatch.setattr(main, "INDEX_HTML", static_dir / "index.html")

    assert client.get("/").text == "<html>root</html>"
    assert client.get("/nested").text == "<html>nested</html>"
    assert client.get("/app.js").text == "console.log(1)"
    assert client.get("/missing/route").text == "<html>root</html>"
    assert client.get("/..%2F..%2Fetc%2Fpasswd").status_code in (200, 404)
    assert "root:" not in client.get("/..%2F..%2Fetc%2Fpasswd").text

    monkeypatch.setattr(main, "INDEX_HTML", static_dir / "absent.html")
    assert client.get("/missing/route").status_code == 404
