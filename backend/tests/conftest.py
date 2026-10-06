import pytest
from fastapi.testclient import TestClient

from app.main import app

DEFAULT_PASSWORD = "password"


@pytest.fixture
def db_path(tmp_path, monkeypatch):
    path = tmp_path / "pm.db"
    monkeypatch.setenv("PM_DB_PATH", str(path))
    return path


@pytest.fixture
def client(db_path):
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def login(client: TestClient, username: str = "user", password: str = DEFAULT_PASSWORD) -> dict[str, str]:
    response = client.post("/api/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200, response.text
    return auth_headers(response.json()["token"])


def register(client: TestClient, username: str, password: str = "secret-pass") -> dict[str, str]:
    response = client.post("/api/auth/register", json={"username": username, "password": password})
    assert response.status_code == 201, response.text
    return auth_headers(response.json()["token"])


@pytest.fixture
def admin(client) -> dict[str, str]:
    return login(client)


def first_board_id(client: TestClient, headers: dict[str, str]) -> int:
    return client.get("/api/boards", headers=headers).json()[0]["id"]
