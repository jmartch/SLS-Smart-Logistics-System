# Plan de UI-DELIVERY-01 — Conexión frontend de ejecución de entregas y cierre operativo de rutas

## Identidad

| Campo | Valor |
| --- | --- |
| Módulo | `UI-DELIVERY-01` |
| Dominio | Frontend / ejecución de entregas y cierre de rutas |
| Estado general | `IN_PROGRESS` |
| Rama observada | `codex/ui-delivery-01`, creada desde `develop` |
| Última auditoría | 2026-11-08, America/Bogota |
| Commit auditado | `de6ce273dcf98746a7dc1c4be7520cdbc301d6ba` |
| Informe | [delivery-ui-01-report.md](../modules/delivery-ui-01-report.md) |

## Alcance

### Incluido

- Cliente tipado de entregas y cierre, usando sesión autenticada y `ApiError`.
- Manifiesto real, llegada explícita a parada y resultado individual por paquete.
- Entrega con foto o imagen de firma mediante un input de archivo; fallo con motivo del catálogo y notas; reporte sencillo de incidentes.
- Cierre `REGULAR`/`FORCED`, recepción física explícita de carga y consulta del resumen persistido.
- Navegación Mi ruta → detalle → parada → detalle, conservando `routeId`.
- Estados de carga, vacío, error, acceso denegado, envío y éxito; actualización después de mutaciones y recarga.
- Ampliación aditiva de la lectura del manifiesto, necesaria para mostrar resultados individuales y obtener IDs reales de asignaciones para recepción. Reutiliza puertos y autorización del módulo propietario; no modifica políticas de entrega ni cierre.
- Pruebas de contratos y estados, build y verificación reproducible de integración/aislamiento.

### Fuera de alcance

- Rehacer backend, modificar estados, algoritmos, reglas de custodia o esquema de base de datos.
- Canvas de firma, GPS, funcionamiento offline, nueva app móvil o rediseño del resto del sistema.
- Pantallas completas de reprogramación, devoluciones, historial/descarga de evidencias y notificaciones. Los endpoints existentes mantienen esas capacidades.
- Borrar todos los mocks del proyecto: se retiran del recorrido operativo de paradas.
- Resetear datos compartidos, publicar o crear commits sin solicitud.

## Dependencias y fuentes

- [AGENTS.md](../../AGENTS.md), §§4, 8–11, 15–22 y 25–28; [frontend/AGENTS.md](../../frontend/AGENTS.md).
- [ADR-006](../adr/006-route-lifecycle-and-stop-iterator.md), [ADR-007](../adr/007-delivery-attempts-evidence-and-final-lifecycle.md) y [ADR-008](../adr/008-route-closure-and-manifest-reconciliation.md).
- Planes [DELIVERY-01](delivery-01.md), [ROUTE-01](route-01.md), [ROUTE-CLOSE-01](route-close-01.md) y [UI-01 a UI-04](ui-01-04.md); informes de los módulos backend y [runbook demo](../demo/mvp-demo.md).
- Fuentes vigentes: controladores/DTOs/casos de uso de `backend/src/modules/deliveries/` y `backend/src/modules/routes/`; clientes, router y pantallas actuales en `frontend/src/`.
- El estado y los conteos de pruebas de documentos anteriores son evidencia histórica. No se consideran una ejecución actual.

## Diagnóstico actual

Árbol inicialmente limpio en `develop`, commit `de6ce27`. Existen backend de entregas/cierre, suites y migración `20261007010000_route_closure_and_reconciliation`. No se necesita otra migración para este alcance.

`frontend/src/app/mi-ruta/paradas/[stopId]/StopPage.tsx` obtiene una ruta de `mockData.ts` y simula el resultado con `setTimeout(700)`. `RouteOperations.tsx` prepara, inicia, interrumpe y cancela; no cierra. El detalle real está en `frontend/src/app/rutas/[routeId]/RouteDetailPage.tsx`: lista paradas sin enlace a su ejecución. `routesApi.ts` **ya tiene** `getRouteSummary`; debe reutilizarse y tiparse, no duplicarse.

Brechas que condicionan la implementación:

