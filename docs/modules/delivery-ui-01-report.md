# UI-DELIVERY-01 — Ejecución de entregas y cierre operativo desde frontend

Estado: **REVIEW (implementación verificada; se conserva la deuda técnica global documentada)**.

Plan de trabajo: [UI-DELIVERY-01](../plans/ui-delivery-01.md).

## Resumen de la Fase 3 y Corrección de Hallazgos

Se corrigieron y verificaron en su totalidad los 10 hallazgos emitidos en la revisión de la Fase 3, manteniendo la pureza arquitectónica, tipado estricto, cero comentarios inline y verificación interactiva en navegador real:

1. **Gestión de concurrencia y promesas en `StopPage` (Hallazgo 1):**
   - Se introdujo un secuenciador generacional `requestSeqRef` para descartar resoluciones desfasadas de peticiones concurrentes.
   - La función `reload` retorna una `Promise<void>` real, permitiendo su encadenamiento seguro con `await`.
   - Se resetea el estado (`selectedPackageId`, `showIncidentForm`, `attendError`) ante cualquier cambio en los parámetros de ruta o parada.
   - Se desacoplaron los errores de recarga de datos de los errores de mutación en la llegada a parada.

2. **Mapeo por asignación y restricción de mutabilidad (Hallazgo 2):**
   - Los paquetes de la parada se indexan en el DOM mediante `key={pkg.assignmentId}` en lugar de `packageId`.
   - Se restringieron los botones operativos de entrega exclusivamente a paquetes con `pkg.assignmentState === "ACTIVE"` y `pkg.state === "OUT_FOR_DELIVERY"` cuando la ruta está `IN_PROGRESS` y el usuario cuenta con permisos operativos. Las asignaciones históricas o terminadas (`ENDED`) se presentan en modo de solo lectura.

3. **Restricción de incidentes por estado de ruta y permisos (Hallazgo 3):**
   - El componente `StopIncidentSection` se oculta en rutas cerradas (`COMPLETED` o `CANCELLED`) y para usuarios sin permisos operativos (`canExecute = false`).

4. **Firmas de idempotencia robustas para archivos y contenido (Hallazgo 4):**
   - `getFileFingerprint` utiliza un `WeakMap<Blob | File, string>` para asignar tokens de referencia únicos por instancia de archivo o blob, diferenciando archivos con idéntico nombre, tamaño, tipo y fecha de modificación.
   - Las firmas de `computeDeliveryAttemptSignature`, `computeFailedAttemptSignature`, `computeIncidentSignature`, `computeRouteClosureSignature` y `computeAttendStopSignature` emplean serialización estructurada en JSON (`JSON.stringify`), previniendo colisiones por delimitadores.

5. **Robustez y ciclo de vida en `RouteClosureForm` (Hallazgo 5):**
   - Se separó el estado de error de carga del manifiesto del estado de manifiesto vacío, añadiendo un botón de reintento ante fallos de red.
   - El botón de cierre se deshabilita mientras el manifiesto está cargando o presenta errores.
   - El formulario resetea su estado al cambiar `route.id`.
   - Se implementó un bloqueo estricto contra doble envío durante la mutación (`submitting`).
   - Los botones de acción de `RouteOperations` se deshabilitan mientras el diálogo de cierre está activo.

6. **Suites de integración PostGIS, inyección de identidad y autorización en controlador (Hallazgo 6):**
   - Se sobreescribió `AuthGuard` en las suites e2e HTTP (`delivery-http.e2e-spec.ts` y `route-close-http.e2e-spec.ts`) exclusivamente para fines de prueba, inyectando el `ActorContext` y permisos mediante encabezados de test para verificar la cadena de guardias y la persistencia en base de datos sin depender de cookies de sesión. La autenticación real con sesión y cookies fue ejercitada y validada únicamente en el ensayo interactivo en navegador.
   - Se eliminaron los tipos `any` en dichas suites, empleando `HttpTestRequest` (extensión tipada de `RequestWithActor`) y `Server` con `canActivate` síncrono.
   - Se removió el `@RequirePermission` a nivel de método en `routes.controller.ts`, restituyendo la autorización estricta a nivel de clase (`COORDINATE_ROUTES`).
   - La suite `route-close-http.e2e-spec.ts` demuestra que actores sin permiso de coordinación son rechazados por `PermissionsGuard` con 403 `PERMISSION_DENIED` antes de validar los parámetros de entrada o cuerpo. La verificación de la regla de dominio puro (`RouteForbiddenError`) se preserva en las pruebas unitarias de `CloseRouteUseCase`.
   - Evidencia previa de integración vigente y confirmada: `make integration-test TEST=delivery-01` (29 pruebas en 2 suites) y `make integration-test TEST=route-close-01` (20 pruebas en 2 suites), totalizando 4 suites y 49 pruebas en verde sobre PostgreSQL 17 desechable.

