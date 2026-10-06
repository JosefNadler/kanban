import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Response

from app import db
from app.deps import (
    CurrentUser,
    board_summary,
    get_board_access,
    get_connection,
    get_current_user,
    require_board_editor,
    require_board_owner,
)
from app.schemas import (
    BoardDetail,
    BoardPayload,
    BoardSummary,
    CreateBoardRequest,
    MemberOut,
    MemberRoleRequest,
    UpdateBoardMetaRequest,
)

router = APIRouter(prefix="/api/boards", tags=["boards"])


def load_summary(connection: sqlite3.Connection, board_id: int, user_id: int) -> BoardSummary:
    return board_summary(db.get_board_summary(connection, board_id, user_id))


@router.get("")
def list_boards(
    current: CurrentUser = Depends(get_current_user),
    connection: sqlite3.Connection = Depends(get_connection),
) -> list[BoardSummary]:
    return [board_summary(row) for row in db.list_boards(connection, current.id)]


@router.post("", status_code=201)
def create_board(
    body: CreateBoardRequest,
    current: CurrentUser = Depends(get_current_user),
    connection: sqlite3.Connection = Depends(get_connection),
) -> BoardDetail:
    data = BoardPayload.model_validate(db.empty_board_payload())
    board_id = db.create_board(connection, current.id, body.name.strip(), body.description.strip(), data)
    summary = load_summary(connection, board_id, current.id)
    return BoardDetail(**summary.model_dump(), data=data)


@router.get("/{board_id}")
def read_board(
    board: BoardSummary = Depends(get_board_access),
    connection: sqlite3.Connection = Depends(get_connection),
) -> BoardDetail:
    return BoardDetail(**board.model_dump(), data=db.get_board_data(connection, board.id))


@router.patch("/{board_id}")
def update_board_meta(
    body: UpdateBoardMetaRequest,
    board: BoardSummary = Depends(require_board_editor),
    current: CurrentUser = Depends(get_current_user),
    connection: sqlite3.Connection = Depends(get_connection),
) -> BoardSummary:
    db.update_board_meta(
        connection,
        board.id,
        name=body.name.strip() if body.name is not None else None,
        description=body.description.strip() if body.description is not None else None,
    )
    return load_summary(connection, board.id, current.id)


@router.put("/{board_id}/data")
def save_board_data(
    data: BoardPayload,
    board: BoardSummary = Depends(require_board_editor),
    connection: sqlite3.Connection = Depends(get_connection),
) -> BoardPayload:
    db.save_board_data(connection, board.id, data)
    return data


@router.delete("/{board_id}", status_code=204)
def delete_board(
    board: BoardSummary = Depends(require_board_owner),
    connection: sqlite3.Connection = Depends(get_connection),
) -> Response:
    db.delete_board(connection, board.id)
    return Response(status_code=204)


@router.get("/{board_id}/members")
def list_members(
    board: BoardSummary = Depends(get_board_access),
    connection: sqlite3.Connection = Depends(get_connection),
) -> list[MemberOut]:
    return [MemberOut.model_validate(dict(row)) for row in db.list_members(connection, board.id)]


@router.put("/{board_id}/members/{username}")
def set_member(
    username: str,
    body: MemberRoleRequest,
    board: BoardSummary = Depends(require_board_owner),
    current: CurrentUser = Depends(get_current_user),
    connection: sqlite3.Connection = Depends(get_connection),
) -> list[MemberOut]:
    user = db.get_user_by_username(connection, username)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    if user["id"] == current.id:
        raise HTTPException(status_code=400, detail="The owner is already a member.")

    db.set_member(connection, board.id, user["id"], body.role)
    return list_members(board, connection)


@router.delete("/{board_id}/members/{username}")
def remove_member(
    username: str,
    board: BoardSummary = Depends(get_board_access),
    current: CurrentUser = Depends(get_current_user),
    connection: sqlite3.Connection = Depends(get_connection),
) -> list[MemberOut]:
    user = db.get_user_by_username(connection, username)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    if user["id"] == current.id and board.role == "owner":
        raise HTTPException(status_code=400, detail="The owner cannot leave the board. Delete it instead.")
    # Members may remove themselves (leave); only the owner may remove others.
    if user["id"] != current.id and board.role != "owner":
        raise HTTPException(status_code=403, detail="Only the board owner can do this.")

    db.remove_member(connection, board.id, user["id"])
    return list_members(board, connection)
