# Plan de NOTIF-01 — Inbox y materialización de notificaciones internas

## Identidad

| Campo | Valor |
| --- | --- |
| Módulo | `NOTIF-01` |
| Responsable humano | Juanangel |
| Estado general | `TODO`; contrato en `REVIEW` |
| Rama observada | `develop` |
| Rama propuesta | `feature/notifications`, desde develop actualizado |
| Última auditoría | 2026-11-09 |
| Commit auditado | `33e09eb` |
| Informe | [NOTIF-01](../modules/notif-01-report.md) |
| Contrato compartido | [UI-04 / NOTIF / TRACK v1](../contracts/ui-04-notifications-tracking-v1.md) |

## Alcance

### Incluido

- Consumir los tres eventos acordados y crear notificaciones IN_APP para coordinadores activos.
- Exponer exactamente las cuatro operaciones de inbox del contrato compartido.
- Persistencia, deduplicación, lectura concurrente, RLS y adaptación mínima de mensajería para un consumidor adicional.

### Fuera de alcance

- Enviar correo: corresponde a NOTIF-02; conservar únicamente sus puntos de extensión acordados.
- Remitentes/destinatarios externos, CRUD de plantillas, nuevas políticas logísticas y endpoints de creación manual.
- Permitir a administradores consultar inbox ajenos o añadir permisos nuevos sin necesidad.

## Dependencias y fuentes

- `AGENTS.md`: arquitectura, tenant, eventos, pruebas, ejecución por Compose y coordinación.
- Contrato compartido: autoridad propuesta de rutas, JSON, errores, audiencia y alcance; revisar antes de implementar.
- [NOTIF-02](notif-02.md), [UI-04](ui-04.md), [RMQ-01](rmq-01.md).
- `backend/prisma/schema/messaging.prisma`, `backend/prisma/schema/identity.prisma`.
- `backend/src/shared/application/messaging/idempotent-consumer.ts`, `backend/src/shared/application/messaging/event-catalog.ts`.
- `backend/src/shared/infrastructure/messaging/rabbitmq-topology.ts`, `rabbitmq-consumer.runner.ts`, `rabbitmq-failure.router.ts` en el mismo directorio.
- `backend/src/modules/users/domain/user-management.repository.ts`, `backend/src/app.setup.ts`, `backend/src/modules/auth/presentation/auth.guard.ts`.

## Diagnóstico actual

`backend/prisma/schema/messaging.prisma` define Notification con tenantId, templateId, sourceEventId, recipient, channel, status, attempts y sentAt. Faltan usuario destinatario, contenido, tipo, createdAt, readAt y unicidad por evento/destinatario/canal. Notification ya tiene FORCE RLS por tenant. No existe módulo notifications ni API de inbox. `IdempotentConsumer` es reutilizable, pero `RabbitmqConsumerRunner`, `RabbitmqFailureRouter` y la topología están ligados a audit; no basta con registrar otro módulo. El catálogo admite los eventos elegidos, pero aún se debe probar la emisión de cada rama real.

La inspección fue estática. No se ejecutaron tests, builds, migraciones ni servicios para elaborar este plan. El árbol inicial contenía `.github/` sin seguimiento, ajeno a estas entregas; se preserva. Los archivos propuestos a continuación no se presentan como existentes.

## Plan verificable

| Paso | Fase | Responsable | Estado | Objetivo | Aceptación | Evidencia |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | Auditoría documental | `CODEX_MECHANICAL` | `DONE` | Contrastar existencia y dependencias | Referencias actuales y límites documentados | Lectura estática de la base indicada |
| 1 | Contrato, audiencia y migración revisable | `USER` | `REVIEW` | Fijar el acuerdo de UI-04 y la identidad del destinatario antes de tocar datos. | Migración propuesta sin borrado, con backfill o cuarentena explícitos para legados y sin asignar destinatarios inventados; contrato y responsabilidades revisados. | Pendiente |
| 2 | Núcleo de inbox y política | `USER` | `TODO` | Definir casos de uso independientes del ORM y del transporte. | Unitarias de tres tipos/eventos, audiencia sin duplicados, cero coordinadores, lectura idempotente y límites de query; dominio/aplicación construibles sin Nest/Prisma. | Pendiente |
| 3 | Persistencia, API y autorización | `USER` | `TODO` | Servir las cuatro respuestas exactas con aislamiento real. | C01-C03 con base desechable y rol sls_app: mismo tenant distinto usuario, distinto tenant, EMAIL oculto, plataforma, sesión revocada, parámetros extra, carreras read/read-all y fechas conservadas. | Pendiente |
| 4 | Consumidor y topología de inbox | `USER` | `TODO` | Materializar eventos con ACK posterior al commit y retries propios. | C04-C05: entrega duplicada/concurrente, rollback inyectado, ACK solo después de commit, reintentos agotados en DLQ correcta y consumo de audit intacto; prueba con broker real separada de dobles. | Pendiente |
| 5 | Integración con UI-04 y cierre | `USER` | `TODO` | Entregar inbox funcional independiente de email y registrar evidencia. | C01-C05/C09 en lo correspondiente al backend, build y pruebas con logs; API consumible por UI-04 sin requerir NOTIF-02. | Pendiente |

