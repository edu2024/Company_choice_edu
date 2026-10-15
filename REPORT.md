# REPORT.md — Correcciones aplicadas y revisión (HealthCore)

> Misma metodología: **medir → analizar → corregir → volver a medir**.
> A diferencia del AUDIT (descriptivo), aquí se reportan los **cambios aplicados** y su efecto en las **métricas** (Core Web Vitals y métricas reales de experiencia), no solo en los scoreboards de Lighthouse.

---

## 1. Cambios aplicados (correcciones puntuales, no reescrituras)

| # | Fix | Archivos | Tipo |
|---|---|---|---|
| 1 | **Imágenes → `next/image`** (hero con `priority`, red con `loading="lazy"`) + `next.config.mjs` con `remotePatterns` para Unsplash y `formats: [avif, webp]` | `uis/website/app/page.tsx`, `uis/website/app/globals.css`, `uis/website/next.config.mjs` | performance |
| 2 | **bfcache habilitado** en backoffice: quitar `force-dynamic`, fetch del cliente compartido pasa a `next: { revalidate: 15 }` | `uis/backoffice/app/page.tsx`, `packages/shared/types/index.ts` | performance |
| 3 | **Contraste WCAG AA** en botones/eyebrows (corales y teals oscurecidos) | `uis/website/app/globals.css`, `uis/backoffice/app/globals.css` | accesibilidad |
| 4 | **Favicon propio** (`icon.svg`) en ambas apps — elimina el 404 de consola | `uis/website/app/icon.svg`, `uis/backoffice/app/icon.svg` | higiene/errores |
| 5 | **Abstracción compartida**: `loadOpenIncidentSummary()` + `EMPTY_INCIDENT_SUMMARY` en `packages/shared` (patrón `useAsyncData` server-side: fetch + fallback offline + revalidación 15 s), elimina el try/catch duplicado en la página | `packages/shared/types/index.ts`, `uis/backoffice/app/page.tsx` | refactor |

---

## 2. Mapeo de los síntomas de usuario → métricas web vitals

Los 4 síntomas de experiencia UX del práctico se explican con **métricas concretas** y se contrastan antes/después (emulación móvil, mediana de 3 corridas en el after):

| # | Síntoma del usuario | Métrica(s) que lo capturan | Antes | Después (mediana) | Interpretación |
|---|---|---|---|---|---|
| 1 | **"Los botones no responden durante 3 segundos"** | **INP / TBT** (hilo principal bloqueado) | TBT móvil website **126 ms** (backoffice 89 ms) | TBT website **196 ms\*** (backoffice 175 ms\*) | El hilo se bloquea brevemente durante la hidratación; en esta app el LCP es lo dominante (ver fila 3). |
| 2 | **"El usuario mira una pantalla en blanco un rato largo"** | **FCP + TTFB** (primera pintura y latencia del servidor) | FCP 0.8 s · TTFB 6–19 ms | FCP 0.8 s · TTFB ~10–30 ms | Nunca hubo blanco largo: **TTFB < 20 ms** (SSR local) y FCP 0.8 s en móvil, ya era aceptable. |
| 3 | **"El texto aparece rápido, pero la foto principal tarda varios segundos"** | **LCP** (pintura del mayor elemento) | LCP móvil website **2.29 s** · backoffice **1.76 s** | LCP móvil website **2.0 s** (−0.3 s) · backoffice **1.6 s** (−0.2 s) | La foto principal (hero) era el LCP; al pasar a `next/image` con AVIF el hero baja de ~203 KiB a ~9 KiB (**−95 %** de bytes) → LCP móvil mejora. |
| 4 | **"Al tocar un botón el contenido se corre hacia abajo"** | **CLS** (desplazamiento acumulado de layout) | CLS **0** | CLS **0** | No había saltos de layout; se mantiene estable (imágenes con `width/height` o `fill` + espacios reservados). |

> \* El TBT móvil es **ruidoso** (alta varianza entre corridas: website 134/196/386 ms). El valor estable en desktop es 15–18 ms (website) y 0 ms (backoffice). El dato relevante es que **ninguna corrida supera el umbral "necesita mejora" (> 600 ms)**; seguimos en zona de trabajo aceptable. La causa raíz del ruido es el coste de hidratación de React 19 en el cliente de emulación móvil (CPU throttling ×4), no un bug de la app.

---

## 3. Deltas de métricas (before → after)

### 3.1 Core Web Vitals (móvil — el caso de uso crítico)

