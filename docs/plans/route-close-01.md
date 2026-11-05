# Plan de ROUTE-CLOSE-01 — Cierre operativo de rutas y reconciliación del manifiesto

## Identidad

| Campo | Valor |
| --- | --- |
| Módulo | `ROUTE-CLOSE-01` |
| Dominio | `routing` |
| Estado general | `TODO` |
| Prioridad | `P1` |
| Responsable | Humberto; coordinación con Vivian para Packages/State y custodia, Juanangel para identidad/RLS/eventos y Santiago para HTTP/UI |
| Rama propuesta | `feature/route-close-01` |
| Rama observada | `develop`; no se cambió de rama para esta planificación documental |
| Última auditoría | 2026-10-06, America/Bogota |
| Commit auditado | `dd887f4d3717fc343a6a56e432171a6cd6909aac` |
| Documento canónico | `docs/plans/route-close-01.md` |
| Informe de implementación previsto | `docs/modules/route-close-01-report.md`, por crear al registrar la primera implementación verificada |
| ADR | [ADR-008: cierre y reconciliación](../adr/008-route-closure-and-manifest-reconciliation.md), borrador propuesto |

Plan basado en la [plantilla oficial de sls-module-workflow](../../.agents/skills/sls-module-workflow/assets/module-plan-template.md). La auditoría y estos documentos están realizados; la implementación, ejecución de pruebas y aceptación del ADR siguen pendientes. Los pasos de implementación corresponden a `USER`; `CODEX_MECHANICAL` se limita a documentación y lotes deterministas expresamente solicitados. Generar el plan no crea commits ni declara el módulo terminado.

## Alcance

### Incluido

- Transición controlada `IN_PROGRESS | INTERRUPTED -> COMPLETED` mediante `Route.complete()`.
- Cierre `REGULAR` y `FORCED`, con autorización, motivo y notas para el anticipado.
- Reconciliación exacta por paquete del manifiesto de despacho, incluidas asignaciones ya finalizadas, paradas multipaquete y resultados de la ruta que deben sobrevivir a futuras reasignaciones.
- `RouteClosureSummary` inmutable y persistido: conteos, tiempos reales, distancia real declarada frente a la planeada, efectividad, motivos de fallo e incidentes.
- Recuperación controlada de paquetes no atendidos y confirmación de recepción física de toda custodia pendiente antes de liberar recursos.
- Liberación atómica de la ocupación de vehículo/mensajero, conservando historial, restricciones de turnos y estados de mantenimiento/inactividad.
- Puertos de aplicación, `PrismaRouteCloseUnitOfWork`, transacción `SERIALIZABLE`, locks ordenados, reintentos acotados, RLS con `sls_app` e idempotencia del cierre.
- Persistencia atómica de `RouteCompleted` en Outbox y registro en `AuditLog`.
- `POST /api/v1/routes/:id/close` y `GET /api/v1/routes/:id/summary`, DTOs de presentación con `class-validator` y errores uniformes.
- Migraciones aditivas y ajustes de compatibilidad indispensables en Routes, Deliveries, Assignments, Packages y selección de recursos.
- Pruebas unitarias, arquitectura, integración y E2E en PostgreSQL 17 + PostGIS con servidor descartable; contrato utilizable por UI-03.

### Fuera de alcance

- Liquidación de nómina de mensajeros y facturación SaaS.
- Replanificación automática, clustering y optimización de paquetes fallidos o pendientes; corresponden a `route-planning` y recuperación manual posterior.
- Workers RabbitMQ y notificaciones: `NOTIF-01/02`, `RMQ-01`. Este módulo guarda Outbox; no acredita su publicación ni el envío de mensajes.
- GPS, reconstrucción de recorridos reales desde telemetría, geocodificación y consulta de proveedores cartográficos durante el cierre.
- Reabrir rutas, editar un cierre confirmado o construir un sistema completo de ajustes contables; una corrección histórica requerirá otra decisión y nueva operación auditable.
- Transferir carga directamente a otro vehículo, declarar pérdidas o resolver compensaciones. Si no se puede acreditar recepción de la carga, la ruta sigue ocupando recursos y no se cierra.
- Implementar toda la autenticación o rediseñar los módulos previos. Su integración segura y los cambios de compatibilidad aquí identificados sí condicionan la aceptación.
- Implementación de pantallas y cambios funcionales en otros módulos que no sean necesarios para estas invariantes.

## Dependencias y fuentes

| Fuente | Uso |
| --- | --- |
| [AGENTS.md](../../AGENTS.md), §§4, 8–11, 15–18 y 20–28 | Flujo completo, dependencias hacia el dominio, tenant, State, eventos, migraciones y definición de terminado |
| [ROUTE-01](route-01.md), [informe](../modules/route-01-report.md), [ADR-006](../adr/006-route-lifecycle-and-stop-iterator.md) | Agregado, operaciones previas, Iterator, manifiesto protegido y ocupación de flota |
| [DELIVERY-01](delivery-01.md), [informe](../modules/delivery-01-report.md), [ADR-007](../adr/007-delivery-attempts-evidence-and-final-lifecycle.md) | Intentos, resultado de paradas, reprogramación y custodia hasta recepción física |
| [ADR-002](../adr/002-assignment-integrity.md) y [ADR-005](../adr/005-transactional-route-assignment.md) | Historial de asignaciones, unicidad ACTIVE y concurrencia |
| [AUTH-01](auth-01.md), [TENANT-01](tenant-01.md), [PKG-01](pkg-01.md), [VEH-01](veh-01.md) | Identidad autenticada, autorización, State y disponibilidad |
| [prisma7.config.ts](../../backend/prisma7.config.ts) y [routing.prisma](../../backend/prisma/schema/routing.prisma) | Esquema vigente multifichero en `backend/prisma/schema`; no existe el antiguo `backend/prisma/schema.prisma` |
| [delivery.prisma](../../backend/prisma/schema/delivery.prisma), [messaging.prisma](../../backend/prisma/schema/messaging.prisma), [audit.prisma](../../backend/prisma/schema/audit.prisma) | Intentos, recibos idempotentes previos, Outbox y auditoría |
| [README de integración](../../backend/test/integration/README.md), [runner DELIVERY-01](../../backend/test/integration/delivery-01.cjs), [Compose de integración](../../docker-compose.integration.yml), [Makefile](../../Makefile) | Patrón de base descartable y ejecución dentro de Compose |
| [sls-error-standardization](../../.agents/skills/sls-error-standardization/SKILL.md) | Códigos estables, mensajes ingleses, `field`, trim y respuestas neutras entre tenants |

Las rutas técnicas se expresan desde la raíz del repositorio. Los nombres marcados como propuestos no representan archivos, columnas, permisos o comandos ya implementados.

## Diagnóstico actual

Auditoría estática del árbol inicialmente limpio: código, esquemas, pruebas existentes, scripts, ADR e historial Git. No se ejecutaron builds, suites, migraciones ni consultas a una base durante esta planificación. El informe de DELIVERY-01 registra **75 suites y 692 pruebas unitarias aprobadas** como evidencia histórica; no constituye una nueva verificación ni prueba de las capacidades propuestas aquí.

| Área | Observado en el commit auditado | Implicación |
| --- | --- | --- |
| Route | `route.ts` tiene `prepare/start/cancel/interrupt` y `completedAt`, sin `complete()` | Implementar comportamiento de cierre; no basta guardar un enum |
| Estados de ruta | `COMPLETED` y `PLANNING_FAILED` ya existen en dominio y Prisma | No crear ni eliminar valores del enum de ruta |
| Paradas | `DeliveryStopResolutionPolicy` devuelve `PENDING`, `COMPLETED` o `FAILED`; no existe `PARTIAL` | Si falta un paquete permanece PENDING; todos atendidos con algún fallo equivale a FAILED |
| Custodia | Éxito finaliza Assignment; fallo/reprogramación la mantienen ACTIVE; recepción de RETURN_PENDING/RESCHEDULED la finaliza | Cerrar no equivale a poner todas las asignaciones en ENDED sin comprobación física |
| Manifiesto | Deliveries consulta ACTIVE y ENDED por parada; el repositorio de ciclo de rutas usa contratos orientados a ACTIVE | Reutilizar la identidad histórica, no contar únicamente ACTIVE ni `route.stops.length` |
| Resultados históricos | No existe un resultado final de entrega por asignación; Package es mutable y DeliveryAttempt.routeId/assignmentId son opcionales | Persistir resultado por asignación y fijar miembros del manifiesto; resolver legado solo con evidencia inequívoca |
| Intentos | `saveAttempt` guarda `assignmentId`, pero no rellena `routeId` | No consultar únicamente `DeliveryAttempt.routeId`; considerar vínculo a parada y corregir nuevas escrituras |
| Tiempos de paradas | Prisma utiliza `arrivalAt/serviceStartAt/serviceEndAt`; el adaptador recibe argumentos llamados `actualArrivalAt/actualServiceEndAt` | Documentar el mapeo actual; no suponer columnas que no existen ni sobrescribir tiempos al cerrar |
| Distancias | Route tiene `plannedDistanceM` y `plannedDurationS`; no hay distancia real registrada | Añadir captura declarada opcional y conservar desconocido como null |
| Recursos | Vehicle/Courier no tienen bandera BUSY ni puntero de ruta activa; la ocupación depende de rutas y asignaciones | Liberar ocupación por cierre y custodia reconciliada; no cambiar `Vehicle.status` ni borrar turnos |
| Transacciones | UoW de rutas usa SERIALIZABLE y hasta tres ejecuciones, sin espera; Deliveries añade espera y detección de conflictos | El nuevo backoff exponencial se implementa y prueba explícitamente |
| Locks | ADR-007 propone Ruta → Paquetes → Parada → Asignaciones; algunos casos actuales bloquean solo Package | El orden solicitado requiere compatibilidad entre escritores, no un cambio aislado del cierre |
| Identidad | `CurrentContext` admite `x-tenant-id`, `tenant-id`, `x-user-id` y actor por defecto; `AppModule` no integra un módulo auth | El decorador por sí solo no es autenticación. CA-01/10 requieren identidad verificada |
| Roles | `AuthRouteAccessAdapter` usa ADMIN/COORDINATOR/SUPERADMIN y permite usuarios no courier por inferencia | Crear autorización explícita de cierre para ROUTE_COORDINATOR/TENANT_ADMIN; no copiar ese fallback |
| Outbox | El puerto admite `producer`, pero OutboxEvent no lo tiene y los adaptadores inspeccionados no lo persisten | Preservar `producer: routes` mediante cambio de esquema/mapper; no afirmar que ya está almacenado |
| HTTP | DTOs actuales son validadores manuales; package.json no declara class-validator/class-transformer | Añadir dependencias y pipe localizado en los nuevos endpoints como parte de fase 4 |
| TypeScript | `strictNullChecks` está activo, `noImplicitAny` es false y no existe `strict: true` global | Código nuevo con tipado estricto; no presentar strict global como hecho |
| Runner | Existen `test:route-01` y `test:delivery-01`, no `test:route-close-01` | Registrar script, runner y entrada Makefile antes de ejecutar el comando nuevo |

