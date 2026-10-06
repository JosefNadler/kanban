import json

from app.main import app
from app.openrouter import OpenRouterRequestError
from app.routes.ai import get_openrouter_client
from conftest import first_board_id


class FakeClient:
    def __init__(self, reply: str | None = None, error: OpenRouterRequestError | None = None):
        self.reply = reply
        self.error = error
        self.sent: list[list[dict[str, str]]] = []

    def chat(self, prompt: str) -> str:
        return self.chat_messages([{"role": "user", "content": prompt}])

    def chat_messages(self, messages: list[dict[str, str]]) -> str:
        self.sent.append(messages)
        if self.error:
            raise self.error
        return self.reply


def use_client(fake: FakeClient) -> FakeClient:
    app.dependency_overrides[get_openrouter_client] = lambda: fake
    return fake


def chat(client, headers, board_id: int, prompt: str, history: list | None = None):
    return client.post(
        f"/api/boards/{board_id}/ai/chat",
        headers=headers,
        json={"prompt": prompt, "history": history or []},
    )


def test_ai_diagnostic_returns_model_output(client, admin) -> None:
    use_client(FakeClient(reply="4"))
    response = client.post("/api/ai/diagnostic", headers=admin, json={"prompt": "2+2"})
    assert response.status_code == 200
    assert response.json() == {"model": "openai/gpt-oss-120b", "output": "4"}


def test_ai_missing_api_key_is_explicit(client, admin, monkeypatch) -> None:
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    response = client.post("/api/ai/diagnostic", headers=admin, json={"prompt": "2+2"})
    assert response.status_code == 500
    assert response.json()["detail"] == "OPENROUTER_API_KEY is not configured."


def test_ai_upstream_errors_are_explicit(client, admin) -> None:
    use_client(FakeClient(error=OpenRouterRequestError("OpenRouter authentication failed.", status_code=401)))
    response = chat(client, admin, first_board_id(client, admin), "hello")
    assert response.status_code == 502
    assert response.json()["detail"] == "OpenRouter authentication failed."


def test_ai_chat_without_board_update(client, admin) -> None:
    fake = use_client(FakeClient(reply=json.dumps({"message": "Focus on review.", "boardUpdate": None})))
    response = chat(client, admin, first_board_id(client, admin), "Summarize")
    assert response.status_code == 200
    assert response.json() == {"message": "Focus on review.", "boardUpdate": None}

    system_prompt = fake.sent[0][0]["content"]
    assert '"schemaVersion": 2' in system_prompt
    assert '["user"]' in system_prompt


def test_ai_chat_applies_board_update_to_that_board_only(client, admin) -> None:
    board_id = first_board_id(client, admin)
    other_id = client.post("/api/boards", headers=admin, json={"name": "Other"}).json()["id"]
    data = client.get(f"/api/boards/{board_id}", headers=admin).json()["data"]
    data["columns"].append({"id": "col-ai", "title": "Blocked", "cardIds": []})
    data["cards"]["card-1"]["dueDate"] = "2026-11-30"
    use_client(FakeClient(reply=json.dumps({"message": "Added a column.", "boardUpdate": data})))

    response = chat(client, admin, board_id, "Add a Blocked column")
    assert response.status_code == 200
    assert response.json()["boardUpdate"]["columns"][-1]["title"] == "Blocked"

    saved = client.get(f"/api/boards/{board_id}", headers=admin).json()["data"]
    assert saved["columns"][-1]["id"] == "col-ai"
    assert saved["cards"]["card-1"]["dueDate"] == "2026-11-30"
    other = client.get(f"/api/boards/{other_id}", headers=admin).json()["data"]
    assert len(other["columns"]) == 5


def test_ai_chat_rejects_non_json(client, admin) -> None:
    use_client(FakeClient(reply="not-json"))
    response = chat(client, admin, first_board_id(client, admin), "Any update?")
    assert response.status_code == 502
    assert response.json()["detail"] == "Model returned non-JSON output."


def test_ai_chat_rejects_invalid_board(client, admin) -> None:
    board_id = first_board_id(client, admin)
    data = client.get(f"/api/boards/{board_id}", headers=admin).json()["data"]
    data["columns"][0]["cardIds"].append("card-missing")
    use_client(FakeClient(reply=json.dumps({"message": "Done.", "boardUpdate": data})))

    response = chat(client, admin, board_id, "Break it")
    assert response.status_code == 502
    assert "Model output did not match required schema" in response.json()["detail"]
    saved = client.get(f"/api/boards/{board_id}", headers=admin).json()["data"]
    assert "card-missing" not in saved["columns"][0]["cardIds"]


def test_ai_chat_rejects_missing_message(client, admin) -> None:
    use_client(FakeClient(reply=json.dumps({"boardUpdate": None})))
    response = chat(client, admin, first_board_id(client, admin), "Any update?")
    assert response.status_code == 502


def test_ai_chat_sends_history_before_prompt_once(client, admin) -> None:
    fake = use_client(FakeClient(reply=json.dumps({"message": "Ok.", "boardUpdate": None})))
    history = [
        {"role": "user", "content": "First question"},
        {"role": "assistant", "content": "First answer"},
    ]
    assert chat(client, admin, first_board_id(client, admin), "Second question", history).status_code == 200
    assert [(m["role"], m["content"]) for m in fake.sent[0][1:]] == [
        ("user", "First question"),
        ("assistant", "First answer"),
        ("user", "Second question"),
    ]


def test_ai_chat_requires_board_access(client, admin) -> None:
    use_client(FakeClient(reply=json.dumps({"message": "Ok.", "boardUpdate": None})))
    assert chat(client, admin, 999, "hello").status_code == 404
