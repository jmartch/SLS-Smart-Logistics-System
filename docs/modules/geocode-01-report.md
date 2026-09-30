# GEOCODE-01 — Geocodificación local determinista

Estado: **DONE para el alcance definido**.

Plan de trabajo: [GEOCODE-01](../plans/geocode-01.md).

## Alcance verificado

El módulo transforma direcciones urbanas soportadas en decisiones de
geocodificación reproducibles contra un catálogo local publicado. Conserva el
texto original, normaliza componentes, prefiltra referencias de un único
dataset `READY`, calcula score y ranking en dominio y persiste atómicamente el
intento, sus candidatos y la selección. Las direcciones y resultados privados
se consultan bajo contexto RLS de tenant; el catálogo publicado permanece
compartido y de solo lectura para runtime.

## Implementación por puntos

### Punto 1 — Contrato y fixtures

- Objetivo: fijar estados, componentes, candidatos, umbrales y desempate antes de implementar el algoritmo.
- Decisión: usar la versión `geocode-v1`, score automático mínimo `0.95`, margen mínimo `0.10` y `referenceId` ascendente como desempate total.
- Archivos: `backend/src/modules/geocoding/domain/geocoding.types.ts` y pruebas del módulo.
- Resultado: quedaron expresados `MATCHED`, `REVIEW_REQUIRED` y `NOT_FOUND` con fixtures deterministas.
- Evidencia: la fase roja inicial falló exclusivamente por el comportamiento aún no implementado.
- Pendiente: ninguno para esta versión del contrato.

### Punto 2 — Normalización de direcciones

- Objetivo: obtener una representación canónica sin reemplazar el texto recibido.
- Decisión: soportar inicialmente CALLE y CARRERA, incluidas las abreviaturas acordadas, y rechazar formatos vacíos o no reconocidos mediante códigos estables.
- Archivos: `domain/address-normalizer.ts`, `domain/invalid-address.error.ts` y `test/address-normalizer.spec.ts`.
- Resultado: variantes equivalentes producen los mismos componentes y texto normalizado.
- Evidencia: 10 pruebas unitarias incluidas en la ejecución final.
- Pendiente: ampliar formatos requiere una nueva decisión contractual y fixtures propios.

### Punto 3 — Scoring y decisión determinista

- Objetivo: puntuar, ordenar y clasificar candidatos sin depender de Prisma ni del orden incidental de entrada.
- Decisión: contribuciones binarias de tipo `0.10`, vía `0.30`, generadora `0.25`, placa `0.30` y barrio `0.05`, redondeadas a cuatro decimales.
- Archivos: `domain/deterministic-geocoder.ts` y `test/deterministic-geocoder.spec.ts`.
- Resultado: filtros de dataset/municipio, desglose, umbrales, márgenes y empates son reproducibles.
- Evidencia: 11 pruebas unitarias incluidas en la ejecución final.
- Pendiente: ninguno para `geocode-v1`.

### Punto 4 — Catálogo publicado

- Objetivo: recuperar un conjunto acotado de referencias sin mover reglas de decisión a SQL.
- Decisión: buscar por `datasetId`, municipio y prefijo estructurado `TIPO|VIA`; aceptar solo datasets `READY`, ordenar por ID y aplicar un límite explícito.
- Archivos: `application/ports/geocoding-catalog.port.ts`, `infrastructure/prisma-geocoding-catalog.ts` y su prueba.
- Resultado: el adaptador devuelve contratos internos y conserva latitud con `ST_Y` y longitud con `ST_X`.
- Evidencia: 4 pruebas del adaptador y round-trip real de coordenadas en PostGIS.
- Pendiente: ninguno para el catálogo local existente.

### Punto 5 — Aplicación y persistencia atómica

- Objetivo: coordinar dirección, catálogo, dominio y escritura sin romper fronteras de Clean Architecture.
- Decisión: los puertos pertenecen a aplicación; NestJS solo compone adaptadores; el escritor establece `app.tenant_id` y ejecuta intento, candidatos y selección en una transacción.
- Archivos: `application/`, `infrastructure/`, `geocoding.module.ts` y registro en `app.module.ts`.
- Resultado: `GeocodeAddressService` devuelve cortes estables para dirección invisible y dataset no publicado, y persiste resultados completos para los demás casos.
- Evidencia: pruebas del servicio y adaptadores, además de 2 pruebas automatizadas de fronteras de imports.
- Pendiente: exponer una API depende de autenticación, autorización y del flujo de recepción; no forma parte de este alcance.

