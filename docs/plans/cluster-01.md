# Plan de CLUSTER-01 — Agrupamiento determinista por proximidad y capacidad

## Identidad

| Campo | Valor |
| --- | --- |
| Módulo | `CLUSTER-01` |
| Dominio | Planificación de rutas: agrupamiento geográfico y propuestas factibles por peso/volumen |
| Prioridad | `P1` |
| Estado general | `TODO` — plan creado; algoritmo pendiente |
| Responsable principal | Humberto (`USER`) |
| Coordinación | Vivian: contratos de paquetes/vehículos; Juanangel: tenant y persistencia; Santiago: consumo posterior en UI-03 |
| Rama observada | `develop` |
| Última auditoría | 2026-10-02, America/Bogota |
| Commit auditado | `a8973fb10e2109def1ee4da9d67dbab93010927e` |
| Informe previsto | `docs/modules/cluster-01-report.md` — crear al registrar la primera evidencia de implementación |
| Dependencia del tablero | `GEO-01` |
| Consumidores posteriores | `ASSIGN-01`; entrega de grupos a `SEQ-01` a través del caso de uso de planificación |

`USER` identifica implementación humana, principalmente Humberto. `CODEX_MECHANICAL` identifica verificación, documentación y transformaciones repetitivas ya determinadas. El plan no autoriza al agente a implementar decisiones de dominio ni a modificar los cambios locales existentes.

## Alcance

### Incluido

- Algoritmo manual, puro y determinista de agrupamiento por radio sobre coordenadas validadas de GEO-01.
- Una segunda política explícita que divide los grupos geográficos según la capacidad disponible de los vehículos suministrados. Conserva el grupo de origen y produce propuestas, sin reservar recursos.
- Restricciones simultáneas de peso en **kg** y volumen en **m³**, con cálculos internos exactos en gramos y cm³ enteros.
- Un único tenant por ejecución; partición por zona operativa ya validada. Un cluster calculado no crea ni reemplaza una Zone/Sector.
- Contratos de entrada/salida independientes de Prisma, NestJS, HTTP y RabbitMQ, con resultados pendientes y razones estables.
- Pruebas deterministas con conjuntos pequeños, invariantes, precisión, rechazo de mezcla de tenants, fronteras de arquitectura y regresión de GEO-01.
- Servicio de aplicación mínimo que componga agrupamiento y partición; exposición interna desde route-planning cuando exista un consumidor real.
- ADR del algoritmo, ejemplo reproducible y evidencia del alcance efectivamente implementado.

### Fuera de alcance

- Optimización global/exacta, OR-Tools, motores externos de clustering/rutas, IA, K-means adicional, búsqueda exhaustiva o balanceo óptimo de flota.
- Reimplementar Haversine, geocodificar direcciones, consultar servicios cartográficos o exigir OSM/PostGIS para ejecutar el algoritmo puro.
- Nearest-neighbor y 2-opt (`SEQ-01`), caminos viales/Dijkstra, tiempos de viaje, ventanas exactas o distribución semanal. Las funciones existentes de caminos no amplían este encargo.
- Crear rutas, paradas, asignaciones, reservas, historial o transiciones de estado; integración transaccional y recuperación manual pertenecen a `ASSIGN-01`/`ROUTE-01`.
- Validar turnos, mensajeros y conflictos operativos de vehículos; se consume disponibilidad calculada por sus propietarios y se revalida al asignar.
- Endpoints nuevos, pantallas, migraciones, tablas de clusters, workers, colas, DLQ y notificaciones. No son necesarios para cerrar este prototipo.
- Refactorizar deuda existente de assignments o geocoding dentro de esta entrega.

## Dependencias y fuentes

| Fuente/dependencia | Uso y condición |
| --- | --- |
| [AGENTS.md](../../AGENTS.md), §5, §10, §12 y §14 | MVP, kg/m³ y capacidad disponible, etapas separadas, algoritmo manual y Chain distinta del clustering |
| AGENTS.md §8–9, §11, §17–18, §20–23, §25–28 | Clean Architecture, tenant, State, errores, verificación en Compose, cierre y ADR |
| [Plantilla canónica](../../.agents/skills/sls-module-workflow/assets/module-plan-template.md) | Identidad, alcance, diagnóstico, plan verificable, fichas, decisiones, bitácora y cierre |
| [Plan GEO-01](geo-01.md) e [informe](../modules/geo-01-report.md) | Dependencia directa implementada y documentada; su evidencia histórica no reemplaza una nueva ejecución |
| [Coordinates](../../backend/src/modules/route-planning/domain/coordinates.ts), [Haversine](../../backend/src/modules/route-planning/domain/haversine.ts), [error tipado](../../backend/src/modules/route-planning/domain/invalid-coordinates.error.ts) | Contrato de coordenadas y distancia que debe reutilizarse |
| [PKG-01](pkg-01.md), [VEH-01](veh-01.md), [ZONE-01](zone-01.md) | Contratos operativos de paquetes, capacidades y zonas para la integración posterior; fixtures permiten avanzar en el núcleo puro |
| [Esquema de paquetes](../../backend/prisma/schema/packages.prisma) y [rutas/vehículos](../../backend/prisma/schema/routing.prisma) | Nombres, unidades y precisión actuales; no crear modelos paralelos |
| [ADR-001](../adr/001-geospatial-integration.md) | Propuesto; antecedente de kg/m³ y normalización entera. Sus ampliaciones viales no son requisitos de CLUSTER-01 |
| [ADR-002](../adr/002-assignment-integrity.md) | Aceptado para reserva: capacidad transaccional exacta e historial; una propuesta de cluster no sustituye esa garantía |
| [Chain geoespacial](../geospatial/assignment-chain.md) y [contratos de validación](../../backend/src/modules/assignments/domain/validation.types.ts) | Geocodificación seleccionada, attachment y validación final. Reutilizar contratos públicos sin copiar reglas |
| [Plan MVP](mvp-implementation.md) | Secuencia GEO → CLUSTER/SEQ → ASSIGN y separación de zonas frente a grupos calculados |