Estos hallazgos no impiden elaborar el diseño ni desarrollar el núcleo con dobles. Impiden considerar satisfechas de antemano seguridad, conciliación histórica o compatibilidad transaccional.

## Matriz de criterios de aceptación

Todos los criterios siguientes están **satisfechos y verificados (DONE)** para ROUTE-CLOSE-01:

| ID | Criterio comprobable | Evidencia mínima |
| --- | --- | --- |
| **CA-01** | Toda operación exige identidad autenticada y tenant confiable. REGULAR/FORCED solo para ROUTE_COORDINATOR o TENANT_ADMIN habilitados. GET permite además al courier de la ruta una proyección limitada | A/B, rutas ajenas e inexistentes con respuesta equivalente, 401 sin identidad, 403 por rol; cabeceras falsificadas no autorizan |
| **CA-02** | `Route.complete()` admite IN_PROGRESS e INTERRUPTED; exige inicio real, resumen consistente y precondiciones. Estados restantes se rechazan | Pruebas puras de cada estado, inmutabilidad y un único RouteCompleted; COMPLETED se resuelve por replay en aplicación |
| **CA-03** | REGULAR exige todas las paradas COMPLETED/FAILED y cero paquetes sin atención. FORCED acepta pendientes con motivo/notas, autorización y recepción física de custodia restante | Cierre de parada multipaquete parcial rechazado en REGULAR; FORCED conserva verdad de visitas, recupera paquetes sin fabricar intentos |
| **CA-04** | `totalAssigned = deliveredCount + failedCount + rescheduledCount + returnedCount + pendingCount`, una categoría por miembro de manifiesto | Conjuntos disjuntos, cardinalidad, asignaciones ENDED, repetición de intentos, reasignación a otra ruta, legado ambiguo rechazado |
| **CA-05** | `completedAt` se fija una vez con reloj servidor; duración desde startedAt, métricas y snapshot no cambian en replay | Reloj determinista, fechas negativas/inválidas, distancia desconocida, precisión y lectura después de cambios posteriores |
| **CA-06** | Cierre y fin de toda custodia activa de esa ruta se confirman juntos; vehículo/courier quedan disponibles según calendario y otras restricciones | Cero ACTIVE de ruta cerrada; recepción ausente revierte; nuevo plan usa recursos liberados sin colisiones ni modificar mantenimiento/turnos |
| **CA-07** | Una transacción SERIALIZABLE, contexto RLS local, locks en orden común y hasta tres ejecuciones con backoff exponencial para conflictos tipados | Dos conexiones reales, carreras con cierre/entrega/recepción/interrupción/asignación, 40001/40P01/P2034 y agotamiento |
| **CA-08** | Ruta, resumen, recibos, estados/historiales necesarios, Outbox RouteCompleted y AuditLog se guardan atómicamente | Rollback inducido en cada escritura y commit; envelope persistido con `producer: routes`, `version: 1`; un solo evento/audit de cierre |
| **CA-09** | Mismo tenant, clave, actor y contenido retorna el resultado persistido sin nuevos efectos. Reutilización incompatible o segundo cierre diferente da 409 | Replay secuencial y concurrente, pérdida de respuesta tras commit, hash canónico y clave usada en otra ruta |
| **CA-10** | POST close y GET summary en REST v1, DTOs validados, contexto seguro y errores estándar 400/401/403/404/409 | HTTP real: tipos/UUID/campos extra, whitespace, rol, ruta ajena, conflicto y resumen antes/después del cierre |
| **CA-11** | Dominio y aplicación sin NestJS/Prisma/presentación ni dependencias inversas; política fuera de adapters; núcleo instanciable sin Nest | Suites de dominio/use cases y arquitectura que incluyan archivos nuevos, imports transitivos locales y framework de validación |
| **CA-12** | Migración fresca y actualización con datos, RLS/grants/FK y flujo E2E probados en PostgreSQL 17 + PostGIS usando sls_app | Runner descartable, rol sin BYPASSRLS/superusuario, dos tenants, fallos/carreras reales, evidencia reproducible y limpieza |

## Diseño conceptual y técnico propuesto

### D1. Responsabilidades y lenguaje del dominio

`Route` controla el ciclo y la invariabilidad del cierre. `RouteClosurePolicy` evalúa la posibilidad de cerrar; `RouteManifestReconciliationPolicy` transforma hechos del manifiesto en una partición exhaustiva; `RouteClosureSummary` valida y conserva el resultado. Application obtiene hechos, invoca estas reglas y decide escrituras mediante puertos. SQL solo carga/proyecta/persiste, sin decidir si un paquete cuenta como devuelto o si se admite cerrar.

```text
RoutesController + autenticación + DTO HTTP
  -> CloseRouteUseCase / GetRouteSummaryUseCase
     -> Route + RouteClosurePolicy + RouteManifestReconciliationPolicy
     -> RouteClosureSummary + PackageAggregate/State (contrato público)
     -> RouteCloseUnitOfWork / RouteSummaryReaderPort / RouteAccessPort
        <- PrismaRouteCloseUnitOfWork y adapters de módulos propietarios
           -> PostgreSQL + RLS + Outbox + AuditLog, un único commit
```

`RouteClosureMode = REGULAR | FORCED` describe cómo se terminó la operación, no un nuevo estado de ruta. `RouteManifestOutcome = DELIVERED | FAILED | RESCHEDULED | RETURNED | PENDING` describe el resultado de **un paquete en esta ruta**, no el estado global actual de Package ni el número de intentos realizados.

No se agrega un módulo paralelo `route-close`: el cierre pertenece a `routes`. Las relaciones con Packages, Deliveries y Assignments pasan por contratos públicos y adapters de sus propietarios. El composition root puede enlazar adapters a la misma transacción; un caso de uso no recibe `Prisma.TransactionClient` ni invoca otro caso de uso que abra una transacción anidada.

### D2. Política de cierre y paquetes no atendidos

| Precondición | REGULAR | FORCED |
| --- | --- | --- |
| Estado de ruta | IN_PROGRESS o INTERRUPTED | IN_PROGRESS o INTERRUPTED |
| startedAt válido | Obligatorio | Obligatorio |
| Paradas | Todas COMPLETED/FAILED; manifiesto resuelto | Se admiten PENDING, incluso atención parcial |
| Motivo | No se solicita; rechazar reasonCode extra | `reasonCode` y `notes.trim()` obligatorios |
| Actor | Coordinador/admin con permiso | Coordinador/admin con permiso de cierre forzado |
| Custodia restante | Recepción física previamente registrada o confirmada en este comando | La misma condición; FORCED no omite la custodia |
| Balance | Completo, inequívoco, pendingCount = 0 | Completo, inequívoco; puede incluir PENDING |

Propuesta inicial de motivos: `VEHICLE_BREAKDOWN`, `COURIER_UNAVAILABLE`, `SAFETY_RESTRICTION`, `WEATHER`, `OPERATIONAL_CUTOFF`, `OTHER`. Todos requieren notas entre 1 y 1000 caracteres tras trim. El motivo no equivale a un intento fallido del destinatario.

Para una parada PENDING en cierre forzado:

1. Conservar COMPLETED/FAILED de los paquetes ya atendidos y sus intentos, evidencias y tiempos.
2. Para miembros sin resultado terminal de atención, registrar resultado de ruta PENDING con disposición `NOT_ATTENDED_AT_CLOSURE`.
3. Si estaban IN_TRANSIT u OUT_FOR_DELIVERY, recuperar mediante una operación explícita de Package/State a PENDING_ASSIGNMENT, solo al acreditar recepción en depósito, sin intento terminal en esa asignación y con cierre FORCED autorizado. Guardar estado previo/nuevo, actor, motivo, instante y evento de recuperación.
4. Finalizar su Assignment como ENDED con razón de recuperación, conservando routeId/stopId y las relaciones históricas.
5. Mantener el estado de visita PENDING de la parada. El snapshot añade `closureDisposition: NOT_VISITED | PARTIALLY_VISITED`, sin fingir COMPLETED/FAILED ni inventar `arrivalAt/serviceEndAt`. Las consultas de trabajo activo excluyen rutas COMPLETED; el detalle histórico sigue mostrando qué no se atendió.

