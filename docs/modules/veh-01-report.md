# VEH-01 — Vehículos, mensajeros, disponibilidad y capacidad

Estado: `IN_PROGRESS`. Administración de vehículos y mensajeros implementada para el demo; depósitos y turnos pendientes. Las secciones fechadas conservan la evidencia histórica; el cuarto corte describe el estado más reciente.

Plan canónico: [VEH-01](../plans/veh-01.md). Coordinación: [puntos 1 y 2](../plans/mvp-puntos-1-2.md).

## Alcance verificado

Inspección estática de `develop`, commit `8cdb2c4`, el 2026-09-29; documentación preparada hasta el 2026-09-30. Árbol limpio al inicio. Existen Vehicle, Courier, VehicleShift y CourierShift, estados e índices. Courier requiere User del mismo tenant; no es una segunda cuenta. Hay reserva transaccional y tests de asignación, pero no módulos operativos vehicles/couriers. ADR-002 advierte que editar capacidades debe coordinarse con bloqueos/recálculo de la reserva: una simple lectura seguida de UPDATE introduce una carrera.

## Implementación por puntos

### Punto 0 — Auditoría y planificación

- Objetivo: establecer brechas y entrega asignable sin rehacer código existente.
- Decisión: Vivian. Contratos por concretar en el paso 1.
- Archivos: fuentes enumeradas en el plan; nuevos plan e informe de este módulo.
- Resultado: aceptación, dependencias, rutas esperadas y lotes mecánicos documentados.
- Evidencia: lectura de esquema, código, documentación y estado Git.
- Pendiente: todos los pasos funcionales del plan; no hay pruebas nuevas ejecutadas.

## Decisiones técnicas

Reparto actualizado (2026-09-30): VEH-01 permanece con Vivian junto con PKG-01. ZONE-01 queda a cargo de Humberto; no forma parte del encargo de ella. Este cambio no modifica el alcance funcional de vehículos/mensajeros ni acredita avances de implementación.

DATA-01; AUTH-01/TENANT-01 para acceso; servicio público de usuarios de AUTH para elegibilidad de mensajero; ADR-002 y reserva existente para concurrencia. Las decisiones pendientes de DTOs, políticas y migraciones están enumeradas por paso. No se consideran aprobadas ni implementadas por aparecer en este documento.

## Verificación reproducible

Seguir los comandos de Compose y preparación de integración indicados en el plan. Los runners de este módulo aún deben implementarse; no se atribuyen resultados históricos como ejecución actual.

Resultados observados: revisión documental únicamente. Build, pruebas y validación funcional pendientes.

## Estado en el entorno compartido

No se consultaron ni modificaron datos, roles ni migraciones de la base compartida. No se inspeccionó trabajo privado del compañero ni otras ramas.

## Trabajo fuera de alcance

Crear cuentas/roles de usuario (AUTH-01), clustering, creación de rutas, modificar Chain o reescribir reserva GDB-01, GPS y calendario visual avanzado. No borrar recursos con historial.

## Avance de implementación — `POST /vehicles` y `POST /couriers` (2026-10-11)

Rama `feature/package-vehicle-management` (creada desde `origin/develop` con commits `649f34d..6994cb0` y merge `0e95e61`).
El módulo permanece en estado `EN PROGRESO` (`IN_PROGRESS`): únicamente están terminados los endpoints de
registro (`POST /vehicles` y `POST /couriers`); listados, edición de capacidad, estados y turnos siguen
pendientes.

- Alcance: solo registro. No incluye listado, edición de capacidad, estados ni turnos.
- Autenticación y autorización (`AUTH-01`): ambos endpoints están protegidos con `AuthGuard` y
  `PermissionsGuard` (`@RequirePermission('MANAGE_TENANT')`). `VehiclesModule` y `CouriersModule` importan
  `AuthModule`. El `tenantId` se obtiene de la sesión autenticada (`@CurrentContext()`); se eliminó el uso
  de `x-tenant-id` como mecanismo de autorización.
