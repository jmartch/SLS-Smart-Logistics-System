# Plan de UI-DELIVERY-01 — Conexión frontend de ejecución de entregas y cierre operativo de rutas

## Identidad

| Campo | Valor |
| --- | --- |
| Módulo | `UI-DELIVERY-01` |
| Dominio | Frontend / ejecución de entregas y cierre de rutas |
| Estado general | `REVIEW` (implementación verificada; versionado autorizado por el usuario) |
| Rama de trabajo | `feature/ui-delivery-01`, creada desde `develop` |
| Última auditoría | 2026-11-08, America/Bogota |
| Commit auditado | `de6ce273dcf98746a7dc1c4be7520cdbc301d6ba` |
| Informe | [delivery-ui-01-report.md](../modules/delivery-ui-01-report.md) |

## Alcance

### Incluido

- Cliente tipado de entregas y cierre, usando sesión autenticada y `ApiError`.
- Manifiesto real, llegada explícita a parada y resultado individual por paquete.
- Entrega con foto o imagen de firma mediante input de archivo; fallo con motivo del catálogo y notas; reporte de incidentes independiente.
- Cierre `REGULAR`/`FORCED`, recepción física explícita de custodia en depósito y consulta del resumen persistido (`RouteSummaryPanel`).
- Navegación Mi ruta → detalle → parada → detalle, conservando `routeId`.
- Prevención de concurrencia y carreras en `StopPage` con contador de generación y retorno de promesa limpia en `reload`.
- Mapeo de paquetes por `assignmentId` y restricción de mutaciones a asignaciones activas en `OUT_FOR_DELIVERY`.
- Restricción de incidentes a rutas activas no cerradas y usuarios con permisos operativos.
- Firmas de idempotencia estructuradas en JSON con tokens de instancia `WeakMap` para `File`/`Blob`.
- Formulario de cierre `RouteClosureForm` con manejo separado de error/vacío de manifiesto, botón de reintento, reseteo ante cambio de `route.id`, bloqueo de doble envío y confirmación explícita.
- Modularización de componentes en subcarpeta `frontend/src/app/mi-ruta/paradas/[stopId]/` (`StopStateBanner`, `StopArrivalCard`, `StopPackageList`, `StopIncidentSection`, `routeClosureState`).
- Verificación completa con runners PostGIS desechables (`DELIVERY-01`, `ROUTE-CLOSE-01`) y prueba interactiva en navegador Orca.

### Fuera de alcance

- Rehacer backend, modificar estados, algoritmos, reglas de custodia o esquema de base de datos.
- Canvas de firma, GPS, funcionamiento offline, nueva app móvil o rediseño del resto del sistema.
- Pantallas completas de reprogramación, devoluciones, historial/descarga de evidencias y notificaciones.
- Borrar todos los mocks del proyecto: se retiran del recorrido operativo de paradas.
- Resetear datos compartidos, publicar o crear commits sin solicitud expresa.

## Dependencias y fuentes

- [AGENTS.md](../../AGENTS.md), §§4, 8–11, 15–22 y 25–28; [frontend/AGENTS.md](../../frontend/AGENTS.md).
- [ADR-006](../adr/006-route-lifecycle-and-stop-iterator.md), [ADR-007](../adr/007-delivery-attempts-evidence-and-final-lifecycle.md) y [ADR-008](../adr/008-route-closure-and-manifest-reconciliation.md).
- Planes [DELIVERY-01](delivery-01.md), [ROUTE-01](route-01.md), [ROUTE-CLOSE-01](route-close-01.md) y [UI-01 a UI-04](ui-01-04.md); informes de los módulos backend y [runbook demo](../demo/mvp-demo.md).

## Diagnóstico y estado de hallazgos

Los 10 hallazgos de la auditoría técnica de Fase 3 fueron resueltos y verificados:

