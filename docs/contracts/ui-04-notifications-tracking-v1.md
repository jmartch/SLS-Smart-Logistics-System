# Contrato v1 de UI-04, NOTIF-01/02 y TRACK-01

## Estado y autoridad

Auditoría inicial: 2026-11-09. Revisión documental: 2026-11-10. Base inspeccionada: `develop`, `33e09eb`.

Estado: `REVIEW`. Este documento define el contrato propuesto de las tres entregas; los endpoints nuevos aún no están implementados ni probados. Antes de programar, Santiago, Juanangel y Vivian revisan este mismo contrato. Una modificación posterior exige actualizar este documento, las pruebas de contrato y los consumidores afectados; ningún equipo inventa endpoints alternativos.

El usuario decidió expresamente: coordinadores primero; remitentes y destinatarios externos quedan para una ampliación explícita. Esa ampliación sigue pendiente del producto, no queda cubierta por estas entregas.

| Entrega | Responsable | Plan canónico | Propiedad |
| --- | --- | --- | --- |
| UI-04 | Santiago | [UI-04](../plans/ui-04.md) | Clientes HTTP, bandeja, campana y rastreo público |
| NOTIF-01/02 | Juanangel | [NOTIF-01](../plans/notif-01.md), [NOTIF-02](../plans/notif-02.md) | Inbox, destinatarios coordinadores, consumo de eventos y email |
| TRACK-01 | Vivian | [TRACK-01](../plans/track-01.md) | Consulta pública limitada por token |

## Reglas comunes de HTTP

- Base existente: `/api/v1`. `apiFetch` ya incorpora esa base; frontend pasa rutas como `/notifications`.
- Fechas: cadenas ISO 8601 UTC. Campos anulables se envían como `null`, no se omiten. Identificadores internos de notificación y paquete: UUID.
- Respuestas exitosas sin envoltura `data`, coherentes con los clientes actuales. Todos los endpoints de esta entrega devuelven JSON; no se añade GraphQL ni una segunda versión de la API.
- Error de estos endpoints: `{ "error": { "code": "VALIDATION_ERROR", "message": "Invalid request.", "fields": null } }`. Para validaciones de campo, `fields` es una lista de `{ "field": "page", "reason": "Must be a positive integer." }`. Los textos del ejemplo no son claves de interfaz: frontend decide por `code` y traduce.
- Los errores de infraestructura no exponen consultas, tokens, correos, direcciones ni trazas. Se preservan los middlewares actuales de sesión, CORS y origen/CSRF.
- `tenantId`, `userId`, destinatario, canal y estado de envío nunca se aceptan desde UI-04 para decidir acceso. Rechazar intentos de cambiar esos filtros con `400 VALIDATION_ERROR` mediante DTO/validación local; el `whitelist` global actual elimina campos y por sí solo no los rechaza.

## API privada de notificaciones: exactamente cuatro endpoints

`AuthGuard` y contexto de usuario de tenant son obligatorios. Un administrador de plataforma recibe `403 PERMISSION_DENIED`; una sesión ausente o revocada recibe `401 SESSION_EXPIRED`. Cada usuario activo de tenant consulta exclusivamente su inbox; un usuario sin notificaciones recibe una lista vacía. No se exige `MANAGE_EMPLOYEES` ni se crea un permiso nuevo para leer el inbox propio.

Las consultas y escrituras filtran simultáneamente `tenantId`, usuario destinatario y `channel = IN_APP`. NOTIF-02 no expone filas EMAIL en esta API. `SENT` expresa publicación en el inbox o aceptación de email; `readAt` expresa lectura y es independiente.

### 1. GET /notifications

Query permitida: `page` entero >= 1, por defecto 1; `pageSize` entero 1..50, por defecto 20; `unreadOnly` exclusivamente `true` o `false`, por defecto `false`. Rechazar query inválida, duplicada o desconocida con `400 VALIDATION_ERROR`. Orden fijo `createdAt DESC, id DESC`. No hay búsqueda libre, filtros de otros usuarios, selección de canales ni cursor en v1.

