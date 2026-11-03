# Auditoría de integración frontend–API

Fecha de auditoría: 2026-10-13

Alcance: rutas activas de `frontend/src/routes.tsx`, controladores registrados por `backend/src/app.module.ts` y árbol de trabajo actual.

Plan relacionado: [`docs/plans/ui-01-04.md`](../plans/ui-01-04.md)

Revalidación del demo y del entorno: [DEMO-01, 2026-10-13](../demo/demo-01-report.md). Builds y pruebas actuales pasan; entregas/cierre web y notificaciones siguen pendientes.

## Resumen ejecutivo

- El backend publica **52 endpoints de negocio bajo `/api/v1`** y un endpoint raíz de salud.
- **35 endpoints** son consumidos por alguna ruta activa del frontend.
- **17 endpoints** existen, pero ninguna pantalla activa los consume todavía.
- De las 15 pantallas privadas activas: 12 consumen datos reales de forma principal y 3 usan datos simulados.
- El rastreo público sigue completamente simulado.
- El portal legado bajo `/empresa` fue retirado de la navegación; sus archivos con mocks permanecen en el árbol, pero no son rutas activas.
- La configuración de ejemplo y Docker Compose usan `VITE_USE_MOCK_DATA=false`; el registro activo obtiene sus catálogos desde la API.

## Estado de las pantallas activas

| Pantalla | Ruta | Estado | Fuente actual | Pendiente principal |
| --- | --- | --- | --- | --- |
| Login y sesión | `/login` | API real | `/auth/login`, `/platform/login`, `/auth/me`, `/auth/logout` | Separar mejor capacidades de tenant y plataforma si crece el flujo |
| Listado de paquetes | `/app/paquetes` | API real | `GET /packages` | Lectura habilitada para recepción, clasificación, coordinación y administración del tenant |
| Registro de paquete | `/app/paquetes/nuevo` | API real | `POST /packages`, `GET /zones`, `GET /zones/:id/sectors`, `GET /shipment-types` | Sin IDs codificados ni generadores demo en el flujo activo |
| Detalle de paquete | `/app/paquetes/:packageId` | API real | `GET /packages/:id` | Presenta únicamente los datos disponibles en el contrato actual |
| Clasificación | `/app/clasificacion` | API real | `GET /packages?state=REGISTERED`, `POST /packages/:id/classify`, `GET /zones`, `GET /zones/:id/sectors` | Conectado sin `mockData.ts` |
| Pendientes de asignación | `/app/pendientes` | API real | `GET /routes/planning/workspace`, `POST /routes/planning/routes/:id/replan` | Implementado localmente; falta validación integrada y commit |
| Planificación | `/app/planificacion` | API real | `GET /routes/planning/workspace`, `POST /routes/planning/plan-and-assign`, `POST /routes/planning/routes/:id/replan` | Implementado localmente; falta validación integrada y commit |
| Listado de rutas | `/app/rutas` | API real | `GET /routes` | Mostrar nombres operativos en vez de UUID cuando existan catálogos |
| Detalle de ruta | `/app/rutas/:routeId` | API real con acciones por permiso | `GET /routes/:id`, `POST /routes/:id/prepare`, `POST /routes/:id/start`, `POST /routes/:id/interrupt`, `POST /routes/:id/cancel`, `GET /routes/:id/summary` | Preparar/replanificar/cancelar requieren COORDINATE_ROUTES; iniciar/interrumpir admiten OPERATE_DELIVERIES; el backend valida permisos y pertenencia. Mensajero en PLANNED ve aviso de preparación pendiente |
| Mi ruta | `/app/mi-ruta` | API real | `GET /routes` y detalle `/app/rutas/:routeId` | Lista paginada derivada de sesión; muestra rutas planificadas y activas, carga, 401, 403 y errores; vacío solo tras respuesta correcta |
| Resultado de parada | `/app/mi-ruta/paradas/:stopId` | Mock | `ROUTES` y temporizador | Conectar atender, entrega exitosa/fallida, evidencia e incidentes |
| Notificaciones | `/app/notificaciones` | Mock | `NOTIFICATIONS` | Falta módulo HTTP de notificaciones y marcar leídas |
| Usuarios | `/app/admin/usuarios` | API real | cinco endpoints `/users` | Sin brecha principal observada en el cliente |
| Vehículos | `/app/admin/vehiculos` | API real | `GET /vehicles`, `POST /vehicles`, `GET /vehicles/:id`, `PATCH /vehicles/:id`, `PATCH /vehicles/:id/status` | Listado, alta, capacidades, detalle, edición y estado; selección automática sin exigir turnos |
| Mensajeros | `/app/admin/mensajeros` | API real | `GET /couriers`, `GET /couriers/eligible-users`, `GET /couriers/:id`, `POST /couriers`, `PATCH /couriers/:id/status` | Vinculación a usuario activo, listado, detalle, compromiso y estado auditados; selección automática sin exigir turnos |
| Empresas SaaS | `/app/admin/empresas` | API real parcial | `POST /platform/tenants` | Solo aprovisiona; falta listado/estado si se quiere administración completa |
| Rastreo público | `/track` | Mock | `PACKAGES` | Falta endpoint público seguro por identificador no sensible |

