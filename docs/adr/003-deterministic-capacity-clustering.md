# ADR-003: Agrupamiento determinista por proximidad geográfica y capacidad de flota

Fecha: 2026-10-02

Estado: Aceptado para implementación

## Contexto

En Smart Logistics System (SLS), los paquetes clasificados pendientes de asignación deben agruparse por proximidad geográfica y proponerse para asignación a vehículos disponibles respetando restricciones simultáneas de peso y volumen.

Requisitos clave del proyecto (según `AGENTS.md` §5, §10 y §12):
1. Algoritmo manual implementado por el equipo, comprensible, reproducible y sin dependencias de motores externos o heurísticas de caja negra (sin OR-Tools, solvers externos ni bibliotecas de clustering propietarias).
2. Determinismo absoluto: para una misma entrada de paquetes, vehículos y radio, el resultado debe ser idéntico sin importar el orden de llegada en la colección, sin aleatoriedad, sin reloj y sin dependencia del entorno.
3. Precisión estricta en capacidades: evitar errores de redondeo inherentes a la representación de punto flotante binario (IEEE 754) en JavaScript.
4. Clean Architecture: el agrupamiento es un cálculo puro de dominio/aplicación. Genera **propuestas** factibles basadas en un snapshot; no reserva transaccionalmente capacidad ni muta estados de paquetes o rutas.

## Decisión

### 1. Algoritmo manual determinista en dos etapas desacopladas

Se adopta una separación clara entre la proximidad geográfica y la restricción física de capacidad de flota:

- **Etapa A — Agrupamiento por radio inclusivo con semilla fija:**
  1. Particionar los paquetes por `zoneId`. Cada zona se procesa de forma estrictamente aislada (un cluster calculado no cruza zonas ni crea/modifica entidades `Zone`).
  2. Ordenar las zonas y los paquetes de cada zona mediante comparación ordinal determinista de sus identificadores (`zoneId`, `packageId`).
  3. Dentro de cada zona, mientras queden paquetes sin agrupar, seleccionar como **semilla** el paquete no agrupado con el menor `packageId`.
  4. Incorporar al grupo todos los paquetes restantes de la misma zona cuya distancia Haversine a la semilla sea $\le \text{radiusMeters}$ (utilizando el Value Object `Coordinates` y `calculateHaversineDistance` de `GEO-01`).
  5. Ordenar los miembros del grupo resultante por distancia ascendente a la semilla y, en caso de empate, por `packageId` ordinal ascendente.
  6. Marcar los paquetes seleccionados como agrupados y repetir hasta agotar los paquetes de la zona.
  *Nota sobre la semilla:* La semilla permanece fija en el paquete inicial; no se recalculan centroides geométricos para evitar oscilaciones o inestabilidad numérica.

- **Etapa B — Partición de grupos por capacidad (*First-Fit* determinista):**
  1. Procesar los grupos en el orden canónico generado en la Etapa A (orden de zona y `packageId` de semilla).
  2. Ordenar los vehículos candidatos del snapshot por `vehicleId` ascendente.
  3. Para cada paquete (en orden de construcción del grupo):
     - Intentar asignarlo a alguna propuesta ya abierta para ese grupo geográfico (evaluadas en orden de creación / `candidateVehicleId`).
     - Si no cabe en ninguna propuesta abierta del grupo, buscar en la lista ordenada de vehículos el primer vehículo que aún **no** haya sido asignado a ninguna propuesta en toda la ejecución y que cuente con capacidad disponible simultánea de peso y volumen para el paquete.
     - Si se encuentra dicho vehículo, se abre una nueva propuesta para el grupo respaldada por ese vehículo y se descuentan sus recursos.
     - Si el paquete no puede acomodarse bajo esta política, se agrega a la lista de `pendingPackages` con una razón explícita y se continúa evaluando los paquetes restantes (un paquete pesado no bloquea la evaluación de paquetes posteriores más livianos).

### 2. Aritmética entera exacta (Gramos y Centímetros Cúbicos)

- Los contratos públicos, interfaces de API y persistencia en Prisma manejan peso en kilogramos (`kg`, escala de 3 decimales, `Decimal(10,3)`) y volumen en metros cúbicos (`m³`, escala de 6 decimales, `Decimal(12,6)`).
- En el dominio de clustering, las cadenas decimales se validan rigurosamente mediante lectura directa y se convierten a enteros exactos:
  $$\text{peso en gramos} = \text{kg} \times 1\,000$$
  $$\text{volumen en cm}^3 = \text{m}^3 \times 1\,000\,000$$
