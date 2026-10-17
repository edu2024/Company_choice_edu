# Auditoría de serialización

## Alcance y criterio

Auditoría de la API existente de HealthCore en `services/incident-api/app/main.py` y `services/incident-api/app/inventory_router.py`. El alcance incluye incidencias, su historial, estado del servicio e inventario. El repositorio declara que la persistencia es en memoria y que la autenticación está fuera del MVP (`services/incident-api/README.md`); por tanto, **no existen rutas de registro, login, usuarios, perfiles ni ORM en este servicio** y no se añaden rutas ficticias para cubrir esos casos.

Los contratos indicados como actuales se verifican en los decoradores y clases Pydantic del código fuente. La UI Next.js actual no consume la API de incidencias; el backoffice de inventario consume la lista de artículos, lotes y movimientos (`uis/backoffice/inventory.js`). Los payloads objetivo conservan los campos del dominio operativo y evitan añadir datos de paciente (PHI).

**Leyenda:** ✅ serializado explícitamente con una proyección razonable; ⚠️ contrato explícito pero con una proyección de lista/payload mejorable; ❌ respuesta sin `response_model` explícito.

El estado de la tabla y de cada bloque describe el código **antes de esta auditoría**. Las mejoras de la sección siguiente se implementaron en los modelos y routers; el resultado posterior se resume al final.

## Inventario de endpoints

| Método | Ruta | Propósito | Estado hoy | Mejora propuesta |
|---|---|---|---|---|
| GET | `/health` | Disponibilidad del servicio | ❌ `dict[str, str]` sin `response_model` | `HealthResponse` explícito con `status` |
| POST | `/incidents` | Registrar incidencia | ✅ `IncidentCreate` → `Incident` | Mantener entrada/salida separadas; salida pública explícita |
| GET | `/incidents` | Listar y filtrar incidencias | ⚠️ `list[Incident]`; respuesta de detalle para lista | `IncidentListItem` compacto con campos de tabla; reservar descripción completa para detalle |
| GET | `/incidents/summary/open-by-severity` | Resumen de abiertas por gravedad | ❌ diccionario dinámico sin esquema de respuesta | `OpenIncidentsSummary` con contadores nombrados o una estructura estable y documentada |
| GET | `/incidents/{incident_id}` | Consultar detalle de incidencia | ✅ `Incident` | Mantener detalle con campos operativos explícitos |
| PATCH | `/incidents/{incident_id}` | Editar datos descriptivos | ✅ `IncidentUpdate` → `Incident` | Mantener DTO de entrada separado; respuesta de detalle segura |
| PATCH | `/incidents/{incident_id}/status` | Cambiar estado y registrar auditoría | ✅ `IncidentStatusUpdate` → `Incident` | Mantener respuesta explícita y no exponer campos internos del store |
| PATCH | `/incidents/{incident_id}/responsible-area` | Cambiar área y registrar auditoría | ✅ `IncidentAreaUpdate` → `Incident` | Mantener respuesta explícita y no exponer campos internos del store |
| GET | `/incidents/{incident_id}/audit` | Consultar eventos históricos | ✅ `list[IncidentAuditEvent]` | Mantener proyección plana de evento; proteger la inmutabilidad del historial |
| POST | `/inventory/items` | Crear artículo | ✅ `InventoryItemCreate` → `InventoryItem` | Mantener esquemas de escritura/lectura separados si el modelo evoluciona |
| GET | `/inventory/items` | Lista artículos con stock y filtros | ⚠️ `list[InventoryItemView]` | `InventoryItemListItem` compacto; conservar `id`, nombre, clínica, categoría, unidad, stock disponible, punto de reorden y flag de reorden que usa la UI |
| GET | `/inventory/items/{item_id}` | Detalle de artículo | ✅ `InventoryItemView` | Mantener detalle incluyendo stock calculado; no anidar lotes ni movimientos, que tienen rutas propias |
| PATCH | `/inventory/items/{item_id}` | Actualizar artículo | ✅ `InventoryItemUpdate` → `InventoryItem` | Mantener modelo parcial estricto de entrada y respuesta explícita |
| DELETE | `/inventory/items/{item_id}` | Eliminar artículo | ✅ `204 No Content` | No devolver cuerpo; conservar códigos 404/409 documentados |
| POST | `/inventory/lots` | Registrar lote | ✅ `InventoryLotCreate` → `InventoryLot` | Mantener respuesta plana (ID, artículo, lote, expiración y recepción); no devolver el artículo anidado |
| GET | `/inventory/items/{item_id}/lots` | Listar lotes de un artículo | ✅ `list[InventoryLot]` | Proyección plana de lote; devolver `item_id`, no objeto artículo anidado |
| POST | `/inventory/movements` | Registrar movimiento | ✅ `InventoryMovementCreate` → `InventoryMovement` | Mantener DTO separado y respuesta plana sin objeto de lote anidado |
| GET | `/inventory/items/{item_id}/movements` | Historial de movimientos de artículo | ✅ `list[InventoryMovement]` | Proyección compacta con referencia `item_id`/`lot_id`, tipo, cantidad, motivo operativo y fecha; sin objetos relacionados anidados |

