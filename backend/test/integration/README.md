# Pruebas de integración reproducibles

Los runners de esta carpeta crean bases de datos con nombres aleatorios, aplican
las migraciones requeridas, ejecutan las suites correspondientes y eliminan las
bases al terminar. `GDB_TEST_ADMIN_URL` debe apuntar a un servidor PostgreSQL
17/PostGIS dedicado a pruebas. La cuenta necesita crear bases y roles e instalar
las extensiones utilizadas por las migraciones.

No usar el servidor compartido de SLS: aunque los runners no aplican migraciones
ni fixtures sobre la base administrativa indicada en la URL, la migración
inicial configura el rol `sls_app` a nivel del servidor.

Desde la raíz del repositorio, el flujo recomendado levanta el servidor temporal
dedicado, selecciona un runner permitido y conserva la ejecución dentro de
Docker Compose:

```bash
make integration-test TEST=geocode-01
make integration-db-down
```

Los valores admitidos actualmente son `gdb-01`, `gdb-05`, `gdb-06`,
`geocode-01`, `assign-01`, `route-01`, `delivery-01`, `route-close-01`,
`rmq-01` y `auth-tenant-01`. Deben ejecutarse secuencialmente porque comparten el servidor y
las migraciones administran los roles `sls_app` y `sls_provisioning` a nivel de instancia. Los comandos
directos documentados abajo siguen disponibles cuando se proporciona un
servidor de pruebas externo.

## GDB-01 — Integración de reservas

Desde la raíz del repositorio, ejecutar la prueba mediante el servicio `backend`
de Docker Compose y pasar `GDB_TEST_ADMIN_URL` al contenedor:

```bash
docker compose exec \
  -e GDB_TEST_ADMIN_URL=postgresql://<usuario>:<clave>@<host-pruebas>:5432/postgres \
  backend npm run test:gdb-01
```

El script crea una única base `sls_gdb01_<uuid>`, aplica en ella todas las migraciones mediante `prisma migrate deploy`, ejecuta la suite Jest en banda y elimina la base al terminar. Nunca aplica migraciones sobre la base indicada en la URL; esta se usa como conexión administrativa. El runner construye internamente `DATABASE_URL` para administración y `RUNTIME_DATABASE_URL` con las credenciales de `sls_app`.

La suite contiene dos variantes de fixture sobre esa misma base:

- `fresh`: aplica todas las migraciones y prueba reservas sin historial previo.
- `history`: aplica todas las migraciones y crea después una asignación `ENDED` para probar la reasignación y conservación del historial.

Ambas variantes ejecutan `PrismaAssignmentReservation` con el cliente generado y el adaptador PostgreSQL bajo `sls_app`. Se comprueban aislamiento RLS, permisos, claves compuestas, reservas concurrentes por peso y volumen, rechazo de duplicados y rollback/historial de reasignación. Los checks SQL esperan SQLSTATE; una parada que no pertenece a la ruta devuelve el resultado contractual `NOT_FOUND` antes de intentar insertar.

La ejecución vigente contiene 14 casos Jest: siete comportamientos para cada variante. `KEEP_GDB01_TEST_DB=1` conserva la base únicamente para diagnóstico deliberado.

La cobertura corresponde a la primitiva de persistencia; no demuestra el flujo completo de Chain, estados, eventos ni planificación.

## GDB-05 — Caminos y geometría PostGIS

Desde la raíz del repositorio:

```bash
docker compose exec \
  -e GDB_TEST_ADMIN_URL=postgresql://<usuario>:<clave>@<host-pruebas>:5432/postgres \
  backend npm run test:gdb-05
```

El runner crea una base `sls_gdb05_<uuid>`, aplica todas las migraciones mediante `prisma migrate deploy` y ejecuta en banda `path-geometry.e2e-spec.ts` y `route-road-path.e2e-spec.ts` sobre la misma base. Ambas suites validan que `DATABASE_URL` y `RUNTIME_DATABASE_URL` apunten exactamente a la base aleatoria creada por el runner.

La ejecución cubre cuatro pruebas: orden e inversión de geometrías, persistencia del recorrido completo, atomicidad cuando no existe camino y aislamiento entre tenants. El runner termina conexiones activas y elimina la base en `finally`, incluso si una migración o suite falla. `KEEP_GDB05_TEST_DB=1` conserva la base únicamente para diagnóstico deliberado.

## GDB-06 — Ciclo de vida de paquetes

Desde la raíz del repositorio:

```bash
docker compose exec \
  -e GDB_TEST_ADMIN_URL=postgresql://<usuario>:<clave>@<host-pruebas>:5432/postgres \
  backend npm run test:gdb-06
```

El runner crea una base `sls_gdb06_<uuid>`, aplica todas las migraciones del
repositorio desde cero, ejecuta `test/package-lifecycle.e2e-spec.ts` y elimina la
base incluso cuando el proceso termina con error. La URL administrativa se usa
para crear y eliminar la base desechable; no se usa como destino de los fixtures.