## Pasos de implementación

### Paso 1 — Contrato, audiencia y migración revisable

- Estado: `REVIEW`. Responsable: `USER` (Juanangel).
- Objetivo y razón: Fijar el acuerdo de UI-04 y la identidad del destinatario antes de tocar datos.
- Dependencias: Contrato compartido; usuario ya aprobó coordinadores primero.
- Archivos previstos: `docs/contracts/ui-04-notifications-tracking-v1.md`; `backend/prisma/schema/messaging.prisma`; `backend/prisma/schema/identity.prisma`; `backend/prisma/migrations/<timestamp>_notification_inbox/migration.sql`.
- Debe aplicar el usuario: Revisar cuatro rutas y tres eventos con Santiago. Diseñar migración aditiva de contenido, usuario, recurso y lectura; planificar unicidad/FK compuesta, índices tenant/usuario/canal/readAt/createdAt/id y tratamiento de filas antiguas. Consultar cantidad/forma de datos en lectura autorizada sin imprimir correos. Coordinar en una sola secuencia el modelo futuro de NOTIF-02.
- Lote mecánico posible para Codex, solo a petición: sincronizar imports, wiring o fixtures conforme a una transformación previamente acordada; no decidir lógica ni autorización.
- Comprobación y salida: Migración propuesta sin borrado, con backfill o cuarentena explícitos para legados y sin asignar destinatarios inventados; contrato y responsabilidades revisados.
- Evidencia obtenida: ninguna ejecución de este paso; solo diagnóstico estático inicial.
- Decisiones y trabajo restante: Aprobar impacto de datos antes de aplicar migración; schema de fuente real es backend/prisma/schema/ mediante prisma7.config.ts.

### Paso 2 — Núcleo de inbox y política

- Estado: `TODO`. Responsable: `USER` (Juanangel).
- Objetivo y razón: Definir casos de uso independientes del ORM y del transporte.
- Dependencias: Paso 1 revisado.
- Archivos previstos: `backend/src/modules/notifications/domain/notification.ts`; `backend/src/modules/notifications/domain/notification-errors.ts`; `backend/src/modules/notifications/domain/notification.types.ts`; `backend/src/modules/notifications/application/ports/notification-inbox.port.ts`; `backend/src/modules/notifications/application/ports/notification-consumer-unit-of-work.port.ts`; `backend/src/modules/users/application/ports/notification-recipient-directory.port.ts`; `backend/src/modules/notifications/application/list-notifications.use-case.ts`; `backend/src/modules/notifications/application/count-unread-notifications.use-case.ts`; `backend/src/modules/notifications/application/mark-notification-read.use-case.ts`; `backend/src/modules/notifications/application/mark-all-notifications-read.use-case.ts`; `backend/src/modules/notifications/application/materialize-notifications.use-case.ts`; `backend/src/modules/notifications/test/notification-policy.spec.ts`.
- Debe aplicar el usuario: Modelar tipo, texto, recurso y lectura separada de envío. Seleccionar coordinadores por permiso efectivo con puerto de users y contexto tenant confiable. Resolver una sola audiencia por evento; distinguir evento no seleccionado, cero destinatarios y fallo técnico. Planificar sesión transaccional que registre efecto y ProcessedEvent juntos.
- Lote mecánico posible para Codex, solo a petición: sincronizar imports, wiring o fixtures conforme a una transformación previamente acordada; no decidir lógica ni autorización.
- Comprobación y salida: Unitarias de tres tipos/eventos, audiencia sin duplicados, cero coordinadores, lectura idempotente y límites de query; dominio/aplicación construibles sin Nest/Prisma.
- Evidencia obtenida: ninguna ejecución de este paso; solo diagnóstico estático inicial.
- Decisiones y trabajo restante: La transacción no mueve reglas al adaptador; mocks no demuestran RLS ni concurrencia de SQL.