**Dependencias para comenzar:** GEO-01 y revisión del contrato del paso 1. El núcleo no necesita una API operativa de PKG/VEH ni una base de datos. **Dependencias para operar sobre datos reales:** PKG/VEH/ZONE, identidad confiable, consulta tenant-aware y coordinación con ASSIGN-01. No marcar estas integraciones como completas por usar dobles en pruebas.

## Diagnóstico actual

1. No existe un plan previo de CLUSTER-01 ni una implementación de clustering localizada en `backend/src`. El tablero conserva `TODO` y su aceptación mínima es obtener clusters reproducibles con un conjunto pequeño.
2. GEO-01 está confirmado en `a8973fb`. `Coordinates.create(number, number)` valida números finitos y rangos; `parse(unknown, unknown)` admite cadenas numéricas; sus instancias se congelan y normalizan `-0`. `distanceTo`/`calculateHaversineDistance` devuelven **metros**, con radio terrestre `6_371_000`. No introducir otra fórmula ni interpretar el resultado como kilómetros.
3. El informe GEO-01 registra pruebas aprobadas anteriormente. En esta auditoría solo se inspeccionaron fuentes, suites y Git: **no se ejecutaron builds ni tests**. El commit y el “paso actual” de su plan no están sincronizados con todo su cierre; no se usan como evidencia de verificación nueva.
4. Route-planning ya contiene grafo dirigido, Dijkstra y servicios de caminos para rutas existentes. Eso no implementa clustering ni demuestra capacidad o secuenciación.
5. El esquema real está dividido en `backend/prisma/schema/`, configurado por `backend/prisma7.config.ts`; la ruta única histórica mencionada en AGENTS.md no existe. Package usa `weightKg Decimal(10,3)`, dimensiones en cm `Decimal(10,2)` y `volumeM3 Decimal(12,6)`; Vehicle tiene máximos con las mismas escalas de peso/volumen. Las coordenadas del destino proceden del candidato de geocodificación seleccionado, no de columnas de Package.
6. Existen Chain y reserva transaccional. Los handlers actuales comparan valores `number`, mientras la reserva usa precisión de base de datos. No se localizó un normalizador entero compartido reutilizable. La integración deberá reconciliar precisión sin duplicar reglas ni asumir que el snapshot reserva capacidad. La documentación existente registra que `PENDING_ASSIGNMENT` todavía se devuelve sin persistirse en ese flujo; corregirlo corresponde a ASSIGN-01.
7. La ejecución de validación desde el adaptador de reserva es deuda frente a las fronteras actuales de Clean Architecture. No reproducir ese diseño en CLUSTER-01 ni mezclar su refactorización con este plan.
8. El árbol de trabajo ya contiene cambios locales en geocoding, zones y tests de base de datos/route-planning. Se preservan íntegramente. Esta entrega añade únicamente este plan; no hay código, migraciones, verificaciones funcionales nuevas ni commit de CLUSTER-01.

## Contrato y diseño propuestos

Estas decisiones son la base concreta del paso 1; no describen código existente. Registrar su adopción y las alternativas en `docs/adr/003-deterministic-capacity-clustering.md` antes de implementar. Si el número queda ocupado, utilizar el siguiente disponible y actualizar referencias.

### Entrada y salida

| Elemento | Contrato propuesto |
| --- | --- |
| Ejecución | `tenantId` confiable, `radiusMeters` finito y positivo; versión fija de algoritmo/política. Un snapshot por ejecución; no reloj ni aleatoriedad internos |
| Paquete elegible | `packageId`, `tenantId`, `zoneId`, `coordinates: Coordinates`, `weightKg` y `volumeM3` como cadenas decimales canónicas; sin Prisma.Decimal en dominio |
| Capacidad de vehículo | `vehicleId`, `tenantId`, `availableWeightKg`, `availableVolumeM3` como cadenas decimales; solo vehículos elegibles para la ventana operativa solicitada al módulo propietario |
| Grupo geográfico | Clave estable basada en zona y paquete semilla, semilla fija, IDs de paquetes y distancias a la semilla en metros |
| Propuesta por capacidad | Clave estable basada en grupo/vehículo, `candidateVehicleId`, paquetes y totales exactos en kg/m³; no `routeId`, `assignmentId` ni declaración de recurso reservado |
| Pendientes | Lista ordenada de `packageId` y razón estable; cada paquete válido aparece exactamente una vez entre propuestas y pendientes |
| Metadatos | `tenantId`, algoritmo `radius-seed-first-fit`, versión inicial `1`, radio y versión de política. Se conserva la entrada/snapshot en la evidencia de reproducción |

