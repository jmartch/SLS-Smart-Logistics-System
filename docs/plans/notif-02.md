# Plan de NOTIF-02 — Email operativo a coordinadores

## Identidad

| Campo | Valor |
| --- | --- |
| Módulo | `NOTIF-02` |
| Responsable humano | Juanangel |
| Estado general | `TODO`; contrato en `REVIEW` |
| Rama observada | `develop` |
| Rama propuesta | `feature/notifications`, desde develop actualizado |
| Última auditoría | 2026-11-09 |
| Commit auditado | `33e09eb` |
| Informe | [NOTIF-02](../modules/notif-02-report.md) |
| Contrato compartido | [UI-04 / NOTIF / TRACK v1](../contracts/ui-04-notifications-tracking-v1.md) |

## Alcance

### Incluido

- Email para PackagePendingAssignment y DeliveryFailed a coordinadores elegibles, conforme al contrato común.
- Trabajos durables, disparador de outbox, envío SMTP fuera de transacción, reintentos limitados y recuperación.
- Adaptador SMTP configurado desde entorno; pruebas con servidor SMTP local/de prueba y sin emails reales.

### Fuera de alcance

- API o pantalla de administración de email; cambios adicionales a UI-04.
- Remitentes/destinatarios externos y su modelo de contactos, campañas, adjuntos, preferencias y editor de plantillas.
- Proveedor de pago, garantías exactly-once SMTP y notificar por email cada evento del catálogo.

## Dependencias y fuentes

- `AGENTS.md`: arquitectura, tenant, eventos, pruebas, ejecución por Compose y coordinación.
- Contrato compartido: autoridad propuesta de rutas, JSON, errores, audiencia y alcance; revisar antes de implementar.
- [NOTIF-01](notif-01.md): propietario del modelo, audiencia y materialización.
- [UI-04](ui-04.md): solo consume inbox; no espera la implementación SMTP.
- `backend/src/shared/application/messaging/outbox-publisher.ts`, `event-catalog.ts`, `idempotent-consumer.ts`.
- `backend/src/shared/infrastructure/messaging/rabbitmq-topology.ts`, `rabbitmq-failure.router.ts`, `worker-runtime.ts`.
- `backend/prisma/schema/messaging.prisma`, `backend/package.json`, `docker-compose.integration.yml`.

## Diagnóstico actual

Existen amqplib, outbox, publisher confirm, retry policy, DLQ y consumidor idempotente. No hay puerto/adaptador SMTP ni consumidor de notifications. NotificationStatus actual es PENDING/SENT/FAILED: el plan propone añadir PROCESSING y CANCELLED al mismo enum, junto con columnas de lease/reintento, sin duplicar estados. El repositorio no incluye dependencia SMTP ni servidor de captura en Compose. FailureRouter y runner están ligados a audit, por lo que requieren el cambio delimitado de NOTIF-01. No hay contactos externos de paquetes; el alcance aprobado usa User.email de coordinadores del mismo tenant.

La inspección fue estática. No se ejecutaron tests, builds, migraciones ni servicios para elaborar este plan. El árbol inicial contenía `.github/` sin seguimiento, ajeno a estas entregas; se preserva. Los archivos propuestos a continuación no se presentan como existentes.

## Plan verificable

