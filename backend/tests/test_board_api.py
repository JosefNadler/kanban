import sqlite3

from fastapi.testclient import TestClient

from app.main import app


def test_database_bootstrap_creates_db_file(tmp_path, monkeypatch) -> None:
    db_path = tmp_path / "pm.db"
    monkeypatch.setenv("PM_DB_PATH", str(db_path))

    with TestClient(app) as client:
        response = client.get("/api/board", headers={"X-User": "user"})
        assert response.status_code == 200
        payload = response.json()
        assert payload["schemaVersion"] == 1
        assert len(payload["columns"]) == 5

    assert db_path.exists()


def test_missing_user_header_is_rejected(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PM_DB_PATH", str(tmp_path / "pm.db"))

    with TestClient(app) as client:
        response = client.get("/api/board")
        assert response.status_code == 401
        assert response.json()["detail"] == "Missing X-User header."


def test_unknown_user_is_rejected(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PM_DB_PATH", str(tmp_path / "pm.db"))

    with TestClient(app) as client:
        response = client.get("/api/board", headers={"X-User": "alice"})
        assert response.status_code == 403
        assert response.json()["detail"] == "Unknown user."


def test_board_update_persists(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PM_DB_PATH", str(tmp_path / "pm.db"))

    with TestClient(app) as client:
        initial = client.get("/api/board", headers={"X-User": "user"})
        assert initial.status_code == 200
        payload = initial.json()
        payload["columns"][0]["title"] = "Ideas"

        update = client.put("/api/board", headers={"X-User": "user"}, json=payload)
        assert update.status_code == 200
        assert update.json()["columns"][0]["title"] == "Ideas"

        refreshed = client.get("/api/board", headers={"X-User": "user"})
        assert refreshed.status_code == 200
        assert refreshed.json()["columns"][0]["title"] == "Ideas"


def test_invalid_board_payload_is_rejected(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PM_DB_PATH", str(tmp_path / "pm.db"))

    with TestClient(app) as client:
        invalid_payload = {
            "schemaVersion": 1,
            "columns": [{"id": "col-backlog", "title": "Backlog", "cardIds": ["card-1"]}],
            "cards": {},
        }
        response = client.put(
            "/api/board",
            headers={"X-User": "user"},
            json=invalid_payload,
        )
        assert response.status_code == 422


def test_board_row_remains_unique_per_user(tmp_path, monkeypatch) -> None:
    db_path = tmp_path / "pm.db"
    monkeypatch.setenv("PM_DB_PATH", str(db_path))

    with TestClient(app) as client:
        payload = client.get("/api/board", headers={"X-User": "user"}).json()
        payload["columns"][0]["title"] = "One"
        assert client.put("/api/board", headers={"X-User": "user"}, json=payload).status_code == 200

        payload["columns"][0]["title"] = "Two"
        assert client.put("/api/board", headers={"X-User": "user"}, json=payload).status_code == 200

    with sqlite3.connect(db_path) as connection:
        count_row = connection.execute("SELECT COUNT(*) AS count FROM boards").fetchone()
        assert count_row is not None
        assert count_row[0] == 1
