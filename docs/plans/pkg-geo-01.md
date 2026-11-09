# Plan de PKG-GEO-01 — Registro, geocodificación y elegibilidad geoespacial

## Identidad

| Campo | Valor |
| --- | --- |
| ID | `PKG-GEO-01`, confirmado por el usuario; no incorporado al tablero |
| Estado general | `REVIEW`: backend, frontend y verificación implementados; cierre Git autorizado |
| Modalidad | Autónoma por solicitud del usuario; implementación mediante Gemini en Orca, cierre con Gemini 3.8 Flash medium; usuario autorizó completar fases y publicar commits/PR |
| Workspace | `/home/lzirox/orca/workspaces/sls/package-geocoding-integration` |
| Rama observada | `feature/pkg-geo-01` |
| Commit auditado | `e7743a58aa95d8a8e08158efab70661a057877af` |
| Auditoría | 2026-11-09 |
| Informe | [Diagnóstico y evidencia](../modules/pkg-geo-01-report.md) |

El usuario autoriza continuar desde este plan en modo autónomo mediante feature-pipeline y Orca orchestration. La fase 1 se acepta para avanzar al núcleo; los parámetros no fijados permanecen explícitos y configurables. Se requiere revisión humana al cerrar el núcleo y antes de implementar infraestructura. No ejecutar `git commit`, `git push` ni `git merge`.

## Alcance y dependencias

Cerrar el recorrido ordinario `POST /api/v1/packages` → dirección → catálogo local → intento/candidatos/selección → vínculo al paquete → conexión vial → elegibilidad de planificación. Incluir consulta del resultado y recuperación mínima autorizada, además de preservar las referencias consumidas por caminos viales.

Reutilizar PKG-01, GEOCODE-01, GDB-02/03/05, GEO-01, Chain y ASSIGN-01. Mantener clasificación explícita mediante State y catálogo ZONE-01; resolver coordenadas no clasifica ni asigna por sí solo. AUTH-01/TENANT-01 aportan identidad y permisos. VEH-01 y ADR 010 aportan recursos para demostrar planificación, sin reintroducir turnos obligatorios.

Fuentes revisadas:

- `AGENTS.md` completo; `frontend/AGENTS.md`; skills `sls-module-workflow` y `sls-error-standardization`.
- [PKG-01](pkg-01.md), [GEOCODE-01](geocode-01.md), [MVP](mvp-implementation.md), [reparto de registro](mvp-puntos-1-2.md), [UI-01/04](ui-01-04.md) y [DEMO-01](demo-01.md).
- [Plan geoespacial](../geospatial/migration-plan.md), [GDB-02](../geospatial/gdb-02-report.md), [GDB-03](../geospatial/gdb-03-report.md), [GDB-05](../geospatial/gdb-05-report.md), [ADR geoespacial](../adr/001-geospatial-integration.md) y [ADR 010](../adr/010-automatic-fleet-availability.md).
- [Guía de integración](../../backend/test/integration/README.md) y [C4 de registro](../architecture/c4-registration.md).

PKG-01 ya contempla integrar geocodificación y correcciones; este plan concreta esa brecha transversal sobre el código actual. No vuelve a encargar registro, catálogos, State, ranking, clustering ni asignación completos. GEOCODE-01 está cerrado para su alcance local, que excluye HTTP de revisión y conexión vial. DEMO-01 prepara paquetes mediante un script adicional y no acredita el registro ordinario.

Quedan fuera UI-DELIVERY-01, entregas/cierre/notificaciones, contactos generales de PKG-01, rediseño de algoritmos, importador OSM nuevo, proveedor externo, navegación vial completa y reparación masiva de datos existentes. No integrar cambios de otros workspaces. No modificar semillas ni ejecutar seeds, resets, purgas de colas o borrados operativos.

## Diagnóstico contrastado

Toda la evidencia funcional de esta auditoría es estática. No se ejecutaron build, tests, HTTP de negocio ni consultas a PostgreSQL. No se conoce el estado de migraciones aplicadas en ninguna base activa.

| Etapa | Implementación observada | Brecha |
| --- | --- | --- |
| UI de registro | `frontend/src/app/paquetes/nuevo/NewPackagePage.tsx` llama a `api/packagesApi.ts`; envía texto/municipio y catálogos reales | Solo interpreta éxito del registro; no expone resultado geoespacial ni recuperación |
| Registro HTTP | `PackagesController` obtiene contexto autenticado y exige `REGISTER_PACKAGES`; `RegisterPackageService` valida referencias/unidades | No invoca GEOCODE-01; `PackagesModule` tampoco lo conecta |
| Persistencia de registro | `PrismaPackageRegistrationAdapter` crea Address, Package REGISTERED, historial y PackageRegistered/outbox en una transacción | No escribe `Package.geocodingAttemptId`, intentos ni conexiones |
| Geocodificación local | `GeocodeAddressService` normaliza, consulta dataset READY y guarda decisión; `PrismaGeocodingAttempt` persiste candidatos y selección atómicamente | No enlaza el intento a Package ni crea NetworkAttachment; transacciones propias dificultan composición atómica |
| Resultados negativos | Ranking devuelve REVIEW_REQUIRED sin selección o NOT_FOUND sin candidatos | Sin dataset devuelve DATASET_NOT_READY sin intento; formato no soportado lanza InvalidAddressError antes de persistir. No confundir estos resultados con NOT_FOUND |
| Revisión/corrección | Existen GeocodingReview y campos de revisión en NetworkAttachment | No se encontró caso de uso ni endpoint operativo de revisión, reintento o corrección de dirección |
| Conexión vial | Modelo, checks y lectores existentes; semilla OSM usa un nodo verificado | Falta resolución reutilizable para direcciones registradas por HTTP; el límite de 100 m de la demo no es política operativa aprobada |
| Planificación inicial | Chain exige MATCHED, selección, dirección/dataset READY, coordenadas válidas y conexión aceptada del perfil; rechazos producen pendientes con motivo | El registro ordinario carece de esas entradas. `hasReadyCoordinates` del workspace no comprueba conexión ni compatibilidad con el dataset/perfil elegidos |
| Replanificación | `PrismaEditableRouteReplanSession.loadEditableRouteSnapshot` carga y también escribe | Si falta intento, inventa lat/lon con un hash de la guía, fuerza MATCHED y conecta al primer RoadNode con distancia cero. Es una violación del objetivo, no recuperación válida |
| Referencias posteriores | `PrismaRouteRoadWaypointRepository` busca candidato a través de `RouteStop.geocodingAttempt` | Ambos planificadores crean paradas con `geocodingAttemptId: null`; el lector devuelve STOP_ATTACHMENT_NOT_READY |
| Eventos | PackageRegistered queda en outbox; worker incorpora consumidor de auditoría | No existe consumidor que complete geocodificación o planificación tras ese evento |

