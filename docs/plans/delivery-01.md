# DELIVERY-01 — Intentos de entrega, evidencias, incidentes y ciclo final del paquete

## 1. Identidad y propósito

| Campo | Valor |
| --- | --- |
| ID | `DELIVERY-01` |
| Dominio | Logística / Entregas en Calle |
| Estado general | `TODO` |
| Prioridad | `P1`, conforme al tablero de `AGENTS.md` |
| Responsables | Vivian/Humberto; coordinación con Santiago para consumo HTTP y Juanangel para AUTH/TENANT/persistencia |
| Responsable de implementación | `USER`: equipo o ejecutor posterior en Antigravity |
| Apoyo documental | `CODEX_MECHANICAL`: plan, evidencia y cambios mecánicos expresamente solicitados |
| Dependencias directas | `ROUTE-01`, `ITER-01`, `PKG-01` / `PAT-STATE-01`, `AUTH-01`, `TENANT-01` |
| Fundamentos | `DATA-01` / `GDB-01`, `ASSIGN-01`, `VEH-01`, contratos de calendario y Outbox |
| Consumidores posteriores | `ROUTE-CLOSE-01`, `NOTIF-01/02`, `UI-03`; recuperación/reasignación de paquetes reprogramados |
| Rama auditada | `develop` |
| Commit del checkout | `9e483ebfba146fc69aeb5d7a952e3406cb50fa50` (incluye PR #29 de `feature/route-01`) |
| Referencia integrada | `origin/feature/route-01`, `1b558bd4dd0a26e0ee3bfdca1268583129b395bc` (mergeado en develop) |
| Fecha | 2026-10-06, America/Bogota |
| Plan canónico | `docs/plans/delivery-01.md` |
| Informe previsto | `docs/modules/delivery-01-report.md`, por crear durante la implementación |
| ADR previsto | `docs/adr/007-delivery-attempts-evidence-and-final-lifecycle.md`, propuesta íntegra en §4 |

Este documento es un plan conceptual y arquitectónico para ejecución posterior. La auditoría fue contrastada contra el repositorio real: se leyeron código, migraciones, pruebas, configuración y referencias Git locales. La suite completa actual de 68 suites y 572 pruebas pasa en verde.

**Reconciliación con el repositorio real:** ROUTE-01 y sus tres iteradores ya se encuentran completamente integrados en esta rama `develop` tras el PR #29. Las siete clases State de paquetes requeridas existen y están probadas. El punto de partida técnico está desbloqueado para iniciar con el Paso 1.1 (Preflight y Contratos).

El diseño permite trabajar con Docker Compose, PostgreSQL/PostGIS y almacenamiento local, sin contratar servicios de archivos, firma, mapas o correo. La implementación posterior queda preparada para el flujo del equipo en Antigravity.

## 2. Alcance, dependencias y fuentes

### 2.1 Incluido

- Arribo a una parada: validar ruta, mensajero y manifiesto; pasar sus paquetes elegibles de `IN_TRANSIT` a `OUT_FOR_DELIVERY` mediante State.
- Intentos exitosos y fallidos por paquete, con numeración histórica determinista, motivo estructurado y protección ante repetición/concurrencia.
- Evidencias básicas: foto y/o imagen de firma manuscrita capturada; checksum SHA-256 calculado por el servidor y descarga autorizada. La firma no representa firma criptográfica certificada ni validación biométrica.
- Resolución de paradas con uno o varios paquetes, sin completar prematuramente una parada ni perder su resultado histórico.
- Reprogramación con nueva ventana acordada; solicitud de devolución y recepción física en depósito.
- Recepción en depósito de paquetes reprogramados: libera su asignación anterior sin convertirlos en `RETURNED`. Es parte mínima de la custodia física, no cierre de ruta ni nueva planificación.
- Incidentes operativos ligados coherentemente a ruta, parada y/o paquete; reporte inicial `OPEN` y consulta autorizada.
- Manifiesto de paradas pendientes/fallidas usando los iteradores existentes; historial paginado de intentos y evidencias por paquete o parada.
- Una transacción `SERIALIZABLE` por comando de negocio: intento, referencias de evidencia, paquete, parada, asignación cuando corresponda, historial, auditoría, Outbox y recibo idempotente.
- Adaptadores Prisma y storage local, DTOs, autorización explícita, RLS real con `sls_app`, pruebas unitarias/de arquitectura/E2E e informe reproducible.

### 2.2 Fuera de alcance

- GPS en tiempo real, geocercas, rastreo continuo, aplicación móvil nativa y operación offline con resolución de conflictos.
- Cierre operativo/contable y resumen de ruta (`ROUTE-CLOSE-01`): no pasar automáticamente la ruta a `COMPLETED` ni liberar globalmente vehículo/mensajero al terminar una parada.
- Clustering, optimización, nuevos algoritmos geográficos, reasignación automática y reapertura de paradas ya resueltas.
- Implementar aquí la recuperación de `RESCHEDULED -> ASSIGNED_TO_ROUTE`: State la admite, pero el flujo actual de ASSIGN-01 solo admite `CLASSIFIED`. Registrar esta integración posterior explícitamente.
- Firma avanzada, biometría, pagos contra entrega, indemnizaciones, investigación/resolución de incidentes y clasificación automática de fotos.
- Almacenamiento SaaS, enlaces públicos permanentes o binarios en PostgreSQL.
- Publicador Outbox, consumidores RabbitMQ, email/notificaciones y frontend completos. DELIVERY deja eventos durables y contratos; fallos de notificación no revierten una entrega.
- Refactor global de AUTH, rutas o paquetes. Las brechas que afectan este camino deben resolverse o integrarse como dependencia focalizada antes de habilitarlo.

### 2.3 Fuentes y precedencia

- [AGENTS.md](../../AGENTS.md), especialmente §§8–11, 15–22 y 25–28.
- [Plantilla de planes](../../.agents/skills/sls-module-workflow/assets/module-plan-template.md) y [flujo de módulos](../../.agents/skills/sls-module-workflow/SKILL.md).
- [ADR-002](../adr/002-assignment-integrity.md), [ADR-005](../adr/005-transactional-route-assignment.md), [plan PKG-01](pkg-01.md), [plan ASSIGN-01](assign-01.md) y [README de integración](../../backend/test/integration/README.md).
- En `1b558bd`: `docs/adr/006-route-lifecycle-and-stop-iterator.md`, `docs/plans/route-01.md`, `docs/modules/route-01-report.md`, código y runner ROUTE-01. Se indican como rutas de la referencia porque aún no existen en este checkout.

Ante contradicción, prevalecen comportamiento probado y migraciones aplicables, luego código/configuración, documentación vigente e historial. Los estados `DONE` de otros documentos no sustituyen la verificación de la base que finalmente ejecute DELIVERY.

## 3. Diagnóstico del repositorio real

Todas las rutas siguientes son relativas a la raíz. “Existe” significa inspeccionado, no ejecutado en esta auditoría.

### 3.1 Código y contratos

| Área | Evidencia observada | Implicación para DELIVERY-01 |
| --- | --- | --- |
| Esquema | `backend/prisma7.config.ts` configura `prisma/schema` y `prisma/migrations` | Prisma es multiarchivo; usar `--config prisma7.config.ts`. No crear `schema.prisma` monolítico |
| Paquetes | `modules/packages/domain/package.aggregate.ts`: `reconstitute`, `transitionTo`, `pullDomainEvents`; estado privado | Reutilizar el agregado, sin `setState` ni transición decidida en Prisma |
| State | Existen `in-transit`, `out-for-delivery`, `delivered`, `delivery-failed`, `rescheduled`, `return-pending`, `returned` en `domain/states/` | Completar integración y pruebas, no duplicar estas clases |
| Eventos de paquetes | `domain/events/package-state-changed.event.ts` ya mapea `PackageDelivered`, `DeliveryFailed`, `PackageRescheduled`, etc. | Un único evento del State por transición; no generar otro homónimo desde el intento |
| Persistencia de paquetes | `PrismaPackageLifecycleRepository.transitionAtomically` abre su propia transacción y espera exactamente un evento | No llamarlo desde otra UoW. Extraer/adaptar persistencia ligada a una sesión compartida |
| Rutas en checkout | No existe `backend/src/modules/routes/` ni `RoutesModule` en `app.module.ts` | Preflight debe integrar la dependencia antes de implementar el flujo |
| Rutas en `1b558bd` | `Route`, `RouteStop` inmutable, tres iteradores, prepare/start/cancel/interrupt, API `/api/v1/routes` y `PrismaRouteLifecycleUnitOfWork` | Base real para extensión. No hay operaciones de entrega ni cierre |
| Paradas en `1b558bd` | `RouteStop` usa `stopNumber`, mapper a `sequence`; `Route` expone `createIterator/createPendingIterator/createFailedIterator` | Mantener secuencia e iteradores snapshot; agregar operaciones controladas de arribo/resolución |
| ITER antiguo | `origin/feature/route-stop-iterator` apunta a `6b217974a476c765a7e38d5eb95e6ff82c6ccbe5`, prototipo anterior | No integrarlo adicionalmente: los tres iteradores requeridos están en ROUTE-01 |
| Transacciones | ASSIGN-01 usa SERIALIZABLE; ROUTE-01 amplía `runWithTenant` con opciones y reintentos | Reutilizar infraestructura compatible, sin transacciones anidadas ni políticas en adapters |
| Escrituras State en ROUTE-01 | Prepare/start usan un writer directo de estado; su `updateMany` no verifica cantidad afectada | Deuda de la dependencia: DELIVERY debe usar State y verificar filas; revisar la adaptación compartida sin tomar ese writer como precedente |
| Contexto HTTP | `shared/presentation/request-context.decorator.ts` acepta `x-tenant-id`, `x-user-id` y fallback `system-coordinator` | `@CurrentContext()` por sí solo no prueba autenticación; retirar esa confianza del camino productivo |
| Permisos de rutas | `AuthRouteAccessAdapter` de ROUTE-01 contiene fallback “no courier = coordinator” y comprobaciones de usuario activo | No reutilizar esos atajos como autorización de entregas; exigir permisos y asignación explícitos |
| AUTH en checkout | No hay `modules/auth/` integrado | La validación real de credenciales/sesión es dependencia de la entrada HTTP; pruebas con headers no la sustituyen |
| Outbox | Tabla y writers existentes; formatos de payload no uniformes entre packages y planificación | Definir contrato DELIVERY compatible y versionado, sin afirmar que EVT-01/publicación ya estén terminados |
| TypeScript | `tsconfig.json` tiene `strictNullChecks`, pero `noImplicitAny: false`; build excluye tests | Crear configuración estricta del alcance incluyendo tests; build solo no demuestra strict |
| Verificación | Runners `gdb-01/05/06`, `geocode-01`, `assign-01`; `route-01` en referencia | Crear `delivery-01.cjs` y sus suites; no inventar resultados pasados |

### 3.2 Modelos y brechas de datos

| Modelo real | Qué contiene | Brecha concreta |
| --- | --- | --- |
| `DeliveryAttempt` en `delivery.prisma` | Tenant, parada, paquete, courier, `attemptNumber`, outcome, notes, attemptedAt; FK compuestas | Unique actual `(routeStopId, attemptNumber)`; faltan motivo estructurado, vínculo inequívoco a asignación y replay |
| `DeliveryEvidence` | Tenant, intento, `evidenceType`, `storageKey`, `checksum`, createdAt | Tipo/checksum son strings sin contrato suficiente; falta adapter y descarga protegida |
| `Incident` | Tenant, referencias opcionales ruta/parada/paquete, actor, type, description, status | No exige destino ni coherencia entre destinos; no hay caso de uso |
| `Package` / `PackageStatusHistory` | Todos los estados pedidos e historial con actor/motivo | El agregado solo maneja identidad/estado; intento, custodia y ventana requieren políticas y puertos de DELIVERY |
| `RouteStop` | `PENDING/COMPLETED/FAILED`, sequence y tiempos de calendario | `arrivalAt/serviceStartAt/serviceEndAt` pertenecen a la planificación y tienen restricciones de ventana; no usarlos para horarios reales |
| `Assignment` | Historial de paquete/ruta/parada/flota, `ACTIVE/ENDED/CANCELLED`, reason, endedAt | Validar asociación exacta al intentar entregar; terminar custodia solo cuando corresponde |
| `DeliveryWindow` en `calendar.prisma` | Ventanas por tenant/paquete con startAt/endAt `Timestamptz(3)` | Crear otra ventana al reprogramar y vincularla a la operación; no inferir una ventana vigente con `MAX(startAt)` |
| `AuditLog` / `OutboxEvent` | Auditoría y eventos durables por tenant | Integrarlos al mismo commit; payload sin evidencia, notas o datos personales innecesarios |

Una FK que demuestra pertenencia al mismo tenant no demuestra que el paquete esté en esa parada ni que el mensajero esté asignado a esa ruta. Estas relaciones deben releerse y comprobarse dentro de la transacción.

### 3.3 Migraciones relevantes

| Migración | Aporte que se conserva |
| --- | --- |
| `20260906213751_init_schema` | Tablas de entregas, roles/grants iniciales, RLS `ENABLE/FORCE` |
| `20260914120000_unique_active_assignment` | Unique parcial de asignación activa por tenant/paquete |
| `20260914130000_logistics_integrity` | FK compuestas y políticas tenant con `USING/WITH CHECK`; revoca grants por defecto para futuras tablas |
| `20260915010000_enable_postgis` | Extensión PostGIS |
| `20260915040000_calendar_windows_availability` y `20260915041000_calendar_integrity` | Ventanas, horarios planificados y validación de relaciones; preservación de ventanas referenciadas |
| `20260926190000_gdb_06_states_compatibility` | Compatibilidad de estados y State |
| `20261005183000_calendar_planning_grants_and_rls` | Permisos/RLS de calendario y planificación |
| `20261005234500_route_lifecycle_and_planning_snapshot`, solo en `1b558bd` | `RoutePlanningRequest.resultSnapshot`, índices y grants de ROUTE-01 |

Las nuevas tablas no heredan automáticamente los grants necesarios. La migración DELIVERY deberá declarar permisos, `ENABLE/FORCE ROW LEVEL SECURITY` y políticas tenant explícitas. No modificar migraciones ya publicadas ni resetear bases compartidas.

## 4. Propuesta formal de ADR-007

**Título:** Intentos de entrega atómicos, custodia física y evidencias desacopladas.

**Estado:** Propuesto; no aceptado ni implementado por escribir este plan.

**Fecha:** 2026-10-06.

**Contexto:** una ruta iniciada necesita registrar resultados por paquete, evidencias y excepciones sin perder aislamiento, historial ni consistencia frente a concurrencia y pérdida de respuesta HTTP.

**Decisión:** adoptar D1–D8. En 1.1 publicar esta propuesta en el ADR previsto y registrar su aceptación por los responsables en el flujo de implementación; no exige una confirmación adicional para elaborar este plan.

### D1. Responsabilidades y contratos entre capas

```text
HTTP autenticado / CurrentContext / DTOs / guardas
  -> casos de uso puros de deliveries/application
     -> políticas de entregas + PackageAggregate/State + Route/Iterator
     -> puertos de acceso, transacción, storage, reloj e identificadores
        <- adaptadores de infraestructura y composición NestJS
```

- `deliveries/domain/`: intento, evidencia como referencia inmutable, motivos, incidente y políticas de validación/resolución. No convierte HTTP, usa Prisma ni realiza I/O.
- `deliveries/application/`: flujo de negocio; decide elegibilidad, ejecuta State, prepara cambios y consume puertos. Sin NestJS, Prisma, Express, cliente generado o tipos de storage concretos.
- `packages` conserva State; `routes` conserva agregado/paradas/iteradores; `assignments` conserva historial de custodia. `deliveries` no reemplaza sus reglas mediante consultas propias arbitrarias.
- `DeliveryUnitOfWork.run(context, work)` entrega una `DeliverySession` con contratos tipados para lectura bloqueada, paquetes, rutas/paradas, asignaciones, intentos/evidencias, calendario, incidentes, auditoría, Outbox y recibos. Ningún contrato expone `Prisma.TransactionClient`.
- La composición crea adapters propiedad de cada módulo ligados a **la misma transacción**. Un adapter puede mapear snapshots y escrituras decididas; no invoca State, decide resultado de parada ni dirige el caso de uso.
- Puertos mínimos: `DeliveryAccessPort`, `DeliveryUnitOfWork`, `DeliveryReadPort`, `EvidenceStoragePort`, `Clock`, `IdGenerator`. Los métodos concretos de sesión se acuerdan en 1.1; evitar un repositorio genérico que acepte SQL o modelos Prisma.
- Casos de uso: `AttendRouteStopUseCase`, `RecordSuccessfulDeliveryUseCase`, `RecordFailedDeliveryUseCase`, `RescheduleDeliveryUseCase`, `RequestPackageReturnUseCase`, `ReturnPackageToDepotUseCase`, `ReportIncidentUseCase`, `GetDeliveryManifestUseCase`, consultas de intentos/incidentes y `DownloadDeliveryEvidenceUseCase`.

Organizar dentro de `backend/src/modules/deliveries/{domain,application/ports,application/use-cases,infrastructure/persistence,infrastructure/storage,presentation/dto,test}`. Crear únicamente archivos con comportamiento real; `deliveries.module.ts` y `app.module.ts` componen dependencias. Mantener incidentes en este módulo para el reporte acotado del MVP; no crear otra capacidad vacía.

### D2. State de paquetes, llegada y custodia

| Comando | Precondiciones y transición | Efectos adicionales |
| --- | --- | --- |
| Atender parada | Ruta `IN_PROGRESS`, parada `PENDING`, courier asignado; paquetes del manifiesto `IN_TRANSIT -> OUT_FOR_DELIVERY` | Arribo real, historial/evento por paquete y auditoría/recibo del comando; ningún intento todavía |
| Entrega exitosa | Paquete `OUT_FOR_DELIVERY`, asignación `ACTIVE` exacta, evidencia válida | Intento `DELIVERED`, State a `DELIVERED`, finaliza esa asignación como `ENDED` |
| Entrega fallida | Mismas identidades, paquete `OUT_FOR_DELIVERY`, motivo válido | Intento `FAILED`, State a `DELIVERY_FAILED`; conserva asignación `ACTIVE` y carga física |
| Reprogramar | Paquete `DELIVERY_FAILED` y último intento fallido; permiso de coordinación | State a `RESCHEDULED`, nueva ventana acordada; conserva `ACTIVE` hasta recepción física |
| Solicitar devolución | Paquete `DELIVERY_FAILED`; permiso de coordinación | State a `RETURN_PENDING`, motivo y destino depósito; mantiene custodia |
| Recibir devolución | Paquete `RETURN_PENDING`, depósito esperado y declaración física autorizada | State a `RETURNED`, finaliza asignación, auditoría y evento |
| Recibir reprogramado | Paquete `RESCHEDULED`, depósito esperado y declaración física autorizada | Conserva `RESCHEDULED`, finaliza asignación, auditoría y `PackageReceivedAtDepot`; ningún historial de transición ficticia |

La recepción es `ReturnPackageToDepotUseCase`; distingue devolución final de recepción para un nuevo despacho mediante el estado persistido, no mediante un estado libre enviado por el cliente. Se registra `depotId`, actor y `receivedAt` del servidor en su recibo durable/auditoría. La ruta debe estar `IN_PROGRESS` o `INTERRUPTED`; el depósito se obtiene de la ruta histórica y se valida contra el solicitado. Una ruta sin depósito válido no admite recepción hasta corregir esa dependencia.

El mensajero registra llegada/intentos solo en su ruta `IN_PROGRESS`. Una ruta `INTERRUPTED` permite incidentes, decisión de reprogramación/devolución y recepción física autorizada, pero no nuevos intentos en calle. Una ruta `COMPLETED/CANCELLED` no acepta estas mutaciones; la repetición de un comando ya confirmado sigue el contrato de replay tras autorizar al actor.

Arribo se aplica atómicamente a todos los paquetes aún `IN_TRANSIT` de la parada. Los ya `OUT_FOR_DELIVERY` o con resultado de esa visita permanecen iguales. Si la llegada ya consta, la misma clave devuelve el resultado original sin duplicar historial; una clave nueva devuelve `409 STOP_STATE_CONFLICT`. Una parada terminal también admite replay de su operación original. No imponer una sola parada abierta por ruta ni navegación GPS; la operación valida el identificador seleccionado y conserva el orden del manifiesto.

Las clases State ya existentes deciden todas las transiciones. Añadir tiempo confiable opcional a `PackageTransitionMetadata` o un reloj puro para que intento, historial y evento compartan la misma fecha; conservar compatibilidad de callers existentes. Reconstitución no emite eventos y una transición inválida no muta el agregado. Nunca hacer `DELIVERY_FAILED -> DELIVERED`, `RESCHEDULED -> OUT_FOR_DELIVERY` ni `RETURN_PENDING -> RETURNED` por el mero paso del tiempo.

El intento fallido no obliga a reprogramar inmediatamente: es un resultado de negocio válido. Un nuevo intento exige una nueva asignación/visita del flujo posterior. `DeliveryOutcome.RESCHEDULED` se conserva para compatibilidad, pero estos casos de uso no lo escriben: acordar otra fecha no representa una entrega intentada físicamente.

Al finalizar asignaciones, usar un puerto `endActiveAssignment` condicionado por tenant, ID, paquete y visita; exigir exactamente una fila. Conservar todos sus identificadores y motivos originales; registrar motivo de finalización en auditoría/recibo o campo separado, sin borrar el motivo de asignación. No liberar vehículo/mensajero ni alterar el snapshot de planificación.

### D3. Resultado de paradas, manifiesto e Iterator

Una parada puede contener varios paquetes. La regla “entrega exitosa completa la parada” solo aplica cuando ese intento resuelve el último paquete y todos fueron entregados.

Sea `M` el manifiesto histórico de asignaciones activas de esa ruta/parada al despacho, incluyendo las que después pasan a `ENDED` y excluyendo las canceladas/terminadas antes del despacho. El contrato debe preservar esos miembros mediante el manifiesto congelado o su historial verificable; no reconstruirlos reuniendo indiscriminadamente toda asignación que haya pasado por la parada. Sea `R` su conjunto de resultados terminales de visita, vinculados al intento y su asignación. No calcularlo solo con asignaciones actualmente `ACTIVE` ni con el estado actual del paquete, que podrá cambiar en otra ruta.

| Situación de la visita | Estado persistido de parada |
| --- | --- |
| Existe un miembro de `M` sin resultado terminal | `PENDING` |
| Todos tienen resultado y todos son `DELIVERED` | `COMPLETED` |
| Todos tienen resultado y al menos uno es `FAILED` | `FAILED` |

Una parada mixta sigue `PENDING` tras el primer fallo si falta atender otro paquete; el manifiesto pendiente puede incluir `hasFailures: true`. Cuando termina se vuelve `FAILED`, aunque el último intento haya sido exitoso. Reprogramar, devolver o entregar el paquete en otra visita no cambia el resultado histórico de esa parada. Una parada vacía o con manifiesto incoherente devuelve conflicto de integridad; no se marca completada por vacuidad.

Extender `Route` con operaciones controladas de arribo/resolución que sustituyan una copia inmutable de `RouteStop` y validen transiciones `PENDING -> COMPLETED/FAILED`. Sin mutación pública ni vuelta implícita a `PENDING`. Añadir `actualArrivalAt` y `actualServiceEndAt` opcionales, separados de tiempos planificados. Terminar servicio no equivale cerrar la ruta.

El caso de uso de manifiesto obtiene una ruta autorizada y consume el patrón explícitamente:

```ts
const iterator = query.view === 'failed'
  ? route.createFailedIterator()
  : route.createPendingIterator();

while (iterator.hasNext()) {
  const stop = iterator.next();
  if (stop !== null) {
    // Proyectar parada y paquetes usando datos autorizados de esa visita.
  }
}
```

No filtrar la colección interna desde el controlador ni recalcular secuencias. Precargar la proyección de paquetes/resultados por lote mediante el puerto de lectura, evitando una consulta por parada. Orden `1..N` original, cursores independientes y snapshot inmutable: un iterator creado antes de una mutación no cambia; uno nuevo observa el nuevo estado.

### D4. Transacción SERIALIZABLE, concurrencia y repetición

**Unidad atómica SQL:** por intento, guardar `DeliveryAttempt`, todas sus `DeliveryEvidence`, estado de paquete, resultado/horarios reales de parada cuando cambian, asignación cuando finaliza, `PackageStatusHistory`, `AuditLog`, `OutboxEvent` y `DeliveryOperation`. Si falla cualquiera o el commit, se revierte todo. Para el fallo sin archivos, el conjunto de evidencias es vacío. Reprogramación, devolución, recepción, llegada e incidente usan la misma garantía para sus efectos correspondientes.

Protocolo dentro de `PrismaDeliveryUnitOfWork`:

1. Validar contexto; abrir transacción `SERIALIZABLE`; establecer `app.tenant_id` local parametrizado en esa conexión. Cliente runtime `sls_app`, sin privilegios de propietario/superusuario/bypass RLS.
2. Buscar recibo por tenant/clave y verificar hash, actor y acceso actual a su visita histórica. Si existe y corresponde, devolverlo antes de exigir estado elegible o asignación todavía ACTIVE; esto permite replay después de entregar o recibir en depósito. El resultado guardado conserva los IDs de esa visita para autorizarlo sin depender de la asignación actual.
3. Para un comando nuevo, resolver y bloquear ruta; después todos los paquetes de la parada afectados, ordenados por ID. Seguir el orden compartido de ROUTE-01 `ruta -> paquetes ordenados -> vehículo -> courier` cuando se necesiten esos recursos. Bloquear luego parada y asignaciones en orden estable. Un incidente de ruta sin paquete no inventa bloqueos de paquetes. Releer estados, manifiesto, usuario/permisos y courier dentro de la sesión; revalidar allí la ruta/asignación que se usó para localizar recursos.
4. Volver a comprobar el recibo frente a solicitudes concurrentes, aplicar políticas y transiciones en aplicación/dominio y determinar la resolución de parada sobre la visita completa. Todo writer debe respetar el protocolo de locks: revisar cancelación/interrupción/asignación para no crear orden inverso. La UoW existente es referencia, no prueba suficiente contra deadlocks.
5. Numerar intento con `1 + MAX(attemptNumber)` por `(tenantId, packageId)` bajo lock de paquete, incluyendo intentos anteriores de otras rutas. No usar secuencia PostgreSQL para esta numeración de negocio.
6. Persistir cambios con estado previo esperado y comprobar filas afectadas; insertar auditoría, eventos y recibo. Responder únicamente después del commit.

Reintentar la transacción completa solo ante `P2034`, SQLSTATE `40001` o `40P01` debidamente traducidos, como máximo **tres ejecuciones totales** (inicial + dos reintentos), con espera acotada inyectable, por ejemplo 25 ms y 75 ms con jitter. Recrear agregados, lecturas y eventos en cada ejecución. Timeout propuesto 10 s por transacción y 5 s de espera de conexión, sin llamadas a storage, email ni RabbitMQ dentro. Al agotar, responder `503 DELIVERY_CONCURRENCY_RETRY_EXHAUSTED`; no devolver éxito ni un intento fallido de negocio.

**Replay HTTP:** todas las mutaciones de DELIVERY requieren `Idempotency-Key` UUID. `DeliveryOperation` tiene unique `(tenantId, requestId)`, actor, tipo de comando, destino, hash normalizado y resultado mínimo persistido. Mismo tenant/key/actor/comando: devuelve resultado original e IDs sin nuevas escrituras de negocio. Otro contenido o actor: `409 IDEMPOTENCY_KEY_REUSED`. La autorización actual se verifica antes de devolver el recibo. El hash incluye destinos, motivo/notas normalizadas, ventana y tipos/checksums de archivos, no boundary multipart, orden de propiedades JSON ni storage keys aleatorias.

Una colisión unique del recibo se resuelve tras rollback leyendo el recibo confirmado y comparándolo; no se trata como retry genérico de cualquier error unique. Dos claves distintas para entregar el mismo paquete dejan un único ganador; la otra recibe `409 PACKAGE_STATE_CONFLICT`. Dos paquetes diferentes de la misma parada pueden completarse concurrentemente y el último commit calcula correctamente el estado de la parada. Un timeout de red con commit incierto se resuelve repitiendo **la misma clave**, nunca compensando a ciegas.

El único contador nuevo confirmado corresponde a una visita nueva: un rollback no consume número y un replay no lo incrementa. Tras migrar historial legado, usar su máximo conservado, sin renumerar intentos históricos silenciosamente. Esto es idempotencia de comandos; no implementa todavía Idempotent Consumer ni entrega exactamente una vez por RabbitMQ.

### D5. Evidencias y `EvidenceStoragePort`

Adoptar carga junto al comando exitoso mediante multipart, sin endpoint público de archivos ni claves elegidas por cliente. Tipos de aplicación `PHOTO` y `SIGNATURE`; una o dos imágenes por intento, máximo una de cada tipo, al menos una para `DELIVERED`. Formatos permitidos PNG/JPEG, máximo 5 MiB por archivo y 10 MiB acumulados; inspeccionar contenido además de MIME/extensión. Un fallo puede enviarse sin evidencia o con la misma política opcional. Notas no sustituyen la evidencia requerida para éxito.

El puerto puro ofrece preparación de objeto inmutable, lectura autorizada por descriptor y limpieza de objetos de esa operación; usa datos/bytes o stream abstracto propio, no `Express.Multer.File`, `Response`, rutas absolutas o cliente S3. Infraestructura implementa filesystem y SHA-256; aplicación recibe descriptores `{storageKey, evidenceType, checksum}` ya calculados. No confiar en checksum suministrado por cliente.

Flujo fuera/dentro de SQL:

1. Autenticar y comprobar preliminarmente acceso a ruta/paquete antes de aceptar archivos. Aplicar límites de streaming; no cargar cuerpos ilimitados en memoria.
2. Crear archivo temporal privado; validar, calcular checksum de sus bytes y moverlo a una ubicación inmutable durable antes de iniciar la UoW. Clave aleatoria generada por servidor con ámbito tenant/operación; cada ejecución HTTP prepara objetos propios, aunque comparta clave idempotente.
3. La UoW revalida autorización/negocio y registra únicamente referencias verificadas. No renombrar ni subir el archivo después del commit: una entrega confirmada no debe depender de un upload posterior.
4. Ante rollback confirmado, borrar solo objetos preparados por esa ejecución y que no quedaron referenciados. En replay concurrente, limpiar los nuevos objetos sobrantes; conservar los del resultado original. Ante commit incierto, consultar recibo/referencias antes de cualquier eliminación.
5. Caídas pueden dejar archivos privados sin referencia. Proveer reconciliación explícita con listado previo, antigüedad mínima y exclusión de uploads/escrituras mientras decide y elimina; consultar referencias durables. No ejecutar un barrido concurrente que borre un archivo entre preparación y commit. Registrar fallos de limpieza y permitir reintento seguro.

**Límite de la garantía:** filesystem y PostgreSQL no comparten transacción. “Cero escrituras parciales” aplica al conjunto SQL; los archivos huérfanos son un estado técnico de preparación recuperable, no una entrega parcial visible. Tests deben demostrar ausencia de referencias confirmadas a archivos que nunca se guardaron y conservación de archivos ante fallo de limpieza/commit incierto. Pérdida posterior del disco requiere respaldo/recuperación operacional, no un supuesto rollback distribuido.

Montar volumen persistente privado en Compose; raíz propuesta `EVIDENCE_STORAGE_ROOT=/var/lib/sls/evidence`, con permisos de usuario del contenedor y sin servirla como directorio estático. No almacenar en `dist`, repositorio, ruta efímera del contenedor ni base de datos. El adaptador evita traversal/symlinks y normaliza resolución dentro de su raíz. No aceptar URL remota para que el servidor la descargue.

Descarga por `evidenceId`: buscar metadata bajo RLS, verificar permiso sobre su paquete/visita y resolver el archivo mediante el puerto. No devolver `storageKey` ni rutas locales en API; responder bytes con tipo verificado y `Content-Disposition`. Un archivo faltante genera error de integridad/servicio y auditoría técnica; nunca cambiar `DELIVERED` por ese fallo.

### D6. Esquema, reprogramación e incidentes

Cambios propuestos en nuevas migraciones, sujetos a inventario real de datos en 1.1/4.1:

| Elemento | Diseño propuesto |
| --- | --- |
| Numeración | Sustituir unique `(routeStopId, attemptNumber)` por `(tenantId, packageId, attemptNumber)`; conservar el CHECK positivo existente; índice de consulta `(tenantId, routeStopId, attemptedAt, id)` |
| Motivo de fallo | `DeliveryFailureReason`: `RECIPIENT_ABSENT`, `ADDRESS_NOT_FOUND`, `RECIPIENT_REFUSED`, `ACCESS_RESTRICTED`, `DAMAGED_PACKAGE`, `OTHER`; `reasonCode` en intento, requerido para nuevos `FAILED`, prohibido para `DELIVERED`; `OTHER` exige notes |
| Asociación del intento | `assignmentId` y relación compuesta que compruebe tenant, asignación, paquete, parada y courier; añadir unique compuesto necesario en Assignment. Una visita nueva admite un solo intento terminal por `(tenantId, assignmentId)`; replay no inserta otro. Nuevos intentos exigen vínculo; planificar compatibilidad de filas antiguas antes de hacerlo NOT NULL |
| Evidencia | Unique `(tenantId, id)` si se necesita para referencias y `(tenantId, storageKey)`; CHECK SHA-256 hexadecimal de 64 caracteres y tipo `PHOTO/SIGNATURE` para nuevas filas; mantener las tres piezas de metadata, sin binarios |
| Tiempos reales | `RouteStop.actualArrivalAt` y `actualServiceEndAt`, opcionales `Timestamptz(3)`, fin no anterior al arribo; no sustituir tiempos planificados |
| Recibo | `DeliveryOperation`: ID UUID, tenant, requestId UUID, actorUserId, commandType, targetId, requestHash SHA-256, resultSnapshot JSON mínimo, createdAt; unique `(tenantId, requestId)`; FK tenant/actor; inmutable tras commit |
| Ventana acordada | Insertar `DeliveryWindow`; vincular su ID a `DeliveryOperation` mediante FK compuesta nullable para operación de reprogramación. Resultado incluye paquete, ventana y operación. No añadir otra tabla de ventanas ni sobrescribir una anterior |
| Incidente | CHECK al menos un destino; mantener `IncidentStatus` existente. Tipos de dominio `VEHICLE_BREAKDOWN`, `ACCIDENT`, `ROAD_BLOCKED`, `SECURITY_ISSUE`, `PACKAGE_DAMAGE`, `OTHER`; validación exhaustiva antes de persistir |
| Nuevos objetos | Grants explícitos, RLS `ENABLE/FORCE`, políticas `USING/WITH CHECK`, FK con tenant e índices de consultas; mantener unique parcial ACTIVE y snapshots de planificación |

Los límites del motivo, notas y descripción se fijan en contratos: notes hasta 1000 caracteres; descripción de incidente obligatoria de 1–2000 caracteres tras trim. Una restricción más fuerte que los datos antiguos requiere comprobarlos y migrarlos con correspondencia revisada. No asumir tablas vacías, inventar motivos para hechos históricos ni normalizar checksums desconocidos como si fueran válidos. Si no se puede reconstruir `assignmentId`, conservar legado identificable y aplicar la nueva exigencia a operaciones nuevas hasta resolver los datos. Antes de crear unique por paquete, detectar colisiones entre rutas; reportar IDs y diseñar una migración aprobada sin borrado o renumeración silenciosa.

En un legado incompatible, separar expansión y validación: columnas inicialmente nullable para conservar historia, exigencia de metadatos en todos los comandos nuevos y constraints progresivas que no inventen hechos antiguos. Si se usa un CHECK `NOT VALID`, documentar que sí valida nuevas escrituras y requiere una validación posterior del legado. No declarar completada la migración fuerte ni la compatibilidad histórica hasta resolver sus colisiones y demostrar el upgrade. Probar esta ruta además del caso sin datos previos.

**Ventana de reprogramación:** recibir `startAt/endAt` ISO 8601 con offset explícito, exigir `start < end` y comienzo posterior al instante del comando; guardar UTC y mostrar con zona del depósito. Registrar acuerdo mediante actor, motivo y ventana; no contactar al cliente desde este caso de uso. No alterar `Package.deadline` ni usarla como rechazo automático: si la nueva ventana la supera, devolver `exceedsDeadline: true` y auditarlo, pues reprogramar no debe falsear el compromiso original. El conjunto histórico de ventanas permanece íntegro; una futura planificación consume el ID devuelto/vinculado al reprogramar, no una selección implícita.

Para reprogramar o solicitar retorno, `failedAttemptId` debe ser el último intento fallido del paquete y corresponder a la asignación que conserva su custodia; rechazar un intento de una visita antigua aunque sea del mismo tenant. Los motivos de decisión son contratos distintos del motivo del intento: reprogramación acepta `RECIPIENT_REQUEST`, `DELIVERY_WINDOW_CHANGED` o `COORDINATOR_DECISION`; retorno acepta `RECIPIENT_REFUSED`, `UNDELIVERABLE_ADDRESS`, `DAMAGED_PACKAGE` o `RETURN_REQUESTED`. Se guardan en historial/auditoría/recibo sin modificar el `reasonCode` del intento fallido.

**Incidentes:** derivar ruta desde parada/asignación cuando corresponda. Si llegan varios IDs, deben pertenecer al mismo tenant y a la misma visita. Un incidente solo de paquete en calle exige su asignación a la ruta del actor; no vincular arbitrariamente un paquete del mismo tenant. `reportedByUserId` se obtiene del contexto y el estado inicial es `OPEN`. Reportar no cambia automáticamente estados de paquete/ruta/parada; un incidente de avería puede motivar después la interrupción mediante ROUTE-01. Auditoría, `IncidentReported` y recibo se guardan juntos; resolver/cerrar el incidente queda fuera de este módulo.

### D7. HTTP v1, autorización y errores

Base única propuesta `/api/v1/deliveries`. Todas las mutaciones reciben `Idempotency-Key` y opcional `X-Correlation-Id` UUID válido; si este último falta se genera en servidor. Ni body ni cabeceras tenant/user libres autorizan. El guard autentica credencial/sesión y construye `request.user`; `@CurrentContext()` extrae solo ese principal validado y la correlación. Rechazar campos `tenantId`, `actorUserId`, `courierId`, `attemptNumber`, estado objetivo o checksum autoritativo en DTOs públicos.

Permisos lógicos propuestos, a mapear/sembrar en AUTH: `deliveries.execute` para mensajero asignado; `deliveries.manage` para coordinador/administrador de tenant; `deliveries.receive` para recepción física autorizada; `deliveries.read` e `incidents.report`. No deducir un rol por no ser courier. Un administrador no se convierte implícitamente en mensajero ni puede registrar éxito a su nombre. Superadmin no tiene bypass logístico.

| Método y ruta relativa | Caso de uso / input | Actor permitido y respuesta nueva |
| --- | --- | --- |
| `POST /routes/:routeId/stops/:stopId/attend` | `AttendRouteStopUseCase`, body vacío | Courier asignado + execute; 200 con parada, arribo y paquetes afectados |
| `POST /routes/:routeId/stops/:stopId/packages/:packageId/successful-attempts` | `RecordSuccessfulDeliveryUseCase`; multipart notes opcional, photo/signature | Courier asignado + execute; 201 con intento, número, paquete, parada y evidencia IDs |
| `POST /routes/:routeId/stops/:stopId/packages/:packageId/failed-attempts` | `RecordFailedDeliveryUseCase`; multipart reasonCode, notes opcional, archivos opcionales | Courier asignado + execute; 201 con intento/motivo/estados |
| `POST /packages/:packageId/reschedules` | `RescheduleDeliveryUseCase`; failedAttemptId, startAt, endAt, reasonCode | Manage; 201 con operación, ventana y estado |
| `POST /packages/:packageId/return-requests` | `RequestPackageReturnUseCase`; failedAttemptId, reasonCode | Manage; 201 con operación y `RETURN_PENDING` |
| `POST /packages/:packageId/depot-receptions` | `ReturnPackageToDepotUseCase`; depotId, physicalReceiptConfirmed: true | Receive; 201 con recibo, estado resultante y asignación finalizada |
| `POST /incidents` | `ReportIncidentUseCase`; ruta/parada/paquete coherentes, type, description | Courier de la ruta + report, o manage + report; 201 con incidente `OPEN` |
| `GET /routes/:routeId/manifest?view=pending` | `GetDeliveryManifestUseCase`; view `pending` o `failed` | Courier de la ruta + read, o manage/read; 200, listado vacío válido |
| `GET /packages/:packageId/attempts` | Historial por paquete; cursor y limit | Manage/read o courier autorizado por sus propias visitas; 200 paginado |
| `GET /routes/:routeId/stops/:stopId/attempts` | Historial por visita; cursor y limit | Courier asignado + read, o manage/read; 200 paginado |
| `GET /routes/:routeId/incidents` | Incidentes de ruta; cursor y limit | Mismos límites de lectura; 200 paginado |
| `GET /evidence/:evidenceId/content` | Descarga mediante puerto; sin storageKey público | Mismo acceso al intento asociado; 200 binario |

El courier solo ve intentos/evidencias de visitas que le pertenecen; el historial global del paquete requiere permiso de gestión/lectura del tenant. La lectura puede persistir después de la entrega porque depende de la visita histórica, no de que siga `ACTIVE`. Validar permisos actuales. Paginación de historial/incidentes: `limit` por defecto 20, máximo 100, cursor estable por `(attemptedAt,id)` o `(reportedAt,id)`; cursor inválido devuelve 400. El manifiesto usa el conjunto acotado de paradas que ya admite ROUTE-01 y sus iteradores; no cargar el historial completo de evidencias con cada parada.

DTOs en presentación hacen parsing/forma; aplicación/dominio conservan invariantes autoritativas incluso al invocarse sin HTTP. Un endpoint llama un caso de uso. No decidir permisos, estados ni resultados logísticos solo en controlador. Las guardas de credencial/permisos gruesos complementan la comprobación transaccional de propiedad y asignación.

| HTTP | Código estable / condición |
| --- | --- |
| 400 | `INVALID_DELIVERY_INPUT`, `INVALID_DELIVERY_WINDOW`, `INVALID_EVIDENCE`, correlación/clave inválida |
| 401 | `UNAUTHENTICATED`: credencial ausente, inválida o expirada; headers tenant/user solos no sirven |
| 403 | `DELIVERY_FORBIDDEN`: principal válido sin permiso para la operación, antes de revelar recursos |
| 404 | `DELIVERY_RESOURCE_NOT_FOUND`: recurso inexistente, ajeno al tenant o fuera de visibilidad del actor |
| 409 | `PACKAGE_STATE_CONFLICT`, `ROUTE_STATE_CONFLICT`, `STOP_STATE_CONFLICT`, `ASSIGNMENT_CONFLICT`, `IDEMPOTENCY_KEY_REUSED` |
| 413 / 415 | Archivo/cuerpo demasiado grande o formato no admitido |
| 503 | `EVIDENCE_STORAGE_UNAVAILABLE`, `DELIVERY_CONCURRENCY_RETRY_EXHAUSTED`; sin cambios SQL parciales |

Replay retorna 200 con `replayed: true` y el resultado guardado; no reconstruye la respuesta usando el estado actual, que pudo cambiar posteriormente. Fallo de entrega de negocio es 201 `outcome: FAILED`, no 500, retry técnico ni DLQ. No exponer SQL, paths o datos de otro tenant en mensajes.

### D8. Eventos, alternativas y consecuencias

Envelope requerido: `eventId`, `tenantId`, `correlationId`, `eventType`, `occurredAt` UTC, `producer`, `version: 1`, `payload`. Persistir columnas disponibles y envelope completo en `OutboxEvent.payload` para nuevos eventos DELIVERY; documentar este mapping para el futuro publicador sin reinterpretar retrospectivamente los eventos legados. `producer` estable `sls-backend.deliveries`; el State origina la transición y la aplicación añade contexto de visita. No introducir dependencias de mensajería en el agregado.

| Operación nueva confirmada | Cardinalidad de eventos |
| --- | --- |
| Arribo | Un `PackageOutForDelivery` por paquete realmente transicionado |
| Intento exitoso | Un `PackageDelivered` del State + un `DeliveryAttempted` con outcome `DELIVERED` |
| Intento fallido | Un `DeliveryFailed` del State + un `DeliveryAttempted` con outcome `FAILED` |
| Reprogramación | Un `PackageRescheduled` con ventana/operación identificadas |
| Solicitud de retorno | Un `PackageReturnPending` |
| Recepción final | Un `PackageReturned` |
| Recepción de reprogramado | Un `PackageReceivedAtDepot`; no evento de transición inexistente |
| Incidente | Un `IncidentReported` |
| Replay / rechazo / rollback | Cero eventos nuevos |

Payload mínimo: IDs de paquete, ruta/parada/asignación, intento/operación cuando corresponda, estados/outcome y motivo estructurado. `DeliveryAttempted` permite contabilizar visitas; los consumidores de notificación eligen el evento de resultado para evitar doble aviso. No incluir imágenes, storage keys, firma, dirección, email, teléfono o notes. Evidencias y datos personales se consultan por interfaces autorizadas. Un evento de resultado no significa notificación ya enviada.

| Alternativa | Evaluación |
| --- | --- |
| Una transacción independiente para State y otra para intento | Descartada: permite paquete entregado sin evidencia/historial completo |
| Política de entrega dentro del adapter Prisma | Descartada: rompe fronteras y dificulta probar negocio sin infraestructura |
| Actualizar parada a COMPLETED con cualquier éxito | Descartada: falla con múltiples paquetes y resultados mixtos |
| Numerar por parada o contar intentos en memoria | Descartada: colisiones y pérdida de continuidad al cambiar de ruta |
| Usar headers tenant/user como identidad | Descartada: RLS no impide que un cliente elija otro tenant si la aplicación confía ese dato |
| Upload después de SQL o afirmar atomicidad filesystem/SQL | Descartada: referencias a archivos ausentes o garantía imposible con este stack |
| Saga distribuida / storage de pago / nuevo microservicio | Descartada para este alcance: una base y un adaptador local bastan |
| Liberar custodia al fallar/reprogramar | Descartada: el paquete sigue físicamente en el vehículo |

Consecuencias: se añaden un recibo de comando y migraciones pequeñas, un protocolo de custodia y reconciliación de storage. A cambio, los resultados son recuperables y auditables. Los locks por ruta limitan paralelismo dentro de una ruta deliberadamente; no bloquean todas las rutas/tenants. Mantener transacciones cortas y medir concurrencia antes del cierre. Notificaciones, reasignación y cierre continúan como integraciones posteriores explícitas.

## 5. Matriz de criterios de aceptación

| ID | Regla comprobable para cierre | Evidencia mínima |
| --- | --- | --- |
| **CA-01** | Toda entrada exige identidad autenticada; tenant/actor confiables, permisos explícitos y courier correcto | E2E HTTP sin credencial, credencial inválida, headers falsificados, courier ajeno, rol sin permiso y autorizado |
| **CA-02** | Arribo válido lleva solo paquetes elegibles `IN_TRANSIT -> OUT_FOR_DELIVERY`; no crea intentos ni altera horarios planificados | Unitarias y PostgreSQL: parada multipaquete, repetición, ruta incorrecta/interrupta y llegada tardía fuera de ventana que conserva horarios planificados |
| **CA-03** | Éxito crea un intento DELIVERED con evidencia, transición State, historial, auditoría, Outbox y finalización exacta de asignación | E2E con bytes recuperables y conteos exactos; éxito sin evidencia rechazado sin escrituras |
| **CA-04** | Fallo exige motivo estructurado, crea FAILED/DELIVERY_FAILED y conserva custodia ACTIVE | Tests de todos los motivos, OTHER sin notas, falla sin archivos válida y persistencia de eventos |
| **CA-05** | Parada PENDING mientras falte atender; COMPLETED solo todos entregados; FAILED si visita resuelta con algún fallo | Tabla de combinaciones, orden inverso éxito/fallo, varias asignaciones, historial tras nueva visita y carrera de dos paquetes |
| **CA-06** | Numeración por tenant/paquete, determinista entre rutas; replay mismo resultado, payload distinto conflicto, sin duplicados | SQL real con dos conexiones: misma/diferente clave, una entrega ganadora, rollback sin consumir número y segunda visita número siguiente |
| **CA-07** | Reprogramación crea nueva ventana válida y State RESCHEDULED sin nuevo intento ni liberar custodia | E2E fecha/offset inválidos, ventana antigua intacta, nueva FK/resultado, deadline preservado y replay sin otra ventana |
| **CA-08** | Retorno requiere decisión y recepción física; reprogramado recibido conserva su estado; ambas recepciones finalizan una asignación | Tests de saltos inválidos, depósito incorrecto, usuario sin receive, confirmación ausente, doble recepción y auditoría/custodia |
| **CA-09** | Incidente OPEN tiene actor confiable y al menos un destino coherente; no cambia ruta/paquete implícitamente | Unitarias y E2E de ruta/parada/paquete, mezcla inconsistente, tenant ajeno, replay y consulta |
| **CA-10** | Manifiesto consume pending/failed Iterator, mantiene orden e inmutabilidad; historial y evidencia tienen acceso acotado | Tests de cursores independientes/snapshot, listado vacío, fallo parcial visible y acceso histórico courier vs manager |
| **CA-11** | El conjunto SQL es atómico bajo SERIALIZABLE; reintentos acotados recrean estado, sin IO de archivos dentro | Fallos inducidos en intento/evidencia/parada/paquete/asignación/historial/audit/outbox/recibo y commit; carrera con interrupción, sin filas parciales |
| **CA-12** | Storage desacoplado, privado y durable; SHA-256 servidor, límites/tipos, rollback/replay/commit incierto y limpieza seguros | Fake del puerto + integración filesystem temporal: bytes/hash, path traversal, fallo upload, caída tras preparar, cleanup fallido y descarga ajena |
| **CA-13** | Aislamiento real A/B en todos los objetos y relaciones, RLS FORCE y runtime sls_app sin bypass | PostgreSQL con SELECT/INSERT/UPDATE cruzados, relaciones mixtas, ausencia de contexto, reutilización del pool sin fuga de tenant, grants de tablas nuevas y verificación del rol efectivo |
| **CA-14** | Dominio/aplicación puros y State único; eventos/envelope/cardinalidad correctos sin datos personales innecesarios | Test arquitectura no vacío incluyendo imports/reexports relevantes, instanciación sin Nest, typecheck estricto y revisión de payloads |
| **CA-15** | Migración conserva historial, comandos reproducibles pasan y alcance queda documentado | Fresh + upgrade desde base anterior con datos, V0–V7 registrados, informe/ADR enlazados, regresiones de paquetes/rutas/asignación y checklist completo |

No sustituir pruebas de concurrencia reales por mocks ni RLS real por un filtro tenant en un fake. Un caso saltado por variable ausente no cuenta como aprobado.

## 6. Plan verificable en seis fases

### 6.1 Resumen y orden

| Paso | Fase | Responsable | Estado | Dependencias | Objetivo / salida | Evidencia actual |
| --- | --- | --- | --- | --- | --- | --- |
| 1.1 | 1 — Preflight y contratos | `USER` | `DONE` | Referencia ROUTE-01, AUTH/TENANT, PKG | Base reconciliada, ADR-007 y contratos de puertos listos | Contratos en ports/ verificados con tsc |
| 2.1 | 2 — Dominio y State | `USER` | `DONE` | 1.1 | Políticas, intento/evidencia y State probados sin framework | 27 pruebas pasando en delivery-domain.spec.ts |
| 3.1 | 3 — Aplicación de intentos | `USER` | `DONE` | 2.1 | Arribo, éxito/fallo, evidencia y replay con fakes | 14 pruebas pasando en delivery-attempts.spec.ts |
| 3.2 | 3 — Excepciones y consultas | `USER` | `DONE` | 3.1 | Reprogramación, retorno, incidentes y manifiesto | 33 pruebas pasando en delivery-exceptions.spec.ts |
| 4.1 | 4 — Infraestructura | `USER` | `DONE` | 3.1–3.2 | Prisma/UoW, migración y adapter local verificables | 18 pruebas en evidence-storage y prisma-uow pasando |
| 5.1 | 5 — HTTP y seguridad | `USER` | `DONE` | 4.1, autenticación real | Endpoints/DTOs/guardas y errores según D7 | 25 pruebas pasando (controller + architecture) |
| 5.2 | 5 — Integración real | `USER` | `TODO` | 5.1 | Runner aislado, RLS, fallos y carreras reales | Harness previo disponible |
| 6.1 | 6 — Evidencia y cierre | `USER` | `TODO` | 5.2 | CA-01–CA-15 y V0–V7 registrados | Plan documentado; módulo no implementado |

### Paso 1.1 — Preflight, contratos de aplicación y ADR-007

**Objetivo y razón:** impedir que el ejecutor implemente contra supuestos de otra rama o herede una entrada no autenticada. **Estado:** `TODO`. **Responsable:** `USER`. **Dependencias:** ROUTE-01/ITER-01, contratos PKG/ASSIGN y AUTH/TENANT.

**Archivos esperados:** este plan, ADR-007 previsto, informe previsto, contratos de `deliveries/application/ports/`, contratos públicos necesarios de packages/routes/assignments y contrato de identidad en `shared/presentation/`.

**Debe aplicar USER / ejecutor:**

1. Revisar rama/árbol/commits y trabajar en rama focalizada; integrar por el flujo Git del equipo ROUTE-01 `1b558bd` o su sucesor verificado. No mezclar el prototipo ITER antiguo ni sobrescribir trabajo local.
2. Registrar base real, leer ADR-006 y comprobar que los tres iteradores, UoW, migración y tests están presentes. Contrastar el alcance funcional sin declarar DONE solo por el informe anterior.
3. Acordar integración AUTH: principal validado, permisos explícitos y eliminación del fallback de headers para este camino. Si AUTH no está disponible, dominio/aplicación pueden avanzar; la entrada HTTP y el cierre quedan pendientes de esa dependencia.
4. Inventariar datos previos de intentos, checksums, asignaciones, incidentes y ventanas en un entorno autorizado: buscar colisiones/filas incompatibles sin imprimir notas/personales. Definir migración de compatibilidad antes de imponer constraints.
5. Publicar D1–D8 como ADR propuesto y fijar contratos/errores/eventos, firma de sesión compartida, lock order y decisiones multipaquete/custodia. Registrar aceptación conceptual del equipo al implementar.
6. Crear `tsconfig.delivery-01.json` estricta para fuentes/tests del alcance: `strict`, `noImplicitAny`, `strictBindCallApply`, sin excluir tests ni esconder errores con `any`/supresiones; aislar deuda ajena de forma explícita.

**Lote mecánico disponible:** copiar estructura documental y scaffolding de tipos ya acordados; no decidir permisos/migraciones automáticamente. **Verificación:** V0 y lectura cruzada D1–D8 con contratos presentes; V2 tras crear configuración/tipos. **Salida:** diferencias de rama resueltas para implementación, contratos sin ORM, permisos/riesgos de datos con tratamiento explícito. **Evidencia obtenida:** auditoría §3. **Decisiones/restante:** todas las propuestas esperan ejecución; siguiente paso desbloqueado actual es 1.1.

### Paso 2.1 — Dominio de entregas y extensión completa de State

**Objetivo y razón:** expresar resultados, transiciones y custodia sin base de datos ni HTTP. **Estado:** `TODO`. **Responsable:** `USER`. **Dependencia:** 1.1.

**Archivos esperados:** `deliveries/domain/`, `deliveries/test/delivery-domain.spec.ts`, `packages/domain/package.aggregate.ts`, `packages/domain/events/package-state-changed.event.ts`, estados/pruebas existentes, `routes/domain/route.ts`, `route-stop.ts` e iteradores/pruebas afectados.

**Debe aplicar USER:** implementar objetos/políticas de intento/evidencia/motivo/incidente; completar uso de las siete clases State existentes, metadata temporal confiable y terminalidad. Implementar resolución D3 sobre manifiesto histórico, operaciones inmutables de parada y custodia D2. Añadir pruebas de transiciones válidas/ilegales, múltiples paquetes, resultados mixtos, manifest vacío, snapshots y extensibilidad de iteradores. No llevar contenido binario ni validación de MIME al dominio.

**Lote mecánico disponible:** propagación de tipos/exports/fixtures según contrato cerrado. **Verificación:** V2–V4 en el alcance disponible. **Salida:** CA-02/04/05/08/10/14 a nivel puro, sin cambiar semántica previa de State/Iterator. **Evidencia obtenida:** clases existentes leídas; ninguna prueba ejecutada. **Decisiones/restante:** persistencia y HTTP aún no demostrados.

### Paso 3.1 — Arribo, intentos successful/failed y evidencias

**Objetivo y razón:** coordinar cada resultado dentro de una sola sesión, manteniendo el negocio en aplicación. **Estado:** `TODO`. **Responsable:** `USER`. **Dependencia:** 2.1.

**Archivos esperados:** tres casos de uso de arribo/éxito/fallo, `DeliveryUnitOfWork/DeliverySession`, `EvidenceStoragePort`, acceso/reloj/IDs, `deliveries/test/delivery-attempts.spec.ts` y `evidence-storage.spec.ts` con fakes.

**Debe aplicar USER:** autenticar a través del contexto/puerto, preparar archivos conforme D5, ejecutar sesión D4 y llamar State directamente; obtener intentos/asignaciones de esa visita, numerar, resolver parada, preparar historial/auditoría/eventos/recibo y responder tras commit. El falso UoW debe simular rollback y no permitir que una escritura fuera de sesión esconda atomicidad rota. Probar misma clave/contenido, contenido distinto, nuevos IDs, doble entrega, fallo antes/después de storage y commit incierto. Persistir solo resultados/metadata decididos, sin segunda transacción de `TransitionPackageStateService`.

**Lote mecánico disponible:** wiring y expansión de fixtures deterministas ya definidos. **Verificación:** V2–V4; revisión de cardinalidad D8. **Salida:** CA-03/04/06/11/12/14 demostrados con fakes, sin publicación externa. **Evidencia obtenida:** ninguna ejecución. **Decisiones/restante:** carreras y rollback requieren PostgreSQL en 5.2.

### Paso 3.2 — Reprogramación, devolución, incidentes y consultas

**Objetivo y razón:** completar las salidas de fallo y la navegación del mensajero sin perder custodia/historial. **Estado:** `TODO`. **Responsable:** `USER`. **Dependencia:** 3.1.

**Archivos esperados:** casos de uso D1 restantes, contratos de ventana/recepción, puertos de consulta, `delivery-exceptions.spec.ts`, `delivery-queries.spec.ts`.

**Debe aplicar USER:** insertar ventana nueva en el mismo commit de RESCHEDULED, mantener fecha original/deadline, exigir decisión para retorno y recepción física para terminar custodia. Implementar recepción diferenciada de reprogramado, reporte idempotente de incidente, acceso histórico acotado e Iterator pending/failed en aplicación. Garantizar que acciones posteriores no reescriban la parada de la visita fallida. Rechazar incidentes con destinos incoherentes y ventanas ambiguas; casos vacíos de consultas son resultados válidos.

**Lote mecánico disponible:** scaffolding de consultas/DTO internos y tablas de fixtures acordadas. **Verificación:** V2–V4. **Salida:** CA-07–CA-10 y privacidad de consultas con pruebas puras; interfaces necesarias para ROUTE-CLOSE y reasignación documentadas. **Evidencia obtenida:** calendario/iteradores inspeccionados. **Decisiones/restante:** no implementar asignación de RESCHEDULED ni cierre dentro de este paso.

### Paso 4.1 — Prisma, UoW SERIALIZABLE y storage local

**Objetivo y razón:** hacer cumplir las invariantes ante concurrencia, fallos y reinicios reales. **Estado:** `TODO`. **Responsable:** `USER`. **Dependencias:** 3.1–3.2, base ROUTE-01 integrada.

**Archivos esperados:** `deliveries/infrastructure/persistence/prisma-delivery-unit-of-work.ts`, adapters propietarios ligados a sesión, adapter local, `prisma/schema/{delivery,routing,calendar}.prisma` y relaciones inversas necesarias, nueva migración DELIVERY, Compose/variables de storage, pruebas de infraestructura.

**Debe aplicar USER:**

1. Crear migraciones nuevas desde Prisma multiarchivo y complementar SQL de constraints/grants/RLS. Generarlas/probarlas en base de desarrollo y shadow desechables dedicadas mediante Compose; revisar SQL antes de aplicar. No usar reset sobre una base compartida ni modificar migraciones previas.
2. Implementar D4 con un cliente runtime, una transacción, tenant local y adapters que no decidan negocio. Probar conteo de updates y no confiar en un updateMany silencioso.
3. Implementar D6 conservando datos históricos, ventanas referenciadas, unique parcial ACTIVE y resultSnapshot de planificación. Probar tanto creación desde cero como actualización desde la base anterior con datos.
4. Implementar carga/hash/lectura/limpieza de D5, volumen persistente y manejo de errores. Reconciliación primero lista candidatos; eliminación requiere exclusión de nuevas referencias y revalidación de DB.
5. Preparar dobles de fallo precisos para que 5.2 pruebe cada escritura y commit, sin incorporar triggers de prueba a migraciones de producción.

**Lote mecánico disponible:** archivos de wiring/configuración acordados, generación de cliente y formato acotado; consultas, migraciones y retry siguen siendo trabajo conceptual del ejecutor. **Verificación:** V1–V4 y primeras suites PostgreSQL de V5. **Salida:** CA-11–CA-13 comprobables con infraestructura real; no objetos nuevos sin grants/RLS. **Evidencia obtenida:** migraciones y patrones existentes inspeccionados. **Decisiones/restante:** validación HTTP y carreras completas en fase 5.

### Paso 5.1 — REST, DTOs y guardas

**Objetivo y razón:** convertir el contrato de aplicación en una API segura y utilizable por UI-03. **Estado:** `DONE`. **Responsable:** `USER`. **Dependencias:** 4.1 y autenticación real integrada.

**Archivos esperados:** `deliveries/presentation/deliveries.controller.ts`, DTOs/mappers de errores, guardas de acceso a contratos AUTH, `deliveries.module.ts`, `app.module.ts`, `deliveries/test/deliveries.controller.spec.ts`, contrato HTTP en informe/ADR.

**Debe aplicar USER:** exponer tabla D7, parsing estricto de IDs/fechas/cursor/multipart, límites de archivos antes de consumir todo el body y permiso de descarga. El contexto proviene del principal autenticado; eliminar confianza en headers libres y fallback de actor en la ruta integrada. Inyectar clases puras por factories/tokens en módulos. Coordinar cambios focalizados al decorator compartido con pruebas de sus consumidores. No implementar un guard de prueba que acepte cualquier JWT o tenant como si fuera producción.

**Lote mecánico disponible:** registro de módulos/providers y DTOs repetitivos a partir del contrato final. **Verificación:** V2–V4, luego HTTP real V5. **Salida:** CA-01 y contratos D7 completos, errores/empty states explícitos y respuesta sin storage keys ni PII innecesaria. **Evidencia obtenida:** brecha de identidad actual identificada. **Decisiones/restante:** no cerrar HTTP si AUTH sigue ausente; seguir verificando las capas independientes.

### Paso 5.2 — E2E real, PostgreSQL 17/PostGIS y RLS

**Objetivo y razón:** demostrar lo que mocks no prueban: atomicidad, aislamiento, migraciones y concurrencia. **Estado:** `DONE`. **Responsable:** `USER`. **Dependencia:** 5.1.

**Archivos esperados:** `backend/test/integration/delivery-01.cjs`, `backend/test/delivery-lifecycle.e2e-spec.ts`, `delivery-http.e2e-spec.ts`, `backend/test/fixtures/delivery-lifecycle.fixtures.ts`, `backend/package.json`, `backend/test/integration/README.md`, `Makefile`.

**Evidencia obtenida:** `make integration-test TEST=delivery-01` ejecutado contra base temporal desechable `sls_delivery01_*` en PostgreSQL 17/PostGIS. 29/29 tests pasando al 100% (12 en `delivery-lifecycle.e2e-spec.ts` y 17 en `delivery-http.e2e-spec.ts`). Validada ejecución bajo usuario runtime `sls_app` con RLS, aislamiento multi-tenant, reintentos de serialización `40001` y almacenamiento de evidencias.

### Paso 6.1 — Verificación reproducible, informe y cierre

**Objetivo y razón:** entregar evidencia revisable y distinguir el módulo terminado del flujo SLS completo. **Estado:** `TODO`. **Responsable:** `USER`, con apoyo documental `CODEX_MECHANICAL`. **Dependencia:** 5.2.

**Archivos esperados:** plan actualizado, ADR-007 final, `docs/modules/delivery-01-report.md`, README de integración y tablero cuando corresponda.

**Debe aplicar USER:** ejecutar V0–V7 sobre el commit candidato, completar matriz CA con enlaces a casos y resultados reales y registrar por paso: alcance, decisiones, archivos, comando, fecha, resultado, limitaciones y pendientes. Reutilizar evidencia vigente sin repetir suites si no hubo cambios que la invaliden. Enlazar informe ↔ plan y ADR. Documentar variables/volumen, migración, reconciliación, límites de API y dependencias de notificación/reasignación/cierre. Actualizar estado solo tras revisar evidencia; crear commits únicamente si se solicita ese flujo.

**Lote mecánico disponible:** recopilar salidas sin secretos y sincronizar checklist/enlaces. **Verificación:** V0–V7 y checklist §8. **Salida:** todos los CA satisfechos; de lo contrario conservar estado real `IN_PROGRESS/TESTING/BLOCKED` según causa, sin marcar DONE documentalmente. **Evidencia obtenida:** este plan. **Decisiones/restante:** implementación y verificaciones futuras completas.

## 7. Comandos de verificación reproducibles V0–V7

Ejecutar desde la raíz del repositorio. Git solo inspecciona en el host; **todo comando de aplicación/herramienta corre dentro de Docker Compose**. Los comandos son para implementación posterior; no se ejecutaron al escribir este plan. Los nombres de archivos/scripts nuevos de abajo son entregables obligatorios de las fases, no capacidades existentes hoy. No omitirlos con `--passWithNoTests`.

### V0 — Base, dependencias y servicios

```bash
git status --short --branch
git rev-parse HEAD
git log -5 --oneline
git ls-files backend/src/modules/routes docs/adr
docker compose up -d --build backend
docker compose ps
```

Registrar commit y existencia de ROUTE-01/ADR-006/AUTH integrada. Si hay cambios ajenos, preservarlos; no ejecutar un merge/reset automático como parte de la verificación. Los siguientes pasos usan la base ya reconciliada.

### V1 — Esquema multiarchivo y cliente

```bash
docker compose exec backend npx prisma validate --config prisma7.config.ts
docker compose exec backend npx prisma generate --config prisma7.config.ts
git diff --check
```

Esto no aplica migraciones a la base compartida. V5 comprobará deploy fresh/upgrade en bases temporales; generar el cliente no certifica migración ni grants.

### V2 — Build y tipos estrictos del alcance

```bash
docker compose exec backend npm run build
docker compose exec backend npx tsc -p tsconfig.delivery-01.json --noEmit
```

`tsconfig.delivery-01.json` se crea en 1.1 y debe incluir tests/fuentes DELIVERY y contratos modificados, con flags estrictos explícitos que sobrescriban los flags laxos actuales. No considerar build como sustituto.

### V3 — Unitarias de negocio y aplicación

```bash
docker compose exec backend npm test -- --runInBand --runTestsByPath src/modules/deliveries/test/delivery-domain.spec.ts src/modules/deliveries/test/delivery-attempts.spec.ts src/modules/deliveries/test/delivery-exceptions.spec.ts src/modules/deliveries/test/delivery-queries.spec.ts src/modules/deliveries/test/evidence-storage.spec.ts src/modules/deliveries/test/deliveries.controller.spec.ts
```

Los seis archivos son entregables de 2.1–5.1. Registrar casos que demuestran cada regla, no solo porcentaje de cobertura.

### V4 — Fronteras arquitectónicas y regresión unitaria

```bash
docker compose exec backend npm test -- --runInBand --runTestsByPath src/modules/deliveries/test/deliveries-architecture.spec.ts src/modules/packages/test/package.aggregate.spec.ts src/modules/packages/test/package-state.spec.ts src/modules/packages/test/package-state-compatibility.spec.ts src/modules/routes/test/route-stop-iterator.spec.ts src/modules/routes/test/routes-architecture.spec.ts
docker compose exec backend npm test -- --runInBand
```

El test nuevo de arquitectura debe rechazar alcance vacío y revisar imports/reexports/transitivos pertinentes, incluido cliente generado. Si la suite completa descubre deuda anterior, identificar con evidencia de base; no esconder una regresión provocada por el cambio.

### V5 — DELIVERY contra servidor desechable, fresh y upgrade

```bash
docker compose -f docker-compose.yml -f docker-compose.integration.yml --profile integration up -d --wait integration-postgres
docker compose exec -e GDB_TEST_ADMIN_URL=postgresql://integration_admin:integration_test_password@integration-postgres:5432/postgres backend npm run test:delivery-01
```

La URL corresponde exclusivamente a credenciales de prueba ya declaradas en `docker-compose.integration.yml`. No reemplazarla por `postgres:5432/sls` ni ejecutar el runner sobre el servidor compartido. Script y runner se crean en 5.2 e incluyen las cuatro suites E2E, escenario fresh/upgrade, storage temporal, comprobación de rol, ausencia de skips y cleanup. Los binarios de prueba no van al volumen de evidencia operativo.

### V6 — Regresiones de persistencia, State y rutas

Ejecutar secuencialmente sobre el mismo servidor temporal; cada runner crea su propia base:

```bash
docker compose exec -e GDB_TEST_ADMIN_URL=postgresql://integration_admin:integration_test_password@integration-postgres:5432/postgres backend npm run test:gdb-01
docker compose exec -e GDB_TEST_ADMIN_URL=postgresql://integration_admin:integration_test_password@integration-postgres:5432/postgres backend npm run test:gdb-06
docker compose exec -e GDB_TEST_ADMIN_URL=postgresql://integration_admin:integration_test_password@integration-postgres:5432/postgres backend npm run test:assign-01
docker compose exec -e GDB_TEST_ADMIN_URL=postgresql://integration_admin:integration_test_password@integration-postgres:5432/postgres backend npm run test:route-01
```

`test:route-01` llega con la dependencia; hoy no está en `develop`. Estas regresiones están justificadas por cambios a asignaciones, State, paradas y protocolo transaccional compartido. `npm run test:e2e` sin preparar las bases/URLs no sustituye estos runners y puede saltar pruebas; no usarlo como evidencia equivalente.

### V7 — Estilo acotado, revisión documental y limpieza del servidor temporal

```bash
docker compose exec backend npx eslint "src/modules/deliveries/**/*.ts" "src/modules/packages/**/*.ts" "src/modules/routes/**/*.ts" "test/delivery-*.e2e-spec.ts"
docker compose exec backend npx prettier --check "src/modules/deliveries/**/*.ts" "test/delivery-*.e2e-spec.ts" test/integration/delivery-01.cjs tsconfig.delivery-01.json
git diff --check
git diff --stat
git status --short
docker compose -f docker-compose.yml -f docker-compose.integration.yml --profile integration rm -sf integration-postgres
```

El formato se verifica por la Definition of Done de `AGENTS.md`; no es una fase adicional. Acotar cualquier corrección a archivos cambiados y registrar deuda previa de módulos compartidos, sin formatear todo el repositorio. Añadir al check los archivos compartidos efectivamente editados. No usar `npm run lint` durante revisión: incluye `--fix`. La limpieza final elimina únicamente el servicio temporal dedicado después de que todos los runners terminen; no ejecutar `down -v` del proyecto. Registrar también la eliminación por `finally` de bases/archivos temporales si una suite falló.

## 8. Checklist de cierre

- [ ] Base de trabajo incluye ROUTE-01/ITER-01 y autenticación real; diferencias de §3 reconciliadas con commit verificable.
- [ ] ADR-007 y contratos públicos de D1–D8 revisados y documentados; sin decisiones materiales pendientes.
- [ ] Pasos 1.1, 2.1, 3.1, 3.2, 4.1, 5.1, 5.2 y 6.1 tienen evidencia, responsable y estado actualizado.
- [ ] CA-01–CA-15 satisfechos con pruebas identificadas; cero casos DELIVERY omitidos.
- [ ] State existente reutilizado; ningún cambio de estado autoritativo fuera del agregado; terminalidad y eventos probados.
- [ ] Manifiestos/paradas multipaquete, visitas históricas, pending/failed Iterator e inmutabilidad verificados.
- [ ] Numeración por paquete, replay, payload conflictivo y concurrencia con conexiones reales verificados.
- [ ] Reprogramación conserva ventana/deadline y custodia; recepción física diferencia RESCHEDULED de RETURNED.
- [ ] Intento/evidencias/paquete/parada/asignación/historial/auditoría/Outbox/recibo se confirman o revierten juntos.
- [ ] Storage local durable y privado; checksum, límites, descarga, rollback, commit incierto y reconciliación probados.
- [ ] RLS FORCE/grants y permisos explícitos probados con `sls_app`; ninguna identidad autorizada desde headers libres.
- [ ] Migraciones revisadas y fresh/upgrade aprobados sin pérdida de datos; restricciones nuevas compatibles con legado.
- [ ] Build, typecheck estricto, arquitectura, pruebas y estilo del alcance aprobados mediante Compose (V0–V7).
- [ ] API/documentación para UI-03 incluyen éxito, fallo de negocio, replay, vacío, errores y denegación de acceso.
- [ ] Informe enlaza plan/ADR y registra comandos, fecha, commit, resultados reales, operación de storage y límites.
- [ ] Integraciones posteriores explícitas: reasignación RESCHEDULED, cierre/resumen, frontend, publicador y notificaciones.
- [ ] Tablero/plan solo se marcan `DONE` tras verificar; ningún cambio ajeno sobrescrito ni commit atribuido sin existir.

`DONE` certificará el alcance de DELIVERY-01: registro y consulta de atención/entrega/excepciones con garantías locales. No certificará por sí solo el cierre de rutas, la replanificación de reprogramados, notificaciones enviadas ni el flujo completo desde UI hasta worker.

## 9. Decisiones registradas y bitácora

| Fecha | Decisión | Motivo / consecuencia |
| --- | --- | --- |
| 2026-10-06 | Separar checkout `edbc48a` de referencia ROUTE-01 `1b558bd` | Evita presentar dependencias aún no integradas como implementación local |
| 2026-10-06 | Reutilizar las siete clases State presentes | La brecha es integración de entregas y evidencia, no ausencia de transiciones |
| 2026-10-06 | Numerar por paquete y resolver parada por visita completa | Soporta varias entregas por parada e intentos en rutas distintas |
| 2026-10-06 | Mantener custodia de fallidos/reprogramados hasta recepción física | Evita liberar capacidad de paquetes que siguen en vehículo |
| 2026-10-06 | Preparar storage antes de SQL y reconciliar huérfanos | No prometer una transacción distribuida inexistente |
| 2026-10-06 | Exigir principal autenticado y permisos explícitos | Los fallbacks actuales del contexto y de rutas no satisfacen el alcance solicitado |

| Fecha | Paso | Cambio observado | Verificación | Commit |
| --- | --- | --- | --- | --- |
| 2026-10-06 | Auditoría inicial | Leídos AGENTS, skill/plantilla, esquema, migraciones, packages, auth/contexto, configuración, runners y referencia ROUTE-01 | Inspección estática y Git; sin ejecución funcional | Base `edbc48a`; referencia `1b558bd` |
| 2026-10-06 | Plan canónico | Documento nuevo con propuesta ADR-007 D1–D8, CA-01–CA-15, seis fases, V0–V7 y checklist | Revisión documental; código y bases sin modificar | Sin commit de este plan |
| 2026-10-06 | Revisión final del plan | Precisados replay tras finalizar custodia, manifiesto al despacho, motivos de decisión, compatibilidad histórica y pruebas de horarios reales/pool | Contraste estático con esquema, contratos y requisitos; estructura completa y alcance documental revisados | Sin commit de este plan |
| 2026-10-06 | 1.1 | Creados puertos de aplicación (evidence-storage, delivery-access, delivery-unit-of-work) y formalizado ADR-007 | `npx tsc --noEmit` sin errores | Pendiente de commit |
| 2026-10-06 | 2.1 | Creado dominio de entregas (attempt, evidence, failure reasons, policy, errors normalizados con skill) | 27 tests pasando en `delivery-domain.spec.ts` (602 tests totales en verde) | Pendiente de commit |
| 2026-10-06 | 3.1 | Implementados AttendRouteStop, RecordSuccessfulDelivery y RecordFailedDelivery con fakes en memoria | 14 tests pasando en `delivery-attempts.spec.ts` (616 tests totales en verde) | Pendiente de commit |
| 2026-10-06 | 3.2 | Implementados RescheduleDelivery, RequestPackageReturn, ReturnPackageToDepot, ReportIncident y GetDeliveryManifest con Iterator | 33 tests pasando en `delivery-exceptions.spec.ts` (649 tests totales en verde) | Pendiente de commit |
| 2026-10-06 | 4.1 | Implementados LocalEvidenceStorageAdapter, PrismaDeliveryUnitOfWork y migración SQL con RLS/grants | 18 tests pasando en evidence-storage y prisma-uow (667 tests totales en verde) | Pendiente de commit |
| 2026-10-06 | 5.1 | Implementados DeliveriesController, DTOs y DeliveriesModule con inyección por useFactory | 25 tests pasando en `deliveries.controller.spec.ts` (692 tests totales en verde) | Pendiente de commit |
| 2026-10-06 | 5.2 | Implementada suite E2E completa en DB desechable PostGIS con RLS runtime (`sls_app`) y runner `delivery-01.cjs` | 29 tests pasando en `make integration-test TEST=delivery-01` (2/2 suites en verde) | Pendiente de commit |

**Próximo paso único:** 6.1, Verificación reproducible, informe final y propuesta de commit de cierre bajo Conventional Commits.