1. `apiFetch` añade JSON a cualquier body; debe distinguir `FormData` y dejar al navegador generar el boundary multipart.
2. Un éxito exige al menos una evidencia `PHOTO` o `SIGNATURE`. Fallos admiten `RECIPIENT_ABSENT`, `ADDRESS_NOT_FOUND`, `RECIPIENT_REFUSED`, `ACCESS_RESTRICTED`, `DAMAGED_PACKAGE`, `OTHER`; `OTHER` exige notas.
3. El manifiesto actual expone `routeId`, `view` y paradas con `stopId`, `stopNumber`, `state`, coordenadas y `packageIds`. Incluye asignaciones ACTIVE y ENDED, pero no el resultado individual ni `assignmentId`/recepción. La lectura se amplía para recuperar estado real tras recargar y seleccionar carga pendiente sin inventar IDs. El endpoint de paquetes no es un sustituto: no concede lectura al permiso de mensajero por sí solo.
4. Cerrar exige `Idempotency-Key` UUID y permiso `COORDINATE_ROUTES`. `FORCED` exige motivo y notas. La recepción requiere `depotReceipt: { depotId, physicalReceiptConfirmed, assignmentIds }`; no basta un checkbox ni puede deducirse una asignación del ID del paquete.
5. `GET /routes/:id/summary` devuelve conflicto antes de COMPLETED y proyecta datos según el actor. Su error no debe quedar oculto como un resumen vacío.
6. Vitest usa pruebas de cliente y renderizado estático; no sustituye un ensayo interactivo de navegador.

## Plan verificable

`USER` identifica trabajo conceptual. El pedido posterior «sigue con la implementación del plan» autoriza a Codex a ejecutar también ese trabajo en esta invocación; no cambia las responsabilidades de futuras invocaciones del skill. Los lotes documentales son `CODEX_MECHANICAL`.

| Paso | Fase | Responsable | Estado | Objetivo | Aceptación | Evidencia |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Contratos y API | `USER` | `IN_PROGRESS` | Cliente de entregas, multipart y cierre; lectura aditiva | Peticiones reales tipadas, sesión y claves idempotentes; proyección suficiente para recarga y recepción | Auditoría estática; implementación pendiente |
| 2 | Parada real | `USER` | `TODO` | Cargar manifiesto y registrar llegada | Parámetros válidos, paquetes reales, estados explícitos; GET no produce mutaciones | — |
| 3 | Intentos e incidentes | `USER` | `TODO` | Éxito con evidencia, fallo tipificado e incidente | Resultado individual persistido, replay seguro y parada multipaquete coherente | — |
| 4 | Cierre operativo | `USER` | `TODO` | Formulario REGULAR/FORCED y recepción | Carga recibida seleccionada explícitamente; COMPLETED y resumen confirmado por API | — |
| 5 | Navegación | `USER` | `TODO` | Enlazar detalle y ejecución | URL profunda, retorno y recarga conservan ruta y datos actuales | — |
| 6 | Verificación y cierre | `USER` | `TODO` | Pruebas, build, integración y documentación | Evidencia actual, aislamiento y retirada de simulación operativa | — |

### Detalle de los pasos posteriores

**Paso 2 — Manifiesto y llegada.** Depende de 1. Archivos: `frontend/src/app/mi-ruta/paradas/[stopId]/StopPage.tsx`, cliente y pruebas de la misma feature. Leer `routeId` de query y `stopId` del router; validar pertenencia en el manifiesto, consultar detalle para etiquetas disponibles y mostrar solo datos recibidos. La llegada se registra con botón explícito y clave propia; no se ejecuta desde un efecto de carga. Comprobar ausencia de parámetros, parada ajena, 401/403/404, manifiesto vacío y error de red. Lote mecánico posible: imports y eliminación acordada de referencias simuladas. Salida: llegada confirmada por servidor y paquetes de la parada real; evidencia en informe. Pendiente inicial: toda la conexión.

**Paso 3 — Resultados por paquete e incidente.** Depende de 1–2. Archivos: `StopPage.tsx`, formulario extraído de la feature, `deliveriesApi.ts` y sus pruebas. Seleccionar resultado por paquete; éxito con `photo` o `signature` JPEG/PNG/WebP y notas opcionales; fallo con catálogo cerrado y notas obligatorias para OTHER. Enviar `FormData`, impedir doble envío, mantener clave y contenido al reintentar una petición incierta. Refrescar manifiesto y no ofrecer otro intento para un paquete ya resuelto. Incidente independiente con tipo/descripción y IDs de ruta/parada, sin cambiar por sí mismo el resultado del paquete. Verificar multipart, errores semánticos, recarga parcial multipaquete y replay. Lote mecánico posible: propagar catálogo acordado y fixtures; no definir políticas. Salida: ningún éxito local sin confirmación remota; evidencia de cada variante. Pendiente inicial: formularios y pruebas.