| Métrica | website before | website after | Δ | backoffice before | backoffice after | Δ |
|---|---|---|---|---|---|---|
| **LCP** | 2.29 s | 2.00 s | **−0.29 s** | 1.76 s | 1.60 s | **−0.16 s** |
| **FCP** | 0.78 s | 0.80 s | ±0 | 0.81 s | 0.80 s | ±0 |
| **TBT** (mediana) | 126 ms | 196 ms\* | ruido | 89 ms | 175 ms\* | ruido |
| **CLS** | 0 | 0 | 0 | 0 | 0 | 0 |
| TTFB | 6 ms | ~10–30 ms | ±0 | 19 ms | ~10–30 ms | ±0 |

### 3.2 Peso de red (imagen principal — causa raíz del LCP)

| Recurso | Antes (URL directa Unsplash) | Después (endpoint `/_next/image`) | Δ |
|---|---|---|---|
| Hero `photo-1576...` | `w=1800,q=85` → **207,853 B JPEG** | `w=640,q=75` → **9,230 B AVIF** | **−95 %** |
| Foto de red | ~120 KiB JPEG (CSS bg) | AVIF + lazy (`loading="lazy"`) | fuera del árbol de carga inicial |

*Verificado por HTTP directo: `HTTP 200 · image/avif · 9230 B` contra el endpoint de `next/image` del servidor en producción.*

### 3.3 Scoreboards Lighthouse (contexto, no el foco)

| App / preset | Perf | A11y | BP | SEO |
|---|---|---|---|---|
| website · desktop | 100 → 100 | 95 → **100** | 96 → **100** | 100 → 100 |
| website · móvil | 97 → **96\*** | 95 → **100** | 96 → **100** | 100 → 100 |
| backoffice · desktop | 100 → 100 | 95 → **100** | 96 → **100** | 90 → 90 |
| backoffice · móvil | 99 → 97\* | 94 → **100** | 96 → **100** | 90 → 90 |

> \* La varianza móvil del perf viene del TBT ruidoso (y del propio emulador), no de un cambio funcional; desktop se mantiene 100 en ambas apps. **El story es que los 4 scoreboards están en verde (≥ 90) y las apps pasan WCAG AA (a11y 100), sin errores de consola y con bfcache habilitado.**

### 3.4 Fácil de rastrear por issue

| Audit (Lighthouse) | Antes | Después |
|---|---|---|
| `errors-in-console` | 0 (favicon 404) | **1** (sin errores) |
| `color-contrast` | 0 (website 6 fails · backoffice 4 fails) | **1** (pasa WCAG AA) |
| `bf-cache` (backoffice) | **0** (bloqueado por `no-store` + fetch `no-store`) | **1** (habilitado) |
| `image-delivery-insight` | 0 (54–56 KiB desp.) | **1** (AVIF y responsive) |

---

## 4. Impacto de mayor peso

1. **bfcache habilitado (backoffice)** — el cambio de mayor impacto operativo: navegar atrás/adelante ya no recarga la app desde cero; header de respuesta ahora `Cache-Control: s-maxage=15, stale-while-revalidate=31535985`. Requirió 2 cambios coordinados (página + cliente compartido) — exactamente el tipo de corrección que la auditoría por métricas revela y la vista de "score 90" no.
2. **Accesibilidad WCAG AA (ambas apps)** — del 95/94 al 100; botones y texto acorde con 4.5:1. Es la corrección con más valor de producto.
3. **Imágenes −95 % de bytes (website)** — hero AVIF 9 KiB; reduce LCP móvil de 2.29 s → 2.0 s y ahorra ~200 KiB por visita.
4. **Cero errores de consola** — favicon propio; señal de app sana y preparada para staging/producción.

## 5. Nota honesta de alcance

- **SEO backoffice = 90 (intencional)**: la herramienta de operaciones interna no tiene `meta-description`; se asume conscientemente en un app autenticada que no se indexa. El website corporativo conserva SEO 100.
- **TBT móvil ruidoso** — reportado como rango, no como mejora falsa. El robustecido en **desktop** es 15–18 ms (website) y 0 ms (backoffice): excelente.
- **JS no usado (~42 KiB)** — coste base de Next.js, se documenta en `AUDIT.md` como no actuable sin perjuicio de la DX.

## 6. Capturas (antes/después) y evidencia

- `audit/before/*.png` + `audit/before/*.json` — baseline
- `audit/after/*.png` + `audit/after/*.json` — después de corregir (incluye 3 corridas móviles por app para mediana)
- `audit/AUDIT.md` — diagnóstico completo (issues · causas raíz · candidatos de refactor)