La fuente Prisma vigente es `backend/prisma/schema/`, configurada en `backend/prisma7.config.ts`; no existe `backend/prisma/schema.prisma`. Las migraciones `20260915020000_geocoding_catalog`, `20260915030000_package_address_dimensions` y `20260921100000_road_network_graph` ya crean las relaciones necesarias. Package puede existir sin intento; su FK exige tenant y dirección correctos cuando se enlaza. NetworkAttachment exige exactamente nodo o arista y una combinación única tenant/candidato/dataset/perfil. Los modelos no obligan por sí solos a que MATCHED tenga selección ni garantizan alcance vial desde un depósito.

El historial confirma las piezas separadas: `4878298`/`bbae803` para GEOCODE-01, `70f050a`/`5fa553c` para registro, `f9d8ada` para workspace/replanificación y `6069e04` para preparación OSM. PKG-01 y partes de la hoja MVP describen una base anterior; sus TODO y conteos históricos no son el estado funcional de este commit.

## Fase 1 — Propuesta de contrato y viabilidad

### Orquestación recomendada, pendiente de aprobación

Una transacción local propiedad de aplicación coordina registro y resolución contra datos locales. El caso de uso reutiliza `RegisterPackageService`, `GeocodeAddressService` y los algoritmos existentes a través de puertos ligados a la misma sesión. Infraestructura abre la transacción, establece tenant, bloquea, mapea y persiste; no decide el flujo ni ejecuta políticas por su cuenta.

El registro conserva su contrato actual de éxito y añade un resultado geoespacial explícito. Ambigüedad, ausencia de coincidencia, catálogo no disponible y falta de conexión son resultados esperados: se conserva el paquete REGISTERED con evidencia y sin elegibilidad. Un fallo técnico revierte registro, historial, outbox, intento, candidatos, vínculo, conexión y auditoría de esa operación; no responder éxito parcial ni ocultar excepciones. Se evita una ventana de registro confirmado seguida de geocodificación perdida.

Para reutilizar GEOCODE-01 se necesita composición transaccional real: extraer adaptadores de sesión o permitir un ejecutor transaccional interno a infraestructura, manteniendo los puertos libres de Prisma. No llamar al servicio actual con sus transacciones independientes desde una transacción externa. Conservar los adaptadores públicos actuales como envoltorios para sus consumidores y regresiones. No rediseñar el scoring.

Alternativa no recomendada para este primer corte: consumidor dedicado de PackageRegistered con resultado eventualmente consistente. Requiere otra topología/handler, deduplicación transaccional, recuperación y estados de procesamiento; el worker actual solo audita. Si se elige esa alternativa, revisar este inventario y la atomicidad antes de fase 2. No introducirla tácitamente.

### Resultados y recuperación propuestos

Los siguientes códigos de proyección son propuestas, no enums ni endpoints existentes. Separar `geocodingStatus`, resultado de conexión y aptitud para un dataset/perfil de `Package.state`.

| Situación | Persistencia y resultado esperado | Recuperación mínima |
| --- | --- | --- |
| Coincidencia inequívoca | Intento MATCHED, todos sus candidatos y selección; vínculo del intento al paquete | Conectar candidato al grafo del mismo dataset/perfil |
| Ambigüedad/bajo margen | Intento REVIEW_REQUIRED, candidatos completos, selección nula; paquete vinculado al intento | Actor autorizado aprueba/rechaza candidato propio con GeocodingReview y motivo; no modificar score ni presentarlo como selección automática |
| Sin candidatos | Intento NOT_FOUND sin selección ni conexión | Nueva versión de Address y nuevo intento, o reintento explícito tras publicar catálogo adecuado |
| Formato no soportado | Resultado `UNSUPPORTED_ADDRESS_FORMAT` auditable; sin fabricar un intento con un estado incompatible | Corregir dirección y reintentar |
| Dataset no disponible | Resultado `DATASET_NOT_READY` auditable; sin candidato ni intento falso | Configurar/publicar un dataset compatible y reintentar deliberadamente |
| Sin conexión válida | Conservar MATCHED si corresponde, sin aceptación vial; resultado `NETWORK_ATTACHMENT_NOT_READY` y motivo diagnóstico | Reintentar con grafo/perfil/dataset adecuado; revisar una propuesta real si existe, nunca aprobar una conexión inexistente |
| Datos aptos | MATCHED/selección, geometría válida, dataset READY compatible y conexión AUTO_ACCEPTED o APPROVED | Clasificación y reglas operativas siguen siendo necesarias para planificar |

Conservar los umbrales `geocode-v1` actuales: score mínimo 0.95 y margen mínimo 0.10. El catálogo es compartido; Address, intentos, candidatos y revisiones son privados. El servicio actual recibe dataset explícito: para registro se propone configuración confiable de catálogo por municipio, sin elegir automáticamente el último dataset global. La selección de planificación debe comprobar la misma versión; un cambio de catálogo requiere reintento explícito, sin actualizar rutas históricas.