```json
{
  "items": [
    {
      "id": "52f4564d-fbb0-4edf-8815-15d39b0e36f2",
      "type": "PACKAGE_PENDING_ASSIGNMENT",
      "title": "Paquete pendiente de asignación",
      "body": "Un paquete requiere revisión de coordinación.",
      "createdAt": "2026-11-09T16:00:00.000Z",
      "readAt": null,
      "resource": {
        "type": "PACKAGE",
        "id": "1f98a0a8-3589-44b4-ad27-44411d4034cf"
      }
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 1
}
```

`type`: `PACKAGE_PENDING_ASSIGNMENT | PACKAGE_DELIVERED | DELIVERY_FAILED`. `resource`: el objeto mostrado o `null`. Título y cuerpo son texto plano en español, generado por backend con mensajes fijos; no se renderiza HTML ni se usa `dangerouslySetInnerHTML`. `createdAt` es la fecha de persistencia de la notificación. La paginación es una vista viva: pueden aparecer nuevas filas entre peticiones; UI deduplica por `id` al combinar páginas. Una página fuera del total devuelve `items: []` y el mismo número de página solicitado.

### 2. GET /notifications/unread-count

Sin query ni body. Respuesta `200`:

```json
{ "unreadCount": 1 }
```

Cuenta todas las filas IN_APP propias con `readAt = null`, no solo la página cargada. La campana usa este endpoint, no calcula el total desde `items`.

### 3. PATCH /notifications/:notificationId/read

UUID válido; body JSON vacío `{}`. Respuesta `200`:

```json
{
  "id": "52f4564d-fbb0-4edf-8815-15d39b0e36f2",
  "readAt": "2026-11-09T16:10:00.000Z"
}
```

Repetir conserva el primer `readAt`, también bajo concurrencia. Una fila ajena por tenant, usuario o canal y una fila inexistente responden igual: `404 NOTIFICATION_NOT_FOUND`. UUID mal formado: `400 VALIDATION_ERROR`. Sin creación de eventos por lectura y sin endpoint para desmarcar.

### 4. PATCH /notifications/read-all

Sin query; body `{}`. Una actualización marca únicamente las filas IN_APP propias sin leer visibles al comenzar esa sentencia SQL. Respuesta `200`:

```json
{ "updatedCount": 3, "readAt": "2026-11-09T16:10:00.000Z" }
```

`readAt` es el instante aplicado a las filas afectadas, incluso si `updatedCount` es cero; no modifica fechas de lectura existentes. No se promete que el contador posterior sea cero si ingresan notificaciones concurrentes. Frontend recarga listado y contador después de ambas mutaciones; no ejecuta una petición por fila para marcar todas.

### Firmas que implementa el cliente de Santiago

Estas firmas son propuestas de TypeScript para los clientes indicados en UI-04; no crean un paquete compartido ni una dependencia del frontend sobre Prisma/NestJS. Todos los campos de respuesta son obligatorios aunque su valor permita null.

```typescript
type NotificationType =
  | 'PACKAGE_PENDING_ASSIGNMENT'
  | 'PACKAGE_DELIVERED'
  | 'DELIVERY_FAILED';

interface NotificationItem {
  readonly id: string;
  readonly type: NotificationType;
  readonly title: string;
  readonly body: string;
  readonly createdAt: string;
  readonly readAt: string | null;
  readonly resource: { readonly type: 'PACKAGE'; readonly id: string } | null;
}

interface NotificationListParams {
  readonly page?: number;
  readonly pageSize?: number;
  readonly unreadOnly?: boolean;
}

interface NotificationPage {
  readonly items: readonly NotificationItem[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

declare function listNotifications(params?: NotificationListParams): Promise<NotificationPage>;
declare function getUnreadCount(): Promise<{ readonly unreadCount: number }>;
declare function markNotificationRead(id: string): Promise<{ readonly id: string; readonly readAt: string }>;
declare function markAllNotificationsRead(): Promise<{ readonly updatedCount: number; readonly readAt: string }>;
```

## Reparto interno de NOTIF-01 y NOTIF-02

### Audiencia y eventos cerrados de v1

Coordinador significa usuario `ACTIVE` del tenant `ACTIVE` que posee `COORDINATE_ROUTES` por al menos un rol; no comparar nombres de roles. Resolver usuarios distintos mediante un puerto del módulo users, con implementación propietaria allí. No consultar sus tablas desde el adaptador de notifications.