El contador de notificaciones del `AppShell` también usa `NOTIFICATIONS`, aunque la sesión y la navegación ya son reales.

## Inventario de endpoints existentes

Todos los endpoints de negocio usan el prefijo `/api/v1`. La columna “Uso activo” solo cuenta componentes alcanzables desde `frontend/src/routes.tsx`; tests y componentes no montados no cuentan como integración de runtime.

### Plataforma, autenticación y usuarios

| API | Uso activo | Consumidor | Observación |
| --- | --- | --- | --- |
| `POST /auth/login` | Sí | `frontend/src/auth.tsx` | Login de tenant |
| `POST /auth/logout` | Sí | `frontend/src/auth.tsx` | Cierra también la sesión local |
| `GET /auth/me` | Sí | `frontend/src/auth.tsx` | Hidrata identidad, roles y permisos |
| `POST /platform/login` | Sí | `frontend/src/auth.tsx` | Login de superadministrador |
| `POST /platform/tenants` | Sí | `AdminTenantsPage.tsx` | Aprovisionamiento; no hay listado de tenants |
| `GET /users` | Sí | `AdminUsersPage.tsx` | Lista empleados del tenant |
| `GET /users/roles` | Sí | `AdminUsersPage.tsx` | Catálogo de roles del tenant |
| `POST /users` | Sí | `AdminUsersPage.tsx` | Crea empleado |
| `PATCH /users/:id/status` | Sí | `AdminUsersPage.tsx` | Activa/desactiva empleado |
| `PATCH /users/:id/roles` | Sí | `AdminUsersPage.tsx` | Actualiza roles |

### Paquetes y catálogos

| API | Uso activo | Consumidor | Observación |
| --- | --- | --- | --- |
| `GET /packages` | Sí | `PackagesListPage.tsx`, `ClassificationPage.tsx` | Admite filtro opcional `?state=REGISTERED` |
| `GET /packages/:packageId` | Sí | `PackageDetailPage.tsx` | Sin fallback a fixtures |
| `POST /packages` | Sí | `NewPackagePage.tsx` | Envía identificadores seleccionados desde catálogos reales |
| `POST /packages/:packageId/classify` | Sí | `ClassificationPage.tsx` | Transición `REGISTERED` → `CLASSIFIED` con asignación de zona/sector |
| `GET /zones` | Sí | `NewPackagePage.tsx`, `ClassificationPage.tsx` mediante `catalogApi.ts` | Catálogo tenant-scoped |
| `POST /zones` | No | — | Sin UI administrativa |
| `GET /zones/:zoneId` | No | — | Sin consumidor |
| `GET /zones/:zoneId/sectors` | Sí | `NewPackagePage.tsx`, `ClassificationPage.tsx` mediante `catalogApi.ts` | Se consulta al seleccionar una zona |
| `POST /zones/:zoneId/sectors` | No | — | Sin UI administrativa |
| `GET /zones/:zoneId/sectors/:sectorId` | No | — | Sin consumidor |
| `GET /shipment-types` | Sí | `NewPackagePage.tsx` mediante `catalogApi.ts` | Solo se muestran tipos activos |
| `POST /shipment-types` | No | — | Sin UI administrativa |
| `GET /shipment-types/:id` | No | — | Sin consumidor |

### Recursos, planificación y rutas