7. **Verificación interactiva en navegador Orca y límites de evidencia por capa (Hallazgo 7):**
   - Se ejecutó el flujo operativo interactivo en `http://localhost:5173` sobre la ruta real `#474268ED`:
     - Preparación de ruta (`PLANNED` -> `READY`) con congelamiento del manifiesto.
     - Inicio de ruta (`READY` -> `IN_PROGRESS`).
     - Parada #1: llegada registrada, paquete `OSM-DEMO-329842F6-2` en `OUT_FOR_DELIVERY`, registro de intento fallido ("Destinatario ausente", notas), parada marcada `FAILED`, reporte de incidente vial confirmado por el backend.
     - Parada #2: llegada registrada, paquete `OSM-DEMO-329842F6-3` en `OUT_FOR_DELIVERY`, carga de archivo de evidencia fotográfica (`test-evidence.png`), notas de entrega, confirmación remota exitosa, parada marcada `COMPLETED`.
     - Cierre de ruta: apertura de `RouteClosureForm`, selección de modo `FORCED` con motivo `OPERATIONAL_REASON` y notas explicativas, selección de los 2 paquetes de carga pendiente, confirmación de recepción física en depósito y confirmación remota.
     - Panel de resumen: renderizado del snapshot inmutable de auditoría (`RouteSummaryPanel`) con métricas (1 entregado, 1 fallido, 1 pendiente, 33% efectividad, duración 4m 47s, tabla de paquetes reconciliados y disposición de paradas).
   - Delimitación honesta de alcances y límites de evidencia (sin declaraciones universales):
     - El cierre en modo `REGULAR` y el replay exacto de idempotencia están probados en las suites de integración backend (`route-close-http.e2e-spec.ts`).
     - Las paradas multipaquete se prueban de manera **secuencial** (un paquete tras otro en la misma parada), no de forma concurrente o simultánea.
     - Las pruebas de replay HTTP demuestran la idempotencia transaccional del backend ante claves idénticas; **no constituyen simulación ni garantía de recuperación ante desconexión de red en el navegador**.
     - El motivo de contingencia `OTHER` está validado a nivel de reglas puras en pruebas unitarias (`validateClosureInput`), pero no cuenta con un escenario dedicado en los runners de integración.
     - Estos límites representan las fronteras reales de la evidencia automatizada del proyecto sin requerir expansión innecesaria de alcance.

8. **Documentación rigurosa y alineación con la rama real (Hallazgo 8):**
   - Documentación actualizada reflejando la rama real `feature/ui-delivery-01`, con commit base `1068cf7` y commit auditado `de6ce27`.

9. **Modularización, aislamiento de ciclo de vida y sincronización de cierre (Hallazgo 9):**
   - `StopPage.tsx` se desacopló mediante el wrapper con clave explícita `<StopPageController key={`${routeId}:${stopId}`} ... />`, aislando el ciclo de vida por contexto y garantizando desmontaje limpio ante navegación.
   - Se modularizaron componentes especializados bajo `frontend/src/app/mi-ruta/paradas/[stopId]/` (`StopStateBanner.tsx`, `StopArrivalCard.tsx`, `StopPackageList.tsx`, `StopIncidentSection.tsx`, `routeClosureState.ts`).
   - Se añadió `RequestSequenceGuard` e `isMountedRef` para prevenir carreras asíncronas y descartar respuestas desfasadas tanto en `StopPageController` como en `RouteClosureForm`.
   - En `RouteDetailPage.tsx` y `RouteOperations.tsx`, el resultado `CloseRouteResult` se propaga al callback de éxito, reflejando de inmediato el estado `COMPLETED` en la ruta local y cargando el resumen persistido. Si la consulta GET subsiguiente de actualización falla, el error se captura en `refreshError` sin mutar el estado durante el updater, mostrando un banner con botón de reintento exclusivo para lecturas sin repetir el POST de cierre, y bloqueando cualquier acción operativa de mutación gracias al flag `!closureConfirmed`.

10. **Pruebas de comportamiento interactivo y concurrencia (Hallazgo 10):**
    - `routeClosureState.spec.ts` (13 pruebas), `StopPage.spec.tsx` (9 pruebas), `RouteOperations.spec.tsx` (8 pruebas) e `idempotentAction.spec.ts` (17 pruebas) validan selección individual y masiva, confirmación física de custodia, validación de distancias, modo forzado, restricción de acciones sobre paquetes terminados, sincronización de `CloseRouteResult`, manejo de fallo en refresh sin repetir POST y descarte de respuestas fuera de orden mediante `RequestSequenceGuard`.

## Evidencia de pruebas ejecutadas

- **Frontend:**
  - `npm test`: 20 archivos de prueba pasados, 162 pruebas aprobadas.
  - `npm run build` (`tsc --noEmit && vite build`): código 0; advertencia de bundle mayor a 500 kB.
  - `npm run lint` (`oxlint`): 0 errores y 17 advertencias.
- **Backend (Evidencia previa intacta y vigente):**
  - `npm test -- src/modules/deliveries/`: 7 suites, 121 pruebas pasadas al 100%.
  - `npm test -- src/modules/routes/`: 17 suites, 190 pruebas pasadas al 100% con filtro `src/modules/routes`.
  - `make integration-test TEST=delivery-01`: 2 suites, 29 pruebas pasadas al 100%.
  - `make integration-test TEST=route-close-01`: 2 suites, 20 pruebas pasadas al 100%.
  - Total integración PostGIS: 4 suites, 49 pruebas en verde en bases de datos PostgreSQL 17 desechables.
  - `npm run build` (`nest build`): código 0.

## Deuda técnica preexistente

Se mantiene registrada la deuda preexistente de 8 errores de tipado en `backend/src/modules/geocoding/test/osm-demo-extract.spec.ts` y suites de mensajería (`src/shared/test/messaging/*`), los cuales son ajenos a los módulos de entregas y rutas. Los módulos de entregas y rutas no presentan errores de tipado y superan el build de NestJS.
