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

/* Map API categories to telemetry product_category values */
function mapCategory(cat) {
  const map = {
    ppe: 'ppe',
    medical_consumables: 'consumable',
    otc_medication: 'medication',
    clinical_equipment: 'equipment',
  };
  return map[cat] || cat;
}

function telemetryProps(item) {
  return {
    clinic_id: item.clinic_location,
    country: typeof item.country === 'string' ? item.country.toUpperCase() : 'US',
    product_id: item.id || item.item_id,
    product_category: mapCategory(item.category),
  };
}

/* ── Section viewed event ────────────────────────────────────────── */
track('section_viewed', { section: 'inventory' });

const API_URL = location.hostname.includes("github.dev")
  ? `${location.protocol}//${location.hostname.replace(/-\d+(?=\.)/, "-8000")}`
  : "http://localhost:8000";
let items = [];

const api = (path, options = {}) => fetch(`${API_URL}${path}`, { ...options, headers: { "Content-Type": "application/json", ...options.headers } });
const formData = (form) => Object.fromEntries(new FormData(form).entries());

async function loadItems() {
  const startTime = typeof performance !== 'undefined' ? performance.now() : 0;
  const response = await api("/inventory/items");
  const durationMs = typeof performance !== 'undefined' ? performance.now() - startTime : 0;
  track('api_latency_recorded', {
    endpoint: '/inventory/items',
    duration_ms: Math.round(durationMs),
    status: response.status,
  });
  items = response.ok ? await response.json() : [];
  const clinics = [...new Set(items.map((item) => item.clinic_location))];
  const filter = document.querySelector("#clinic-filter");
  const selected = filter.value;
  filter.innerHTML = `<option value="">Todas</option>${clinics.map((clinic) => `<option>${clinic}</option>`).join("")}`;
  filter.value = selected;
  document.querySelectorAll(".item-select").forEach((select) => {
    select.innerHTML = items.map((item) => `<option value="${item.id}">${item.name} · ${item.clinic_location}</option>`).join("");
  });
  render();
  // Check for items below reorder threshold
  const belowReorder = items.filter((item) => item.below_reorder);
  belowReorder.forEach((item) => {
    track('stock_threshold_triggered', {
      clinic_id: item.clinic_location,
      country: item.country || 'us',
      product_id: item.id,
      product_category: item.category,
      currentStock: item.available_stock,
      threshold: item.reorder_point,
      trigger_source: 'dashboard_load',
    });
  });
}

function render() {
  const clinic = document.querySelector("#clinic-filter").value;
  const onlyLow = document.querySelector("#reorder-filter").checked;
  const visible = items.filter((item) => (!clinic || item.clinic_location === clinic) && (!onlyLow || item.below_reorder));
  document.querySelector("#item-count").textContent = visible.length;
  document.querySelector("#reorder-count").textContent = visible.filter((item) => item.below_reorder).length;
  document.querySelector("#inventory-list").innerHTML = visible.map((item) => `<tr data-id="${item.id}"><td>${item.name}</td><td>${item.clinic_location}</td><td>${item.category}</td><td>${item.available_stock}</td><td>${item.reorder_point}</td><td class="${item.below_reorder ? "status-low" : ""}">${item.below_reorder ? "Reordenar" : "Disponible"}</td></tr>`).join("") || `<tr><td colspan="6">Sin resultados</td></tr>`;
  document.querySelectorAll("[data-id]").forEach((row) => row.addEventListener("click", () => showDetail(row.dataset.id)));
}

async function showDetail(itemId) {
  const [lotsResponse, movementsResponse] = await Promise.all([api(`/inventory/items/${itemId}/lots`), api(`/inventory/items/${itemId}/movements`)]);
  const lots = lotsResponse.ok ? await lotsResponse.json() : [];
  const movements = movementsResponse.ok ? await movementsResponse.json() : [];
  document.querySelector("#inventory-detail").textContent = `Lotes: ${lots.map((lot) => lot.lot_code).join(", ") || "ninguno"}. Movimientos: ${movements.length}.`;
  const lotSelect = document.querySelector("#movement-form [name=lot_id]");
  lotSelect.innerHTML = `<option value="">Sin lote</option>${lots.map((lot) => `<option value="${lot.id}">${lot.lot_code}</option>`).join("")}`;
}

async function submit(form, path, transform = (data) => data) {
  const raw = formData(form);
  let response;
  try {
    response = await api(path, { method: "POST", body: JSON.stringify(transform(raw)) });
  } catch (err) {
    track('frontend_error_caught', { page: 'inventory', component: 'submit', error_class: 'NetworkError', error_message_hash: simpleHash(err.message || '') });
    const message = document.querySelector("#inventory-message");
    message.textContent = "No se pudo conectar con la API.";
    return;
  }
  const message = document.querySelector("#inventory-message");
  message.textContent = response.ok ? "Operación registrada." : (await response.json()).detail || "No se pudo registrar.";
  if (response.ok) {
    // Track inventory operations as mandatory events
    if (path === '/inventory/items') {
      track('inbound_order_created', {
        orderId: raw.name + '-' + Date.now(),
        clinic_id: raw.clinic_location,
        country: typeof raw.country === 'string' ? raw.country.toUpperCase() : 'US',
        product_id: 'new-' + Date.now(),
        product_category: mapCategory(raw.category),
        quantity: 0,
        supplier_id: 'manual-entry',
      });
    } else if (path === '/inventory/movements') {
      const movementType = raw.movement_type;
      if (movementType === 'inbound') {
        track('inbound_order_created', {
          orderId: 'mov-' + Date.now(),
          clinic_id: '',
          country: 'US',
          product_id: raw.item_id,
          product_category: '',
          quantity: Number(raw.quantity),
          lot_id: raw.lot_id || undefined,
        });
      } else if (movementType === 'outbound') {
        track('outbound_order_created', {
          orderId: 'mov-' + Date.now(),
          clinic_id: '',
          country: 'US',
          product_id: raw.item_id,
          product_category: '',
          quantity: Number(raw.quantity),
          department: 'clinical',
          lot_id: raw.lot_id || undefined,
        });
      }
    }
    form.reset();
    await loadItems();
  } else {
    // Track validation failures as opportunity events
    track('inventory_validation_failed', {
      clinic_id: raw.clinic_location || '',
      country: typeof raw.country === 'string' ? raw.country.toUpperCase() : 'US',
      product_id: raw.item_id || '',
      validation_rule: 'api_rejection',
      http_status: response.status,
    });
  }
}

document.querySelector("#item-form").addEventListener("submit", (event) => { event.preventDefault(); submit(event.currentTarget, "/inventory/items", (data) => ({ ...data, reorder_point: Number(data.reorder_point) })); });
document.querySelector("#lot-form").addEventListener("submit", (event) => { event.preventDefault(); submit(event.currentTarget, "/inventory/lots", (data) => ({ ...data, received_at: new Date().toISOString() })); });
document.querySelector("#movement-form").addEventListener("submit", (event) => { event.preventDefault(); submit(event.currentTarget, "/inventory/movements", (data) => ({ ...data, lot_id: data.lot_id || null, quantity: Number(data.quantity), reason: data.reason || null })); });
document.querySelector("#clinic-filter").addEventListener("change", render);
document.querySelector("#reorder-filter").addEventListener("change", render);
loadItems();