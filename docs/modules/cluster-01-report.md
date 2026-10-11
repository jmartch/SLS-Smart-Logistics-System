# CLUSTER-01 — Agrupamiento determinista por proximidad y capacidad

Estado: **DONE para el alcance definido**.

Plan de trabajo: [CLUSTER-01](../plans/cluster-01.md).

## Alcance verificado

- **Preflight e integración de base:** Fusión limpia de `origin/feature/geo-01` en `feature/cluster-01` con verificación de baseline (`Coordinates` y `calculateHaversineDistance`).
- **Decisión y ADR-003:** [ADR-003: Agrupamiento determinista por proximidad geográfica y capacidad de flota](../adr/003-deterministic-capacity-clustering.md).
- **Abstracción Strategy (GoF):** Interfaz pura `GeographicClusteringAlgorithm` en `domain/algorithms/`.
- **Contratos inmutables de dominio:** `ClusteringPackageInput`, `ClusteringVehicleInput`, `GeographicCluster`, `CapacityClusterProposal`, `ClusteringPendingPackage`, `ClusteringResult` y códigos estables de error `InvalidClusteringInputError`.
- **Aritmética entera exacta:** `parseKgToGrams` ($\times 1\,000$, escala 3), `parseM3ToCm3` ($\times 1\,000\,000$, escala 6), `gramsToKg` y `cm3ToM3` con verificación estricta de `Number.isSafeInteger`.
- **Etapa A (Agrupamiento Geográfico por Radio):** `RadiusClustering` con semilla fija (paquete con menor `packageId` de la zona), radio inclusivo Haversine, ordenación por distancia y desempate ordinal sin mutación de colecciones.
- **Etapa B (Partición por Capacidad de Flota):** `FirstFitCapacityPartitioner` evaluando propuestas abiertas del grupo y primer ajuste sobre flota disponible. Un vehículo por propuesta en toda la ejecución y clasificación estricta de razones para paquetes pendientes.
- **Servicio de Aplicación:** `ClusterPackagesService` que valida `tenantId` transversal e inyecta ambas etapas sin acoplamiento a frameworks.
- **Fronteras arquitectónicas:** Pruebas de reglas de importación automatizadas (`clustering-architecture.spec.ts`) que comprueban que el dominio no importe NestJS, Prisma, infraestructura ni capas externas.

## Implementación por puntos

### Punto 1 — Preflight, Contratos y ADR-003
- Objetivo: Integrar dependencias espaciales de GEO-01, adoptar ADR-003 y definir los contratos e interfaces de dominio.
- Decisión: Algoritmo manual en dos etapas (radio voraz con semilla fija + First-Fit por capacidad) y patrón Strategy con `GeographicClusteringAlgorithm`.
- Archivos:
  - `docs/adr/003-deterministic-capacity-clustering.md`
  - `backend/src/modules/route-planning/domain/algorithms/geographic-clustering-algorithm.ts`
  - `backend/src/modules/route-planning/domain/models/clustering.types.ts`
  - `backend/src/modules/route-planning/domain/models/invalid-clustering-input.error.ts`
- Resultado: Tipos inmutables, error tipado y Strategy definidos bajo Clean Architecture.
- Evidencia: Compilación limpia `npm run build`.
- Pendiente: Ninguno.

### Punto 2 & 3 — Aritmética Entera Exacta y Fixtures
- Objetivo: Proteger las capacidades frente a anomalías de punto flotante IEEE 754 de JavaScript.
- Decisión: Convertir `kg` a gramos enteros y `m³` a $\text{cm}^3$ enteros sin `parseFloat`.
- Archivos:
  - `backend/src/modules/route-planning/domain/models/clustering-quantities.ts`
  - `backend/src/modules/route-planning/test/clustering-quantities.spec.ts`
- Resultado: 12 tests unitarios pasando, cubriendo parsing, formato, validación de escala, ceros y desbordamientos.
- Evidencia: 12/12 tests pasando en Docker.
- Pendiente: Ninguno.

### Punto 4 — Etapa A: Agrupamiento por Radio (`RadiusClustering`)
- Objetivo: Agrupar paquetes por cercanía espacial respetando fronteras de zonas operativas.
- Decisión: Bucle voraz determinista con semilla fija en el menor ID no agrupado, distancia Haversine $\le \text{radiusMeters}$, y orden de miembros por distancia y desempate ordinal.
- Archivos:
  - `backend/src/modules/route-planning/domain/algorithms/radius-clustering.ts`
  - `backend/src/modules/route-planning/test/radius-clustering.spec.ts`
- Resultado: 11 tests unitarios pasando, demostrando determinismo ante permutaciones, límites de radio, empate por ID y aislamiento por zona.
- Evidencia: 11/11 tests pasando en Docker.
- Pendiente: Ninguno.