- `POST /vehicles`: `plate` (se normaliza sin espacios ni guiones, en mayúsculas, 5 a 8 caracteres
  alfanuméricos), `maxWeightKg` (hasta 3 decimales) y `maxVolumeM3` (hasta 6 decimales), mayores que cero
  y dentro de la precisión de las columnas. Nace `ACTIVE`. Responde `401` (`SESSION_EXPIRED`) sin sesión,
  `403` (`PERMISSION_DENIED`) sin `MANAGE_TENANT` y `409 VEHICLE_PLATE_CONFLICT` si la placa ya existe en
  el tenant.
- `POST /couriers`: `userId` de un `User` activo del mismo tenant; no se crea ninguna cuenta. Responde
  `401` sin sesión, `403` sin `MANAGE_TENANT`, `404 COURIER_USER_NOT_FOUND` (inexistente o de otro tenant),
  `409 COURIER_USER_NOT_ELIGIBLE` (usuario inactivo o suspendido) y `409 COURIER_USER_ALREADY_LINKED`.
- Archivos nuevos: `backend/src/modules/vehicles/` y `backend/src/modules/couriers/`, cada uno con
  `domain/`, `application/` (puerto incluido), `infrastructure/`, `presentation/` y `test/`. Modificado:
  `backend/src/app.module.ts` (import y registro de los dos módulos).
- Decisiones: la elegibilidad del usuario vive en el dominio; el adaptador solo lee `id` y `status` del
  usuario dentro de la transacción con RLS, nunca `passwordHash` ni correo.
- Pruebas unitarias: suites de vehículos y repartidores actualizadas para verificar guardas y permisos
  (`AuthGuard`, `PermissionsGuard`, `MANAGE_TENANT`). Regresión unitaria completa verificada mediante
  Docker Compose (`142 suites / 1234 pruebas` en verde).
- Integración `registration-01`: `1 suite y 36 pruebas` pasaron en una base desechable; usa
  `configureApp(app)`, tenants con `slug` y sesiones autenticadas por cookie `sls_session`. Cubre `401` sin
  sesión, `403` sin `MANAGE_TENANT`, misma placa en dos tenants, usuario de otro tenant, usuario suspendido
  y doble vinculación.
- Límites: no se leen ni modifican la reserva de asignaciones, la Chain ni los turnos. La política de
  placa (5 a 8 caracteres alfanuméricos) es una propuesta del módulo.
- Pendiente: listados, capacidad, estado, turnos e integración con las pantallas del frontend.

## Cierre

Implementación parcial (`EN PROGRESO`, solo endpoints de registro `POST /vehicles` y `POST /couriers` terminados); el trabajo restante está en los pendientes de cada avance. Actualizar una sección por cada paso completado, registrando comandos, resultados, límites y commit; enlazar siempre el plan.

## Auditoría para Bloque 8 — administración operativa (2026-10-12)

Se confirmó en `feature/mvp-demo-flow` que las altas y sus permisos continúan implementados. No existen endpoints administrativos de listado, detalle, edición, estado, depósitos o turnos; `AdminVehiclesPage` sigue siendo un stub. El workspace de planificación presente en el árbol de trabajo lee recursos operativos, pero no reemplaza contratos administrativos ni autoriza mutaciones.

Se creó el [contrato administrativo propuesto](veh-01-contract.md) para revisión. El siguiente corte recomendado es `GET /api/v1/vehicles`: listado tenant-scoped, paginado y autorizado, con capacidad ocupada/disponible derivada y pruebas A/B. No se modificó lógica de negocio ni se ejecutaron pruebas en esta auditoría documental. Los cambios de planificación existentes permanecen separados y sin commit.

## Primer corte — listado administrativo de vehículos (2026-10-12)

Tras la aprobación del usuario se implementó `GET /api/v1/vehicles` con `MANAGE_TENANT`, tenant derivado de sesión, filtros por estado/búsqueda, paginación y orden estable. `ListVehiclesUseCase` depende de `VehicleQueryPort`, implementado por `PrismaVehicleQueryAdapter`; el controlador solo valida parámetros y mapea contexto. Capacidad ocupada y restante se calculan con precisión decimal desde asignaciones `ACTIVE`, bajo una lectura transaccional `RepeatableRead`.

