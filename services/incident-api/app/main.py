from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from .inventory_router import router as inventory_router
from .models import (
    HealthResponse,
    Incident,
    IncidentArea,
    IncidentAreaUpdate,
    IncidentAuditEvent,
    IncidentCreate,
    IncidentListItem,
    IncidentSeverity,
    IncidentStatus,
    IncidentStatusUpdate,
    IncidentUpdate,
    OpenIncidentsSummary,
)
from .store import IncidentStore


app = FastAPI(
    title="HealthCore Incident API",
    version="0.1.0",
    description="API for the centralized operational incident manager.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4173", "http://127.0.0.1:4173"],
    allow_origin_regex=r"https://.*\.app\.github\.dev|https://.*\.github\.dev",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

store = IncidentStore()
app.include_router(inventory_router)


@app.get("/health", response_model=HealthResponse, tags=["system"])
def health_check() -> HealthResponse:
    return HealthResponse(status="ok")


@app.post("/incidents", response_model=Incident, status_code=status.HTTP_201_CREATED)
def create_incident(payload: IncidentCreate) -> Incident:
    return store.create(payload)


@app.get("/incidents", response_model=list[IncidentListItem])
def list_incidents(
    status: IncidentStatus | None = None,
    severity: IncidentSeverity | None = None,
    responsible_area: IncidentArea | None = None,
) -> list[IncidentListItem]:
    return [
        IncidentListItem(
            id=incident.id,
            title=incident.title,
            type=incident.type,
            severity=incident.severity,
            status=incident.status,
            responsible_area=incident.responsible_area,
            created_at=incident.created_at,
            updated_at=incident.updated_at,
        )
        for incident in store.list_all(status, severity, responsible_area)
    ]


@app.get(
    "/incidents/summary/open-by-severity",
    response_model=OpenIncidentsSummary,
)
def open_incidents_by_severity() -> OpenIncidentsSummary:
    counts = store.open_by_severity()
    return OpenIncidentsSummary(
        critical=counts[IncidentSeverity.critical],
        high=counts[IncidentSeverity.high],
        medium=counts[IncidentSeverity.medium],
        low=counts[IncidentSeverity.low],
    )


@app.get("/incidents/{incident_id}", response_model=Incident)
def get_incident(incident_id: str) -> Incident:
    incident = store.get(incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    return incident


@app.patch("/incidents/{incident_id}", response_model=Incident)
def update_incident(incident_id: str, payload: IncidentUpdate) -> Incident:
    incident = store.update(incident_id, payload)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    return incident


@app.patch("/incidents/{incident_id}/status", response_model=Incident)
def update_incident_status(
    incident_id: str, payload: IncidentStatusUpdate
) -> Incident:
    incident = store.update_status(incident_id, payload.status, payload.changed_by)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    return incident


@app.patch("/incidents/{incident_id}/responsible-area", response_model=Incident)
def update_incident_area(
    incident_id: str, payload: IncidentAreaUpdate
) -> Incident:
    incident = store.update_area(
        incident_id, payload.responsible_area, payload.changed_by
    )
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    return incident


@app.get(
    "/incidents/{incident_id}/audit",
    response_model=list[IncidentAuditEvent],
)
def get_incident_audit(incident_id: str) -> list[IncidentAuditEvent]:
    events = store.audit(incident_id)
    if events is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    return events