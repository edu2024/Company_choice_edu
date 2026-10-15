# AUDIT.md — Auditoría de rendimiento frontend (HealthCore)

> Ciclo: **medir → analizar → corregir → volver a medir**
> Aplicaciones auditadas: `uis/website` (sitio corporativo) y `uis/backoffice` (panel operativo), ambas Next.js 15 + React 19.
> Herramienta: Lighthouse 13.5 (Chrome headless), servidores en **producción** (`next build` + `next start`), API `services/incident-api` activa.

---

## 1. Baseline (medición inicial)

### Scoreboards Lighthouse

| App / preset | Perf | A11y | Best Practices | SEO |
|---|---|---|---|---|
| website · desktop | 100 | 95 | 96 | 100 |
| website · móvil | 97 | 95 | 96 | 100 |
| backoffice · desktop | 100 | 95 | 96 | 90 |
| backoffice · móvil | 99 | 94 | 96 | 90 |

### Métricas web vitals (baseline)

> Los scoreboards no cuentan la historia: lo importante son las métricas de experiencia real (Core Web Vitals).

| Métrica | website desktop | website móvil | backoffice desktop | backoffice móvil |
|---|---|---|---|---|
| **FCP** (First Contentful Paint) | 0.2 s | 0.8 s | 0.3 s | 0.8 s |
| **LCP** (Largest Contentful Paint) | **0.6 s** | **2.3 s** | **0.5 s** | **1.8 s** |
| **TBT** (Total Blocking Time) | 20 ms | 130 ms | 0 ms | 90 ms |
| **CLS** (Cumulative Layout Shift) | 0 | 0 | 0 | 0 |
| TTFB (server response) | 10 ms | 10 ms | 30 ms | 20 ms |

**Lectura:** en móvil el **LCP de 2.3 s** (website) y **1.8 s** (backoffice) es el principal riesgo: el usuario ve la "pantalla en blanco" y la "foto principal tarda" que describen los escenarios del práctico. El **CLS = 0** descarta el problema de "contenido que se corre al tocar un botón". El **TBT** móvil (130 ms en website) indica hilo principal bloqueado junto al renderizado.

---

## 2. Issues detectados y causas raíz

### issue-1 — Error de consola: `favicon` 404 (ambas apps)
- **Audit:** `errors-in-console`
- **Evidencia:** `Failed to load resource: 404 .../favicon.ico` (1 ítem en las 4 corridas). El servidor no servía ningún icono.
- **Impacto:** señal de mala higiene de red; 404 en cada carga; score `errors-in-console` = 0.

### issue-2 — Contraste de color insuficiente (WCAG AA)
- **Audit:** `color-contrast`
- **Evidencia website (6 fails):** botones `.appointment` y `.primary-action` con coral `#e76f51` → contraste **3.09 : 1** sobre blanco (necesita 4.5 : 1). Spans numerados de `ServiceGrid` en el mismo coral.
- **Evidencia backoffice (4 fails):** `.eyebrow` y `<b>` con teal `#087f78` sobre papel/blanco (4.47–4.86 : 1, insuficiente para texto de 12–13 px *bold* que requiere 4.5 : 1).
- **Impacto:** texto de acción ilegible para usuarios con baja visión; score `color-contrast` = 0.

### issue-3 — Imágenes de cabecera descargadas a resolución máxima (website)
- **Audit:** `image-delivery-insight`
- **Evidencia:** `wastedBytes ≈ 54–56 KiB` en 2 imágenes de Unsplash cargadas como `background-image` CSS:
  - hero `photo-1576...` a `w=1800,q=85` (~203 KiB, 38–44 KiB desperdiciados)
  - red `photo-1551...` a `w=1200,q=85` (~120 KiB, 12–16 KiB desperdiciados)
- **Causa raíz:** CSS `background-image` no usa `next/image`, así que no hay AVIF/WebP, ni tamaños por viewport, ni lazy-loading de la imagen fuera de pantalla.
- **Impacto:** la foto principal es la que más tarda en aparecer (LCP móvil 2.3 s); bytes de más en cada visita.

### issue-4 — Back/forward cache deshabilitado (backoffice)
- **Audit:** `bf-cache` (score 0)
- **Evidencia** (Lighthouse):
  - `main resource has cache-control:no-store` → causa: `export const dynamic = "force-dynamic"` en la página.
  - `JS network request received Cache-Control: no-store` → causa: `fetch(..., { cache: "no-store" })` en `getOpenIncidentSummary` (paquete compartido).
- **Impacto:** navegar "atrás/adelante" recarga toda la página; sin bfcache el usuario vuelve a ver una pantalla en blanco breve.

### issue-5 — JS no usado (menor)
- **Audit:** `unused-javascript`: ahorro estimado ~42 KiB (runtime de Next.js compartido). No se corrige: es el coste base del framework y afecta por igual a ambos.

---

## 3. Candidatos de refactor (duplicación en el monorepo)

| Duplicación | Ubicación | Propuesta |
|---|---|---|
| `metadata` e `<html lang>` casi idénticos | `uis/website/app/layout.tsx` y `uis/backoffice/app/layout.tsx` | componente/layout compartido (SEO) en `packages/shared` |
| try/catch + fetch + fallback de resumen | dentro de `uis/backoffice/app/page.tsx` (`loadSummary`) | **abstracción compartida** `loadOpenIncidentSummary` + `EMPTY_INCIDENT_SUMMARY` en `packages/shared` |
| cliente HTTP duplicado en legacy | `uis/backoffice/app.js`, `inventory.js` (no forman parte del bundle Next, solo GitHub Pages) | alinear en una futura migración; fuera de alcance de este ciclo |

**Abstracción extraída en este ciclo:** `loadOpenIncidentSummary(apiUrl)` — versión *server* del patrón `useAsyncData` que centraliza fetch + fallback offline + revalidación (15 s), eliminando el try/catch duplicado de la página del backoffice y permitiendo devolver un `IncidentSummaryLoad` tipado.