La suite comprueba cuatro escenarios:

1. Una transición válida actualiza el paquete y escribe historial y outbox en la
   misma transacción.
2. Una transición inválida no produce escrituras.
3. Un fallo al persistir el historial revierte también el cambio de estado y el
   evento.
4. Un tenant diferente no puede consultar ni modificar el paquete.

Esta prueba demuestra el patrón State, el aislamiento por tenant y la atomicidad
local en PostgreSQL. No publica mensajes en RabbitMQ ni demuestra idempotencia,
reintentos o DLQ; esas responsabilidades corresponden a RMQ-01, IDEMP-01 y
DLQ-01.

## GEOCODE-01 — Geocodificación local determinista

Desde la raíz del repositorio:

```bash
make integration-test TEST=geocode-01
make integration-db-down
```

El runner compila el backend, crea una base `sls_geocode01_<uuid>`, aplica todas
las migraciones y ejecuta `test/geocoding.e2e-spec.ts` con el cliente runtime
`sls_app`. La base se elimina en `finally`, incluso cuando la suite falla.

La suite vigente contiene seis escenarios: coincidencia exacta y round-trip de
coordenadas, resultado `NOT_FOUND`, rechazo de dataset `STAGING`, aislamiento
entre tenants, persistencia de candidatos ambiguos como `REVIEW_REQUIRED` y
rollback completo cuando falla la inserción de candidatos. Un trigger creado
solo dentro de la base desechable fuerza este último fallo; no modifica las
migraciones ni el esquema de producción.

`KEEP_GEOCODE01_TEST_DB=1` conserva deliberadamente la base para diagnóstico.
La suite demuestra geocodificación local contra un catálogo sintético; no
implementa un proveedor externo, importación OSM, Haversine ni planificación de
rutas.

## ROUTE-01 — Ciclo de vida operativo de rutas e Iterator GoF

Desde la raíz del repositorio:

```bash
make integration-test TEST=route-01
make integration-db-down
```

El runner compila el backend, crea una base desechable `sls_route01_<uuid>`, aplica todas
las migraciones mediante `prisma migrate deploy` y ejecuta en banda `test/route-lifecycle.e2e-spec.ts`
y `test/routes-http.e2e-spec.ts` con el cliente runtime `sls_app`. La base se elimina en `finally`,
incluso si una prueba falla.

La ejecución cubre:
1. Ciclo de vida operativo completo (`PLANNED` -> `READY` -> `IN_PROGRESS` -> `INTERRUPTED`)
   con persistencia atómica de cambios en paquetes (`READY_FOR_DISPATCH`, `IN_TRANSIT`),
   eventos en `OutboxEvent` y auditoría en `AuditLog`.
2. Cancelación pre-salida (`PLANNED`/`READY` -> `CANCELLED`) revirtiendo paquetes a
   `PENDING_ASSIGNMENT` y finalizando asignaciones como `CANCELLED`.
3. Validaciones de invariantes y recursos: confirmación de depósito obligatoria, validación
   de vehículos fuera de mantenimiento, autorización estricta del mensajero asignado y
   rechazo de cancelación en rutas ya iniciadas.
4. Aislamiento estricto multi-tenant (RLS) en base de datos y endpoints HTTP.
5. Recorrido de paradas mediante el patrón GoF Iterator (`OrderedRouteStopIterator`)
   verificado en la proyección de detalle de ruta.

## DELIVERY-01 — Entregas, evidencias, excepciones operativas y RLS

Desde la raíz del repositorio:

```bash
make integration-test TEST=delivery-01
make integration-db-down
```

El runner compila el backend, crea una base desechable `sls_delivery01_<uuid>`, aplica todas
las migraciones mediante `prisma migrate deploy` y ejecuta en banda `test/delivery-lifecycle.e2e-spec.ts`
y `test/delivery-http.e2e-spec.ts` con el cliente runtime `sls_app`. La base y los archivos de storage
temporales se eliminan en `finally`, incluso si una prueba falla.

La ejecución cubre:
1. Arribo a parada (`attendRouteStop`), transicionando paquetes a `OUT_FOR_DELIVERY` y registrando tiempos reales.
2. Entregas exitosas (`recordSuccessfulDelivery`) con almacenamiento de evidencias (foto/firma, SHA-256), finalización de asignación en `DELIVERED`, y resolución de paradas multipaquete (`PENDING` -> `COMPLETED`).
3. Entregas fallidas (`recordFailedDelivery`) conservando custodia física activa (`ACTIVE`), numerando intentos incrementalmente (`1..N`) y resolviendo paradas como `FAILED`.
4. Reprogramación (`rescheduleDelivery`) con ventana horaria y conservación de custodia.
5. Solicitud de retorno (`requestPackageReturn`) y recepción física en depósito (`returnPackageToDepot`), distinguiendo finalización de custodia para `RETURNED` y custodia en depósito para `RESCHEDULED`.
6. Reporte de incidentes operacionales (`reportIncident`).
7. Consulta de manifiesto con GoF Iterator (`getDeliveryManifest`).
8. Idempotencia contractual con `Idempotency-Key` (replays limpios y detección de conflictos 409).
9. Aislamiento multi-tenant estricto mediante RLS en PostgreSQL 17 con rol `sls_app`.

