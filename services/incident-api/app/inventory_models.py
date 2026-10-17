import re
from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class InventoryUnit(str, Enum):
    unit = "unit"
    box = "box"
    ml = "ml"
    tablet = "tablet"


class InventoryCategory(str, Enum):
    ppe = "ppe"
    medical_consumables = "medical_consumables"
    otc_medication = "otc_medication"
    clinical_equipment = "clinical_equipment"


class InventoryCountry(str, Enum):
    us = "us"
    uk = "uk"


class MovementType(str, Enum):
    inbound = "inbound"
    outbound = "outbound"
    adjustment = "adjustment"


LOT_CONTROLLED_CATEGORIES = {
    InventoryCategory.medical_consumables,
    InventoryCategory.otc_medication,
}

SENSITIVE_TEXT_PATTERNS = (
    re.compile(r"\b(?:patient|paciente|mrn|nhs|medical record)\b", re.IGNORECASE),
    re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),
    re.compile(r"\b(?:dob|date of birth|fecha de nacimiento)\b", re.IGNORECASE),
)


def reject_sensitive_text(value: str | None) -> str | None:
    if value is None:
        return value
    if any(pattern.search(value) for pattern in SENSITIVE_TEXT_PATTERNS):
        raise ValueError("Inventory text must contain operational details only")
    return value


class InventoryModel(BaseModel):
    model_config = ConfigDict(extra="forbid", hide_input_in_errors=True)


class InventoryItemCreate(InventoryModel):
    clinic_location: str = Field(min_length=1, max_length=120)
    country: InventoryCountry
    name: str = Field(min_length=1, max_length=160)
    category: InventoryCategory
    unit_of_measure: InventoryUnit
    reorder_point: float = Field(ge=0)

    _safe_location = field_validator("clinic_location")(reject_sensitive_text)
    _safe_name = field_validator("name")(reject_sensitive_text)


class InventoryItemUpdate(InventoryModel):
    clinic_location: str | None = Field(default=None, min_length=1, max_length=120)
    country: InventoryCountry | None = None
    name: str | None = Field(default=None, min_length=1, max_length=160)
    category: InventoryCategory | None = None
    unit_of_measure: InventoryUnit | None = None
    reorder_point: float | None = Field(default=None, ge=0)

    _safe_location = field_validator("clinic_location")(reject_sensitive_text)
    _safe_name = field_validator("name")(reject_sensitive_text)


class InventoryItem(InventoryItemCreate):
    id: str
    created_at: datetime
    updated_at: datetime


class InventoryItemView(InventoryItem):
    available_stock: float
    below_reorder: bool


class InventoryItemListItem(BaseModel):
    """Fields consumed by the inventory table, without detail-only metadata."""

    id: str
    clinic_location: str
    name: str
    category: InventoryCategory
    reorder_point: float
    available_stock: float
    below_reorder: bool


class InventoryLotCreate(InventoryModel):
    item_id: str
    lot_code: str = Field(min_length=1, max_length=80)
    expiry_date: date
    received_at: datetime

    _safe_code = field_validator("lot_code")(reject_sensitive_text)


class InventoryLot(InventoryLotCreate):
    id: str


class InventoryMovementCreate(InventoryModel):
    item_id: str
    lot_id: str | None = None
    movement_type: MovementType
    quantity: float
    reason: str | None = Field(default=None, max_length=240)

    _safe_reason = field_validator("reason")(reject_sensitive_text)

    @model_validator(mode="after")
    def validate_quantity_and_reason(self) -> "InventoryMovementCreate":
        if self.movement_type == MovementType.adjustment:
            if self.quantity == 0:
                raise ValueError("Adjustment quantity must be non-zero")
            if not self.reason or not self.reason.strip():
                raise ValueError("Adjustment reason is required")
        elif self.quantity <= 0:
            raise ValueError("Inbound and outbound quantities must be positive")
        return self


class InventoryMovement(InventoryMovementCreate):
    id: str
    created_at: datetime