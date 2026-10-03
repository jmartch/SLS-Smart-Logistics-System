# ZONE-01 — Guía del primer paso de dominio

Fecha: 2026-10-01. Responsable de implementación: Humberto (`USER`). Vinculada al [plan](../plans/zone-01.md) y al [contrato propuesto](zone-01-contract.md). Esta guía prepara el paso 2; no acredita implementación ni aprobación de límites pendientes.

## Primer incremento

Implementar únicamente normalización y validación de código/nombre. Son reglas compartidas por Zone, Sector y ShipmentType y pueden probarse sin autenticación, Prisma ni NestJS. No crear todavía controladores, adapters ni un CRUD completo.

Rutas sugeridas, por crear cuando se implemente:

- `backend/src/modules/zones/domain/catalog-code.ts`
- `backend/src/modules/zones/domain/catalog-name.ts`
- `backend/src/modules/zones/domain/invalid-catalog-value.error.ts`
- `backend/src/modules/zones/test/catalog-values.spec.ts`

Elegir funciones puras o value objects según la utilidad real; no crear agregados vacíos. Cada operación devuelve el valor canónico o lanza un error tipado con campo y código de dominio. La presentación traducirá posteriormente ese error a VALIDATION_ERROR; el dominio no conoce HTTP.

## Comportamiento esperado

Código: quitar espacios exteriores, convertir a mayúsculas y validar el resultado. Nombre: quitar espacios exteriores y conservar mayúsculas, acentos y espacios internos. No convertir valores de otros tipos en texto para aceptar entradas inválidas; la frontera HTTP debe validar el tipo.

Límites confirmados por Humberto el 2026-10-01: código 1–30 caracteres, letras ASCII A–Z, dígitos, guion y guion bajo; nombre 1–100 caracteres después de trim. Precisar cómo se mide la longitud de nombres Unicode y mantener la misma regla en tests y contrato.

| Caso | Entrada | Resultado esperado |
| --- | --- | --- |
| Normalización de código | ` norte ` | `NORTE` |
| Código ya canónico | `N-A` | `N-A` |
| Código vacío | espacios o cadena vacía | Error de código vacío |
| Idempotencia | Normalizar dos veces un código válido | Mismo resultado |
| Nombre | `  Zona río  ` | `Zona río` |
| Nombre vacío | espacios o cadena vacía | Error de nombre vacío |
| Límites de código | Máximo permitido y máximo + 1 | Aceptación y rechazo, según límite acordado |
| Caracteres de código | Espacio interno, acento y símbolo fuera del conjunto | Rechazo, si se confirma el conjunto propuesto |
| Límites de nombre | Máximo permitido y máximo + 1 | Aceptación y rechazo, según criterio Unicode acordado |

Las pruebas deben comprobar el valor y el código/campo del error, sin depender del texto completo del mensaje.

## Qué pertenece a los incrementos siguientes

La unicidad no puede probarse solo con un value object: depende del catálogo existente. En aplicación, normalizar antes de consultar duplicados y persistir; en infraestructura, traducir la colisión concurrente de la restricción única al mismo resultado de conflicto. Probar `norte` frente a ` NORTE ` dentro de un tenant y permitir el mismo código en otro tenant. La normalización nueva requiere revisar datos existentes antes de alterar su interpretación.

Después del primer incremento, modelar la pertenencia sector–zona y exponer puertos propios del módulo. La consulta del recurso se realiza dentro del tenant confiable antes de validar la relación; un sector ajeno y uno ausente producen el mismo resultado público. No incorporar Prisma, DTOs HTTP o dependencias NestJS al dominio.

La prueba de arquitectura puede tomar como referencia `backend/src/modules/geocoding/test/geocoding-architecture.spec.ts`, ampliando lo necesario para rechazar dependencias externas y cruces de capas. Evitar crear application vacío únicamente para satisfacer una prueba: verificar esa capa cuando tenga código.

## Verificación del primer incremento

Cuando existan los archivos y la prueba, con el backend activo:

```bash
docker compose exec backend npm test -- --runInBand --runTestsByPath src/modules/zones/test/catalog-values.spec.ts
docker compose exec backend npm run build
```

Estos son comandos previstos, no ejecutados. Si el servicio no está activo, seguir el arranque de AGENTS.md. No ejecutar herramientas del proyecto directamente en el host.

Criterio de salida del incremento: normalización determinista, errores tipados y casos positivos/negativos probados; dominio instanciable sin framework. Registrar archivos, resultados y límites acordados en el informe. Eso no cierra todo el paso 2 ni el módulo: faltarán pertenencia sector–zona, conflictos, puertos y fronteras verificadas.