El proveedor del snapshot calcula `availableWeightKg = maxWeightKg − sum(activePackage.weightKg)` y lo equivalente para volumen, según el contrato operativo vigente. No basta con `Vehicle.status = ACTIVE`. CLUSTER-01 valida que las disponibilidades sean no negativas y no las vuelve a calcular consultando tablas de otro módulo.

La selección de paquetes elegibles, sin asignación activa incompatible, y la geocodificación confirmada corresponden al llamador de planificación. Al incorporar datos reales, comprobar candidato, dirección, tenant y dataset antes de construir `Coordinates`. El orden geográfico es latitud/longitud; PostGIS recibe longitud/latitud en su adaptador. Tener números en rango no equivale a tener geocodificación aprobada.

### Precisión y unidades

- Unidades públicas y persistidas: kg y m³. Internamente convertir exactamente `kg × 1_000` a gramos y `m³ × 1_000_000` a cm³ mediante lectura decimal, sin `parseFloat` seguido de redondeo.
- Admitir hasta 3 decimales de kg y 6 de m³; ceros finales adicionales pueden normalizarse sin pérdida. Rechazar precisión significativa excedente, valores negativos, formato no canónico o cantidades fuera del rango seguro. Peso/volumen de paquete deben ser positivos; capacidad disponible puede ser cero.
- Comprobar `Number.isSafeInteger` en cada conversión, suma y resta. No usar epsilon para aceptar una carga superior al máximo; igualdad exacta sí cabe.
- El volumen canónico de PKG-01 debe proceder de dimensiones normalizadas: `(lengthCm / 100) × (widthCm / 100) × (heightCm / 100)` m³. La política de redondeo a seis decimales pertenece al contrato de registro de paquetes. CLUSTER-01 consume ese volumen canónico; no lo recalcula con otra política ni añade dimensiones a su entrada.
- La conversión debe ser una utilidad pura reutilizable; coordinar con VEH/ASSIGN su adopción posterior. No mover anticipadamente todos sus cálculos ni cambiar el esquema.

### Algoritmo manual en dos etapas

**Etapa A — proximidad, sin consultar vehículos.**

1. Validar toda la entrada antes de producir resultados: tenant único, IDs únicos por tipo, zona presente y cantidades/coordenadas válidas. Un ID duplicado es un error de contrato; no deduplicar silenciosamente.
2. Copiar colecciones y ordenar zonas e IDs mediante comparación ordinal explícita, sin `localeCompare` dependiente de la configuración del entorno.
3. Por cada zona, elegir como semilla el paquete de menor ID todavía sin agrupar. Incorporar todos los paquetes restantes cuya distancia Haversine a esa semilla sea `<= radiusMeters`.
4. Mantener fija la semilla. Ordenar miembros por distancia a la semilla y después por ID; quitar los miembros seleccionados y repetir hasta agotar la zona.
5. La regla acota distancia **a la semilla**; dos miembros pueden distar hasta dos radios entre sí. No es una restricción de diámetro ni conectividad transitiva. Las semillas no se recalculan como centroides.

**Etapa B — partición y propuesta de capacidad, sin reserva.**

1. Recorrer grupos en orden zona/semilla y miembros en el orden definido en A. Ordenar vehículos por ID; conservar un registro de recursos usados durante toda la ejecución.
2. Para cada paquete, intentar primero las propuestas ya abiertas de su grupo, por ID de vehículo, que admitan simultáneamente peso y volumen.
3. Si ninguna admite el paquete, abrir una propuesta con el primer vehículo todavía no usado que pueda transportarlo. Descontar ambos recursos con enteros. Cada vehículo puede respaldar una sola propuesta en esta ejecución; no duplicar su capacidad entre grupos.
4. Si no hay ubicación factible bajo esta política, devolver pendiente con una razón; continuar con los demás paquetes, porque otro de menor carga puede caber. Nunca dividir físicamente un paquete ni crear propuestas vacías.
5. Ordenar salida de forma canónica y devolver totales y pendientes, sin modificar entradas ni persistencia. El orden de miembros es de construcción del cluster, **no** una secuencia de visitas de SEQ-01.

Política de razones, con precedencia definida para que sea comprobable:

| Condición | Resultado propuesto |
| --- | --- |
| Tenant mezclado, ID duplicado, radio inválido o carga mal formada | Error tipado de contrato; rechazar toda la llamada sin resultado parcial ni detalles de recursos ajenos |
| Entrada de paquetes vacía y contrato válido | Éxito con propuestas/pendientes vacíos |
| No hay vehículos elegibles en el snapshot | `NO_AVAILABLE_VEHICLE` para cada paquete |
| Ningún vehículo del snapshot soporta el peso individual | `WEIGHT_CAPACITY_EXCEEDED` |
| El peso tiene al menos un vehículo apto, pero ninguno soporta el volumen individual | `VOLUME_CAPACITY_EXCEEDED` |
| Ambos recursos caben por separado en vehículos distintos, pero ninguno admite ambos a la vez | `NO_JOINT_CAPACITY` |
| El paquete cabe individualmente en algún vehículo del snapshot, pero estos ya se consumieron o comprometieron con otro grupo | `CAPACITY_EXHAUSTED_BY_HEURISTIC` |

Las cuatro últimas razones usan capacidades disponibles del snapshot, no máximos nominales. Si ya se agotó parte de la capacidad, se conserva la distinción entre exceso individual inicial y agotamiento por decisiones previas. Son códigos propuestos de clustering; ASSIGN-01 definirá su traducción al vocabulario común, sin fingir que todos existen en `AssignmentRejectionCode`.

### Límites y conexión con Chain/State

Es una heurística voraz reproducible, no garantiza mínimo número de vehículos, mínimo recorrido ni asignar todo lo globalmente factible. El orden por ID y la separación de grupos pueden dejar paquetes pendientes aun con capacidad total suficiente. Se documenta ese resultado y se habilita revisión manual posterior; no se afirma “imposible” ni se añade un optimizador para ocultarlo. Priority/deadline no intervienen en esta versión; su factibilidad corresponde al caso de uso posterior y cualquier cambio de orden deberá versionarse.

Complejidad esperada: agrupamiento `O(n²)` cálculos de distancia en el peor caso, ordenación `O(n log n)` y partición hasta `O(n·v)`, con almacenamiento lineal si se calculan distancias a demanda. No construir una matriz completa ni fijar un SLA sin mediciones. Documentar el tamaño de cada conjunto probado.

ASSIGN-01 consumirá las propuestas, aplicará SEQ-01 y validará con Chain tenant, duplicados, datos/geocodificación, attachment cuando corresponda, zona, vehículo, peso, volumen y mensajero. Releerá y reservará capacidad de forma transaccional, preservando Assignment como historial. Una propuesta válida puede dejar de ser factible por concurrencia: recalcular o devolver pendiente, nunca sobrecargar.

Los pendientes operativos deben terminar persistidos como `PENDING_ASSIGNMENT` mediante el modelo State y con razones consultables para revisión manual en la integración ASSIGN-01. CLUSTER-01 solo entrega el resultado. No muta `Package.state`, no emite `PackageAssigned` ni envía falta de capacidad a DLQ. Rechazos de autorización y duplicados no se convierten en pendientes operativos.

## Criterios de aceptación

| ID | Criterio verificable |
| --- | --- |
| CA-01 | Mismo snapshot, radio y versión producen igualdad completa de salida en ejecuciones repetidas y al permutar entradas de paquetes/vehículos; sin fecha, UUID aleatorio o dependencia del orden de consulta |
| CA-02 | Reutiliza Coordinates/Haversine de GEO-01; agrupa por zona y radio inclusivo a semilla fija; casos idénticos, aislados, límite y empate tienen resultado explícito |
| CA-03 | Cada propuesta satisface simultáneamente suma de peso y volumen `<=` capacidad disponible de su vehículo; totales exactos, un vehículo por propuesta y sin reutilización entre grupos |
| CA-04 | Cada paquete válido aparece exactamente una vez, propuesto o pendiente; no pérdida, duplicación, división ni grupos vacíos |
| CA-05 | Admite igualdad de límites; rechaza exceso de 1 g/1 cm³, precisión no representable, NaN/Infinity, negativos y desbordamiento seguro; disponible cero produce pendiente, no fallo técnico |
| CA-06 | No mezcla tenants ni zonas. Tenant ajeno en paquete o vehículo rechaza toda la ejecución; no se construyen propuestas parciales ni se filtran detalles ajenos |
| CA-07 | Lista vacía, flota vacía, exceso individual, agotamiento acumulado y capacidad conjunta incompatible tienen resultados estables; el fallo de un paquete no impide intentar los demás |
| CA-08 | Dominio puro y entradas sin mutación. Aplicación solo compone etapas; imports prohibidos se detectan automáticamente; ninguna escritura a base de datos o llamada a proveedor |
| CA-09 | Pruebas con resultados esperados calculados manualmente, build y regresión relevante pasan mediante Docker Compose; evidencia nueva con fecha/commit, sin reutilizar conteos históricos |
| CA-10 | ADR e informe explican política, parámetros, precisión, complejidad, limitaciones, consumidor y pendientes de integración; no presentan propuestas como rutas/asignaciones efectivas |

## Plan verificable