| Paso | Fase | Responsable | Estado | Objetivo | Aceptación | Evidencia |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | Auditoría documental | `CODEX_MECHANICAL` | `DONE` | Contrastar existencia y dependencias | Referencias actuales y límites documentados | Lectura estática de la base indicada |
| 1 | Contrato de entrega y extensión de persistencia | `USER` | `REVIEW` | Acordar trabajos de email sin ampliar APIs ni bloquear el inbox. | Esquema revisable con ampliación explícita de NotificationStatus y lectura independiente; contrato EmailSender sin Prisma/framework; límite SMTP explícito. | Pendiente |
| 2 | Materialización EMAIL y outbox | `USER` | `TODO` | Crear una entrega por usuario/evento/canal y despertar el trabajo de forma confiable. | C04: fallos tras cada escritura revierten todo; evento/concurrencia duplicados no duplican jobs/outbox; PackageDelivered sigue sin email. | Pendiente |
| 3 | Envío, reserva y recuperación | `USER` | `TODO` | Ejecutar correo sin mantener transacciones durante la red ni perder trabajos. | C06: dos workers, vencimiento y token obsoleto, caída antes/después de envío, replays SENT/CANCELLED/FAILED, agotamiento y recuperación sin perder trabajos; SMTP aceptado/commit fallido queda como límite conocido. | Pendiente |
| 4 | SMTP y mensajería conectados | `USER` | `TODO` | Integrar un segundo consumidor y un entorno reproducible de captura de email. | C05-C06 con RabbitMQ y SMTP reales aislados; contenido capturado coincide con trabajo, cabeceras no filtran PII/token; audit e inbox siguen funcionando. | Pendiente |
| 5 | Pruebas integradas y cierre | `USER` | `TODO` | Demostrar notificación operativa tolerante a fallos y límites del proveedor. | C04-C06, build y regresión audit; captura local acreditada. SMTP acceptance no se presenta como entrega garantizada a una bandeja real. | Pendiente |

## Pasos de implementación

### Paso 1 — Contrato de entrega y extensión de persistencia

- Estado: `REVIEW`. Responsable: `USER` (Juanangel).
- Objetivo y razón: Acordar trabajos de email sin ampliar APIs ni bloquear el inbox.
- Dependencias: NOTIF-01 contrato/modelo revisados; audiencia aprobada por usuario.
- Archivos previstos: `docs/contracts/ui-04-notifications-tracking-v1.md`; `backend/prisma/schema/messaging.prisma`; `backend/prisma/migrations/<timestamp>_notification_email_jobs/migration.sql`; `backend/src/modules/notifications/application/ports/email-sender.port.ts`; `backend/src/modules/notifications/application/ports/email-delivery-store.port.ts`.
- Debe aplicar el usuario: Revisar ampliación de NotificationStatus con PROCESSING/CANCELLED, intentos, lease y fencing, nextAttemptAt, destinatario congelado y errores; coordinar migración con NOTIF-01, usando solo una si todavía no fue aplicada. Fijar deliveryId = notificationId, presupuesto total de cuatro envíos y límites SMTP. Diseñar cancelación por usuario inactivo/sin permiso sin reasignar.
- Lote mecánico posible para Codex, solo a petición: sincronizar imports, wiring o fixtures conforme a una transformación previamente acordada; no decidir lógica ni autorización.
- Comprobación y salida: Esquema revisable con estados nuevos explícitos y readAt independiente; contrato EmailSender sin Prisma/framework; límite de duplicados SMTP explícito.
- Evidencia obtenida: ninguna ejecución de este paso; solo diagnóstico estático inicial.
- Decisiones y trabajo restante: Elegir e instalar librería SMTP durante implementación con justificación, sin fijar una versión inventada ni llamar proveedores.

### Paso 2 — Materialización EMAIL y outbox

- Estado: `TODO`. Responsable: `USER` (Juanangel).
- Objetivo y razón: Crear una entrega por usuario/evento/canal y despertar el trabajo de forma confiable.
- Dependencias: NOTIF-01 materializador transaccional; paso 1.
- Archivos previstos: `backend/src/modules/notifications/application/materialize-notifications.use-case.ts`; `backend/src/modules/notifications/infrastructure/persistence/prisma-notification-consumer-unit-of-work.ts`; `backend/src/shared/application/messaging/event-catalog.ts`; `backend/src/shared/application/messaging/event-envelope.ts`; `backend/src/modules/notifications/test/notification-email-materialization.spec.ts`.
- Debe aplicar el usuario: Ampliar únicamente las dos reglas EMAIL del contrato. Insertar trabajo y NotificationEmailRequested en la misma transacción de materialización con IN_APP y ProcessedEvent. Añadir productor notifications y payload validado solo notificationId, sin PII. Mantener eventId y contenido persistidos estables al reintentar.
- Lote mecánico posible para Codex, solo a petición: sincronizar imports, wiring o fixtures conforme a una transformación previamente acordada; no decidir lógica ni autorización.
- Comprobación y salida: C04: fallos tras cada escritura revierten todo; evento/concurrencia duplicados no duplican jobs/outbox; PackageDelivered sigue sin email.
- Evidencia obtenida: ninguna ejecución de este paso; solo diagnóstico estático inicial.
- Decisiones y trabajo restante: No publicar NotificationSent/Failed ni eventos de paquetes nuevos; modificar solo los contratos aprobados y sus pruebas.

