from conftest import first_board_id, register


def test_default_user_has_seeded_board(client, admin) -> None:
    boards = client.get("/api/boards", headers=admin).json()
    assert len(boards) == 1
    assert boards[0]["name"] == "My first board"
    assert boards[0]["role"] == "owner"
    assert boards[0]["owner"] == "user"
    assert boards[0]["cardCount"] == 8

    detail = client.get(f"/api/boards/{boards[0]['id']}", headers=admin).json()
    assert detail["data"]["schemaVersion"] == 2
    assert len(detail["data"]["columns"]) == 5
    assert detail["data"]["cards"]["card-1"]["priority"] == "high"


def test_create_board_starts_empty(client, admin) -> None:
    response = client.post("/api/boards", headers=admin, json={"name": " Launch ", "description": "Q3 launch"})
    assert response.status_code == 201
    board = response.json()
    assert board["name"] == "Launch"
    assert board["description"] == "Q3 launch"
    assert board["role"] == "owner"
    assert board["data"]["cards"] == {}
    assert [column["title"] for column in board["data"]["columns"]] == [
        "Backlog",
        "Discovery",
        "In Progress",
        "Review",
        "Done",
    ]

    names = [summary["name"] for summary in client.get("/api/boards", headers=admin).json()]
    assert names == ["My first board", "Launch"]


def test_create_board_requires_name(client, admin) -> None:
    assert client.post("/api/boards", headers=admin, json={"name": ""}).status_code == 422


def test_rename_board(client, admin) -> None:
    board_id = first_board_id(client, admin)
    response = client.patch(f"/api/boards/{board_id}", headers=admin, json={"name": "Renamed"})
    assert response.status_code == 200
    assert response.json()["name"] == "Renamed"
    assert response.json()["description"] == "Demo project board."


def test_save_board_data_persists(client, admin) -> None:
    board_id = first_board_id(client, admin)
    data = client.get(f"/api/boards/{board_id}", headers=admin).json()["data"]
    data["cards"]["card-2"].update({"priority": "low", "dueDate": "2026-12-01", "labels": ["a", "b"], "assignee": "user"})
    data["columns"].append({"id": "col-extra", "title": "Extra", "cardIds": []})

    response = client.put(f"/api/boards/{board_id}/data", headers=admin, json=data)
    assert response.status_code == 200

    saved = client.get(f"/api/boards/{board_id}", headers=admin).json()["data"]
    assert saved["cards"]["card-2"]["dueDate"] == "2026-12-01"
    assert saved["cards"]["card-2"]["labels"] == ["a", "b"]
    assert saved["cards"]["card-2"]["assignee"] == "user"
    assert saved["columns"][-1]["id"] == "col-extra"


def test_columns_can_be_reordered_and_removed(client, admin) -> None:
    board_id = first_board_id(client, admin)
    data = client.get(f"/api/boards/{board_id}", headers=admin).json()["data"]
    removed = data["columns"].pop()
    for card_id in removed["cardIds"]:
        del data["cards"][card_id]
    data["columns"].reverse()

    assert client.put(f"/api/boards/{board_id}/data", headers=admin, json=data).status_code == 200
    saved = client.get(f"/api/boards/{board_id}", headers=admin).json()["data"]
    assert [column["id"] for column in saved["columns"]] == ["col-review", "col-progress", "col-discovery", "col-backlog"]


def test_invalid_board_data_is_rejected(client, admin) -> None:
    board_id = first_board_id(client, admin)
    data = client.get(f"/api/boards/{board_id}", headers=admin).json()["data"]

    cases = []
    orphan = {**data, "cards": {**data["cards"], "card-x": {"id": "card-x", "title": "Orphan"}}}
    cases.append(orphan)
    cases.append({**data, "schemaVersion": 1})
    cases.append({**data, "columns": []})
    duplicate = {**data, "columns": [*data["columns"], {**data["columns"][0]}]}
    cases.append(duplicate)
    bad_priority = {**data, "cards": {**data["cards"], "card-1": {**data["cards"]["card-1"], "priority": "urgent"}}}
    cases.append(bad_priority)
    bad_date = {**data, "cards": {**data["cards"], "card-1": {**data["cards"]["card-1"], "dueDate": "tomorrow"}}}
    cases.append(bad_date)
    dup_labels = {**data, "cards": {**data["cards"], "card-1": {**data["cards"]["card-1"], "labels": ["x", "x"]}}}
    cases.append(dup_labels)

    for payload in cases:
        assert client.put(f"/api/boards/{board_id}/data", headers=admin, json=payload).status_code == 422


def test_delete_board(client, admin) -> None:
    board_id = client.post("/api/boards", headers=admin, json={"name": "Temp"}).json()["id"]
    assert client.delete(f"/api/boards/{board_id}", headers=admin).status_code == 204
    assert client.get(f"/api/boards/{board_id}", headers=admin).status_code == 404
    assert len(client.get("/api/boards", headers=admin).json()) == 1


def test_users_cannot_see_each_others_boards(client, admin) -> None:
    alice = register(client, "alice")
    admin_board = first_board_id(client, admin)

    assert [board["name"] for board in client.get("/api/boards", headers=alice).json()] == ["My first board"]
    assert client.get(f"/api/boards/{admin_board}", headers=alice).status_code == 404
    assert client.patch(f"/api/boards/{admin_board}", headers=alice, json={"name": "x"}).status_code == 404
    assert client.delete(f"/api/boards/{admin_board}", headers=alice).status_code == 404

    data = client.get(f"/api/boards/{admin_board}", headers=admin).json()["data"]
    assert client.put(f"/api/boards/{admin_board}/data", headers=alice, json=data).status_code == 404


def test_unknown_board_returns_404(client, admin) -> None:
    assert client.get("/api/boards/999", headers=admin).status_code == 404