| Evento v1 | Productor aceptado | IN_APP | EMAIL | Tipo público |
| --- | --- | --- | --- | --- |
| `PackagePendingAssignment` | `sls-backend.packages`, `sls-backend.route-planning` | Sí | Sí | `PACKAGE_PENDING_ASSIGNMENT` |
| `PackageDelivered` | `sls-backend.deliveries` | Sí | No | `PACKAGE_DELIVERED` |
| `DeliveryFailed` | `sls-backend.deliveries` | Sí | Sí | `DELIVERY_FAILED` |

Estos eventos y productores están admitidos por el catálogo actual. Elegir la variante deliveries para entrega/fallo evita suscribirse además a la representación de State del mismo hecho. El registro de productores/variantes no prueba que cada flujo los publique: demostrarlo con outbox real durante implementación. No crear eventos nuevos de paquetes ni ampliar sus transiciones para este módulo.

Resolver la audiencia al materializar el evento y persistirla una vez. Cero coordinadores es un resultado esperado, con registro de procesamiento y sin DLQ. Un alta posterior no recibe retroactivamente eventos procesados. Revalidar actividad y permiso antes de enviar email; si ya no es elegible, cancelar el trabajo sin enviarlo y registrar el motivo. Una pérdida de permiso no reasigna la notificación a otra persona. Los mensajes contienen texto operativo genérico y referencia de paquete, sin PII.

NOTIF-01 crea IN_APP; NOTIF-02 amplía el mismo materializador con EMAIL para las dos filas de la tabla. Santiago no implementa una pantalla de email ni llama a SMTP. La activación de NOTIF-02 afecta a eventos nuevos: no se borra ProcessedEvent ni se hace replay masivo para enviar correos de eventos históricos ya consumidos por NOTIF-01.

### Consistencia y puertos previstos

Los nombres de tipos siguientes son contratos propuestos de aplicación, no clases existentes ni código para copiar sin revisión:

| Puerto/capacidad | Entrada | Salida y obligación |
| --- | --- | --- |
| `NotificationRecipientDirectoryPort.listActiveCoordinators` | contexto tenant verificado por el consumidor | usuarios distintos `{ userId, email }`; lo posee users; no recibe IDs del navegador |
| `NotificationInboxPort.list` / `countUnread` | contexto `{ tenantId, userId }`, query validada | exactamente las proyecciones HTTP anteriores; no expone Prisma |
| `NotificationInboxPort.markRead` / `markAllRead` | mismo contexto, ID cuando aplica, reloj del servidor | resultado de lectura o ausencia; aislamiento y primer `readAt` atómicos |
| `NotificationConsumerUnitOfWork.run` | tenant y callback | sesión con registro de evento procesado y escritura de notificaciones; en NOTIF-02 también outbox de email, todos en la misma transacción |
| `EmailDeliveryStorePort.claim` / `complete` / `reschedule` / `cancel` | tenant, `notificationId`, lease token y reloj | reserva exclusiva con caducidad y actualizaciones cercadas por ese token; ningún cliente transaccional sale del puerto |
| `EmailSenderPort.send` | `{ deliveryId, to, subject, text }` | `{ providerMessageId: string \| null }` o error clasificado; llamada fuera de transacción |

Cada puerto nuevo usa token `Symbol` e `import type`; las clases de aplicación se construyen sin NestJS. La lógica de audiencia, tipo y mensajes vive en aplicación/dominio; los adaptadores resuelven consultas y persistencia.

Migración aditiva prevista para `Notification`: usuario destinatario explícito con FK compuesta tenant/usuario, `type`, `title`, `body`, `createdAt`, `readAt`, recurso opcional y datos de trabajo EMAIL. La columna actual `recipient` puede conservar correo de entrega; no usarla como identidad de autorización. NOTIF-02 propone ampliar expresamente `NotificationStatus` con `PROCESSING` y `CANCELLED`, conservando `PENDING`, `SENT` y `FAILED`: un solo campo representa ejecución, sin un segundo estado redundante. IN_APP se crea en `SENT`; EMAIL comienza en `PENDING`. Lease, caducidad, próxima ejecución, último código de error y correo/mensaje persistido completan el trabajo durable. Revisar migración y consumidores antes de modificar el enum.