Para conexión se propone un primer corte por nodo transitable del dataset/perfil elegido, ubicación de snap real y distancia Haversine calculada con GEO-01. Elegir por distancia y desempate estable; nunca `LIMIT 1` arbitrario. El radio máximo y la regla de revisión requieren aprobación como política nueva; no heredar silenciosamente los 100 m del script demo. Un nodo con aristas incidentes no garantiza camino dirigido de ida y vuelta al depósito: la aptitud geoespacial no debe prometer factibilidad vial completa. GDB-05 conserva PATH_NOT_FOUND; añadir un caso de nodo desconectado para demostrar este límite. No rehacer Dijkstra, restricciones de giro ni stop ordering.

La ausencia de conexión no tiene una fila representable en NetworkAttachment, porque exige geometría y destino. Se propone conservar el diagnóstico de la operación en AuditLog y devolverlo en la consulta, con metadatos mínimos de paquete, dirección, intento, dataset/perfil, política, resultado, actor y correlación; no copiar dirección/contactos a eventos. El detalle debe interpretar ese resultado solo si corresponde a las referencias actuales. Validar esta representación antes de concluir que el esquema basta; si requiere un modelo dedicado, revisar el plan y una migración nueva antes de SQL.

### Corrección, selección y concurrencia

Se necesita recuperación mínima porque la API actual no ofrece otra salida para NOT_FOUND o formato no soportado. Propuesta: permitir corrección versionada solo en REGISTERED, CLASSIFIED o PENDING_ASSIGNMENT, sin asignación activa ni manifiesto vigente. Crear otra Address y cambiar dirección/intento del paquete atómicamente, conservando los anteriores y AuditLog con referencias antiguas/nuevas y motivo. No editar el texto de la Address original ni reutilizar selección/conexión de la dirección anterior.

Revisión y reintento deben cargar el paquete propio con bloqueo y verificar las referencias esperadas. Un resultado tardío para otra dirección/intento produce conflicto tipado. Un intento ya usado por una parada histórica no cambia de selección: crear una nueva resolución para el paquete cuando la política lo permita. Las paradas fijan el intento usado; los datasets referenciados se conservan. La mera FK a un intento mutable no preserva la selección histórica.

Repetir una operación ya resuelta no duplica conexiones ni revisiones. Diferenciar replay sin cambio de reintento deliberado, que conserva el intento anterior y registra otro; concretar identidad de operación y precondiciones en el contrato. No añadir un sistema global de idempotencia sin necesidad demostrada.

Permisos propuestos: REGISTER_PACKAGES para registro; CLASSIFY_PACKAGES o MANAGE_TENANT para corrección, reintento y revisión, sujetos a la matriz final del usuario. COORDINATE_ROUTES conserva consulta/planificación; no autoriza por sí mismo aprobar coordenadas. Respuestas 401/403 para acceso, 404 neutro para inexistente/ajeno, 400 con campo para formato de comando inválido y 409 para conflicto de estado/referencias. Los resultados negativos de geocodificación válidos no son errores técnicos ni DLQ. Nuevos errores tipados llevan código estable y mensaje en inglés; presentación adapta los campos al contrato `fields` que ya consume el frontend.

## Archivos exactos previstos por capa

Inventario de la propuesta sincrónica. `M` = modificar; `N` = nuevo. Las rutas son del repositorio actual, no las rutas obsoletas `frontend/src/features/`. No se autoriza aún ninguna edición de código.

### Dominio

| Acción | Archivo | Responsabilidad |
| --- | --- | --- |
| N | `backend/src/modules/geocoding/domain/network-attachment.policy.ts` | Selección vial y límites explícitos, usando Coordinates/Haversine existente |
| N | `backend/src/modules/geocoding/domain/network-attachment.types.ts` | Candidatos de conexión y decisión pura por perfil/dataset |
| N | `backend/src/modules/packages/domain/package-geocoding.policy.ts` | Precondiciones de corrección/revisión/reintento y vigencia de referencias |
| N | `backend/src/modules/packages/domain/package-geocoding.types.ts` | Diagnóstico independiente del estado logístico |
| M | `backend/src/modules/packages/domain/package-errors.ts` | Errores tipados de conflicto/validación de este flujo |

Normalizador, ranking y State se reutilizan; no se propone modificar sus reglas. CoordinateValidationHandler y NetworkAttachmentValidationHandler siguen siendo autoridad de prevalidación.

### Aplicación

| Acción | Archivo | Responsabilidad |
| --- | --- | --- |
| N | `backend/src/modules/packages/application/register-and-geocode-package.use-case.ts` | Orquestar registro, resolución, vínculo, conexión y diagnóstico en una sesión |
| N | `backend/src/modules/packages/application/resolve-package-geocoding.use-case.ts` | Flujo reutilizable por registro/reintento/corrección |
| N | `backend/src/modules/packages/application/review-package-geocoding.use-case.ts` | Revisar candidato con actor/motivo y referencias vigentes |
| N | `backend/src/modules/packages/application/correct-package-address.use-case.ts` | Versionar dirección y resolver sin perder evidencia |
| N | `backend/src/modules/packages/application/ports/package-geocoding.uow.port.ts` | Sesión con capacidades internas de registro, geocodificación, vínculo, auditoría y revisión |
| N | `backend/src/modules/geocoding/application/ports/network-attachment.port.ts` | Leer candidatos viales y persistir decisión, sin SQL ni Prisma públicos |
| M | `backend/src/modules/geocoding/application/geocode-address.service.ts` | Permitir composición con puertos de sesión sin cambiar decisión geocode-v1 |
| M | `backend/src/modules/packages/application/ports/package-query.port.ts` | Detalle con diagnóstico, candidatos y acciones disponibles |
| M | `backend/src/modules/route-planning/application/ports/planning-assignment-unit-of-work.ts` | Incluir attemptId y procedencia real de conexión en snapshots |
| M | `backend/src/modules/route-planning/application/ports/planning-workspace-query.port.ts` | Contexto dataset/perfil y aptitud con motivo |
| M | `backend/src/modules/route-planning/application/get-planning-workspace.service.ts` | Validar/pasar ese contexto |
| M | `backend/src/modules/route-planning/application/plan-and-assign-routes.service.ts` | Fijar intento en nuevas paradas; usar procedencia real al validar |
| M | `backend/src/modules/route-planning/application/replan-editable-route.service.ts` | Mismas garantías para altas en ruta PLANNED |

