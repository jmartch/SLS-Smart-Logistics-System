# GDB-05 — Grafo versionado y caminos

Fecha de verificación: 2026-09-26.

Estado: **DONE para el alcance del prototipo académico**. El esquema, la migración, Dijkstra, la reconstrucción geométrica y la persistencia transaccional de caminos para rutas existentes están implementados y verificados en PostgreSQL/PostGIS real. La conexión con el caso de uso que crea automáticamente rutas, paradas y asignaciones corresponde a ASSIGN-01/GDB-04 y no bloquea el cierre de GDB-05.

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

La integración posterior incorpora `PlanExistingRouteRoadPathService`, que obtiene el dataset fijado por `RoutePlanningRequest`, resuelve el depósito y las paradas ordenadas de una ruta y delega el cálculo completo. `BuildRouteRoadPathService` calcula salida, tramos entre paradas y regreso al depósito cargando el grafo una sola vez. `PrismaRouteRoadPathRepository` valida todos los segmentos antes de reemplazar datos, persiste `RouteLeg` y `RouteLegEdge` en una transacción `SERIALIZABLE` y actualiza la distancia y duración planificadas de la ruta.

La persistencia crea primero cada `RouteLeg` y después sus `RouteLegEdge` mediante `createMany`, siempre dentro de la misma transacción. Esta separación evita combinar claves foráneas escalares con una escritura relacional anidada incompatible con Prisma. La prueba E2E sobre PostgreSQL real detectó este problema, permitió corregirlo y confirmó que los tres tramos y sus aristas se guardan correctamente.

La resolución respeta el tenant y devuelve resultados explícitos para ruta inexistente, dataset ausente, depósito sin conexión, ruta sin paradas y parada sin conexión aceptada. Para el prototipo, el depósito se conecta al nodo transitable más cercano. Una conexión de parada ubicada sobre una arista se aproxima al extremo geométricamente más cercano; una versión vial de producción necesitará dividir la arista o representar el punto virtual para conservar el costo de acceso exacto.

## Verificación reproducible

La verificación original se ejecutó en un contenedor temporal `postgis/postgis:17-3.6-alpine` con la base `sls_gdb05_test`. Las migraciones de prueba, los fixtures y las suites que escriben datos se ejecutaron únicamente allí; la base compartida se usó después solo para el preflight de lectura descrito más abajo.

Resultados obtenidos:

- `prisma validate`: esquema válido;
- `prisma generate`: cliente generado correctamente;
- `prisma migrate deploy`: nueve migraciones aplicadas desde una base vacía;
- `npm run build`: compilación correcta;
- TypeScript sin emisión y lint del módulo: correctos;
- pruebas unitarias completas: 6 suites y 38 pruebas aprobadas;
- pruebas E2E completas: 3 suites y 5 pruebas aprobadas;
- `gdb-05-road-network.sql`: diez comprobaciones `PASS` y `ROLLBACK` final.

Verificación de la integración de rutas:

- ESLint funcional de los archivos modificados: sin errores; se conserva el formato manual del E2E y se omite únicamente `prettier/prettier`;
- pruebas unitarias completas del backend: 14 suites y 100 pruebas aprobadas;
- módulo `route-planning`: 9 suites y 58 pruebas aprobadas;
- `npm run build`: compilación correcta;
- `git diff --check`: sin errores;
- `npm run test:gdb-05`: crea una base PostGIS con nombre aleatorio, aplica las nueve migraciones, ejecuta las pruebas integrales y elimina la base incluso al finalizar el proceso.

El E2E reproducible de GDB-05 ejecuta tres pruebas:

1. Recorrido completo: persiste salida del depósito, dos paradas y regreso, con tres `RouteLeg`, sus `RouteLegEdge`, 4500 metros y 540 segundos.
2. Atomicidad ante camino inexistente: al retirar temporalmente el perfil vial de la arista de regreso, devuelve `PATH_NOT_FOUND` para el tramo 3 y conserva sin cambios los tramos y métricas previamente persistidos.
3. Aislamiento entre tenants: un segundo tenant recibe `ROUTE_NOT_FOUND` y no puede consultar ni modificar los caminos de la ruta original.

El runner exige `GDB_TEST_ADMIN_URL`, genera una base `sls_gdb05_<uuid>`, ejecuta migraciones y Jest con `--experimental-vm-modules`, termina conexiones activas y elimina exclusivamente esa base desechable. La base compartida `sls` no participa en estas pruebas.

Las comprobaciones SQL cubren datasets sintéticos y OSM distinguibles, aristas paralelas, relaciones entre datasets, costos y geometrías inválidos, referencia obligatoria de giro, destino único de conexión, retención de datasets referenciados, secuencias positivas, aislamiento por tenant y publicación exclusiva de grafos `READY`.

## Estado verificado en SLS

El preflight de solo lectura encontró nueve migraciones aplicadas, incluida `20260921100000_road_network_graph`. Su checksum registrado, `b981ab51b8197c21048c2b135a86c0aeb8d3ba2eeaceb6a5768d6f2377f40867`, coincide con el SHA-256 del archivo local.

`RoadNode`, `RoadEdge`, `RoadTurnRestriction`, `NetworkAttachment`, `RouteLeg` y `RouteLegEdge` existen y estaban vacías. Se verificó una política RLS en cada tabla: lectura de grafo publicado para las tres tablas compartidas y aislamiento por tenant para las tres privadas. PostGIS 3.6.4 y `btree_gist` 1.7 estaban instalados. No se insertaron fixtures ni se ejecutó el script SQL transaccional sobre SLS.

PostgreSQL estaba detenido antes del preflight; se inició únicamente para estas consultas y se volvió a detener al finalizar. El servidor emitió la advertencia `database "sls" has no actual collation version, but a version was recorded`; conviene diagnosticarla por separado antes de una operación futura de mantenimiento de collation.

## Trabajo posterior fuera de GDB-05

- Invocar `PlanExistingRouteRoadPathService` desde el caso de uso general que crea rutas, paradas y asignaciones; este trabajo pertenece a ASSIGN-01/GDB-04. La integración actual opera sobre una ruta ya creada y validada.
- Incorporar las restricciones de giro al estado del algoritmo en una etapa posterior de routing vial. Actualmente se almacenan, pero Dijkstra calcula por nodo y arista sin evaluarlas.
- Implementar y validar el importador OSM real en una etapa posterior. Las pruebas actuales usan grafos sintéticos y no sustituyen una importación de Barranquilla.
- Incorporar caché, partición o consultas especializadas cuando se utilicen grafos urbanos de tamaño real. La integración actual reutiliza una sola carga del grafo para todos los tramos de una ruta.
