from conftest import first_board_id, register


def share(client, owner, board_id: int, username: str, role: str):
    return client.put(f"/api/boards/{board_id}/members/{username}", headers=owner, json={"role": role})


def test_owner_shares_board_with_editor(client, admin) -> None:
    alice = register(client, "alice")
    board_id = first_board_id(client, admin)

    response = share(client, admin, board_id, "alice", "editor")
    assert response.status_code == 200
    assert [(m["username"], m["role"]) for m in response.json()] == [("user", "owner"), ("alice", "editor")]

    boards = client.get("/api/boards", headers=alice).json()
    shared = next(board for board in boards if board["id"] == board_id)
    assert shared["role"] == "editor"
    assert shared["owner"] == "user"

    data = client.get(f"/api/boards/{board_id}", headers=alice).json()["data"]
    data["columns"][0]["title"] = "Edited by alice"
    assert client.put(f"/api/boards/{board_id}/data", headers=alice, json=data).status_code == 200
    assert client.patch(f"/api/boards/{board_id}", headers=alice, json={"name": "Team"}).status_code == 200

    # Editors cannot delete the board or manage members.
    assert client.delete(f"/api/boards/{board_id}", headers=alice).status_code == 403
    register(client, "bob")
    assert share(client, alice, board_id, "bob", "viewer").status_code == 403


def test_viewer_is_read_only(client, admin) -> None:
    alice = register(client, "alice")
    board_id = first_board_id(client, admin)
    share(client, admin, board_id, "alice", "viewer")

    detail = client.get(f"/api/boards/{board_id}", headers=alice)
    assert detail.status_code == 200
    assert detail.json()["role"] == "viewer"

    data = detail.json()["data"]
    response = client.put(f"/api/boards/{board_id}/data", headers=alice, json=data)
    assert response.status_code == 403
    assert response.json()["detail"] == "You have read-only access to this board."
    assert client.patch(f"/api/boards/{board_id}", headers=alice, json={"name": "x"}).status_code == 403
    assert client.post(f"/api/boards/{board_id}/ai/chat", headers=alice, json={"prompt": "hi"}).status_code == 403


def test_owner_changes_role_and_removes_member(client, admin) -> None:
    alice = register(client, "alice")
    board_id = first_board_id(client, admin)
    share(client, admin, board_id, "alice", "viewer")

    response = share(client, admin, board_id, "alice", "editor")
    assert [m["role"] for m in response.json()] == ["owner", "editor"]

    response = client.delete(f"/api/boards/{board_id}/members/alice", headers=admin)
    assert response.status_code == 200
    assert [m["username"] for m in response.json()] == ["user"]
    assert client.get(f"/api/boards/{board_id}", headers=alice).status_code == 404


def test_member_can_leave_but_not_remove_others(client, admin) -> None:
    alice = register(client, "alice")
    register(client, "bob")
    board_id = first_board_id(client, admin)
    share(client, admin, board_id, "alice", "editor")
    share(client, admin, board_id, "bob", "viewer")

    assert client.delete(f"/api/boards/{board_id}/members/bob", headers=alice).status_code == 403
    assert client.delete(f"/api/boards/{board_id}/members/alice", headers=alice).status_code == 200
    assert client.get(f"/api/boards/{board_id}", headers=alice).status_code == 404


def test_sharing_errors(client, admin) -> None:
    board_id = first_board_id(client, admin)
    assert share(client, admin, board_id, "ghost", "editor").status_code == 404
    assert share(client, admin, board_id, "user", "editor").status_code == 400
    register(client, "alice")
    assert share(client, admin, board_id, "alice", "admin").status_code == 422
    assert client.delete(f"/api/boards/{board_id}/members/user", headers=admin).status_code == 400


def test_members_listed_for_any_member(client, admin) -> None:
    alice = register(client, "alice")
    board_id = first_board_id(client, admin)
    assert client.get(f"/api/boards/{board_id}/members", headers=alice).status_code == 404

    share(client, admin, board_id, "alice", "viewer")
    response = client.get(f"/api/boards/{board_id}/members", headers=alice)
    assert response.status_code == 200
    assert len(response.json()) == 2
