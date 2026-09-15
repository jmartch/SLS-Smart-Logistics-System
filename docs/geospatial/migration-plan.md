# Plan de migraciones geoespaciales

Fecha: 2026-09-14. Estado: GDB-00 auditado; GDB-01 implementado, probado en bases aisladas y aplicado a SLS según evidencia de terminal del usuario. GDB-02 a GDB-06 siguen en diseño. Véase [informe GDB-01](gdb-01-report.md).

## Base verificada en el repositorio

- `Package` contiene peso, volumen, coordenadas obligatorias, prioridad y deadline opcional, pero no dirección ni ventanas.
- `Route`, `RouteStop`, `Assignment`, `Vehicle`, `Courier` y `RoutePlanningRequest` se reutilizan.
- Existen RLS y pruebas de lectura por tenant. RLS no reemplaza la integridad de relaciones entre entidades.
- Las relaciones actuales apuntan al ID sin comprobar el tenant del padre.
- Los volúmenes tienen escala 3; las fechas usan TIMESTAMP sin zona.
- La migración inicial es histórica y no se reescribe.

## GDB-00 — Preflight reproducible, solo lectura

Antes de escribir SQL de migración, contrastar esquema y base activa: migraciones, políticas RLS, permisos, índices, extensiones y versión del servidor. Contar por tabla sin imprimir datos personales.

Buscar relaciones entre tenants, asignaciones activas duplicadas, paradas que no correspondan a su ruta, pesos/volúmenes no positivos, coordenadas inválidas y registros afectados por cambios de estados. Determinar mediante código y datos de prueba la convención histórica de timestamps; no suponer UTC ni hora colombiana.

Aceptación: informe con conteos y discrepancias, sin mutaciones. Si hay datos incompatibles, documentar corrección por separado; no borrar ni escoger ganadores automáticamente.

## GDB-01 — Integridad logística

- Incorporar claves únicas `(tenantId, id)` en padres y relaciones compuestas en hijos. Revisar todas las relaciones tenant-owned, incluidas identidad, auditoría y entregas.
- Conservar RLS; nuevas tablas deben fallar de forma cerrada sin contexto. Comprobar también escritura con el rol runtime, no solo lectura con administrador.
- Para referencias opcionales evitar un `SET NULL` que intente anular también `tenantId`: elegir RESTRICT y desvinculación explícita, preservando historial.
- Garantizar que `Assignment.routeStopId` pertenece a `routeId`, y que vehículo/conductor coinciden con la ruta. Definir qué duplicaciones pueden eliminarse y cuáles son snapshots históricos antes de crear constraints.
- Índice único parcial por `(tenantId, packageId)` cuando `status = ACTIVE`. Una reasignación cierra la anterior y crea la nueva en una transacción.
- CHECK positivos para peso, volumen y capacidad; límites de latitud/longitud; secuencia positiva. Los datos previos se auditan antes de validar restricciones.
- La capacidad agregada requiere bloqueo transaccional sobre la ruta/vehículo y recálculo; un CHECK de una fila no resuelve sobreasignación concurrente.

Aceptación: rechazar relaciones cruzadas, doble asignación activa y valores inválidos; permitir historial y reasignación atómica; dos solicitudes concurrentes no exceden capacidad.

## GDB-02 — PostGIS y catálogo local

Habilitar PostGIS mediante nueva migración después de preparar la imagen. Validar soporte espacial con la versión instalada de Prisma; si corresponde usar `Unsupported` y SQL parametrizado en el adaptador. Instalar la extensión también en la base efímera de pruebas y en shadow DB cuando se use.

