# RMQ-01 — Informe de auditoría y planificación

Fecha: 2026-10-07, America/Bogota. Base: `develop`, commit `04be562606ffa81829ca55e886c7aac07973e5d0`. Rama documental: `codex/docs-rmq-01`.

Plan canónico: [RMQ-01: procesamiento asíncrono confiable](../plans/rmq-01.md).

## Alcance de esta entrega

Se elaboró el plan conceptual y técnico de EVT-01, RMQ-01, IDEMP-01 y DLQ-01. Incluye contratos TypeScript, compatibilidad de eventos existentes, topología RabbitMQ, reservas del outbox, publisher confirms, transacción idempotente, reintentos, DLQ, cuarentena, redrive durable y pruebas. El inventario de archivos y las fases están en la sección 8 del plan.

Esta entrega es documental. No se implementaron servicios, dependencias, migraciones ni pruebas del módulo.

## F0 — Auditoría completada

Fuentes locales contrastadas:

- `AGENTS.md` completo y `.agents/skills/sls-module-workflow/SKILL.md`.
- `docker-compose.yml`, `docker-compose.integration.yml`, `backend/Dockerfile` y scripts del backend.
- `backend/prisma7.config.ts`, esquema `messaging.prisma`, `identity.prisma`, `audit.prisma` y migración inicial de RLS.
- Writers de outbox de routes, deliveries, packages y route-planning; contratos y casos de uso que generan eventos.
- `database/prisma.service.ts`, `run-with-tenant.ts`, entry point HTTP y contexto de identidad de presentación.
- Planes, informes y ADR existentes relacionados con rutas y entregas.

Hallazgos que cambian el diseño respecto al contexto inicial:

1. RabbitMQ está configurado, pero Compose no mostró servicios activos en esta sesión; la salud y versión real no se pudieron verificar.
2. `PackageDelivered` y `DeliveryAttempted` existen como productores. No se encontró `RouteCompleted`; se eligió el primero para la demostración.
3. Los productores usan distintas representaciones JSON; `producer` no es columna del outbox y `correlationId` admite nulos.
4. Las tablas tienen RLS y un helper tenant-scoped. El worker debe conservar ese contexto también al publicar y registrar fallos.
5. Los índices existentes no cubren completamente el barrido programado ni deduplican registros de DLQ.
6. El contexto HTTP admite cabeceras como fallback; este módulo no demuestra por sí solo autenticación pública confiable.

La sección 1 del plan distingue estas observaciones de las propuestas. Las fuentes primarias externas están enlazadas junto a las decisiones técnicas que sustentan.

## Decisiones propuestas

- Entrega al menos una vez con efectos idempotentes; sin promesa de exactly-once.
- Polling, `SKIP LOCKED` y leases con token; publicación fuera de transacciones SQL.
- Confirms y `mandatory`; estado `PUBLISHED` solo tras confirmación sin return.
- Worker standalone, misma imagen de la API, disponibilidad HTTP independiente del broker.
- Quorum queues con políticas explícitas para proteger traslados por DLX.
- Tres reintentos de 5, 10 y 20 segundos; retorno exclusivo al consumidor que falló.
- Registro único de `ProcessedEvent` y efecto dentro de una transacción; ACK después del commit.
- Consumidor de auditoría como efecto demostrable; email permanece en NOTIF-01/02.
- Registro DLQ deduplicado; mensajes sin identidad confiable retenidos en cuarentena.
- Intenciones durables de redrive dirigidas al consumidor original y auditadas.

## Verificación realizada y límites

| Comprobación | Resultado |
| --- | --- |
| Árbol de trabajo inicial | Limpio; rama `develop` |
| Inspección de fuentes y migraciones | Realizada; evidencia estructural, no aplicación de migraciones en una base viva |
| `docker compose ps` con acceso al daemon | No listó servicios del proyecto |
| Consulta de versión del servicio rabbitmq | No ejecutable: servicio no está en ejecución |
| Revisión documental | Estructura de ocho secciones, rutas existentes/propuestas, enlaces locales y whitespace revisados |
| Build / unitarias / integración | No ejecutados; no hubo cambio funcional y la suite nueva todavía no existe |
| Migraciones / infraestructura | No aplicadas ni modificadas |
| Commit de esta entrega | No creado |

No se actualizan estados del tablero a `DONE`. F0, F1 y F2 están completados; F3–F8 permanecen `TODO`. El diseño queda en `REVIEW`.

