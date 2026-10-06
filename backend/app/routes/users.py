import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Response

from app import db
from app.deps import CurrentUser, get_connection, get_current_user, require_admin, user_out
from app.schemas import AdminUpdateUserRequest, CreateUserRequest, UserOut

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("")
def list_users(
    _: CurrentUser = Depends(get_current_user),
    connection: sqlite3.Connection = Depends(get_connection),
) -> list[UserOut]:
    # Any signed-in user can list users, so boards can be shared with them.
    return [user_out(row) for row in db.list_users(connection)]


@router.post("", status_code=201)
def create_user(
    body: CreateUserRequest,
    _: CurrentUser = Depends(require_admin),
    connection: sqlite3.Connection = Depends(get_connection),
) -> UserOut:
    try:
        user_id = db.create_user(
            connection,
            body.username,
            body.password,
            body.display_name or body.username,
            is_admin=body.is_admin,
        )
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="Username is already taken.") from exc
    return user_out(db.get_user(connection, user_id))


def get_existing_user(connection: sqlite3.Connection, user_id: int) -> sqlite3.Row:
    row = db.get_user(connection, user_id)
    if row is None:
        raise HTTPException(status_code=404, detail="User not found.")
    return row


@router.patch("/{user_id}")
def update_user(
    user_id: int,
    body: AdminUpdateUserRequest,
    current: CurrentUser = Depends(require_admin),
    connection: sqlite3.Connection = Depends(get_connection),
) -> UserOut:
    get_existing_user(connection, user_id)
    if user_id == current.id and body.is_admin is False:
        raise HTTPException(status_code=400, detail="You cannot remove your own admin access.")

    db.update_user(
        connection,
        user_id,
        display_name=body.display_name.strip() if body.display_name is not None else None,
        is_admin=body.is_admin,
        password=body.password,
    )
    if body.password is not None:
        db.delete_other_sessions(connection, user_id, keep_token=current.token if user_id == current.id else None)
    return user_out(db.get_user(connection, user_id))


@router.delete("/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    current: CurrentUser = Depends(require_admin),
    connection: sqlite3.Connection = Depends(get_connection),
) -> Response:
    get_existing_user(connection, user_id)
    if user_id == current.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account.")

    db.delete_user(connection, user_id)
    return Response(status_code=204)