| Modelo nuevo | Campos y reglas principales |
| --- | --- |
| GeoDataset | UUID, tipo SYNTHETIC/OSM/LOCAL_VERIFIED, fuente, fecha, checksum, licencia, versión de importador, área, estado STAGING/READY/FAILED. Solo READY es consultable. |
| AddressReference | Dataset, ID de origen, municipio, vía estructurada, placa, clave normalizada, Point(4326), precisión ENTRANCE/BUILDING/INTERPOLATED/STREET. |
| Address | Tenant, texto original, municipio, fecha. El texto se conserva; una corrección se versiona. |
| GeocodingAttempt | Tenant, addressId, normalizedText, componentes JSON, versión de algoritmo, estado MATCHED/REVIEW_REQUIRED/NOT_FOUND, fecha, candidato seleccionado nullable. |
| GeocodingCandidate | Tenant, intento, referencia nullable, posición, punto, score entre 0 y 1, desglose, fuente, precisión. Referencia nullable permite revisión con punto levantado manualmente. |
| GeocodingReview | Tenant, intento/candidato, usuario, decisión, motivo, fecha. El candidato seleccionado debe pertenecer al mismo intento. |

Índices GiST sobre geometrías; B-tree sobre dataset/municipio/clave y tenant/addressId. SRID 4326 obligatorio, geometrías no vacías y coordenadas válidas. El CRS es explícito en el contrato y verificable desde la geometría. No almacenar latitud/longitud editables independientemente del punto.

La FK al catálogo compartido no necesita tenant. Los datos privados nunca se incorporan automáticamente al catálogo compartido. La selección automática exige componentes esenciales exactos, score >= 0,95 y margen >= 0,10; umbrales versionados y sujetos a evaluación.

Aceptación: round-trip sin invertir lat/lon; dos candidatos ambiguos exigen revisión; intento fallido conserva dirección y fecha; Tenant A no accede a intentos de B.

## GDB-03 — Paquetes compatibles con recepción y geocodificación

- Agregar addressId y geocodingAttemptId inicialmente nullable. Validar que intento y dirección corresponden al paquete y tenant.
- Hacer zoneId y coordenadas antiguas nullable para permitir recepción sin geocodificación. Durante compatibilidad ambas coordenadas deben ser nulas o ambas válidas.
- Mantener las coordenadas antiguas temporalmente como legado, sin declarar MATCHED los registros existentes. Nuevas operaciones leen la ubicación seleccionada a través del adaptador. No inventar dirección original.
- Añadir dimensiones en cm con precisión documentada; exigir las tres juntas cuando se suministren. Conservar volumen declarado de registros antiguos y distinguirlo del calculado. No inventar dimensiones de un volumen conocido.
- Ampliar `volumeM3` y `maxVolumeM3` a Decimal(12,6); conservar weightKg/maxWeightKg.
- Eliminar columnas geográficas antiguas solo en una migración posterior, cuando todos los consumidores usen el nuevo modelo y exista evidencia de backfill completo.

Aceptación: registrar sin ubicación; impedir asignación sin selección confirmada; conservar registros antiguos; representar 500 cm³ como 0,000500 m³; dimensiones y volumen calculado coherentes.

## GDB-04 — Calendario, ventanas y disponibilidad

| Cambio | Campos y reglas |
| --- | --- |
| Depot nuevo | Tenant, nombre, punto, zona horaria IANA y horario. |
| DeliveryWindow nuevo | Tenant, packageId, startAt/endAt timestamptz; startAt < endAt. Varias ventanas alternativas por pedido. |
| VehicleShift / CourierShift nuevos | Tenant, recurso, startAt/endAt timestamptz; turnos sin solapamiento por recurso. |
| Package | serviceDurationSeconds positivo. Sin default inventado para datos existentes. |
| RoutePlanningRequest | horizonStart/horizonEnd, zona horaria, algoritmo/versión, dataset/version y parámetros explícitos. |
| Route | serviceDate DATE, depotId, inicio/fin previstos y totales. Unicidad vehículo/día para rutas no canceladas en V1. |
| RouteStop | arrivalAt, serviceStartAt, serviceEndAt, intento de geocodificación utilizado y ventana elegida. |
| PlanningPackageResult nuevo | Solicitud, paquete, resultado ASSIGNED/PENDING, motivo y evidencia resumida; único por solicitud/paquete. |

Los nuevos instantes son timestamptz. Convertir timestamps antiguos únicamente después del preflight con zona de origen explícita; una conversión dependiente de la zona de sesión no es aceptable.