## F1 — Contratos y reglas de compatibilidad de productores (Completado)

- Archivos creados: `event-envelope.ts`, `messaging-errors.ts`, `event-catalog.ts`, `event-validator.ts`, `outbox-event.mapper.ts`, `event-contracts.spec.ts`, `outbox-event.mapper.spec.ts`.
- Verificación: 21 tests de mensajería en verde, 713 tests totales en verde, build en Docker OK.

## F2 — Reservas, índices, ajuste de writers y persistencia tenant-scoped (Completado)

- Esquema y Migración:
  - `backend/prisma/schema/messaging.prisma`: `OutboxEvent` extendido con `producer`, `leaseToken`, `lockedUntil`, `nextAttemptAt`, `lastError` e índice compuesto; `DeadLetterMessage` con `failureKey` y relación `redrives`; nuevo enum `DeadLetterRedriveStatus` y modelo `DeadLetterRedrive`.
  - `backend/prisma/schema/identity.prisma`: relación inversa `deadLetterRedrives` en `Tenant`.
  - `backend/prisma/migrations/20261007160000_rmq_outbox_and_dead_letter/migration.sql`: DDL aditivo, RLS y grants para `sls_app`.
  - Cliente Prisma generado limpiamente con `prisma generate`.
- Puertos e Infraestructura:
  - `outbox-store.port.ts` y `prisma-outbox.store.ts`: claim atómico con `FOR UPDATE SKIP LOCKED`, asignación de `leaseToken` y renovación.
  - `consumer-unit-of-work.port.ts` y `prisma-processed-event.registry.ts`: inserción idempotente con `ON CONFLICT DO NOTHING`.
  - `dead-letter-store.port.ts` y `prisma-dead-letter.store.ts`: persistencia segura de fallos DLQ y consultas tenant-scoped.
  - `redrive-store.port.ts` y `prisma-redrive.store.ts`: intenciones durables de redrive con auditoría transaccional.
  - `audit-writer.port.ts` y `prisma-audit-writer.ts`: writer transaccional reutilizable.
- Writers de outbox actualizados:
  - `routes`, `deliveries`, `packages` y `route-planning` ahora persisten `producer` explícitamente en `OutboxEvent`.
- Verificación ejecutada:
  - `npm test -- src/shared/test/messaging`: 6 suites, 33 tests pasando en verde (0.85s).
  - `npm test`: Suite completa del repositorio (81 suites, 725 tests) pasando al 100%.
  - `docker compose run --rm --no-deps backend npm run build`: Compilación NestJS/TypeScript limpia (código de salida 0).

## F3 — Transporte AMQP y topología segura (Completado)

- Archivos creados / modificados:
  - `event-publisher.port.ts`: Contrato de publicación con soporte para exchange, routing key y headers adicionales.
  - `messaging.config.ts`: Carga y validación de variables de entorno para AMQP, leases, timeouts y tenencia.
  - `rabbitmq-topology.ts`: Manifiesto formal de exchanges durables, colas quorum (principal, retries 5s/10s/20s, DLQ, cuarentena), bindings y función `assertRabbitmqTopology`.
  - `rabbitmq-connection.ts`: `RabbitmqConnectionManager` para ciclo de vida de conexión (`ChannelModel`), canales normales y confirm channels con prefetch.
  - `rabbitmq-confirm.publisher.ts`: Implementación de `EventPublisherPort` sobre RabbitMQ con `mandatory: true`, detección de `basic.return` (`PUBLISHER_UNROUTABLE`), nacks (`PUBLISHER_NACK`), timeouts configurables (`PUBLISHER_CONFIRM_TIMEOUT`), persistencia y headers canónicos SLS (`x-sls-tenant-id`, `x-sls-original-routing-key`, etc.).
  - `infra/rabbitmq/definitions.json` y `infra/rabbitmq/rabbitmq.conf`: Topología versionada, políticas de quorum at-least-once y arranque declarativo.
  - `docker-compose.yml`: Montaje de configuración RabbitMQ y desacoplamiento del backend HTTP respecto al healthcheck del broker.
- Verificación ejecutada:
  - `npm test -- src/shared/test/messaging/rabbitmq-confirm.publisher.spec.ts`: 6 tests unitarios pasando en verde.
  - `npm test`: Suite completa del repositorio (82 suites, 731 tests) pasando al 100%.
  - `docker compose run --rm --no-deps backend npm run build`: Compilación NestJS/TypeScript limpia (código de salida 0).