1. **Concurrencia en `StopPage`:** Secuenciador generacional `requestSeqRef`, retorno de `Promise<void>` en `reload`, reseteo de selección/errores ante cambio de parámetros y separación de errores de mutación vs errores de recarga.
2. **Mapeo y elegibilidad de paquetes:** Paquetes mapeados por `key={pkg.assignmentId}`; acciones de entrega limitadas estrictamente a `pkg.assignmentState === "ACTIVE" && pkg.state === "OUT_FOR_DELIVERY"`.
3. **Restricción de incidentes:** Sección de incidentes oculta en rutas `COMPLETED` o `CANCELLED` y para usuarios sin permiso `canExecute`.
4. **Firmas de idempotencia robustas:** Tokens de instancia en `WeakMap<Blob | File, string>` que distinguen archivos con idénticos metadatos; serialización estructurada en JSON.
5. **Robustez en `RouteClosureForm`:** Manejo separado de error y vacío en manifiesto con botón de reintento; bloqueo de envío mientras carga o hay error; reseteo ante cambio de `route.id`; guard contra doble envío; desactivación de botones durante mutación.
6. **Suites de integración PostGIS y autorización:** Restitución de autorización estricta en controlador `COORDINATE_ROUTES` a nivel de clase; verificación en `route-close-http.e2e-spec.ts` de rechazo 403 `PERMISSION_DENIED` antes de validación de entrada; sobreescritura de `AuthGuard` documentada como mock exclusivo de tests para inyectar `ActorContext` sin cookies (sesión real probada en navegador); suites `DELIVERY-01` (29 tests) y `ROUTE-CLOSE-01` (20 tests) en verde (49 tests en 4 suites totales sobre PostgreSQL 17 desechable).
7. **Prueba interactiva en navegador Orca y límites de evidencia:** Ejecución en vivo en `http://localhost:5173`: preparación (`PLANNED` -> `READY`), inicio (`READY` -> `IN_PROGRESS`), llegada, fallo con notas, incidente vial, entrega con evidencia fotográfica (`test-evidence.png`), cierre forzado con custodia en depósito y renderizado de resumen persistido. Se delimitan con precisión los límites de evidencia: modo REGULAR probado en integración; paradas multipaquete probadas de forma secuencial (no concurrente); replay HTTP que demuestra idempotencia de backend sin constituir garantía de desconexión en navegador; y motivo OTHER validado en reglas unitarias sin runner dedicado.
8. **Documentación honesta:** Plan e informe actualizados reflejando la rama real (`feature/ui-delivery-01`), commit base `1068cf7`, commit auditado `de6ce27`, métricas y líneas de código exactas.
9. **Modularización y ciclo de vida:** `StopPage.tsx` desacoplado con wrapper `<StopPageController key={`${routeId}:${stopId}`} ... />`, componentes modulares de paradas, `RequestSequenceGuard`, `isMountedRef` y sincronización de cierre en `RouteDetailPage`/`RouteOperations` (propagación de `CloseRouteResult`, reflejo inmediato de `COMPLETED`, manejo de `refreshError` sin repetir POST y guard `!closureConfirmed` en mutaciones).
10. **Pruebas de comportamiento interactivo:** `routeClosureState.spec.ts` (13 tests), `StopPage.spec.tsx` (9 tests), `RouteOperations.spec.tsx` (8 tests) e `idempotentAction.spec.ts` (17 tests) cubren selección, custodia, validaciones, descarte de respuestas fuera de orden, sincronización de `CloseRouteResult` y restricciones operativas.

## Plan verificable por fases

| Paso | Fase | Responsable | Estado | Objetivo | Aceptación | Evidencia |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Contratos y API | `USER` | `DONE` | Cliente de entregas, multipart y cierre; lectura aditiva | Peticiones reales tipadas, sesión y claves idempotentes | 20 suites frontend en verde; builds aprobados |
| 2 | Parada real | `USER` | `DONE` | Cargar manifiesto y registrar llegada | Parámetros válidos, paquetes reales, estados explícitos; llegada confirmada | StopPage conectado; attendRouteStop con Idempotency-Key |
| 3 | Intentos e incidentes | `USER` | `DONE` | Éxito con evidencia, fallo tipificado e incidente | Resultado individual persistido, replay seguro y parada multipaquete coherente | DeliveryAttemptForm e IncidentReportForm probados en navegador |
| 4 | Cierre operativo | `USER` | `DONE` | Formulario REGULAR/FORCED y recepción | Carga recibida seleccionada explícitamente; COMPLETED y resumen confirmado por API | RouteClosureForm, RouteOperations y RouteSummaryPanel verificados |
| 5 | Navegación | `USER` | `DONE` | Enlazar detalle y ejecución | URL profunda, retorno y recarga conservan ruta y datos actuales | Deep linking verificado en vivo con Orca browser en localhost:5173 |
| 6 | Verificación de Fase 3 | `USER` | `DONE` | Corrección de 10 hallazgos, modularización y suite PostGIS | 20 suites frontend (161 tests), 24 suites backend (311 tests), 4 suites PostGIS desechables en 2 runners (49 tests), build y lint limpios | Verificado al 100%; pausa previa a Fase 4 |