## ROUTE-CLOSE-01 — Cierre operativo de rutas, reconciliación de manifiesto y RLS

```bash
make integration-test TEST=route-close-01
make integration-db-down
```

El runner compila el backend, crea una base desechable `sls_routeclose01_<uuid>`, aplica todas
las migraciones mediante `prisma migrate deploy` y ejecuta en banda `test/route-close-lifecycle.e2e-spec.ts`
y `test/route-close-http.e2e-spec.ts` con el cliente runtime `sls_app`. La base se elimina en `finally`,
incluso si una prueba falla.

La ejecución cubre:
1. Cierre operativo regular (`REGULAR`) de rutas con todas sus paradas atendidas y paquetes entregados, persistiendo snapshot inmutable en `RouteClosure`, outbox event `RouteCompleted` (`producer: routes`, `version: 1`) y log de auditoría `CLOSE_ROUTE`.
2. Cierre contingente forzado (`FORCED`) con resolución obligatoria de custodia física restante en depósito (`depotReceipt`), conciliación exacta del balance de manifiesto ($7 = 2 + 1 + 1 + 1 + 2$) y recuperación contextual de paquetes no visitados a `PENDING_ASSIGNMENT`.
3. Idempotencia y protección anti-tampering por hash SHA-256 (`Idempotency-Key` UUID): respuestas cacheadas en replays idénticos y rechazo con código 409 (`IdempotencyKeyReusedError`) ante payloads modificados.
4. Consulta autorizada del resumen de cierre con proyecciones por rol: desglose completo para coordinadores y vista redactada (sin notas ni códigos internos de motivo) para mensajeros asignados.
5. Aislamiento multi-tenant estricto forzado por PostgreSQL 17 RLS bajo el rol no privilegiado `sls_app`.


## RMQ-01 — Outbox leases, confirm publisher, consumidor idempotente, DLQ y redrive

Desde la raíz del repositorio:

```bash
make integration-test TEST=rmq-01
make integration-db-down
```

El runner compila el backend, crea una base desechable `sls_rmq01_<uuid>`, aplica todas las migraciones mediante `prisma migrate deploy` y ejecuta en banda `test/messaging-outbox.e2e-spec.ts` y `test/messaging-consumer.e2e-spec.ts` con el cliente runtime `sls_app`. La base se elimina en `finally`, incluso si una prueba falla.

La ejecución cubre:
1. Publicación transaccional Outbox con leases concurrentes (`FOR UPDATE SKIP LOCKED`), control de expiración de lease y concurrencia multi-tenant.
2. Confirmación de publicación RabbitMQ (`mandatory: true`, `publisher confirms`, detección de rutas no enrutables y `basic.return`).
3. Consumo idempotente con registro transaccional en `ProcessedEvent`, deduplicación estricta y aislamiento por tenant.
4. Políticas de reintento progresivo (5s, 10s, 20s), desvío inmediato a Dead Letter Queue para errores no recuperables y aislamiento de mensajes en cuarentena para inquilinos no autorizados.
5. Redrive de Dead Letters con auditoría atómica en `DeadLetterRedrive`, validación de permisos de operador y prevención de duplicados.

## AUTH-TENANT-01 — Autenticación, aprovisionamiento de empresas, empleados y aislamiento RLS

Desde la raíz del repositorio:

```bash
make integration-test TEST=auth-tenant-01
make integration-db-down
```

El runner compila el backend, crea una base desechable `sls_authtenant01_<uuid>`, aplica todas las migraciones mediante `prisma migrate deploy`, habilita una credencial efímera aleatoria para el rol `sls_provisioning` (creado con `NOLOGIN` en la migración), verifica que `prisma migrate status` quede sin pendientes y ejecuta en banda:
- Las 5 suites de repositorio (`prisma-platform-admin-lookup`, `prisma-session`, `prisma-tenant-user-lookup`, `prisma-tenant-provisioning`, `prisma-user-management`).
- Las 6 suites E2E bajo `/api/v1` (`auth-login`, `platform-login`, `platform-provision-tenant`, `users-employees`, `auth-tenant-isolation`, `tenant-isolation`).

La base se elimina en `finally`, incluso si una prueba falla (`KEEP_AUTHTENANT01_TEST_DB=1` la conserva para diagnóstico deliberado).


