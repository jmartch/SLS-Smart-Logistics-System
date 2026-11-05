# VEH-01 — Contrato administrativo propuesto para el demo

> Actualización 2026-10-13: [ADR 010](../adr/010-automatic-fleet-availability.md) elimina los turnos como condición de disponibilidad y pospone su administración. Los requisitos de turnos descritos abajo corresponden a la propuesta anterior. La planificación actual selecciona recursos activos y libres automáticamente.

Estado: `IN_PROGRESS`. Contrato aprobado por el usuario el 2026-10-12; administración de vehículos y mensajeros implementada y verificada para el demo. Depósitos y turnos permanecen pendientes.

Plan canónico: [VEH-01](../plans/veh-01.md).

## Primer corte implementado — listado de vehículos

`GET /api/v1/vehicles?page=1&pageSize=20&status=ACTIVE&search=ABC` requiere sesión de tenant con `MANAGE_TENANT`. `tenantId` proviene exclusivamente de esa sesión. Responde `{ items, total, page, pageSize }`, con orden estable por placa e ID. `pageSize` admite 1–100, `page` 1–1000000 y `search` un máximo de 100 caracteres; `status` admite `ACTIVE`, `INACTIVE` o `MAINTENANCE`. Los parámetros inválidos producen `400 VALIDATION_ERROR` con `fields`.

Cada elemento incluye `id`, `tenantId`, `plate`, `status`, `maxWeightKg`, `maxVolumeM3`, `assignedWeightKg`, `assignedVolumeM3`, `remainingWeightKg` y `remainingVolumeM3`. Pesos y volúmenes son strings con 3 y 6 decimales respectivamente. Las asignaciones históricas `ENDED`/`CANCELLED` no consumen capacidad. Total, página y carga se leen en una transacción `RepeatableRead`; una página vacía conserva el total filtrado.

Este primer corte no incluye próximo turno, ruta activa ni edición. No requiere migración ni variables nuevas.

## Segundo corte implementado — pantalla de vehículos

`/app/admin/vehiculos` consume `GET /vehicles` y `POST /vehicles` con sesión. Permite registrar placa, peso máximo en kg y volumen máximo en m³, buscar por placa, filtrar estado y paginar (10, 20 o 50 por página). Presenta capacidad máxima, asignada y disponible con los decimales recibidos de la API. Tras registrar refresca la primera página sin filtros; la respuesta de error conserva los campos del formulario y muestra errores por campo.

La pantalla contempla carga, vacío, error con reintento, acceso denegado y confirmación de alta. Las respuestas antiguas de consultas se descartan al cambiar filtros o desmontar la pantalla. El cliente valida el contrato de respuesta y utiliza cookies sin cabeceras de identidad.

Verificación: 7 archivos/43 pruebas frontend, build aprobado y lint con 0 errores. Comprobado en navegador con sesión demo: carga real de `BAQ101`, búsqueda vacía y conflicto por placa duplicada. El alta exitosa HTTP se verificó en el primer corte mediante base desechable; no se crearon nuevos vehículos en la base compartida durante esta comprobación visual.

## Alcance del corte

### Tercer corte implementado — detalle, edición y estado (2026-10-13)

`GET /api/v1/vehicles/:vehicleId`, `PATCH /api/v1/vehicles/:vehicleId` y `PATCH /api/v1/vehicles/:vehicleId/status` requieren `MANAGE_TENANT`. El detalle devuelve capacidad ocupada/disponible e `isCommitted`. La edición admite un subconjunto no vacío de `plate`, `maxWeightKg` y `maxVolumeM3`; estado se cambia exclusivamente mediante `{ status }` en su endpoint. Los campos desconocidos se rechazan; IDs ajenos o inexistentes producen el mismo `404 VEHICLE_NOT_FOUND`.

Las capacidades se comparan en gramos y cm³ usando enteros exactos en dominio. Se admite igualdad con carga activa; valores menores producen `409 VEHICLE_CAPACITY_BELOW_LOAD` con `field`. `INACTIVE`/`MAINTENANCE` se rechazan con `409 VEHICLE_COMMITTED` si existe carga activa o una ruta cuyo estado no sea `COMPLETED`, `CANCELLED` o `PLANNING_FAILED`. La reactivación a `ACTIVE` es admisible.

Cada edición/cambio de estado se ejecuta en una transacción `Serializable` con bloqueo `FOR UPDATE` del vehículo, compatible con la reserva existente. El servicio decide la política; el adaptador lee snapshots y persiste. Se reintentan hasta 3 veces conflictos de serialización/deadlock; agotarlos produce `409 VEHICLE_CONCURRENCY_CONFLICT`. `VEHICLE_UPDATED` y `VEHICLE_STATUS_UPDATED` se guardan en `AuditLog` dentro de la misma transacción, con tenant, actor, correlación y valores anterior/nuevo. Un fallo de auditoría revierte el cambio.

La pantalla ofrece “Ver / editar”, formulario de campos modificados y cambio de estado, con mensajes de conflicto. Los controles de inactivación/mantenimiento se deshabilitan cuando el detalle indica compromiso; el backend vuelve a comprobarlo bajo bloqueo. No se requiere migración ni variables nuevas. Turnos aún no se incluyen en este detalle.

