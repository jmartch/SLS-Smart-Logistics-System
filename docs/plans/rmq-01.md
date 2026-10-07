# RMQ-01: Asynchronous Event Processing, Outbox Publisher, Idempotent Consumer & Dead Letter Queue

## 1. Identidad del módulo y resumen ejecutivo

| Campo | Valor |
| --- | --- |
| Entregable | Plan conceptual y técnico; no implementación |
| Tareas | EVT-01, RMQ-01, IDEMP-01 y DLQ-01 |
| Prioridad / responsables | P0; Juanangel, con Humberto como apoyo |
| Estado de implementación del conjunto | `TODO`; existen infraestructura y productores previos |
| Estado del diseño | `REVIEW` |
| Fecha de auditoría | 2026-10-07, America/Bogota |
| Base inspeccionada | `develop`, commit `04be562606ffa81829ca55e886c7aac07973e5d0` |
| Rama documental | `codex/docs-rmq-01` |
| Informe de evidencia | [Informe RMQ-01](../modules/rmq-01-report.md) |
| Autoridad local | [AGENTS.md](../../AGENTS.md), especialmente §§8, 9, 13, 15, 17, 18, 22 y 27 |

### 1.1. Objetivo y garantías

Conectar las transacciones logísticas ya existentes con procesamiento asíncrono verificable. La API confirma la operación cuando PostgreSQL confirma los cambios de negocio y su outbox. Un proceso worker publica los eventos pendientes, consume mensajes con ACK manual y registra los fallos permanentes para inspección y redrive.

La garantía objetivo es **entrega al menos una vez y efectos locales idempotentes**. No se promete entrega exactamente una vez ni una transacción distribuida PostgreSQL–RabbitMQ. Una caída entre confirmación del broker y actualización del outbox puede producir una segunda publicación; la clave de `ProcessedEvent` impide repetir el efecto confirmado.

