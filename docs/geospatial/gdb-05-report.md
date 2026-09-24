# GDB-05 — Grafo versionado y caminos

Fecha de verificación: 2026-09-24.

Estado: esquema, migración y prototipo de búsqueda terminados y verificados en una base PostgreSQL/PostGIS aislada. La aplicación de la migración en SLS también fue comprobada directamente. La integración del cálculo con la creación completa de rutas continúa pendiente.

## Implementación

La migración `20260921100000_road_network_graph` incorpora:

- `RoadNode` y `RoadEdge` asociados a una versión de `GeoDataset`;
- aristas dirigidas, perfiles de movilidad, distancia, duración y geometría `LineString(4326)`;
- aristas paralelas mediante identificadores propios;
- `RoadTurnRestriction` para conservar restricciones importadas de OSM;
- `NetworkAttachment` para vincular un candidato geocodificado con un nodo o una arista;
- `RouteLeg` y `RouteLegEdge` para fijar el dataset y conservar la secuencia exacta de segmentos de una ruta;
- índices B-tree y GiST, claves compuestas, checks espaciales y RLS para datos privados.

El código de dominio implementa Dijkstra manual sobre un grafo dirigido. Rechaza nodos o aristas inconsistentes, costos negativos o no finitos, conserva aristas paralelas y resuelve empates de manera determinista. El repositorio carga exclusivamente datasets `READY` y permite elegir distancia o duración como costo. La reconstrucción geométrica mantiene el orden del camino e invierte una `LineString` cuando fue almacenada en sentido contrario a la arista dirigida.

## Verificación reproducible

Se levantó un contenedor temporal `postgis/postgis:17-3.6-alpine` con la base `sls_gdb05_test`. Las migraciones de prueba, los fixtures y las suites que escriben datos se ejecutaron únicamente allí; la base compartida se usó después solo para el preflight de lectura descrito más abajo.

Resultados obtenidos:

- `prisma validate`: esquema válido;
- `prisma generate`: cliente generado correctamente;
- `prisma migrate deploy`: nueve migraciones aplicadas desde una base vacía;
- `npm run build`: compilación correcta;
- TypeScript sin emisión y lint del módulo: correctos;
- pruebas unitarias completas: 6 suites y 38 pruebas aprobadas;
- pruebas E2E completas: 3 suites y 5 pruebas aprobadas;
- `gdb-05-road-network.sql`: diez comprobaciones `PASS` y `ROLLBACK` final.

Las comprobaciones SQL cubren datasets sintéticos y OSM distinguibles, aristas paralelas, relaciones entre datasets, costos y geometrías inválidos, referencia obligatoria de giro, destino único de conexión, retención de datasets referenciados, secuencias positivas, aislamiento por tenant y publicación exclusiva de grafos `READY`.

## Estado verificado en SLS

El preflight de solo lectura encontró nueve migraciones aplicadas, incluida `20260921100000_road_network_graph`. Su checksum registrado, `b981ab51b8197c21048c2b135a86c0aeb8d3ba2eeaceb6a5768d6f2377f40867`, coincide con el SHA-256 del archivo local.

`RoadNode`, `RoadEdge`, `RoadTurnRestriction`, `NetworkAttachment`, `RouteLeg` y `RouteLegEdge` existen y estaban vacías. Se verificó una política RLS en cada tabla: lectura de grafo publicado para las tres tablas compartidas y aislamiento por tenant para las tres privadas. PostGIS 3.6.4 y `btree_gist` 1.7 estaban instalados. No se insertaron fixtures ni se ejecutó el script SQL transaccional sobre SLS.

PostgreSQL estaba detenido antes del preflight; se inició únicamente para estas consultas y se volvió a detener al finalizar. El servidor emitió la advertencia `database "sls" has no actual collation version, but a version was recorded`; conviene diagnosticarla por separado antes de una operación futura de mantenimiento de collation.

## Alcance pendiente

- Integrar `FindRoadPathService` con el caso de uso de planificación y persistir todos los tramos, incluida salida y regreso al depósito.
- Incorporar las restricciones de giro al estado del algoritmo antes de declarar routing vial completo. Actualmente se almacenan, pero Dijkstra calcula por nodo y arista sin evaluarlas.
- Implementar y validar el importador OSM real. Las pruebas actuales usan grafos sintéticos; no sustituyen una importación de Barranquilla.
- Evitar cargar el grafo urbano completo por solicitud cuando se avance del prototipo académico a datos OSM de tamaño real; se requerirá caché, partición o una estrategia de consulta apropiada.