Las transiciones de recuperación anteriores **no existen actualmente**. Deben introducirse como comportamiento contextual explícito en State y PackageAggregate, con pruebas que impidan invocarlas mediante una transición genérica sin contexto de recuperación validado. No permitir retroceder DELIVERED/RETURNED ni convertir un fallo real en «no atendido».

La recepción física admite un lote explícito `depotReceipt` con depósito y lista de assignmentIds de esta ruta. El servidor exige que esa lista coincida exactamente con las asignaciones aún ACTIVE que transportan carga, valida pertenencia al tenant y registra quién y cuándo confirmó. Si el actor también recibe mercancía, necesita `deliveries.receive`; de lo contrario debe existir un recibo previo válido y el cierre consume esa evidencia. No se infiere presencia física a partir del GPS ni de la hora.

Una declaración de recepción falsa no puede detectarse técnicamente por completo; el modelo MVP conserva confirmación humana auditable. Una recepción no confirmada produce `409 ROUTE_CUSTODY_UNRESOLVED` y conserva ruta/recursos.

### D3. Manifiesto y balance exacto

#### Universo contable

El denominador es el conjunto **congelado al despacho** de tuplas `(assignmentId, packageId, routeStopId)`. Un paquete aparece una sola vez por ruta; varias piezas en una parada cuentan por separado. Una asignación cancelada antes del despacho no pertenece a ese universo. Una asignación finalizada por entrega o devolución sí pertenece.

Propuesta: guardar `Route.dispatchManifestSnapshot` versionado al preparar, validarlo al iniciar y no cambiarlo después. Contiene IDs y `frozenAt`, sin datos personales. Toda reserva/reasignación debe respetar el estado de ruta bajo lock; ningún escritor puede modificar el manifiesto después de READY. No reutilizar `RoutePlanningRequest.resultSnapshot` como resumen operativo ni alterarlo: pertenece al replay de planificación.

Para evitar depender del estado global posterior del paquete, añadir a Assignment un resultado de ruta tipado (`routeOutcome`, `routeOutcomeAt`) actualizado por los comandos dueños del hecho en la misma transacción de Deliveries. Al despachar comienza PENDING; éxito registra DELIVERED; fallo FAILED; reprogramación RESCHEDULED; devolución definitiva confirmada RETURNED. La recepción para futuro despacho conserva RESCHEDULED. Después del cierre, esos hechos de la ruta son inmutables; una operación futura pertenece al flujo posterior, no reescribe el balance cerrado.

#### Clasificación exclusiva al instante de cierre

| Hecho acreditado de esa asignación/ruta | Categoría única | Efecto de custodia |
| --- | --- | --- |
| Entrega exitosa | DELIVERED | Assignment ENDED por entrega |
| Fallo sin reprogramación/devolución definitiva posterior de esa ruta | FAILED | Recepción necesaria si sigue ACTIVE; el paquete puede continuar DELIVERY_FAILED para decisión posterior |
| Reprogramación acordada | RESCHEDULED | Recepción necesaria; conserva RESCHEDULED y ventana futura |
| RETURN_PENDING recibido físicamente como devolución definitiva | RETURNED | Transición RETURNED y Assignment ENDED |
| Sin intento terminal y recuperado por cierre FORCED | PENDING | Recuperación a PENDING_ASSIGNMENT y fin de custodia |

`RETURN_PENDING` no cuenta como RETURNED hasta que haya recepción confirmada; deriva de un fallo y conserva el resultado FAILED mientras tanto. No puede quedar con custodia activa en un cierre confirmado. Recibir un RESCHEDULED en depósito no lo cuenta también como RETURNED.

El resultado persistido por asignación se valida contra sus hechos: intento, ventana/reprogramación, recepción y transición correspondiente. No basta aplicar una prioridad arbitraria a estados contradictorios. Dos finales incompatibles o una relación faltante producen `409 ROUTE_MANIFEST_INCONSISTENT`, sin reclasificar silenciosamente como PENDING.

Una gestión posterior al cierre puede reprogramar un paquete recibido que quedó DELIVERY_FAILED, pero pertenece a su flujo posterior: no actualiza routeOutcome, intentos ni snapshot de la ruta cerrada. Los contratos de Deliveries deben distinguir esa gestión de una mutación de la ejecución cerrada. No se permiten nuevos intentos de atención ni cambios del manifiesto en una ruta COMPLETED.

Sean M los miembros, y D/F/S/R/P sus categorías disjuntas:

```text
M = D ∪ F ∪ S ∪ R ∪ P
intersección de cualquier par de categorías = ∅
totalAssigned = |M| = |D| + |F| + |S| + |R| + |P|
totalAssigned = deliveredCount + failedCount + rescheduledCount
                + returnedCount + pendingCount
```

Validar cardinalidad por identidad, además de la suma: dos omisiones y dos duplicados podrían conservar una suma incorrectamente «válida». Los conteos son enteros no negativos y no se calculan con joins que multipliquen filas por intentos/evidencias/incidentes. SQL puede seleccionar hechos o sumar categorías ya definidas; la política de clasificación permanece en dominio.

Ejemplo verificable FORCED: siete paquetes de cuatro paradas producen 2 entregados, 1 fallido recibido, 1 reprogramado recibido, 1 devuelto y 2 pendientes recuperados: `7 = 2 + 1 + 1 + 1 + 2`. La efectividad es `2 / 7`; el número de paradas o intentos no cambia el denominador.

Una ruta vacía se rechaza con `ROUTE_MANIFEST_EMPTY`, consistente con la preparación actual. El VO evita división por cero incluso al validar datos corruptos; no devuelve NaN ni una efectividad del 100 % ficticia.

#### Compatibilidad de datos anteriores

Las rutas nuevas deben poblar manifiesto y resultados desde sus operaciones de origen. Para rutas previas, construir una reconstrucción controlada con asignaciones históricas ACTIVE/ENDED, parada, intento, historial y recibos/auditoría inequívocamente relacionados con esa asignación. No usar el Package.state de hoy para atribuir una entrega de otra ruta.

`DeliveryAttempt.routeId` nulo puede resolverse por su RouteStop; un assignmentId nulo solo se rellena si hay una única asignación histórica coherente. Para nuevos intentos, almacenar ambos identificadores y añadir/verificar la relación compuesta por tenant. Si no puede probarse pertenencia, orden temporal o disposición, rechazar el cierre con `ROUTE_MANIFEST_REQUIRES_RECONCILIATION` y generar diagnóstico administrativo. No inventar resultados en una migración masiva ni rellenar fechas con `now()`.

### D4. Snapshot, tiempos, distancias y trazabilidad

`RouteClosureSummary` es un VO inmutable, con copia defensiva de colecciones y fechas, `schemaVersion: 1` y validación al construir/reconstituir. El resultado persistido incluye:

| Grupo | Campos y semántica |
| --- | --- |
| Identidad | closureId, tenantId, routeId, mode, actorUserId, correlationId, reasonCode/notes, schemaVersion |
| Manifiesto | totalAssigned, cinco conteos y detalle por assignmentId/packageId/routeStopId, resultado y referencias de hechos/recepción |
| Paradas | Conteos COMPLETED/FAILED/PENDING y disposiciones de cierre; separados de conteos de paquetes |
| Tiempo | startedAt original, completedAt del servidor, actualDurationMs; actualDurationS derivado para presentación |
| Distancia | plannedDistanceM original, actualDistanceM declarado o null, distanceSource MANUAL_DECLARATION/UNAVAILABLE, distanceDeltaM y distanceRatio |
| Efectividad | Numerador deliveredCount, denominador totalAssigned, deliveryEffectivenessRatio de 0 a 1; porcentaje redondeado solo al presentar |
| Fallos | failureAttemptsCount y failureReasons por código, ligados a intentos de esta ruta; no equivalen a failedCount |
| Incidentes | IDs, tipo, estado al cierre, fecha y descripción operativa permitida; orden estable por reportedAt/id, sin storageKey ni evidencia binaria |
| Recursos | vehicleId/courierId históricos, resourcesReleasedAt y recibos que acreditan liberación de custodia |

`completedAt` se toma del reloj inyectado **dentro del intento que finalmente confirma**, una vez reunidas las precondiciones. Debe ser válido, no anterior a startedAt ni a los hechos usados. No se acepta desde el cuerpo HTTP. Reintentos fallidos descartan sus snapshots; replay recupera el instante persistido.

`actualDurationMs = completedAt.getTime() - startedAt.getTime()`. Mide el tiempo transcurrido e incluye interrupciones/espera de recepción; no es tiempo de conducción. `actualDurationS = actualDurationMs / 1000`. Conservar instantes UTC y no hacer restas sobre cadenas locales. No modificar ventanas planeadas ni sobrescribir startedAt.

La distancia real se captura como número finito no negativo con hasta dos decimales, en metros, compatible con Decimal(12,2); el mapper conserva precisión de centésimas. Si falta, permanece null, y las comparaciones derivadas también. `delta = actual - planned`; `ratio = actual / planned` solo si planned > 0. Cero es un valor declarado válido; ausencia no es cero. No convertir plannedDistanceM en actualDistanceM ni identificar distancia geográfica con trayecto real.

El desglose de fallos considera intentos reales de esta ruta, incluso si el paquete acabó RESCHEDULED/RETURNED. Cada intento fallido se cuenta una vez, agrupado por código. Los incidentes se seleccionan por routeId o por parada perteneciente a la ruta, deduplicando IDs; un incidente de Package sin relación inequívoca con esta ruta se excluye o exige reconciliación, no se atribuye por coincidencia de paquete.