Una caída temporal de RabbitMQ deja el trabajo durable en PostgreSQL o en las colas y se recupera automáticamente. Esta garantía presupone conservación de los volúmenes, capacidad de almacenamiento disponible y recuperación de la infraestructura. Un broker de un solo nodo no aporta alta disponibilidad ni protege contra pérdida física de su volumen. Las publicaciones sin confirmación deben poder repetirse, porque el resultado puede ser incierto. [Guía oficial de fiabilidad](https://www.rabbitmq.com/docs/reliability).

```mermaid
flowchart LR
  API[API HTTP] --> TX[Transacción de negocio]
  TX --> DB[(PostgreSQL: negocio y OutboxEvent)]
  DB --> PUB[Worker: Outbox Publisher]
  PUB -->|persistent + mandatory + confirm| EX[Exchange de eventos]
  EX --> Q[Cola del consumidor]
  Q --> C[Consumidor idempotente]
  C --> CTX[Transacción: ProcessedEvent + efecto]
  CTX -->|commit y después ACK| Q
  C -->|fallo transitorio| RET[Retry 5s / 10s / 20s]
  RET -->|TTL + DLX de retorno| Q
  C -->|inválido o agotado| DLQ[DLQ durable]
  DLQ --> REC[Registrador de DLQ]
  REC --> DLM[(DeadLetterMessage)]
```

### 1.2. Auditoría de la realidad existente

| Elemento | Evidencia inspeccionada | Conclusión |
| --- | --- | --- |
| Broker | `docker-compose.yml`: `rabbitmq:4-management`, vhost `sls`, 5672/15672, volumen y healthcheck | Configurado; no requiere agregar otro broker |
| Estado en ejecución | `docker compose ps` no listó servicios; consultar versión devolvió `service "rabbitmq" is not running` | La salud indicada en el contexto del usuario no pudo corroborarse en esta sesión; no se levantaron servicios |
| Imagen | Tag móvil `4-management` | Fijar versión menor/parche o digest tras comprobar compatibilidad; no afirmar una versión exacta instalada |
| Prisma | `backend/prisma7.config.ts` usa `prisma/schema`; modelos en `schema/messaging.prisma` | El esquema real está dividido en archivos; no crear otro `schema.prisma` paralelo |
| Outbox | `routes`, `deliveries`, `packages` y `route-planning` escriben outbox en transacciones | Reutilizar los productores y normalizar su representación |
| Formato | `producer` no es columna; algunos payloads lo incluyen y otros no; `correlationId` es nullable | El publicador necesita compatibilidad explícita y ajustes pequeños de persistencia |
| Índices | Índice por tenant, `OutboxEvent.eventId` único y clave idempotente compuesta | Faltan índices operativos de polling e identidad de fallos DLQ |
| Tenant / RLS | Migración inicial habilita y fuerza RLS; `database/run-with-tenant.ts` configura `app.tenant_id` | Cada transacción del worker debe reutilizar esta frontera |
| Clientes / procesos | No hay `amqplib`, `worker.ts` ni `worker.module.ts` | Publicador, consumidores y recuperación son trabajo pendiente |
| Evento demostrable | `record-successful-delivery.use-case.ts` genera `PackageDelivered` y `DeliveryAttempted` | Usar `PackageDelivered` en la demostración |
| Cierre de ruta | No se encontró productor `RouteCompleted`; el tablero conserva ROUTE-CLOSE-01 pendiente | No depender de un evento todavía no implementado |
| Identidad HTTP | `shared/presentation/request-context.decorator.ts` permite fallback a cabeceras; no hay directorios `modules/auth` o `modules/tenants` en esta revisión | No considerar autenticación pública resuelta por la documentación histórica |
| Compilación estricta | `tsconfig.json` no activa todas las opciones de strict | Mantener los contratos nuevos tipados, sin atribuir strict completo al proyecto; endurecimiento global en tarea separada |

La lectura del repositorio verifica existencia y estructura, no que las migraciones estén aplicadas en una base viva. Los informes de módulos anteriores son referencias, no una nueva ejecución de sus pruebas.

### 1.3. Alcance y aceptación por tarea

| Tarea | Alcance de este plan | Aceptación comprobable |
| --- | --- | --- |
| EVT-01 | Envelope, catálogo versionado, validación en ejecución, normalización de productores y compatibilidad histórica | Todo evento publicado contiene los ocho campos; un contrato inválido se rechaza con motivo estable; metadatos contradictorios no se aceptan |
| RMQ-01 | Topología, worker sin HTTP, outbox con reserva concurrente, publicación confirmada y recuperación | Operación real crea `PENDING`; tras confirmación queda `PUBLISHED`; dos publicadores no poseen simultáneamente la misma reserva vigente; caída/reinicio no elimina la intención |
| IDEMP-01 | Coordinador idempotente, UoW por tenant y consumidor de auditoría real | Duplicados secuenciales y concurrentes generan un solo efecto; rollback no deja `ProcessedEvent`; ACK sucede después del commit |
| DLQ-01 | Tres reintentos, DLQ, registro durable deduplicado, cuarentena sin identidad y redrive deliberado | Error transitorio admite 1 intento inicial + 3 reintentos; poison válido en identidad llega a DLQ y a `DeadLetterMessage`; redrive tiene actor operativo, motivo y trazabilidad |

Incluye un consumidor de auditoría de eventos como primer efecto persistente. Para `PackageDelivered` registra recepción del evento; no vuelve a entregar el paquete. Este consumidor demuestra el patrón sin implementar anticipadamente NOTIF-01/02.

No incluye envío de email, interfaz de inspección, lógica de cierre de rutas, nuevos algoritmos, Kafka, microservicios por módulo ni un panel de administración. La integración futura de notificaciones debe guardar intención de envío y deduplicar por tenant, evento, destinatario y canal; un envío externo no se vuelve atómico por colocarlo dentro de una transacción SQL.

Dependencias: esquema y RLS existentes, productores logísticos, PostgreSQL/PostGIS para las migraciones y RabbitMQ con políticas verificadas. AUTH-01 es una dependencia para exponer operaciones administrativas o afirmar un flujo HTTP públicamente seguro. La demostración interna puede usar fixtures confiables y una herramienta operativa restringida.

## 2. Contrato canónico de eventos — EVT-01

### 2.1. Envelope en TypeScript

Los contratos de integración pertenecen a `shared/application/messaging`, sin imports de NestJS, Prisma o AMQP. Los eventos internos del dominio pueden conservar `Date` y su forma actual; un mapper en la frontera genera JSON serializable.

```typescript
export type JsonValue =
  | null | boolean | number | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export interface EventEnvelope<
  TType extends string,
  TVersion extends number,
  TPayload extends JsonValue,
> {
  readonly eventId: string;       // UUID estable durante toda su vida
  readonly tenantId: string;      // UUID derivado de contexto confiable
  readonly correlationId: string; // UUID de la operación original
  readonly eventType: TType;
  readonly occurredAt: string;    // ISO 8601 UTC; nunca se renueva al reintentar
  readonly producer: string;      // identificador lógico, no hostname
  readonly version: TVersion;
  readonly payload: TPayload;
}

export type PackageDeliveredV1 = EventEnvelope<
  'PackageDelivered',
  1,
  {
    readonly packageId: string;
    readonly routeId: string;
    readonly stopId: string;
    readonly attemptId: string;
  }
>;

export type EventValidationResult<T> =
  | { readonly kind: 'VALID'; readonly event: T }
  | {
      readonly kind: 'INVALID';
      readonly code: string;
      readonly field?: string;
      readonly message: string;
    };
```

`EventEnvelope` no basta para validar mensajes externos: el parser recibe `unknown`, comprueba objetos, campos, UUID, números finitos, fecha y catálogo `(eventType, version, producer)`, y solo entonces devuelve un tipo conocido. Los errores contractuales usan códigos y mensajes en inglés; la explicación del documento permanece en español.

Ejemplo de transporte:

```json
{
  "eventId": "41d37449-68a4-4d23-a818-c793e2e51b36",
  "tenantId": "51083af7-26d2-4b61-bb7e-9f46b3377811",
  "correlationId": "57930541-1e44-42ac-8808-699da79b4364",
  "eventType": "PackageDelivered",
  "occurredAt": "2026-10-07T15:30:00.000Z",
  "producer": "sls-backend.deliveries",
  "version": 1,
  "payload": {
    "packageId": "b71c9774-2703-456b-8938-e59f284ef28d",
    "routeId": "cc014364-a031-49eb-9356-2769ce04bfd5",
    "stopId": "5b829274-5205-4c7a-bc31-9c19be365248",
    "attemptId": "45f1cd3c-962d-4822-b65e-103d1b671baa"
  }
}
```

### 2.2. Versionado y compatibilidad del outbox

- `eventId` identifica el hecho; no se regenera al publicar, reintentar o hacer redrive.
- `version` identifica el contrato del evento. Un cambio incompatible requiere nueva versión y validadores diferenciados; el nombre del consumidor solo cambia si se desea un nuevo efecto independiente.
- `correlationId` se propaga desde la operación; para filas históricas sin valor, usar `eventId` como fallback determinista y dejar evidencia de compatibilidad. No generar un UUID distinto en cada lectura.
- Productores canónicos: `sls-backend.routes`, `sls-backend.deliveries`, `sls-backend.packages`, `sls-backend.route-planning`.
- Separar nombres de dominio y nombres de transporte. No renombrar `DeliveryFailed` a `PackageDeliveryFailed` porque un informe anterior use el segundo nombre.
- Inventariar todos los nombres actuales antes de activar el publisher general: las cuatro familias de rutas, el catálogo `PackageEventType` y los eventos adicionales de entregas, incluyendo `DeliveryAttempted`, `PackageReceivedAtDepot` e `IncidentReported`.
- El registro admite variantes históricas identificables. `PackageDelivered` de State puede contener solo la transición de paquete; el de deliveries contiene los cuatro IDs del ejemplo. La normalización no inventa `attemptId`. Los consumidores que requieren datos de entrega se suscriben a la variante de productor apropiada; el consumidor de auditoría admite ambas variantes registradas.

| Productor actual | Forma observada | Acción propuesta |
| --- | --- | --- |
| routes | Columnas de envelope y `payload: { ...domainEvent }`, que contiene metadatos y fechas | Persistir `producer` explícitamente; normalizar las fechas y extraer payload operativo mediante mapper |
| deliveries | Columnas de envelope y payload mínimo; `producer` del contrato se descarta en persistencia | Guardar el campo `producer`; conservar el payload mínimo |
| packages | `producer: sls-backend.packages` dentro del JSON de transición | Elevar productor a columna al escribir; mapper compatible para filas anteriores |
| route-planning | Evento State embebido con `aggregateId`, tenant y fecha; sin productor persistido | Persistir productor, versión y fecha del hecho; normalizar `aggregateId` a `packageId` cuando el contrato lo indique |

Las columnas de identidad del outbox son la referencia de publicación. Si el JSON antiguo incluye `tenantId`, `eventType`, versión o IDs de envelope contradictorios, fallar explícitamente; no sobrescribir silenciosamente. La fecha de una fila histórica de planning puede ser la fecha de inserción: usar la fecha del evento embebido solo bajo una regla de migración documentada y determinista.

Para registros sin productor recuperable, primero contar e inspeccionar por forma y tipo en una auditoría por tenant. Aplicar un mapeo legado explícito únicamente cuando la combinación sea inequívoca; si no lo es, conservar la fila en `FAILED` con `OUTBOX_LEGACY_EVENT_AMBIGUOUS`. Nunca atribuir todo el historial al worker. Las reglas de normalización permanecen estables mientras haya filas antiguas o redrives pendientes.

### 2.3. Metadatos AMQP y confianza

| Propiedad | Valor propuesto |
| --- | --- |
| `contentType` / `contentEncoding` | `application/json` / `utf-8` |
| `persistent` | `true` |
| `mandatory` | `true` en publicaciones de aplicación |
| `messageId` | `eventId` |
| `correlationId` | ID original de correlación |
| `type` / `appId` | `eventType` / `producer` |
| `timestamp` | Fecha del evento en segundos, como metadata auxiliar |
| `x-sls-tenant-id`, `x-sls-version` | Copias verificables del envelope |
| `x-sls-original-routing-key` | Ruta canónica inicial, preservada en retries y DLQ |
| `x-sls-retry-count` | `0` inicialmente; luego `1`, `2`, `3` |
| `x-sls-redrive-id` | Ausente en primera ejecución; UUID de solicitud en un redrive |

Una routing key o un header no autentican al emisor. Solo servicios internos autorizados pueden escribir en estos exchanges; el navegador y los tenants no reciben credenciales AMQP. Provisionar permisos separados de publicación, consumo y administración fuera de desarrollo. Los permisos de RabbitMQ son parte de la frontera de acceso, no reemplazan la autorización de negocio. [Control de acceso oficial](https://www.rabbitmq.com/docs/access-control).

Al consumir, comprobar igualdad entre identidad del envelope, propiedades y ruta original. Un tenant no habilitado para ese worker, un conflicto de identidad o un mensaje sin procedencia interna confiable va a cuarentena y no establece contexto RLS. Los consumidores de negocio futuros comprueban además las relaciones de sus IDs usando puertos del módulo propietario. El consumidor de auditoría solo escribe en su tenant y no lee ni modifica paquetes de otros módulos.

## 3. Topología de RabbitMQ — RMQ-01

### 3.1. Exchanges, suscripciones y colas

Vhost: `sls`. Conexión de desarrollo dentro de Compose: `amqp://sls:sls@rabbitmq:5672/sls`. La contraseña de ejemplo no se incorpora al código ni se imprime en logs.

| Exchange durable | Tipo | Función |
| --- | --- | --- |
| `sls.events.v1` | topic | Distribución inicial de eventos de integración |
| `sls.retry.v1` | direct | Selección de consumidor y escalón de espera |
| `sls.return.v1` | direct | Retorno exclusivo al consumidor original y publicación de redrives |
| `sls.dead.v1` | direct | Envío a DLQ por consumidor |
| `sls.quarantine.v1` | direct | Retención de mensajes sin identidad confiable |

La versión en el nombre del exchange identifica esta topología, no limita la versión del envelope. Routing key inicial: `tenant.<tenantId>.<eventType>.v<version>`, por ejemplo `tenant.51083af7-26d2-4b61-bb7e-9f46b3377811.PackageDelivered.v1`.

Primer consumidor lógico: `audit.integration-events.v1`. Todas sus réplicas comparten ese nombre y su cola. Consumidores con efectos diferentes tendrán colas y `consumerName` diferentes; no se agregan anticipadamente las colas de notificaciones.

| Cola durable, no exclusiva, sin auto-delete | Binding / configuración |
| --- | --- |
| `sls.audit.integration-events.v1` | `sls.events.v1` con `tenant.*.#`; también `sls.return.v1` con `audit.integration-events.v1` |
| `sls.audit.integration-events.v1.retry.5s` | `sls.retry.v1`, key `audit.integration-events.v1.retry.1`, TTL `5000` ms |
| `sls.audit.integration-events.v1.retry.10s` | `sls.retry.v1`, key `audit.integration-events.v1.retry.2`, TTL `10000` ms |
| `sls.audit.integration-events.v1.retry.20s` | `sls.retry.v1`, key `audit.integration-events.v1.retry.3`, TTL `20000` ms |
| `sls.audit.integration-events.v1.dlq` | `sls.dead.v1`, key `audit.integration-events.v1` |
| `sls.quarantine.v1` | `sls.quarantine.v1`, key `unattributed` |

El consumidor de auditoría tiene interés explícito en todos los contratos del catálogo. Su binding amplio no convierte mensajes desconocidos en éxitos: los envía a DLQ si tienen identidad confiable. Al agregar un consumidor de negocio, declarar sus bindings exactos y verificar el manifiesto completo; `mandatory` prueba que existe algún destino, no que estén presentes todos los suscriptores esperados.

La ruta de retorno es por consumidor, no por evento: reinyectar un retry en `sls.events.v1` volvería a enviarlo a otros suscriptores. El tenant se conserva en envelope y headers incluso cuando la ruta de retorno no lo contiene. No se crea una cola por tenant; la segregación de datos se garantiza en consumidores y PostgreSQL.

### 3.2. DLX, TTL y seguridad del traslado

| Cola origen | `x-dead-letter-exchange` | `x-dead-letter-routing-key` |
| --- | --- | --- |
| Principal | `sls.dead.v1` | `audit.integration-events.v1` |
| Cada retry | `sls.return.v1` | `audit.integration-events.v1` |
| DLQ y cuarentena | Sin retorno automático al flujo de negocio | No aplica |

Propuesta: **quorum queues** para la principal, retries, DLQ y cuarentena. En principal y retries habilitar política `dead-letter-strategy=at-least-once`, `overflow=reject-publish` y DLX. Quorum por sí solo no activa traslado seguro; la estrategia predeterminada puede ser `at-most-once`. Comprobar también los feature flags requeridos por la versión fijada. [Requisitos de dead-lettering con quorum](https://www.rabbitmq.com/docs/4.1/quorum-queues#activating-at-least-once-dead-lettering).

Los nombres `x-dead-letter-*` anteriores son las propiedades de cola exigidas por el diseño. Preferir configurarlas mediante políticas versionadas de broker, con claves `dead-letter-exchange` y `dead-letter-routing-key`; `x-message-ttl` corresponde a `message-ttl`. Si se usan argumentos en la declaración para el laboratorio, deben coincidir exactamente y no sobreescribir políticas distintas. RabbitMQ recomienda políticas porque los argumentos pueden exigir recrear la cola para cambiarlos. No borrar colas con mensajes para resolver una incompatibilidad de declaración. [Documentación de DLX](https://www.rabbitmq.com/docs/4.1/dlx).

Usar una cola por intervalo evita mezclar expiraciones heterogéneas en una misma espera. El TTL indica cuándo un mensaje puede expirar; no es un SLA exacto de ejecución. Las pruebas permiten tolerancia y verifican causalidad. No asignar TTL de mensajes a la cola principal, DLQ o cuarentena. [Semántica de TTL](https://www.rabbitmq.com/docs/4.1/ttl).

La principal conserva un límite defensivo de redeliveries del broker, por ejemplo `delivery-limit=20`, con destino DLQ. Es una protección ante cierres repetidos de canal, independiente de los tres retries de aplicación. DLQ y cuarentena usan `x-delivery-limit=-1`, sin consumo en bucle cuando su persistencia falla, para evitar descartar evidencia por repetidas caídas del registrador. Configurar límites de capacidad con rechazo de nuevas publicaciones, nunca eliminación de las más antiguas. Verificar estas opciones en la versión concreta antes del despliegue. [Poison message handling en quorum](https://www.rabbitmq.com/docs/4.1/quorum-queues#poison-message-handling).

### 3.3. Configuración inicial propuesta

| Variable | Valor inicial / criterio |
| --- | --- |
| `RABBITMQ_URL` | URL interna desde configuración de entorno |
| `MESSAGING_TENANT_IDS` | Lista explícita de UUID autorizados para este worker; obligatoria en MVP |
| `OUTBOX_POLL_INTERVAL_MS` | `1000` |
| `OUTBOX_BATCH_SIZE` | `20` por tenant, con publicación concurrente limitada |
| `OUTBOX_PUBLISH_CONCURRENCY` | `5`; renovar reserva mientras se espera turno |
| `OUTBOX_LEASE_MS` | `60000`; debe cubrir el trabajo o renovarse |
| `AMQP_CONFIRM_TIMEOUT_MS` | `10000` |
| `AMQP_HEARTBEAT_SECONDS` | `30` |
| `CONSUMER_PREFETCH` | `10` por consumidor/canal, ejecución activa máxima `5` |
| `WORKER_SHUTDOWN_TIMEOUT_MS` | `30000` |
| Retry de negocio | Tres escalones fijos, `5000`, `10000`, `20000` ms |

La lista de tenants proviene del despliegue confiable y permite comenzar sin un bypass global de RLS. Recorrerla con reparto equitativo; procesar también pendientes de un tenant suspendido cuando la política operativa autorice drenar su trabajo. No filtrar automáticamente por `ACTIVE` y abandonar mensajes históricos. La incorporación dinámica de empresas requerirá posteriormente un puerto público del módulo tenants; no se implementa consultando sus tablas arbitrariamente desde messaging.

## 4. Mecanismo del Outbox Publisher — RMQ-01

### 4.1. Decisión de concurrencia

Usar polling como mecanismo de recuperación permanente. Una señal reactiva futura puede reducir latencia, pero no sustituye el barrido durable. Elegir **reserva temporal con token y adquisición mediante `FOR UPDATE SKIP LOCKED`**, en una transacción corta por tenant. Publicar fuera de la transacción SQL.

Mantener un bloqueo SQL abierto mientras se espera al broker funciona para un prototipo pequeño, pero ocupa conexiones durante una caída y dificulta los timeouts. La reserva agrega unas columnas y permite recuperar trabajo después de morir un proceso. `SKIP LOCKED` es apropiado para coordinar lectores de una tabla usada como cola, aunque no produce una vista consistente de propósito general. [PostgreSQL 17: SELECT y locking](https://www.postgresql.org/docs/17/sql-select.html).

### 4.2. Cambios de esquema propuestos, aún no aplicados

| Modelo | Cambio | Motivo |
| --- | --- | --- |
| `OutboxEvent` | `producer String?` durante transición | Conservar el productor sin depender del contenido de payload |
| `OutboxEvent` | `leaseToken String? @db.Uuid`, `lockedUntil DateTime?` | Reservar, renovar y cercar actualizaciones tardías |
| `OutboxEvent` | `nextAttemptAt DateTime @default(now())`, `lastError String?` | Programar recuperación y diagnosticar sin perder filas |
| `OutboxEvent` | Índice compuesto `(tenantId, status, nextAttemptAt, occurredAt, id)` | Barrido ordenado dentro de RLS |
| `DeadLetterMessage` | `failureKey String @unique`, `transportMetadata Json` | Deduplicar traslados y conservar headers, ruta y ciclo |
| `DeadLetterMessage` | Índice `(tenantId, failedAt, id)` y unique `(tenantId, id)` | Inspección y referencia compuesta desde redrive |
| `DeadLetterRedrive` nuevo | Intención durable de republicación dirigida, definida en §6.5 | Recuperar caídas durante una operación administrativa |

Conservar `OutboxEventStatus = PENDING | PUBLISHED | FAILED`. Una fila reservada sigue `PENDING`; `lockedUntil` y `leaseToken` indican propiedad temporal. `FAILED` significa intervención requerida por contrato local inválido o incompatibilidad, no caída temporal del broker.

La migración debe ser aditiva, revisar datos existentes y completar valores de las nuevas columnas sin borrar historial. Para DLQ histórico usar inicialmente una clave legada única por fila; no consolidar registros previos sin auditoría. Los writers nuevos exigen productor aunque la columna permanezca nullable durante compatibilidad. No hacer `NOT NULL` hasta resolver o separar explícitamente el historial ambiguo. Mantener RLS, grants y relaciones compuestas en los modelos nuevos.

### 4.3. Ciclo de publicación

1. Leer un tenant de la lista operativa. Abrir `runWithTenant(prisma, tenantId, ...)` usando `RUNTIME_DATABASE_URL` y rol sin `BYPASSRLS` ni superusuario.
2. Seleccionar filas `PENDING`, vencidas para envío y sin reserva vigente, ordenadas por `occurredAt, id`; aplicar `FOR UPDATE SKIP LOCKED LIMIT batch`.
3. Asignar un token por fila, `lockedUntil = now() + lease`, e incrementar `attempts`; devolver snapshot y hacer commit. `attempts` cuenta reservas/intentos del publicador, no ejecuciones de negocio.
4. Normalizar y validar cada snapshot. Si es inválido, marcar `FAILED` con motivo y conservar el registro bajo comparación de token; no enviarlo repetidamente al broker.
5. Verificar que la reserva sigue vigente; renovarla periódicamente con comparación de token mientras haya publicación en curso. Dejar de iniciar envíos si se pierde su propiedad.
6. Publicar JSON persistente y mandatory en un confirm channel. Esperar la confirmación individual y comprobar ausencia de `basic.return`.
7. Tras éxito, nueva transacción por tenant: actualizar `PUBLISHED`, `publishedAt`, limpiar reserva y error, únicamente si coinciden tenant, ID, estado y token.
8. Ante rechazo, cierre, return o timeout: mantener `PENDING`, liberar reserva propia y fijar `nextAttemptAt` con backoff. Si el proceso muere, la expiración de reserva permite recuperar la fila.

Esquema SQL orientativo de selección, siempre parametrizado dentro de la transacción con RLS:

```sql
SELECT "id"
FROM "OutboxEvent"
WHERE "tenantId" = $1::uuid
  AND "status" = 'PENDING'
  AND "nextAttemptAt" <= now()
  AND ("lockedUntil" IS NULL OR "lockedUntil" <= now())
ORDER BY "occurredAt", "id"
LIMIT $2
FOR UPDATE SKIP LOCKED;
```

La transacción de claim actualiza exactamente las filas bloqueadas. No hacer SELECT, commit y UPDATE de reserva por separado. Una devolución tardía no puede liberar la reserva de otro proceso: todo update usa `leaseToken`. La reserva reduce colisiones, pero no elimina duplicados cuando el broker confirma después de expirar el lease.

### 4.4. Confirms y ventanas de fallo

Usar `amqplib` directamente detrás del puerto `EventPublisher`, porque este entregable necesita control de confirms, returns, canales y ACK. Agregar `amqplib` y sus tipos mediante Compose; no agregar un segundo framework de transporte.

`publish()` devuelve control de flujo del buffer, no una confirmación durable ni una promesa de consumo. Si devuelve `false`, esperar `drain`; para confirmar usar el callback del confirm channel o un mecanismo equivalente por publicación. Registrar listeners de `error`, `close` y `return`, con identificador local de publicación para correlacionar devoluciones concurrentes. [API oficial de amqplib](https://amqp-node.github.io/amqplib/channel_api.html).

Un mensaje sin binding puede recibir confirmación positiva; `mandatory` provoca un return previo. Por eso el criterio de éxito es **confirm positivo y sin return**, no solo `waitForConfirms()`. Confirmación del publisher y ACK del consumidor cubren etapas independientes. [Confirms y mensajes sin ruta](https://www.rabbitmq.com/docs/4.1/confirms#when-will-published-messages-be-confirmed-by-the-broker).

| Punto de fallo | Recuperación prevista |
| --- | --- |
| Antes del commit del negocio | No existe efecto ni outbox |
| Después del commit, antes del claim | La fila permanece `PENDING` |
| Después del claim, antes de enviar | Expira la reserva y otro ciclo la toma |
| Broker acepta y se pierde confirm | Resultado incierto: repetir el mismo `eventId` |
| Confirm llega y falla update a `PUBLISHED` | Repetición posible; consumidor deduplica |
| Publicación devuelve `NO_ROUTE` | No marcar `PUBLISHED`; alertar y reintentar con pausa mientras se corrige topología |
| Contrato persistido inválido | `FAILED`, motivo visible, recuperación administrativa explícita |

Backoff del **publisher**: `min(60000, 1000 * 2^n)` ms más jitter acotado, calculando sin desbordamiento. Una caída prolongada no agota un presupuesto de tres envíos ni elimina el evento. Los tres reintentos se aplican al consumidor, no al barrido de outbox. La reconexión tiene backoff independiente y no ocupa transacciones SQL.

No se garantiza orden global ni por agregado con varios publishers, consumidores y retries. Los efectos elegidos son independientes del orden. Un consumidor que construya una proyección sensible al orden necesitará secuencia de agregado y política propia antes de activarse.

## 5. Arquitectura del worker y consumidor idempotente — IDEMP-01

### 5.1. Procesos y composición

La API conserva `src/main.ts` y `AppModule`. El proceso asíncrono usa `src/worker.ts`, `WorkerModule` y la misma imagen del backend. No importa `AppModule` ni inicia controllers HTTP. NestJS permite crear un contexto de aplicación sin servidor HTTP. [Aplicaciones standalone](https://docs.nestjs.com/standalone-applications).

```typescript
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks(['SIGINT', 'SIGTERM']);
}

void bootstrap().catch((error: unknown) => {
  // Reportar error de arranque sanitizado mediante el logger del proceso.
  process.exitCode = 1;
});
```

El snippet ilustra el punto de entrada; el arranque real coordina configuración, dependencias, topología y readiness mediante `WorkerRuntime`. El catch no debe ocultar el error ni imprimir URLs con credenciales.

| Componente | Responsabilidad y límites |
| --- | --- |
| `WorkerModule` | Composition root: Prisma, módulo de messaging y módulo audit; factories de puertos/adaptadores |
| `OutboxPublisher` | Aplicación pura: coordina claim, normalización, publicación y resultado; no conoce SQL ni AMQP |
| `IdempotentConsumer<S>` | Aplicación pura: coordina registro y efecto dentro del UoW; devuelve `PROCESSED` o `DUPLICATE` |
| `AuditIntegrationEventConsumer` | Decide qué recibo de auditoría guardar; no vuelve a ejecutar una transición logística |
| `RabbitmqConsumerRunner` | Infraestructura: entrega, parseo, invocación, ACK, retry/DLQ y cancelación |
| `PrismaAuditConsumerUnitOfWork` | Abre una transacción con tenant y entrega repositorios que comparten su cliente; no decide el flujo de negocio |
| `DeadLetterRecorder` | Aplicación: valida contexto del fallo y solicita su persistencia idempotente |
| `DeadLetterRedrivePublisher` | Aplicación: procesa solicitudes durables de republicación dirigida con confirms |

Los puertos compartidos modelan acciones como `claimDue`, `markPublished`, `tryRegister`, `publishConfirmed`, `recordFailure` y `requestRedrive`. No reciben `Prisma.TransactionClient`, `Channel`, `ConsumeMessage`, `Buffer` ni excepciones Nest en sus contratos públicos. Infraestructura transforma bytes en datos y fallos tipados.

No crear dependencias de `domain/` hacia `shared/application/`. Los mappers que convierten eventos de dominio a integración viven en application o infraestructura de persistencia del módulo propietario. Composition roots pueden importar implementaciones únicamente para conectarlas.

### 5.2. Secuencia de arranque y apagado

1. Validar variables, tenants autorizados, relación de timeouts y configuración de reintentos.
2. Conectar Prisma con el rol runtime. Verificar que no sea superusuario ni tenga `BYPASSRLS`; un arranque privilegiado no es aceptable para la prueba de aislamiento.
3. Abrir conexión AMQP, declarar/verificar exchanges, colas y bindings; comprobar políticas mediante el provisionamiento administrativo, sin distribuir credenciales management al worker normal.
4. Crear canales separados para confirms y consumo. Configurar `prefetch`, consumidores con `noAck: false` y handlers de reconexión.
5. Registrar primero consumo y registrador DLQ; comenzar después polling del outbox y del redrive.
6. Ante pérdida de conexión, invalidar canales, no reutilizar delivery tags, pausar readiness y reconstruir canales/topología/suscripciones al reconectar. Una incompatibilidad de configuración termina el arranque con diagnóstico; no se trata como mensaje poison.
7. Ante SIGTERM, dejar de adquirir reservas, cancelar nuevas entregas, drenar trabajo hasta el deadline y cerrar canales antes de desconectar Prisma. Un mensaje sin commit queda sin ACK; una reserva incompleta se libera si es seguro o vence por lease.

Readiness distingue conexión SQL, conexión AMQP, topología lista y loop activo. La API puede seguir recibiendo operaciones con outbox cuando RabbitMQ está caído. El Compose actual condiciona el arranque de backend a la salud del broker: **retirar esa dependencia del servicio API** y conservarla solo para worker/provisionamiento, evitando impedir el inicio HTTP durante una indisponibilidad AMQP.

Compartir una etiqueta de imagen construida una sola vez. En producción arrancar API y worker desde artefactos compilados inmutables. En desarrollo no ejecutar dos watchers que borren simultáneamente el mismo `dist`; usar una compilación coordinada o un servicio worker con reinicio explícito. Verificar la ruta real emitida (`dist/worker.js` o `dist/src/worker.js`) antes de fijar scripts, considerando que el cliente Prisma generado está fuera de `src`.

### 5.3. Registro idempotente y efecto atómico

Elegir una clase coordinadora por composición, no decoradores con efectos de transacción ocultos. La identidad es exactamente `(tenantId, eventId, consumerName)`; nunca usar PID, hostname, nombre de instancia o delivery tag.

```typescript
export interface ProcessingIdentity {
  readonly tenantId: string;
  readonly eventId: string;
  readonly consumerName: string;
}

export interface ConsumerSession {
  readonly processedEvents: {
    tryRegister(identity: ProcessingIdentity): Promise<boolean>;
  };
}

export interface ConsumerUnitOfWork<S extends ConsumerSession> {
  run<T>(tenantId: string, work: (session: S) => Promise<T>): Promise<T>;
}

export class IdempotentConsumer<S extends ConsumerSession> {
  constructor(private readonly unitOfWork: ConsumerUnitOfWork<S>) {}

  async execute(
    identity: ProcessingIdentity,
    effect: (session: S) => Promise<void>,
  ): Promise<'PROCESSED' | 'DUPLICATE'> {
    return this.unitOfWork.run(identity.tenantId, async (session) => {
      const acquired = await session.processedEvents.tryRegister(identity);
      if (!acquired) return 'DUPLICATE';
      await effect(session);
      return 'PROCESSED';
    });
  }
}
```

El UoW solo resuelve su promesa después del commit. El runner AMQP hace `ack(message, false)` tras recibir `PROCESSED` o `DUPLICATE`; no hay ACK dentro del callback transaccional. Para futuros efectos, cada sesión añade puertos específicos del consumidor, por ejemplo `AuditConsumerSession extends ConsumerSession` con `audit.appendReceipt(...)`.

La implementación PostgreSQL de `tryRegister` usa la clave única como árbitro concurrente:

```sql
INSERT INTO "ProcessedEvent"
  ("id", "tenantId", "eventId", "consumerName", "processedAt")
VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3, now())
ON CONFLICT ("tenantId", "eventId", "consumerName") DO NOTHING
RETURNING "id";
```

Si devuelve fila, se ejecuta el efecto. Si no devuelve, el efecto ya está confirmado por otro procesamiento. Con aislamiento `READ COMMITTED`, la restricción única coordina inserciones concurrentes; ante rollback del primero, el competidor puede insertar. Si un consumidor necesita otro aislamiento por sus reglas, reintentar conflictos de serialización de forma acotada, sin clasificarlos como duplicados. [PostgreSQL 17: ON CONFLICT](https://www.postgresql.org/docs/17/sql-insert.html).

No implementar `findUnique -> if absent -> effect -> create`: tiene carrera. No capturar cualquier `P2002` como duplicate; podría venir de una restricción distinta del efecto. Tampoco atrapar una violación única dentro de una transacción PostgreSQL y seguir escribiendo en una transacción abortada. La consulta anterior evita usar una excepción como flujo de deduplicación.

`ProcessedEvent` y efecto deben compartir **el mismo cliente transaccional**. No llamar un servicio que abra una segunda transacción por fuera. Una excepción, timeout o fallo de commit revierte ambos. Las transacciones interactivas tienen límites y no deben contener llamadas de red; `publish` o envío de email quedan fuera. [Transacciones Prisma](https://www.prisma.io/docs/orm/fundamentals/transactions).

### 5.4. Demostración con PackageDelivered

Consumidor: `audit.integration-events.v1`. Efecto: insertar en `AuditLog` un recibo de integración con:

- `tenantId`: el del contexto verificado.
- `actorUserId: null`: acción del worker; no inventar un usuario humano.
- `action: INTEGRATION_EVENT_RECEIVED`, `entityType: INTEGRATION_EVENT`, `entityId: eventId`.
- `correlationId`: correlación original.
- `metadata`: `consumerName`, `eventType`, versión, productor e IDs operativos permitidos por el catálogo. No guardar evidencia binaria, notas, direcciones ni el envelope completo sin necesidad.

Flujo verificable: caso de uso de entrega existente -> outbox -> publicador -> cola -> commit de `ProcessedEvent` y recibo -> ACK. Un duplicado concurrente no genera un segundo recibo. Si el proceso cae tras el commit y antes del ACK, la redelivery se reconoce como `DUPLICATE`.

La auditoría transaccional del productor registra la operación logística; este nuevo recibo registra el procesamiento asíncrono. Son acciones distintas y deben poder distinguirse en las consultas. El módulo audit posee sus escrituras; messaging no modifica directamente las tablas de rutas, entregas o paquetes.

### 5.5. Aislamiento por tenant

- Toda lectura o escritura tenant-owned incluye filtro de tenant además de RLS.
- Configurar `app.tenant_id` con `set_config(..., true)` dentro de la transacción; nunca usar una variable global mutable compartida entre mensajes.
- El worker usa la URL runtime existente. No usar `DATABASE_URL` administrativa para evitar que una consulta sin contexto devuelva cero filas.
- El barrido itera tenants configurados y abre una transacción aislada por tenant; no hace un SELECT global del outbox saltándose políticas.
- Publicación, DLQ, redrive y auditoría mantienen la identidad verificada. El mismo `eventId` en `ProcessedEvent` para A y B no colisiona; la unicidad global de `OutboxEvent.eventId` se mantiene sin cambios.
- Las pruebas ejecutan SQL con el rol no privilegiado. RLS puede ser omitido por superusuarios y roles con `BYPASSRLS`, de modo que una prueba administrativa no demuestra aislamiento. [PostgreSQL: seguridad por filas](https://www.postgresql.org/docs/17/ddl-rowsecurity.html).

El fallback HTTP a cabeceras observado es deuda real: una cadena asíncrona no vuelve confiable una operación originada con identidad manipulable. Mantener la exposición pública condicionada al cierre de AUTH-01/TENANT-01 y probar la canalización con contexto confiable. No incorporar ese fallback a mensajes ni a herramientas de redrive.

## 6. Estrategia de resiliencia y Dead Letter Queue — DLQ-01

### 6.1. Clasificación y presupuesto

| Resultado | Acción de aplicación | Disposición AMQP |
| --- | --- | --- |
| Efecto confirmado | Persistir registro idempotente y efecto | ACK manual |
| Duplicado confirmado | No repetir efecto | ACK manual |
| Resultado de negocio esperado | Persistir resultado explícito, como `PENDING_ASSIGNMENT` | Commit y ACK; nunca DLQ por falta normal de capacidad |
| Fallo transitorio de SQL o recurso temporal | Rollback; programar siguiente escalón | Publicar retry con confirm; después ACK original |
| Payload/versión inválidos con identidad confiable | No ejecutar efecto | Publicar DLQ con diagnóstico, confirmar, después ACK |
| Reintentos agotados | No registrar éxito | Publicar DLQ, confirmar, después ACK |
| Error inesperado de código | Clasificar como permanente salvo evidencia de transitoriedad | DLQ y alerta; no esconderlo en un catch genérico |
| Identidad ausente, tenant contradictorio o no confiable | No abrir transacción de tenant | Cuarentena confirmada y ACK original |
| No puede publicarse retry/DLQ/cuarentena | Conservar responsabilidad del mensaje | No ACK; pausar/cerrar canal con backoff y recuperarlo |

Los códigos propuestos de mensajería son `EVENT_INVALID_JSON`, `EVENT_INVALID_ENVELOPE`, `EVENT_UNSUPPORTED_VERSION`, `EVENT_IDENTITY_MISMATCH`, `EVENT_RETRIES_EXHAUSTED`, `EVENT_HANDLER_FAILURE`, `OUTBOX_LEGACY_EVENT_AMBIGUOUS` y `BROKER_DELIVERY_LIMIT_EXCEEDED`. Usar tipos de error, no búsqueda por substring de mensajes. Guardar motivo sanitizado; una traza o cadena SQL con datos personales no va a `failureReason`.

| Ejecución lógica | `x-sls-retry-count` recibido | Si falla transitoriamente |
| --- | --- | --- |
| Inicial | `0` | Publicar en retry.1, contador `1`, esperar al menos 5 s |
| Reintento 1 | `1` | Publicar en retry.2, contador `2`, esperar al menos 10 s |
| Reintento 2 | `2` | Publicar en retry.3, contador `3`, esperar al menos 20 s |
| Reintento 3 | `3` | DLQ; `attempts = 4` |

Son **cuatro etapas lógicas como máximo**, no una garantía de que nunca habrá más de cuatro entregas físicas. Confirms inciertos, redeliveries y duplicados pueden ejecutar de nuevo una etapa; los efectos confirmados siguen siendo idempotentes. El contador no se obtiene de `redelivered` ni de sumar arbitrariamente `x-death`; este último se conserva como diagnóstico del broker.

Los retries se calculan con `delay(n) = 5000 * 2^(n - 1)` para `n=1..3`. No dormir dentro del callback ni ocupar una transacción durante la espera. No usar `nack(requeue=true)` como política de reintento. Una caída global de PostgreSQL puede abrir un circuito y pausar consumo antes de repartir todos los mensajes por retries; esa pausa no es un nuevo intento de negocio.

### 6.2. Traslado confirmado y preservación del diagnóstico

Para fallos controlados, el runner republica **los mismos bytes del evento** hacia el exchange de retry o DLQ, con propiedades persistentes, el contador y metadata del fallo. Espera confirm y ausencia de return; solo entonces ACK al original.

Para DLQ añade `x-sls-source-queue`, `x-sls-consumer-name`, `x-sls-failure-code`, motivo sanitizado, `x-sls-failed-at` y una clave estable de fallo. Conservar correlation, tenant, eventId, ruta original y ciclo de redrive. `failedAt` es el momento del fallo, no la hora en que vuelve a estar disponible PostgreSQL.

No pretender cambiar los headers del mensaje ya almacenado con `nack`: eso no añade el diagnóstico al contenido del broker. El DLX configurado en la principal queda como ruta defensiva ante rechazo directo o delivery limit; el registrador interpreta `x-death` y registra una causa de broker cuando no hay diagnóstico de aplicación. Los retries sí usan activamente TTL y DLX de retorno.

Si el proceso cae después de confirmar el traslado y antes del ACK, pueden sobrevivir original y copia. La deduplicación del efecto y la identidad del fallo cubren esa ventana. Los confirm channels de traslado tienen su propia concurrencia y backpressure; no asumir que un canal de consumo es confirm channel.

### 6.3. Persistencia de DeadLetterMessage

El registrador consume la DLQ con ACK manual y prefetch reducido, inicialmente `5`:

1. Validar origen, consumidor permitido y metadata. Recuperar tenant/eventId del envelope o de las copias de transporte confiables; rechazar contradicciones.
2. Calcular `failureKey = SHA-256(tenantId, eventId, consumerName, sourceQueue, redriveCycle, originalBodyHash)` con codificación canónica sin ambigüedad. Usar `initial` como primer ciclo y `redriveRequestId` en los posteriores. El motivo variable no forma parte de la clave.
3. Abrir transacción con tenant y hacer inserción idempotente por `failureKey`. Una segunda copia no crea otro registro ni borra un `redrivenAt` previo.
4. Conservar `attempts`: número de ejecución lógica que falló, 1 para inválido inicial y 4 para agotamiento. Los rechazos por identidad anteriores al handler tienen 0 ejecuciones; los límites del broker guardan el conteo físico separado en metadata sin inventar ejecuciones de negocio.
5. Commit; después ACK a la DLQ.

`originalEvent` contiene el JSON original cuando se puede parsear. Para JSON malformado con identidad confiable conserva `{ "encoding": "base64", "rawBody": "..." }` para recuperar los bytes exactos; `transportMetadata` distingue esa representación, conserva hash, propiedades seguras, fechas, headers pertinentes, contador lógico y `x-death`. Proteger el acceso a ese contenido y no imprimirlo en logs.

Si SQL falla, no confirmar la DLQ. Pausar y recuperar el registrador con backoff; no mover fallos de persistencia de DLQ nuevamente al consumidor de negocio. Tras persistir y ACK, la cola puede quedar vacía: la evidencia durable es la fila. Para demostrar presencia en broker, la prueba pausa temporalmente el registrador y luego lo reactiva.

**Caso sin identidad recuperable:** el esquema actual exige `tenantId` y `eventId` y una FK de tenant. No puede guardar legítimamente un mensaje completamente anónimo en `DeadLetterMessage`. Conservarlo en la cola durable `sls.quarantine.v1`, sin consumidor automático ni TTL, generar alerta y exigir inspección operativa. No crear un tenant ficticio ni confiar en el cuerpo inválido. Esta excepción no afecta la prueba de payload inválido con metadata confiable, que sí termina en DLQ y tabla. Una futura persistencia SQL de cuarentena requerirá un modelo de plataforma y permisos específicos; no debilitar las tablas tenant-owned para simular soporte.

### 6.4. Operación y retención

Registrar en logs estructurados: tenant validado, eventId, correlationId, consumerName, cola, etapa, duración y código; nunca credenciales, tokens o payload completo. Métricas mínimas: pendientes y edad del outbox más antiguo, fallos del publisher, confirms fallidos, duplicados, retries por escalón, DLQ recibida/persistida, cuarentena y reservas expiradas. Un backlog creciente o un `FAILED` local es visible aunque ningún mensaje haya llegado a RabbitMQ.

No purgar automáticamente `ProcessedEvent`: eliminarlo permite repetir efectos de eventos antiguos o redrives. Su retención cubre, como mínimo, todo el horizonte de reentrega/redrive. En el MVP no se eliminan outbox publicado, registros idempotentes ni fallos; definir archivado posterior con política explícita, sin convertir este módulo en un sistema de retención ilimitada para producción.

### 6.5. Redrive deliberado, dirigido y auditable

El redrive conserva el envelope, `eventId`, `tenantId`, `correlationId` y `occurredAt`. Tiene un **nuevo ID de solicitud de transporte**, no un nuevo hecho de negocio. Devuelve el mensaje solamente a `sls.return.v1` con key del consumidor original. No lo republica en el topic general.

Agregar `DeadLetterRedrive` como outbox pequeño de comandos administrativos, porque `OutboxEvent.eventId` es único y no representa varias republicaciones dirigidas del mismo hecho. Campos propuestos:

```text
id UUID PK                         # requestId entregado por el operador
tenantId UUID                      # FK Tenant; RLS y filtro obligatorio
deadLetterMessageId UUID            # FK compuesta (tenantId, id)
consumerName string                 # destino validado contra registro local
requestedBy string                  # principal operativo autenticado
reason string                      # motivo obligatorio y acotado
requestedAt datetime
status PENDING | PUBLISHED | FAILED
attempts int default 0             # intentos de publicación, no de negocio
nextAttemptAt datetime
leaseToken UUID nullable
lockedUntil datetime nullable
lastError string nullable
publishedAt datetime nullable
```

Índice `(tenantId, status, nextAttemptAt, requestedAt, id)` y una restricción SQL parcial para una sola solicitud `PENDING` por `(tenantId, deadLetterMessageId)`. Documentar esta restricción en la migración cuando Prisma no pueda expresarla directamente. No borrar la solicitud anterior para permitir la siguiente.

Flujo:

1. Herramienta operativa dentro de Compose recibe ID del fallo, requestId y motivo. Obtiene el principal del contexto operativo autenticado por el despliegue, no de un `--actor` arbitrario. El alcance de tenant proviene de una allowlist operativa protegida. El tenant seleccionado solo puede pertenecer a ese alcance.
2. En MVP la herramienta es una CLI restringida a operadores con acceso autorizado al entorno; registrar `actorUserId: null` y `metadata.operatorId`. No exponerla como endpoint público. El adaptador falla cerrado si falta principal/alcance. Una futura UI debe usar AUTH-01, permisos específicos y actor humano verificado.
3. Bloquear la fila DLQ por tenant; verificar que el contrato ahora es procesable, que el destino existe y que `ProcessedEvent` aún no contiene el efecto. Si ya fue procesado, devolver `ALREADY_PROCESSED` sin publicar.
4. En una transacción guardar `DeadLetterRedrive(PENDING)` y `AuditLog(DEAD_LETTER_REDRIVE_REQUESTED)` con requestId, origen y motivo. Repetir el mismo requestId con los mismos parámetros devuelve su estado; con parámetros distintos es conflicto. Consultar un fallo ajeno devuelve no encontrado sin revelar existencia.
5. El worker reserva solicitudes con el mismo protocolo de lease y publica al retorno del consumidor, con `x-sls-retry-count=0` y `x-sls-redrive-id=requestId`. Eliminar del intento nuevo diagnósticos de error anteriores; el original permanece inmutable en DLQ SQL.
6. Tras confirm y sin return, en una transacción marcar la solicitud `PUBLISHED`, actualizar `DeadLetterMessage.redrivenAt` y escribir `AuditLog(DEAD_LETTER_REDRIVE_PUBLISHED)`. Cercar el update por token y deduplicar su auditoría con la transición de estado.
7. Caída previa a confirm o al update deja solicitud recuperable; una duplicación posterior al confirm es tolerada. Si falla el nuevo procesamiento, el ciclo requestId genera un nuevo registro DLQ y conserva el anterior.

`redrivenAt` significa republicación confirmada, no éxito del efecto. El éxito se consulta en `ProcessedEvent` para el consumidor original. Nunca eliminar ese registro para forzar el redrive ni alterar un payload bajo el mismo eventId. Un hecho corregido es un nuevo evento de negocio vinculado mediante auditoría al anterior.

## 7. Estrategia de pruebas y verificación

### 7.1. Niveles de prueba

**Unitarias:** sin Nest, broker ni PostgreSQL para contratos, catálogo, mapper legado, políticas de error/retry, coordinación del publisher, idempotencia y redrive. Usar relojes, IDs y puertos falsos controlados. Un mock puede verificar que se solicita el ACK después de resolver el UoW, pero no demuestra atomicidad real: esta requiere integración.

**Integración:** PostgreSQL 17/PostGIS real, migraciones reales, rol `sls_app`, Prisma real y RabbitMQ real de versión fijada. Verificar índices, RLS, reservas concurrentes, confirms, TTL, DLX y ACK. Las fallas se inyectan mediante puertos controlados, cierres de procesos/canales y restricciones exclusivas de la base desechable; nunca modificar el servidor compartido.

**E2E del módulo:** ejecutar una entrega con los casos de uso existentes y fixtures confiables, arrancar el worker compilado como proceso independiente y observar todo el recorrido. La variante HTTP debe además demostrar identidad autenticada; mientras esa integración no exista, llamarla E2E interno de mensajería y no prueba de autenticación de producto.

### 7.2. Matriz de aceptación

| ID | Nivel / escenario | Evidencia de salida |
| --- | --- | --- |
| T01 | Unit: envelope válido y serialización | Ocho campos válidos; fechas estables; ningún `undefined`, `Date` o número no finito en JSON |
| T02 | Unit: JSON/UUID/tipo/versión/producer inválidos | Motivo y campo estables; no invocar handler |
| T03 | Unit: variantes históricas de los cuatro productores | Mapper determinista; identidad contradictoria o ambigua rechazada; no inventar campos |
| T04 | Unit: políticas de error | Negocio esperado se confirma; transitorio se reintenta; permanente va a DLQ |
| T05 | Unit: presupuesto de retry | Contadores 0/1/2/3 y destinos 5/10/20 s; no se crea retry 4 |
| T06 | Unit: confirms, return, timeout y backpressure | `PUBLISHED` solo con confirm sin return; no confundir boolean de `publish` con confirm |
| T07 | Arquitectura | Rechazar imports prohibidos de domain/application, Prisma o AMQP en puertos y dependencias de worker hacia controllers HTTP |
| T08 | DB: atomicidad de productores | Operación logística y outbox se confirman juntas; fallo inducido revierte ambas |
| T09 | DB: dos publicadores concurrentes | Claims vigentes disjuntos; reserva abandonada recuperable; token obsoleto no cambia estado |
| T10 | Real broker: publicación sin consumidor conectado | Cola conserva mensaje; confirm permite marcar outbox; tras iniciar consumo se procesa |
| T11 | Real broker: sin binding | Return detectado y outbox conserva `PENDING`; reparar binding permite recuperar |
| T12 | E2E: PackageDelivered real | Outbox `PUBLISHED`, un `ProcessedEvent`, un recibo `INTEGRATION_EVENT_RECEIVED` con mismos IDs |
| T13 | DB + broker: duplicados secuenciales y concurrentes | Un único registro idempotente y efecto; duplicados reciben ACK |
| T14 | DB: rollback durante el efecto | Ningún registro idempotente ni recibo; posterior ejecución válida sí aplica |
| T15 | E2E: matar proceso después de commit, antes de ACK | Redelivery sin segundo efecto |
| T16 | E2E: matar publisher después de confirm, antes de update | Publicación repetida recuperable; único efecto final |
| T17 | E2E: broker indisponible y recuperación | Operaciones guardan outbox; no marcan `PUBLISHED` falsamente; backlog se drena al volver |
| T18 | Broker: error transitorio que se recupera | Retry vuelve solo a la cola original; éxito posterior; otro consumidor no recibe duplicado por ese retry |
| T19 | Broker + DB: agotamiento | Etapas lógicas 0..3, retrasos observables, DLQ con `attempts=4`, sin efecto |
| T20 | Broker + DB: payload inválido con identidad confiable | DLQ inmediata, sin retries; persiste causa y contenido original |
| T21 | Broker: JSON roto y mensaje sin identidad | JSON roto con headers confiables se archiva en DLQ SQL; anónimo o contradictorio permanece en cuarentena sin datos de tenant inventados |
| T22 | Broker: destino DLX temporalmente no disponible | Mensaje permanece recuperable en la cola origen; llega al destino al restaurarlo; comprobar política at-least-once efectiva |
| T23 | DB + broker: SQL caído durante registro de DLQ | No ACK prematuro ni loop de negocio; reinicio registra una sola fila por `failureKey` |
| T24 | DB: separación A/B y pool concurrente | A no consulta/modifica DLQ/redrive/B; contexto RLS no se filtra entre mensajes simultáneos |
| T25 | DB: misma identidad parcial | Igual eventId en distintos tenants o consumidores usa filas independientes de `ProcessedEvent`; no intenta violar unicidad global del outbox |
| T26 | E2E: redrive autorizado | Intención y auditoría atómicas, destino original, mismo eventId, contador reiniciado, `redrivenAt` solo después de confirm |
| T27 | E2E: caída y concurrencia de redrive | RequestId repetido es idempotente; parámetros distintos fallan; solicitud pendiente se recupera; efecto único |
| T28 | Seguridad: redrive sin principal, fuera de alcance o ya procesado | Fallo cerrado / no encontrado / `ALREADY_PROCESSED`; ninguna republicación indebida |
| T29 | Operación: SIGTERM y reconexión | Sin nuevos claims al apagar; pendientes recuperables; canales y suscripciones reconstruidos |
| T30 | Operación: dos entry points de una imagen | API inicia sin broker; worker no expone HTTP; build emite ambos puntos de entrada |

Para T18 crear un segundo consumidor únicamente en el entorno de prueba: demostrar que su conteo de publicaciones originales no aumenta por el retry del primero. Para T19 usar un handler de fixture cuyo fallo sea explícitamente transitorio; para T20 un poison permanente. No agregar banderas de fallo al contrato público de producción.

Los casos de concurrencia usan barreras controladas, no esperas aleatorias. Los tests reales usan polling con deadline y correlación por eventId; no asumen que dormir exactamente 5000 ms prueba TTL. El presupuesto de T19 debe cubrir 35 segundos de espera más arranque/procesamiento; permitir timeouts del orden de 90 segundos para ese caso. Registrar las versiones y políticas efectivas junto con resultados.

### 7.3. Entorno desechable y comandos futuros

Ampliar `docker-compose.integration.yml` con `integration-rabbitmq`, en el mismo perfil `integration`, sin puertos públicos ni volúmenes compartidos con el broker principal. El runner `test/integration/rmq-01.cjs` creará una base `sls_rmq01_<uuid>` y un vhost `sls_rmq01_<uuid>`, configurará topología/políticas y los eliminará en `finally`. El rol administrativo se usa solo para preparar/retirar fixtures; publisher y consumidores usan cuentas restringidas.

El runner debe rechazar explícitamente URLs del PostgreSQL compartido y vhost `sls`, comprobar que las URLs runtime corresponden a sus recursos aleatorios y no purgar colas ajenas. Los runners de PostgreSQL se ejecutan secuencialmente porque las migraciones gestionan roles a nivel de instancia, como documenta [el README de integración](../../backend/test/integration/README.md).

Los siguientes comandos son **propuestos para después de implementar scripts y servicios**, no resultados ejecutados en esta auditoría:

```bash
docker compose -f docker-compose.yml -f docker-compose.integration.yml \
  --profile integration up -d integration-postgres integration-rabbitmq

docker compose run --rm --no-deps backend npm run build

docker compose run --rm --no-deps backend npm test -- --runInBand

docker compose -f docker-compose.yml -f docker-compose.integration.yml \
  --profile integration run --rm --no-deps \
  -e GDB_TEST_ADMIN_URL \
  -e RMQ_TEST_AMQP_URL \
  -e RMQ_TEST_MANAGEMENT_URL \
  backend npm run test:rmq-01
```

Las tres variables se configuran previamente en el entorno del operador apuntando **solo** a los servicios dedicados de integración. El runner debe validar presencia y destino; no reutilizar por defecto `RABBITMQ_URL` o `DATABASE_URL` del entorno habitual. La suite conserva salidas, tiempos y consultas por eventId en el informe, con secretos excluidos.

Las migraciones se generan/revisan desde Compose contra una base de desarrollo dedicada y se aplican con `prisma migrate deploy` en el runner. No hacer resets ni cambios de esquema manuales permanentes. El script de lint actual modifica archivos; cualquier comprobación de solo lectura invoca ESLint sin `--fix` desde Compose. El formato, cuando se implemente, se limita a los archivos cambiados conforme a la Definition of Done.

### 7.4. Evidencia necesaria para cerrar

- Commit y versión exacta de imágenes/cliente; comandos realmente ejecutados y códigos de salida.
- Build exitoso con dos entry points, pruebas unitarias relevantes, arquitectura e integración real.
- Identidad de un evento real y consulta tenant-scoped de outbox, registro idempotente, efecto, DLQ y redrive.
- Resultados explícitos de concurrencia, fallos entre confirm/commit/ACK y aislamiento A/B.
- Topología y políticas efectivas; capturas de management opcionales como apoyo, no sustituto de assertions.
- Prueba de migración desde datos anteriores además de base vacía; conteo de filas históricas ambiguas y resolución.

## 8. Plan paso a paso de implementación

### 8.1. Fases, responsables y dependencias

`USER` identifica trabajo con decisiones de arquitectura o comportamiento a implementar por el equipo. `CODEX_MECHANICAL` se reserva para documentación y transformaciones determinadas que el usuario solicite aplicar. Esta planificación no autoriza ni realiza código funcional.

| Fase | Objetivo / razón | Responsable | Estado | Dependencias | Criterio de salida / evidencia actual |
| --- | --- | --- | --- | --- | --- |
| F0 | Auditoría y diseño persistente | `CODEX_MECHANICAL` | `DONE` | Solicitud actual | Fuentes leídas, diferencias documentadas y plan creado; solo aceptación documental |
| F1 | Contratos y reglas de compatibilidad de productores | `USER` | `DONE` | F0 | T01–T03 verificadas; 21 tests de mensajería pasando en verde |
| F2 | Reservas, índices, ajuste de writers y persistencia tenant-scoped | `USER` | `DONE` | F1 | Migración aditiva, modelos, writers y stores implementados; 33 tests de mensajería en verde |
| F3 | Transporte AMQP y topología segura | `USER` | `DONE` | F1 | Confirms/return, durable/quorum/policies, definitions.json y rabbitmq.conf; T06 en verde (82 suites, 731 tests) |
| F4 | Publisher recuperable | `USER` | `DONE` | F2, F3 | OutboxPublisher con leases, polling, batch concurrency y backoff; T06/T09/T16/T17 en verde (83 suites, 737 tests) |
| F5 | Worker e idempotencia con efecto real | `USER` | `DONE` | F2, F3, F4 | Worker standalone (worker.ts, WorkerModule, WorkerRuntime), IdempotentConsumer, AuditModule, y architecture tests; T07/T12–T15/T24/T29/T30 en verde (87 suites, 750 tests) |
| F6 | Reintentos, DLQ y cuarentena | `USER` | `DONE` | F5 | RetryPolicy (3 escalones 5s/10s/20s), DeadLetterRecorder (failureKey), RabbitmqFailureRouter (retries, DLQ, cuarentena); T04/T05/T18–T23 en verde (90 suites, 761 tests) |
| F7 | Redrive durable y control operativo | `USER` | `DONE` | F6 | RequestDeadLetterRedriveUseCase, DeadLetterRedrivePublisher, OperatorContext (fail-closed), messaging-ops CLI; T26–T28 en verde (91 suites, 769 tests) |
| F8 | Integración, documentación y cierre | `USER` | `DONE` | F1–F7 | Evidencia completa de §7.4: 91 suites unitarias (769 tests en verde), runner de integración rmq-01.cjs ejecutado exitosamente con base desechable y RLS (8 tests en verde), y build dual main/worker sin errores |

Las pruebas correspondientes se escriben junto con cada fase; F8 integra y recoge evidencia, no pospone todas las pruebas al final.

### 8.2. Inventario exacto de archivos nuevos en backend/src

Rutas relativas a la raíz del repositorio. **Todos los siguientes archivos son propuestos y no existen todavía en la base auditada.** Las columnas agrupan responsabilidades sin exigir capas vacías. Los puertos relacionados pueden compartir un archivo cuando forman un único contrato.

| Fase | Archivo nuevo | Responsabilidad |
| --- | --- | --- |
| F1 | `backend/src/shared/application/messaging/event-envelope.ts` | JSON, envelope e identidades tipadas |
| F1 | `backend/src/shared/application/messaging/event-catalog.ts` | Tipos/productores/versiones soportados y validadores de payload |
| F1 | `backend/src/shared/application/messaging/event-validator.ts` | Parseo lógico, validación de envelope y metadatos verificados |
| F1 | `backend/src/shared/application/messaging/outbox-event.mapper.ts` | Compatibilidad legado y normalización determinista |
| F1 | `backend/src/shared/application/messaging/messaging-errors.ts` | Fallos tipados con códigos estables |
| F1 | `backend/src/shared/test/messaging/event-contracts.spec.ts` | Contratos, variantes y metadatos contradictorios |
| F1 | `backend/src/shared/test/messaging/outbox-event.mapper.spec.ts` | Ejemplos de los cuatro writers y ambigüedad |
| F2 | `backend/src/shared/application/messaging/ports/outbox-store.port.ts` | Claim, renovación, actualización cercada y fallos locales |
| F2 | `backend/src/shared/application/messaging/ports/consumer-unit-of-work.port.ts` | Sesión y registro idempotente sin Prisma |
| F2 | `backend/src/shared/application/messaging/ports/dead-letter-store.port.ts` | Registro de fallo y lectura por tenant |
| F2 | `backend/src/shared/application/messaging/ports/redrive-store.port.ts` | Solicitar/reservar/finalizar redrive y auditoría atómica |
| F2 | `backend/src/shared/infrastructure/messaging/persistence/prisma-outbox.store.ts` | SQL de reservas y persistencia de outbox |
| F2 | `backend/src/shared/infrastructure/messaging/persistence/prisma-processed-event.registry.ts` | Inserción idempotente en la transacción suministrada |
| F2 | `backend/src/shared/infrastructure/messaging/persistence/prisma-dead-letter.store.ts` | Upsert seguro de fallos y consultas tenant-scoped |
| F2 | `backend/src/shared/infrastructure/messaging/persistence/prisma-redrive.store.ts` | Solicitudes de redrive, leases y auditoría local |
| F2 | `backend/src/modules/audit/application/ports/audit-writer.port.ts` | Contrato de escritura de auditoría dentro de una sesión existente |
| F2 | `backend/src/modules/audit/infrastructure/prisma-audit-writer.ts` | Writer compartido por UoW de consumidor y redrive, ligado al mismo cliente transaccional |
| F3 | `backend/src/shared/application/messaging/ports/event-publisher.port.ts` | Publicación confirmada a destinos lógicos permitidos |
| F3 | `backend/src/shared/infrastructure/messaging/messaging.config.ts` | Validación de parámetros de despliegue y tenants |
| F3 | `backend/src/shared/infrastructure/messaging/rabbitmq-topology.ts` | Manifiesto de exchanges, colas, bindings y políticas esperadas |
| F3 | `backend/src/shared/infrastructure/messaging/rabbitmq-connection.ts` | Conexión, canales, reconexión y lifecycle |
| F3 | `backend/src/shared/infrastructure/messaging/rabbitmq-confirm.publisher.ts` | Confirms, returns, backpressure y timeouts |
| F3 | `backend/src/shared/test/messaging/rabbitmq-confirm.publisher.spec.ts` | Errores de publicación, returns y flujo |
| F4 | `backend/src/shared/application/messaging/outbox-publisher.ts` | Coordinación del ciclo de publicación |
| F4 | `backend/src/shared/test/messaging/outbox-publisher.spec.ts` | Transiciones del publisher y recuperación de reservas |
| F5 | `backend/src/worker.ts` | Entry point standalone |
| F5 | `backend/src/worker.module.ts` | Composition root del proceso |
| F5 | `backend/src/shared/messaging.module.ts` | Wiring de puertos y adapters; sin autoarrancar loops |
| F5 | `backend/src/shared/infrastructure/messaging/worker-runtime.ts` | Inicio ordenado, polling, readiness y apagado |
| F5 | `backend/src/shared/infrastructure/messaging/rabbitmq-consumer.runner.ts` | Entregas, ACK y coordinación de disposition |
| F5 | `backend/src/shared/application/messaging/idempotent-consumer.ts` | Clase coordinadora transaccional independiente de framework |
| F5 | `backend/src/modules/audit/application/ports/audit-consumer-unit-of-work.ts` | Sesión idempotente con puerto de recibos de auditoría |
| F5 | `backend/src/modules/audit/application/audit-integration-event.consumer.ts` | Efecto real y selección de metadata mínima |
| F5 | `backend/src/modules/audit/infrastructure/prisma-audit-consumer-unit-of-work.ts` | Transacción compartida para ProcessedEvent y AuditLog |
| F5 | `backend/src/modules/audit/audit.module.ts` | Exportación intencional del consumidor |
| F5 | `backend/src/shared/test/messaging/idempotent-consumer.spec.ts` | Duplicado, rollback y contrato del UoW |
| F5 | `backend/src/shared/test/messaging/messaging-architecture.spec.ts` | Imports permitidos y límites de worker/módulos |
| F5 | `backend/src/modules/audit/test/audit-integration-event.consumer.spec.ts` | Efecto y metadata de recibo |
| F6 | `backend/src/shared/application/messaging/retry-policy.ts` | Clasificación y presupuesto lógico |
| F6 | `backend/src/shared/application/messaging/dead-letter-recorder.ts` | Normalización de fallos e identidad de persistencia |
| F6 | `backend/src/shared/infrastructure/messaging/rabbitmq-failure.router.ts` | Traslados confirmados a retry/DLQ/cuarentena |
| F6 | `backend/src/shared/test/messaging/retry-policy.spec.ts` | Escalones y distinción negocio/infraestructura |
| F6 | `backend/src/shared/test/messaging/dead-letter-recorder.spec.ts` | Deduplicación de fallo, JSON roto y ausencia de identidad |
| F7 | `backend/src/shared/application/messaging/request-dead-letter-redrive.ts` | Validación y solicitud administrativa durable |
| F7 | `backend/src/shared/application/messaging/dead-letter-redrive-publisher.ts` | Publicación dirigida y resultado cercado por lease |
| F7 | `backend/src/shared/application/messaging/ports/messaging-operator.port.ts` | Principal y alcance operativos confiables |
| F7 | `backend/src/shared/infrastructure/messaging/configured-messaging-operator.adapter.ts` | Identidad protegida del entorno operativo; falla cerrado |
| F7 | `backend/src/messaging-ops.ts` | CLI de inspección y solicitud; ningún loop de worker |
| F7 | `backend/src/messaging-ops.module.ts` | Composition root operativo separado |
| F7 | `backend/src/shared/test/messaging/dead-letter-redrive.spec.ts` | Autorización, idempotencia y recuperación de solicitud |

La composición del worker se modifica incrementalmente en F6/F7 para conectar servicios añadidos. La CLI no importa `WorkerModule`; no debe arrancar consumidores por consultar un fallo. `prisma-redrive.store.ts` recibe desde el composition root una factory de infraestructura que liga `PrismaAuditWriter` a su transacción; usa el puerto de audit para escribir, sin decidir reglas de auditoría ni consultar tablas ajenas directamente. El UoW del consumidor reutiliza ese writer. El cliente Prisma solo aparece en esa composición de infraestructura, nunca en los puertos de aplicación.

### 8.3. Inventario exacto de archivos existentes a modificar en backend/src

| Fase | Archivo existente | Cambio acotado |
| --- | --- | --- |
| F2 | `backend/src/modules/routes/infrastructure/persistence/prisma-route-lifecycle-unit-of-work.ts` | Persistir `producer` canónico y serializar fechas; mantener transacción y reglas de lifecycle |
| F2 | `backend/src/modules/deliveries/infrastructure/persistence/prisma-delivery-unit-of-work.ts` | Persistir productor y verificar coherencia del tenant de `OutboxMessage` |
| F2 | `backend/src/modules/packages/infrastructure/prisma-package-lifecycle.repository.ts` | Guardar productor explícito y correlation determinista manteniendo State e historia |
| F2 | `backend/src/modules/route-planning/application/ports/planning-assignment-unit-of-work.ts` | Completar `CreateOutboxEventData` con producer, version y occurredAt |
| F2 | `backend/src/modules/route-planning/application/plan-and-assign-routes.service.ts` | Proporcionar esos metadatos desde el evento generado; no cambiar algoritmo ni asignación |
| F2 | `backend/src/modules/route-planning/infrastructure/prisma-planning-assignment-unit-of-work.ts` | Persistir nuevos metadatos en el mismo commit |
| F2/F8 | `backend/src/modules/routes/test/prisma-route-lifecycle-unit-of-work.spec.ts` | Ajustar expectativa de productor persistido y payload serializable |
| F2/F8 | `backend/src/modules/deliveries/test/prisma-delivery-unit-of-work.spec.ts` | Comprobar productor y rechazo de identidad contradictoria |

`backend/src/main.ts`, `backend/src/app.module.ts` y los controladores logísticos no requieren cambios para iniciar un worker separado. Reutilizar `database/prisma.service.ts`, `prisma.module.ts` y `run-with-tenant.ts`; no moverlos de carpeta durante esta tarea. Los tests nuevos del mapper cubren las variantes históricas; si las pruebas de productores existentes necesitan adaptar tipos de fixtures, mantener esos ajustes dentro de sus módulos y registrar las rutas reales en el informe, sin alterar expectativas ajenas.

### 8.4. Archivos necesarios fuera de backend/src

| Acción / fase | Ruta | Objetivo |
| --- | --- | --- |
| Modificar F2 | `backend/prisma/schema/messaging.prisma` | Campos, índices y modelo `DeadLetterRedrive` |
| Modificar F2 | `backend/prisma/schema/identity.prisma` | Relación inversa Tenant–DeadLetterRedrive |
| Crear F2 | `backend/prisma/migrations/<timestamp>_rmq_outbox_delivery/migration.sql` | Migración aditiva, índices, grants, RLS y backfills; timestamp lo genera Prisma |
| Modificar F3/F5/F7/F8 | `backend/package.json`, `backend/package-lock.json` | amqplib/tipos; scripts worker, operaciones y `test:rmq-01` |
| Modificar F3/F5/F7 | `backend/.env.example` | Variables del publisher/worker y contexto operativo; placeholders de secretos |
| Modificar F5 | `backend/Dockerfile` | Producción de artefactos utilizables por ambos procesos en una misma imagen |
| Modificar F3/F5 | `docker-compose.yml` | Imagen compartida, worker, readiness y quitar dependencia AMQP de arranque de API |
| Crear F3 | `infra/rabbitmq/definitions.json` | Topología/políticas versionadas de desarrollo y sin credenciales privadas |
| Crear F3 | `infra/rabbitmq/rabbitmq.conf` | Carga de definiciones y configuración explícita; montar desde Compose |
| Modificar F8 | `docker-compose.integration.yml` | RabbitMQ dedicado y recursos aislados para pruebas |
| Crear F8 | `backend/test/integration/rmq-01.cjs` | Runner que prepara y elimina solo recursos desechables propios |
| Crear F8 | `backend/test/messaging-outbox.e2e-spec.ts` | Productores, concurrencia, confirms y recuperación |
| Crear F8 | `backend/test/messaging-consumer.e2e-spec.ts` | Idempotencia, atomicidad y aislamiento |
| Crear F8 | `backend/test/messaging-dlq.e2e-spec.ts` | Retry, TTL, poison, cuarentena y persistencia |
| Crear F8 | `backend/test/messaging-redrive.e2e-spec.ts` | Solicitudes operativas y fallos de republicación |
| Crear F8 | `backend/test/fixtures/messaging.fixtures.ts` | Tenants explícitos, eventos y barreras de fallos de prueba |
| Modificar F8 | `backend/test/integration/README.md` | Ejecución reproducible, requisitos y cleanup |
| Crear F1/F8 | `docs/adr/008-reliable-event-processing.md` | Decisiones de entrega, leases, retries, DLQ y redrive; estado Proposed hasta revisión |
| Crear/mantener ahora | `docs/plans/rmq-01.md`, `docs/modules/rmq-01-report.md` | Plan y evidencia real, mutuamente enlazados |
| Modificar solo al verificar F8 | `AGENTS.md`, `docs/plans/mvp-implementation.md`, `docs/modules/mvp-implementation-report.md` | Estados contrastados con código, pruebas y límites de alcance |

El manifiesto RabbitMQ del código y las definiciones administrativas deben tener un test de paridad. Evitar divergencias entre políticas provisionadas y declaraciones de arranque. No editar archivos de secretos reales como parte del plan documental.

### 8.5. Instrucciones concretas y verificación por fase

| Fase | Trabajo a aplicar por USER | Lote mecánico posible previa solicitud | Verificación y trabajo restante |
| --- | --- | --- | --- |
| F1 | Inventariar contratos reales; acordar productores; escribir parsers/mapper; proponer ADR | Crear archivos ya acordados y actualizar imports determinados | T01–T03; resolver toda variante histórica antes de habilitar publicación general |
| F2 | Revisar datos; definir migración y SQL de leases; generar cliente; ajustar writers y sus pruebas; implementar stores y UoW; conservar RLS | Regeneración Prisma y propagación tipada una vez definido el esquema | Migración desde vacío e historial; T08/T09/T24/T25; no hay ejecución actual |
| F3 | Fijar versión RabbitMQ, implementar transporte y configurar permisos/policies/topología | Wiring y archivos declarativos desde manifiesto revisado | T06/T10/T11/T22; comprobar versión y políticas efectivas, no solo YAML |
| F4 | Implementar polling equitativo, leases, confirms y backoff | Variables y registros de proveedores determinados | T09/T16/T17; resolver retornos y resultados inciertos antes de marcar RMQ-01 terminado |
| F5 | Implementar coordinación idempotente y recibo; bootstrap y lifecycle | Scaffolding de entry points y wiring ya definido | T07/T12–T15/T24/T29/T30; demostrar efecto real y ACK posterior al commit |
| F6 | Implementar clasificación, traslados y registro DLQ; manejar caso anónimo | Fixtures de eventos y metadata con transformación explícita | T04/T05/T18–T23; probar destinos temporalmente indisponibles |
| F7 | Implementar autorización operativa, solicitudes durables, publicación y auditoría | CLI y registros solo tras fijar contrato de principal y parámetros | T26–T28; confirmar que `redrivenAt` no se interpreta como efecto exitoso |
| F8 | Ejecutar suite aislada; revisar seguridad, migración y Definition of Done | Formato acotado, recopilar evidencia y sincronizar docs | Cerrar tareas únicamente con resultados actuales; integración pública depende de identidad confiable |

**Siguiente paso desbloqueado: F1.** Preparar fixtures representativos de los cuatro escritores y formalizar el catálogo/mapper antes de tocar el broker. La información ya leída permite empezar sin inventar `RouteCompleted` ni rediseñar la lógica logística. Criterio de salida: todos los formatos existentes tienen una regla determinista o una cuarentena local explícita, y el contrato canónico de `PackageDelivered` se valida en ejecución.

### 8.6. Decisiones, riesgos concretos y seguimiento

| Decisión de diseño propuesta | Motivo / consecuencia |
| --- | --- |
| Polling + lease adquirido con SKIP LOCKED | Recuperación después de caída sin transacciones SQL abiertas durante AMQP; requiere columnas e índices |
| API y worker en la misma imagen | Respeta monolito modular y separa disponibilidad de procesos |
| Quorum con dead-lettering at-least-once | Protege traslados a retry/retorno/DLQ; exige políticas verificadas y más recursos |
| Tres retries lógicos con colas TTL | Backoff simple y explicable; no ofrece orden global ni temporización exacta |
| Idempotencia por inserción única y mismo UoW | Resiste carreras y rollback; no cubre directamente efectos externos |
| Consumidor de recibos en audit | Demostración real sin adelantar email ni modificar estados logísticos |
| Lista operativa de tenants en MVP | Evita escaneo que eluda RLS; alta de tenants exige actualizar configuración |
| Redrive como intención durable separada | Respeta unicidad del evento y destino original; agrega un modelo pequeño de transporte |
| Cuarentena anónima fuera de tablas de tenant | Preserva evidencia sin falsificar identidad; inspección manual y persistencia SQL posterior si se requiere |

Riesgos que requieren seguimiento: compatibilidad de historial sin productor; identidad HTTP aún no confiable en esta rama; falta de broker en ejecución durante la auditoría; coste de quorum en un nodo; límites de disco; reservas que expiren durante confirmación; y retención de identidades idempotentes. Cada uno tiene una prueba o límite explícito en este plan. No son motivos para declarar implementados componentes ausentes ni para ocultar el backlog.

| Fecha | Paso | Cambio observado / evidencia | Commit |
| --- | --- | --- | --- |
| 2026-10-07 | F0 | Lectura de AGENTS, skill, esquema dividido, migraciones RLS, writers, entry point y configuración; árbol inicialmente limpio | Base `04be562` |
| 2026-10-07 | F0 | Compose no mostró servicios activos; no fue posible obtener versión ejecutándose | Sin cambios de infraestructura |
| 2026-10-07 | F1 | Contratos canónicos, catálogo, validador y mapper creados; T01, T02, T03 en verde (21 tests, build en Docker OK) | Pendiente commit |
| 2026-10-07 | F2 | Migración aditiva, modelos Prisma, writers actualizados con producer y stores implementados; 33 tests en verde | Pendiente commit |

Checklist para pasar el módulo a `DONE`:

- [x] Contratos, productores y compatibilidad histórica verificados.
- [x] Migraciones aditivas revisadas y probadas con RLS runtime.
- [ ] Publicador, worker y topología funcionando con confirms y ACK manual.
- [ ] Un solo efecto bajo duplicados concurrentes y caída antes del ACK.
- [ ] Tres retries, DLQ persistida y cuarentena preservada.
- [ ] Redrive autorizado, auditado y recuperable después de caída.
- [ ] Build, tests relevantes, import boundaries y formato de archivos cambiados aprobados.
- [ ] Evidencia actual publicada en el informe y estados del tablero reconciliados.
- [ ] Integración posterior de autenticación pública y notificaciones identificada sin atribuirla a este cierre.

La elaboración de este documento cierra F0, **no** EVT-01, RMQ-01, IDEMP-01 o DLQ-01. No se han aplicado migraciones, instalado dependencias, cambiado código funcional ni ejecutado la suite propuesta.
