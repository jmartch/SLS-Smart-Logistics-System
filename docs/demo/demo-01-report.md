# DEMO-01 — auditoría de alcance y avance

Fecha: 2026-10-13. Rama: `feature/mvp-demo-flow`. Base: `4e03970` más cambios locales. Estado: **TESTING para la demo técnica; MVP completo IN_PROGRESS**.

Plan de trabajo: [DEMO-01](../plans/demo-01.md).

## Actualización: semilla y limpieza autorizadas (2026-10-13)

El usuario autorizó borrar los datos y solicitó que las semillas siguieran el
proceso actual de la página. Se completó ese cambio y se aplicó en el entorno local.
Las observaciones de datos de la auditoría inicial más abajo son históricas.

- `seed-demo.ts` conserva usuarios/roles/catálogos de arranque y crea vehículo y
  mensajero con sus servicios actuales. El candidato queda sin vincular.
- `prepare-osm-demo.ts` registra tres paquetes mediante RegisterPackageService,
  geocodifica contra OSM y conecta el grafo; conserva REGISTERED sin anticipar
  clasificación, asignación, ruta, entrega ni DLQ ficticia.
- Se retiró el dataset que se presentaba como OSM pero contenía solo un nodo
  inventado. La carga geográfica ahora usa únicamente el extracto OSM verificado.
- `demo:seed` limpia el tenant demo; `demo:reset` limpia los datos operativos de
  todas las empresas, sesiones y geografía, conservando migraciones, permisos y
  cuentas de plataforma. Se corrigió la limpieza por dependencias de rutas,
  revisiones geográficas, notificaciones y reglas.
- Se detuvo el worker, vaciaron las seis colas locales SLS, ejecutó `demo:reset`
  y reinició el worker. No se cambió el esquema ni se eliminaron volúmenes.
- Verificación local posterior: una empresa, un administrador de plataforma
  conservado, un vehículo y un mensajero; tres paquetes REGISTERED/MATCHED, sin
  zona asignada; cero rutas/asignaciones/DLQ. Login y consultas HTTP 200.
- Workspace consultado **con fecha y ventana**: un vehículo y un mensajero
  elegibles, un dataset y un depósito; cero candidatos antes de clasificar.
  La disponibilidad debe comprobarse con ventana: el workspace sin ella no
  proporciona evidencia suficiente de disponibilidad para un horario concreto.
- Tres eventos PackageRegistered PUBLISHED y tres registros del consumidor
  audit.integration-events.v1 después del reinicio.

### Verificación del recorrido real

`make integration-test TEST=demo-01` (equivalente al runner en Compose con
GDB_TEST_ADMIN_URL dedicado): **una suite, tres escenarios aprobados**. El comando
incluye build backend aprobado. La base desechable se eliminó al finalizar.

1. Estado inicial, coordenadas, historia REGISTERED, eventos, flota libre,
   usuario candidato sin vincular y preparación OSM aditiva sin duplicados.
2. HTTP real: clasificar → planificar dos paquetes → dejar el tercero pendiente
   por compromiso de recursos → recuperarlo en la ruta PLANNED → preparar a READY
   → rechazar replanificación con 409. Comprueba historial, Outbox, una asignación
   activa y denegación al mensajero sin permiso de coordinación.
3. Repetir la semilla después de operar la ruta, conservar otra empresa en el
   modo por tenant y eliminarla en el reinicio global, manteniendo migraciones.

El nuevo [runbook](mvp-demo.md) describe este recorrido. Se ajustaron README,
la guía OSM, el entorno Bruno y el duplicado controlado para que no dependan de
una ruta sembrada ni de una guía que ya no existe.

Código implementado y verificado; documentación actualizada; **sin commit**.
La tarea de semillas queda completa. El ensayo visual, la operación de entregas,
notificaciones y el cierre global del MVP conservan sus pendientes.

## Alcance definido

El [runbook](mvp-demo.md) define un corte técnico: login → alta de vehículo/mensajero → registro de paquete → historial/Outbox → publicación y consumo → error controlado → ruta/mapa. La ruta del runbook está sembrada: consultarla no prueba que el paquete recién registrado haya sido clasificado, planificado o entregado.

El [guion de defensa](01-guion-defensa-tecnica.md) añade C4, Clean Architecture y evidencia de Chain, State, Iterator, Idempotent Consumer y DLQ, con duración propuesta de 12–15 minutos. No declara notificaciones/email completos.

AGENTS.md requiere un MVP mayor: registro, clasificación, planificación, revisión, despacho, intentos/entregas/fallos, reprogramación/devolución, cierre y notificaciones internas/email. La demo técnica parcial no autoriza marcar ese MVP como terminado.

## Implementación y brechas

| Capacidad | Observado en código/configuración | Pendiente |
| --- | --- | --- |
| Acceso y tenants | Sesión, guardas, permisos, RLS y pruebas de aislamiento | Revalidar recorrido integrado del escenario final |
| Paquetes y clasificación | Registro/listado/detalle y clasificación con API real; State, historial y Outbox | Resolver geocodificación de candidatos del próximo ensayo |
| Vehículos/mensajeros | Administración real; capacidad/compromisos; selección automática sin turnos obligatorios, ADR 010 | Administración de depósitos; consolidar cambios locales |
| Planificación y pendientes | Workspace, algoritmos, asignación, replanificación explícita y UI real | Prueba persistente de recuperación → preparación → rechazo de edición; cliente `planningApi` sin suite dedicada |
| Rutas y mensajero | Lista/detalle/mapa, preparar/iniciar/interrumpir/cancelar y Mi ruta reales | Acceso operativo a una parada desde el detalle; atención e intentos/evidencias/incidentes en UI |
| Entregas y cierre | Casos de uso, endpoints, migraciones y pruebas presentes en backend | `StopPage` usa `ROUTES` y temporizador; UI no invoca cierre, reprogramación ni devolución |
| Eventos | Outbox, worker, confirms, consumidor idempotente, retry/DLQ/redrive | Repetir escenario de duplicado/fallo/recuperación para la defensa actual |
| Notificaciones | Modelos; interfaz y contador con fixtures | Módulo funcional, API, consumidor, correo y deduplicación |
| Rastreo público | Pantalla con fixtures | Endpoint seguro y cliente real |