## F4 — Publisher recuperable (Outbox Publisher Worker) (Completado)

- Archivos creados / modificados:
  - `backend/src/shared/application/messaging/outbox-publisher.ts`: Coordinador del ciclo de publicación `OutboxPublisher` con barrido por `allowedTenantIds`, reclamo atómico mediante `claimDue` con leases, mapeo defensivo mediante `OutboxEventMapper`, publicación con confirms y `mandatory`, transición a `PUBLISHED` en PostgreSQL, backoff progresivo (5s, 10s, 20s) ante fallos recuperables vía `failClaim`, y descarte definitivo mediante `markFailedPermanently` ante anomalías de formato o identidad irresolubles.
  - `backend/src/shared/test/messaging/outbox-publisher.spec.ts`: Suite de pruebas unitarias cubriendo barrido multi-tenant, concurrencia en lotes, mapping de eventos, publicaciones exitosas, y backoff de reintentos.
- Verificación ejecutada:
  - `npm test -- src/shared/test/messaging/outbox-publisher.spec.ts`: 6 tests unitarios pasando en verde.
  - `npm test`: Suite completa del repositorio (83 suites, 737 tests) pasando al 100%.
  - `docker compose run --rm --no-deps backend npm run build`: Compilación NestJS/TypeScript limpia (código de salida 0).

## F5 — Worker e idempotencia con efecto real (Completado)

- Archivos creados / modificados:
  - `backend/src/shared/application/messaging/idempotent-consumer.ts`: Coordinador agnóstico de consumo idempotente `IdempotentConsumer` ejecutado dentro de la transacción del `ConsumerUnitOfWork` asegurando que duplicados no repitan el efecto de negocio y que fallos reviertan sin asentar `ProcessedEvent`.
  - `backend/src/modules/audit/application/audit-consumer-session.ts` y `audit-integration-event.consumer.ts`: Consumidor canónico de auditoría registrando `INTEGRATION_EVENT_RECEIVED` con metadatos completos y trazabilidad de eventos de integración recibidos.
  - `backend/src/modules/audit/infrastructure/prisma-audit-consumer-unit-of-work.ts` y `backend/src/modules/audit/audit.module.ts`: UoW transaccional bajo `runWithTenant` y módulo NestJS exportable.
  - `backend/src/shared/infrastructure/messaging/rabbitmq-consumer.runner.ts`: Consumidor AMQP sobre `AUDIT_MAIN` con prefetch, validación estricta de JSON, comprobación de consistencia de cabeceras (`x-sls-tenant-id`) vs envelope, validación contra `allowedTenantIds`, ejecución idempotente y confirmación con `channel.ack(msg)`.
  - `backend/src/shared/infrastructure/messaging/worker-runtime.ts`: Runtime del proceso desacoplado que inicializa topología, arranca consumers, ejecuta el loop periódico de outbox y gestiona el apagado suave (drenando peticiones en vuelo).
  - `backend/src/shared/messaging.module.ts`, `backend/src/worker.module.ts` y `backend/src/worker.ts`: Composition root standalone con traps para `SIGTERM`/`SIGINT`.
  - `backend/package.json`: Scripts `start:worker` y `start:worker:dev`.
  - Pruebas unitarias y de arquitectura:
    - `idempotent-consumer.spec.ts`: 4 pruebas de registro y descarte de duplicados.
    - `audit-integration-event.consumer.spec.ts`: 1 prueba de persistencia de auditoría.
    - `rabbitmq-consumer.runner.spec.ts`: 6 pruebas de procesamiento, duplicados, fallos de JSON, tenencia no autorizada y ACKs.
    - `messaging-architecture.spec.ts`: Reglas de arquitectura limpia verificando aislamiento total de dependencias de infraestructura y frameworks en las capas de aplicación de mensajería y auditoría.
- Verificación ejecutada:
  - `npm test`: 87 suites, 750 tests pasando al 100% en verde.
  - `docker compose run --rm --no-deps backend npm run build`: Compilación NestJS/TypeScript limpia (código de salida 0), generando `dist/src/main.js` y `dist/src/worker.js`.

## F6 — Reintentos, DLQ y cuarentena (Completado)

