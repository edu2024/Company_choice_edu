# Progreso

## Implementado

- Sitio corporativo HealthCore en `uis/website` con componentes React reutilizables.
- Backoffice Next.js con diseño interno y resumen visible de incidencias.
- Integración del backoffice mediante importación desde `packages/shared`.
- API de incidencias e inventario ubicada en `services/incident-api`.
- Banco de memoria, reglas del agente y skill de entrega alineados con HealthCore.

## En curso

- Pull Request y entrega del enlace en el campus de 4Geeks.

## Auditoría de rendimiento frontend (hito "performance audit")

- **Ciclo medir → analizar → corregir → volver a medir** aplicado a `uis/website` y `uis/backoffice` (servidores en producción, `next start`).
- Baseline y after con Lighthouse (4 presets) + capturas en `audit/before/` y `audit/after/` — entregables `AUDIT.md` y `REPORT.md` en la raíz.
- Correcciones puntuales aplicadas (no reescrituras):
  - Imágenes del website → `next/image` (AVIF): hero `priority` + red `loading="lazy"`; `next.config.mjs` con `remotePatterns` Unsplash. Hero 207 853 B JPEG → 9 230 B AVIF (−95 %).
  - bfcache habilitado en backoffice: fuera `force-dynamic` + fetch con `next:{revalidate:15}` en el cliente compartido (`Cache-Control: s-maxage=15, stale-while-revalidate=...`).
  - Contraste WCAG AA en ambas apps (coral/teal oscurecidos) → a11y 95/94 → 100.
  - `icon.svg` propio en cada app (elimina 404 de favicon → `errors-in-console` 0).
  - Abstracción compartida `loadOpenIncidentSummary()` + `EMPTY_INCIDENT_SUMMARY` en `packages/shared` (patrón server `useAsyncData`), quita try/catch duplicado en `uis/backoffice/app/page.tsx`.
- Resultado de métricas (móvil, mediana de 3 corridas): LCP website 2.29 s → 2.0 s; LCP backoffice 1.76 s → 1.6 s; CLS 0 en todos; FCP 0.8 s; TTFB < 30 ms. TBT móvil ruidoso (se reporta rango); desktop estable 15–18 ms / 0 ms.
- `npm run typecheck` y `npm run build` verdes en la raíz.

## Próximos pasos

- Añadir autenticación, autorización y persistencia antes de un uso productivo.
- Incorporar nuevos KPI solo cuando exista una fuente de datos aprobada.