import sqlite3
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Generator

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import FileResponse

from app.db import (
    connect_db,
    get_board_for_user,
    get_db_path,
    get_user_id,
    initialize_database,
    save_board_for_user,
)
from app.schemas import BoardPayload


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_database()
    yield


app = FastAPI(title="PM MVP Backend", lifespan=lifespan)

STATIC_DIR = Path(__file__).parent / "static"
INDEX_HTML = STATIC_DIR / "index.html"


def get_connection() -> Generator[sqlite3.Connection, None, None]:
    db_path = get_db_path()
    with connect_db(db_path) as connection:
        yield connection


def get_authenticated_user_id(
    x_user: str | None = Header(default=None),
    connection: sqlite3.Connection = Depends(get_connection),
) -> int:
    if not x_user:
        raise HTTPException(status_code=401, detail="Missing X-User header.")

    user_id = get_user_id(connection, x_user)
    if user_id is None:
        raise HTTPException(status_code=403, detail="Unknown user.")

    return user_id


@app.get("/", include_in_schema=False)
def serve_root() -> FileResponse:
    return FileResponse(INDEX_HTML)


@app.get("/api/hello")
def hello() -> dict[str, str]:
    return {"message": "Hello from FastAPI"}


@app.get("/api/board")
def read_board(
    user_id: int = Depends(get_authenticated_user_id),
    connection: sqlite3.Connection = Depends(get_connection),
) -> dict:
    board = get_board_for_user(connection, user_id)
    if board is None:
        raise HTTPException(status_code=404, detail="Board not found for user.")

    return board.model_dump(by_alias=True)


@app.put("/api/board")
def update_board(
    board: BoardPayload,
    user_id: int = Depends(get_authenticated_user_id),
    connection: sqlite3.Connection = Depends(get_connection),
) -> dict:
    save_board_for_user(connection, user_id, board)
    return board.model_dump(by_alias=True)


@app.get("/{full_path:path}", include_in_schema=False)
def serve_frontend(full_path: str) -> FileResponse:
    target = (STATIC_DIR / full_path).resolve()
    static_root = STATIC_DIR.resolve()

    if static_root not in target.parents and target != static_root:
        raise HTTPException(status_code=404, detail="Not found")

    if target.is_dir():
        candidate = target / "index.html"
        if candidate.exists():
            return FileResponse(candidate)

    if target.exists() and target.is_file():
        return FileResponse(target)

    if INDEX_HTML.exists():
        return FileResponse(INDEX_HTML)

    raise HTTPException(status_code=404, detail="Frontend build not found")
