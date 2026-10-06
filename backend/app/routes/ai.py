import json
import sqlite3
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError

from app import db
from app.deps import CurrentUser, get_connection, get_current_user, require_board_editor
from app.openrouter import OPENROUTER_MODEL, OpenRouterClient, OpenRouterConfigError, OpenRouterRequestError
from app.schemas import (
    AIChatRequest,
    AIChatResponse,
    AIDiagnosticRequest,
    AIDiagnosticResponse,
    BoardPayload,
    BoardSummary,
)

router = APIRouter(tags=["ai"])


def get_openrouter_client() -> OpenRouterClient:
    try:
        return OpenRouterClient()
    except OpenRouterConfigError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


def build_chat_messages(
    prompt: str,
    history: list[dict[str, str]],
    board: BoardPayload,
    members: list[str],
) -> list[dict[str, str]]:
    board_json = json.dumps(board.model_dump(by_alias=True, mode="json"))
    system_message = (
        "You are assisting with a kanban board update workflow. "
        "Return valid JSON only with shape: "
        '{"message":"string","boardUpdate":null|Board}. '
        "Board has the same shape as the current board below: "
        '{"schemaVersion":2,"columns":[{"id","title","cardIds":[...]}],'
        '"cards":{"<cardId>":{"id","title","details","priority":null|"low"|"medium"|"high",'
        '"dueDate":null|"YYYY-MM-DD","labels":["..."],"assignee":null|"<username>"}}}. '
        "Set boardUpdate to null when no change is needed; otherwise return the full updated board. "
        "Keep schemaVersion=2. Columns may be added, renamed, reordered, or removed (at least one must remain). "
        "Every card must be listed in exactly one column's cardIds, and each cards key must equal its id. "
        "New cards and columns need new unique ids. "
        f"Today is {date.today().isoformat()}. "
        f"Assignees must be one of these usernames: {json.dumps(members)}. "
        f"Current board JSON: {board_json}"
    )

    messages: list[dict[str, str]] = [{"role": "system", "content": system_message}]
    messages.extend(history)
    messages.append({"role": "user", "content": prompt})
    return messages


@router.post("/api/ai/diagnostic")
def ai_diagnostic(
    body: AIDiagnosticRequest,
    _: CurrentUser = Depends(get_current_user),
    openrouter_client: OpenRouterClient = Depends(get_openrouter_client),
) -> AIDiagnosticResponse:
    try:
        output = openrouter_client.chat(body.prompt)
    except OpenRouterRequestError as exc:
        raise HTTPException(status_code=502, detail=exc.message) from exc

    return AIDiagnosticResponse(model=OPENROUTER_MODEL, output=output)


@router.post("/api/boards/{board_id}/ai/chat")
def ai_chat(
    body: AIChatRequest,
    board: BoardSummary = Depends(require_board_editor),
    connection: sqlite3.Connection = Depends(get_connection),
    openrouter_client: OpenRouterClient = Depends(get_openrouter_client),
) -> AIChatResponse:
    data = db.get_board_data(connection, board.id)
    members = [row["username"] for row in db.list_members(connection, board.id)]
    history = [message.model_dump() for message in body.history]
    messages = build_chat_messages(body.prompt, history, data, members)

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
            detail=f"Model output did not match required schema: {exc.errors(include_url=False)}",
        ) from exc

    if response_payload.board_update is not None:
        db.save_board_data(connection, board.id, response_payload.board_update)

    return response_payload
