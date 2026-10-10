# Mapa de páginas del frontend SLS

Responsable: Santiago. Coordinación backend: Juanangel (AUTH/TENANT), Vivian (PKG/VEH) y Humberto (ZONE y planificación/clustering). Reparto confirmado por Humberto el 2026-09-30.

Este documento organiza la interfaz del MVP por trabajo real de cada rol. No afirma que las páginas estén implementadas: diferencia el estado observado de la propuesta y mantiene las dependencias con el backend.

Plan relacionado: [`docs/plans/ui-01-04.md`](../plans/ui-01-04.md).

## Estado observado

- **Disponible con datos simulados:** portada y registro de paquete.
- **Parcial:** registro con QR/código de barras, validación, catálogos y estados de carga/error/éxito; el contrato HTTP es provisional.
- **No disponible:** autenticación, router, navegación por rol, consulta de paquetes, planificación, rutas, ejecución, notificaciones, rastreo público y administración.
- **Bloqueo de integración:** el backend todavía no publica controladores HTTP para estos dominios.

## Navegación principal propuesta

La primera entrega debe evitar un dashboard complejo. Después de iniciar sesión, cada usuario llega a su bandeja de trabajo principal:

| Rol | Inicio recomendado | Navegación visible |
| --- | --- | --- |
| Recepción | Nuevo paquete | Paquetes, Nuevo paquete |
| Clasificación | Bandeja de clasificación | Paquetes, Clasificación |
| Coordinador de rutas | Planificación | Planificación, Pendientes, Rutas, Recursos |
| Mensajero | Mi ruta activa | Mi ruta, Historial |
| Administrador del tenant | Administración | Usuarios, Zonas, Vehículos, Mensajeros, Tipos de envío, Notificaciones |
| Superadministrador SaaS | Empresas | Empresas, Salud de plataforma, Auditoría |

No debe existir un selector libre de empresa para usuarios normales. El tenant se deriva de la sesión autenticada.

## Páginas esenciales del MVP

| Prioridad | Ruta propuesta | Página | Roles | Características principales | Dependencia | Estado |
| --- | --- | --- | --- | --- | --- | --- |
| P0 | `/login` | Iniciar sesión | Todos los internos | Credenciales, error estable, sesión expirada, redirección por rol | `AUTH-01` | No iniciada |
| P0 | `/app` | Shell privado | Todos los internos | Encabezado, navegación por rol, usuario/empresa actuales, cerrar sesión, responsive, 401/403 | `AUTH-01`, `UI-01` | No iniciado |
| P0 | `/app/packages/new` | Registrar paquete | Recepción, admin | Guía manual/QR/cámara, clasificación, medidas, prioridad, plazo, coordenadas, validación y confirmación | `PKG-01`, `ZONE-01` | Parcial con mocks |
| P0 | `/app/packages` | Paquetes | Recepción, clasificación, coordinador, admin | Búsqueda por guía, filtros por estado/zona/prioridad, paginación, vacío/error y acceso al detalle | `PKG-01` | No iniciada |
| P0 | `/app/packages/:packageId` | Detalle de paquete | Según permiso | Resumen, dirección, dimensiones, estado, asignación actual e historial cronológico; acciones permitidas por estado | `PKG-01`, `PAT-STATE-01` | No iniciada |
| P0 | `/app/classification` | Bandeja de clasificación | Clasificación, coordinador | Paquetes registrados o con datos incompletos, validar coordenadas/zona, clasificar y mostrar razón de bloqueo | `PKG-01`, `ZONE-01`, `GEO-01` | No iniciada |
| P0 | `/app/assignments/pending` | Pendientes de asignación | Coordinador | Razón de no asignación, capacidad requerida, filtros y reasignación manual sin tratarla como error técnico | `ASSIGN-01`, `VEH-01` | No iniciada |
| P0 | `/app/planning` | Planificar rutas | Coordinador | Selección de paquetes, fecha/turno, progreso asíncrono, resumen de asignados/pendientes y acceso a revisión | `ASSIGN-01`, `ROUTE-01` | No iniciada |
| P0 | `/app/routes` | Rutas | Coordinador, admin; lectura limitada para mensajero | Filtros por fecha/estado/mensajero, capacidad, progreso y acceso al detalle | `ROUTE-01` | No iniciada |
| P0 | `/app/routes/:routeId` | Revisión y detalle de ruta | Coordinador, admin | Paradas ordenadas, mapa o lista, peso/volumen, vehículo, mensajero, corrección manual, preparar, iniciar y cerrar según estado | `ROUTE-01`, `ROUTE-CLOSE-01` | No iniciada |
| P0 | `/app/my-route` | Mi ruta | Mensajero | Ruta asignada, siguiente parada, progreso, iniciar/continuar ruta y funcionamiento responsive | `ROUTE-01` | No iniciada |
| P0 | `/app/my-route/stops/:stopId` | Ejecutar parada | Mensajero | Datos mínimos del destinatario, marcar entrega/fallo, observación, evidencia, incidente y siguiente parada | `DELIVERY-01` | No iniciada |
| P0 | `/app/notifications` | Notificaciones | Todos los internos | Leídas/no leídas, estado pendiente/enviada/fallida cuando aplique, enlace a entidad y aislamiento por tenant | `NOTIF-01` | No iniciada |
| P0 | `/track` | Rastreo público | Público | Consulta por identificador seguro, estado comprensible y línea de tiempo limitada, sin información interna ni PII innecesaria | `PKG-01`, `UI-04` | No iniciada |

