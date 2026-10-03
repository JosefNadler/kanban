from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class CardPayload(BaseModel):
    id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    details: str


class ColumnPayload(BaseModel):
    id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    card_ids: list[str] = Field(alias="cardIds")

    model_config = ConfigDict(populate_by_name=True)


class BoardPayload(BaseModel):
    schema_version: int = Field(alias="schemaVersion")
    columns: list[ColumnPayload]
    cards: dict[str, CardPayload]

    model_config = ConfigDict(populate_by_name=True)

    @model_validator(mode="after")
    def validate_consistency(self) -> "BoardPayload":
        if self.schema_version != 1:
            raise ValueError("schemaVersion must be 1.")

        column_ids = [column.id for column in self.columns]
        if len(column_ids) != len(set(column_ids)):
            raise ValueError("Column ids must be unique.")

        card_keys = set(self.cards.keys())
        card_ids_from_values = {card.id for card in self.cards.values()}
        if card_ids_from_values != card_keys:
            raise ValueError("Card keys must match each card id.")

        referenced_ids: list[str] = []
        for column in self.columns:
            referenced_ids.extend(column.card_ids)

        referenced_set = set(referenced_ids)
        if len(referenced_ids) != len(referenced_set):
            raise ValueError("Each card must appear in only one column.")

        if referenced_set != card_keys:
            raise ValueError("Every card must be referenced exactly once in columns.")

        return self


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


class AIChatResponse(BaseModel):
    message: str = Field(min_length=1)
    board_update: BoardPayload | None = Field(default=None, alias="boardUpdate")

    model_config = ConfigDict(populate_by_name=True)