### Infraestructura y composición

| Acción | Archivo | Responsabilidad |
| --- | --- | --- |
| N | `backend/src/modules/packages/infrastructure/prisma-package-geocoding.uow.ts` | Transacción/locks/tenant y capacidades de sesión; sin políticas |
| N | `backend/src/modules/geocoding/infrastructure/prisma-network-attachment.adapter.ts` | Consulta vial parametrizada, mapeo y persistencia de geometrías reales |
| M | `backend/src/modules/packages/infrastructure/prisma-package-registration.adapter.ts` | Exponer persistencia de sesión y conservar envoltorio atómico existente |
| M | `backend/src/modules/geocoding/infrastructure/prisma-geocoding-address.ts` | Lectura compatible con sesión |
| M | `backend/src/modules/geocoding/infrastructure/prisma-geocoding-catalog.ts` | Lectura READY en la misma sesión |
| M | `backend/src/modules/geocoding/infrastructure/prisma-geocoding-attempt.ts` | Escritura de intento/candidatos/selección en sesión compartida |
| M | `backend/src/modules/packages/infrastructure/prisma-package-query.adapter.ts` | Proyección tenant-aware del resultado vigente |
| M | `backend/src/modules/route-planning/infrastructure/prisma-editable-route-replan.uow.ts` | Eliminar geocódigo sintético y UUID ficticio de dataset; carga sin enriquecimiento oculto |
| M | `backend/src/modules/route-planning/infrastructure/prisma-planning-assignment-unit-of-work.ts` | Cargar attemptId y dataset/perfil reales de conexiones |
| M | `backend/src/modules/route-planning/infrastructure/prisma-planning-workspace-query.adapter.ts` | Exponer aptitud consistente, sin crear intentos/candidatos |
| M | `backend/src/modules/packages/packages.module.ts` | Componer el nuevo caso de uso/puertos con servicios existentes |
| M | `backend/src/modules/geocoding/geocoding.module.ts` | Exportar únicamente capacidades públicas necesarias |
| N | `backend/src/config/package-geocoding.config.ts` | Catálogo/municipio/perfil/política confiables, con validación explícita |
| N | `docker-compose.pkg-geo-01.yml` | Entorno de pruebas propio; archivo autónomo, sin heredar nombres/puertos del Compose principal |

No se prevé migración para el vínculo básico. Si la revisión del contrato demuestra que AuditLog no representa adecuadamente el diagnóstico o que faltan permisos SQL efectivos, detener esa ampliación y enumerar una migración nueva antes de continuar. Revisar el efecto acumulado de grants de todas las migraciones, no solo el último GRANT visible.

### Presentación y frontend

| Acción | Archivo | Responsabilidad |
| --- | --- | --- |
| M | `backend/src/modules/packages/presentation/packages.controller.ts` | Invocar un caso de uso por acción y obtener contexto confiable |
| M | `backend/src/modules/packages/presentation/package-http-errors.ts` | Mapear errores del flujo sin filtrar datos ajenos |
| N | `backend/src/modules/packages/presentation/dto/resolve-package-geocoding.dto.ts` | Reintento explícito con referencias esperadas |
| N | `backend/src/modules/packages/presentation/dto/review-package-geocoding.dto.ts` | Candidato, decisión, motivo y referencias esperadas |
| N | `backend/src/modules/packages/presentation/dto/correct-package-address.dto.ts` | Texto/municipio, motivo y referencias esperadas |
| M | `backend/src/modules/route-planning/presentation/route-planning.controller.ts` | Recibir dataset/perfil para consultar aptitud |
| M | `frontend/src/app/paquetes/types.ts` | Resultado de registro ampliado |
| M | `frontend/src/app/paquetes/api/packagesApi.ts` | Detalle y acciones de recuperación propuestas |
| M | `frontend/src/app/paquetes/nuevo/NewPackagePage.tsx` | Mostrar resultado geoespacial después de registrar |
| M | `frontend/src/app/paquetes/[packageId]/PackageDetailPage.tsx` | Diagnóstico/revisión/corrección mínima según permisos y estado |
| M | `frontend/src/app/planificacion/planningApi.ts` | Aptitud para contexto de planificación |
| M | `frontend/src/app/planificacion/PlanningPage.tsx` | Mostrar motivo; impedir selección engañosa sin reemplazar validación backend |

Endpoints nuevos propuestos bajo `/api/v1/packages/:packageId`: `POST /geocoding/resolve`, `POST /geocoding/review` y `POST /address-corrections`. El detalle existente devuelve el resultado consultable tras recarga. No existen hoy; fijar payloads/respuestas antes de implementar. La API de registro conserva sus campos actuales. La configuración y DTO de registro solo cambiarán si el contrato aprobado permite selección explícita de catálogo al cliente.

### Pruebas y documentación

Nuevos archivos previstos:

- `backend/src/modules/geocoding/test/network-attachment.policy.spec.ts`
- `backend/src/modules/geocoding/test/prisma-network-attachment.adapter.spec.ts`
- `backend/src/modules/packages/test/package-geocoding.policy.spec.ts`
- `backend/src/modules/packages/test/register-and-geocode-package.use-case.spec.ts`
- `backend/src/modules/packages/test/resolve-package-geocoding.use-case.spec.ts`
- `backend/src/modules/packages/test/review-package-geocoding.use-case.spec.ts`
- `backend/src/modules/packages/test/correct-package-address.use-case.spec.ts`
- `backend/src/modules/packages/test/package-geocoding-architecture.spec.ts`
- `backend/src/modules/route-planning/test/prisma-editable-route-replan.uow.spec.ts`
- `backend/test/pkg-geo-01.e2e-spec.ts`
- `backend/test/integration/pkg-geo-01.cjs`
- `frontend/src/app/paquetes/api/packagesApi.spec.ts`
- `frontend/src/app/paquetes/[packageId]/PackageGeocoding.spec.tsx`
- `docs/adr/pkg-geo-01.md`, inicialmente propuesto, después aceptado solo tras revisión.