## Administración necesaria

Estas páginas son necesarias para operar el producto, aunque no estén desglosadas en `UI-01` a `UI-04`. Deben construirse después del primer flujo vertical, no antes.

| Ruta propuesta | Página | Características | Dependencia |
| --- | --- | --- | --- |
| `/app/admin/users` | Usuarios y roles | Invitar/activar/desactivar, asignar rol, filtrar; sin otorgar permisos fuera del tenant | `AUTH-01`, `TENANT-01` |
| `/app/admin/zones` | Zonas y sectores | Listado y formulario, estado activo, relación sector-zona | `ZONE-01` |
| `/app/admin/vehicles` | Vehículos | Capacidad de peso/volumen, disponibilidad, estado y edición | `VEH-01` |
| `/app/admin/couriers` | Mensajeros | Usuario asociado, disponibilidad, turnos y estado | `VEH-01` |
| `/app/admin/shipment-types` | Tipos de envío | Nombre, código, restricciones y estado activo | Catálogo de envíos |
| `/app/admin/tenants` | Empresas | Activación y estado; solo superadministrador y con auditoría | `TENANT-01`, `AUDIT-01` |

Las plantillas de notificación son opcionales para el MVP. Si se implementan, pueden ser una pestaña de configuración y no una página independiente.

## Qué no necesita una página propia

Para mantener el MVP manejable, estas funciones se resuelven dentro de una página existente:

- **Historial de estados:** pestaña del detalle del paquete.
- **Reasignación manual:** panel o diálogo desde pendientes o detalle de ruta.
- **Crear/editar zona, vehículo o mensajero:** formulario lateral o diálogo desde su listado.
- **Registrar entrega, fallo o incidente:** flujo de la parada activa.
- **Resumen de cierre:** sección y diálogo de confirmación en el detalle de ruta.
- **Sin permiso, no encontrado y error inesperado:** vistas transversales del router.

## Estados obligatorios por página

Cada página conectada a datos debe contemplar, según corresponda:

1. Carga inicial y actualización en progreso.
2. Estado vacío con una acción útil.
3. Error recuperable con reintento.
4. Validación por campo y error de dominio con código estable.
5. Sesión vencida (`401`) y permiso denegado (`403`).
6. Éxito y confirmación para acciones sensibles.
7. Proceso asíncrono: pendiente, procesando, completado o fallido.

La UI puede ocultar acciones no permitidas para mejorar la experiencia, pero el backend siempre debe volver a autorizar la operación.

## Orden de implementación recomendado

1. **Base navegable (`UI-01`):** router, sesión, shell, navegación por rol y vistas 401/403/404.
2. **Recepción vertical (`UI-02`):** integrar el registro actual y añadir listado y detalle de paquetes.
3. **Clasificación y pendientes (`UI-02`):** cerrar el paso de `REGISTERED` a `CLASSIFIED` o `PENDING_ASSIGNMENT`.
4. **Planificación y coordinación (`UI-03`):** planificación, pendientes, listado y detalle de rutas.
5. **Ejecución del mensajero (`UI-03`):** mi ruta, parada activa, entrega/fallo/evidencia/incidente y cierre.
6. **Comunicación (`UI-04`):** bandeja de notificaciones y rastreo público seguro.
7. **Administración:** usuarios, zonas, vehículos, mensajeros y catálogos.
8. **Opcionales:** dashboard analítico, reportes y plantillas configurables.

## Primer corte demostrable

El corte más pequeño que aporta valor y reutiliza el trabajo existente es:

```text
Login simulado o contrato de sesión
  -> shell de recepción
  -> registrar paquete
  -> ver confirmación
  -> buscarlo en la lista
  -> abrir su detalle e historial
```

Puede diseñarse con contratos tipados y mocks mientras `AUTH-01` y `PKG-01` publican la API, pero la sustitución por integración real forma parte de la aceptación de `UI-01` y `UI-02`.
