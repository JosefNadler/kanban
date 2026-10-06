from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel

BOARD_SCHEMA_VERSION = 2

Priority = Literal["low", "medium", "high"]


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class CardPayload(CamelModel):
    id: str = Field(min_length=1)
    title: str = Field(min_length=1, max_length=200)
    details: str = Field(default="", max_length=5000)
    priority: Priority | None = None
    due_date: date | None = None
    labels: list[str] = Field(default_factory=list, max_length=10)
    assignee: str | None = None

    @model_validator(mode="after")
    def validate_labels(self) -> "CardPayload":
        self.labels = [label.strip() for label in self.labels]
        if any(not label or len(label) > 30 for label in self.labels):
            raise ValueError("Labels must be 1-30 characters.")
        if len(self.labels) != len(set(self.labels)):
            raise ValueError("Labels must be unique per card.")
        return self


class ColumnPayload(CamelModel):
    id: str = Field(min_length=1)
    title: str = Field(min_length=1, max_length=60)
    card_ids: list[str]


class BoardPayload(CamelModel):
    schema_version: int
    columns: list[ColumnPayload] = Field(min_length=1, max_length=12)
    cards: dict[str, CardPayload]

    @model_validator(mode="after")
    def validate_consistency(self) -> "BoardPayload":
        if self.schema_version != BOARD_SCHEMA_VERSION:
            raise ValueError(f"schemaVersion must be {BOARD_SCHEMA_VERSION}.")

        column_ids = [column.id for column in self.columns]
        if len(column_ids) != len(set(column_ids)):
            raise ValueError("Column ids must be unique.")

        card_keys = set(self.cards.keys())
        if any(key != card.id for key, card in self.cards.items()):
            raise ValueError("Card keys must match each card id.")

        referenced_ids = [card_id for column in self.columns for card_id in column.card_ids]
        if len(referenced_ids) != len(set(referenced_ids)):
            raise ValueError("Each card must appear in only one column.")

        if set(referenced_ids) != card_keys:
            raise ValueError("Every card must be referenced exactly once in columns.")

        return self


# Auth and users

class Credentials(CamelModel):
    username: str = Field(min_length=3, max_length=32, pattern=r"^[a-zA-Z0-9_.-]+$")
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(Credentials):
    display_name: str = Field(default="", max_length=60)


class UserOut(CamelModel):
    id: int
    username: str
    display_name: str
    is_admin: bool
    created_at: str


class AuthResponse(CamelModel):
    token: str
    user: UserOut


class UpdateProfileRequest(CamelModel):
    display_name: str = Field(max_length=60)


class ChangePasswordRequest(CamelModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class CreateUserRequest(RegisterRequest):
    is_admin: bool = False


class AdminUpdateUserRequest(CamelModel):
    display_name: str | None = Field(default=None, max_length=60)
    is_admin: bool | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)


# Boards

BoardRole = Literal["owner", "editor", "viewer"]


class CreateBoardRequest(CamelModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=500)


class UpdateBoardMetaRequest(CamelModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=500)


class BoardSummary(CamelModel):
    id: int
    name: str
    description: str
    owner: str
    role: BoardRole
    card_count: int
    created_at: str
    updated_at: str


class BoardDetail(BoardSummary):
    data: BoardPayload


class MemberOut(CamelModel):
    username: str
    display_name: str
    role: BoardRole


class MemberRoleRequest(BaseModel):
    role: Literal["editor", "viewer"]


# AI


class AIDiagnosticRequest(BaseModel):
    prompt: str = Field(min_length=1)


class AIDiagnosticResponse(BaseModel):
    model: str
    output: str


class AIHistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1)


class AIChatRequest(BaseModel):
    prompt: str = Field(min_length=1)
    history: list[AIHistoryMessage] = Field(default_factory=list)


class AIChatResponse(CamelModel):
    message: str = Field(min_length=1)
    board_update: BoardPayload | None = None
