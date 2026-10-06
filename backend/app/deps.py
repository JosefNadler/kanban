import sqlite3
from dataclasses import dataclass
from typing import Generator

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.db import connect_db, get_board_summary, get_db_path, get_session_user_id, get_user
from app.schemas import BoardSummary, UserOut

bearer_scheme = HTTPBearer(auto_error=False)


def get_connection() -> Generator[sqlite3.Connection, None, None]:
    connection = connect_db(get_db_path())
    try:
        yield connection
    finally:
        connection.close()


@dataclass
class CurrentUser:
    user: UserOut
    token: str

    @property
    def id(self) -> int:
        return self.user.id


def user_out(row: sqlite3.Row) -> UserOut:
    return UserOut(
        id=row["id"],
        username=row["username"],
        display_name=row["display_name"],
        is_admin=bool(row["is_admin"]),
        created_at=row["created_at"],
    )


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    connection: sqlite3.Connection = Depends(get_connection),
) -> CurrentUser:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    user_id = get_session_user_id(connection, credentials.credentials)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Session expired. Please sign in again.")

    return CurrentUser(user=user_out(get_user(connection, user_id)), token=credentials.credentials)


def require_admin(current: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if not current.user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required.")
    return current


def board_summary(row: sqlite3.Row) -> BoardSummary:
    return BoardSummary.model_validate(dict(row))


def get_board_access(
    board_id: int,
    current: CurrentUser = Depends(get_current_user),
    connection: sqlite3.Connection = Depends(get_connection),
) -> BoardSummary:
    row = get_board_summary(connection, board_id, current.id)
    if row is None:
        raise HTTPException(status_code=404, detail="Board not found.")
    return board_summary(row)


def require_board_editor(board: BoardSummary = Depends(get_board_access)) -> BoardSummary:
    if board.role == "viewer":
        raise HTTPException(status_code=403, detail="You have read-only access to this board.")
    return board


def require_board_owner(board: BoardSummary = Depends(get_board_access)) -> BoardSummary:
    if board.role != "owner":
        raise HTTPException(status_code=403, detail="Only the board owner can do this.")
    return board