Modificar pruebas existentes: `backend/src/modules/geocoding/test/{geocode-address.service,prisma-geocoding-address,prisma-geocoding-catalog,prisma-geocoding-attempt}.spec.ts`, `backend/src/modules/packages/test/{register-package.service,prisma-package-registration.adapter}.spec.ts`, `backend/src/modules/route-planning/test/{assign-route-planning,replan-editable-route.service,prisma-planning-workspace-query.adapter,get-planning-workspace.service}.spec.ts`, `backend/test/registration-endpoints.e2e-spec.ts` y `backend/test/assignment-planning.e2e-spec.ts`. La notación entre llaves enumera exactamente archivos existentes.

Modificar `backend/package.json` y `backend/test/integration/README.md` para el runner nuevo; `Makefile` solo si se incorpora también un objetivo que use el Compose aislado, nunca apuntando a los servicios fijos principales. Actualizar este plan, su informe, PKG-01, GEOCODE-01 y el resumen MVP con el delta verificado, sin reescribir evidencia histórica. No ampliar DEMO-01 ni cambiar sus semillas.

## Entorno aislado y verificación prevista

Inspección Docker de solo lectura realizada: los contenedores `sls-backend`, `sls-worker`, `sls-frontend`, `sls-postgres`, `sls-rabbitmq`, `sls-integration-postgres` y Prisma Studio pertenecen al proyecto `sls`, cuyo directorio es `/home/lzirox/Projects/sls`. Backend/frontend/worker montan aquel checkout. Están ocupados los puertos host 3000, 5173, 5432, 5672 y 15672; sus volúmenes son ajenos. No ejecutar `docker compose exec backend` sin seleccionar una configuración propia ni arrancar el Compose base de esta rama. Cambiar solo `-p` no resuelve los `container_name` fijos.

Preparación de fase 3: crear el archivo autónomo listado arriba con proyecto seleccionado mediante `-p sls-pkg-geo-01`, sin `container_name`, puertos publicados ni volúmenes externos. Backend de pruebas construido desde este workspace, sin bind mount a otro checkout; preferir copia en imagen para que generación/build no escriban en el host. Un PostGIS 17 dedicado, llamado `integration-postgres` dentro de esa red y con datos en tmpfs, será el único servidor de los runners. No compartir el `sls-integration-postgres` existente. No levantar worker/RabbitMQ para este corte sincrónico; si se necesita frontend, servicio propio construido desde esta rama.

Antes de levantarlo, validar `docker compose -p sls-pkg-geo-01 -f docker-compose.pkg-geo-01.yml config --quiet` y volver a inspeccionar nombres/redes. Ese archivo todavía no existe y el comando no se ha ejecutado. El runner debe crear una base `sls_pkggeo01_<uuid>`, aplicar migraciones y ejecutar como `sls_app`; rechazar nombres/servidores de producción y limpiar únicamente esa base en `finally`, según la guía de integración. Ejecutar runners secuencialmente porque las migraciones crean roles de instancia.

Una vez creado y validado el entorno, ejecutar mediante sus servicios:

1. Build backend, unitarias de packages/geocoding/route-planning/assignments y fronteras de arquitectura.
2. Runners existentes `test:registration-01`, `test:geocode-01`, `test:assign-01` y `test:gdb-05`, con `GDB_TEST_ADMIN_URL` dirigido al PostGIS propio.
3. Runner nuevo, después de implementarlo y registrar su script. No anunciarlo como disponible antes de entonces.
4. Build y pruebas frontend del cambio; usar los scripts reales de `frontend/package.json`. Lint backend actual lleva `--fix`: nunca usarlo en auditoría de lectura.

Ninguno de estos checks se ejecutó en esta fase. La verificación del documento se limita a revisión de rutas/enlaces y whitespace.

## Aceptación funcional

1. Un POST autenticado con dirección coincidente en un catálogo controlado registra paquete/historial/outbox, intento/candidatos/selección, vínculo, conexión válida y diagnóstico auditable sin script de preparación ni coordenadas enviadas por el cliente.
2. REVIEW_REQUIRED y NOT_FOUND conservan evidencia y selección correcta o nula; no generan conexiones aceptadas ni asignaciones. Dataset no disponible y formato no soportado tienen diagnóstico distinto, persistente y consultable tras recarga.
3. Una conexión usa el mismo candidato/dataset/perfil, geometría real y distancia validada; ausencia, perfil ajeno, distancia fuera de política y dataset no READY bloquean la aptitud. Nodo desconectado no se presenta como garantía de camino al depósito.
4. Después de clasificar, solo datos aptos entran a clustering/asignación. Intentar por API incluir un paquete no apto produce el resultado pendiente correspondiente; no crea ruta/parada/asignación para él. El registro por sí solo permanece REGISTERED.
5. La replanificación no crea intentos, candidatos ni conexiones para suplir datos ausentes. Una prueba de adaptador con un paquete sin intento demuestra cero escrituras de geocodificación.
6. Planificación y replanificación fijan `RouteStop.geocodingAttemptId`; el lector GDB-05 puede resolver sus candidatos/conexiones. Crear otra dirección/intento no modifica la selección ni coordenadas de paradas históricas. No se exige integrar generación automática de RouteLeg en este corte.
7. Revisión, corrección y reintento tienen permisos, motivo, correlación y precondiciones. Una referencia obsoleta o asignación concurrente no deja un paquete con dirección/intento incompatibles. Repetir sin cambios no duplica efectos.
8. El fallo inducido al insertar candidato, conexión, historial o auditoría revierte toda la operación sin 201 engañoso; el fallo esperado de negocio sí conserva un registro consistente.
9. Tenant A no consulta, revisa, corrige ni enlaza dirección/intento/candidato/conexión de B; pruebas bajo runtime/RLS y HTTP. Guía puede repetirse entre tenants y sigue siendo única dentro de cada uno.
10. UI real muestra éxito con aptitud o necesidad de revisión, permite la recuperación acordada y consulta el resultado después de recarga. No depende de semillas ni de UI-DELIVERY-01.