### Punto 6 — Integración PostGIS y aislamiento

- Objetivo: demostrar relaciones, RLS, geometría y rollback sobre persistencia real.
- Decisión: ejecutar cada runner en una base aleatoria dentro de un servidor PostGIS temporal compartido únicamente por las pruebas de integración.
- Archivos: `backend/test/geocoding.e2e-spec.ts`, `backend/test/integration/geocode-01.cjs`, `docker-compose.integration.yml` y `Makefile`.
- Resultado: se verificaron coincidencia, coordenadas, ausencia, publicación del dataset, aislamiento tenant, ambigüedad y rollback sin escrituras parciales.
- Evidencia: 1 suite y 6/6 pruebas e2e aprobadas después de aplicar las 10 migraciones; la base y el contenedor temporal fueron eliminados.
- Pendiente: ninguno para el alcance de integración.

### Punto 7 — Verificación y documentación

- Objetivo: consolidar evidencia reproducible y distinguir código, pruebas, documentación y commit.
- Decisión: ejecutar el módulo completo mediante Docker Compose y documentar el runner parametrizado.
- Archivos: este informe, el plan y `backend/test/integration/README.md`.
- Resultado: dominio, aplicación, infraestructura, arquitectura y e2e coinciden con el alcance declarado.
- Evidencia: 7 suites y 36/36 pruebas del módulo, 6/6 e2e y build aprobados.
- Pendiente: los cambios aún no están confirmados en un commit.

## Decisiones técnicas

- `GEOCODE-01` permanece separado de `GEO-01`: este módulo resuelve dirección a coordenadas; `GEO-01` valida coordenadas y calcula Haversine.
- El dominio no importa NestJS, Prisma, HTTP ni PostGIS; aplicación tampoco importa infraestructura o presentación.
- La clave de búsqueda usa un prefijo delimitado para evitar colisiones como vía `8` frente a `80` y permitir comparar placas candidatas.
- Los estados sin selección son resultados de negocio persistibles, no fallos técnicos.
- La selección utiliza el identificador real del candidato insertado, no el de la referencia del catálogo.
- El servidor `integration-postgres` se reutiliza secuencialmente entre runners; cada runner conserva la responsabilidad de crear y eliminar su base aleatoria.

## Verificación reproducible

```text
docker compose exec backend npm test -- --runInBand modules/geocoding/test
docker compose exec backend npm run build
make integration-test TEST=geocode-01
make integration-db-down
```

Resultados observados:

- 7 suites y 36/36 pruebas unitarias, de aplicación, adaptadores y arquitectura aprobadas.
- Build de NestJS aprobado.
- 10 migraciones aplicadas desde cero en PostGIS desechable.
- 1 suite y 6/6 pruebas e2e aprobadas.
- Base aleatoria y contenedor `sls-integration-postgres` eliminados al finalizar.

## Estado en el entorno compartido

El módulo está registrado en `AppModule` y reutiliza el esquema y las
migraciones geoespaciales existentes; `GEOCODE-01` no añadió migraciones. La
prueba final no modificó la base compartida `sls`: todos los fixtures y triggers
de fallo vivieron únicamente en la base aleatoria del servidor dedicado. No se
realizó despliegue ni se creó una API pública.

## Trabajo fuera de alcance

- Proveedor externo o geocodificador general para Colombia.
- Importación de OSM y administración del catálogo.
- Validación de coordenadas, Haversine, clustering y planificación de rutas.
- Interfaz de revisión humana, controlador HTTP y pantallas frontend.
- Autenticación, roles y autorización de endpoints.
- QR y flujo completo de recepción de paquetes.

## Cierre

`GEOCODE-01` queda cerrado para su alcance local determinista: la política está
aislada en dominio, el caso de uso depende de puertos, Prisma/PostGIS implementa
los límites externos y la suite demuestra atomicidad e aislamiento. El flujo
funcional completo de recepción y planificación seguirá dependiendo de los
módulos posteriores indicados en el plan.
