# GDB-04 — Guía para implementar la planificación en NestJS

La base ya guarda ventanas, turnos, duración y resultados. El backend aún no tiene un caso de uso de planificación: `backend/src/modules/assignments/infrastructure/postgres-assignment-reservation.ts` solo reserva capacidad y no valida calendario ni geocódigo. Implementa el comportamiento en servicios de aplicación y funciones de dominio, no en controllers ni triggers SQL adicionales.

## 1. Primer bloque: cálculo puro de una parada

Crea `backend/src/modules/route-planning/domain/schedule-stop.ts`. Recibe instantes UTC como `Date`, duración positiva en segundos, deadline opcional y una lista de ventanas del paquete. Para cada ventana:

```text
serviceStart = max(arrivalAt, window.startAt)
serviceEnd = serviceStart + serviceDurationSeconds
válida si serviceStart < window.endAt
       y serviceEnd <= window.endAt
       y (deadline es null o serviceEnd <= deadline)
```

Escoge determinísticamente la ventana válida con menor `serviceEnd`; desempata por `window.id`. Devuelve `arrivalAt`, `serviceStartAt`, `serviceEndAt` y `deliveryWindowId`, o un resultado pendiente con código `NO_WINDOW`, `MISSING_DURATION` o `DEADLINE_EXCEEDED`. La llegada puede preceder al inicio de ventana; eso representa espera. No conviertas fechas a la zona horaria del servidor para comparar instantes. La zona IANA sirve para interpretar una fecha local de servicio y para presentarla al usuario.

Pruebas unitarias con fechas fijas: llegada temprana con espera, llegada tarde rechazada, servicio que empieza dentro pero termina fuera rechazado, ventanas en dos días, deadline nullable y deadline anterior al fin. La prueba debe verificar también el desempate determinista.

## 2. Integrar ruta y turnos

Crea un servicio de dominio para validar que `plannedStartAt` y el regreso `plannedEndAt` caben completamente en un VehicleShift y un CourierShift del mismo tenant y recurso. Los turnos son intervalos semiabiertos `[startAt, endAt)`; un regreso exactamente en `endAt` es válido. Si falta cualquiera de los dos, devuelve `NO_VEHICLE_SHIFT` o `NO_COURIER_SHIFT`. Los stops se calculan secuencialmente: salida, tiempo de viaje, llegada, espera, servicio, siguiente tramo y regreso al depósito. Usa duración vial cuando exista; Haversine por sí solo no proporciona tiempo de viaje.

## 3. Caso de uso transaccional

En `route-planning/application`, deriva `tenantId` de identidad autenticada. Carga paquetes con geocódigo confirmado, ventanas y duración; vehículos, mensajeros, turnos y depósito del mismo tenant. Valida horizonte, zona IANA, algoritmo/versión y dataset/versión antes de crear rutas. Por cada paquete, evalúa geocódigo, ventana, turno y capacidad en ese orden. Una imposibilidad de negocio genera `PlanningPackageResult(PENDING, reasonCode, evidence)` y mantiene el paquete pendiente; no lanza un error técnico ni detiene los demás paquetes.

Para asignados, guarda ruta, parada con ventana elegida y snapshot de geocodificación, Assignment y `PlanningPackageResult(ASSIGNED)` dentro de la misma transacción. Recalcula peso y volumen activos después de cada inserción. La primitiva `PostgresAssignmentReservation` ya usa transacciones SERIALIZABLE, locks y reintentos para capacidad, pero aún no coordina la escritura del resultado, stop y estado. No la llames fuera de una operación atómica que pueda dejar esas tablas incoherentes. Publica eventos después de confirmar la transacción o mediante outbox.

## 4. Orden de verificación

Primero prueba `schedule-stop.ts` sin base. Luego prueba turnos y capacidad con un dataset pequeño. Finalmente haz una prueba de integración con dos tenants, un paquete asignado y otro pendiente. Comprueba que el resultado pendiente tenga motivo, que la parada asignada caiga completamente en su ventana, que el regreso esté en ambos turnos, que la capacidad siga válida y que un recurso de Tenant B no se pueda usar para Tenant A.

La base rechaza una parada con ventana cuyo servicio quede fuera y un resultado pendiente sin motivo. El backend debe decidir qué ventana usar, calcular llegada/regreso, aplicar deadline y garantizar que la ventana elegida y el geocódigo pertenecen al paquete asignado.