### Paso 3 — Persistencia, API y autorización

- Estado: `TODO`. Responsable: `USER` (Juanangel).
- Objetivo y razón: Servir las cuatro respuestas exactas con aislamiento real.
- Dependencias: Paso 2 y migración revisada; AUTH-01.
- Archivos previstos: `backend/src/modules/notifications/infrastructure/persistence/prisma-notification-inbox.adapter.ts`; `backend/src/modules/notifications/infrastructure/persistence/prisma-notification-consumer-unit-of-work.ts`; `backend/src/modules/users/infrastructure/prisma-notification-recipient-directory.adapter.ts`; `backend/src/modules/users/users.module.ts`; `backend/src/modules/notifications/presentation/notifications.controller.ts`; `backend/src/modules/notifications/presentation/dto/list-notifications.dto.ts`; `backend/src/modules/notifications/presentation/notification-http-errors.ts`; `backend/src/modules/notifications/notifications.module.ts`; `backend/src/app.module.ts`; `backend/test/notifications-http.e2e-spec.ts`.
- Debe aplicar el usuario: Implementar puertos por tenant/usuario y RLS; leer usuarios mediante contrato propietario de users. Usar actualización condicional para primer readAt y read-all de una sentencia. Controlador AuthGuard, contexto tenant y validación estricta local; proyectar solo IN_APP y error común. Wiring con factories y tokens; no ejecutar guards dentro del dominio.
- Lote mecánico posible para Codex, solo a petición: sincronizar imports, wiring o fixtures conforme a una transformación previamente acordada; no decidir lógica ni autorización.
- Comprobación y salida: C01-C03 con base desechable y rol sls_app: mismo tenant distinto usuario, distinto tenant, EMAIL oculto, plataforma, sesión revocada, parámetros extra, carreras read/read-all y fechas conservadas.
- Evidencia obtenida: ninguna ejecución de este paso; solo diagnóstico estático inicial.
- Decisiones y trabajo restante: No usar count de página para campana ni devolver campos internos, correo o tenant en el DTO.

### Paso 4 — Consumidor y topología de inbox

- Estado: `TODO`. Responsable: `USER` (Juanangel).
- Objetivo y razón: Materializar eventos con ACK posterior al commit y retries propios.
- Dependencias: Paso 3 y contratos RMQ existentes.
- Archivos previstos: `backend/src/modules/notifications/infrastructure/messaging/notification-consumer.runner.ts`; `backend/src/modules/notifications/test/notification-consumer.spec.ts`; `backend/src/shared/infrastructure/messaging/rabbitmq-topology.ts`; `backend/src/shared/infrastructure/messaging/rabbitmq-failure.router.ts`; `backend/src/shared/infrastructure/messaging/worker-runtime.ts`; `backend/src/worker.module.ts`; `backend/src/shared/test/messaging/`; `backend/test/notifications-consumer.e2e-spec.ts`.
- Debe aplicar el usuario: Añadir cola/bindings y registrar consumidor notifications.integration-events.v1. Parametrizar solo identidad/colas de fallo para reutilizar reglas sin enviar notificaciones a la DLQ de audit. Mantener audit compatible. Demostrar envelope/productor/tenant y deduplicación en transacción, sin efectos externos dentro del callback.
- Lote mecánico posible para Codex, solo a petición: sincronizar imports, wiring o fixtures conforme a una transformación previamente acordada; no decidir lógica ni autorización.
- Comprobación y salida: C04-C05: entrega duplicada/concurrente, rollback inyectado, ACK solo después de commit, reintentos agotados en DLQ correcta y consumo de audit intacto; prueba con broker real separada de dobles.
- Evidencia obtenida: ninguna ejecución de este paso; solo diagnóstico estático inicial.
- Decisiones y trabajo restante: No afirmar que rmq-01 actual prueba por sí solo los nuevos bindings; no suscribirse a todos los eventos.

### Paso 5 — Integración con UI-04 y cierre