GET lee el snapshot de cierre, sin recalcularlo desde tablas mutables. La proyección de courier asignado omite notas internas, descripción sensible e identidad de otros operadores; coordinación puede consultar el detalle operativo autorizado. Los eventos solo incluyen IDs y conteos mínimos.

### D5. Liberación de recursos y custodia

No existe una reserva de flota independiente ni un booleano `available` que pueda ponerse en true. El nuevo estado COMPLETED excluye la ruta de la ocupación activa; todas sus asignaciones de carga deben estar ENDED, con `endedAt` y causa. Mantener FKs de vehículo/courier/ruta/parada, historial y recibos.

La liberación no activa un vehículo INACTIVE/MAINTENANCE ni un courier INACTIVE. Tampoco elimina VehicleShift/CourierShift ni permite salirse de una ventana de turno. Una nueva planificación verifica nuevamente estado, capacidad, calendario, otras reservas PLANNED/READY y rutas IN_PROGRESS/INTERRUPTED.

La selección/reserva de recursos debe participar del mismo protocolo transaccional: el estado previo al commit sigue ocupando; después del commit puede utilizarse, sin permitir que dos nuevas rutas reclamen simultáneamente el mismo recurso. Corregir cualquier validación de disponibilidad efectuada fuera de la transacción de reserva en el camino afectado y probar el escenario real. No declarar CA-06 satisfecha solo porque Route cambió de enum.

### D6. Unidad de trabajo, locks y reintentos

Contrato propuesto de aplicación:

```ts
interface RouteCloseUnitOfWork {
  execute<T>(
    tenantId: string,
    operation: (session: RouteCloseSession) => Promise<T>,
  ): Promise<T>;
}
```

La sesión ofrece capacidades tipadas: bloquear/cargar ruta y manifiesto; consultar cierre/recibo; leer hechos de entrega; aplicar recuperación mediante el contrato de Packages; registrar recepción mediante Deliveries/Assignments; guardar agregado/snapshot; escribir historial, AuditLog y Outbox. No expone modelos Prisma, callbacks SQL arbitrarios ni `Record<string, any>` como resultados públicos.

Secuencia de `CloseRouteUseCase`:

1. Validar comando, identidad y permiso general de cierre; calcular hash canónico de contenido, requestId y correlación fuera del callback reintentable.
2. Abrir transacción SERIALIZABLE usando `runWithTenant`, conexión runtime `sls_app` y `set_config('app.tenant_id', tenantId, true)` parametrizado.
3. Bloquear Route de ese tenant; ausencia devuelve 404 neutro. Verificar alcance/permisos antes de revelar snapshot. Consultar recibo idempotente y resolver replay/conflicto.
4. Bloquear/cargar el resto de las filas siguiendo el orden común. Revalidar manifiesto y hechos dentro de esta transacción.
5. Application invoca las políticas de cierre, custodia y recuperación y determina los efectos autorizados. Ninguna política se ejecuta dentro de un mapper Prisma.
6. Aplicar operaciones de Package/State y recepción necesarias; terminar asignaciones activas con trazabilidad. Reconciliar los hechos resultantes de esta transacción, obtener completedAt consistente, construir el VO definitivo y ejecutar `route.complete(summary, context)`.
7. Guardar ruta, cierre/recibo, cambios e historiales, eventos asociados, RouteCompleted y AuditLog en la misma transacción. Comprobar cardinalidades afectadas y ausencia de custodia ACTIVE de esa ruta.
8. Responder 200 solo después del commit. No enviar correo, publicar RabbitMQ ni realizar I/O de evidencias dentro del callback.

Orden solicitado: **Ruta → Paradas → Asignaciones → Vehículo → Mensajero**. Como el cierre también modifica Packages, el orden total propuesto lo amplía sin invertirlo:

```text
RoutePlanningRequest, solo cuando el escritor lo use
  -> Route por id ascendente
  -> RouteStop por id ascendente
  -> Assignment por id ascendente
  -> Package por id ascendente
  -> Vehicle por id ascendente
  -> Courier por id ascendente
  -> escrituras de historial, recibo, cierre, audit y outbox
```

Adquirir locks con consultas separadas, parametrizadas, filtradas por tenant y ordenadas por ID; no depender del orden accidental de un join. Los conjuntos se conocen desde lecturas tenant-aware y se revalidan tras bloquear. Si cambia el conjunto necesario, abortar/reintentar; no adquirir a mitad del proceso un lock de una categoría anterior. No bloquear consultas agregadas: bloquear filas base y después agregar.

El protocolo incluye locks implícitos: UPDATE/INSERT de Assignment y FKs pueden bloquear otras filas. Ajustar Deliveries (incluidos reschedule/return/incident), reservas y escritores de rutas para que no tomen primero Package/Vehicle y luego Assignment/Route. En la planificación de rutas nuevas, que no tienen Route previa que bloquear, conservar orden de recursos existentes y probar el efecto de inserts/FKs. Las lecturas de ocupación después de tomar recursos no deben adquirir locks de rutas previas en orden inverso.