Deduplicación persistente: tenant + evento fuente + usuario destinatario + canal; incluir NOT NULL para las identidades nuevas tras revisar/backfillear datos históricos. Conservar `ProcessedEvent(tenantId, eventId, consumerName)` y las políticas RLS existentes. No borrar filas antiguas ni inventar contenido histórico: auditar su tratamiento antes de la migración. La idempotencia se garantiza para una misma identidad de evento; dos productores con IDs distintos no se deduplican mágicamente como un único hecho.

### Mensajería acotada

- Consumidor nuevo `notifications.integration-events.v1`, cola `sls.notifications.integration-events.v1`, bindings al exchange existente `sls.events.v1`: `tenant.*.PackagePendingAssignment.v1`, `tenant.*.PackageDelivered.v1`, `tenant.*.DeliveryFailed.v1`. Validar productor, envelope y tenant además del routing key.
- NOTIF-01 registra `ProcessedEvent` y crea IN_APP en una transacción; ACK después del commit. NOTIF-02 añade a esa transacción las filas EMAIL y una fila de outbox por trabajo, con evento nuevo `NotificationEmailRequested` v1, productor `sls-backend.notifications`, payload exclusivamente `{ notificationId }`.
- Evento de email con identidad estable creada una sola vez al insertar el trabajo, no UUID nuevo en cada reintento. Consumidor `notifications.email.v1`, cola `sls.notifications.email.v1`, binding `tenant.*.NotificationEmailRequested.v1`.
- Cada consumidor tiene retries propios 5s, 10s y 20s y su DLQ; retorno dirigido por nombre de consumidor, igual que la convención existente. No compartir la cola principal de audit. Las variantes de productor no utilizadas se reconocen y omiten sin efectos después de validar contrato; no producen notificaciones duplicadas.
- `RabbitmqConsumerRunner` y `RabbitmqFailureRouter` actuales tienen audit codificado. Adaptar exclusivamente la selección de identidad, cola, handler y rutas de fallo manteniendo la compatibilidad y pruebas de audit. No afirmar que ya soportan cualquier consumidor. Para fallos de email después de fan-out, reintentar el trabajo individual, no todo el evento fuente.
- Los reintentos de transporte y de trabajo no multiplican el presupuesto: un máximo de cuatro intentos de envío SMTP por trabajo, con contador durable y tres esperas. Un mensaje repetido no salta `nextAttemptAt` ni revive trabajos terminales. Barrido por tenant habilitado recupera jobs vencidos o sin disparador; cualquier republicación usa la misma identidad del trabajo y publisher confirm.
- El envío SMTP ocurre fuera de la transacción y no revierte paquetes ni rutas. Una reserva ocupada no se marca procesada como envío exitoso; la recuperación durable conserva el trabajo.
- SMTP puede aceptar el correo y caerse el proceso antes de guardar `SENT`. Una clave estable `deliveryId` permite idempotencia si el proveedor la soporta; SMTP local no garantiza ausencia de duplicados en esa ventana. Registrar y probar ese límite; no prometer exactly-once ni guardar `ProcessedEvent` antes de enviar como atajo.
- Al completar con éxito, persistir `SENT` y recibo de procesamiento del disparador en una transacción. Tras agotamiento, persistir `FAILED` y diagnóstico/DLQ del trabajo de forma recuperable. No se añaden `NotificationSent` o `NotificationFailed` al catálogo en v1: no hay consumidor acordado que los necesite.

## API pública de rastreo: exactamente un endpoint

### GET /public/tracking/:token

Autorización por posesión de token público, sin login, cookies ni `tenantId`. Token generado actualmente por `CryptoPublicTrackingTokenGenerator`: 32 bytes base64url, 43 caracteres, sensible a mayúsculas. No convertir a minúsculas ni buscar por `trackingCode`, UUID o código QR interno.

```json
{
  "trackingCode": "SLS-2026-00141",
  "state": "DELIVERY_FAILED",
  "updatedAt": "2026-11-09T16:00:00.000Z",
  "history": [
    { "state": "REGISTERED", "occurredAt": "2026-11-09T12:00:00.000Z" },
    { "state": "DELIVERY_FAILED", "occurredAt": "2026-11-09T16:00:00.000Z" }
  ],
  "historyTruncated": false
}
```