| Paso | Fase | Responsable | Estado | Dependencias | Objetivo | Aceptación | Evidencia |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Preflight, contrato y ADR | `USER` | `TODO` | GEO-01 inspeccionado | Fijar fronteras, algoritmo, unidades y ejemplos | Contrato adoptado y ADR; CA-01–07 sin ambigüedades | Auditoría estática de este plan; adopción pendiente |
| 2 | Especificación mediante pruebas | `USER` | `TODO` | 1 | Expresar resultados observables e invariantes | Fixtures y expectativas manuales, incluyendo pendientes y tenant | — |
| 3 | Tipos y cantidades exactas | `USER` | `TODO` | 1–2 | Normalizar unidades sin errores binarios | CA-05 y validación de contrato | — |
| 4 | Agrupamiento geográfico | `USER` | `TODO` | 2–3 | Implementar etapa A manual | CA-01, CA-02, partición de paquetes y zonas | — |
| 5 | Partición por capacidad | `USER` | `TODO` | 3–4 | Implementar etapa B y razones | CA-03, CA-04, CA-07 | — |
| 6 | Composición y contrato de consumo | `USER` | `TODO` | 4–5 | Ofrecer el prototipo desde aplicación | CA-06, CA-08 y frontera con ASSIGN explícita | — |
| 7 | Verificación reproducible | `CODEX_MECHANICAL` | `TODO` | 2–6 implementados por USER | Ejecutar pruebas/build, revisar diff y registrar fallos | CA-01–09 con evidencia real | — |
| 8 | Documentación y cierre | `CODEX_MECHANICAL` | `TODO` | 7 aprobado; revisión de Humberto | Actualizar informe, plan y referencias | CA-10 y Definition of Done aplicable | — |

## Paso actual

### Paso 1 — Preflight, contrato y ADR

**Por qué:** resolver radio, normalización, desempates y alcance de la capacidad antes de codificar evita resultados reproducibles pero incompatibles con GEO/VEH/ASSIGN.

**Estado:** `TODO`. **Responsable:** `USER` (Humberto, coordinando unidades con Vivian). **Dependencias:** GEO-01 disponible; auditoría inicial de este documento.

**Debe aplicar el usuario:**

1. Revisar el árbol de trabajo y crear una rama enfocada, por ejemplo `codex/cluster-01`, preservando los cambios ajenos y sin incluirlos en el futuro commit del módulo.
2. Adoptar o ajustar explícitamente el contrato y las dos etapas anteriores. Fijar un radio por ejecución; usar `1_000 m` en la demostración sintética sin declararlo radio óptimo de Barranquilla.
3. Registrar el ADR con título, estado, contexto, decisión, alternativas, consecuencias y fecha. Comparar al menos radio fijo frente a K-means y explicar por qué no se necesita determinar `k`, aleatoriedad ni un solver externo.
4. Acordar con Vivian las cadenas decimales, las escalas y el origen de capacidad disponible; documentar con Humberto/Vivian la frontera de ASSIGN sin implementar esa integración ahora.
5. Definir manualmente los resultados de los escenarios del paso 2 y qué comportamiento quedará pendiente para uso real.

**Archivos esperados:** este plan y `docs/adr/003-deterministic-capacity-clustering.md` (nuevo). El contrato puede vivir en el ADR y tipos del módulo; no crear otro documento vacío.

**Lote mecánico disponible para Codex:** sincronizar nombres, enlaces y decisiones ya adoptadas en la documentación. Scaffolding/imports solo mediante un pedido explícito con transformación determinada.

**Verificación:** contrastar el ADR con AGENTS.md §5/10/12/14, las firmas de GEO-01 y las escalas de Prisma; comprobar que ningún paso requiere ruta, migración o reserva para ejecutar clustering.

**Criterio de salida:** algoritmo, contrato, precisión, razones y ejemplos inequívocos registrados; ninguna dependencia conceptual sin resolver para comenzar pruebas.

**Evidencia obtenida:** inspección estática del commit auditado; no existe ADR de clustering todavía. **Decisiones y pendiente:** el diseño de este plan sigue propuesto hasta que USER registre su adopción.

## Fichas de implementación

Las rutas nuevas siguientes son propuestas. Mantenerlas dentro de route-planning y adaptarlas al contrato adoptado, sin crear capas vacías.

### Paso 2 — Pruebas y conjuntos deterministas

**Objetivo y razón:** demostrar resultados de negocio antes de implementar, evitando pruebas que solo reproduzcan los bucles del algoritmo.

**Estado:** `TODO`. **Responsable:** `USER`. **Dependencias:** 1.

**Debe aplicar el usuario:** preparar fixtures explícitos para dos tenants, varias zonas y flota heterogénea; escribir pruebas con oráculos manuales y estilo de las suites existentes. Consultar `sls-test-normalization` al escribir los tests. Cubrir al menos:

| Escenario | Datos/resultados esperados |
| --- | --- |
| Proximidad conocida | Una zona; A=(0,0), B=(0,0.005), C=(0,0.03); radio 1.000 m → grupos {A,B}, {C}; IDs ordenados A<B<C |
| Radio e igualdad | Radio igual a distancia GEO-01 entre A/B → B incluido; reducirlo 1 m → separado; coordenadas idénticas conservan ambos IDs |
| Peso y volumen exactos | Grupo A/B/C con cargas A=4 kg/0.2 m³, B=6 kg/0.3 m³, C=1 kg/0.1 m³; V1=10 kg/0.5 m³, V2=5 kg/0.25 m³ → V1:{A,B}, V2:{C}, con orden de miembros A/B/C |
| Bordes de precisión | 0.1+0.2 kg cabe exactamente en 0.3 kg tras normalizar; exceso de 0.001 kg o 0.000001 m³ queda pendiente |
| Capacidad conjunta | V1=10 kg/0.1 m³, V2=1 kg/1 m³; paquete de 5 kg/0.5 m³ → `NO_JOINT_CAPACITY`, aunque cada magnitud cabe por separado |
| Continuación | Un paquete sobredimensionado precede a otro que sí cabe → primero pendiente, segundo propuesto |
| Flota compartida entre grupos | Dos grupos distantes y un vehículo → no se usa su capacidad dos veces; el segundo grupo queda pendiente según política |
| Contrato/tenant | IDs duplicados, cantidad inválida o tenant B en una llamada A → rechazo total; mismo destino en zonas distintas no mezcla grupos |
| Reproducción e inmutabilidad | Permutaciones de paquetes y vehículos, llamadas repetidas y entradas congeladas producen mismo resultado sin mutación |
| Vacíos | Paquetes vacíos → éxito vacío; vehículos vacíos con paquetes válidos → todos pendientes |

**Archivos esperados:** `backend/src/modules/route-planning/test/fixtures/clustering.fixture.ts`, `clustering-quantities.spec.ts`, `radius-clustering.spec.ts` y `capacity-cluster-partitioner.spec.ts` bajo el mismo directorio `test/`.

**Lote mecánico disponible:** adaptar estructura/imports de fixtures después de que USER defina los casos y lo solicite. Los oráculos y reglas son responsabilidad USER.

**Verificación y criterio de salida:** cada CA tiene al menos un caso identificable; expectativas independientes del código futuro; fallos iniciales por implementación ausente quedan registrados sin presentarlos como regresión.

**Evidencia obtenida:** ninguna. **Decisiones y pendiente:** concretar IDs, coordenadas y capacidades de cada fixture y registrar su resultado esperado.

### Paso 3 — Contratos y normalización exacta

**Objetivo y razón:** proteger la capacidad frente a errores de redondeo y datos inválidos antes del agrupamiento.

**Estado:** `TODO`. **Responsable:** `USER`. **Dependencias:** 1–2.

**Debe aplicar el usuario:** implementar tipos inmutables de entrada/salida, error de contrato con códigos estables y conversiones decimales exactas. Validar rangos seguros en acumulaciones, no solo en campos individuales. Recibir `Coordinates` válidas; reutilizar `Coordinates.parse` únicamente en la frontera que acepte entrada cruda. No introducir Prisma.Decimal, librerías nuevas ni casts para evadir validación.

**Archivos esperados:** `backend/src/modules/route-planning/domain/clustering.types.ts`, `clustering-quantities.ts`, `invalid-clustering-input.error.ts` y las suites del paso 2.

**Lote mecánico disponible:** exports/imports repetitivos con nombres acordados y pedido explícito; no implementación de conversiones o reglas por el agente.

**Verificación y criterio de salida:** casos de precisión, valores inválidos, cero disponible, igualdad y overflow pasan; normalización reversible a cadenas kg/m³ sin pérdida; dominio no importa frameworks.

**Evidencia obtenida:** ninguna. **Decisiones y pendiente:** nombres finales del error y de la utilidad compartible; no modificar handlers existentes aquí.

### Paso 4 — Agrupamiento por radio

**Objetivo y razón:** implementar la proximidad como operación separada de la política de flota y de Chain.

**Estado:** `TODO`. **Responsable:** `USER`. **Dependencias:** 2–3.

**Debe aplicar el usuario:** implementar la etapa A con semillas fijas, separación por zona y comparación ordinal. Usar Haversine de GEO-01 sin redondear distancias para decidir pertenencia. Mantener identidad estable de grupos y no mutar listas. No añadir centroides, aleatoriedad ni llamadas de infraestructura.

**Archivos esperados:** `backend/src/modules/route-planning/domain/radius-clustering.ts` y `backend/src/modules/route-planning/test/radius-clustering.spec.ts`.

**Lote mecánico disponible:** sincronizar exports/documentación una vez fijada la firma; lógica de agrupamiento a cargo de USER.

**Verificación y criterio de salida:** CA-01/02, grupos pequeños conocidos, empate, frontera, separación por zonas e inmutabilidad pasan; cada paquete aparece una vez en esta etapa, sin consultar vehículos.

**Evidencia obtenida:** ninguna. **Decisiones y pendiente:** registrar complejidad observada y límites del radio respecto al diámetro; no confundir orden de construcción con itinerario.

### Paso 5 — Partición por peso y volumen

**Objetivo y razón:** entregar grupos transportables según el snapshot sin convertir el prototipo en un asignador transaccional.

**Estado:** `TODO`. **Responsable:** `USER`. **Dependencias:** 3–4.

