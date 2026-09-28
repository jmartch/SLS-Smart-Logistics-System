# ADR-001: Geocodificación local y planificación geoespacial en SLS

Fecha: 2026-09-14

Estado: Propuesto para implementación incremental.

## Contexto

El usuario decidió integrar el prototipo en SLS. El esquema vigente está dividido en `backend/prisma/schema/`, configurado por `backend/prisma7.config.ts`. Ya existen paquetes, rutas, vehículos, historial, políticas RLS y `runWithTenant`. No se deben duplicar estas entidades.

El alcance requiere geocodificación propia sin proveedores externos, OSM local, Dijkstra y posteriormente A*, ventanas exactas y distribución semanal. El grafo sintético permite verificar algoritmos; no sustituye la entrega posterior sobre OSM.

## Decisión

- Crear el módulo `backend/src/modules/geospatial` con dominio TypeScript puro, casos de uso, puertos, adaptadores PostGIS/OSM y presentación NestJS.
- Mantener PostgreSQL 17 e incorporar una imagen compatible con PostGIS, fijada y probada antes de modificar Compose. No recrear ni eliminar el volumen existente.
- Gestionar los modelos desde Prisma y los detalles espaciales, índices parciales, CHECK y RLS mediante SQL revisado dentro de migraciones Prisma. No editar la migración inicial aplicada.
- Conservar kg y m³ en persistencia/API. Ampliar volumen a `Decimal(12,6)`, tanto en paquetes como en vehículos. En algoritmos convertir exactamente a gramos y cm³ enteros y validar el rango seguro de JavaScript. No efectuar comparaciones de capacidad con flotantes binarios sin normalización.
- Usar puntos EPSG:4326 con orden longitud/latitud y geometrías LineString para aristas. El adaptador traduce geometrías a objetos del dominio; el dominio no conoce PostGIS.
- Separar referencias cartográficas compartidas de direcciones privadas de cada tenant. Aplicar RLS a todas las nuevas tablas operativas y permisos de solo lectura sobre datasets publicados para el rol de aplicación.
- Persistir intentos y candidatos de geocodificación. Una revisión crea evidencia auditable; nunca convierte un puntaje heurístico en una probabilidad estadística.
- PostGIS almacena y prefiltra candidatos; normalización, ranking, distancia, clustering, camino mínimo y secuenciación se implementan manualmente en TypeScript.
- Empezar con un depósito y una ruta por vehículo/día. Todo servicio debe terminar dentro de su ventana y fecha límite; el regreso debe caber en el turno. Se permite espera.
- Reutilizar los eventos, estados y aislamiento de SLS. Geocodificación pendiente es un estado independiente del paquete. Un pedido no asignable es un resultado de negocio.

## Alternativas

- Proyecto separado: descartado por decisión del usuario.
- Motor externo de geocodificación o rutas: incompatible con el requisito académico.
- Guardar solo coordenadas y parámetros JSON: no ofrece trazabilidad suficiente ni restricciones sobre ventanas y relaciones.
- Cambiar inmediatamente todas las unidades: añade riesgo de compatibilidad innecesario; se conservan nombres y unidades actuales.

## Consecuencias

Se necesitan migraciones graduales, pruebas sobre PostGIS real y adaptación de los contratos existentes. No se infieren direcciones originales ni confianza a partir de coordenadas antiguas. El planificador será una heurística factible, no un optimizador global. Los tiempos de viaje estimados no garantizan puntualidad real.

Referencias de diseño: [plan de migraciones](../geospatial/migration-plan.md), [PostGIS ST_DWithin](https://postgis.net/docs/ST_DWithin.html), [OSM Colombia](https://wiki.openstreetmap.org/wiki/ES:Colombia/Gu%C3%ADa_para_mapear), [OSM routing](https://wiki.openstreetmap.org/wiki/OSM_tags_for_routing).