### Paso 3 — Envío, reserva y recuperación

- Estado: `TODO`. Responsable: `USER` (Juanangel).
- Objetivo y razón: Ejecutar correo sin mantener transacciones durante la red ni perder trabajos.
- Dependencias: Paso 2 y adaptador de audiencia users.
- Archivos previstos: `backend/src/modules/notifications/application/send-notification-email.use-case.ts`; `backend/src/modules/notifications/application/recover-email-deliveries.use-case.ts`; `backend/src/modules/notifications/infrastructure/persistence/prisma-email-delivery-store.adapter.ts`; `backend/src/modules/notifications/test/send-notification-email.use-case.spec.ts`; `backend/src/modules/notifications/test/recover-email-deliveries.use-case.spec.ts`.
- Debe aplicar el usuario: Reservar trabajo en transacción corta; validar actividad/permiso; enviar fuera de ella; completar por lease token con SENT y recibo de procesamiento. Reprogramar solo errores transitorios con 5/10/20s; terminal FAILED tras presupuesto, CANCELLED si perdió elegibilidad. Recuperar leases vencidos por tenants habilitados; mensajes ocupados/tempranos no se convierten en envíos exitosos ni esquivan presupuesto.
- Lote mecánico posible para Codex, solo a petición: sincronizar imports, wiring o fixtures conforme a una transformación previamente acordada; no decidir lógica ni autorización.
- Comprobación y salida: C06: dos workers, vencimiento y token obsoleto, caída antes/después de envío, replays SENT/CANCELLED/FAILED, agotamiento y recuperación sin perder trabajos; SMTP aceptado/commit fallido queda como límite conocido.
- Evidencia obtenida: ninguna ejecución de este paso; solo diagnóstico estático inicial.
- Decisiones y trabajo restante: Evitar multiplicar retries de broker y job. No envolver SMTP en IdempotentConsumer transaccional ni mantener locks durante el envío.

### Paso 4 — SMTP y mensajería conectados

- Estado: `TODO`. Responsable: `USER` (Juanangel).
- Objetivo y razón: Integrar un segundo consumidor y un entorno reproducible de captura de email.
- Dependencias: Paso 3; cambio mínimo de runner/failure routing de NOTIF-01.
- Archivos previstos: `backend/src/modules/notifications/infrastructure/email/smtp-email-sender.adapter.ts`; `backend/src/modules/notifications/infrastructure/email/email.config.ts`; `backend/src/modules/notifications/infrastructure/messaging/email-consumer.runner.ts`; `backend/src/modules/notifications/notifications.module.ts`; `backend/src/shared/infrastructure/messaging/rabbitmq-topology.ts`; `backend/src/shared/infrastructure/messaging/worker-runtime.ts`; `backend/src/worker.module.ts`; `backend/package.json`; `backend/package-lock.json`; `docker-compose.integration.yml`; `backend/.env.example`.
- Debe aplicar el usuario: Añadir cola notifications.email.v1 y familia retries/DLQ; registrar arranque/parada y barrido. Configurar SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD y SMTP_FROM: en test solo servidor local de captura, sin cuentas reales. Proponer servicio integration-smtp con perfil integration y sin puertos host obligatorios. Actualizar lockfile solo por Compose.
- Lote mecánico posible para Codex, solo a petición: sincronizar imports, wiring o fixtures conforme a una transformación previamente acordada; no decidir lógica ni autorización.
- Comprobación y salida: C05-C06 con RabbitMQ y SMTP reales aislados; contenido capturado coincide con trabajo, cabeceras no filtran PII/token; audit e inbox siguen funcionando.
- Evidencia obtenida: ninguna ejecución de este paso; solo diagnóstico estático inicial.
- Decisiones y trabajo restante: Timeout SMTP acotado compatible con lease, shutdown espera trabajo en vuelo y credenciales fuera de logs. Config SMTP no crea servidor público ni CD.