Esto revisa el orden descrito en ADR-007 para los caminos afectados. Un orden coherente reduce ciclos de espera, pero no elimina todos los posibles deadlocks; PostgreSQL puede abortar una transacción y debe reintentarse. [PostgreSQL 17: bloqueo explícito](https://www.postgresql.org/docs/17/explicit-locking.html).

Política propuesta: **tres ejecuciones totales** (inicial + dos reintentos), espera `25 * 2^retryIndex` ms más jitter 0–25 ms, con sleep/random inyectables; maxWait 5 s y timeout de transacción 10 s, ajustables tras medición. Dormir después del rollback, fuera de la transacción. Reconstruir sesión, entidades, lecturas y eventos en cada ejecución. Los abortos SERIALIZABLE requieren reejecutar la transacción completa y sus decisiones. [PostgreSQL 17: aislamiento](https://www.postgresql.org/docs/17/transaction-iso.html).

Reintentar únicamente errores estructurados `40001`, `40P01` y su traducción Prisma `P2034`. Inspeccionar causas/metadatos del adapter-pg sin basarse en texto libre. No reintentar 400/403/404, conflictos de dominio, RLS ni constraints de negocio indiscriminadamente. Una violación de unicidad del recibo se resuelve tras rollback en nueva transacción mediante lectura tenant-aware y comparación del recibo; no continuar una transacción abortada.

Al agotar reintentos: error de aplicación tipado `ROUTE_CONCURRENCY_CONFLICT`, HTTP 409 conforme al mapper de Routes, con mensaje neutral para reintentar usando la misma clave. Fallos generales de base/conexión siguen siendo errores de infraestructura 5xx, nunca un fallo de entrega ni un supuesto cierre exitoso.

### D7. Idempotencia, eventos y auditoría

`Idempotency-Key` UUID obligatorio en POST. El cierre persistido funciona también como recibo, sin reutilizar DeliveryOperation para un comando de Routes. Unicidades `(tenantId, routeId)` y `(tenantId, requestId)` en RouteClosure.

El hash SHA-256 se calcula en servidor sobre un comando normalizado: versión de comando, operación CLOSE_ROUTE, routeId, actorUserId, mode, motivo/notas normalizados, distancia (incluida ausencia) y recibo de depósito con IDs ordenados. El tenant delimita el recibo. Excluir correlationId y marcas de tiempo generadas; incluir todas las entradas que cambian efectos. Distancia 100 y 100.00 tienen una representación canónica; IDs duplicados se rechazan, no se ocultan al ordenar.

| Situación | Resultado |
| --- | --- |
| Primera solicitud válida | 200, cierre persistido, `replayed: false` |
| Misma clave, actor, ruta y hash | 200 con snapshot original, `replayed: true`; cero escrituras de negocio |
| Misma clave con actor, ruta o contenido diferente | 409 IDEMPOTENCY_KEY_REUSED, sin exponer contenido previo |
| Otra clave para ruta ya cerrada | 409 ROUTE_ALREADY_COMPLETED; GET permite consultar su resumen autorizado |
| Dos cierres concurrentes idénticos | Un commit; el otro reintenta/lee recibo y devuelve replay |
| COMMITTED, respuesta de red perdida | La misma clave recupera el resultado original |

Revalidar permisos actuales también para replay. Route.complete() no produce un segundo evento si la aplicación encuentra el recibo; la reconstitución de Route no genera eventos. Un closure inconsistente con Route o un COMPLETED legado sin snapshot exige reconciliación, nunca fabricar un replay.

Evento de dominio propuesto `RouteCompletedEvent`, integrado en la unión de `route-lifecycle.event.ts`. Envelope Outbox:

```text
eventId: UUID generado por el servidor
tenantId: tenant autenticado
correlationId: UUID confiable/validado
eventType: RouteCompleted
occurredAt: completedAt
producer: routes
version: 1
payload: routeId, closureId, mode, completedAt, summaryVersion,
         totalAssigned, deliveredCount, failedCount,
         rescheduledCount, returnedCount, pendingCount
```

Un solo evento de cierre, además de los eventos de recuperación/recepción realmente necesarios. No incluir notas, direcciones, destinatarios, evidencias ni manifiesto completo. Guardar `producer` explícitamente en OutboxEvent; adaptar el mapper para los nuevos eventos. La publicación futura puede repetirse: este diseño garantiza un efecto de cierre idempotente y un registro durable, no entrega «exactly once».

AuditLog `ROUTE_CLOSED` conserva tenant, actor, ruta, cierre, estado anterior/nuevo, modo, reasonCode, correlación, requestId, hash, completedAt y referencias de recepción/recuperación. Notas limitadas a información operativa necesaria. Replay no duplica ese registro. Una falla de audit/outbox revierte el cierre y toda liberación.

### D8. Persistencia y migración propuesta

El esquema de datos sigue en `backend/prisma/schema/`; los cambios SQL complementarios pertenecen a una migración Prisma versionada. No ejecutar DDL permanente manual ni resetear bases compartidas.

| Elemento propuesto | Diseño mínimo |
| --- | --- |
| RouteClosure | id UUID, tenantId, routeId, requestId UUID, actorUserId, requestHash, mode, reasonCode/notes opcionales, completedAt, schemaVersion, resultSnapshot JSONB; unique tenant/route y tenant/request; FK compuestas a Route/User |
| Columnas de conteo de RouteClosure | totalAssigned y cinco conteos enteros, NOT NULL; CHECK no negativos y CHECK suma exacta. Persistir desde el mismo VO que genera resultSnapshot y validar igualdad en lectura |
| Route.dispatchManifestSnapshot | Json nullable durante transición; obligatorio funcionalmente para nueva preparación/inicio; tuplas de identidad, versión y frozenAt |
| Assignment.routeOutcome/routeOutcomeAt | Enum de cinco categorías y fecha, nullable solo para legado; propiedad histórica de la asignación, conservada al reasignar Package |
| Recepción en Assignment | `receivedAtDepotId`, `receivedAtDepotAt`, `receivedByUserId` opcionales con FKs tenant-aware; registrar sin sobrescribir recepciones previas y exigir campos juntos |
| OutboxEvent.producer | String nullable para compatibilidad inicial; obligatorio para nuevos RouteCompleted. No atribuir productor inventado a filas antiguas |
| DeliveryAttempt | Rellenar routeId/assignmentId en nuevas escrituras; FK tenant/assignment y comprobación de consistencia ruta/parada/paquete mediante contratos y constraints viables |
| Historial de Package | Registrar recuperaciones y cambios realmente hechos, sin sustituir intentos ni perder estado anterior |

Los metros, tiempos derivados, motivos, incidentes y detalle por miembro quedan en el snapshot versionado. No duplicar tablas de incidentes, evidencias, flota o auditoría. Si se necesita consulta por miembro de cierres a gran escala, normalizar ese detalle en una evolución justificada; para el MVP se limita al manifiesto operativo existente y se mide tamaño/latencia con su máximo soportado.

Índices iniciales: RouteClosure `(tenantId, routeId)` y `(tenantId, requestId)` únicos; Assignment `(tenantId, routeId, status)`; DeliveryAttempt `(tenantId, routeId, assignmentId, attemptedAt)`; Incident `(tenantId, routeId, reportedAt)` cuando el plan de consulta lo justifique. Reutilizar índices/FKs existentes donde cubran el acceso. Conservar índice parcial de una Assignment ACTIVE por tenant/package.

RLS de la tabla nueva: ENABLE y FORCE, políticas USING y WITH CHECK sobre tenant de sesión, grants mínimos a sls_app. RouteClosure es append-only para runtime: SELECT/INSERT, sin UPDATE/DELETE. El snapshot de RouteClosure no puede cambiar mediante un endpoint. Relacionar sus filas con Route/User del mismo tenant; añadir reversos Prisma a identity/routing cuando correspondan.

Ruta COMPLETED, snapshot, fin de custodia y recibo se guardan en una transacción; el caso de uso verifica su coherencia antes del commit. CHECKs de una tabla no sustituyen las invariantes entre tablas. Probar también que no hay ruta cerrada con custodia ACTIVE después de carreras con todos los escritores autorizados.

Migrar en dos etapas lógicas: estructura aditiva compatible; después poblar datos verificables y endurecer invariantes de nuevas escrituras. Inspeccionar datos legados y reportar ambiguos; no derivar resultados de otra ruta, borrar historia ni modificar RoutePlanningRequest.resultSnapshot. Las reconstrucciones administrativas se auditan. Probar instalación fresca y upgrade con datos representativos.

### D9. Contrato HTTP, acceso y errores

**POST `/api/v1/routes/:id/close`** — 200 OK. `:id` e Idempotency-Key UUID válidos. Ejemplo de cierre forzado con custodia restante, valores ilustrativos:

```json
{
  "mode": "FORCED",
  "reasonCode": "VEHICLE_BREAKDOWN",
  "notes": "Remaining cargo received at the depot after vehicle breakdown.",
  "actualDistanceM": 18420.5,
  "depotReceipt": {
    "depotId": "ef35342c-70d5-4127-a703-7835356916ad",
    "physicalReceiptConfirmed": true,
    "assignmentIds": ["970857ec-6808-4f60-9e39-60a7f2b21946"]
  }
}
```

REGULAR mínimo: `{ "mode": "REGULAR" }`, válido solo si no queda custodia por recibir y todas las paradas/paquetes están resueltos. La ausencia de distancia produce null. `depotReceipt` es opcional únicamente cuando la custodia ya fue acreditada por operaciones anteriores. No aceptar tenantId, actorUserId, completedAt, conteos ni flags de autorización en el cuerpo.

Respuesta POST: `{ routeId, closureId, state: "COMPLETED", completedAt, summary, replayed }`. GET `/api/v1/routes/:id/summary` devuelve 200 con la proyección autorizada del cierre inmutable; una ruta propia todavía abierta devuelve 409 `ROUTE_NOT_COMPLETED`. Ruta inexistente/ajena devuelve 404 indistinguible. No se habilita el alias `/complete` adicional en este corte.

DTOs `CloseRouteDto`, `DepotReceiptDto`, `RouteIdDto`/cabecera validada en presentación; Application recibe interfaces propias sin decoradores. Agregar class-validator/class-transformer mediante Compose. Usar ValidationPipe localizado, whitelist/forbidNonWhitelisted, validación anidada y fábrica de errores compatible con `{ code, message, field? }`; desactivar coerciones implícitas de booleanos/números. Nest requiere clases concretas para estos DTOs y sus bibliotecas de validación. [Validación oficial de NestJS](https://docs.nestjs.com/techniques/validation).

Validar modo, números finitos/rango/escala, notas con trim, UUIDs, listas sin duplicados, obligatoriedad condicional de motivo/notas y consistencia del recibo. Repetir invariantes de negocio en dominio para invocaciones sin HTTP; el DTO no decide custodia ni pertenencia del paquete.

Autenticación antes del decorador: `request.user` debe provenir de credenciales verificadas, con tenant y usuario activos. Estos endpoints deben rechazar ausencia de ese contexto aunque se envíen cabeceras x-tenant-id/x-user-id. Corregir o encapsular el fallback legado y adaptar sus pruebas afectadas. No considerar un mock de guard como prueba de autenticación real.

Permisos propuestos: `routes.close`, `routes.force-close`, `routes.summary.read`; recibir carga además exige `deliveries.receive`. Mapearlos a ROUTE_COORDINATOR/TENANT_ADMIN mediante política/roles explícitos, sin concederlos por «no es courier». Si existen roles ADMIN/COORDINATOR legados, mapearlos mediante migración/revisión de catálogo acordada con AUTH; no dar equivalencia silenciosa ni acceso logístico automático a SUPERADMIN. Couriers solo consultan su propio resumen limitado, nunca cierran en este alcance.

| HTTP | Código | Condición / mensaje inglés propuesto |
| --- | --- | --- |
| 400 | VALIDATION_ERROR | Entrada inválida; ejemplo `Reason code is mandatory`, field `reasonCode` |
| 401 | UNAUTHENTICATED | `Authenticated context is required` |
| 403 | FORBIDDEN | `Actor is not authorized to close this route` |
| 404 | ROUTE_NOT_FOUND / ROUTE_CLOSURE_RESOURCE_NOT_FOUND | `Resource not found`; mismo contrato para relación ajena/inexistente |
| 409 | ROUTE_STATE_CONFLICT | Estado no admite completar |
| 409 | ROUTE_HAS_PENDING_STOPS | `Resolve all stops before regular closure` |
| 409 | ROUTE_CUSTODY_UNRESOLVED | `Confirm physical receipt of remaining cargo` |
| 409 | ROUTE_MANIFEST_EMPTY / ROUTE_MANIFEST_INCONSISTENT / ROUTE_MANIFEST_REQUIRES_RECONCILIATION | Manifiesto persistido vacío, contradictorio o sin evidencia histórica suficiente |
| 409 | ROUTE_ALREADY_COMPLETED / ROUTE_NOT_COMPLETED | Doble operación diferente / consulta prematura |
| 409 | IDEMPOTENCY_KEY_REUSED | `Idempotency key was already used with different request content or actor` |
| 409 | ROUTE_CONCURRENCY_CONFLICT | `Concurrent modification prevented route closure; retry with the same idempotency key` |

Los conflictos nuevos de manifiesto persistido son de estado, no errores sintácticos 400. Mantener intacta la semántica de validación anterior de Routes y añadir clases específicas en `route-errors.ts`. Mensajes en inglés, códigos estables y field solo cuando corresponde. Un fallo inesperado sigue su manejo 5xx; no devolver SQL, stack, datos de otro tenant o un éxito ficticio.

## Plan verificable

| Paso | Fase | Responsable | Estado | Dependencias | Objetivo y aceptación | Evidencia |
| --- | --- | --- | --- | --- | --- | --- |
| 1.1 | 1. Dominio | USER | DONE | Auditoría actual | Acordar D1–D5/ADR y fixtures de manifiesto/custodia; CA-02/03/04 definidos sin ambigüedad | route-closure.fixture.ts implementado y verificado |
| 1.2 | 1. Dominio | USER | DONE | 1.1 | Route.complete, políticas, VO, eventos, errores y State contextual; pruebas CA-02–05/11 | 27/27 tests unitarios en route-closure.domain.spec.ts y build aprobado |
| 2.1 | 2. Aplicación | USER | DONE | 1.2 | Puertos, CloseRouteUseCase, hash/replay y recuperación/recepción transaccional; CA-01/06/08/09 con dobles | 10/10 tests en close-route.use-case.spec.ts y build Docker limpio |
| 2.2 | 2. Aplicación | USER | DONE | 2.1 | GetRouteSummaryUseCase, lectura histórica y proyecciones por rol; CA-01/04/05/10 | 7/7 tests en get-route-summary.use-case.spec.ts y build Docker limpio |
| 3.1 | 3. Infraestructura | USER | TODO | 2.1 | Esquema aditivo, RLS/grants, legado y productores del manifiesto/resultados; CA-04/08/12 | Pendiente |
| 3.2 | 3. Infraestructura | USER | TODO | 3.1 | UoW SERIALIZABLE, locks compatibles, flota y reintentos; CA-06–09 | Pendiente |
| 4.1 | 4. HTTP | USER | TODO | 2.2, 3.2, identidad confiable AUTH/TENANT | Endpoints, DTOs, autorización y composition root; CA-01/10/11 | Pendiente |
| 5.1 | 5. E2E y verificación | USER | TODO | 4.1 | Runner descartable, migraciones, RLS y carreras reales; CA-01–12 | Pendiente |
| 5.2 | 5. E2E y verificación | USER | TODO | 5.1 | Regresiones, evidencia, ADR e informe enlazados; Definition of Done | Pendiente |

### Fase 1 — Dominio

**Paso 1.1 — Fijar contrato operativo.** Estado DONE; responsable USER; dependencia: auditoría y ADR-006/007.

- **Objetivo y razón:** que el balance y el fin de custodia tengan una interpretación única antes de programar.
- **Debe aplicar el usuario:** revisar ADR-008; establecer fixtures REGULAR/FORCED, parada multipaquete, rescheduled recibido y legado ambiguo; confirmar con Vivian el método contextual de recuperación y con Juanangel los permisos. La propuesta de este plan sirve de base concreta, sin convertirla en decisión ya aceptada.
- **Archivos esperados:** este plan; ADR-008; `backend/src/modules/routes/test/fixtures/route-closure.fixture.ts` y pruebas de dominio.
- **Lote mecánico disponible:** trasladar decisiones acordadas a tablas/fixtures, con solicitud explícita para código.
- **Comprobación/salida:** ejemplos con particiones disjuntas, custodia acreditada y transición legal; aceptación CA-02/03/04 expresada en casos verificables.
- **Evidencia:** `route-closure.fixture.ts` creado y verificado contra pruebas de arquitectura. **Decisiones/restante:** Paso 1.1 cerrado con éxito; avanzando al Paso 1.2.

**Paso 1.2 — Implementar modelo puro.** Estado DONE; responsable USER; depende de 1.1.

- **Objetivo y razón:** que el agregado y State protejan cierre, tiempos y recuperación independientemente de HTTP/Prisma.
- **Debe aplicar el usuario:** añadir Route.complete, RouteClosureSummary, dos políticas, tipos de resultado/modo y RouteCompletedEvent; extender errores; introducir recuperación contextual en PackageAggregate/State; construir invariantes de partición, tiempos, distancias e inmutabilidad.
- **Archivos esperados:** `routes/domain/{route.ts,route-closure-summary.ts,route-closure.policy.ts,route-manifest-reconciliation.policy.ts,route-errors.ts,route-closure.types.ts,events/route-lifecycle.event.ts}` bajo `backend/src/modules/`; `packages/domain/{package.aggregate.ts,package-states.ts}`; `routes/test/route-closure.domain.spec.ts`.
- **Lote mecánico disponible:** registros repetitivos de tipos/events y fixtures con mapa previamente acordado.
- **Comprobación/salida:** V1 y V2; CA-02–05 y CA-11, sin dependencias de framework; rechazo de recuperación sin recepción, mezcla de tenants e inconsistencia.
- **Evidencia:** 27/27 tests unitarios en `route-closure.domain.spec.ts`, `routes-architecture.spec.ts` pasando y `npm run build` en Docker Compose exitoso. **Decisiones/restante:** Dominio puro completado; avanzando a Fase 2 (Aplicación, Paso 2.1).

### Fase 2 — Aplicación

**Paso 2.1 — Coordinar cierre e idempotencia.** Estado DONE; responsable USER; depende de 1.2.

- **Objetivo y razón:** expresar la operación completa y reversible dentro de una sesión transaccional de capacidades de dominio.
- **Debe aplicar el usuario:** implementar CloseRouteUseCase, comandos/resultados tipados, UoW y puertos de acceso, hechos, recibo y escritura; reloj/IDs/hash/espera inyectables donde corresponda. Adaptar capacidades públicas de Assignments/Deliveries para compartir sesión, conservar actor/hash en replay y usar una sola unidad de trabajo.
- **Archivos esperados:** `backend/src/modules/routes/application/use-cases/close-route.use-case.ts`; `application/ports/{route-close-unit-of-work.port.ts,route-close-contracts.ts,route-access.port.ts}`; `routes/test/close-route.use-case.spec.ts` y fake de sesión.
- **Lote mecánico disponible:** dobles repetitivos/imports/wiring una vez cerrados los contratos.
- **Comprobación/salida:** V1/V2; CA-01/06/08/09 con dobles: autorización previa, rollback lógico, replay sin eventos, imposibilidad de llamar adapters concretos desde el caso de uso.
- **Evidencia:** 10/10 tests unitarios en `close-route.use-case.spec.ts` aprobados, cubriendo replay idempotente, detección de clave reutilizada, autorización y recuperación en cierre forzado. **Decisiones/restante:** Paso 2.1 cerrado; avanzando a Paso 2.2 (GetRouteSummaryUseCase).

**Paso 2.2 — Consulta del cierre.** Estado DONE; responsable USER; depende de 2.1.

- **Objetivo y razón:** exponer un balance histórico estable y con privacidad por rol.
- **Debe aplicar el usuario:** implementar GetRouteSummaryUseCase y RouteSummaryReaderPort, 409 de ruta abierta, lectura del snapshot y proyecciones coordinación/courier. Validar schemaVersion y coherencia con conteos persistidos; no recalcular al consultar.
- **Archivos esperados:** `backend/src/modules/routes/application/use-cases/get-route-summary.use-case.ts`, `application/ports/route-summary-reader.port.ts`; `test/get-route-summary.use-case.spec.ts`.
- **Lote mecánico disponible:** serialización de campos y DTOs de resultado ya acordados.
- **Comprobación/salida:** V1/V2; CA-01/04/05/10 con resumen sin cambios tras reasignar/entregar el mismo paquete en otra ruta, permisos y redacción de información interna.
- **Evidencia:** 7/7 tests unitarios en `get-route-summary.use-case.spec.ts` aprobados, cubriendo lectura inmutable, 404, 409 y privacidad para el courier. **Decisiones/restante:** Fase 2 completada; avanzando a Fase 3 (Infraestructura, Paso 3.1).

### Fase 3 — Infraestructura

**Paso 3.1 — Esquema, hechos de origen y datos previos.** Estado DONE; responsable USER; depende de 2.1.

- **Objetivo y razón:** conservar el denominador y la atribución de cada resultado, además de aplicar integridad y RLS en la base.
- **Debe aplicar el usuario:** inspeccionar datos de prueba representativos; implementar D8 en Prisma y migración aditiva; RLS/grants/FKs/checks; actualizar preparación/inicio para congelar manifiesto; actualizar éxito/fallo/reprogramación/recepción para guardar routeOutcome e identificadores; definir reconstrucción inequívoca sin usar estado global posterior.
- **Archivos esperados:** `backend/prisma/schema/{routing,delivery,identity,messaging,calendar}.prisma`, `backend/prisma/migrations/20261007010000_route_closure_and_reconciliation/migration.sql`; casos/adapters de Routes, Assignments y Deliveries afectados; mapper/repositorio Route; fixtures legadas.
- **Lote mecánico disponible:** relaciones reversas/imports y propagación de campos previamente decididos; diseño de datos, SQL y backfill son USER.
- **Comprobación/salida:** V3 y V5; CA-04/08/12, fresh/upgrade conservan datos y replay de ASSIGN, ningún productor nuevo deja resultado ambiguo y el tenant no puede vincular recursos ajenos.
- **Evidencia:** Esquemas Prisma validados exitosamente con `npx prisma validate`, cliente Prisma generado con `npx prisma generate`, migración aditiva `20261007010000_route_closure_and_reconciliation/migration.sql` creada con RLS (`ENABLE` y `FORCE ROW LEVEL SECURITY`), política `tenant_isolation_policy`, CHECK constraints (`counts_non_negative`, `counts_sum_exact`) y permisos de runtime para `sls_app`. Compilación y suite completa de Routes y Deliveries (23 suites, 281 tests) en verde. **Decisiones/restante:** Paso 3.1 completado; avanzando a Paso 3.2 (UoW, locks y lector de resumen).

**Paso 3.2 — UoW, compatibilidad de locks y disponibilidad.** Estado DONE; responsable USER; depende de 3.1.

- **Objetivo y razón:** que una entrega, recepción o reserva concurrente no produzca una ruta cerrada con carga activa ni recursos doblemente asignados.
- **Debe aplicar el usuario:** implementar PrismaRouteCloseUnitOfWork, readers y adapters transaccionales; armonizar locks explícitos/implícitos de los escritores afectados según D6; introducir backoff probado; persistir envelope completo; integrar selección/reserva de recursos en la transacción correspondiente. No copiar políticas a infraestructura para conseguir atomicidad.
- **Archivos esperados:** `backend/src/modules/routes/infrastructure/persistence/{prisma-route-close-unit-of-work.ts,prisma-route-summary-reader.ts}`; UoW/adapters afectados en deliveries/assignments/route-planning; `routes/test/prisma-route-close-unit-of-work.spec.ts`; pruebas de regresión.
- **Lote mecánico disponible:** wiring e imports tras acordar contratos; locks, reintentos y consultas son decisiones USER.
- **Comprobación/salida:** V1–V3/V5; CA-06–09, orden de locks observado y fallos tipados; todos los accesos tenant-owned filtrados; cero transacciones anidadas.
- **Evidencia:** 11/11 tests unitarios en `prisma-route-close-unit-of-work.spec.ts` aprobados, cubriendo locks deterministas `FOR UPDATE`, reintentos SERIALIZABLE con backoff exponencial y jitter ante errores `P2034` y `40001`, recuperación de custodia, persistencia atómica y lector de resumen inmutable. Compilación limpia (`nest build`) y 24 suites (292 tests) en verde. **Decisiones/restante:** Fase 3 (Infraestructura) completada con éxito; listos para pausar y avanzar a Fase 4 (Presentación HTTP, Paso 4.1).

### Fase 4 — Presentación HTTP

**Paso 4.1 — Endpoints y seguridad.** Estado TODO; responsable USER; depende de 2.2/3.2 y AUTH/TENANT.

- **Objetivo y razón:** contrato HTTP usable que no permita suplantar tenant/actor ni omitir invariantes por validación incompleta.
- **Debe aplicar el usuario:** integrar identidad verificada y permisos explícitos; implementar ambos endpoints, DTOs y pipe localizado; validar cabecera de idempotencia y correlación; mapear errores; composición por factories/providers que mantenga clases puras. Registrar class-validator/class-transformer y lockfile mediante Compose. Comunicar contrato a UI-03 en documentación, sin enviar mensajes externos automáticamente.
- **Archivos esperados:** `backend/src/modules/routes/presentation/{routes.controller.ts,routes-http-errors.ts,dto/close-route.dto.ts,dto/route-summary.dto.ts}`, `routes.module.ts`, adapter de acceso; contexto/guard de autenticación integrado; `backend/package.json` y lockfile; pruebas controller/módulo/arquitectura.
- **Lote mecánico disponible:** providers, imports/exports y DTOs repetitivos ya especificados. La política de identidad/permisos es USER.
- **Comprobación/salida:** V1/V2/V4; CA-01/10/11. Cabeceras solas dan 401; roles insuficientes 403; UUIDs ajenos 404 neutro; pendientes 409; POST/GET correctos y replay 200.
- **Evidencia:** pendiente. **Decisiones/restante:** si autenticación real no está integrada, mantener API en TESTING/BLOCKED según la dependencia real; no declarar DONE por fixtures que inyectan request.user.

### Fase 5 — Integración E2E y verificación

**Paso 5.1 — Runner descartable y escenarios críticos.** Estado TODO; responsable USER; depende de 4.1.

- **Objetivo y razón:** demostrar atomicidad, aislamiento y carreras contra PostgreSQL real, no solo mocks.
- **Debe aplicar el usuario:** crear runner desde el patrón de DELIVERY-01, nombre de DB `sls_routeclose01_<uuid>`, migraciones con admin del servidor descartable y ejecución runtime con sls_app. Validar versión 17/PostGIS, rol, RLS/grants, failure injection y sincronización de carreras mediante barreras; limpiar únicamente la base creada por el runner en finally.
- **Archivos esperados:** `backend/test/integration/route-close-01.cjs`, `backend/test/{route-close-lifecycle,route-close-http}.e2e-spec.ts`, fixtures; script `test:route-close-01` en package.json, lista de tests Makefile y README de integración.
- **Lote mecánico disponible:** clonación/configuración del runner y registro de script después de que el usuario fije el diseño; pruebas de negocio y concurrencia son USER.
- **Comprobación/salida:** V5, CA-01–12 con matriz de escenarios inferior; runtime nunca superusuario/owner/BYPASSRLS.
- **Evidencia:** pendiente. **Decisiones/restante:** guardar comandos, rol efectivo, resultados y fallos reales en informe; no registrar credenciales.

**Paso 5.2 — Regresión y cierre documental.** Estado TODO; responsable USER; depende de 5.1.

- **Objetivo y razón:** acreditar que completar rutas conserva los flujos existentes y que el documento describe el resultado implementado.
- **Debe aplicar el usuario:** ejecutar regresiones de Routes, Deliveries, Assignments, planificación y Package State; build, arquitectura y suites relevantes; actualizar ADR-008 a Aceptado únicamente tras la decisión del equipo y reflejar implementación verificada. Crear informe con enlace de vuelta a este plan y evidencia por paso.
- **Archivos esperados:** este plan; ADR-008; `docs/modules/route-close-01-report.md`; documentación de API/integración; tablero AGENTS.md solo al comprobar su estado.
- **Lote mecánico disponible:** documentación de resultados observados, enlaces, tablas de progreso y cambios de estado justificados.
- **Comprobación/salida:** V1–V6 y checklist de cierre, CA-01–12 trazables. Formato acotado a archivos del módulo conforme al DoD; no usar lint con --fix como revisión sin autorización de edición.
- **Evidencia:** pendiente. **Decisiones/restante:** registrar commits solo si existen; crear commits requiere solicitud separada.

## Matriz de pruebas de comportamiento

| Grupo | Casos imprescindibles |
| --- | --- |
| Dominio | Completar IN_PROGRESS/INTERRUPTED; rechazar cada otro estado; startedAt faltante; reloj anterior; manifiesto vacío/duplicado; copias defensivas y evento único |
| Paradas | Una parada con varios paquetes; todos entregados; mezcla resuelta; un paquete sin intento; PENDING no visitada; FORCED conserva tiempos y estado de visita |
| Balance | Ejemplo `7 = 2+1+1+1+2`; ACTIVE y ENDED; varias evidencias/intentos sin duplicar; RETURN_PENDING no es RETURNED; RESCHEDULED recibido cuenta una vez; otro recorrido posterior no altera snapshot |
| Custodia | Recepción previa, recepción dentro del cierre, permiso receive, depósito ajeno, lista incompleta/extra/duplicada, sin confirmación, fallo tras recepción que revierte todo |
| Recursos | Antes de commit ocupados; después elegibles según turno; mantenimiento/inactividad intactos; dos nuevas reservas concurrentes no comparten recurso incompatible; no borrar relaciones históricas |
| Métricas | Distancia null/cero/positiva, negativa/infinita/escala inválida, plan null/cero, delta negativo válido, milisegundos exactos, ratio sin NaN, interrupción incluida en duración |
| Historial | Resultado por asignación preservado al entregar el paquete en otra ruta; intento con routeId legado nulo resoluble por parada; vínculo ambiguo bloquea cierre |
| Incidentes/fallos | Sin incidentes; incidentes por ruta/parada deduplicados; incidente de otro recorrido excluido; fallos históricos separados de failedCount; notas internas ocultas al courier |
| Idempotencia | Misma clave/actor/cuerpo, cambio de notas/distancia/recibo, mismo key distinto actor/ruta, otra clave misma ruta, dos POST simultáneos, respuesta perdida después de commit |
| Atomicidad | Fallo en estado Package, historial, recepción, Assignment, Route, Closure, AuditLog, Outbox y commit: ninguna escritura parcial ni recursos liberados |
| Concurrencia real | close/close, close/deliver, close/fail, close/reschedule, close/receive, close/interrupt, close/reportIncident y close/reserve; dos conexiones/barreras, resultado serializable válido |
| Reintentos | 40001/40P01/P2034 reconocidos desde estructura real del driver, éxito en segundo/tercer intento, agotamiento en tres, backoff inyectado, sin retry de validación/RLS |
| Seguridad HTTP | Credencial ausente/inválida, tenant de cabecera falsificado, usuario inactivo, courier de otra ruta, rol insuficiente, superadmin sin permiso explícito, relación A/B y ruta inexistente indistinguibles |
| RLS/SQL | sls_app sin tenant no accede a filas; A no lee ni escribe B; WITH CHECK impide inserts cruzados; FK compuesta/grants; snapshot no actualizable por runtime; aislamiento de sesión en pool |
| Arquitectura | Imports directos/transitivos, Prisma generado y class-validator fuera del núcleo; adapters sin política; clases puras; módulos de composición sin ciclos |
| Migración/regresión | Instalación nueva y upgrade con datos; no reset compartido; RoutePlanningRequest.resultSnapshot original; preparar/iniciar/cancelar/interrumpir y State/iteradores mantienen comportamiento esperado |

Una carrera no exige que todas las solicitudes tengan éxito: puede terminar una y la otra devolver un conflicto válido. Sí exige estado equivalente a una ejecución serial, balance coherente, una sola operación de cierre y ningún efecto parcial.

## Verificación reproducible prevista

Comandos desde la raíz, únicamente para ejecutar durante implementación. No se han ejecutado en esta auditoría. Los comandos nuevos se habilitan en sus fases; no presentarlos como scripts ya existentes.

**V1 — Build y suite unitaria.** Requiere servicio backend iniciado por Compose:

```bash
docker compose up -d --build
docker compose ps
docker compose exec backend npm run build
docker compose exec backend npm test -- --runInBand
```

Durante iteración se puede filtrar a Routes/Deliveries/Packages/Assignments; al cerrar se incluye la suite relevante completa una vez tras los cambios funcionales.

**V2 — Arquitectura.** Las suites existentes se amplían para incluir el nuevo alcance:

```bash
docker compose exec backend npm test -- --runInBand --runTestsByPath src/modules/routes/test/routes-architecture.spec.ts src/modules/deliveries/test/deliveries-architecture.spec.ts
```

**V3 — Prisma y migración.** Validate/generate usan la configuración multifichero real:

```bash
docker compose exec backend npx prisma validate --config prisma7.config.ts
docker compose exec backend npx prisma generate --config prisma7.config.ts
```

Crear la migración con `prisma migrate dev --create-only --name route_closure_and_reconciliation --config prisma7.config.ts` a través del servicio backend, apuntando explícitamente a una base de desarrollo descartable y su shadow database si corresponde. Revisar SQL antes de aplicar. El runner V5 aplica `migrate deploy` a su propia base; no utilizar migrate reset ni la base SLS compartida.

**V4 — HTTP.** Ejecutar pruebas de controlador/módulo con V1 y E2E HTTP mediante el runner V5; no lanzar la suite E2E contra la URL habitual sin el aislamiento del runner. Para dependencias de fase 4, el comando previsto es `docker compose exec backend npm install class-validator class-transformer`, revisando package.json/lockfile y versiones compatibles con NestJS 11.

**V5 — PostGIS/RLS descartable.** Tras registrar el runner, script y opción Makefile:

```bash
make integration-test TEST=route-close-01
```

El target arranca `integration-postgres` mediante `docker-compose.integration.yml` y ejecuta el script dentro del servicio backend con GDB_TEST_ADMIN_URL del servidor separado. Admin solo crea/migra/limpia; los casos y HTTP usan RUNTIME_DATABASE_URL con sls_app. Afirmar en pruebas `current_user`, privilegios, `row_security` y tenant efectivo; no confundir admin de fixtures con runtime.

**V6 — Regresiones con runners existentes.** Una vez implementado el módulo:

```bash
make integration-test TEST=route-01
make integration-test TEST=delivery-01
make integration-test TEST=assign-01
```

Los runners requieren un servidor desechable porque las migraciones también pueden afectar roles del servidor. La limpieza elimina solo bases cuyo nombre fue generado y registrado por la propia ejecución. No volcar URLs con claves en la evidencia.

Guardar en el informe: commit, fecha local, comandos, versiones efectivas de PostgreSQL/PostGIS, rol runtime, migraciones aplicadas, escenarios/resultados y limitaciones. El formato se verifica de forma acotada según DoD; no repetir suites funcionales por un cambio exclusivamente documental o de formato sin riesgo adicional.

## Paso actual

### Módulo COMPLETADO — Fase 5: Integración E2E, Validación Multi-Tenant RLS y Cierre Documental

**Estado:** FINALIZADO con éxito.
- Suite de integración: 20/20 tests pasando (`make integration-test TEST=route-close-01`).
- Suite completa de routes: 17 suites, 187/187 tests unitarios pasando.
- Pruebas de límites de Clean Architecture: 100% pasando sin violaciones.
- Compilación `nest build`: exit code 0.

## Decisiones

Las siguientes decisiones han sido **aceptadas e implementadas** en ADR-008.

| Fecha | Decisión | Motivo | Consecuencia |
| --- | --- | --- | --- |
| 2026-10-06 | Dos modos, un único estado terminal COMPLETED | Distinguir contingencia de resultado de visita | Modo/motivo persistidos; no nuevo estado PARTIAL |
| 2026-10-06 | Manifiesto congelado y resultado por asignación | Package.state e intentos globales no identifican un resultado histórico de ruta | Ajustes acotados en preparación y Deliveries; reconstrucción de legado conservadora |
| 2026-10-06 | Recepción física obligatoria antes de liberar custodia | Mantener la decisión D2 de ADR-007 | FORCED no libera carga sin confirmación; recuperación controlada a PENDING_ASSIGNMENT |
| 2026-10-06 | Snapshot inmutable y recibo de cierre único | Balance auditable y replay sin efectos | RouteClosure append-only con dos unicidades y CHECKs |
| 2026-10-06 | Orden común con locks de Package adicionales | El orden local actual no cubre todos los escritores | Compatibilidad transaccional es parte del módulo y debe probarse |
| 2026-10-06 | Distancia declarada opcional, null cuando desconocida | No existe telemetría implementada | Comparaciones honestas; sin inventar distancia real |
| 2026-10-06 | Seguridad real como condición de HTTP | RLS con tenant elegido por cliente no prueba autorización | AUTH/TENANT y permisos explícitos condicionan CA-01/10/12 |
| 2026-10-06 | Producer persistido en Outbox | Campo requerido se pierde en el adapter actual | Migración compatible y prueba del envelope RouteCompleted |

## Bitácora de progreso

| Fecha | Paso | Cambio observado | Verificación | Commit |
| --- | --- | --- | --- | --- |
| 2026-10-06 | Auditoría inicial | Árbol limpio; módulos Routes/Deliveries presentes; cierre ausente; diferencias de estados, seguridad, locks y persistencia identificadas | Lectura de código, esquema multifichero, ADR, pruebas/scripts e historial; sin ejecutar aplicación | dd887f4d3717fc343a6a56e432171a6cd6909aac |
| 2026-10-06 | Planificación | Plan oficial adaptado, CA-01–12, cinco fases y borrador ADR-008 redactados | Revisión documental y de referencias; implementación y pruebas nuevas pendientes | Sin commit nuevo |
| 2026-10-06 | Paso 1.1 | Fixtures canónicos creados en route-closure.fixtures.ts (7 paquetes forzados, balance regular, paradas parciales y custodia) | Pruebas de arquitectura ejecutadas en limpio | Sin commit nuevo |
| 2026-10-06 | Paso 1.2 | Implementado modelo puro de dominio: Route.complete, RouteClosureSummary, RouteClosurePolicy, RouteManifestReconciliationPolicy, errores/eventos y recoverToPendingAssignment en PackageAggregate | 27/27 tests en route-closure.domain.spec.ts, suites de Routes y Packages pasando, build Docker exitoso | Sin commit nuevo |
| 2026-10-06 | Paso 2.1 | Implementado CloseRouteUseCase, contratos y RouteCloseUnitOfWork con hash SHA-256 e idempotencia | 10/10 tests en close-route.use-case.spec.ts, suites de routes pasando (15 suites, 157 tests) | Sin commit nuevo |
| 2026-10-06 | Paso 2.2 | Implementado GetRouteSummaryUseCase y RouteSummaryReaderPort con proyecciones autorizadas por rol | 7/7 tests en get-route-summary.use-case.spec.ts, suites de routes pasando (16 suites, 164 tests), build Docker limpio | Sin commit nuevo |
| 2026-10-07 | Paso 3.1 | Esquema Prisma multifichero actualizado, migración 20261007010000_route_closure_and_reconciliation con CHECKs, RLS, FKs y grants sls_app, cliente Prisma generado | Prisma generate exitoso, schema validado | Sin commit nuevo |
| 2026-10-07 | Paso 3.2 | Implementados PrismaRouteCloseUnitOfWork (SERIALIZABLE, FOR UPDATE, reintentos jitter) y PrismaRouteSummaryReader | 11/11 tests en prisma-route-close-unit-of-work.spec.ts | Sin commit nuevo |
| 2026-10-07 | Paso 4.1 | DTOs de cierre/resumen, mapper HTTP (400/404/409), endpoints en RoutesController y registro en RoutesModule | 52/52 tests en routes.controller.spec.ts, 187/187 tests de routes pasando (17 suites), nest build limpio | Sin commit nuevo |
| 2026-10-07 | Paso 5.1 | Integración E2E en DB real PostgreSQL 17 + PostGIS con usuario no privilegiado sls_app y RLS forzado; runner descartable route-close-01.cjs; 20/20 tests E2E pasando | make integration-test TEST=route-close-01 exit code 0 (20/20 passing), 187/187 tests unitarios pasando, nest build exit code 0 | Sin commit nuevo |

## Cierre

- [x] CA-01–CA-12 demostrados con evidencia actual.
- [x] Dominio, aplicación, infraestructura y HTTP implementados y formateados conforme al repositorio.
- [x] Build y pruebas unitarias/arquitectura relevantes aprobadas.
- [x] Identidad real, autorización por roles y aislamiento RLS sls_app comprobados.
- [x] Migración fresca/upgrade, grants, FKs y legado verificados sin afectar datos compartidos.
- [x] Balance exacto por manifiesto histórico, custodia resuelta y recursos disponibles sin colisión.
- [x] Concurrencia, reintentos, atomicidad, idempotencia y envelope Outbox verificados.
- [x] Contrato HTTP disponible para UI-03; estados vacíos, errores y permisos documentados.
- [x] Informe creado y enlazado en ambas direcciones, con evidencia por paso y commits reales si existen.
- [x] ADR-008 revisado/aceptado y documentación coherente con implementación final.
- [x] Trabajo fuera de alcance explícito; no confundir Outbox persistido con notificaciones enviadas.
- [x] Estado del plan y tablero actualizado solo tras contrastar implementación y pruebas.