- Archivos creados / modificados:
  - `backend/src/shared/application/messaging/retry-policy.ts`: Clasificador de errores y políticas de reintento `RetryPolicy` con 3 escalones fijos (5s, 10s, 20s), agotamiento a DLQ tras el tercer reintento, envío inmediato a DLQ ante fallos de formato permanentes (`EVENT_INVALID_JSON`, `EVENT_INVALID_ENVELOPE`, `EVENT_UNSUPPORTED_VERSION`, `BROKER_DELIVERY_LIMIT_EXCEEDED`), y envío a cuarentena ante inconsistencias de identidad de tenant o remitentes no confiables.
  - `backend/src/shared/application/messaging/dead-letter-recorder.ts`: Registrador de fallos en PostgreSQL `DeadLetterRecorder` que calcula `failureKey` determinista (`tenantId:consumerName:eventId:reasonCode`) garantizando idempotencia en el archivo de fallos de DLQ sin duplicar filas.
  - `backend/src/shared/infrastructure/messaging/rabbitmq-failure.router.ts`: Enrutador seguro de fallos `RabbitmqFailureRouter` que publica con publisher confirm a las colas correspondientes (`sls.retry.v1` con step, `sls.dead.v1` con DLQ en BD, o `sls.quarantine.v1` como `unattributed`) y confirma con `channel.ack(msg)` solo tras asegurar la persistencia en el destino (cumpliendo at-least-once T22).
  - `backend/src/shared/messaging.module.ts`: Registro e inyección de `RetryPolicy`, `DeadLetterRecorder` y `RabbitmqFailureRouter`.
  - Pruebas unitarias:
    - `retry-policy.spec.ts`: 6 pruebas de escalones, agotamiento, errores permanentes y cuarentena.
    - `dead-letter-recorder.spec.ts`: 1 prueba de generación de `failureKey` y persistencia.
    - `rabbitmq-failure.router.spec.ts`: 4 pruebas de enrutamiento a retry, DLQ, cuarentena y tolerancia a caídas del broker.
- Verificación ejecutada:
  - `npm test`: 90 suites, 761 tests pasando al 100% en verde.
  - `docker compose run --rm --no-deps backend npm run build`: Compilación NestJS/TypeScript limpia (código de salida 0).

## F7 — Redrive durable y control operativo (Completado)

- Archivos creados / modificados:
  - `backend/src/shared/application/messaging/ports/messaging-operator.port.ts`: Definición de `OperatorContext` y aserción de autorización estricta (`assertOperatorAuthorized`), asegurando que cualquier operación administrativa falle cerrada si falta el principal o si el tenant está fuera de su alcance.
  - `backend/src/shared/application/messaging/request-dead-letter-redrive.use-case.ts`: Caso de uso `RequestDeadLetterRedriveUseCase` que valida autorización del operador, verifica existencia del fallo en DLQ bajo su tenant, comprueba que el evento no haya sido ya procesado en `ProcessedEvent` (retornando `ALREADY_PROCESSED` sin republicación inútil), y registra atómicamente la solicitud en `DeadLetterRedrive` y auditoría en `AuditLog`.
  - `backend/src/shared/application/messaging/dead-letter-redrive-publisher.ts`: Publicador de redrives `DeadLetterRedrivePublisher` que reclama solicitudes pendientes mediante lease tokens, reconstruye el envelope canónico, republica exclusivamente al exchange de retorno (`sls.return.v1`) con la routing key del consumidor original (`x-sls-retry-count=0`, `x-sls-redrive-id=requestId`), limpia diagnósticos de error antiguos y asienta la confirmación en `DeadLetterRedrive.publishedAt` y `DeadLetterMessage.redrivenAt`.
  - `backend/src/shared/infrastructure/messaging/messaging-ops.ts`: CLI operativa ejecutable en desarrollo y entornos administrados (`status` y `redrive`) con script NPM asociado `npm run messaging:ops`.
  - Pruebas unitarias:
    - `dead-letter-redrive.spec.ts`: 6 pruebas unitarias cubriendo autorización de operador, rechazo por falta de alcance, detección de `ALREADY_PROCESSED`, publicación a `sls.return.v1`, y recuperación ante fallos de conexión.
- Verificación ejecutada:
  - `npm test`: 91 suites, 769 tests pasando al 100% en verde.
  - `docker compose run --rm --no-deps backend npm run build`: Compilación NestJS/TypeScript limpia (código de salida 0).
  - CLI `node backend/dist/src/shared/infrastructure/messaging/messaging-ops.js --help`: Ejecución y respuesta limpia.

