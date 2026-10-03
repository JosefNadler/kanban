import sqlite3
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Generator
import json

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import FileResponse
from pydantic import ValidationError

from app.db import (
    connect_db,
    get_board_for_user,
    get_db_path,
    get_user_id,
    initialize_database,
    save_board_for_user,
)
from app.openrouter import OPENROUTER_MODEL, OpenRouterClient, OpenRouterConfigError, OpenRouterRequestError
from app.schemas import AIChatRequest, AIChatResponse, AIDiagnosticRequest, AIDiagnosticResponse, BoardPayload


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_database()
    yield


app = FastAPI(title="PM MVP Backend", lifespan=lifespan)

STATIC_DIR = Path(__file__).parent / "static"
INDEX_HTML = STATIC_DIR / "index.html"


def get_connection() -> Generator[sqlite3.Connection, None, None]:
    db_path = get_db_path()
    connection = connect_db(db_path)
    try:
        yield connection
    finally:
        connection.close()


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


def get_openrouter_client() -> OpenRouterClient:
    try:
        return OpenRouterClient()
    except OpenRouterConfigError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


FIXED_COLUMNS_ERROR = "Columns are fixed: column ids and order cannot change."


def has_same_columns(current: BoardPayload, update: BoardPayload) -> bool:
    return [column.id for column in current.columns] == [column.id for column in update.columns]


def build_chat_messages(
    prompt: str,
    history: list[dict[str, str]],
    board: BoardPayload,
) -> list[dict[str, str]]:
    board_json = json.dumps(board.model_dump(by_alias=True))
    system_message = (
        "You are assisting with a kanban board update workflow. "
        "Return valid JSON only with shape: "
        '{"message":"string","boardUpdate":null|Board}. '
        "Board has the same shape as the current board below: "
        '{"schemaVersion":1,"columns":[{"id","title","cardIds":[...]}],'
        '"cards":{"<cardId>":{"id","title","details"}}}. '
        "Set boardUpdate to null when no change is needed; otherwise return the full updated board. "
        "Keep schemaVersion=1 and keep the same columns in the same order (column titles may change). "
        "Every card must be listed in exactly one column's cardIds, and each cards key must equal its id. "
        f"Current board JSON: {board_json}"
    )

    messages: list[dict[str, str]] = [{"role": "system", "content": system_message}]
    messages.extend(history)
    messages.append({"role": "user", "content": prompt})
    return messages


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
    current = get_board_for_user(connection, user_id)
    if current is None:
        raise HTTPException(status_code=404, detail="Board not found for user.")

    if not has_same_columns(current, board):
        raise HTTPException(status_code=422, detail=FIXED_COLUMNS_ERROR)

    save_board_for_user(connection, user_id, board)
    return board.model_dump(by_alias=True)


@app.post("/api/ai/diagnostic", response_model=AIDiagnosticResponse)
def ai_diagnostic(
    body: AIDiagnosticRequest,
    _: int = Depends(get_authenticated_user_id),
    openrouter_client: OpenRouterClient = Depends(get_openrouter_client),
) -> AIDiagnosticResponse:
    try:
        output = openrouter_client.chat(body.prompt)
    except OpenRouterRequestError as exc:
        raise HTTPException(status_code=502, detail=exc.message) from exc

    return AIDiagnosticResponse(model=OPENROUTER_MODEL, output=output)


@app.post("/api/ai/chat", response_model=AIChatResponse)
def ai_chat(
    body: AIChatRequest,
    user_id: int = Depends(get_authenticated_user_id),
    connection: sqlite3.Connection = Depends(get_connection),
    openrouter_client: OpenRouterClient = Depends(get_openrouter_client),
) -> AIChatResponse:
    board = get_board_for_user(connection, user_id)
    if board is None:
        raise HTTPException(status_code=404, detail="Board not found for user.")

    history = [message.model_dump() for message in body.history]
    messages = build_chat_messages(body.prompt, history, board)

    try:
        raw_output = openrouter_client.chat_messages(messages)
    except OpenRouterRequestError as exc:
        raise HTTPException(status_code=502, detail=exc.message) from exc

    try:
        parsed_output = json.loads(raw_output)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail="Model returned non-JSON output.") from exc

    try:
        response_payload = AIChatResponse.model_validate(parsed_output)
    except ValidationError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Model output did not match required schema: {exc.errors()}",
        ) from exc

    if response_payload.board_update is not None:
        if not has_same_columns(board, response_payload.board_update):
            raise HTTPException(status_code=502, detail=f"Model output rejected: {FIXED_COLUMNS_ERROR}")
        save_board_for_user(connection, user_id, response_payload.board_update)

    return response_payload


@app.get("/{full_path:path}", include_in_schema=False)
def serve_frontend(full_path: str) -> FileResponse:
    if full_path == "api" or full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not found")

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
