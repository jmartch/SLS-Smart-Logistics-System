# ADR-008: Cierre operativo de rutas y reconciliación del manifiesto

Fecha: 2026-10-07, America/Bogota

Estado: **Aceptado — implementado y verificado en ROUTE-CLOSE-01**

Responsable: Humberto, con Vivian para custodia/State y Juanangel para identidad, integridad y eventos

Plan canónico: [ROUTE-CLOSE-01](../plans/route-close-01.md)

Base auditada: `dd887f4d3717fc343a6a56e432171a6cd6909aac`

## Contexto

SLS necesita terminar una ruta iniciada o interrumpida, reconciliar sus paquetes y liberar recursos. [ADR-006](006-route-lifecycle-and-stop-iterator.md) define preparación, inicio, cancelación e interrupción; [ADR-007](007-delivery-attempts-evidence-and-final-lifecycle.md) define intentos, reprogramaciones y recepción física. Ninguno implementa el cierre operativo completo.

El código auditado tiene RouteState.COMPLETED y Route.completedAt, pero Route carece de complete(). Las paradas admiten únicamente PENDING/COMPLETED/FAILED. Una parada multipaquete permanece PENDING mientras falte un resultado; con todos atendidos y al menos un fallo, queda FAILED. PARTIAL no es un estado persistido actual.

Las entregas exitosas terminan su Assignment; un fallo o reprogramación conserva custodia ACTIVE hasta recepción. Por eso contar únicamente asignaciones activas omite entregas, y finalizarlas indiscriminadamente liberaría carga sin evidencia física. Además, un paquete puede participar después en otra ruta: su estado global no es una fuente estable para el balance del recorrido anterior.

La arquitectura exige reglas en dominio/aplicación, adapters sin decisiones de negocio y transacciones tenant-aware. El repositorio usa Prisma 7 con esquema multifichero, PostgreSQL 17/PostGIS y rol sls_app. La auditoría también identifica dependencias pendientes: contexto HTTP con fallback a cabeceras, permisos amplios, distintos órdenes de bloqueo y un campo producer que los puertos reciben pero OutboxEvent no almacena.

Este documento propone decisiones para implementación. No certifica autenticación, integridad de datos desplegados ni resultados nuevos de pruebas. La evidencia histórica de DELIVERY-01 no reemplaza CA-01–CA-12 de ROUTE-CLOSE-01.

## Decisión propuesta

### 1. El cierre pertenece al agregado Route

Route.complete() admite IN_PROGRESS e INTERRUPTED y produce COMPLETED, completedAt y un RouteCompletedEvent. Exige startedAt válido, manifiesto no vacío, reconciliación consistente y política de cierre satisfecha. El cierre no se implementa como actualización directa del enum en Prisma.

La aplicación distingue idempotencia de transición: si existe un recibo compatible retorna su snapshot sin llamar complete() de nuevo; una segunda transición ordinaria de COMPLETED se rechaza.

Se incorporan RouteClosurePolicy, RouteManifestReconciliationPolicy y el VO inmutable RouteClosureSummary dentro de routes/domain. CloseRouteUseCase coordina esos elementos y los contratos públicos de Packages, Assignments y Deliveries. GetRouteSummaryUseCase consulta la instantánea histórica. Ninguna de estas clases depende de NestJS, Prisma o DTOs HTTP.

### 2. Dos modos de cierre y conservación de la verdad operativa

REGULAR exige todas las paradas COMPLETED/FAILED, todos los miembros atendidos y custodia restante recibida. FORCED permite paradas pendientes y exige reasonCode, notas y permiso explícito de coordinación/administración. Ambos requieren resolver físicamente la custodia antes de liberar recursos.

FORCED no registra un intento fallido ficticio. Los paquetes no atendidos se recuperan mediante una operación contextual de Package/State desde IN_TRANSIT/OUT_FOR_DELIVERY hacia PENDING_ASSIGNMENT, solo con recepción confirmada y ausencia de resultado terminal en esa asignación. Esta operación nueva registra historial y evento y no habilita retrocesos genéricos sin esas condiciones.

Las paradas no resueltas conservan PENDING como hecho histórico de visita. El cierre añade disposición NOT_VISITED/PARTIALLY_VISITED al snapshot; no inventa llegada/servicio ni crea el estado PARTIAL. Las consultas operativas excluyen rutas COMPLETED de la lista de trabajo pendiente.