| API | Uso activo | Consumidor | Observación |
| --- | --- | --- | --- |
| `GET /vehicles` | Sí | `AdminVehiclesPage.tsx` mediante `vehiclesApi.ts` | Listado paginado y filtrado con capacidad derivada y `MANAGE_TENANT` |
| `POST /vehicles` | Sí | `AdminVehiclesPage.tsx` mediante `vehiclesApi.ts` | Alta con errores por campo y actualización del listado |
| `GET /vehicles/:vehicleId` | Sí | `VehicleEditor.tsx` mediante `vehiclesApi.ts` | Detalle con capacidad y compromiso |
| `PATCH /vehicles/:vehicleId` | Sí | `VehicleEditor.tsx` mediante `vehiclesApi.ts` | Edición parcial con validación de carga y auditoría atómica |
| `PATCH /vehicles/:vehicleId/status` | Sí | `VehicleEditor.tsx` mediante `vehiclesApi.ts` | Estado protegido frente a compromiso y auditado |
| `GET /couriers` | Sí | `AdminCouriersPage.tsx` mediante `couriersApi.ts` | Paginación, búsqueda por correo, estado y compromiso |
| `GET /couriers/eligible-users` | Sí | `AdminCouriersPage.tsx` mediante `couriersApi.ts` | Directorio mínimo de usuarios activos no vinculados; no requiere administrar empleados |
| `GET /couriers/:courierId` | Sí | `CourierEditor` mediante `couriersApi.ts` | Cuenta, estado operativo, asignaciones activas y rutas sin cerrar |
| `POST /couriers` | Sí | `AdminCouriersPage.tsx` mediante `couriersApi.ts` | Alta existente ahora con elegibilidad y auditoría en una transacción |
| `PATCH /couriers/:courierId/status` | Sí | `CourierEditor` mediante `couriersApi.ts` | Inactivación protegida y reactivación con usuario activo; auditoría atómica |
| `GET /routes/planning/workspace` | Sí | `PlanningPage.tsx`, `PendingAssignmentsPage.tsx` mediante `planningApi.ts` | Publica recursos, candidatos y rutas `PLANNED` editables con `COORDINATE_ROUTES` |
| `POST /routes/planning/plan-and-assign` | Sí | `PlanningPage.tsx` mediante `planningApi.ts` | La planificación solo se ejecuta por acción del coordinador |
| `POST /routes/planning/routes/:routeId/replan` | Sí | `PlanningPage.tsx`, `PendingAssignmentsPage.tsx` mediante `planningApi.ts` | Solo acepta rutas `PLANNED` editables y registra asignaciones manuales |
| `GET /routes` | Sí | `RoutesListPage.tsx` mediante `routesApi.ts` | Listado real paginado |
| `GET /routes/:id` | Sí | `RouteDetailPage.tsx` mediante `routesApi.ts` | Detalle real; existe `routeDetailApi.ts` duplicado y no usado por runtime |
| `POST /routes/:id/prepare` | Sí | `RouteDetailPage.tsx` | Confirma depósito y congela el manifiesto al pasar a `READY` |
| `POST /routes/:id/start` | Sí | `RouteOperations` en `RouteDetailPage` | Acción para rutas READY con `COORDINATE_ROUTES` u `OPERATE_DELIVERIES` |
| `POST /routes/:id/cancel` | Sí | `RouteDetailPage.tsx` | Acción disponible para rutas cancelables |
| `POST /routes/:id/interrupt` | Sí | `RouteOperations` en `RouteDetailPage` | Acción para rutas IN_PROGRESS con validación de permisos en backend |
| `POST /routes/:id/close` | No | — | Backend implementado, falta acción UI e idempotency key |
| `GET /routes/:id/summary` | Sí | `RouteDetailPage.tsx` | Resumen mostrado junto al detalle operativo |

### Ejecución de entregas

| API | Uso activo | Consumidor | Observación |
| --- | --- | --- | --- |
| `GET /deliveries/routes/:routeId/manifest` | No | — | Mi ruta ya descubre rutas por sesión; falta integrar manifiesto y operación de paradas |
| `POST /deliveries/routes/:routeId/stops/:stopId/attend` | No | — | Falta UI y cabecera de idempotencia |
| `POST /deliveries/routes/:routeId/stops/:stopId/packages/:packageId/successful-attempts` | No | — | Admite foto/firma multipart; UI no lo usa |
| `POST /deliveries/routes/:routeId/stops/:stopId/packages/:packageId/failed-attempts` | No | — | UI simula el fallo |
| `POST /deliveries/packages/:packageId/reschedules` | No | — | Sin UI |
| `POST /deliveries/packages/:packageId/return-requests` | No | — | Sin UI |
| `POST /deliveries/packages/:packageId/depot-receptions` | No | — | Sin UI |
| `POST /deliveries/incidents` | No | — | Sin UI |

### Infraestructura

| API | Uso activo | Observación |
| --- | --- | --- |
| `GET /` | No | Endpoint de salud/version-neutral; no es una funcionalidad de UI |

RabbitMQ, worker, Outbox, consumidor idempotente y DLQ existen como infraestructura, pero no son APIs HTTP consumidas por el frontend. El esquema contiene `Notification` y `NotificationTemplate`, pero no existe un módulo HTTP/worker funcional de notificaciones observado en `backend/src/modules`.