### Paso 5 — Pruebas integradas y cierre

- Estado: `TODO`. Responsable: `USER` (Juanangel).
- Objetivo y razón: Demostrar notificación operativa tolerante a fallos y límites del proveedor.
- Dependencias: Paso 4; NOTIF-01 verificado.
- Archivos previstos: `backend/test/integration/notif-02.cjs`; `backend/test/notification-email.e2e-spec.ts`; `backend/package.json`; `backend/test/integration/README.md`; `docs/modules/notif-02-report.md`.
- Debe aplicar el usuario: Añadir runner test:notif-02 que use PostGIS/RabbitMQ/SMTP desechables, declare limpieza y no contacte correos reales. Probar aceptación SMTP, rechazo temporal/permanente, crash después de aceptación, deduplicación normal y pérdida de permiso. Documentar operación para fallidos y alcance externo pendiente.
- Lote mecánico posible para Codex, solo a petición: sincronizar imports, wiring o fixtures conforme a una transformación previamente acordada; no decidir lógica ni autorización.
- Comprobación y salida: C04-C06, build y regresión audit; captura local acreditada. SMTP acceptance no se presenta como entrega garantizada a una bandeja real.
- Evidencia obtenida: ninguna ejecución de este paso; solo diagnóstico estático inicial.
- Decisiones y trabajo restante: Flujo externo del producto sigue fuera de esta entrega y requiere plan explícito; separar implementación, pruebas, documentación y commit.

## Paso actual

Paso 1: revisar el contrato común con los otros responsables. Las firmas y rutas nuevas son propuestas; no hay API nueva disponible que Santiago pueda consumir todavía. Crear fixtures de contrato después del acuerdo y registrar las decisiones en el informe. La autorización de esta solicitud cubre documentación, no implementación del módulo.

Al terminar el contrato, implementar y comprobar un paso por vez. Reportar evidencia y esperar revisión humana antes de la siguiente fase, conforme a `AGENTS.md`. No marcar implementación `DONE` por tener documentación.

## Verificación reproducible prevista

```bash
docker compose exec backend npm run build
docker compose exec backend npm test -- --runInBand --testPathPatterns='modules/notifications|shared/test/messaging'
```

Tras crear scripts/infra y pasar las URLs exclusivamente de servidores desechables al backend:

```bash
docker compose exec backend npm run test:notif-01
docker compose exec backend npm run test:notif-02
```

Estos dos scripts son futuros. Verificar además regresión test:rmq-01; captura SMTP y broker reales deben tener evidencia independiente de mocks.

Todo tooling de aplicación se ejecuta en Compose. Los comandos son propuestas para después de implementar, no resultados actuales. Integración usa un PostgreSQL/PostGIS desechable y, donde corresponda, RabbitMQ/SMTP locales aislados; nunca la base demo compartida. No ejecutar seeds, resets ni migraciones sobre ella.

El formato se comprueba de forma acotada cuando lo exija el repositorio o un fallo concreto; no es una fase independiente. No usar el script backend de lint con `--fix` durante revisión.

## Decisiones

| Fecha | Decisión | Motivo | Consecuencia |
| --- | --- | --- | --- |
| 2026-11-09 | Coordinadores primero; externos después | Aprobación explícita del usuario | User.email como única fuente en v1; sin contacto nuevo de paquetes |
| 2026-11-09 | Email solo para pendiente y fallo | Acotar eventos y evitar ruido | Entrega exitosa se notifica solo en inbox |
| 2026-11-09 | SMTP fuera de transacción y job durable | Red no participa del commit local | Reserva/lease y recuperación; ventana de duplicado declarada |

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