La recepción se acredita con registros previos o mediante un lote explícito incluido en el cierre, con depósito, asignaciones, confirmación, actor y fecha. Para recibir se exige además deliveries.receive. La lista debe cubrir exactamente la custodia ACTIVE de esa ruta. Sin recepción suficiente se devuelve conflicto y la ruta continúa ocupando sus recursos. La confirmación humana es la evidencia MVP; no se afirma validación automática de ubicación física.

### 3. El manifiesto de despacho determina el denominador

Se persiste Route.dispatchManifestSnapshot versionado al preparar y se verifica al iniciar. Contiene las tuplas assignmentId/packageId/routeStopId, sin datos personales. No cambia después de preparar; una asignación cancelada antes de despacho queda fuera y una finalizada después de despacho permanece dentro.

Se añade resultado operativo por Assignment, actualizado atómicamente por el módulo dueño del hecho: PENDING al despachar, DELIVERED al entregar, FAILED al fallar, RESCHEDULED al reprogramar y RETURNED al confirmar devolución definitiva. Una recepción de RESCHEDULED conserva esa categoría. Tras cerrar, estos hechos históricos no se reescriben por operaciones futuras del mismo Package.

La gestión posterior de un paquete recibido que conserva DELIVERY_FAILED puede reprogramarlo, sin cambiar el resultado de la ruta cerrada. Los contratos deben separar esa operación posterior de los intentos y modificaciones de manifiesto, que se rechazan para una ruta COMPLETED.

El conjunto del manifiesto se divide en cinco categorías exclusivas:

```text
totalAssigned = deliveredCount + failedCount + rescheduledCount
                + returnedCount + pendingCount
```

La política comprueba tanto la suma como identidad, cobertura y ausencia de duplicados. Los conteos se refieren a paquetes de la ruta, no a paradas, intentos o evidencias. RETURN_PENDING aún no significa devolución completada; conserva el resultado fallido previo y exige recepción para liberar custodia. Un paquete fallido recibido puede conservar DELIVERY_FAILED para gestión posterior sin contarse como RETURNED.

Se preserva por separado el número y desglose de intentos fallidos: un paquete reprogramado puede contribuir a failureAttemptsCount y solo a rescheduledCount en el balance final. Datos contradictorios o no atribuibles a una ruta producen conflicto, nunca una categoría residual arbitraria.

### 4. Snapshot inmutable y métricas explícitas

RouteClosure almacena el resumen, detalle por miembro, incidentes al cierre, razones, referencias de recepción y metadatos de trazabilidad con schemaVersion. Los conteos se guardan además en columnas con CHECK de no negatividad y suma exacta. Se generan junto al JSON desde el mismo VO y se validan al leer.

completedAt procede del reloj del servidor en el intento que confirma. La duración es completedAt menos startedAt; incluye interrupción y espera de recepción, y no se presenta como tiempo efectivo de conducción. Un replay no modifica ninguno de esos instantes.

La distancia planeada se copia del plan vigente; la real es una declaración opcional en metros con procedencia explícita. Ausencia significa null. La diferencia solo se calcula si ambas existen, y el cociente si la planeada es positiva. No se deduce distancia real desde Haversine, horarios o la distancia planeada.

La efectividad es deliveredCount/totalAssigned; una ruta vacía se rechaza. Los incidentes se vinculan por ruta/parada y se deduplican. El snapshot conserva datos operativos necesarios; el endpoint aplica una proyección limitada para el courier asignado. No se incluyen datos personales o notas completas en RouteCompleted.

GET summary lee el cierre persistido, sin recalcular desde Package, Incident u otras tablas que pueden cambiar. No se permite editar/reabrir cierres en este alcance. Una futura corrección tendrá que preservar el registro original mediante un flujo distinto y auditable.

### 5. Liberación por fin de ocupación y custodia

La ruta COMPLETED deja de ocupar recursos; sus asignaciones de carga ya están ENDED con historial y causa. Las relaciones con Vehicle/Courier permanecen. No se introduce una bandera BUSY/AVAILABLE ni se cambian estados de mantenimiento, actividad o turnos.

Una nueva planificación reevalúa capacidad, calendario, otras reservas y rutas activas bajo el protocolo transaccional común. Completar una ruta no concede disponibilidad absoluta: un vehículo en mantenimiento o un mensajero fuera de turno siguen sin ser elegibles.

### 6. Una unidad de trabajo y protocolo compartido de bloqueo

PrismaRouteCloseUnitOfWork implementa un puerto de aplicación; abre una sola transacción SERIALIZABLE y configura tenant localmente bajo sls_app. Toda mutación, historial, recepción, cierre, AuditLog y Outbox comparte esa transacción. Application decide las políticas; infraestructura traduce consultas y fallos.