### Punto 5 — Etapa B: Partición por Capacidad (`FirstFitCapacityPartitioner`)
- Objetivo: Generar propuestas factibles asignando vehículos a los clusters geográficos según peso y volumen disponibles.
- Decisión: Heurística First-Fit con ledger local de vehículos comprometidos y precedencia de razones para paquetes pendientes (`NO_AVAILABLE_VEHICLE`, `WEIGHT_CAPACITY_EXCEEDED`, `VOLUME_CAPACITY_EXCEEDED`, `NO_JOINT_CAPACITY`, `CAPACITY_EXHAUSTED_BY_HEURISTIC`).
- Archivos:
  - `backend/src/modules/route-planning/domain/algorithms/capacity-cluster-partitioner.ts`
  - `backend/src/modules/route-planning/test/capacity-cluster-partitioner.spec.ts`
- Resultado: 12 tests unitarios pasando, demostrando que paquetes pesados no bloquean a los siguientes, no reutilización de vehículos entre clusters y razones estables.
- Evidencia: 12/12 tests pasando en Docker.
- Pendiente: Ninguno.

### Punto 6 — Servicio de Aplicación y Frontera Arquitectónica
- Objetivo: Orquestar el flujo desde la capa de aplicación y verificar la independencia de capas.
- Decisión: `ClusterPackagesService` instanciable sin NestJS para pruebas, exportado en `RoutePlanningModule`.
- Archivos:
  - `backend/src/modules/route-planning/application/cluster-packages.service.ts`
  - `backend/src/modules/route-planning/test/cluster-packages.service.spec.ts`
  - `backend/src/modules/route-planning/test/clustering-architecture.spec.ts`
  - `backend/src/modules/route-planning/route-planning.module.ts`
  - `backend/src/modules/route-planning/domain/index.ts`
- Resultado: 26 tests pasando (3 de servicio + 23 de arquitectura), validando que ningún archivo de dominio importe NestJS, Prisma ni capas externas.
- Evidencia: 26/26 tests pasando en Docker.
- Pendiente: Ninguno.

## Decisiones técnicas

1. **Aritmética en enteros de 64 bits seguros:** Toda suma y comparación de capacidad se realiza en gramos y $\text{cm}^3$, evitando desajustes de precisión en los bordes de capacidad.
2. **Strategy Pattern (GoF):** `GeographicClusteringAlgorithm` permite intercambiar el algoritmo de radio por futuros algoritmos como K-means sin alterar la orquestación.
3. **Inmutabilidad y Determinismo:** Salidas congeladas con `Object.freeze` y ordenaciones ordinales estrictas (`a < b ? -1 : a > b ? 1 : 0`), inmunes a variaciones de locale o entornos de ejecución.
4. **Propuestas vs. Reservas:** CLUSTER-01 genera propuestas basadas en un snapshot en memoria; no muta estados ni reserva en base de datos. La reserva transaccional pertenece a ASSIGN-01.

## Verificación reproducible

```bash
# 1. Compilación TypeScript
docker compose exec backend npm run build

# 2. Pruebas unitarias exclusivas de CLUSTER-01
docker compose exec backend npm test -- --runInBand --testPathPatterns=modules/route-planning/test/.*cluster.*

# 3. Suite completa de route-planning (16 suites / 141 tests)
docker compose exec backend npm test -- --runInBand --testPathPatterns=modules/route-planning/test

# 4. Regresión del consumidor assignments (3 suites / 38 tests)
docker compose exec backend npm test -- --runInBand --testPathPatterns=modules/assignments/test

# 5. Suite general completa de regresión (46 suites / 361 tests)
docker compose exec backend npm test -- --runInBand
```

Resultados observados:
- **Build:** Compilación NestJS limpia sin errores de tipos.
- **Suites de CLUSTER-01:** 5 suites creadas / 61 tests aprobados (0 fallos).
- **Módulo route-planning:** 16 suites / 141 tests aprobados (100%).
- **Regresión completa:** 46 suites / 361 tests aprobados (100% verde).

## Estado en el entorno compartido

- Rama de trabajo: `feature/cluster-01`.
- Base integrada: `origin/feature/geo-01` (`b7f0ddb`).
- Estado de base de datos: Sin cambios requeridos; el algoritmo es de dominio puro en memoria.

## Trabajo fuera de alcance

- Ordenamiento de paradas mediante Nearest Neighbor / 2-opt (`SEQ-01`).
- Creación de rutas, reserva transaccional y asignación física (`ASSIGN-01` / `ROUTE-01`).
- Endpoints HTTP o persistencia en tablas de base de datos para clusters.

## Cierre

El módulo CLUSTER-01 cumple satisfactoriamente con los criterios de aceptación `CA-01` a `CA-10` definidos en su plan canónico.
