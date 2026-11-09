# Operación y verificación de PKG-GEO-01

## Configuración

El backend lee `PACKAGE_GEOCODING_MAPPING_JSON` al iniciar. Es un objeto indexado por código municipal; cada entrada exige `datasetId` UUID, `profile` y `maxAcceptanceRadiusMeters` positivo y finito. `maxReviewRadiusMeters` es opcional y debe ser mayor o igual al radio de aceptación. Perfiles: MOTOR_VEHICLE, MOTORCYCLE, BICYCLE, FOOT.

Ejemplo de estructura que debe sustituirse por valores revisados del catálogo y la operación:

```json
{
  "CODIGO_MUNICIPAL": {
    "datasetId": "UUID_DEL_DATASET_READY",
    "profile": "MOTOR_VEHICLE",
    "maxAcceptanceRadiusMeters": 50,
    "maxReviewRadiusMeters": 100
  }
}
```

Los radios del ejemplo no constituyen valores predeterminados de producción. El UUID de ejemplo es deliberadamente un marcador y no pasa validación. Sin mapping municipal, el registro conserva un diagnóstico DATASET_NOT_READY y no habilita planificación. No marcar datasets READY ni aprobar candidatos para eludir el diagnóstico. Cambios de configuración requieren reiniciar únicamente el despliegue correspondiente; esta tarea no modifica el entorno principal.

## Recuperación

El registro muestra el diagnóstico. En detalle, un usuario autorizado puede reintentar resolución, aprobar o rechazar un candidato con motivo, o corregir la dirección con motivo. Los conflictos de referencias requieren recargar el detalle. El mismo intento de operación fallida conserva su operationId; una intención distinta o una operación exitosa obtiene otro. Una dirección no encontrada o ambigua conserva su resultado explícito.

La clasificación sigue siendo una acción independiente. El espacio de planificación impide seleccionar paquetes sin aptitud geoespacial y vuelve a consultar al cambiar el contexto vial. El backend valida la aptitud al planificar. Conservar datasets y candidatos históricos referenciados por rutas; no borrar ni reemplazar referencias como mecanismo de recuperación.

## Entorno desechable

El Compose específico no publica puertos ni usa volúmenes del entorno principal. PostGIS usa tmpfs; los runners crean y eliminan exclusivamente sus bases aleatorias. No ejecutar semillas, reset ni limpieza de colas. Revisar colisiones antes de iniciar servicios y usar siempre el mismo nombre de proyecto aislado.

```bash
docker compose -p sls-pkg-geo-01 -f docker-compose.pkg-geo-01.yml build backend frontend
docker compose -p sls-pkg-geo-01 -f docker-compose.pkg-geo-01.yml run --rm backend npx tsc --noEmit -p tsconfig.build.json
docker compose -p sls-pkg-geo-01 -f docker-compose.pkg-geo-01.yml run --rm backend npm test -- --runInBand
docker compose -p sls-pkg-geo-01 -f docker-compose.pkg-geo-01.yml run --rm backend npm run test:pkg-geo-01
docker compose -p sls-pkg-geo-01 -f docker-compose.pkg-geo-01.yml run --rm frontend npm test -- --run
docker compose -p sls-pkg-geo-01 -f docker-compose.pkg-geo-01.yml run --rm frontend npm run build
docker compose -p sls-pkg-geo-01 -f docker-compose.pkg-geo-01.yml run --rm frontend npm run lint
```

El backend monta fuentes en solo lectura: no usar `npm run lint`, que incluye --fix. Para revisión, invocar ESLint sin --fix sobre las rutas del cambio. El typecheck de producción excluye tests; el chequeo TypeScript completo tiene errores históricos en tests de mensajería y demo ajenos a este módulo. La suite Jest completa sí fue ejecutada. Los logs temporales de ejecución no se versionan.