**Paso 4 — Cerrar ruta.** Depende de 1 y lectura de carga. Archivos: `frontend/src/app/rutas/RouteOperations.tsx`, formulario de cierre extraído, `routesApi.ts`, detalle de ruta y pruebas. Ofrecer cierre a coordinación en IN_PROGRESS/INTERRUPTED. REGULAR y FORCED comparten recepción explícita de asignaciones ACTIVE aún no recibidas; FORCED añade motivo/notas. Usar depósito real de la ruta; si no existe, solicitar un ID válido de depósito y dejar validación de pertenencia al backend. No preconfirmar custodia. Mantener clave en reintento del mismo comando; contenido modificado crea una operación nueva. Recargar detalle y resumen después del cierre; mostrar errores del resumen con reintento. Verificar 409 por pendientes/custodia, cierre forzado, permiso denegado y replay. Lote mecánico posible: wiring/exports de formularios definidos. Salida: balance del snapshot visible y operaciones cerradas en COMPLETED. Pendiente inicial: acción/formulario y pruebas.

**Paso 5 — Enlaces y retorno.** Depende de 2–4. Archivos: `frontend/src/app/rutas/[routeId]/RouteDetailPage.tsx`, `frontend/src/app/mi-ruta/paradas/[stopId]/StopPage.tsx` y, solo si resulta necesario, `frontend/src/routes.tsx`/`MyRoutePage.tsx`. Enlazar a `/app/mi-ruta/paradas/:stopId?routeId=:routeId`, conservar la ruta al volver y consultar datos nuevamente. No confundir `user.id` con `courierId`. Mantener consulta de rutas cerradas sin formularios de mutación. Verificar navegación directa, retorno, recarga y rechazo de IDs cruzados. Lote mecánico posible: sustitución de enlaces con mapa aprobado. Salida: recorrido continuo sin mocks ni pérdida de contexto; evidencia de navegación. Pendiente inicial: enlaces operativos.

**Paso 6 — Comprobar y documentar.** Depende de 1–5. Archivos: pruebas colocalizadas frontend, suites backend de manifiesto/HTTP, este plan y su informe. Ejecutar mediante Compose `npm test`, `npm run build` y `npm run lint` del frontend; backend afectado, build y runners DELIVERY-01/ROUTE-CLOSE-01 en PostGIS desechable. Ensayar ruta completa, resultados mixtos, cierre con recepción, acceso entre tenants y error/reintento. Registrar separadamente lo implementado, probado, documentado y confirmado en commit. Buscar `mockData`, `ROUTES` y `setTimeout` en la feature: su ausencia solo demuestra retiro estático de simulación. Lote mecánico: consolidar evidencia y enlaces. Salida: aceptación funcional y verificaciones aplicables satisfechas; si falta ensayo visual, conservar TESTING y explicarlo. Pendiente inicial: todas las verificaciones actuales.

## Paso actual

### Paso 1 — Contratos y cliente API de entregas y cierre

- **Por qué:** las pantallas necesitan contratos reales y transporte multipart antes de conectar mutaciones. La recepción y la recarga requieren una pequeña ampliación de lectura, sin cambiar las reglas backend.
- **Debe aplicar el usuario:**
  1. Mantener los comandos existentes: `GET /deliveries/routes/:routeId/manifest?view=all`, `POST /deliveries/routes/:routeId/stops/:stopId/attend`, `POST /deliveries/routes/:routeId/stops/:stopId/packages/:packageId/successful-attempts` y `failed-attempts`, `POST /deliveries/incidents`, `POST /routes/:id/close`, `GET /routes/:id/summary`. El prefijo `/api/v1` lo aporta el cliente compartido.
  2. Extender de forma aditiva el manifiesto con paquetes y sus asignaciones/estado/recepción, filtrados por tenant y parada; conservar `packageIds` para compatibilidad. Llevar el contrato al puerto interior y adaptar Prisma y dobles, conservando el Iterator en aplicación.
  3. Crear `deliveriesApi.ts` sin importar dominio backend ni recibir identidad/tenant del formulario. Usar `credentials: include`, `ApiError`, fechas ISO y motivos tipados.
  4. Corregir el transporte de `FormData`; mantener JSON para las otras llamadas. Reutilizar `getRouteSummary`, añadir `closeRoute` y tipar sus resultados.
  5. Generar `crypto.randomUUID()` una vez por comando lógico en el formulario; pasar la clave al cliente y conservarla ante fallo de red. No generar una clave diferente en cada reintento.
