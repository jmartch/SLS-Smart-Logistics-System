# Demo con datos reales de OpenStreetMap: Barranquilla

Dataset: `329842f6-7469-4f36-8aee-ca6d6e6e373c`.
Nombre en pantalla: **Barranquilla · El Prado–Alto Prado · OSM demo**.

## Fuente y alcance

Extracto público descargado el 2026-10-13 mediante la
[API oficial de OpenStreetMap](https://wiki.openstreetmap.org/wiki/API_v0.6#Retrieving_map_data_by_bounding_box:_GET_/api/0.6/map).
[Consulta de origen](https://api.openstreetmap.org/api/0.6/map.json?bbox=-74.815,10.995,-74.795,11.01).
Área solicitada: longitud -74.815 a -74.795; latitud 10.995 a 11.01.
Las vías completas incluidas pueden extenderse fuera del rectángulo solicitado.

© OpenStreetMap contributors. Datos derivados bajo
[Open Database License 1.0](https://www.openstreetmap.org/copyright).
El archivo comprimido `backend/prisma/data/barranquilla-demo.osm.json.gz`
conserva fuente, fecha, límites, IDs y etiquetas necesarias; omite nombres de
contribuidores y objetos ajenos a la demo. Se distribuye con esta atribución.

SHA-256 del JSON descomprimido:
`4865b70551ce2f35b068fd2be4036b7ad19f4bc9cdd7e0caf9d87bf5c92c2661`.

Contenido importado:

| Datos | Cantidad |
| --- | ---: |
| Nodos de vías admitidas | 2.035 |
| Conexiones dirigidas para vehículo motorizado | 3.122 |
| Direcciones compatibles | 58 |

Se respetan sentidos únicos, incluido `oneway=-1`, y rotondas. Se excluyen
vías no motorizadas, acceso privado/restringido, accesos condicionales y vías
incompletas. Los costos usan el Haversine implementado en SLS; la duración usa
`maxspeed` numérico o una estimación de 30 km/h.

El importador omite polígonos de dirección y formatos que el normalizador actual
no reconoce. Los puntos importados conservan coordenadas OSM y precisión
BUILDING. No se inventan placas ni coordenadas. Este extracto de demostración
no incorpora restricciones de giro, barreras, tráfico ni todos los casos de acceso
vial: sus caminos son resultados del grafo académico, no instrucciones de conducción.

## Preparación reproducible

Desde la raíz del repositorio:

```bash
docker compose exec backend npm run build
docker compose exec backend npm run demo:prepare:osm
```

La importación usa `DATABASE_URL` administrativo, una transacción y un ID derivado
del checksum. Antes de importar comprueba tres coincidencias automáticas del
geocodificador y recorridos de ida/vuelta con Dijkstra. Publica como READY al
terminar la carga completa; repetirla reutiliza el dataset.

La preparación requiere el tenant demo, su administrador, zona y tipo de envío
existentes. Usa `RUNTIME_DATABASE_URL` y los servicios de registro, clasificación
y geocodificación para añadir estos paquetes en REGISTERED (la clasificación se hace desde la página):

| Guía | Dirección OSM |
| --- | --- |
| `OSM-DEMO-329842F6-1` | CARRERA 52 # 80-96 |
| `OSM-DEMO-329842F6-2` | CALLE 76 # 53-54 |
| `OSM-DEMO-329842F6-3` | CARRERA 53 # 75-124 |

También añade **Depósito OSM demo · El Prado** sobre un nodo transitable dentro
del extracto. Es un origen simulado para la demostración. Cada candidato se
conecta a un nodo OSM a menos de 100 m, conservando la distancia de acceso real.
Las repeticiones conservan los paquetes existentes y su estado operativo.
Los paquetes y rutas previos mantienen su dataset y evidencia.

Para cargar únicamente el catálogo:

```bash
docker compose exec backend npm run demo:import:osm
```

## Uso en pantalla

1. Clasifica primero las tres guías en **Clasificación**, asignándoles NORTH.
2. Abre Planificación, pulsa **Actualizar recursos** y elige **Crear nuevas rutas**, NORTH y una fecha/ventana disponible.
3. Selecciona **Depósito OSM demo · El Prado** como origen.
4. Selecciona **Barranquilla · El Prado–Alto Prado · OSM demo**.
5. Selecciona las tres guías `OSM-DEMO-329842F6-*` y pulsa **Planificar y asignar rutas**.
6. Revisa las rutas propuestas antes de prepararlas o iniciarlas.

Los recursos se eligen automáticamente. La falta de capacidad o de un mensajero
libre sigue produciendo un motivo de pendiente. Registrar otras direcciones
requiere ejecutar su geocodificación y conexión vial antes de planificarlas;
seleccionar un dataset no geocodifica por sí solo todos los paquetes.

## Verificación

El test `osm-demo-extract.spec.ts` comprueba sentidos de vías, filtros de acceso,
datos incompletos, coordenadas originales, normalización y tres recorridos
completos del extracto incluido, sin descargar datos durante las pruebas.

```bash
docker compose exec backend npm test -- --runInBand src/modules/geocoding/test/osm-demo-extract.spec.ts
```

`demo:seed` ya incluye esta preparación. `demo:prepare:osm` sigue siendo una carga
aditiva: conserva estados existentes y deja los paquetes nuevos en REGISTERED.
Para el recorrido de pendientes y recuperación, ver [el runbook](mvp-demo.md).
