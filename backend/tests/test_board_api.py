import json
import sqlite3

from fastapi.testclient import TestClient

from app.main import app, get_openrouter_client
from app.openrouter import OpenRouterRequestError


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


def test_ai_diagnostic_returns_model_output(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PM_DB_PATH", str(tmp_path / "pm.db"))

    class FakeOpenRouterClient:
        def chat(self, prompt: str) -> str:
            assert prompt == "2+2"
            return "4"

    app.dependency_overrides[get_openrouter_client] = lambda: FakeOpenRouterClient()
    try:
        with TestClient(app) as client:
            response = client.post(
                "/api/ai/diagnostic",
                headers={"X-User": "user"},
                json={"prompt": "2+2"},
            )
            assert response.status_code == 200
            payload = response.json()
            assert payload["model"] == "openai/gpt-oss-120b"
            assert payload["output"] == "4"
    finally:
        app.dependency_overrides.clear()


def test_ai_diagnostic_missing_api_key_is_explicit(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PM_DB_PATH", str(tmp_path / "pm.db"))
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)

    with TestClient(app) as client:
        response = client.post(
            "/api/ai/diagnostic",
            headers={"X-User": "user"},
            json={"prompt": "2+2"},
        )
        assert response.status_code == 500
        assert response.json()["detail"] == "OPENROUTER_API_KEY is not configured."


def test_ai_diagnostic_upstream_errors_are_explicit(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PM_DB_PATH", str(tmp_path / "pm.db"))

    class FailingOpenRouterClient:
        def chat(self, prompt: str) -> str:
            raise OpenRouterRequestError(
                "OpenRouter authentication failed. Check OPENROUTER_API_KEY.",
                status_code=401,
            )

    app.dependency_overrides[get_openrouter_client] = lambda: FailingOpenRouterClient()
    try:
        with TestClient(app) as client:
            response = client.post(
                "/api/ai/diagnostic",
                headers={"X-User": "user"},
                json={"prompt": "2+2"},
            )
            assert response.status_code == 502
            assert response.json()["detail"] == (
                "OpenRouter authentication failed. Check OPENROUTER_API_KEY."
            )
    finally:
        app.dependency_overrides.clear()


def test_ai_chat_returns_message_without_board_update(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PM_DB_PATH", str(tmp_path / "pm.db"))

    class FakeOpenRouterClient:
        def chat_messages(self, messages: list[dict[str, str]]) -> str:
            assert messages[-1]["content"] == "Summarize current priorities"
            return json.dumps({"message": "Focus on in-progress cards first.", "boardUpdate": None})

    app.dependency_overrides[get_openrouter_client] = lambda: FakeOpenRouterClient()
    try:
        with TestClient(app) as client:
            response = client.post(
                "/api/ai/chat",
                headers={"X-User": "user"},
                json={"prompt": "Summarize current priorities", "history": []},
            )
            assert response.status_code == 200
            payload = response.json()
            assert payload["message"] == "Focus on in-progress cards first."
            assert payload["boardUpdate"] is None
    finally:
        app.dependency_overrides.clear()


def test_ai_chat_applies_valid_board_update(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PM_DB_PATH", str(tmp_path / "pm.db"))

    with TestClient(app) as client:
        current_board = client.get("/api/board", headers={"X-User": "user"}).json()
        updated_board = json.loads(json.dumps(current_board))
        updated_board["columns"][0]["title"] = "AI Updated"

    class FakeOpenRouterClient:
        def chat_messages(self, messages: list[dict[str, str]]) -> str:
            assert messages[-1]["content"] == "Rename backlog to AI Updated"
            return json.dumps(
                {
                    "message": "I renamed the first column.",
                    "boardUpdate": updated_board,
                }
            )

    app.dependency_overrides[get_openrouter_client] = lambda: FakeOpenRouterClient()
    try:
        with TestClient(app) as client:
            response = client.post(
                "/api/ai/chat",
                headers={"X-User": "user"},
                json={"prompt": "Rename backlog to AI Updated", "history": []},
            )
            assert response.status_code == 200
            payload = response.json()
            assert payload["message"] == "I renamed the first column."
            assert payload["boardUpdate"]["columns"][0]["title"] == "AI Updated"

            refreshed = client.get("/api/board", headers={"X-User": "user"})
            assert refreshed.status_code == 200
            assert refreshed.json()["columns"][0]["title"] == "AI Updated"
    finally:
        app.dependency_overrides.clear()


def test_ai_chat_rejects_non_json_model_output(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PM_DB_PATH", str(tmp_path / "pm.db"))

    class FakeOpenRouterClient:
        def chat_messages(self, messages: list[dict[str, str]]) -> str:
            return "not-json"

    app.dependency_overrides[get_openrouter_client] = lambda: FakeOpenRouterClient()
    try:
        with TestClient(app) as client:
            response = client.post(
                "/api/ai/chat",
                headers={"X-User": "user"},
                json={"prompt": "Any update?", "history": []},
            )
            assert response.status_code == 502
            assert response.json()["detail"] == "Model returned non-JSON output."
    finally:
        app.dependency_overrides.clear()


def test_ai_chat_rejects_invalid_schema_output(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PM_DB_PATH", str(tmp_path / "pm.db"))

    class FakeOpenRouterClient:
        def chat_messages(self, messages: list[dict[str, str]]) -> str:
            return json.dumps({"boardUpdate": None})

    app.dependency_overrides[get_openrouter_client] = lambda: FakeOpenRouterClient()
    try:
        with TestClient(app) as client:
            response = client.post(
                "/api/ai/chat",
                headers={"X-User": "user"},
                json={"prompt": "Any update?", "history": []},
            )
            assert response.status_code == 502
            assert "Model output did not match required schema" in response.json()["detail"]
    finally:
        app.dependency_overrides.clear()