## Hallazgos y propuestas por endpoint

### GET `/health` — ❌ no serializado explícitamente

**Hoy:** la función declara `dict[str, str]`, devuelve `{"status": "ok"}` y no declara `response_model`.

**Expone:** el único campo actual es `status`, pero el contrato no tiene un esquema Pydantic que lo restrinja/documente.

**Mejora propuesta:** declarar `HealthResponse` con `status: Literal["ok"]` y usarlo como `response_model` y tipo de retorno. Payload: `{"status":"ok"}`. **Aplicada:** el router devuelve ahora esa respuesta tipada.

### POST `/incidents` — ✅ serializado

**Hoy:** recibe `IncidentCreate` y declara `response_model=Incident`. El esquema de entrada no incluye ID ni timestamps; la salida los incluye junto con los campos de negocio y estado.

**Expone:** `id`, título, descripción operativa, tipo, severidad, canal, estado, área responsable y timestamps. No hay credenciales ni campos de paciente modelados.

**Mejora propuesta:** ninguna urgente de serialización. Conservar esquema de escritura distinto del esquema de respuesta; no devolver directamente una estructura interna del store. No introducir PHI en título o descripción.

### GET `/incidents` — ⚠️ serialización explícita, proyección pesada para listado

**Hoy:** `response_model=list[Incident]`; cada fila contiene la descripción completa, además de todos los campos del detalle.

**Expone:** `id`, título, descripción, tipo, severidad, canal, estado, área responsable, `created_at` y `updated_at` en cada registro.

**Mejora propuesta:** crear `IncidentListItem` con los campos que requiere una fila/resumen (`id`, `title`, `type`, `severity`, `status`, `responsible_area`, `created_at`, `updated_at`); omitir `description` y `channel` del listado si la pantalla no los muestra. Mantener descripción y canal en `GET /incidents/{incident_id}`. Antes de desplegar, comprobar los consumidores reales de incidencias, ya que la UI actual todavía no consulta estas rutas. **Aplicada:** se usa `IncidentListItem`; la respuesta de detalle no se recortó.

### GET `/incidents/summary/open-by-severity` — ❌ diccionario sin modelo

**Hoy:** retorna `dict[str, int]` sin `response_model`; las claves se generan desde el enum de severidad.

**Expone:** contadores para `critical`, `high`, `medium` y `low` (incluye cero cuando no hay casos).

**Mejora propuesta:** respuesta Pydantic estable, por ejemplo `OpenIncidentsSummary` con esos cuatro enteros nombrados, o lista de `{severity, count}` con enum. Preferir campos tipados si el cliente espera una forma fija; no dejar que claves arbitrarias se conviertan en contrato implícito. **Aplicada:** `OpenIncidentsSummary` fija los cuatro contadores del catálogo.

### GET `/incidents/{incident_id}` — ✅ serializado

**Hoy:** `response_model=Incident`.

**Expone:** detalle operativo y timestamps; 404 si el ID no existe.

**Mejora propuesta:** ninguna. Este es el esquema completo; mantenerlo independiente del esquema ligero del listado.