- **Archivos esperados:**
  - `frontend/src/app/mi-ruta/deliveriesApi.ts` y `deliveriesApi.spec.ts` (nuevos).
  - `frontend/src/shared/api/httpClient.ts` y `httpClient.spec.ts` (prueba nueva).
  - `frontend/src/app/rutas/routesApi.ts` y `routesApi.spec.ts`.
  - `backend/src/modules/deliveries/application/ports/delivery-unit-of-work.ts` y `application/use-cases/get-delivery-manifest.use-case.ts`.
  - `backend/src/modules/deliveries/infrastructure/persistence/prisma-delivery-unit-of-work.ts`, dobles y pruebas del manifiesto.
- **Lote mecánico disponible para Codex:** sincronizar tipos, imports y fixtures una vez definido el contrato; documentación de evidencia. La instrucción actual autoriza además la implementación principal.
- **Verificación:** desde la raíz, con servicios activos:

  ```bash
  docker compose ps
  docker compose exec -T frontend npm test -- src/app/mi-ruta/deliveriesApi.spec.ts src/shared/api/httpClient.spec.ts src/app/rutas/routesApi.spec.ts
  docker compose exec -T frontend npm run build
  docker compose exec -T backend npm test -- --runInBand --testPathPatterns=deliveries
  docker compose exec -T backend npm run build
  ```

- **Criterio de salida:** cliente probado con JSON y multipart, sin cabeceras manuales de identidad; contratos de lectura implementados y probados; errores semánticos conservados. Devolver resultado de comandos y archivos modificados para registrar evidencia.

## Decisiones

| Fecha | Decisión | Motivo | Consecuencia |
| --- | --- | --- | --- |
| 2026-11-08 | Pasar `routeId` por `?routeId=...` | Mantener ruta de navegación existente y soportar URL profunda | Validar parámetros y pertenencia en servidor; no inferir ruta desde mocks |
| 2026-11-08 | Input de archivo simple para foto o firma | Evidencia funcional sin dependencias adicionales | No canvas; al menos un archivo para éxito |
| 2026-11-08 | UUID por comando lógico, estable en reintento | Recuperar respuesta perdida sin repetir efectos | Una operación modificada usa otra clave |
| 2026-11-08 | Ampliar lectura del manifiesto preservando `packageIds` | Los contratos actuales no permiten recarga por paquete ni selección de custodia | Ajuste backend aditivo dentro del alcance autorizado de implementación |
| 2026-11-08 | Backend determina reglas, permisos y cierre | Evitar duplicar dominio en frontend | La UI orienta y muestra rechazos del servidor |
| 2026-11-08 | Recepción física explícita, sin selección automática afirmativa | La llegada de carga requiere confirmación humana | No enviar `physicalReceiptConfirmed: true` por defecto |
| 2026-11-08 | Vitest más integración y ensayo visual separado | Un test con fetch simulado no acredita persistencia ni interacción real | Informar límites de cada evidencia |

## Bitácora de progreso

| Fecha | Paso | Cambio observado | Verificación | Commit |
| --- | --- | --- | --- | --- |
| 2026-11-08 | Auditoría inicial | Árbol limpio; contratos/pantallas/ADRs inspeccionados, brechas de multipart y manifiesto identificadas | Lectura de código e historial; servicios Compose activos comprobados | Base `de6ce27` |
| 2026-11-08 | Alcance | El usuario pide continuar con la implementación del plan; se crea rama enfocada | `codex/ui-delivery-01`; sin código modificado todavía | Sin commit nuevo |

## Cierre

- [ ] Aceptación funcional satisfecha: llegada, éxito/evidencia, fallo/incidente y cierre REGULAR/FORCED con recepción.
- [ ] Sin simulación en operación de paradas; recarga y navegación coherentes.
- [ ] Pruebas relevantes, build y lint frontend aprobados; backend afectado verificado.
- [ ] Aislamiento por tenant y acceso a ruta/parada ajenas comprobados.
- [ ] Lectura aditiva verificada; migración nueva no necesaria.
- [ ] Informe actualizado por cada punto con evidencia vigente.
- [ ] Ensayo visual y límites registrados explícitamente.
- [ ] Trabajo fuera de alcance documentado.
- [ ] Estado del plan contrastado con repositorio; commits identificados si existen.