## Plan verificable por fases

| Paso | Fase | Responsable | Estado | Dependencias | Objetivo y aceptación | Evidencia / pendiente |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Auditoría y sanity check | CODEX_MECHANICAL | DONE | Repositorio actual | Diagnóstico, inventario y plan revisables | Inspección estática e inventario Docker completados; usuario solicita continuar autónomamente desde el plan |
| 2 | Contrato del núcleo | GEMINI_ORCA | DONE | Aprobar fase 1 | Tipos, sesión UoW, resultados, permisos, catálogo/perfil y radio vial explícitos | Contratos puros, tipos de diagnóstico y puertos de sesión implementados |
| 3 | Dominio y aplicación | GEMINI_ORCA | DONE | Paso 2 | Políticas y casos de uso puros con pruebas sin Prisma/NestJS | Build tsc (0 errores) y 31 suites unitarias (297 tests) con --runInBand en verde en Docker Compose aislado; validación cerrada fail-closed de perfiles transitables; pausa obligatoria para revisión humana |
| 4 | Persistencia y API | GEMINI_ORCA | DONE | Aprobar núcleo | Sesión transaccional, registro integrado, recuperación y eliminación del fallback; pruebas de rollback/tenant | Implementación completada y verificada: PrismaPackageGeocodingUnitOfWork con UoW atómico, PrismaNetworkAttachmentAdapter parametrizado, eliminación de fallback sintético en planificación, controladores/DTOs/errores HTTP, runner de integración test/integration/pkg-geo-01.cjs y suite E2E test/pkg-geo-01.e2e-spec.ts (19/19 escenarios en PostGIS dedicado), 22 suites/235 unitarias de packages y type-check/lint acotado aprobados. Hallazgos contrastados por el coordinador; pausa para aprobación humana. |
| 5 | Consumidores y UI | GEMINI_ORCA | DONE | Contrato API estable y fase anterior aprobada | Aptitud contextual, paradas con intento y recuperación visible | UI implementada y verificada en contenedor: NewPackagePage, PackageDetailPage, PackageGeocodingCard, PackageCandidatesList, PackageRecoveryActions y PlanningPage; 13/13 suites (87/87 tests) en verde; build y oxlint 0 errores. |
| 6 | Integración, auditoría y cierre | GEMINI_ORCA / USER | DONE | Pasos 3–5 | Diez criterios anteriores, build y pruebas pertinentes | Auditoría final de arquitectura H1-H7 cerrada (orden de locks, P2002 exacto, UoW estricto, política pura extraída de persistencia, DTOs blindados, scoping tenant y suites en verde); 162/162 suites unitarias backend y 19/19 E2E en PostGIS; propuesta atómica de commits lista. |

Cada paso usa los archivos de su capa enumerados en el inventario. La evidencia futura se registra en el informe con fecha, comando, resultado y commit si el usuario lo crea. La documentación no acredita implementación.

## Paso actual — aprobación humana de fase 3

El núcleo ya fue aprobado. La persistencia, API y conexión backend de planificación se implementaron y sus hallazgos se corrigieron mediante Gemini. El coordinador contrastó código y logs: 19 escenarios E2E, 22 suites/235 unitarias de packages y type-check/lint acotado aprobados. No repitió las suites, porque la evidencia final era coherente con los archivos revisados.

Siguiente paso tras aprobación: paso 5 de frontend, mostrar diagnóstico de registro/detalle, candidatos y recuperación autorizada e integrar aptitud contextual en planificación. Esta fase UI aún no se inicia. La auditoría final y propuesta de commits siguen después; no ejecutar commit/push/merge. La revisión actual de hallazgos no sustituye esa auditoría final del alcance completo.

## Bitácora y cierre

| Fecha | Paso | Cambio observado | Verificación | Commit |
| --- | --- | --- | --- | --- |
| 2026-11-08 | Fase 1 | Rama propia existente; registro y GEOCODE separados; semilla suple integración; fallback ficticio de replanificación y referencias de parada nulas | Lectura de fuentes, migraciones, pruebas e historial; inspección Docker sin mutaciones; sin tests de aplicación | Base e7743a5; documentación sin commit |

| 2026-11-08 | Nomenclatura | Usuario confirma PKG-GEO-01; documentos y artefactos previstos normalizados a pkg-geo-01; rama feature/pkg-geo-01 y nombre visible de Orca PKG-GEO-01 | Git y metadatos Orca comprobados; sin cambio de alcance ni aprobación de fase 1 | Sin commit |

