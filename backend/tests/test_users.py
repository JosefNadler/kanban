from conftest import login, register


def create_user(client, admin, username: str, **extra) -> dict:
    response = client.post(
        "/api/users",
        headers=admin,
        json={"username": username, "password": "secret-pass", **extra},
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_any_user_can_list_users(client) -> None:
    headers = register(client, "alice")
    response = client.get("/api/users", headers=headers)
    assert response.status_code == 200
    assert [user["username"] for user in response.json()] == ["alice", "user"]


def test_admin_creates_user(client, admin) -> None:
    created = create_user(client, admin, "bob", displayName="Bob B", isAdmin=True)
    assert created["displayName"] == "Bob B"
    assert created["isAdmin"] is True
    login(client, "bob", "secret-pass")


def test_admin_create_rejects_duplicate(client, admin) -> None:
    create_user(client, admin, "bob")
    response = client.post("/api/users", headers=admin, json={"username": "bob", "password": "secret-pass"})
    assert response.status_code == 409


def test_non_admin_cannot_manage_users(client, admin) -> None:
    headers = register(client, "alice")
    bob = create_user(client, admin, "bob")

    assert client.post("/api/users", headers=headers, json={"username": "x-user", "password": "secret-pass"}).status_code == 403
    assert client.patch(f"/api/users/{bob['id']}", headers=headers, json={"isAdmin": True}).status_code == 403
    assert client.delete(f"/api/users/{bob['id']}", headers=headers).status_code == 403


def test_admin_updates_user(client, admin) -> None:
    bob = create_user(client, admin, "bob")
    bob_session = login(client, "bob", "secret-pass")

    response = client.patch(
        f"/api/users/{bob['id']}",
        headers=admin,
        json={"displayName": "Robert", "isAdmin": True, "password": "reset-pass"},
    )
    assert response.status_code == 200
    assert response.json()["displayName"] == "Robert"
    assert response.json()["isAdmin"] is True

    # A password reset signs the user out everywhere.
    assert client.get("/api/auth/me", headers=bob_session).status_code == 401
    login(client, "bob", "reset-pass")


def test_admin_cannot_demote_or_delete_self(client, admin) -> None:
    me = client.get("/api/auth/me", headers=admin).json()
    assert client.patch(f"/api/users/{me['id']}", headers=admin, json={"isAdmin": False}).status_code == 400
    assert client.delete(f"/api/users/{me['id']}", headers=admin).status_code == 400


def test_admin_deletes_user_and_their_boards(client, admin) -> None:
    alice_headers = register(client, "alice")
    alice_id = client.get("/api/auth/me", headers=alice_headers).json()["id"]
    alice_board = client.get("/api/boards", headers=alice_headers).json()[0]["id"]

    assert client.delete(f"/api/users/{alice_id}", headers=admin).status_code == 204
    assert client.get("/api/auth/me", headers=alice_headers).status_code == 401
    assert client.post("/api/auth/login", json={"username": "alice", "password": "secret-pass"}).status_code == 401
    assert client.get(f"/api/boards/{alice_board}", headers=admin).status_code == 404


def test_unknown_user_returns_404(client, admin) -> None:
    assert client.patch("/api/users/999", headers=admin, json={"displayName": "x"}).status_code == 404
    assert client.delete("/api/users/999", headers=admin).status_code == 404