### PATCH `/incidents/{incident_id}` — ✅ entrada/salida separadas

**Hoy:** recibe `IncidentUpdate` y responde con `Incident`.

**Expone:** el objeto de incidencia actualizado completo. `IncidentUpdate` solo acepta campos editables del incidente; no acepta estado, área asignada, ID ni timestamps.

**Mejora propuesta:** ninguna estructural. Mantener el DTO estricto y no reutilizar `Incident` como modelo de escritura.

### PATCH `/incidents/{incident_id}/status` — ✅ contrato explícito

**Hoy:** entrada `IncidentStatusUpdate` (`status`, `changed_by`), salida `Incident`.

**Expone:** estado actual con el resto del detalle; el actor y el evento de cambio se conservan en auditoría, no se agregan como campos arbitrarios al incidente.

**Mejora propuesta:** ninguna. Verificar que el evento siga accesible en la ruta de auditoría y no exponer estructuras internas del store.

### PATCH `/incidents/{incident_id}/responsible-area` — ✅ contrato explícito

**Hoy:** entrada `IncidentAreaUpdate` (`responsible_area`, `changed_by`), salida `Incident`.

**Expone:** estado actualizado del incidente; la trazabilidad se consulta como evento aparte.

**Mejora propuesta:** ninguna. Preservar autor, valor anterior/nuevo y fecha UTC en el historial.

### GET `/incidents/{incident_id}/audit` — ✅ proyección plana

**Hoy:** `response_model=list[IncidentAuditEvent]`.

**Expone:** ID de evento, ID de incidencia, campo, valor anterior/nuevo, actor y fecha de cambio. No anida el incidente completo.

**Mejora propuesta:** ninguna en serialización. Conservar la lectura plana y la inmutabilidad; un ID de incidencia es suficiente para relacionar el evento.

### POST `/inventory/items` — ✅ serializado y entrada acotada

**Hoy:** `InventoryItemCreate` → `InventoryItem`; el esquema base prohíbe extras (`extra="forbid"`) y valida texto operacional sin PHI.

**Expone:** artículo creado con ID y timestamps. No incluye stock calculado ni colecciones de lotes/movimientos.

**Mejora propuesta:** ninguna inmediata. Mantener separados los campos de escritura de la respuesta enriquecida del listado/detalle.

### GET `/inventory/items` — ⚠️ esquema de lectura de lista puede adelgazar

**Hoy:** `response_model=list[InventoryItemView]`, que amplía el artículo con `available_stock` y `below_reorder`.

**Expone:** identidad y datos del artículo, fechas, stock derivado y estado de reorden.

**Mejora propuesta:** formalizar `InventoryItemListItem` como proyección específica. La UI (`uis/backoffice/inventory.js`) consume ID, nombre, clínica, categoría, stock disponible, punto de reorden y `below_reorder`; solo mantener el resto de campos de lista cuando un consumidor real los use. No incluir lotes/movimientos anidados; cada relación tiene su endpoint. **Aplicada:** la lista conserva los campos de la tabla y omite país, unidad y timestamps; el detalle mantiene `InventoryItemView` completo.

### GET `/inventory/items/{item_id}` — ✅ detalle calculado explícito

**Hoy:** `response_model=InventoryItemView`.

**Expone:** campos del artículo, `available_stock` y `below_reorder` calculados por el servicio.

**Mejora propuesta:** mantener este esquema como respuesta de detalle, separado del contrato de lista. No anidar lotes ni movimientos: el cliente los carga con rutas específicas.

### PATCH `/inventory/items/{item_id}` — ✅ modelo de entrada separado

**Hoy:** `InventoryItemUpdate` → `InventoryItem`; campos opcionales con límites y prohibición de extras.

**Expone:** datos actualizados del artículo y timestamps, sin stock calculado.

**Mejora propuesta:** ninguna inmediata. Si la pantalla necesita stock tras actualizar, se puede devolver `InventoryItemView`, pero no hacerlo sin requerimiento de cliente.

### DELETE `/inventory/items/{item_id}` — ✅ respuesta sin cuerpo

