# Auditoría de serialización

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

## GET /health
Propósito: verificar disponibilidad del servicio.

Hoy: devuelve `dict[str, str]` sin `response_model`.

Estado: no serializado.

Expone: `status` sin esquema que restrinja el valor.

Mejora: `HealthResponse` con `status: Literal["ok"]` y `response_model` explícito.

## POST /incidents
Propósito: registrar una incidencia.

Hoy: `IncidentCreate` → `Incident` con `response_model`.

Estado: serializado.

Expone: id, título, descripción, tipo, severidad, canal, estado, área responsable, timestamps. Sin credenciales ni PHI.

Mejora: ninguna urgente. Mantener DTO de entrada separado de la respuesta.

## GET /incidents
Propósito: listar y filtrar incidencias.

Hoy: `response_model=list[Incident]`, el mismo esquema del detalle.

Estado: parcialmente serializado.

Expone: descripción completa y canal en cada fila del listado, aunque la tabla solo necesite título, tipo, severidad, estado y área.

Mejora: `IncidentListItem` con id, title, type, severity, status, responsible_area, created_at, updated_at. Sin description ni channel.

## GET /incidents/summary/open-by-severity
Propósito: resumen de incidencias abiertas agrupadas por gravedad.

Hoy: devuelve `dict[str, int]` sin `response_model`.

Estado: no serializado.

Expone: claves dinámicas generadas desde el enum de severidad.

Mejora: `OpenIncidentsSummary` con campos fijos critical, high, medium, low.

## PATCH /incidents/{incident_id}
Propósito: editar campos descriptivos de una incidencia.

Hoy: `IncidentUpdate` → `Incident` con `response_model`. La entrada solo acepta título, descripción y tipo.

Estado: serializado.

Expone: el incidente actualizado completo.

Mejora: ninguna. Mantener DTO de entrada estricto y separado de la respuesta.

## PATCH /incidents/{incident_id}/status
Propósito: cambiar estado de una incidencia y registrar auditoría.

Hoy: `IncidentStatusUpdate` → `Incident` con `response_model`.

Estado: serializado.

Expone: el incidente con el nuevo estado; el evento de auditoría queda en el historial.

Mejora: ninguna. La trazabilidad se consulta por separado en la ruta de auditoría.

## PATCH /incidents/{incident_id}/responsible-area
Propósito: reasignar el área responsable de una incidencia.

Hoy: `IncidentAreaUpdate` → `Incident` con `response_model`.

Estado: serializado.

Expone: el incidente actualizado; valor anterior/nuevo accesible en auditoría.

Mejora: ninguna. Separación correcta entre escritura y trazabilidad.

## GET /incidents/{incident_id}/audit
Propósito: consultar eventos de auditoría de una incidencia.

Hoy: `response_model=list[IncidentAuditEvent]`.

Estado: serializado.

Expone: id de evento, id de incidencia, campo modificado, valor anterior, valor nuevo, actor, fecha.

Mejora: ninguna. Proyección plana sin objetos anidados.

## POST /inventory/items
Propósito: crear un artículo de inventario.

Hoy: `InventoryItemCreate` → `InventoryItem` con `response_model`. Entrada con `extra="forbid"` y validación de texto sin PHI.

Estado: serializado.

Expone: artículo creado con ID y timestamps. Sin stock calculado ni colecciones anidadas.

Mejora: ninguna inmediata. Mantener esquemas de escritura separados de la respuesta de listado.

## GET /inventory/items
Propósito: listar artículos con stock y filtro por debajo del punto de reorden.

Hoy: `response_model=list[InventoryItemView]`, que incluye campos de detalle y fechas en cada fila.

Estado: parcialmente serializado.

Expone: país, unidad y timestamps en cada fila del listado cuando la tabla solo necesita id, clínica, nombre, categoría, stock, punto de reorden y flag de reorden.

Mejora: `InventoryItemListItem` con id, clinic_location, name, category, reorder_point, available_stock, below_reorder. País, unidad y timestamps se quedan en el detalle.

## GET /inventory/items/{item_id}
Propósito: consultar detalle completo de un artículo.

Hoy: `response_model=InventoryItemView` con stock calculado y flag de reorden.

Estado: serializado.

Expone: todos los campos del artículo más stock disponible y estado de reorden. Sin lotes ni movimientos anidados.

Mejora: ninguna. El detalle necesita la información completa; las colecciones tienen rutas propias.

## PATCH /inventory/items/{item_id}
Propósito: actualizar campos de un artículo.

Hoy: `InventoryItemUpdate` → `InventoryItem`. Campos opcionales con límites y `extra="forbid"`.

Estado: serializado.

Expone: artículo actualizado con timestamps, sin stock calculado.

Mejora: ninguna inmediata. Si la pantalla necesita stock tras actualizar, usar `InventoryItemView` como respuesta.

## DELETE /inventory/items/{item_id}
Propósito: eliminar un artículo del inventario.

Hoy: `204 No Content` sin cuerpo.

Estado: serializado (código de estado sin cuerpo).

Expone: ningún campo. Errores 404/409 siguen el formato estándar de FastAPI.

Mejora: ninguna. Un 204 no necesita serializer.

## POST /inventory/lots
Propósito: registrar un lote para un artículo.

Hoy: `InventoryLotCreate` → `InventoryLot` con `response_model`.

Estado: serializado.

Expone: lote con id, item_id, código, fecha de caducidad y fecha de recepción. Relación plana (ID, no objeto anidado).

Mejora: ninguna. Mantener payload plano; el cliente consume lotes por ruta dedicada.

## GET /inventory/items/{item_id}/lots
Propósito: listar lotes de un artículo.

Hoy: `response_model=list[InventoryLot]`.

Estado: serializado.

Expone: campos del lote con item_id; no expande el artículo.

Mejora: ninguna urgente. Añadir esquema de lectura separado si lectura y escritura divergen.

## POST /inventory/movements
Propósito: registrar un movimiento de stock.

Hoy: `InventoryMovementCreate` → `InventoryMovement`. Entrada con validación de cantidad, motivo y texto sin PHI.

Estado: serializado.

Expone: movimiento con IDs de artículo/lote, tipo, cantidad, motivo y fecha. Relaciones planas.

Mejora: ninguna. Mantener referencias por ID sin serializar objetos completos.

## GET /inventory/items/{item_id}/movements
Propósito: consultar historial de movimientos de un artículo.

Hoy: `response_model=list[InventoryMovement]`.

Estado: serializado.

Expone: IDs de artículo y lote, tipo, cantidad, motivo, id de movimiento y fecha.

Mejora: ninguna urgente. Añadir paginación si crece el volumen; no cambiar esquema sin necesidad.

## Resumen de mejoras aplicadas

| Método | Ruta | Estado anterior | Mejora |
|---|---|---|---|
| GET | `/health` | ❌ no serializado | `HealthResponse` con `status: Literal["ok"]` |
| GET | `/incidents` | ⚠️ parcialmente serializado | `IncidentListItem` sin description ni channel |
| GET | `/incidents/summary/open-by-severity` | ❌ no serializado | `OpenIncidentsSummary` con critical, high, medium, low |
| GET | `/inventory/items` | ⚠️ parcialmente serializado | `InventoryItemListItem` con campos de tabla; país, unidad y timestamps solo en detalle |