**Debe aplicar el usuario:** implementar etapa B, primer ajuste estable y ledger local de vehículos ya utilizados. Descontar gramos y cm³ simultáneamente; no abrir una propuesta si el paquete no cabe. Calcular totales sin dobles conteos y aplicar la precedencia de razones. Devolver pendientes y continuar procesando. Registrar explícitamente el caso factible globalmente que queda pendiente por la heurística.

**Archivos esperados:** `backend/src/modules/route-planning/domain/capacity-cluster-partitioner.ts`, tipos de clustering y `backend/src/modules/route-planning/test/capacity-cluster-partitioner.spec.ts`.

**Lote mecánico disponible:** propagación de nombres/códigos ya decididos y documentación a petición; reglas y expectativas nuevas a cargo de USER.

**Verificación y criterio de salida:** CA-03/04/05/07 pasan; ninguna propuesta excede un recurso, repite vehículo o pierde paquetes. Validar flota heterogénea, falta de capacidad conjunta y agotamiento acumulado.

**Evidencia obtenida:** ninguna. **Decisiones y pendiente:** confirmar que las razones describen el snapshot/política y no una imposibilidad global; integración con vocabulario de ASSIGN permanece posterior.

### Paso 6 — Servicio de aplicación y frontera de integración

**Objetivo y razón:** ofrecer una capacidad utilizable por ASSIGN-01 con dominio puro y orquestación en aplicación.

**Estado:** `TODO`. **Responsable:** `USER`. **Dependencias:** 4–5.

**Debe aplicar el usuario:** crear el servicio que recibe el snapshot confiable, valida el contrato y compone las dos etapas. Probar rechazo temprano de tenant mezclado sin salida parcial. Publicar resultado tipado y documentar la correspondencia hacia SEQ/Chain/State. Instanciar el servicio sin NestJS en tests; usar el módulo solo como composición si se exporta el proveedor. Añadir reglas automáticas de imports para las nuevas unidades; aislar y documentar deuda preexistente sin reescribirla.

**Archivos esperados:** `backend/src/modules/route-planning/application/cluster-packages.service.ts`, `test/cluster-packages.service.spec.ts`, `test/clustering-architecture.spec.ts` y, si corresponde, `route-planning.module.ts`/`domain/index.ts` y su prueba de composición.

**Lote mecánico disponible:** wiring/imports/exports después de una firma y mapa de cambios acordados, con solicitud explícita.

**Verificación y criterio de salida:** CA-06/08; tests de composición recorren ambas etapas reales sin base de datos ni mocks de los algoritmos. Se demuestra contrato de consumo, no creación de rutas, acceso HTTP ni aislamiento de un repositorio aún inexistente.

**Evidencia obtenida:** ninguna. **Decisiones y pendiente:** adapters de carga, reservas concurrentes, transición a pendiente e integración HTTP permanecen en ASSIGN-01; no crear puertos de persistencia sin uso real.

### Paso 7 — Verificación reproducible

**Objetivo y razón:** separar implementación de verificación y obtener evidencia suficiente del módulo puro.

**Estado:** `TODO`. **Responsable:** `CODEX_MECHANICAL`. **Dependencias:** pasos 2–6 implementados por USER.

**Debe aplicar el usuario:** entregar cambios revisables; resolver los fallos conceptuales que la verificación encuentre. Codex ejecuta los comandos siguientes cuando se trabaje este paso y registra salida, fecha, commit y modificaciones locales relevantes.

**Archivos esperados:** suites implementadas e informe `docs/modules/cluster-01-report.md` (nuevo); no modificar código ajeno para obtener verde.

**Lote mecánico disponible:** ejecución de checks, revisión del diff y documentación. Correcciones de imports/formato únicamente si están determinadas y se solicitan; cualquier cambio de reglas vuelve a USER.

**Verificación y criterio de salida:** build y suites relevantes aprobados; todos los CA vinculados a pruebas/evidencias. Si falla algo preexistente, identificarlo con evidencia y registrar su impacto sin declarar verificación completa.

**Evidencia obtenida:** ninguna; estos comandos todavía no se ejecutaron. **Decisiones y pendiente:** la prueba de tenant en memoria no acredita aislamiento de consultas SQL ni HTTP; distinguirlo en el informe.

### Paso 8 — Documentación y cierre

**Objetivo y razón:** conservar decisiones y evidencia para revisión académica y la integración posterior.

**Estado:** `TODO`. **Responsable:** `CODEX_MECHANICAL`. **Dependencias:** 7 aprobado y revisión funcional de Humberto.

**Debe aplicar el usuario:** revisar que ejemplos, limitaciones y contrato representen su implementación; identificar pendientes de integración con Vivian sin cambiar alcance durante el cierre.

**Archivos esperados:** este plan, `docs/modules/cluster-01-report.md`, ADR del paso 1 y referencias de progreso del MVP. Actualizar tablero únicamente cuando se haya contrastado su aceptación con evidencia.

**Lote mecánico disponible:** sincronizar estado, enlaces bidireccionales plan/informe, comandos reales, resultados y commits existentes. No crear un commit sin solicitud expresa.