- Se verifica `Number.isSafeInteger` en cada conversión y operación aritmética. No se permiten tolerancias ($\epsilon$) para admitir sobrecargas: la capacidad disponible es un límite estricto.

### 3. Precedencia y estabilidad de razones para paquetes pendientes

Para garantizar observabilidad y pruebas reproducibles, los paquetes no asignados reciben códigos de razón con la siguiente precedencia:
1. `NO_AVAILABLE_VEHICLE`: El snapshot no suministró vehículos elegibles o la flota inicial está vacía.
2. `WEIGHT_CAPACITY_EXCEEDED`: Ningún vehículo del snapshot tiene capacidad individual de peso para transportar el paquete.
3. `VOLUME_CAPACITY_EXCEEDED`: El paquete cabe en peso en algún vehículo, pero ningún vehículo del snapshot soporta su volumen individual.
4. `NO_JOINT_CAPACITY`: El paquete cabe en peso en un vehículo y en volumen en otro, pero ningún vehículo individual soporta simultáneamente ambos recursos.
5. `CAPACITY_EXHAUSTED_BY_HEURISTIC`: El paquete es transportable individualmente por vehículos del snapshot, pero la capacidad fue consumida o comprometida por asignaciones previas de la heurística.

### 4. Aislamiento por Tenant y Clean Architecture

- La ejecución exige un único `tenantId` consistente. Si algún paquete o vehículo pertenece a un tenant diferente, la ejecución se rechaza íntegramente mediante `InvalidClusteringInputError('TENANT_MISMATCH')` sin emitir resultados parciales.
- El módulo no realiza consultas a base de datos, no ejecuta transacciones Prisma ni publica eventos RabbitMQ. Entrega un objeto inmutable `ClusteringResult` para consumo del caso de uso de asignación (`ASSIGN-01`), donde se ejecutan la cadena de validación (Chain of Responsibility), la reserva transaccional y la persistencia de `PENDING_ASSIGNMENT` en el ciclo de vida del paquete (`State`).

## Alternativas

- **K-Means estándar:** Descartado. Requiere prefijar el número de clusters $k$ antes de conocer la densidad espacial, utiliza inicializaciones pseudoaleatorias (sensibles a la semilla) y converge mediante iteraciones de centroides que pueden generar resultados distintos o empates inestables.
- **DBSCAN:** Descartado por complejidad innecesaria para el MVP (manejo de ruido, densidad variable $MinPts$, encadenamiento arbitrario de clusters que dificulta la partición de capacidad).
- **Optimización combinatorial exacta (MILP / OR-Tools / VRP Solver):** Descartado. Viola la restricción de diseño de implementar algoritmos manuales comprensibles para el MVP y añade dependencias externas no autorizadas.
- **Agrupamiento simultáneo con capacidad en un solo paso:** Descartado. Mezclar la proximidad geográfica con el empaquetado de contenedores (Bin Packing) en una sola función oscurece las razones de rechazo y acopla la topología espacial a la disponibilidad de flota.

## Consecuencias

- **Positivas:**
  - 100% determinista, reproducible y verificable con oráculos calculados manualmente en suites de pruebas unitarias.
  - Tiempos de ejecución ultra-rápidos ($O(n^2)$ en distancias, $O(n \log n)$ en ordenamiento, $O(n \cdot v)$ en partición) sin llamadas a I/O.
  - Cero discrepancias por redondeo de punto flotante en límites de capacidad.
  - Explicabilidad completa: se conoce con precisión por qué un paquete fue asignado a un grupo y por qué quedó pendiente.
- **Negativas / Limitaciones conocidas:**
  - Al ser una heurística voraz (*greedy First-Fit*), no garantiza el número mínimo de vehículos ni un óptimo global de empaquetado.
  - La distancia considerada dentro del grupo es la distancia geográfica a la semilla, no el diámetro máximo del grupo ni la distancia en red vial.
  - Paquetes que queden pendientes por la heurística requieren revisión manual o reprogramación por el coordinador de rutas (`ASSIGN-01`).