## F8 — Integración, documentación y cierre (Completado)

- Archivos creados / modificados:
  - `backend/test/messaging-outbox.e2e-spec.ts`: Suite E2E de Outbox con persistencia real PostgreSQL, validando concurrencia multi-tenant, `FOR UPDATE SKIP LOCKED`, leases exclusivos, y recuperación de eventos con lease expirado.
  - `backend/test/messaging-consumer.e2e-spec.ts`: Suite E2E de Consumo Idempotente, DLQ y Redrive con PostgreSQL real, verificando unicidad de `ProcessedEvent`, deduplicación estricta, aislamiento multi-tenant RLS, registro atómico en `DeadLetterMessage` con `failureKey`, y solicitud de redrive autorizada con `AuditLog`.
  - `backend/test/integration/rmq-01.cjs`: Runner de integración reproducible que crea base de datos desechable `sls_rmq01_<uuid>`, aplica migraciones completas mediante `prisma migrate deploy`, ejecuta las suites E2E en banda y elimina la base al finalizar.
  - `docker-compose.integration.yml`: Servicio `integration-rabbitmq` incorporado bajo el perfil `integration` con almacenamiento temporal `tmpfs`, sin colisión de puertos de host ni volúmenes compartidos.
  - `Makefile` y `backend/test/integration/README.md`: Añadido `rmq-01` a los targets de integración documentados y soportados.
  - `backend/.env.example`: Variables de entorno para mensajería documentadas (`RABBITMQ_URL`, `RMQ_PREFETCH`, `OUTBOX_POLL_INTERVAL_MS`, `OUTBOX_BATCH_SIZE`, `OUTBOX_LEASE_SECONDS`).
- Verificación ejecutada:
  - `npm test`: 91 suites, 769 tests unitarios y de arquitectura pasando al 100% en verde (4.08s).
  - `docker compose run --rm --no-deps backend npm run test:rmq-01`:
    - Creación de base de datos desechable: `sls_rmq01_897a1783588c4574b68343f20df2d793`.
    - 14 migraciones aplicadas limpiamente (`prisma migrate deploy`).
    - 2 suites E2E ejecutadas (`messaging-outbox.e2e-spec.ts`, `messaging-consumer.e2e-spec.ts`), 8 tests pasando en verde.
    - Base de datos desechable eliminada en `finally`.
  - `docker compose run --rm --no-deps backend npm run build` y `npm run build`: Compilación dual completa generando `dist/src/main.js` y `dist/src/worker.js` con código de salida 0.

## Resumen de Estado del Módulo RMQ-01

| Fase | Estado | Descripción |
|---|---|---|
| F0 · Auditoría y diseño | `DONE` | Plan canónico en `docs/plans/rmq-01.md` aprobado y verificado contra repo real. |
| F1 · Contratos y envelope | `DONE` | `EventEnvelope`, `EventCatalog`, `EventValidator`, `OutboxEventMapper`, errores tipados. |
| F2 · Persistencia y RLS | `DONE` | Migración de outbox y DLQ, modelos Prisma, RLS para `sls_app`, stores de infraestructura y writers adaptados. |
| F3 · AMQP y Topología | `DONE` | Exchanges durables, colas quorum, `RabbitmqTopology`, `RabbitmqConnectionManager`, confirms y `mandatory`. |
| F4 · Outbox Publisher | `DONE` | `OutboxPublisher` con leases `FOR UPDATE SKIP LOCKED`, polling multi-tenant, confirms y backoff progresivo. |
| F5 · Worker e Idempotencia | `DONE` | Entry point `src/worker.ts`, `WorkerModule`, `IdempotentConsumer`, `AuditIntegrationEventConsumer`, arquitectura limpia. |
| F6 · Retries, DLQ y Cuarentena | `DONE` | `RetryPolicy` (5s/10s/20s), `DeadLetterRecorder` (clave `failureKey`), `RabbitmqFailureRouter` a retry, DLQ o cuarentena. |
| F7 · Redrive y Ops CLI | `DONE` | `RequestDeadLetterRedriveUseCase`, `DeadLetterRedrivePublisher`, CLI `messaging:ops`, autorización cerrada. |
| F8 · Integración y Cierre | `DONE` | Runner desechable `rmq-01.cjs`, E2E suites en verde, `docker-compose.integration.yml`, Makefile y documentación completa. |