| 2026-11-08 | Fase 2 | Dominio y aplicación de PKG-GEO-01 implementados: políticas puras de red vial y geocodificación, sesión UoW, casos de uso de registro+resolución, revisión y corrección de dirección, más pruebas unitarias | Type-check y 31 suites unitarias en Docker Compose (162 suites globales); 0 inline comments; 0 any/ts-ignore | Sin commit |
| 2026-11-08 | Fase 3 | Persistencia, adaptadores y API completados: UoW atómico, network attachment adapter, eliminación de fallback sintético en planificación, endpoints HTTP con RLS, runner pkg-geo-01 y suite E2E | Typecheck tsc 0 errores; 31 suites unitarias (297 tests) aprobadas; test:pkg-geo-01 8/8 escenarios superados en PostGIS dedicado; regresiones registration-01 (63/63), geocode-01 (6/6), assign-01 (6/6), gdb-05 (4/4) aprobadas | Sin commit |
| 2026-11-09 | Paso 5 UI | Frontend UI de registro, detalle, recuperación (reintento, revisión manual, corrección) y aptitud contextual en planificación implementados | Vitest 13 suites (87 tests) en verde; Vite build exit 0; Oxlint 0 errores; 0 comentarios inline | Sin commit |
| 2026-11-09 | Auditoría H1-H7 | Cierre de hallazgos H1-H7: orden de locks, discriminación canónica, target P2002 exacto, validación estricta UoW, extracción de PackageGeocodingPolicy de persistencia a dominio puro, validación runtime DTOs y scoping tenant | Backend: 162/162 suites unitarias (1,479 tests) y 19/19 E2E pasados; Frontend: 13/13 suites (87 tests) pasados; tsc y lint limpios; 0 comentarios inline | Sin commit |

- [x] Diagnóstico y plan persistentes preparados para revisión.
- [x] Fase 1 aceptada por el usuario para continuar autónomamente desde este plan.
- [x] Núcleo implementado/verificado y aprobado por el usuario para continuar.
- [x] Infraestructura implementada/verificada y lista para revisión.
- [x] Aceptación funcional demostrada en entorno aislado (backend).
- [x] Documentación reconciliada y revisión de capas/tenant/errores cerrada.

Cambios ajenos preservados: `package.json` y `pnpm-lock.yaml` raíz sin seguimiento en este workspace. No se modificaron `/home/lzirox/Projects/sls` ni el workspace `develop`.

## Orquestación activa

- Run: `run_4bf0752f0f40`. Task: `task_417e30861373`. Dispatch: `ctx_cd07a66021d9`.
- Worker Orca: `antigravity`, modelo solicitado y aceptado por el runtime `gemini-3.8-pro`, esfuerzo `high`, en este mismo workspace.
- Alcance delegado: únicamente fase 2; núcleo entregado y revisado, con evidencia final enlazada en el informe. Pendiente aprobación humana.
- Fase 3 autorizada por el usuario tras revisar el núcleo. No crear commits/push/merge.

## Puerta de revisión de fase 2

Gemini entregó el núcleo y corrigió los hallazgos del coordinador mediante seguimientos Orca; último dispatch `ctx_3a9b52e96792`, task `task_6771b64c0cd4`, run `run_4bf0752f0f40`. Evidencia final reportada: type-check sin errores y 31 suites/297 pruebas de packages/geocoding aprobadas en Compose aislado con --runInBand. El coordinador contrastó los cambios y la configuración documentada sin repetir la suite. Estado `REVIEW`: se espera aprobación humana antes de fase 3. No se afirma integración HTTP ni persistencia real probada.

## Inicio autorizado de fase 3

El usuario respondió «sigamos» a la petición de aprobación del núcleo y autorización de infraestructura. Se delegó persistencia/adaptadores/API y consumidores backend relacionados a Gemini 3.8 Pro high mediante el seguimiento Orca `ctx_701f5bb1b8a7`, task `task_8298fa3f2a76`, run `run_4bf0752f0f40`. Estado `IN_PROGRESS`; no hay resultados de fase3 todavía. La especificación exige Compose/PostGIS exclusivo, pruebas HTTP/RLS/rollback reales, propuesta previa de migraciones no previstas y nueva pausa humana al terminar. Frontend permanece pendiente para el paso5.

## Recuperación de fase 3 tras interrupción

El usuario solicita reanudar el trabajo. Orca informó `abandoned`, `terminal_missing` y `worker_identity_changed` para el dispatch `ctx_701f5bb1b8a7`. Se siguió la recuperación indicada: release confirmado con `processAction: none`, reapertura de la misma task `task_8298fa3f2a76` e inicio con Gemini `gemini-3.8-pro`, esfuerzo `high`, en el workspace actual. Nuevo dispatch `ctx_211af8ab53d5`, run `run_4bf0752f0f40`, estado `ready`.

Los archivos de implementación y resultados previos se conservan. La afirmación anterior de fase 3 completada queda pendiente de revisión: el coordinador detectó brechas en concurrencia de identidad de operación, carga de referencias fuera de la sesión, validación de JSON/configuración, selección vial por perfil y cobertura de rollback/continuidad con planificación. Se delegó completar y verificar esas brechas, sin rehacer el núcleo ni iniciar UI. Estado vigente de fase 3: `IN_PROGRESS`; revisión humana pendiente al finalizar.

## Revisión del coordinador del reporte de 11 escenarios — 2026-11-09

La fase 3 permanece `IN_PROGRESS`. La inspección confirmó que el escenario rotulado rollback solo rechaza una referencia obsoleta antes de escribir y no demuestra reversión de persistencia. También encontró comandos HTTP sin validación runtime, aptitud de workspace que no evalúa conexión/dataset/perfil solicitados, detalle que puede presentar diagnóstico histórico o MATCHED sin conexión como ELIGIBLE y procedencia incompleta de snapshots de planificación. Se devolvieron estos hallazgos y las comprobaciones pendientes a Gemini mediante dispatch `ctx_d84fe927447f`, task `task_840f49a35133`, run `run_4bf0752f0f40`. Los conteos previos son resultados reportados por el worker; no acreditan todavía la aceptación completa ni aprobación del coordinador. UI sigue pendiente.

## Contraste de archivos tras segundo reporte de fase 3 — 2026-11-09

El coordinador no aprobó el cierre: la suite guardada aún contiene el conflicto 409 como supuesto rollback y no contiene trigger de fallo ni llamada al resolvedor de waypoints descritos en el reporte anterior. Los DTO decorados se importan como `type` en el controlador, por lo que su validación runtime no queda acreditada. Persisten diferencias de vigencia del diagnóstico y configuración del runner/Compose frente a lo documentado. Las afirmaciones de cierre anteriores quedan sin acreditar en esos puntos. Se envió corrección concreta al worker mediante dispatch `ctx_14bcc41bd34c`, task `task_8cd2346d93b0`; fase 3 `IN_PROGRESS`. Se exigen cambios verificables en disco y logs reales antes de revisión humana. No avanzar a UI ni commits.

