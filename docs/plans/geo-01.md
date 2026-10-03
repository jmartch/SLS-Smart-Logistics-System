# Plan de GEO-01 — Validación de coordenadas y distancia Haversine

## Identidad

| Campo | Valor |
| --- | --- |
| Módulo | `GEO-01` |
| Dominio | Coordenadas geográficas y cálculo de distancia Haversine |
| Estado general | `DONE` |
| Asignación | Humberto; confirmado en AGENTS.md |
| Rama observada | `develop` |
| Última auditoría | 2026-10-02 |
| Commit auditado | `5a6520e` |
| Informe | [GEO-01](../modules/geo-01-report.md) |
| Dependencias | `FOUND-01` (completada) |
| Consumidores | `CLUSTER-01`, `SEQ-01`, `ASSIGN-01`, clasificación geográfica |

## Alcance

### Incluido

- Value Object inmutable `Coordinates` (`latitude: [-90, 90]`, `longitude: [-180, 180]`).
- Métodos de fábrica estrictos (`create` numérico) y flexibles (`parse` admitiendo cadenas numéricas y numbers).
- Error de dominio tipado `InvalidCoordinatesError` con razones específicas: `INVALID_FORMAT`, `LATITUDE_OUT_OF_RANGE`, `LONGITUDE_OUT_OF_RANGE`, `NON_FINITE_COORDINATE`.
- Algoritmo matemático manual de distancia Haversine con `Math.atan2` numéricamente estable y radio terrestre canónico $R = 6,371,000\text{ m}$.
- Métodos de igualdad por valor (`equals(other, tolerance?)`) y conversión de unidades (`haversineMetersToKilometers`).
- Cobertura de pruebas unitarias exhaustivas según `sls-test-normalization`: validaciones de rango, edge cases (NaN, Infinity, polos, cruce de antimeridiano) y distancias conocidas de referencia en Barranquilla / Colombia.

### Fuera de alcance

- Geocodificación inversa o directa basada en catálogo (`GEOCODE-01`).
- Algoritmo de clustering (`CLUSTER-01`).
- Ordenamiento de paradas nearest-neighbor (`SEQ-01`).
- Persistencia o tablas de base de datos directas para coordenadas.

## Dependencias y fuentes

- `AGENTS.md`: sección 12 ("Route-planning algorithms: Parse and validate numeric latitude/longitude, Implement Haversine distance manually") y tabla P1 de planificación (`GEO-01`).
- Clean Architecture (§8): Dominio desacoplado sin frameworks externos.

## Diagnóstico actual

- Implementado el Value Object `Coordinates`, `InvalidCoordinatesError`, función `calculateHaversineDistance` y helper `haversineMetersToKilometers` bajo Clean Architecture en `backend/src/modules/route-planning/domain/`.
- 11 suites y 80 tests unitarios aprobados en `src/modules/route-planning/`.
- Regresión general del backend en Docker aprobada: 41 suites y 300 tests unitarios aprobados al 100%.

## Plan verificable

| Paso | Fase | Responsable | Estado | Objetivo | Aceptación | Evidencia |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Dominio: Error y Value Object | `USER` | `DONE` | Crear `InvalidCoordinatesError` y `Coordinates` | Parseo, validación y tipos correctos | Compilación TypeScript limpia en Docker (`docker compose exec backend npm run build`) |
| 2 | Dominio: Haversine | `USER` | `DONE` | Crear función pura `calculateHaversineDistance` y helper | Distancia calculada en metros y km | Compilación TypeScript limpia en Docker |
| 3 | Exportaciones de dominio | `USER` | `DONE` | Exportar en `index.ts` del dominio | Tipos públicos accesibles | Compilación TypeScript limpia en Docker |
| 4 | Pruebas unitarias | `USER` | `DONE` | Crear suites exhaustivas `coordinates.spec.ts` y `haversine.spec.ts` | Puntos conocidos, límites y bordes cubiertos | 80/80 tests pasando en Docker |
| 5 | Auditoría y Cierre | `CODEX_MECHANICAL` | `DONE` | Ejecutar tests en Docker, auditar arquitectura y documentar | 100% pruebas aprobadas sin regresiones | 41 suites / 300 tests pasando |

## Paso actual

### Paso 4 — Creación de Pruebas Unitarias (`coordinates.spec.ts` y `haversine.spec.ts`)

**Por qué:** Demostrar la aceptación de `GEO-01` ("Known distances and invalid coordinates are covered by tests") con validaciones exhaustivas de límites, errores y distancias reales en Barranquilla / Colombia.

**Archivos esperados:**
- `backend/src/modules/route-planning/test/coordinates.spec.ts`
- `backend/src/modules/route-planning/test/haversine.spec.ts`

**Lote mecánico disponible para Codex:** Codex puede generar y escribir directamente ambos archivos de prueba si el usuario lo solicita explícitamente.

**Verificación:**
Compilar TypeScript y verificar sintaxis limpia.
