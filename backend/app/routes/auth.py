import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Response

from app import db
from app.deps import CurrentUser, get_connection, get_current_user, user_out
from app.schemas import (
    AuthResponse,
    BoardPayload,
    ChangePasswordRequest,
    LoginRequest,
    RegisterRequest,
    UpdateProfileRequest,
    UserOut,
)
from app.security import verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", status_code=201)
def register(body: RegisterRequest, connection: sqlite3.Connection = Depends(get_connection)) -> AuthResponse:
    try:
        user_id = db.create_user(connection, body.username, body.password, body.display_name or body.username)
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="Username is already taken.") from exc

    db.create_board(
        connection,
        user_id,
        "My first board",
        "",
        BoardPayload.model_validate(db.empty_board_payload()),
    )
    token = db.create_session(connection, user_id)
    return AuthResponse(token=token, user=user_out(db.get_user(connection, user_id)))


@router.post("/login")
def login(body: LoginRequest, connection: sqlite3.Connection = Depends(get_connection)) -> AuthResponse:
    row = db.get_user_by_username(connection, body.username)
    if row is None or not verify_password(body.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password.")

    token = db.create_session(connection, row["id"])
    return AuthResponse(token=token, user=user_out(row))


@router.post("/logout", status_code=204)
def logout(
    current: CurrentUser = Depends(get_current_user),
    connection: sqlite3.Connection = Depends(get_connection),
) -> Response:
    db.delete_session(connection, current.token)
    return Response(status_code=204)


@router.get("/me")
def me(current: CurrentUser = Depends(get_current_user)) -> UserOut:
    return current.user


@router.patch("/me")
def update_me(
    body: UpdateProfileRequest,
    current: CurrentUser = Depends(get_current_user),
    connection: sqlite3.Connection = Depends(get_connection),
) -> UserOut:
    db.update_user(connection, current.id, display_name=body.display_name.strip())
    return user_out(db.get_user(connection, current.id))


@router.post("/me/password", status_code=204)
def change_password(
    body: ChangePasswordRequest,
    current: CurrentUser = Depends(get_current_user),
    connection: sqlite3.Connection = Depends(get_connection),
) -> Response:
    if not verify_password(body.current_password, db.get_password_hash(connection, current.id)):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")

    db.update_user(connection, current.id, password=body.new_password)
    # Other devices must sign in again with the new password.
    db.delete_other_sessions(connection, current.id, keep_token=current.token)
    return Response(status_code=204)
