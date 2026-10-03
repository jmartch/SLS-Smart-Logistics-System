# Informe de GEO-01 — Validación de coordenadas y distancia Haversine

## 1. Identidad y resumen

| Campo | Valor |
| --- | --- |
| Módulo | `GEO-01` |
| Estado | `DONE` |
| Plan | [Plan GEO-01](../plans/geo-01.md) |
| Responsable | Humberto (Modo Guiado) |
| Arquitecto de diseño | GPT-6.1 Sol (OpenAI Cloud) |
| Auditoría y entorno | Gemini (Antigravity) |

## 2. Alcance completado

- **Value Object `Coordinates` inmutable:**
  - Valida rango de latitud $[-90, 90]$ y longitud $[-180, 180]$.
  - Normaliza `-0` a `0`.
  - Congela el objeto con `Object.freeze(this)`.
  - Métodos estáticos: `create` (numérico estricto) y `parse` (acepta strings numéricos y números).
  - Métodos de instancia: `equals(other, tolerance?)`, `toString()`, `distanceTo(other)`.
- **Error de dominio `InvalidCoordinatesError`:**
  - Extiende `Error` tipado con código de razón: `INVALID_FORMAT`, `LATITUDE_OUT_OF_RANGE`, `LONGITUDE_OUT_OF_RANGE`, `NON_FINITE_COORDINATE`.
- **Fórmula de Haversine pura y numéricamente estable:**
  - Radio canónico: $R = 6,371,000\text{ m}$.
  - Uso de `Math.atan2` con clamping en $[0, 1]$ para evitar distorsión o `NaN` en antípodas o puntos idénticos.
  - Helper de conversión `haversineMetersToKilometers`.
- **Clean Architecture estricta:**
  - Sin dependencias de NestJS, Prisma ni librerías externas en la capa de dominio.
- **Pruebas unitarias completas bajo `sls-test-normalization`:**
  - `backend/src/modules/route-planning/test/coordinates.spec.ts`: 14 tests que cubren inmutabilidad, límites de rango, normalización, entradas inválidas, parseo y tolerancia de igualdad.
  - `backend/src/modules/route-planning/test/haversine.spec.ts`: 8 tests que cubren punto idéntico (0 m), distancia real Barranquilla - Cartagena (~99.71 km), simetría ($A \to B = B \to A$), distancia sobre el ecuador, distancia entre polos, cruce del antimeridiano y conversión de unidades.

## 3. Evidencia reproducible (Docker)

```bash
docker compose exec backend npm test -- --runInBand src/modules/route-planning/
# Resultado: 11 suites aprobadas, 80 tests aprobados (0 fallos).

docker compose exec backend npm test -- --runInBand
# Regresión completa: 41 suites aprobadas, 300 tests aprobados (0 fallos).
```