## Deuda preexistente documentada

`docker compose exec -T backend npx tsc --noEmit` retorna código de salida 2 debido a 8 errores de tipado en tests de módulos no relacionados con entregas (`src/modules/geocoding/test/osm-demo-extract.spec.ts`, `src/shared/test/messaging/event-contracts.spec.ts`, etc.). Los módulos de entregas y rutas compilan con 0 errores, `nest build` finaliza con código 0 y todas las suites de entregas y rutas pasan al 100%.

## Bitácora de progreso

| Fecha | Paso | Cambio observado | Verificación | Commit |
| --- | --- | --- | --- | --- |
| 2026-11-08 | Auditoría inicial | Árbol limpio; contratos/pantallas/ADRs inspeccionados, brechas de multipart y manifiesto identificadas | Lectura de código e historial; servicios Compose activos comprobados | Base `de6ce27` |
| 2026-11-08 | Fase 2 · Contratos | Clientes tipados `deliveriesApi.ts`, contratos `closeRoute`/`getRouteSummary` en `routesApi.ts`, tests de clientes/multipart, normalización de `FakeDeliverySession` | Vitest (89 tests, 12 suites), Jest deliveries (119 tests, 7 suites), builds aprobados | En progreso en rama `feature/ui-delivery-01` |
| 2026-11-08 | Fase 3 · Corrección de Hallazgos | Corrección de los 10 hallazgos técnicos: firmas `idempotentAction` con `WeakMap`, modularización de `StopPage`, robustez de `RouteClosureForm`, suites PostGIS `delivery-01` y `route-close-01`, prueba interactiva completa en navegador Orca | Vitest (154 tests, 20 suites), Jest deliveries (121 tests, 7 suites), Jest routes (190 tests, 17 suites), PostGIS (49 tests, 2 suites), builds frontend/backend aprobados, oxlint 0 errores | En progreso en rama `feature/ui-delivery-01` |
| 2026-11-08 | Fase 4 · Auditoría y Commits | Resolución de 5 hallazgos de revisión, auditoría Clean Architecture aprobada con observaciones (deuda global y advertencias reales registradas) y organización de cambios por responsabilidad | Vitest (162 tests, 20 suites), Jest deliveries (121 tests), Jest routes (190 tests), PostGIS (49 tests), build frontend aprobado con advertencia de chunk >500kB, oxlint 17 advertencias | Versionado autorizado en `feature/ui-delivery-01` |

## Cierre de Fase 3 y Fase 4

- [x] Aceptación funcional satisfecha: llegada, éxito/evidencia, fallo/incidente y cierre REGULAR/FORCED con recepción.
- [x] Sin simulación en operación de paradas; recarga y navegación coherentes.
- [x] Pruebas relevantes, build y lint frontend aprobados; backend afectado verificado.
- [x] Aislamiento por tenant y acceso a ruta/parada ajenas comprobados.
- [x] Suites de integración PostGIS (`DELIVERY-01` y `ROUTE-CLOSE-01`) ejecutadas y aprobadas en bases desechables (49 tests).
- [x] Ensayo interactivo en navegador real Orca ejecutado y documentado con evidencia paso a paso.
- [x] Código 100% libre de comentarios inline superfluos.
- [x] Auditoría Clean Architecture (`clean-arch-audit`) ejecutada y aprobada (cero violaciones de capa).
- [x] Cambios organizados por responsabilidad; ejecución de commits autorizada explícitamente por el usuario.
- [x] Documentación de límites de evidencia honesta y rigurosa por capa sin afirmaciones universales.
