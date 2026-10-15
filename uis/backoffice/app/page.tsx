import {
  loadOpenIncidentSummary,
  type IncidentSeveritySummary,
} from "@repo/shared-types";

// Revalidación incremental (ISR): HTML cacheable para habilitar bfcache,
// con datos operativos actualizados cada 15 segundos.
export const revalidate = 15;

const labels = { critical: "Críticas", high: "Altas", medium: "Medias", low: "Bajas" } as const;

export default async function BackofficeHome() {
  const { data, online } = await loadOpenIncidentSummary(process.env.INCIDENT_API_URL ?? "http://127.0.0.1:8000");
  const total = Object.values(data).reduce((sum, value) => sum + value, 0);
  return <div className="shell">
    <aside><div className="mark">HC</div><strong>HealthCore<br />Operations</strong><nav><a className="active" href="/">Panel</a><a href="#incidents">Incidencias</a><a href="#modules">Módulos</a></nav><small>Uso interno · Sin PHI</small></aside>
    <main><header><div><p className="eyebrow">Centro de operaciones</p><h1>Buenos días, equipo.</h1><p className="subtitle">Una vista clara del trabajo que requiere atención.</p></div><span className={online ? "status online" : "status"}>{online ? "API conectada" : "API no disponible"}</span></header>
      <section className="overview" id="incidents"><div className="overview-title"><p>Incidencias abiertas</p><strong>{total}</strong></div><div className="severity-grid">{Object.entries(data).map(([severity, count]) => <div key={severity} className={`severity ${severity}`}><span>{labels[severity as keyof typeof labels]}</span><strong>{count}</strong></div>)}</div></section>
      <section className="modules" id="modules"><div><p className="eyebrow">Espacio preparado</p><h2>Módulos operativos</h2></div><div className="module-list"><article><span>01</span><div><h3>Gestión de incidencias</h3><p>Clasificación, asignación y auditoría por área responsable.</p></div><b>Activo</b></article><article><span>02</span><div><h3>Inventario clínico</h3><p>Stock derivado, lotes y alertas de reorden por clínica.</p></div><b>Preparado</b></article></div></section>
    </main>
  </div>;
}