Verificación del corte: 8 suites/96 pruebas unitarias de vehículos; build backend; 49 pruebas E2E `registration-01` en servidor dedicado, incluida carrera real contra reserva y rollback de auditoría; frontend 7 archivos/48 pruebas, build y lint 0 errores. En navegador demo: detalle de `BAQ101`, estados incompatibles deshabilitados y rechazo de capacidad inferior a carga. Sin commit.

La administración operativa del tenant cubre vehículos, mensajeros, depósitos y turnos. No incluye GPS, borrado de recursos con historia, calendario visual avanzado ni creación de cuentas de usuario.

La identidad y el `tenantId` siempre provienen de la sesión. Todas las mutaciones requieren `MANAGE_TENANT`; `COORDINATE_ROUTES` continúa consumiendo únicamente el workspace de planificación y no concede administración.

## APIs propuestas

### Vehículos

| Método | Ruta | Resultado |
| --- | --- | --- |
| `GET` | `/api/v1/vehicles` | Lista tenant-scoped con capacidad máxima, ocupada y disponible, estado y próximo turno |
| `GET` | `/api/v1/vehicles/:vehicleId` | Detalle, turnos y ocupación activa |
| `POST` | `/api/v1/vehicles` | Alta existente |
| `PATCH` | `/api/v1/vehicles/:vehicleId` | Edita placa y capacidades bajo control transaccional |
| `PATCH` | `/api/v1/vehicles/:vehicleId/status` | Cambia entre `ACTIVE`, `INACTIVE` y `MAINTENANCE` |

Una reducción de capacidad se rechaza si queda por debajo de la carga activa. `INACTIVE` o `MAINTENANCE` se rechaza cuando el vehículo está comprometido por una ruta no cerrada. No se elimina físicamente un vehículo.

### Mensajeros

#### Cuarto corte implementado (2026-10-13)

`GET /couriers`, `GET /couriers/eligible-users`, `GET /couriers/:courierId`, `POST /couriers` y `PATCH /couriers/:courierId/status` requieren sesión con `MANAGE_TENANT`. El directorio acotado no exige `MANAGE_EMPLOYEES`, no crea cuentas ni asigna roles. La vinculación conserva el criterio existente: usuario `ACTIVE` del mismo tenant y vínculo único.

Listado: `page` 1–1000000, `pageSize` 1–100, `search` por correo (máximo 100 caracteres tras trim) y `status` `ACTIVE`/`INACTIVE`. Respuesta `{ items, total, page, pageSize }`, orden estable por `userId`/ID. Cada mensajero incluye `id`, `tenantId`, `userId`, `email`, `status`, `userStatus`, `activeAssignmentCount`, `activeRouteIds` e `isCommitted`. El detalle usa la misma proyección. Candidatos: paginación y búsqueda, orden por correo/ID, solo `{ id, email, status }` de cuentas activas sin vínculo, incluidos vínculos inactivos al excluir usuarios ya vinculados. `status` no filtra candidatos: siempre son cuentas activas.

`PATCH .../status` acepta exclusivamente `{ status: 'ACTIVE' | 'INACTIVE' }`. No permite cambiar usuario/tenant ni borrar historia. La inactivación se rechaza si hay asignaciones activas o rutas distintas de `COMPLETED`, `CANCELLED` y `PLANNING_FAILED`; la reactivación requiere cuenta activa. Un estado idéntico es no-op, sin auditoría duplicada. IDs ajenos o inexistentes reciben el mismo `404 COURIER_NOT_FOUND`; validaciones usan `400 VALIDATION_ERROR`, conflictos `409 COURIER_COMMITTED`, `COURIER_USER_NOT_ELIGIBLE` o `COURIER_CONCURRENCY_CONFLICT`.

El dominio y los casos de uso deciden elegibilidad/compromiso. La persistencia comparte una transacción `Serializable`, RLS y filtros tenant con el lector público de `UsersModule`; bloquea `Courier FOR UPDATE` y usuario `FOR SHARE`, con hasta tres intentos para serialización/deadlock. Lecturas usan `RepeatableRead`. Alta/estado guardan `COURIER_REGISTERED`/`COURIER_STATUS_UPDATED` en `AuditLog`, con actor, tenant, correlación, usuario vinculado y estado anterior/nuevo; no guardan correo ni credenciales. Un fallo de auditoría revierte tanto el alta como el cambio de estado.

`/app/admin/mensajeros` ofrece listado, búsqueda, filtros, paginación, selección paginada de usuarios elegibles, vinculación, detalle y estado. Contempla carga, vacío, error/reintento, permiso denegado y éxito; descarta respuestas obsoletas y deshabilita operaciones incompatibles según detalle. El backend vuelve a validar al guardar. Los enlaces a rutas solo aparecen con permisos de consulta de rutas. No se implementaron turnos en este corte, ni se cambió el contrato del portal de entregas. Sin migraciones ni variables nuevas.