`state` y cada `history[].state` usan exactamente los 13 estados de `packages.prisma`: `REGISTERED`, `CLASSIFIED`, `PENDING_ASSIGNMENT`, `ASSIGNED_TO_ROUTE`, `READY_FOR_DISPATCH`, `IN_TRANSIT`, `OUT_FOR_DELIVERY`, `DELIVERED`, `DELIVERY_FAILED`, `RESCHEDULED`, `RETURN_PENDING`, `RETURNED`, `CANCELLED`. Nunca `ASSIGNED`.

Firma de cliente público para UI-04:

```typescript
type PublicTrackingState =
  | 'REGISTERED'
  | 'CLASSIFIED'
  | 'PENDING_ASSIGNMENT'
  | 'ASSIGNED_TO_ROUTE'
  | 'READY_FOR_DISPATCH'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'DELIVERY_FAILED'
  | 'RESCHEDULED'
  | 'RETURN_PENDING'
  | 'RETURNED'
  | 'CANCELLED';

interface PublicTrackingResult {
  readonly trackingCode: string;
  readonly state: PublicTrackingState;
  readonly updatedAt: string | null;
  readonly history: readonly {
    readonly state: PublicTrackingState;
    readonly occurredAt: string;
  }[];
  readonly historyTruncated: boolean;
}

declare function getPublicTracking(token: string): Promise<PublicTrackingResult>;
```

Proyectar como máximo los 100 cambios más recientes de historial, ordenados cronológicamente por `createdAt, id`, sin exponer esos IDs; `historyTruncated` indica recorte. `updatedAt` corresponde al historial más reciente y puede ser `null` si no existe; no inventar fechas. No inventar pasos cumplidos: un fallo, retorno o reprogramación no equivale a entrega. La respuesta no incluye token, tenant, packageId, usuario, destinatario, correo, teléfono, dirección, coordenadas, evidencias, códigos de motivo ni notas internas.

Token desconocido, mal formado o paquete de tenant suspendido: `404 PUBLIC_TRACKING_NOT_FOUND` con el mismo cuerpo genérico. Sin redirección a login. Exceso de consultas: `429 TOO_MANY_REQUESTS` y `Retry-After` en segundos. Propuesta acotada para una instancia: 30 consultas/minuto por IP, incluyendo inválidas, reloj comprobable y mapa con tamaño máximo de 10.000 claves; documentar límites si se despliega en varias instancias y no confiar en cabeceras proxy sin configuración explícita.

`Cache-Control: no-store` y `Referrer-Policy: no-referrer` en la respuesta. UI aplica política de referrer también a la página de rastreo, no registra ni envía el token a analítica, y evita persistirlo en localStorage. El cliente llama `apiFetch('/public/tracking/' + encodeURIComponent(token), { credentials: 'omit' })`.

### RLS y entrega del token

`Package` y `PackageStatusHistory` tienen FORCE RLS por tenant; un `findUnique` sin contexto no resuelve el acceso público. No usar la conexión administrativa ni desactivar RLS en el API. TRACK-01 debe revisar un ADR y una migración que expongan solo una proyección pública por igualdad exacta de token.

Propuesta de implementación a revisar: función SQL de lectura con `SECURITY DEFINER`, sin SQL dinámico, propietario dedicado NOLOGIN y BYPASSRLS con SELECT limitado a las columnas necesarias. El API no conecta con ese rol ni recibe membresía en él. Este privilegio del propietario requiere revisión de seguridad: NOLOGIN y SECURITY DEFINER por sí solos no resuelven FORCE RLS. La función recibe solo el token y devuelve únicamente la proyección anterior, exigiendo tenant activo; no permite consultas arbitrarias ni cambios de datos.