**Hoy:** `204 No Content` con `Response`; no declara `response_model` por diseño y no devuelve documento alguno.

**Expone:** ningún campo; errores 404/409 llevan el formato estándar de error de FastAPI.

**Mejora propuesta:** ninguna. Un 204 no necesita serializer de cuerpo.

### POST `/inventory/lots` — ✅ entrada/salida tipadas y relación plana

**Hoy:** `InventoryLotCreate` → `InventoryLot`.

**Expone:** lote con `id`, `item_id`, código, fecha de caducidad y recepción. La relación al artículo es un ID y no un objeto anidado.

**Mejora propuesta:** ninguna. Mantener payload plano; el cliente ya consume los lotes por una ruta dedicada.

### GET `/inventory/items/{item_id}/lots` — ✅ lista tipada

**Hoy:** `response_model=list[InventoryLot]`.

**Expone:** campos de lote, incluyendo `item_id`; no expande el artículo relacionado.

**Mejora propuesta:** ninguna urgente. Puede añadirse un nombre de esquema de lectura (`InventoryLotRead`) si lectura y escritura dejan de compartir exactamente los mismos campos; el listado actual necesita los datos de lote para desplegar opciones de lotes.

### POST `/inventory/movements` — ✅ escritura restringida y respuesta tipada

**Hoy:** `InventoryMovementCreate` → `InventoryMovement`; el modelo de entrada prohíbe campos extras y valida cantidades, motivo y texto sin PHI.

**Expone:** movimiento con IDs de artículo/lote, tipo, cantidad, motivo y fecha; relaciones planas.

**Mejora propuesta:** ninguna urgente. Mantener referencias por ID, no serializar artículos o lotes completos junto con el movimiento.

### GET `/inventory/items/{item_id}/movements` — ✅ lista explícita y plana

**Hoy:** `response_model=list[InventoryMovement]`.

**Expone:** IDs de artículo/lote, tipo, cantidad, razón operativa, ID y fecha; no objetos relacionados.

**Mejora propuesta:** ninguna urgente. Mantener la relación plana y el motivo validado sin PHI. Si crece el tráfico, añadir paginación como mejora separada; no cambiar el esquema sin evidencia de necesidad.

## Prioridad de implementación

1. Añadir esquema de respuesta `HealthResponse`.
2. Añadir esquema de resumen de severidad y declararlo con `response_model`.
3. Añadir proyecciones de lista específicas (`IncidentListItem` y `InventoryItemListItem`) solo después de confirmar el conjunto de campos de consumidores; conservar los campos requeridos por la UI de inventario.
4. Agregar tests que verifiquen presencia/ausencia de claves, los códigos 204, el esquema de health/resumen y que las listas no incluyan detalle innecesario.

## Resultado después de la implementación

- `GET /health`: usa `HealthResponse` con `status: Literal["ok"]`.
- `GET /incidents/summary/open-by-severity`: usa `OpenIncidentsSummary` con los cuatro niveles de severidad fijos.
- `GET /incidents`: usa `IncidentListItem`, omite `description` y `channel`; `GET /incidents/{incident_id}` mantiene el detalle completo.
- `GET /inventory/items`: usa `InventoryItemListItem`, conserva los campos requeridos para la tabla (`id`, clínica, nombre, categoría, punto de reorden, stock disponible y flag de reorden) y omite país/unidad/timestamps del listado; el detalle sigue usando `InventoryItemView`.
- Los demás endpoints mantienen sus modelos de entrada/salida existentes porque ya son explícitos, usan relaciones planas o responden intencionalmente sin cuerpo (`204`).
- No se añadieron endpoints de autenticación/usuario: el README de la API indica que autenticación está fuera del alcance actual.
- Hay pruebas de contrato que verifican la lista compacta, la permanencia de descripción/country en los detalles y las respuestas tipadas de health/resumen.

## Nota de implementación

Este documento registra tanto el estado previo como el objetivo. Los cambios de código deben actualizar el estado “Hoy” o la tabla de inventario cuando se implementen; una propuesta documentada no se debe marcar como completada hasta que exista el esquema, la ruta y su prueba.