El recorrido web real llega hasta iniciar/interrumpir la ruta. La pantalla simulada de resultado puede mostrar “Entrega registrada” sin persistir una entrega; no debe usarse como evidencia funcional.

## Verificación realizada

```bash
docker compose ps
docker compose exec -T backend npm test -- --runInBand
docker compose exec -T frontend npm test
docker compose exec -T backend npm run build
docker compose exec -T frontend npm run build
docker compose exec -T rabbitmq rabbitmqctl list_queues -p sls name consumers messages_ready messages_unacknowledged
```

Resultados de esta auditoría:

- Backend: **155 suites, 1362 pruebas aprobadas**.
- Frontend: **10 archivos, 70 pruebas aprobadas**.
- Ambos builds aprobados. Frontend emite advertencia por tamaño del bundle.
- Servicios API, frontend, PostgreSQL, RabbitMQ y worker activos; broker saludable.
- Login admin `200`; `/auth/me`, `/packages`, `/vehicles`, `/couriers`, `/routes` y `/routes/planning/workspace` responden `200` con sesión. Workspace sin sesión devuelve `401`.
- Migraciones recientes de planificación, rutas, entregas, cierre y mensajería aplicadas en la base local.
- Cola principal con **un consumidor**, cero mensajes listos y cero sin confirmar. Retry 5/10/20 segundos, DLQ y cuarentena presentes.
- Tenant demo: **31 OutboxEvent PUBLISHED** y **31 ProcessedEvent** del consumidor `audit.integration-events.v1`. Estos conteos prueban actividad persistida; no prueban por sí solos ausencia de dobles efectos.

No se ejecutaron runners de integración sobre PostGIS desechable ni comandos de entrega, cierre, duplicado o redrive en esta auditoría. Las suites actuales no equivalen a un ensayo web completo. Se consultó la base sin cambiar paquetes/rutas ni ejecutar semillas; la verificación HTTP creó una sesión de demo.

## Estado concreto de los datos del demo

- Rutas: **una PLANNED y una INTERRUPTED**, con cuatro y seis asignaciones activas respectivamente. Ambas tienen ventanas del 2026-10-12.
- Paquetes: **cuatro ASSIGNED_TO_ROUTE, seis IN_TRANSIT y dos CLASSIFIED**; ninguno DELIVERED al consultar.
- Dataset OSM `329842f6-7469-4f36-8aee-ca6d6e6e373c`: **READY, 2035 nodos y 3122 conexiones dirigidas**.
- Los tres paquetes `OSM-DEMO-329842F6-*` tienen geocodificación MATCHED y ya están asignados a ruta.
- Workspace consultado sin ventana: dos vehículos/dos mensajeros, **cero elegibles**; dos candidatos de planificación, **cero con coordenadas listas**. Hay una ruta PLANNED editable.

No hay un escenario nuevo listo para demostrar inmediatamente una asignación automática exitosa. Hace falta preparar candidatos geocodificados y recursos elegibles o resolver deliberadamente los compromisos existentes. Repetir `demo:prepare:osm` conserva los estados existentes. `demo:seed` borra y recrea datos del tenant demo; no se ejecutó.

## Documentación y commits

- Avances de planificación/replanificación, flota, OSM y operaciones de ruta están en el árbol de trabajo y no todos tienen commit. El último commit observado es `4e03970`, de documentación de clasificación.
- AGENTS.md §2 y varios estados del tablero describen un estado anterior. La hoja `mvp-implementation.md` y su informe todavía presentan mensajería/cierre/acceso como pendientes aunque existe implementación posterior.
- README conserva pendientes ya implementados y referencias a fallback de fixtures en rutas; el runbook también describe un fallback que no corresponde al detalle activo actual.
- El paso 05 de Bruno consulta una ruta, no el historial del paquete recién creado. Conserva cabeceras de identidad heredadas; el backend actual obtiene identidad de la sesión y esas cabeceras no la autorizan.
- El guion es un borrador organizativo; se deben actualizar evidencias, rutas técnicas y resultados tras el ensayo final. No se localizó un PDF técnico final en el árbol del repositorio inspeccionado; no se auditó documentación externa.

## Orden de trabajo y cierre

1. Fijar y ensayar escenario reproducible de planificación/pendientes/preparación, con datos y recursos adecuados, y comprobar persistencia/tenant en entorno desechable.
2. Conectar paradas, entrega/fallo, evidencia e incidentes; añadir recuperación y cierre desde coordinación.
3. Implementar notificaciones internas/email y rastreo público seguro para completar el MVP/UI-04.
4. Alinear runbook/README/C4/documento técnico, registrar evidencia del ensayo y consolidar commits.

No hace falta añadir GPS, app móvil, optimización exacta ni gestión de turnos para este alcance. La auditoría completa su diagnóstico; la demo sigue TESTING hasta el ensayo y el MVP continúa IN_PROGRESS.