Usar objetos calificados por esquema y `search_path` fijo compuesto solo por esquemas confiables, con `pg_temp` al final. Crear función, revocar ejecución a PUBLIC y conceder EXECUTE al runtime en una misma transacción. El runtime conserva NOBYPASSRLS. Probar SQL directo, grants de columnas y ausencia de membresía efectiva en el propietario. El mecanismo y su migración requieren revisión explícita antes de implementarlos; este documento no otorga credenciales ni privilegios. La distinción entre propietarios, BYPASSRLS y FORCE RLS se fundamenta en [PostgreSQL 17: RLS](https://www.postgresql.org/docs/17/ddl-rowsecurity.html); las restricciones de función en [PostgreSQL 17: SECURITY DEFINER](https://www.postgresql.org/docs/17/sql-createfunction.html#SQL-CREATEFUNCTION-SECURITY).

La respuesta existente de `POST /packages` incluye `publicTrackingToken` en `RegisteredPackage`; UI-04 verifica ese contrato con pruebas y añade al recibo de alta un enlace `/track?token=<token>`. No se crea endpoint de emisión, listado o regeneración de tokens. Si un paquete histórico no tiene token compatible, no se inventa uno desde frontend; queda como seguimiento posterior.

`/seguimiento` acepta token o enlace público del mismo sitio y navega a `/track?token=...`. El parámetro anterior `code` y la guía comercial no autorizan búsquedas. Actualizar textos y eliminar ejemplos de guías mock; conservar un mensaje de ayuda para enlaces antiguos sin convertirlos en una consulta insegura.

## Qué no se implementa en estas entregas

Sin WebSocket/SSE, polling permanente, dashboard, campañas, preferencias de notificación, CRUD de plantillas, adjuntos email, SMS, WhatsApp, tracking GPS, administración de notificaciones ajenas, endpoint de envío manual ni cambios de asignación/ciclo de vida. No se rediseñan las pantallas de entregas ni se elimina globalmente `mockData.ts` mientras existan otros consumidores.

Solo SMTP local/de prueba y configuración de un adaptador SMTP para operación futura; no se contrata proveedor ni se contacta a direcciones reales para verificar. La recepción externa requiere un plan posterior de contactos, consentimiento y política de selección, con migración propia.

## Casos de aceptación compartidos

| ID | Evidencia requerida |
| --- | --- |
| C01 | Listado y contador propios; paginación; cuenta total mayor que la página; vacío y parámetros inválidos |
| C02 | Misma notificación de otro tenant y de otro usuario devuelve 404; EMAIL invisible; plataforma 403; sin sesión 401 |
| C03 | Dos lecturas simultáneas conservan primer readAt; read-all no toca otro usuario ni fechas existentes; recarga coherente ante alta concurrente |
| C04 | Evento duplicado/concurrente produce una fila por usuario/canal; fallo intermedio revierte notificación, ProcessedEvent y outbox de email |
| C05 | Cada binding y productor genera solo el efecto acordado; audit sigue consumiendo; ACK tras commit; retries/DLQ van al consumidor correcto |
| C06 | Email exitoso, fallo temporal, agotamiento, revocación de audiencia, lease caducado y replay terminal; prueba de ventana SMTP aceptado/commit perdido sin promesa exactly-once |
| C07 | Token público válido sin sesión; inválido/desconocido uniforme; tenant suspendido; todos los campos de respuesta en allowlist y 13 estados válidos |
| C08 | Consulta runtime con RLS forzado, función SQL acotada, denegación de lectura SQL directa sin contexto y ausencia de contaminación de conexión entre A/B |
| C09 | React ignora respuestas tardías al cambiar usuario o token; logout limpia inbox; errores de red no se convierten en vacío o 404; 429 visible |
| C10 | Enlace real recibido al registrar un paquete consulta ese mismo paquete; timeline real de fallo/reprogramación; no mocks de producción en estas vistas |

## Siguiente paso común

Revisión conjunta del contrato y de la seguridad de TRACK-01; después ramas independientes desde `develop` actualizado: `feature/ui-04`, `feature/notifications`, `feature/public-tracking`. NOTIF-01 y NOTIF-02 comparten propietario y secuencia, no dos migraciones concurrentes sobre el mismo modelo. Revisar cada fase con evidencia en Compose y no ejecutar commit, push ni merge desde el agente.

## Registro de revisión documental

2026-11-10: se unificaron las firmas HTTP y de cliente, la audiencia aprobada, la activación de email solo para eventos nuevos y un único estado de envío ampliado mediante migración revisada. Se contrastaron las condiciones de FORCE RLS y SECURITY DEFINER con documentación oficial de PostgreSQL 17. La decisión privilegiada de TRACK-01 queda pendiente de revisión de ADR y migración. El lote de 10 documentos pasó comprobación de 42 enlaces locales y 5 ejemplos JSON, sin bloques abiertos, placeholders ni whitespace final. No se implementó código ni se ejecutaron pruebas funcionales.