- Estado: `TODO`. Responsable: `USER` (Juanangel).
- Objetivo y razón: Entregar inbox funcional independiente de email y registrar evidencia.
- Dependencias: Paso 4 y cliente Santiago disponible.
- Archivos previstos: `backend/test/integration/notif-01.cjs`; `backend/test/notifications-http.e2e-spec.ts`; `backend/test/notifications-consumer.e2e-spec.ts`; `backend/package.json`; `backend/test/integration/README.md`; `docs/modules/notif-01-report.md`.
- Debe aplicar el usuario: Crear runner desechable como pkg-geo-01 con allowlist de host, migraciones y limpieza finalmente; agregar script test:notif-01. Verificar evento real a campana, recarga de lectura y acceso ajeno. Ejecutar regresión de mensajería y pruebas de fronteras; documentar migración aplicada solo en pruebas.
- Lote mecánico posible para Codex, solo a petición: sincronizar imports, wiring o fixtures conforme a una transformación previamente acordada; no decidir lógica ni autorización.
- Comprobación y salida: C01-C05/C09 en lo correspondiente al backend, build y pruebas con logs; API consumible por UI-04 sin requerir NOTIF-02.
- Evidencia obtenida: ninguna ejecución de este paso; solo diagnóstico estático inicial.
- Decisiones y trabajo restante: NOTIF-02 amplía materialización EMAIL después; no marcar flujo completo de email como DONE al cerrar inbox.

## Paso actual

Paso 1: revisar el contrato común con los otros responsables. Las firmas y rutas nuevas son propuestas; no hay API nueva disponible que Santiago pueda consumir todavía. Crear fixtures de contrato después del acuerdo y registrar las decisiones en el informe. La autorización de esta solicitud cubre documentación, no implementación del módulo.

Al terminar el contrato, implementar y comprobar un paso por vez. Reportar evidencia y esperar revisión humana antes de la siguiente fase, conforme a `AGENTS.md`. No marcar implementación `DONE` por tener documentación.

## Verificación reproducible prevista

```bash
docker compose exec backend npm run build
docker compose exec backend npm test -- --runInBand --testPathPatterns='modules/notifications|shared/test/messaging'
```

Comando futuro, solo después de crear el script y configurar GDB_TEST_ADMIN_URL del servidor desechable en el contenedor:

```bash
docker compose exec backend npm run test:notif-01
```

Añadir ejecución de test:rmq-01 con la misma separación documentada en backend/test/integration/README.md. Los nuevos tests/runner no existen todavía.

Todo tooling de aplicación se ejecuta en Compose. Los comandos son propuestas para después de implementar, no resultados actuales. Integración usa un PostgreSQL/PostGIS desechable y, donde corresponda, RabbitMQ/SMTP locales aislados; nunca la base demo compartida. No ejecutar seeds, resets ni migraciones sobre ella.

El formato se comprueba de forma acotada cuando lo exija el repositorio o un fallo concreto; no es una fase independiente. No usar el script backend de lint con `--fix` durante revisión.

## Decisiones

| Fecha | Decisión | Motivo | Consecuencia |
| --- | --- | --- | --- |
| 2026-11-09 | Coordinadores activos por COORDINATE_ROUTES | Instrucción expresa de alcance y RBAC existente | Sin contactos externos ni comparación de nombres de rol |
| 2026-11-09 | Lectura propia separada de canal EMAIL | UI no administra entregas SMTP | Cuatro endpoints IN_APP y ningún endpoint manual de envío |
| 2026-11-09 | Materialización atómica e idempotente | Redelivery de RabbitMQ | UoW de aplicación y unicidad persistente, conservando RLS |

## Bitácora de progreso

| Fecha | Paso | Cambio observado | Verificación | Commit |
| --- | --- | --- | --- | --- |
| 2026-11-09 | Auditoría y plan | Alcance y contratos propuestos documentados | Inspección estática; sin ejecución funcional | Base `33e09eb`; documentación nueva sin commit |
| 2026-11-10 | Revisión documental | Firmas, audiencia aprobada y límites sincronizados con contrato común | Lote de 10 documentos: 42 enlaces locales y 5 ejemplos JSON válidos; sin whitespace final | Sin commit |

## Cierre

- [ ] Contrato revisado con propietarios backend/frontend.
- [ ] Aceptación funcional y casos compartidos del contrato satisfechos.
- [ ] Build y pruebas relevantes acreditados por Compose.
- [ ] Aislamiento y autorización comprobados.
- [ ] Migración o infraestructura revisada cuando corresponda.
- [ ] Informe actualizado por cada punto, con logs y límites reales.
- [ ] Integración real comprobada, no solo fixtures.
- [ ] Fuera de alcance y trabajo restante explícitos.
- [ ] Sin cambios ajenos sobrescritos; commits solo propuestos al usuario.
