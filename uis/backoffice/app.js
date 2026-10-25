import { track } from './services/telemetry.js';

/* ── Helpers ─────────────────────────────────────────────────────── */

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

/* ── Section viewed event ────────────────────────────────────────── */
track('section_viewed', { section: 'incident_desk' });

const API_URL = getApiUrl();
let incidents = [];

function getApiUrl() {
  const host = window.location.hostname;
  if (host.endsWith(".app.github.dev") || host.endsWith(".github.dev")) {
    return `${window.location.protocol}//${host.replace(/-\d+(?=\.)/, "-8000")}`;
  }
  return "http://localhost:8000";
}

const labels = {
  status: { new: "Nueva", triaged: "Clasificada", assigned: "Asignada", "in-progress": "En progreso", blocked: "Bloqueada", resolved: "Resuelta", closed: "Cerrada" },
  severity: { critical: "Crítica", high: "Alta", medium: "Media", low: "Baja" },
  type: { technology: "Tecnología", "clinical-operations": "Operaciones clínicas", "patient-access": "Acceso del paciente", "billing-revenue": "Facturación e ingresos", "compliance-data": "Cumplimiento y datos", workforce: "Personas y fuerza laboral" },
};

const listElement = document.querySelector("#incident-list");
const form = document.querySelector("#incident-form");
const message = document.querySelector("#form-message");

async function loadIncidents() {
  const startTime = typeof performance !== 'undefined' ? performance.now() : 0;
  try {
    const response = await fetch(`${API_URL}/incidents`);
    const durationMs = typeof performance !== 'undefined' ? performance.now() - startTime : 0;
    if (!response.ok) throw new Error("No se pudo cargar la cola");
    track('api_latency_recorded', { endpoint: '/incidents', duration_ms: Math.round(durationMs), status: 200 });
    incidents = await response.json();
    renderMetrics();
    renderList();
  } catch (error) {
    track('frontend_error_caught', { page: 'incident_desk', component: 'loadIncidents', error_class: 'APIError', error_message_hash: simpleHash(error.message || '') });
    listElement.innerHTML = `<div class="empty-state">No se pudo conectar con la API. Inicia el servicio en el puerto 8000.</div>`;
    track('api_latency_recorded', { endpoint: '/incidents', duration_ms: Math.round(typeof performance !== 'undefined' ? performance.now() - startTime : 0), status: 0 });
  }
}

function renderMetrics() {
  document.querySelector("#nav-count").textContent = incidents.length;
  for (const severity of ["critical", "high", "medium", "low"]) {
    document.querySelector(`#metric-${severity}`).textContent = incidents.filter((incident) => incident.severity === severity && incident.status !== "closed").length;
  }
}

function renderList() {
  const search = document.querySelector("#search-input").value.toLowerCase();
  const status = document.querySelector("#status-filter").value;
  const severity = document.querySelector("#severity-filter").value;
  const area = document.querySelector("#area-filter").value;
  const visible = incidents.filter((incident) => incident.title.toLowerCase().includes(search) && (status === "all" || incident.status === status) && (severity === "all" || incident.severity === severity) && (area === "all" || (area === "unassigned" ? !incident.responsible_area : incident.responsible_area === area)));
  if (!visible.length) {
    listElement.innerHTML = `<div class="empty-state">No hay incidencias que coincidan con estos filtros.</div>`;
    return;
  }
  listElement.innerHTML = visible.map((incident) => `<button class="incident-row" data-id="${incident.id}" type="button"><span><strong>${escapeHtml(incident.title)}</strong><small>${labels.type[incident.type] || incident.type} · ${formatDate(incident.created_at)}</small></span><span class="badge badge-${incident.severity}">${labels.severity[incident.severity]}</span><span class="badge badge-medium">${labels.status[incident.status]}</span></button>`).join("");
  listElement.querySelectorAll("[data-id]").forEach((row) => row.addEventListener("click", () => showDetail(row.dataset.id)));
}

