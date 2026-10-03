---
name: sls-test-normalization
description: Normaliza la estructura de los tests de Smart Logistics System (SLS), sus nombres, fixtures, mocks, hooks y bloques Arrange/Act/Assert, conservando comportamiento y cobertura. Usar cuando se pida unificar o revisar convenciones de tests de SLS, o escribir tests que sigan ese estándar.
---

# Normalización de tests SLS

Aplicar una estructura común a los tests de SLS sin cambiar las reglas que prueban. Responder al usuario en español; escribir los títulos de suites y casos en inglés, como la mayoría de los tests existentes, salvo que el usuario indique otro idioma.

## Alcance y contexto

- Leer `AGENTS.md` y las instrucciones locales del repositorio activo. Inspeccionar el estado de Git y preservar cambios ajenos.
- Una petición de normalizar tests autoriza aplicar los cambios estructurales dentro del alcance solicitado. Si se pide solo una auditoría o crear este skill, entregar ese resultado sin editar tests. No crear commits salvo petición explícita.
- Trabajar en la rama de trabajo del usuario; si está en `main`, crear una rama enfocada con el prefijo vigente del proyecto antes de editar.
- Leer la configuración actual de discovery, scripts y formato antes de elegir rutas o comandos. Ejecutar herramientas del proyecto exclusivamente mediante Docker Compose.
- Conservar runner, ubicación y extensión de los archivos existentes. Unificar la organización interna no requiere migrar Vitest, SQL o los runners CJS a Jest.

## Estructura común

Ordenar cada archivo TypeScript de tests así:

1. Imports: librerías externas, código probado y helpers de tests; conservar imports con efectos y el comportamiento de los mocks hoisted.
2. Tipos y constantes de datos inmutables, si hacen falta.
3. Factories, fakes y helpers locales.
4. `describe` de la clase, función o capacidad probada.
5. Variables de la suite y hooks que administran estado o recursos.
6. `describe` de la operación o comportamiento y sus casos `it`/`it.each`.

Usar la misma jerarquía: **sujeto -> operación/comportamiento -> caso**. Se permiten varios sujetos relacionados en un archivo. No añadir grupos vacíos ni agrupar artificialmente por etiquetas como “happy path”. En E2E, la operación puede ser un endpoint o un flujo; en arquitectura, una regla de dependencias.

- Títulos de `it`: verbo en presente + resultado observable + condición relevante; por ejemplo, `rejects a transition when the package is already delivered`. Evitar `should`, títulos genéricos y nombres ligados a detalles internos irrelevantes.
- Mantener tres fases en cada caso: **Arrange** prepara el escenario, **Act** ejecuta lo probado, **Assert** verifica su resultado. Separarlas con líneas en blanco. Usar `// Arrange`, `// Act`, `// Assert` cuando ayuden a leer un caso complejo; no crear secciones vacías.
- En acciones síncronas que lanzan, preparar una función y pasarla a `expect`. En acciones asíncronas, esperar el resultado o guardar la promesa y usar `await expect(promise).resolves/rejects`. No ejecutar antes una acción que debe observar el matcher de error.
- Un caso prueba un comportamiento y puede tener varias aserciones relacionadas. Mantener los pasos de un flujo completo o las acciones concurrentes cuando son precisamente el comportamiento probado.
- Conservar `it.each`, cada fila y sus títulos distinguibles. No introducir lógica de producción en el test para recalcular el resultado esperado.

Leer [references/templates.md](references/templates.md) al escribir o transformar casos; contiene ejemplos de Jest, Vitest y la adaptación para SQL/CJS.

## Fixtures, mocks y aislamiento

- Usar factories locales `create<Entidad>Fixture(overrides)` para datos repetidos y `createTestContext()` para construir el objeto probado y sus dependencias. Devolver objetos nuevos, también para propiedades anidadas mutables. Mantener nombres de variables que expresen el dominio.
- Compartir helpers entre archivos solo cuando exista duplicación real del mismo contrato. No crear una carpeta global de factories ni extraer fixtures de un solo caso por uniformidad.
- Construir estado mutable y dobles nuevos por caso, en la factory o `beforeEach`. Reservar `beforeAll/afterAll` para recursos costosos cuyo ciclo de vida sea compartido deliberadamente.
- Mantener en cada caso sus datos distintivos y la acción probada. No esconderlos en hooks o helpers que también hagan las aserciones.
- Tipar factories y dobles usando los contratos existentes. No introducir `any`, conversiones inseguras, NestJS en pruebas de dominio/aplicación ni dependencias nuevas solo para normalizar.
- Conservar el aislamiento de los hooks, la semántica de `clear/reset/restore` y el orden relevante de mocks/imports. Restaurar spies, reloj, timers, globals, variables de entorno y conexiones cuando el test los modifica.
- Mantener tenants explícitos y datos deterministas. UUID aleatorios son adecuados para aislar bases o fixtures de integración, pero no deben volver aleatorio el resultado esperado.
- Mantener aserciones de rechazo temprano, orden, eventos, historial, rollback, concurrencia, SQLSTATE y acceso entre tenants. No reducirlas a comprobaciones superficiales para simplificar el archivo.

## Normalización de una suite existente

1. Inventariar todo el alcance: `*.spec.ts`, `*.spec.tsx`, `*.test.*`, `*.e2e-spec.ts`, SQL de pruebas y runners de integración cuando existan. Excluir dependencias, archivos generados y artefactos de build. Una demo no se cuenta como suite automáticamente.
2. Clasificar por recursos reales: dominio, aplicación con dobles, adapter con mocks, composición/arquitectura, HTTP con dobles, integración con base de datos o frontend. Un sufijo E2E o un nombre de repository no demuestra por sí solo integración real.
3. Registrar rutas, casos/filas parametrizadas, aserciones críticas, hooks, requisitos y checks aplicables. Obtener una ejecución inicial y discovery cuando el entorno lo permita; si no, registrar qué no pudo comprobarse y continuar con las ediciones estructurales independientes.
4. Aplicar lotes coherentes por módulo o tipo hasta cubrir todo el alcance pedido. Renombrar, agrupar y extraer preparación repetida conservando escenarios, entradas, resultados y efectos observables. No detenerse en una propuesta si el usuario pidió aplicar la normalización.
5. Revisar el diff contra el inventario: no perder casos, filas, límites, expectativas, cleanup ni protecciones del entorno. No convertir una aserción estricta en parcial, cambiar timeouts ni añadir `skip/only` para hacer pasar la suite. No cambiar la cantidad u orden de acciones mutables solo para acomodar AAA.
6. Verificar los archivos afectados siguiendo [references/verification.md](references/verification.md). Respetar la configuración de formato vigente, incluidos overrides; no imponer una sangría única por fuera de ella.
7. Reportar módulos/archivos cubiertos, convención aplicada, resultados reales de verificación y pendientes. Si una suite no pudo ejecutarse, separar “normalizada” de “verificada”. No declarar normalizados todos los tests si quedan archivos del alcance sin tratar.

Si aparece un defecto de negocio, una prueba que ya fallaba o una carencia de cobertura, registrarlo por separado. Una normalización estructural no autoriza cambiar producción, migraciones, contratos, assertions esperadas ni crear escenarios nuevos ajenos al encargo. La petición explícita de corregir o ampliar tests sí puede autorizar ese trabajo.
