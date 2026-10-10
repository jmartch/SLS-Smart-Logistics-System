# GDB-06 — Estados y compatibilidad

Fecha de verificación: 2026-09-26.

Estado: **DONE para el alcance definido de GDB-06**. El ciclo de vida de paquetes usa el patrón State, Prisma y el dominio comparten los mismos estados, y cada transición válida persiste de forma atómica el estado actual, el historial y un evento outbox. Las transiciones inválidas y los intentos de acceso desde otro tenant no escriben datos. El ciclo de rutas quedó alineado en Prisma; implementar State también para rutas no forma parte de este alcance.

## Estados compatibles

Los trece estados de paquete son:

```text
REGISTERED
CLASSIFIED
PENDING_ASSIGNMENT
ASSIGNED_TO_ROUTE
READY_FOR_DISPATCH
IN_TRANSIT
OUT_FOR_DELIVERY
DELIVERED
DELIVERY_FAILED
RESCHEDULED
RETURN_PENDING
RETURNED
CANCELLED
```

La migración `20260926190000_gdb_06_states_compatibility` renombra el valor histórico `ASSIGNED` como `ASSIGNED_TO_ROUTE`, por lo que conserva los valores existentes de `Package` y `PackageStatusHistory` sin realizar un reemplazo destructivo. También incorpora `RETURN_PENDING` y `CANCELLED`.

Los nueve estados de ruta son `DRAFT`, `PLANNING`, `PLANNED`, `READY`, `IN_PROGRESS`, `COMPLETED`, `PLANNING_FAILED`, `INTERRUPTED` y `CANCELLED`. La migración añade los valores que faltaban y cambia el valor predeterminado de `Route.state` a `DRAFT`. Este cambio se ejecuta en una segunda transacción porque PostgreSQL exige confirmar los nuevos valores del enum antes de utilizarlos como defaults.

El comando `prisma migrate dev --create-only` no pudo generar la migración porque la migración histórica `20260914130000_logistics_integrity` consulta `_prisma_migrations` y falla al reproducirse en la shadow database. No se alteró esa migración aplicada. El SQL de GDB-06 se creó como una migración nueva, se validó aplicando las diez migraciones desde una base vacía y posteriormente `prisma migrate status` confirmó que la base `sls` estaba actualizada.

## Patrón State

`PackageAggregate` es el contexto del patrón. Se reconstituye con identificador, tenant y estado persistido, pero no expone mutación directa del estado. `PackageState` define el contrato y cada clase concreta declara únicamente las transiciones permitidas desde su estado.

El flujo principal soportado es:

```text
REGISTERED -> CLASSIFIED
CLASSIFIED -> PENDING_ASSIGNMENT | ASSIGNED_TO_ROUTE
PENDING_ASSIGNMENT -> ASSIGNED_TO_ROUTE
ASSIGNED_TO_ROUTE -> READY_FOR_DISPATCH
READY_FOR_DISPATCH -> IN_TRANSIT
IN_TRANSIT -> OUT_FOR_DELIVERY
OUT_FOR_DELIVERY -> DELIVERED | DELIVERY_FAILED
DELIVERY_FAILED -> RESCHEDULED | RETURN_PENDING
RESCHEDULED -> ASSIGNED_TO_ROUTE
RETURN_PENDING -> RETURNED
```

`REGISTERED`, `CLASSIFIED`, `PENDING_ASSIGNMENT`, `ASSIGNED_TO_ROUTE`, `READY_FOR_DISPATCH` y `RESCHEDULED` también permiten cancelación. `DELIVERED`, `RETURNED` y `CANCELLED` son terminales. Una transición no permitida lanza `InvalidPackageTransitionError` con código estable, estado actual y estado solicitado; no cambia el agregado ni genera eventos.

Cada transición válida genera exactamente un `PackageStateChangedEvent` versión 1. El mapa `PackageEventType` define un tipo de evento único para cada estado de paquete y la prueba de compatibilidad impide que Prisma, el dominio y ese mapa diverjan. El evento incluye tenant, paquete, estado anterior y nuevo, fecha y metadatos opcionales de usuario, razón y correlación.

## Persistencia transaccional