Pruebas ejecutadas mediante Compose: 7 suites/72 pruebas unitarias de vehículos aprobadas; runner `make integration-test TEST=registration-01` con build backend y 40 pruebas HTTP aprobados. Los nuevos casos demuestran 401/403, aislamiento A/B aunque se falsifique tenant por cabecera/query, paginación, validación de filtros y cálculo exacto de carga excluyendo historia `ENDED` en PostgreSQL real. El runner creó y eliminó una base desechable en el servidor dedicado.

No se requieren migraciones ni variables adicionales. El endpoint está implementado, probado y documentado; aún sin commit. Quedan pendientes frontend administrativo, detalle/edición/estado de vehículos, administración de mensajeros, depósitos y turnos. El siguiente corte conecta el listado y alta existentes a `AdminVehiclesPage`.

## Segundo corte — listado y registro frontend de vehículos (2026-10-12)

Se reemplazó el stub de `AdminVehiclesPage` por la pantalla que consume `GET /vehicles` y `POST /vehicles`. Incluye búsqueda por placa, filtro de estado, paginación, capacidades máxima/asignada/disponible, formulario de alta, mensajes por campo, confirmación y refresco del listado. Incluye carga, vacío, reintento y permiso denegado. El cliente conserva decimales como strings, valida respuestas y utiliza sesión sin cabeceras tenant/usuario.

Verificación mediante Compose: `npm test` frontend, 7 archivos/43 pruebas aprobadas; build aprobado; lint 0 errores y 15 advertencias existentes fuera de la nueva pantalla. Los 11 nuevos casos comprueban contrato, filtros codificados, cookies, capacidad precisa, páginas vacías, respuestas malformadas y conflictos/permisos. En navegador con sesión demo se verificó `BAQ101`, búsqueda sin resultados y error por placa duplicada; no se crearon nuevos vehículos en la base compartida.

El avance permanece local, sin commit. Siguiente corte: detalle y edición/cambio de estado de vehículos con protección de reservas y auditoría transaccional.

## Tercer corte — detalle, edición y estado de vehículos (2026-10-13)

Se publicaron `GET /vehicles/:vehicleId`, `PATCH /vehicles/:vehicleId` y `PATCH /vehicles/:vehicleId/status`, protegidos con `MANAGE_TENANT`. El detalle incluye carga, capacidad restante y compromiso. La edición parcial normaliza placa/capacidades y rechaza campos desconocidos. Las políticas puras comparan unidades exactas con `bigint` e impiden capacidades inferiores a carga activa e inactivación/mantenimiento ante rutas comprometidas o carga activa.

`ManageVehicleService` utiliza un puerto transaccional sin dependencias de NestJS/Prisma. `PrismaVehicleManagementAdapter` aplica RLS, filtros tenant, bloqueo de vehículo y aislamiento serializable con tres intentos acotados. Actualización y `AuditLog` (`VEHICLE_UPDATED`/`VEHICLE_STATUS_UPDATED`, actor, correlación y valores anterior/nuevo) se confirman juntos. Los errores nuevos siguen `sls-error-standardization`: códigos estables, dominio en inglés, campo de validación y 404 neutral.

El frontend añade panel de detalle/edición y cambio de estado en la pantalla de vehículos. Envía solo campos modificados, muestra conflictos por código y deshabilita estados incompatibles según el detalle; el backend valida nuevamente al escribir. Sin migraciones ni variables nuevas.

Verificación mediante Compose: 8 suites/96 pruebas unitarias de vehículos; build backend y runner `registration-01` con 49 pruebas HTTP aprobadas. E2E nuevos: 401/403, lectura/mutación A/B neutral, detalle, normalización, placa duplicada, capacidad mínima, estados comprometidos, auditoría de actor/correlación, rollback ante fallo de auditoría y carrera reserva/reducción sin sobrecarga. La primera ejecución tuvo tres expectativas de pruebas incompatibles con la forma directa de error existente; se corrigieron y la suite completa pasó. Base desechable eliminada por runner.

Frontend: 7 archivos/48 pruebas aprobadas, build y lint 0 errores (15 advertencias previas). Navegador demo: detalle real de `BAQ101`, opciones de inactivación/mantenimiento deshabilitadas y rechazo de reducción a 1 kg frente a 9,700 kg asignados. No se aplicaron cambios exitosos sobre datos compartidos en esta comprobación visual. Avance documentado y sin commit; siguiente corte: mensajeros.