## Brechas de seguridad y contrato antes de conectar más UI

1. **Resuelto localmente (Bloque 1):** `ZonesController`, `ShipmentTypesController` y `DeliveriesController` ya aplican `AuthGuard` y `PermissionsGuard`, y se retiró el fallback legado de cabeceras `x-tenant-id`/`x-user-id` en `extractRequestContext`.
2. **Resuelto localmente (Bloque 1):** `PackagesController` acepta `REGISTER_PACKAGES`, `CLASSIFY_PACKAGES`, `COORDINATE_ROUTES` o `MANAGE_TENANT` para listar y consultar paquetes.
3. **Resuelto localmente (Bloque 1):** `RoutesController` permite `COORDINATE_ROUTES` u `OPERATE_DELIVERIES` en consulta, inicio, interrupción y resumen de ruta, y los adaptadores de acceso verifican también códigos `rolePermissions`.
4. **Resuelto localmente (Bloque 1):** `routeDetailApi.ts` ya no envía `x-tenant-id` ni `x-user-id` y usa sesión `credentials: 'include'`.
5. **Resuelto localmente (Bloques 4 y 5):** `GET /api/v1/routes/planning/workspace` publica los `GeoDataset` `READY` y `PlanningPage` consume el `datasetId` real junto con los recursos tenant-scoped.

## APIs que faltan para completar el flujo

| Capacidad faltante | Contrato HTTP sugerido | Pantallas dependientes |
| --- | --- | --- |
| Administración de depósitos | Listado/alta/edición de depósitos; turnos pospuestos según ADR 010 | Administración operativa |
| Operación de paradas del mensajero | La lista Mi ruta ya usa identidad autenticada; falta conectar la pantalla de resultado de parada | Resultado de parada |
| Notificaciones internas | Listar, contar no leídas y marcar leídas | AppShell, notificaciones |
| Rastreo público seguro | Consulta por identificador público que omita PII e información interna | Rastreo público |
| Administración SaaS completa | Listar tenants y activar/desactivar, si entra en el alcance de la demo | Empresas SaaS |

## Orden recomendado de implementación

1. **Cerrar autenticación y permisos de APIs existentes (COMPLETADO).** Proteger catálogos y entregas, corregir permisos de lectura de paquetes e inicio de ruta y retirar cabeceras de identidad heredadas.
2. **Consolidar el registro de paquetes (COMPLETADO).** Elegir una sola pantalla (`NewPackagePage`), conectar zonas/sectores/tipos reales (`catalogApi.ts`), eliminar IDs codificados y fallback de fixtures en detalle/listado, y desactivar `VITE_USE_MOCK_DATA` en el flujo normal.
3. **Implementar clasificación real (COMPLETADO).** `POST /api/v1/packages/:packageId/classify`, filtro `?state=REGISTERED` en `GET /api/v1/packages` y conexión de `ClassificationPage` a API real sin `mockData.ts`.
4. **Publicar recursos y rutas editables de planificación (COMPLETADO).** `GET /api/v1/routes/planning/workspace` con zonas, depósitos, datasets `READY`, vehículos/mensajeros elegibles con capacidad y sin rutas coincidentes; no exige turnos, paquetes candidatos y rutas `PLANNED` editables.
5. **Conectar planificación, pendientes y acciones de ruta (IMPLEMENTADO LOCALMENTE; EN PRUEBAS).** Crear/recalcular propuesta, recuperar pendientes manualmente, revisar, preparar y cancelar antes de despacho.
6. **Conectar el portal del mensajero.** Descubrir su ruta, iniciar, atender paradas, registrar entrega/fallo/evidencia e incidentes.
7. **Implementar notificaciones y rastreo público.** Requieren APIs nuevas; no deben seguir leyendo `mockData.ts`.
8. **Completar administración de recursos (EN PROGRESO).** Vehículos y mensajeros conectados con listado/detalle/estado; falta administración de depósitos; turnos pospuestos según ADR 010. La vinculación de mensajeros no crea cuentas ni asigna permisos de entrega.

## Limpieza posterior

- Eliminar `frontend/src/mockData.ts` cuando clasificación, pendientes, planificación, ejecución, notificaciones y rastreo público dejen de importarlo.
- Retirar wrappers y clientes de compatibilidad que no tengan consumidores cuando se confirme que ya no son necesarios.
- Mantener los archivos legados fuera del bundle/rutas o eliminarlos en un commit de limpieza separado después de confirmar que no se requieren como referencia.
