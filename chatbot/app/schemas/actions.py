from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


OperationIntent = Literal[
    "add_items",
    "remove_item",
    "update_quantity",
    "update_item",
    "clear_cart",
    "view_cart",
    "recommendation_query",
    "describe_item",
    "list_categories",
    "list_category_items",
    "checkout",
    "confirm_checkout",
    "repeat_order",
    "guided_order_response",
    "unknown",
]


class ParsedItemRequest(BaseModel):
    item_query: str = ""
    quantity: int = 1
    modifiers: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
    follow_up_ref: Optional[str] = None


class ParsedOperation(BaseModel):
    intent: OperationIntent
    items: list[ParsedItemRequest] = Field(default_factory=list)
    needs_clarification: bool = False
    reason: str = ""


class ParsedRequest(BaseModel):
    operations: list[ParsedOperation] = Field(min_length=1)
    confidence: float = Field(ge=0.0, le=1.0)
    needs_clarification: bool = False
    reason: str = ""


class CompiledOption(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    option_name: str = Field(alias="optionName")
    suboption_name: Optional[str] = Field(default=None, alias="suboptionName")
    group_id: Optional[str] = Field(default=None, alias="groupId")


class CompiledCartLine(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    menu_item_id: int = Field(alias="menuItemId")
    qty: int = Field(ge=1)
    selected_options: list[CompiledOption] = Field(
        default_factory=list,
        alias="selectedOptions",
    )
    instructions: str = ""
    unmatched_modifiers: list[str] = Field(default_factory=list)

    def to_wire_payload(self) -> dict:
        return self.model_dump(
            by_alias=True,
            exclude={"unmatched_modifiers"},
        )


class CompiledOperation(BaseModel):
    intent: OperationIntent
    lines: list[CompiledCartLine] = Field(default_factory=list)
    cart_line_id: Optional[str] = None
    source_parsed: ParsedOperation


class CompiledRequest(BaseModel):
    operations: list[CompiledOperation]
