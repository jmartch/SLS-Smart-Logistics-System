# ZONE-01 — Propuesta de contrato de catálogos

Fecha: 2026-10-01. Estado: `REVIEW`; propuesta para Humberto, sin endpoints implementados ni decisiones de negocio aprobadas. Plan: [ZONE-01](../plans/zone-01.md).

## Alcance y consumidores

Administración y consulta de Zone, Sector y ShipmentType. PKG-01 consume la interfaz pública para comprobar referencias; el frontend consume listas para recepción. Clasificación manual en este corte. Clustering, geofencing, asignación automática y borrado físico quedan fuera del contrato.

## Identidad y autorización

El tenant se obtiene exclusivamente de identidad autenticada. Los cuerpos, parámetros y consultas no aceptan tenantId para seleccionar empresa. La aplicación recibe contexto confiable mediante el contrato de TENANT-01; no expone Prisma ni tipos HTTP en sus puertos.

Propuesta de permisos: administrador del tenant consulta y administra; recepción y clasificación consultan. Coordinar con AUTH los nombres exactos de permisos y otros roles lectores. Sin sesión: 401; sin permiso: 403. Un recurso ajeno y uno inexistente producen el mismo 404. No incluir acceso implícito del superadministrador.

## Rutas propuestas

Prefijo propuesto `/api`, compatible con el contrato provisional de paquetes; confirmar conjuntamente con AUTH y frontend. Las rutas siguientes son relativas al prefijo.

| Método | Ruta | Entrada | Respuesta |
| --- | --- | --- | --- |
| GET | /zones | Sin cuerpo | 200, arreglo de ZoneOption |
| POST | /zones | code, name | 201, ZoneOption |
| GET | /zones/:zoneId | UUID de zona | 200, ZoneOption |
| PATCH | /zones/:zoneId | code y/o name | 200, ZoneOption |
| GET | /zones/:zoneId/sectors | UUID de zona | 200, arreglo de SectorOption |
| POST | /zones/:zoneId/sectors | code, name | 201, SectorOption |
| PATCH | /zones/:zoneId/sectors/:sectorId | code y/o name | 200, SectorOption |
| GET | /shipment-types | Sin cuerpo | 200, arreglo de ShipmentTypeOption activos para recepción |
| POST | /shipment-types | code, name, active opcional | 201, ShipmentTypeOption |
| PATCH | /shipment-types/:id | code, name y/o active | 200, ShipmentTypeOption |

Para administración se propone `GET /shipment-types?includeInactive=true`, reservado a quien administra el catálogo. El permiso se verifica en backend. PATCH no cambia IDs, tenant ni pertenencia de un sector a su zona; rechaza cuerpos vacíos y campos desconocidos. DELETE no se ofrece.

## Formas y ejemplos

ZoneOption: `{id, code, name}`. SectorOption: `{id, zoneId, code, name}`. ShipmentTypeOption: `{id, code, name, active}`; el campo adicional active es compatible con el lector actual de CatalogOption. IDs UUID reales; los IDs de mocks no son ejemplos válidos de persistencia.

POST /zones, ejemplo de entrada:

```json
{"code":"NORTE","name":"Zona norte"}
```

Respuesta 201:

```json
{"id":"10000000-0000-4000-8000-000000000001","code":"NORTE","name":"Zona norte"}
```

GET /zones/:zoneId/sectors, respuesta 200:

```json
[{"id":"20000000-0000-4000-8000-000000000001","zoneId":"10000000-0000-4000-8000-000000000001","code":"N-A","name":"Sector A"}]
```

Una lista sin registros devuelve `[]`. Una zona existente sin sectores devuelve `[]`; una zona inexistente o ajena devuelve 404. Propuesta de orden estable: code ascendente e id como desempate; sin paginación para este catálogo inicial.

## Reglas propuestas y decisiones pendientes

- Normalizar code mediante trim y mayúsculas; name mediante trim, conservando su escritura. Rechazar valores vacíos y tipos incorrectos. Límites confirmados por Humberto el 2026-10-01: códigos de 1–30 caracteres con A–Z, dígitos, guion y guion bajo; nombres de 1–100 caracteres después de trim. Precisar el conteo Unicode de nombres al implementar y probar.
- Código de zona y tipo de envío único por tenant; código de sector único por zona. Traducir también la colisión concurrente de la base a 409. Revisar códigos existentes antes de introducir normalización o nuevas restricciones.
- Toda relación sector–zona pertenece al mismo tenant. El caso de uso comprueba la relación; las FK compuestas existentes mantienen integridad de persistencia.
- Sector opcional. Para PKG, la propuesta admite destino sin zona como pendiente de revisión; PKG debe definir el estado y resultado concreto. No inferir CLASSIFIED ni PENDING_ASSIGNMENT por ausencia de zona. El formulario actual exige zoneId: su adaptación queda pendiente de acuerdo con Vivian y Santiago.
- ShipmentType inactivo no aparece en recepción ni se permite en registros nuevos; se conserva para consultar paquetes históricos. Coordinar con PKG la validación de activos y su consistencia ante cambios concurrentes.
- Zone y Sector no tienen active en el esquema actual. Este primer contrato propone edición sin desactivación ni borrado. Si se requiere desactivación, decidir su efecto en referencias y una migración específica antes de agregar campos.
- No reasignar automáticamente paquetes existentes al editar nombres o códigos. Cualquier reclasificación pertenece al caso de uso de paquetes.

## Errores propuestos

Formato compatible con ApiError actual: `{code, message, fields?}`. fields asocia campo con mensaje y no contiene datos del tenant ajeno.

| HTTP | code | Caso |
| --- | --- | --- |
| 400 | VALIDATION_ERROR | UUID, tipos, campos o cuerpo inválidos |
| 401 | UNAUTHENTICATED | Sesión ausente o inválida |
| 403 | FORBIDDEN | Operación sin permiso |
| 404 | CATALOG_RESOURCE_NOT_FOUND | Recurso inexistente, ajeno o sector fuera de la zona de la ruta |
| 409 | CATALOG_CODE_CONFLICT | Código normalizado duplicado en su ámbito |

Ejemplo de duplicado:

```json
{"code":"CATALOG_CODE_CONFLICT","message":"El código ya está en uso.","fields":{"code":"Utiliza otro código."}}
```

Un fallo de infraestructura no se traduce en lista vacía ni en éxito. Definir su código público junto al contrato común de errores.

## Interfaz interna y siguiente verificación

Definir puertos de consulta y persistencia propios del módulo, resultados independientes del framework y operaciones de validación de referencias que PKG pueda consumir sin consultar tablas directamente. No fijar aquí firmas de implementación sin revisar el contexto AUTH/TENANT.

Antes de pasar al dominio, Humberto revisa normalización/límites, política de activos, ausencia de zona, rutas y roles; coordina las partes compartidas con los responsables. Ejemplos de aceptación: éxito, lista vacía, duplicado normalizado, mismo código en otro tenant permitido, sector de otra zona rechazado y lectura/mutación entre tenants denegada.

Evidencia actual: inspección estática de catalog.prisma, catalogApi.ts, types.ts, httpClient.ts y planes. No se ejecutaron pruebas ni se inspeccionaron otras ramas; el contrato AUTH/TENANT no está publicado en docs/modules en esta instantánea. Esta propuesta no acredita el paso 1 como DONE.
