# GDB-02 — PostGIS y persistencia del catálogo local

Estado: infraestructura y persistencia del catálogo implementadas y probadas en contenedor aislado. El usuario confirma haber completado la aplicación a SLS, generación del cliente, build, consulta de estado y reinicio del backend.

## Evidencia y autoría

El usuario implementó Dockerfile, Compose, modelos, migraciones y scripts de prueba. Este informe registra las salidas de terminal que compartió; no afirma una ejecución independiente de las pruebas por el asistente. El asistente revisó el SQL y elaboró este informe sin aplicar cambios a PostgreSQL.

## Infraestructura

- Imagen propia basada en el digest de PostgreSQL ya utilizado por SLS: `sha256:0b657ff48d7f76a1e907f381b1693eb4f2bf54c1d2df4feb6743d7dc601768dd`.
- PostgreSQL 17.11 sobre Debian 13, PostGIS 3.6.4.
- Colación almacenada y actual: 2.41 / 2.41.
- Imagen local `sls-postgres-postgis:gdb02`, conservando el volumen de SLS.
- Migración `20260915010000_enable_postgis` aplicada según evidencia: funciones espaciales operativas y cuatro migraciones al día.
- El digest fija la base, pero apt instala las versiones disponibles al construir: la imagen final no es completamente reproducible por ese digest solamente. Conservar su identificador y versiones al distribuirla.

## Catálogo

`20260915020000_geocoding_catalog` crea GeoDataset, AddressReference, Address, GeocodingAttempt, GeocodingCandidate y GeocodingReview, sus enums y relaciones.

Las relaciones compuestas garantizan tenant, pertenencia del candidato al intento y coincidencia de dataset entre intento y referencia. La selección es nullable; la revisión conserva actor, motivo, decisión y fecha. Las coordenadas candidatas se guardan como evidencia independiente del catálogo.

Incluye CHECK de score/rank, geometrías no vacías y en rango, checksum hexadecimal y textos no vacíos de dirección/motivo. Los puntos usan geometry(Point,4326) con índices GiST.

RLS protege las cuatro tablas privadas. Runtime puede insertar y consultar evidencia, y actualizar solo selección/estado del intento. El catálogo compartido es de lectura y solo publica datasets READY. La importación requiere un proceso autorizado separado.

## Pruebas aportadas por el usuario

Base temporal `sls_gdb02_test` en el contenedor `sls-gdb02-test`, con almacenamiento tmpfs y sin el volumen de SLS. Se restauró únicamente el esquema de SLS y se ejecutó la nueva migración; terminó en COMMIT.

| Script | Resultado comunicado |
| --- | --- |
| `backend/test/sql/gdb-02-spatial.sql` | 3 PASS: latitud fuera de rango rechazada, punto vacío rechazado, coordenada válida conservada. |
| `backend/test/sql/gdb-02-isolation.sql` | 4 PASS: lectura por tenant, escritura cruzada rechazada, DELETE del catálogo denegado, contexto vacío sin acceso. |
| `backend/test/sql/gdb-02-candidates.sql` | 7 PASS: score/rank inválidos rechazados, referencia de otro dataset rechazada, selección de otro intento rechazada, selección propia permitida, datasets STAGING ocultos y revisión/selección permitidas al runtime. |

Los tres scripts finalizaron con ROLLBACK y no conservaron sus fixtures. Total: 14 comprobaciones positivas comunicadas. Prisma format/validate también terminaron correctamente según la salida compartida.

## Alcance y límites

Esto verifica infraestructura y persistencia, no implementa normalización, búsqueda, puntuación, geocodificación, API de revisión ni planificación. La autorización del revisor y la transición coherente entre status/selección deben integrarse en el caso de uso. Las FK no garantizan por sí solas que MATCHED siempre tenga selección o que una aprobación sea la decisión más reciente.

La prueba de revisión confirma permisos y escrituras dentro de la transacción de prueba; no demuestra aún un caso de uso completo con fallos intermedios y concurrencia. El catálogo debe publicarse versionado y no modificarse en sitio por el importador una vez utilizado. Los tests no cubren todas las combinaciones de roles y tablas.

## Aplicación a SLS

El usuario confirmó haber realizado todos los pasos indicados: respaldo, Prisma migrate deploy, Prisma generate, npm run build, Prisma migrate status y reinicio del backend. No compartió la salida de esta última secuencia; se registra como confirmación del usuario, no como verificación independiente del asistente. Las pruebas aisladas anteriores sí cuentan con salidas PASS compartidas.

La configuración final de Compose usa `build: ./docker/postgres` e `image: sls-postgres-postgis:gdb02`, conservando `postgres_data:/var/lib/postgresql/data`. El asistente verificó `docker compose config --quiet` y `git diff --check` sin errores.

## Siguiente paso

Preparar un commit enfocado para GDB-02. Posteriormente iniciar GDB-03: vincular Package con Address y GeocodingAttempt, permitir recepción sin geocódigo y adaptar precisión de volumen/dimensiones. El algoritmo de geocodificación y la API siguen pendientes.