Verificación: 6 suites/57 pruebas unitarias de mensajeros y pruebas del directorio incluidas en la regresión general; 63 E2E `registration-01` en base desechable con aislamiento/permisos, vínculo concurrente único y rollback real de alta/estado; frontend 8 archivos/59 pruebas, builds aprobados, lint sin errores. Navegador demo: mensajero real con 3 asignaciones, 1 ruta y opción de inactivación deshabilitada. Corte local, sin commit.

#### Objetivo completo (turnos aún pendientes)

| Método | Ruta | Resultado |
| --- | --- | --- |
| `GET` | `/api/v1/couriers` | Lista tenant-scoped con usuario, estado, ocupación y próximo turno |
| `GET` | `/api/v1/couriers/:courierId` | Detalle y turnos |
| `POST` | `/api/v1/couriers` | Vinculación existente con un usuario elegible |
| `PATCH` | `/api/v1/couriers/:courierId/status` | Cambia entre `ACTIVE` e `INACTIVE` |

El correo visible proviene del módulo de usuarios mediante un contrato público acotado; el esquema actual no tiene nombre de usuario. Nunca se leen hashes ni credenciales. No se desvincula ni elimina un mensajero con historia; se inactiva. Un mensajero comprometido por una ruta no cerrada no puede inactivarse.

### Depósitos

| Método | Ruta | Resultado |
| --- | --- | --- |
| `GET` | `/api/v1/depots` | Lista tenant-scoped |
| `GET` | `/api/v1/depots/:depotId` | Detalle con ubicación, zona horaria y horario |
| `POST` | `/api/v1/depots` | Crea depósito |
| `PATCH` | `/api/v1/depots/:depotId` | Edita nombre, coordenadas, zona horaria y horario |

El modelo actual no tiene estado de depósito. Para el demo no se propone borrado ni migración de estado: un depósito referenciado conserva su identidad. Coordenadas, zona horaria IANA y `openingHours` deben validarse antes de persistir.

### Turnos

| Método | Ruta | Resultado |
| --- | --- | --- |
| `GET` | `/api/v1/vehicles/:vehicleId/shifts` | Turnos del vehículo |
| `POST` | `/api/v1/vehicles/:vehicleId/shifts` | Crea turno futuro |
| `PATCH` | `/api/v1/vehicles/:vehicleId/shifts/:shiftId` | Edita un turno futuro no comprometido |
| `GET` | `/api/v1/couriers/:courierId/shifts` | Turnos del mensajero |
| `POST` | `/api/v1/couriers/:courierId/shifts` | Crea turno futuro |
| `PATCH` | `/api/v1/couriers/:courierId/shifts/:shiftId` | Edita un turno futuro no comprometido |

Los intervalos usan ISO 8601 con zona, requieren `startAt < endAt` y no pueden solaparse para el mismo recurso. Para este corte no se propone eliminación: corregir o reemplazar un turno histórico requiere una decisión de auditoría posterior.

## Respuesta mínima de listas

Las listas deben ser paginadas y aceptar búsqueda/estado. Los valores decimales se exponen como strings canónicos para evitar pérdida de precisión. La capacidad disponible se deriva de asignaciones activas; nunca se confía en un valor enviado por el frontend.

Cada recurso debe incluir indicadores operativos suficientes para la pantalla: `isOccupied`, `activeRouteId`, `nextShiftStartAt` y, para vehículos, `assignedWeightKg`, `assignedVolumeM3`, `remainingWeightKg` y `remainingVolumeM3`.

## Pantalla propuesta

La organización inicialmente propuesta es “Recursos operativos” con pestañas. Los cortes actuales conservan pantallas separadas `/app/admin/vehiculos` y `/app/admin/mensajeros` en la navegación existente; no se reestructuró el shell para el demo. Las capacidades previstas son:

1. Vehículos: listado, alta, edición de capacidad y cambio de estado.
2. Mensajeros: listado, vinculación con usuario elegible y cambio de estado.
3. Depósitos: listado, alta y edición.
4. Turnos: selección de recurso, listado y formulario de intervalo.

Cada pestaña debe cubrir carga, vacío, error, permiso denegado, conflicto y éxito. La API sigue siendo la autoridad para capacidad, disponibilidad, pertenencia y transiciones.

## Errores y auditoría

Las respuestas deben usar códigos estables y campos, como mínimo: recurso no encontrado neutral, placa duplicada, capacidad inferior a ocupación, recurso comprometido, usuario no elegible, intervalo inválido y solapamiento de turno.

Toda mutación administrativa debe registrar `AuditLog` en la misma transacción con tenant, actor, recurso, acción, correlación y metadatos mínimos sin datos sensibles. Las escrituras y la auditoría deben revertirse juntas.

## Aceptación pendiente

- Aislamiento A/B demostrado para lectura y mutación.
- Concurrencia entre reserva y reducción/inactivación sin sobrecarga ni recurso inválido.
- Recurso comprometido no se modifica de forma incompatible.
- Turnos sin solapamiento y con fechas válidas.
- Frontend sin fixtures y con permisos visibles coherentes.
- Build, unitarias y E2E en PostgreSQL/PostGIS desechable.
