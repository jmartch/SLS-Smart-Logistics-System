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

Los valores admitidos actualmente son `gdb-01`, `gdb-05`, `gdb-06` y
`geocode-01`. Deben ejecutarse secuencialmente porque comparten el servidor y
las migraciones administran el rol `sls_app` a nivel de instancia. Los comandos
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