## Cuarto corte — administración de mensajeros (2026-10-13)

Implementados `GET /couriers`, `GET /couriers/eligible-users`, `GET /couriers/:courierId` y `PATCH /couriers/:courierId/status`, con `MANAGE_TENANT`, identidad de sesión, paginación/búsqueda y filtros tenant. `POST /couriers` conserva su contrato HTTP, pero ahora elegibilidad, alta y auditoría comparten transacción. Los casos de uso/framework-free controlan compromiso y elegibilidad; la persistencia aplica RLS, filtros, bloqueo de mensajero y usuario, aislamiento serializable y tres intentos acotados. Consultas en `RepeatableRead`.

`UsersModule` publica un lector transaccional de directorio, limitado a ID, correo y estado. Couriers no consulta directamente la tabla de usuarios; el directorio no lee hashes, roles ni sesiones. Los candidatos son cuentas activas todavía sin mensajero (incluido uno inactivo); no se asignan permisos de entrega. No se cambia/desvincula al usuario de un mensajero con historia.

La inactivación requiere cero asignaciones activas y ninguna ruta sin cerrar. `DRAFT`, `PLANNING`, `PLANNED`, `READY`, `IN_PROGRESS` e `INTERRUPTED` comprometen; `COMPLETED`, `CANCELLED` y `PLANNING_FAILED` no, salvo asignaciones activas restantes. Reactivar exige cuenta activa. Estado idéntico es no-op sin auditoría duplicada. Los errores nuevos siguen `sls-error-standardization`: códigos estables, mensajes de dominio en inglés, campos y 404 neutral. Alta/estado generan `COURIER_REGISTERED`/`COURIER_STATUS_UPDATED` con actor/correlación y antes/después mínimos; el fallo de auditoría revierte la escritura.

La pantalla `/app/admin/mensajeros` se añadió al shell con permisos: listado, filtros, candidatos buscables y paginados, vinculación, detalle, estado, carga/vacío/error/reintento y confirmaciones. La inactivación comprometida se deshabilita en UI y se verifica nuevamente en backend. Al abrir detalle recibe foco accesible; enlaces a rutas dependen de sus permisos. No se requieren migraciones ni variables nuevas.

Verificación ejecutada mediante Compose: 6 suites/57 pruebas de mensajeros; 4 pruebas nuevas del lector de usuarios; `make integration-test TEST=registration-01`, build backend y 63 E2E aprobados (14 nuevos casos de administración: A/B, 401/403, parámetros, candidatos mínimos, compromiso, no-op, reactivación, auditoría, rollback de alta/estado y vínculo concurrente único). El runner creó y eliminó su base desechable en PostGIS dedicado. Frontend: 8 archivos/59 pruebas, build aprobado y lint con 0 errores/15 advertencias previas; sin advertencias en los nuevos archivos.

Navegador demo: lista real de `mensajero.ruta@demo-baq.co`, cuenta activa, 3 asignaciones activas, 1 ruta sin cerrar, inactivación deshabilitada y candidatos reales. No se vincularon ni cambiaron estados en la base compartida para probar la UI. Se resolvió una instancia antigua ocupando el puerto mediante reinicio únicamente del servicio API, sin tocar PostgreSQL.

Regresión unitaria completa: `docker compose exec backend npm test -- --runInBand`, 152 suites/1332 pruebas aprobadas. Incluye las pruebas automáticas de fronteras de arquitectura de Couriers y Users. La revisión ESLint enfocada detectó ajustes mecánicos de tipos, mocks y formato; se corrigieron y se repitieron 7 suites/61 pruebas de mensajeros/directorio, todas aprobadas. ESLint enfocado backend aprobado, sin autocorrección global. Lint frontend global sin errores y lint enfocado de la pantalla nueva sin advertencias. También se verificó búsqueda sin resultados en navegador y se restauró el listado real.

Límites: turnos/próximo turno aún no incluidos; no se implementó el portal de entregas. La carrera específica contra planificación completa requiere una prueba integrada posterior; los bloqueos de Courier son compatibles con los existentes del planificador, sin afirmar que esa carrera ya se ejecutó. El avance permanece local, documentado y sin commit; siguiente corte: depósitos, luego turnos.