Exigir servicio completo dentro de ventana y deadline, y regreso dentro de turno. Deadline puede seguir nullable si el negocio permite ausencia; el planificador documenta que no hay límite adicional. No inventar ventanas para pedidos antiguos: quedan pendientes por datos incompletos.

Aceptación: espera temprana permitida, servicio tardío rechazado, ventanas de días distintos respetadas, turno y capacidad válidos después de cada inserción. Pedidos no asignados conservan motivo; la ejecución puede completarse con pendientes.

## GDB-05 — Grafo versionado y caminos

| Modelo | Campos y restricciones |
| --- | --- |
| RoadNode | Dataset, ID interno, osmNodeId BigInt nullable, Point(4326). ID OSM serializado como string fuera de BD. |
| RoadEdge | Dataset, origen/destino del mismo dataset, osmWayId nullable, LineString(4326), distanceM, durationS, perfil vial, etiquetas. Pesos finitos no negativos; IDs propios permiten aristas paralelas. |
| RoadTurnRestriction | Dataset, aristas de entrada/salida y vía intermedia cuando aplique; necesaria antes de declarar routing vial completo. |
| NetworkAttachment | Dataset, geocódigo, perfil, nodo/arista de conexión, distancia de acceso y revisión; no sustituye la coordenada del acceso. |
| RouteLeg / RouteLegEdge | Ruta, secuencia, extremos, métricas, dataset y aristas ordenadas. Incluir salida y regreso al depósito. |

Referencias de rutas fijan versión de grafo y geocódigo. No borrar datasets referenciados. Importar primero a STAGING y publicar solo tras validar conectividad, sentidos y consistencia. Cruces geométricos sin conexión OSM no crean intersecciones artificiales.

Aceptación: camino dirigido reproducible; conservación de aristas paralelas y segmentos; dataset sintético distinguible de OSM; actualizar el catálogo no modifica rutas históricas.

## GDB-06 — Estados y compatibilidad

Coordinar Prisma, dominio, API, eventos y fixtures: ASSIGNED pasa a ASSIGNED_TO_ROUTE; incorporar RETURN_PENDING/CANCELLED y los estados de ruta definidos en AGENTS.md. Una migración de enum no implementa el patrón State: deben existir operaciones y pruebas que controlen transiciones e historial.

Revisar productores/consumidores de eventos persistidos antes de renombrar valores. No mapear mensajes antiguos silenciosamente sin versión o compatibilidad explícita.

Aceptación: transiciones válidas generan historial/eventos y las inválidas no escriben; ningún consumidor queda con nombres incompatibles.

## Orden de entrega y verificación

1. GDB-00: informe y decisiones de compatibilidad.
2. GDB-01: integridad y concurrencia, con pruebas sobre base efímera.
3. GDB-02/GDB-03: PostGIS, direcciones y recepción sin coordenadas.
4. GDB-04/GDB-06: planificación y ciclo operativo.
5. GDB-05: persistencia de OSM; antes puede desarrollarse Dijkstra sobre fixtures en memoria.

Cada entrega incluye migración nueva, esquema actualizado, validación/generación Prisma usando `prisma7.config.ts`, build y pruebas pertinentes. Probar desde base vacía y desde copia de datos de prueba con esquema anterior. No ejecutar tests que creen/borren fixtures en la base compartida. Las pruebas existentes de aislamiento mutan datos y deben dirigirse a una base dedicada.

No resetear PostgreSQL. Ante fallos conservar datos y diagnosticar; rollback de aplicación puede requerir mantener temporalmente columnas antiguas. Las migraciones de contracción se separan de las aditivas.

## Condición de entrada a Dijkstra

No requiere esperar a PostGIS: definir el contrato del grafo dirigido, escribir pruebas del fixture A→B(4), A→C(1), C→B(2), B→D(1), C→D(5), E aislado, y comprobar la fase roja antes de implementar. Resultado A→D: costo 4, camino A-C-B-D. Probar también sentido único, origen igual a destino, pesos inválidos, empates, aristas paralelas y ciclo cero.