El orden solicitado Ruta → Paradas → Asignaciones → Vehículo → Mensajero se amplía para incluir Package:

```text
RoutePlanningRequest, si aplica
  -> Route -> RouteStop -> Assignment -> Package -> Vehicle -> Courier
```

Dentro de cada conjunto, IDs ascendentes. No se ejecutan adquisiciones de locks en paralelo ni se confía en el orden de joins. Se incluyen locks implícitos de UPDATE/FK y se revalidan conjuntos después de bloquear. Si aparece una dependencia que exige tomar un lock anterior, se aborta y vuelve a resolver la operación.

Esta propuesta cambia el orden de ADR-007 para los caminos afectados y requiere compatibilidad en entregas, recepción, incidentes, reserva, preparación/inicio e interrupción. Ajustar solo el nuevo adapter sería insuficiente. Las rutas nuevas de planificación respetan el orden de recursos existentes y sus inserts/FKs se prueban contra cierre concurrente.

Se permiten tres ejecuciones totales ante 40001/40P01/P2034 tipados, con backoff exponencial 25/50 ms más jitter 0–25 ms, fuera de la transacción. Reloj/espera/aleatoriedad deben ser comprobables. Cada reintento reconstruye lecturas, entidades y eventos. No se reintentan errores de validación, autorización o reglas de negocio. El orden consistente reduce deadlocks pero no garantiza su ausencia; PostgreSQL puede abortar y exigir recuperación. [Bloqueos en PostgreSQL 17](https://www.postgresql.org/docs/17/explicit-locking.html).

Al agotarse los intentos se devuelve ROUTE_CONCURRENCY_CONFLICT/409, siguiendo el contrato de rutas. Otros errores de infraestructura conservan su clasificación 5xx. No se abre una transacción anidada por cada módulo ni se hace I/O externo dentro del cierre.

### 7. Recibo único, evento Outbox y auditoría atómicos

RouteClosure es append-only y tiene unicidades por tenant/routeId y tenant/requestId. Idempotency-Key UUID identifica el comando. SHA-256 calculado en servidor sobre actor y contenido canónico impide reutilizar una clave con otros efectos; correlationId no forma parte del hash.

- Misma clave, actor, ruta y contenido: 200 con snapshot original y replayed true.
- Misma clave con contenido/actor/ruta diferentes: 409 IDEMPOTENCY_KEY_REUSED.
- Otra clave para ruta ya cerrada: 409 ROUTE_ALREADY_COMPLETED.
- Dos solicitudes idénticas concurrentes: un efecto, un cierre; la segunda recupera el recibo tras resolver el conflicto.

Revalidar acceso en replay. Una violación de unicidad se resuelve después de rollback en una transacción nueva; no continuar la transacción fallida ni exponer un recibo ajeno.

RouteCompleted conserva eventId, tenantId, correlationId, eventType, occurredAt, producer **routes**, version **1** y payload mínimo de identidad/conteos. Se añade producer al esquema OutboxEvent de manera compatible y se verifica su persistencia. La entrega futura del evento puede repetirse; no se promete exactly-once.

AuditLog registra ROUTE_CLOSED con actor, modo, motivo, estado previo/nuevo, cierre, requestId, hash y recepción. Replay no crea otra auditoría de éxito. Si falla Outbox o auditoría, el cierre completo revierte.

### 8. Seguridad, HTTP y evolución de datos

POST `/api/v1/routes/:id/close` y GET `/api/v1/routes/:id/summary` usan identidad verificada y tenant del contexto confiable. El fallback actual de cabeceras no habilita estos endpoints. Se integra autenticación y se establecen permisos explícitos para ROUTE_COORDINATOR/TENANT_ADMIN; SUPERADMIN no obtiene acceso logístico por defecto. Un courier puede leer únicamente la proyección autorizada de su ruta.

DTOs con class-validator/class-transformer se mantienen en presentación y se validan mediante un pipe localizado. No aceptan tenantId, actorUserId, conteos ni completedAt del cliente. El cuerpo y mensajes de dominio respetan códigos estables, inglés y field opcional. Se distinguen 400/401/403/404/409 y fallos inesperados 5xx; recursos ajenos e inexistentes resultan indistinguibles.

Las migraciones son aditivas en el esquema Prisma multifichero. RouteClosure lleva RLS ENABLE/FORCE, USING/WITH CHECK, FKs compuestas e INSERT/SELECT runtime sin UPDATE/DELETE. Se conservan índice parcial ACTIVE, relaciones históricas y snapshot del planificador.

Para legado, reconstruir manifiesto y resultados solo cuando asignación, parada, intento, historial y recibo permiten atribución inequívoca. Un routeId nulo de intento puede derivarse de su parada; un assignmentId ambiguo no se adivina. Un cierre sin datos suficientes se rechaza para reconciliación administrativa, sin inventar estados o fechas. Las rutas nuevas producen los hechos correctos desde la preparación/entrega.

## Alternativas consideradas

| Alternativa | Evaluación |
| --- | --- |
| Contar Package.state actual al consultar | Rechazada: una nueva ruta alteraría el balance anterior y los intentos podrían atribuirse mal |
| Contar Assignment ACTIVE | Rechazada: excluye entregas/devoluciones finalizadas y confunde custodia con pertenencia al manifiesto |
| Marcar todos los pendientes como FAILED al forzar | Rechazada: inventa atención e infla fallos del destinatario |
| Liberar flota al pasar COMPLETED aunque haya carga ACTIVE | Rechazada: viola custodia física y puede duplicar capacidad disponible |
| Mantener ruta abierta hasta resolver automáticamente todas las entregas | Rechazada: impide cierre operativo de contingencias; cierre y recuperación futura son flujos distintos |
| Recalcular el resumen desde tablas mutables cada vez | Rechazada: no preserva la fotografía histórica ni el replay |
| JSON sin identidad de miembros ni restricciones de conteos | Insuficiente: dificulta demostrar cobertura/exclusividad y detectar corrupción |
| Nuevo enum PARTIAL/SKIPPED para toda parada | No seleccionado: requiere cambio transversal innecesario para este alcance; se conserva visita y se añade disposición de cierre al snapshot |
| Publicar RabbitMQ antes o fuera del commit sin Outbox | Rechazada: permite cierre sin evento durable o evento de cierre revertido |
| Locks solo en el nuevo cierre | Rechazada: escritores previos pueden invertir orden o modificar hechos fuera del protocolo |
| Plataforma completa de event sourcing o microservicio de cierre | Rechazada para el MVP: el historial, resultado por asignación y snapshot transaccional satisfacen el requisito con menor complejidad |

## Consecuencias

### Favorables

- El balance es reproducible y permanece estable tras nuevas rutas del mismo paquete.
- El cierre regular y anticipado tienen semántica explícita y preservan custodia y verdad de visita.
- Reintentos HTTP y conflictos SQL no duplican cierres, liberaciones ni eventos.
- El límite transaccional coincide con la operación de negocio, manteniendo Clean Architecture.
- La disponibilidad de flota sigue respetando turnos y mantenimiento.

### Costes y límites

- El cambio requiere ajustes acotados en operaciones anteriores para congelar manifiesto, guardar resultados/recepciones y compartir orden de locks. No es únicamente añadir un endpoint.
- Las rutas legadas ambiguas necesitan reconciliación administrativa; la migración no puede recuperar hechos nunca registrados.
- El resumen JSON duplica algunos datos derivados; VO, constraints y pruebas mantienen coherencia. Se debe medir tamaño con manifiestos representativos.
- Un cierre forzado aún puede rechazarse si la custodia física no está resuelta. Transferencias en calle, pérdidas y liberación excepcional con carga quedan fuera de este ADR.
- Distancia real declarada y recepción humana son datos auditables, no telemetría verificada.
- Mantener PENDING en paradas históricas exige que las consultas de trabajo filtren el estado de ruta.
- RLS no corrige un tenant suplantado en HTTP. La autenticación real es dependencia de aceptación.
- Outbox durable no significa notificación enviada; esos consumidores pertenecen a otros módulos.

## Validación y adopción

La aceptación se rige por [CA-01–CA-12 y las cinco fases del plan](../plans/route-close-01.md). Se requieren pruebas de dominio, arquitectura, use cases, HTTP, migración fresca/upgrade, RLS con sls_app, replay, rollback en cada escritura y carreras con conexiones PostgreSQL reales. El runner se ejecuta mediante Compose contra un servidor PostgreSQL 17/PostGIS descartable.

Este ADR ha sido **Aceptado** tras la verificación completa de los 12 criterios de aceptación CA-01–CA-12 y la ejecución en verde del runner de integración multi-tenant en PostgreSQL 17 + PostGIS con el rol `sls_app`. Toda la evidencia se encuentra documentada en el plan canónico [ROUTE-CLOSE-01](../plans/route-close-01.md) y en el informe de entrega [docs/modules/route-close-01-report.md](../modules/route-close-01-report.md).