async function showDetail(id) {
  const incident = incidents.find((item) => item.id === id);
  if (!incident) return;
  const response = await fetch(`${API_URL}/incidents/${id}/audit`);
  const audit = response.ok ? await response.json() : [];
  document.querySelector("#detail-content").innerHTML = `<div class="detail-header"><p class="eyebrow">Detalle de incidencia</p><h3>${escapeHtml(incident.title)}</h3><div class="detail-meta"><span class="badge badge-${incident.severity}">${labels.severity[incident.severity]}</span><span class="badge badge-medium">${labels.status[incident.status]}</span></div></div><p class="detail-label">Descripción</p><p class="detail-description">${escapeHtml(incident.description)}</p><button class="button detail-edit-button" id="edit-incident-button" type="button">Editar datos</button><form class="detail-edit-form is-hidden" id="detail-edit-form"><label class="field"><span>Título</span><input name="title" required value="${escapeHtml(incident.title)}"></label><label class="field"><span>Descripción</span><textarea name="description" required rows="3">${escapeHtml(incident.description)}</textarea></label><label class="field"><span>Tipo</span><select name="type"><option value="clinical-operations">Operaciones clínicas</option><option value="patient-access">Acceso del paciente</option><option value="billing-revenue">Facturación e ingresos</option><option value="compliance-data">Cumplimiento y datos</option><option value="workforce">Personas</option><option value="technology">Tecnología</option></select></label><label class="field"><span>Gravedad</span><select name="severity"><option value="critical">Crítica</option><option value="high">Alta</option><option value="medium">Media</option><option value="low">Baja</option></select></label><label class="field"><span>Canal</span><select name="channel"><option value="phone">Teléfono</option><option value="email">Correo electrónico</option><option value="internal-message">Mensaje interno</option><option value="monitoring">Monitorización</option><option value="in-person">Presencial</option><option value="manual-entry">Registro manual</option></select></label><button class="button button-primary" type="submit">Guardar cambios</button></form><p class="detail-label">Estado</p><select class="detail-select" id="detail-status"><option value="new">Nueva</option><option value="triaged">Clasificada</option><option value="assigned">Asignada</option><option value="in-progress">En progreso</option><option value="blocked">Bloqueada</option><option value="resolved">Resuelta</option><option value="closed">Cerrada</option></select><p class="detail-label">Área responsable</p><select class="detail-select" id="detail-area"><option value="">Sin asignar</option><option value="clinical-operations">Operaciones clínicas</option><option value="patient-access">Experiencia del paciente</option><option value="billing-revenue">Facturación e ingresos</option><option value="compliance-data">Cumplimiento y datos</option><option value="workforce">Personas</option><option value="technology">Tecnología</option><option value="executive">Dirección ejecutiva</option></select><p class="detail-label">Historial de auditoría</p>${audit.length ? audit.map((event) => `<div class="audit-item"><strong>${event.field === "status" ? "Estado actualizado" : "Área responsable actualizada"}</strong><small>${event.previous_value || "Sin asignar"} → ${event.new_value} · ${event.changed_by} · ${formatDateTime(event.changed_at)}</small></div>`).join("") : `<p class="detail-description">Sin cambios registrados.</p>`}`;
  const editForm = document.querySelector("#detail-edit-form");
  editForm.elements.type.value = incident.type;
  editForm.elements.severity.value = incident.severity;
  editForm.elements.channel.value = incident.channel;
  document.querySelector("#edit-incident-button").addEventListener("click", () => editForm.classList.toggle("is-hidden"));
  editForm.addEventListener("submit", (event) => updateIncident(event, id));
  document.querySelector("#detail-status").value = incident.status;
  document.querySelector("#detail-status").addEventListener("change", (event) => updateStatus(id, event.target.value));
  document.querySelector("#detail-area").value = incident.responsible_area || "";
  document.querySelector("#detail-area").addEventListener("change", (event) => updateArea(id, event.target.value));
}

async function updateStatus(id, status) {
  const startTime = typeof performance !== 'undefined' ? performance.now() : 0;
  const response = await fetch(`${API_URL}/incidents/${id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, changed_by: "operations-user" }) });
  const durationMs = typeof performance !== 'undefined' ? performance.now() - startTime : 0;
  track('api_latency_recorded', { endpoint: `/incidents/${id}/status`, duration_ms: Math.round(durationMs), status: response.status });
  track('incident_status_changed', { incident_id: id, new_status: status, changed_by: 'operations-user' });
  await loadIncidents();
  await showDetail(id);
}

async function updateArea(id, responsibleArea) {
  if (!responsibleArea) return;
  const startTime = typeof performance !== 'undefined' ? performance.now() : 0;
  const response = await fetch(`${API_URL}/incidents/${id}/responsible-area`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ responsible_area: responsibleArea, changed_by: "operations-user" }) });
  const durationMs = typeof performance !== 'undefined' ? performance.now() - startTime : 0;
  track('api_latency_recorded', { endpoint: `/incidents/${id}/responsible-area`, duration_ms: Math.round(durationMs), status: response.status });
  track('incident_area_changed', { incident_id: id, new_area: responsibleArea, changed_by: 'operations-user' });
  await loadIncidents();
  await showDetail(id);
}

async function updateIncident(event, id) {
  event.preventDefault();
  const startTime = typeof performance !== 'undefined' ? performance.now() : 0;
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());
  const response = await fetch(`${API_URL}/incidents/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  const durationMs = typeof performance !== 'undefined' ? performance.now() - startTime : 0;
  track('api_latency_recorded', { endpoint: `/incidents/${id}`, duration_ms: Math.round(durationMs), status: response.status });
  if (!response.ok) return;
  await loadIncidents();
  await showDetail(id);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const startTime = typeof performance !== 'undefined' ? performance.now() : 0;
  const data = Object.fromEntries(new FormData(form).entries());
  if (!data.responsible_area) delete data.responsible_area;
  try {
    const response = await fetch(`${API_URL}/incidents`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    const durationMs = typeof performance !== 'undefined' ? performance.now() - startTime : 0;
    track('api_latency_recorded', { endpoint: '/incidents', duration_ms: Math.round(durationMs), status: response.status });
    if (!response.ok) throw new Error("No se pudo guardar");
    track('incident_created', { incident_severity: data.severity, incident_type: data.type });
    form.reset(); message.textContent = "Incidencia registrada correctamente."; await loadIncidents();
  } catch (error) {
    track('frontend_error_caught', { page: 'incident_desk', component: 'create_incident', error_class: 'APIError', error_message_hash: simpleHash(error.message || '') });
    message.textContent = "No se pudo registrar. Comprueba que la API esté activa.";
  }
});

document.querySelector("#search-input").addEventListener("input", renderList);
document.querySelector("#status-filter").addEventListener("change", renderList);
document.querySelector("#severity-filter").addEventListener("change", renderList);
document.querySelector("#area-filter").addEventListener("change", renderList);
document.querySelector("#new-incident-button").addEventListener("click", () => document.querySelector("#new-incident").scrollIntoView({ behavior: "smooth" }));
document.querySelector("#close-detail").addEventListener("click", () => document.querySelector("#detail-content").innerHTML = `<div class="detail-placeholder"><span>→</span><p>Selecciona una incidencia para revisar sus detalles y trazabilidad.</p></div>`);

function formatDate(value) { return new Date(value).toLocaleDateString("es-ES", { day: "2-digit", month: "short" }); }
function formatDateTime(value) { return new Date(value).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" }); }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" }[character])); }

loadIncidents();