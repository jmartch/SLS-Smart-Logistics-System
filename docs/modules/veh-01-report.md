# VEH-01 — Vehículos, mensajeros, disponibilidad y capacidad

Estado: `EN PROGRESO`. `POST /vehicles` y `POST /couriers` implementados y verificados; listados, capacidad, estados y turnos pendientes.

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
