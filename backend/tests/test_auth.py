import sqlite3

from conftest import auth_headers, login, register


def test_default_user_can_log_in(client) -> None:
    response = client.post("/api/auth/login", json={"username": "user", "password": "password"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["token"]
    assert payload["user"]["username"] == "user"
    assert payload["user"]["isAdmin"] is True


def test_login_rejects_wrong_password(client) -> None:
    response = client.post("/api/auth/login", json={"username": "user", "password": "wrong"})
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid username or password."


def test_login_rejects_unknown_user(client) -> None:
    response = client.post("/api/auth/login", json={"username": "nobody", "password": "password"})
    assert response.status_code == 401


def test_login_username_is_case_insensitive(client) -> None:
    assert client.post("/api/auth/login", json={"username": "USER", "password": "password"}).status_code == 200


def test_missing_token_is_rejected(client) -> None:
    response = client.get("/api/boards")
    assert response.status_code == 401
    assert response.json()["detail"] == "Not authenticated."


def test_invalid_token_is_rejected(client) -> None:
    response = client.get("/api/boards", headers=auth_headers("bogus"))
    assert response.status_code == 401
    assert response.json()["detail"] == "Session expired. Please sign in again."


def test_me_returns_current_user(client, admin) -> None:
    response = client.get("/api/auth/me", headers=admin)
    assert response.status_code == 200
    assert response.json()["username"] == "user"


def test_logout_invalidates_token(client, admin) -> None:
    assert client.post("/api/auth/logout", headers=admin).status_code == 204
    assert client.get("/api/auth/me", headers=admin).status_code == 401


def test_register_creates_user_with_starter_board(client) -> None:
    headers = register(client, "alice")
    me = client.get("/api/auth/me", headers=headers).json()
    assert me["username"] == "alice"
    assert me["displayName"] == "alice"
    assert me["isAdmin"] is False

    boards = client.get("/api/boards", headers=headers).json()
    assert [board["name"] for board in boards] == ["My first board"]
    assert boards[0]["cardCount"] == 0


def test_register_rejects_duplicate_username(client) -> None:
    register(client, "alice")
    response = client.post("/api/auth/register", json={"username": "Alice", "password": "secret-pass"})
    assert response.status_code == 409
    assert response.json()["detail"] == "Username is already taken."


def test_register_validates_input(client) -> None:
    assert client.post("/api/auth/register", json={"username": "al", "password": "secret-pass"}).status_code == 422
    assert client.post("/api/auth/register", json={"username": "alice", "password": "short"}).status_code == 422
    assert client.post("/api/auth/register", json={"username": "a b c", "password": "secret-pass"}).status_code == 422


def test_update_display_name(client, admin) -> None:
    response = client.patch("/api/auth/me", headers=admin, json={"displayName": "  Josef  "})
    assert response.status_code == 200
    assert response.json()["displayName"] == "Josef"


def test_change_password(client) -> None:
    headers = register(client, "alice", "first-pass")
    other_session = login(client, "alice", "first-pass")

    wrong = client.post(
        "/api/auth/me/password",
        headers=headers,
        json={"currentPassword": "nope-nope", "newPassword": "second-pass"},
    )
    assert wrong.status_code == 400

    response = client.post(
        "/api/auth/me/password",
        headers=headers,
        json={"currentPassword": "first-pass", "newPassword": "second-pass"},
    )
    assert response.status_code == 204

    # The current session survives; other sessions are signed out.
    assert client.get("/api/auth/me", headers=headers).status_code == 200
    assert client.get("/api/auth/me", headers=other_session).status_code == 401
    assert client.post("/api/auth/login", json={"username": "alice", "password": "first-pass"}).status_code == 401
    login(client, "alice", "second-pass")


def test_expired_sessions_are_rejected_and_pruned(client, db_path) -> None:
    expired = login(client)
    with sqlite3.connect(db_path) as connection:
        connection.execute("UPDATE sessions SET expires_at = datetime('now', '-1 minute')")

    assert client.get("/api/auth/me", headers=expired).status_code == 401

    login(client)
    with sqlite3.connect(db_path) as connection:
        assert connection.execute("SELECT COUNT(*) FROM sessions").fetchone()[0] == 1
