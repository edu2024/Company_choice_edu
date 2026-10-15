/** Shared HealthCore contracts consumed across the monorepo. */
export type Id = string;

export interface BaseEntity {
  id: Id;
  createdAt?: string;
  updatedAt?: string;
}

export type IncidentType =
  | "clinical-operations"
  | "patient-access"
  | "billing-revenue"
  | "compliance-data"
  | "workforce"
  | "technology";

export type IncidentSeverity = "critical" | "high" | "medium" | "low";

export type IncidentChannel =
  | "phone"
  | "email"
  | "internal-message"
  | "monitoring"
  | "in-person"
  | "manual-entry";

export type IncidentStatus =
  | "new"
  | "triaged"
  | "assigned"
  | "in-progress"
  | "blocked"
  | "resolved"
  | "closed";

export type IncidentArea =
  | "clinical-operations"
  | "patient-access"
  | "billing-revenue"
  | "compliance-data"
  | "workforce"
  | "technology"
  | "executive";

export interface Incident extends BaseEntity {
  title: string;
  description: string;
  type: IncidentType;
  severity: IncidentSeverity;
  channel: IncidentChannel;
  status: IncidentStatus;
  responsibleArea?: IncidentArea;
}

export interface IncidentAuditEvent {
  id: Id;
  incidentId: Id;
  field: "status" | "responsibleArea";
  previousValue: string | null;
  newValue: string;
  changedBy: Id;
  changedAt: string;
}

export type IncidentSeveritySummary = Record<IncidentSeverity, number>;

export const INCIDENT_SUMMARY_REVALIDATE_SECONDS = 15;

// Next.js amplía RequestInit con `next.revalidate`; el paquete compartido
// no depende de los tipos de Next, así que lo declaramos localmente.
type NextFetchRequestInit = RequestInit & {
  next?: { revalidate?: number };
};

/**
 * Obtiene el resumen de incidencias abiertas desde services/incident-api.
 * Usa revalidación incremental (ISR) en lugar de `cache: "no-store"` para
 * permitir al navegador usar back/forward cache (bfcache) en el backoffice.
 */
export async function getOpenIncidentSummary(
  apiUrl: string,
): Promise<IncidentSeveritySummary> {
  const init: NextFetchRequestInit = {
    next: { revalidate: INCIDENT_SUMMARY_REVALIDATE_SECONDS },
  };
  const response = await fetch(
    `${apiUrl}/incidents/summary/open-by-severity`,
    init,
  );

  if (!response.ok) {
    throw new Error("Incident summary is unavailable");
  }

  return response.json() as Promise<IncidentSeveritySummary>;
}

export interface IncidentSummaryLoad {
  data: IncidentSeveritySummary;
  online: boolean;
}

export const EMPTY_INCIDENT_SUMMARY: IncidentSeveritySummary = {
  critical: 0,
  high: 0,
  medium: 0,
  low: 0,
};

/**
 * Abstracción compartida para cargar el resumen sin romper el renderizado
 * cuando la API no está disponible (fallback offline). Reemplaza el patrón
 * try/catch duplicado que vivía dentro de la página del backoffice.
 */
export async function loadOpenIncidentSummary(
  apiUrl: string,
): Promise<IncidentSummaryLoad> {
  try {
    const data = await getOpenIncidentSummary(apiUrl);
    return { data, online: true };
  } catch {
    return { data: EMPTY_INCIDENT_SUMMARY, online: false };
  }
}

export type InventoryUnit = "unit" | "box" | "ml" | "tablet";
export type InventoryCategory =
  | "ppe"
  | "medical_consumables"
  | "otc_medication"
  | "clinical_equipment";
export type InventoryCountry = "us" | "uk";
export type InventoryMovementType = "inbound" | "outbound" | "adjustment";

export interface InventoryItem extends BaseEntity {
  clinicLocation: string;
  country: InventoryCountry;
  name: string;
  category: InventoryCategory;
  unitOfMeasure: InventoryUnit;
  reorderPoint: number;
  availableStock: number;
  belowReorder: boolean;
}

export interface InventoryLot {
  id: Id;
  itemId: Id;
  lotCode: string;
  expiryDate: string;
  receivedAt: string;
}

export interface InventoryMovement {
  id: Id;
  itemId: Id;
  lotId?: Id;
  movementType: InventoryMovementType;
  quantity: number;
  reason?: string;
  createdAt: string;
}