`TransitionPackageStateService` recibe el tenant desde un contexto confiable y delega la operación al puerto `PackageLifecycleRepository`. La implementación Prisma ejecuta la transición dentro de `runWithTenant` y una sola transacción:

1. Busca el paquete por `tenantId` e identificador y bloquea la fila con `FOR UPDATE`.
2. Reconstituye el agregado y ejecuta la transición de dominio.
3. Actualiza `Package.state` comprobando también el estado anterior.
4. Inserta `PackageStatusHistory`.
5. Inserta `OutboxEvent` versión 1 con productor `sls-backend.packages`.
6. Confirma toda la operación o revierte todas las escrituras.

El bloqueo evita que dos transiciones concurrentes partan silenciosamente del mismo estado. El filtro obligatorio por tenant y el contexto RLS hacen que un paquete de otra empresa se comporte como inexistente. El servicio devuelve `NOT_FOUND` sin revelar si el identificador pertenece a otro tenant.

`PackagesModule` registra la implementación Prisma y exporta únicamente `TransitionPackageStateService` como interfaz pública del módulo. No se expuso un controlador HTTP porque AUTH-01 todavía no proporciona una identidad autenticada de la cual derivar `tenantId`. Aceptar ese valor libremente desde una petición contradiría la regla de aislamiento del proyecto.

## Verificación reproducible

La verificación final obtuvo estos resultados:

- `npm run build`: compilación correcta;
- ESLint sobre el módulo de paquetes y su E2E: sin errores;
- Prettier sobre el módulo, runner, E2E y `app.module.ts`: formato correcto;
- pruebas unitarias completas: 19 suites y 132 pruebas aprobadas;
- `npm run test:gdb-06`: 1 suite y 4 pruebas integrales aprobadas;
- `git diff --check`: sin errores de espacios.

El runner `test:gdb-06` crea una base `sls_gdb06_<uuid>`, aplica las diez migraciones desde cero, ejecuta `package-lifecycle.e2e-spec.ts`, termina las conexiones abiertas y elimina la base al finalizar. La URL administrativa se utilizó para crear y borrar esa base desechable; las pruebas no insertaron fixtures en `sls`.

Los cuatro escenarios integrales demuestran:

1. Una transición válida actualiza `Package`, crea su fila de `PackageStatusHistory` y escribe el evento outbox en la misma transacción.
2. Una transición inválida no modifica estado, historial ni outbox.
3. Un fallo al insertar el historial revierte también la actualización del paquete y cualquier evento.
4. Un tenant distinto no puede consultar ni modificar el paquete.

Las pruebas unitarias adicionales cubren transiciones válidas e inválidas, estados terminales, generación y drenaje de eventos, propagación de metadatos, resultado `NOT_FOUND`, wiring de `PackagesModule` y compatibilidad exacta entre los enums de Prisma y dominio.

## Estado verificado en SLS

El preflight de solo lectura encontró cero filas en `Package`, `Route` y `OutboxEvent`, por lo que no había datos que transformar ni eventos antiguos pendientes. Después de aplicar la migración, PostgreSQL mostró los trece valores esperados de `PackageState`, los nueve de `RouteState` y el default `DRAFT` para `Route.state`. Finalmente, Prisma informó `Database schema is up to date!`.

## Trabajo posterior fuera de GDB-06

- Exponer casos de uso mediante HTTP cuando AUTH-01 permita derivar un tenant confiable y aplicar permisos por rol.
- Publicar los eventos outbox en RabbitMQ y añadir consumidores versionados bajo EVT-01/RMQ-01. En el repositorio no existían consumidores de eventos de paquete que requirieran compatibilidad con el nombre histórico `ASSIGNED`.
- Implementar idempotencia, reintentos y DLQ en IDEMP-01 y DLQ-01. La escritura en outbox asegura atomicidad local, pero todavía no demuestra entrega al broker.
- Integrar las transiciones con registro, clasificación, asignación, ejecución de rutas y entregas conforme se implementen esos casos de uso.
- Implementar un patrón State separado para rutas solo si una tarea posterior lo exige; GDB-06 alinea por ahora su enum y valor inicial.
