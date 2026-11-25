"""
Pydantic models for the HealthCore telemetry event envelope.

Matches the schema defined in docs/telemetry/event-schemas.json.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class TelemetryEvent(BaseModel):
    """Standard event envelope shared by all HealthCore telemetry events."""

    eventId: str = Field(..., description="Unique event identifier (UUID v4)")
    timestamp: str = Field(
        ...,
        description="Event timestamp in ISO 8601 UTC (capture time, not send time)",
    )
    sessionId: str = Field(..., description="Browser or API session identifier")
    userId: str = Field(
        ...,
        description="Authenticated operator identifier (may be hashed per PII policy)",
    )
    event_type: str = Field(
        ...,
        pattern=r"^[a-z]+_[a-z_]+$",
        description="Event type in entity_action taxonomy (e.g. order_submitted)",
    )
    schemaVersion: str = Field(
        ...,
        pattern=r"^[0-9]+\.[0-9]+\.[0-9]+$",
        description="Schema version for the event (semver)",
    )
    requestId: str = Field(
        ...,
        description="Correlation ID linking frontend, API, and logs",
    )
    properties: dict[str, Any] = Field(
        ...,
        description="Event-specific payload from the defined allowlist",
    )


class TelemetryBatch(BaseModel):
    """Batch of telemetry events sent from the frontend capture service."""

    events: list[TelemetryEvent]


class TelemetryBatchResponse(BaseModel):
    """Response returned by the POST /telemetry/events stub."""

    received: int = Field(..., description="Number of events accepted in the batch")