## Revisión de evidencia de 14 escenarios — 2026-11-09

El coordinador confirmó en disco trigger de rollback real, imports runtime de DTOs, llamada a resolveRouteWaypoints y logs con 14/14 escenarios aprobados. Persisten dos defectos: detalle sin intento puede convertir UNSUPPORTED_ADDRESS_FORMAT en DATASET_NOT_READY y algunos contextos finales de planificación/replanificación aún reconstruyen procedencia vial desde el comando. Se solicitaron correcciones y pruebas dirigidas, eliminar admin as any del E2E y conciliar comandos/proyecto real de logs mediante dispatch `ctx_0ece68a29411`, task `task_b8297ad202a7`. Estado de fase3 `IN_PROGRESS`; UI y commits pendientes.

## Revisión de 15 escenarios — 2026-11-09

Confirmados diagnóstico negativo sin intento, waypoint con Prisma runtime y logs de15/15 tests. Se solicita completar selección determinista por perfil cuando hay varias conexiones del mismo candidato y revalidación de detalle con mapping/radio actuales; quitar fallback al primer attachment y procedencia opcional fabricada desde comando. Seguimiento `ctx_ccd192c9a3ca`, task `task_417db7e95026`. Fase3 IN_PROGRESS hasta contrastar estos casos; no avanzar a UI ni commits.

## Puerta de revisión de fase 3 — 2026-11-09

Cierre de revisión de los hallazgos concretos: confirmado en disco el rechazo de aptitud sin target municipal, perfil ausente, dataset no READY y distancia fuera de radio, además de diagnóstico negativo sin intento, procedencia obligatoria de conexión y continuidad con waypoints. Logs finales: `/tmp/pkg-geo-01-phase3-verify-test.log` (19/19 y eliminación de DB desechable), `/tmp/pkg-unit-test.log` (22 suites/235 pruebas), logs de tsc/lint acotado y regresiones históricas detallados en informe. Último dispatch `ctx_b8e151d95409`, task `task_25fdeacd1c92`. Estado REVIEW; aprobación humana de fase3 pendiente. No UI ni commits ejecutados.

## Autorización e inicio de frontend — 2026-11-09

El usuario aprobó fase3 con «sí» y, tras explicar registro/detalle/planificación, confirmó la integración frontend. Se inició seguimiento Orca `ctx_f1d48a8da399`, task `task_34108c52f060`, run `run_4bf0752f0f40`, con el worker Gemini3.8Pro high en este mismo workspace. Alcance: paso5 UI, recuperación autorizada, lectura tras recarga, errores/permisos y aptitud contextual. Build/lint/tests de interacción mediante Compose propio; sin seeds, entorno principal, commits ni auditoría final anticipada. Pendiente implementación/evidencia y revisión humana al finalizar UI.

## Autorización de continuidad hasta propuesta de commits — 2026-11-09

El usuario indica «apruebo todo hasta la parte de los commits, es que me voy a dormir». Esta instrucción sustituye las pausas humanas intermedias pendientes: continuar autónomamente frontend, pruebas, revisión y correcciones, auditoría final y documentación dentro del alcance PKG-GEO-01. El coordinador no pedirá otra aprobación para esos pasos. Se mantiene la prohibición de ejecutar git commit/push/merge; la entrega final incluirá únicamente propuesta revisable de commits y comandos para el usuario. Preservar cambios ajenos y aislamiento del entorno. Se notificó al worker activo mediante mensaje `msg_2bf805d32a7a`; al recibir su entrega se continuará con revisión/auditoría automáticamente.

## Auditoría final en curso — 2026-11-09

La revisión frontend del coordinador detectó carreras de detalle entre rutas, estado de formularios/identidad de operación, municipio supuesto, aptitud frontend con fallback insuficiente y doble carga de contexto. Correcciones delegadas a Gemini mediante dispatch `ctx_054b6a26e816`, task `task_df9f5ea25d82`. La auditoría backend inicial identifica orden inverso de locks de paquete/operación entre resolución y revisión, mapeo demasiado amplio de P2002 y reglas nuevas de aptitud distribuidas entre adaptadores. Se preservan todos los avances; no se considera cierre final todavía ni se ejecutan commits. El usuario autoriza resolver estos hallazgos sin más pausas intermedias.

## Cierre de Auditoría Final y Propuesta de Commits — 2026-11-09

Bajo el despacho `ctx_e90edb2cdb75` (`task_d87b84af06ef`), se concluyó la resolución integral de hallazgos H1-H7 y se verificaron todas las suites frontend y backend:
- Backend: 162/162 suites unitarias (1,479 tests pasados) y 19/19 escenarios E2E aprobados en PostgreSQL 17 / PostGIS sobre tmpfs.
- Frontend: 13/13 suites Vitest (87/87 tests pasados), Vite build limpio y Oxlint con 0 errores.
- Typecheck & Lint: 0 errores de compilación TypeScript en producción y 0 errores en ESLint acotado a PKG-GEO-01.
- Calidad: 0 comentarios inline en código fuente o pruebas, `git diff --check` limpio sin errores de whitespace.
- Propuesta de commits lista para ejecución manual por el usuario sin ejecución directa de `git commit/push/merge`.


## Estado final de publicación

Las fases de implementación y verificación están completadas. El usuario autorizó explícitamente ejecutar commits, pull, push y crear PR después del cierre. Evidencia definitiva: sección final del [informe](../modules/pkg-geo-01-report.md). Destino del PR: main, para excluir UI-DELIVERY-01 ya incorporado a develop. La aprobación y fusión del PR permanecen como revisión del repositorio.