**Verificación y criterio de salida:** CA-10 y lista de cierre satisfechos. Informe separa implementado, verificado, documentado y confirmado en commit. `DONE` solo declara el alcance del prototipo; el flujo de planificación completo sigue dependiendo de ASSIGN-01/SEQ-01 y recursos operativos.

**Evidencia obtenida:** ninguna de implementación. **Decisiones y pendiente:** conservar cada punto completado y las limitaciones sin borrar pendientes para aparentar una integración terminada.

## Verificación reproducible

Desde la raíz del repositorio, usar exclusivamente Docker Compose para herramientas del proyecto. Consultar servicios con `docker compose ps`; si no están iniciados, seguir §22 de AGENTS.md. Una ejecución puntual puede usar `docker compose run --rm backend ...` en lugar de `exec`.

Línea base GEO-01 antes de implementar:

```bash
docker compose exec backend npm test -- --runInBand --runTestsByPath src/modules/route-planning/test/coordinates.spec.ts src/modules/route-planning/test/haversine.spec.ts
```

Tras implementar las nuevas suites (no anunciar pruebas inexistentes como disponibles):

```bash
docker compose exec backend npm test -- --runInBand --testPathPatterns=modules/route-planning/test
docker compose exec backend npm test -- --runInBand --testPathPatterns=modules/assignments/test
docker compose exec backend npm run build
```

La segunda ejecución comprueba regresión del consumidor existente; no prueba integración productiva CLUSTER → ASSIGN. Registrar tamaños de fixtures, casos cubiertos y resultados reales. Repetir comprobaciones solo tras cambios o fallos que lo justifiquen. No requiere frontend, PostGIS, migraciones ni pruebas E2E con base de datos para este alcance puro.

Respetar formato y convenciones de §21/25 de AGENTS.md con revisión acotada. No ejecutar `npm run lint` backend durante revisión de solo lectura, porque incluye `--fix`, ni añadir una fase independiente de formato. Si posteriormente se amplía a persistencia, preparar otra tarea con servidor desechable y la [guía de integración](../../backend/test/integration/README.md); no usar la base compartida para fixtures.

## Decisiones

| Fecha | Decisión | Motivo | Consecuencia |
| --- | --- | --- | --- |
| 2026-10-02 | Proponer radio con semilla fija y primer ajuste por capacidad en etapas separadas | Algoritmo manual explicable; requisito determinista y MVP acotado | USER formaliza ADR en paso 1; no es optimización global |
| 2026-10-02 | Reutilizar GEO-01 y medir radio en metros | Contrato implementado en `a8973fb` | No duplicar validación ni Haversine |
| 2026-10-02 | Proponer cálculo entero exacto manteniendo kg/m³ públicos | Escalas de Prisma y seguridad en límites de capacidad | Cadenas decimales, validación de precisión y rango; sin migración |
| 2026-10-02 | Tratar vehículo como candidato y snapshot como información no reservada | La concurrencia se resuelve en asignación | ASSIGN revalida, reserva y mantiene historial/State |
| 2026-10-02 | Separar zona operativa de cluster calculado | Evitar que una heurística cambie clasificación de negocio | Partición por zona; ninguna escritura en catálogos |
| 2026-10-02 | Registrar solo auditoría estática en esta entrega | Solicitud de plan y árbol con cambios locales ajenos | No presentar pruebas históricas como actuales ni modificar implementación |

## Bitácora de progreso

| Fecha | Paso | Cambio observado | Verificación | Commit |
| --- | --- | --- | --- | --- |
| 2026-10-02 | Auditoría inicial | GEO-01 disponible; clustering ausente en las fuentes inspeccionadas; esquema dividido con kg/m³ y Chain existente | Lectura de AGENTS completo, skill/plantilla, planes, código, esquema, ADR y Git; sin ejecución de aplicación | Base `a8973fb` |
| 2026-10-02 | Planificación | Plan completo con diseño propuesto, CA, pasos USER/CODEX_MECHANICAL y fronteras de ASSIGN | Revisión documental; implementación y pruebas pendientes | Este plan sin commit |

## Cierre

- [ ] Contrato y ADR del algoritmo adoptados y concordantes con el código.
- [ ] CA-01 a CA-10 satisfechos con evidencia identificable.
- [ ] Determinismo, precisión kg/m³, radio, capacidad y conservación de paquetes demostrados.
- [ ] Rechazo de mezcla de tenants y separación por zonas comprobados.
- [ ] Fronteras Clean Architecture e inmutabilidad comprobadas automáticamente.
- [ ] Build, suites nuevas y regresiones pertinentes aprobados mediante Compose.
- [ ] Convenciones y formato revisados de manera acotada.
- [ ] Migración/infraestructura no requeridas para el alcance puro; cualquier cambio de alcance justificado por separado.
- [ ] Informe actualizado por paso y enlazado con plan y ADR; conteos/fechas/commits reales.
- [ ] Limitaciones de la heurística y pendientes de ASSIGN/SEQ/State documentados.
- [ ] Estado del plan y tablero contrastados con repositorio; `DONE` no implica flujo end-to-end completo.
- [ ] Cambios ajenos preservados; estado de commit declarado sin asumir que existe.
