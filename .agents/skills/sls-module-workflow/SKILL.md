---
name: sls-module-workflow
description: Audita, planifica y guía paso a paso la implementación de módulos o entregables de SLS, conserva el avance en docs y limita las ediciones del agente a documentación y cambios mecánicos repetitivos. Usar cuando el usuario mencione un módulo o ID como GDB-01, AUTH-01, RMQ-01 o pida continuar, ubicar o revisar su progreso.
---

# Flujo guiado de módulos SLS

Convierte un módulo o entregable de SLS en un plan persistente y verificable. El usuario implementa las decisiones y la lógica principal; el agente audita, explica el siguiente paso y mantiene la trazabilidad.

## Inicio de cada invocación

1. Leer `AGENTS.md` completo y respetar su alcance, dependencias, aceptación, arquitectura y comandos.
2. Identificar el módulo solicitado y normalizar su ID para nombres de archivo, por ejemplo `GDB-01` -> `gdb-01`.
3. Buscar primero un plan existente en `docs/plans/<id>.md`. Buscar además el módulo en el tablero, documentación, migraciones, pruebas, código y commits recientes.
4. Cuando sea útil y las herramientas estén disponibles, consultar tareas anteriores relacionadas para recuperar decisiones del usuario. Tratar ese historial como contexto; el repositorio y las pruebas son la evidencia vigente.
5. Auditar el árbol de trabajo antes de proponer o editar. Preservar cambios ajenos y no atribuirlos al módulo sin evidencia.
6. Si el plan no existe, crearlo desde [assets/module-plan-template.md](assets/module-plan-template.md). Si existe, reconciliarlo con el estado real antes de mostrar lo pendiente.

No pedir al usuario que repita información que pueda obtenerse del repositorio, del plan o del historial accesible. Hacer una sola pregunta concreta únicamente cuando una decisión no inferible cambie materialmente el alcance.

## Fuente de verdad y estados

El plan es la memoria de trabajo, no evidencia suficiente por sí mismo. Resolver contradicciones con este orden:

1. comportamiento probado y migraciones aplicables;
2. código y configuración actuales;
3. documentación técnica y ADR vigentes;
4. historial Git relevante;
5. afirmaciones registradas en el plan o conversaciones anteriores.

Usar los estados del proyecto: `BACKLOG`, `TODO`, `IN_PROGRESS`, `REVIEW`, `TESTING`, `DONE` y `BLOCKED`.

Separar siempre cuatro hechos que suelen confundirse:

- implementado;
- verificado;
- documentado;
- confirmado en un commit.

No marcar un paso `DONE` sin criterio de aceptación y evidencia concreta. Si el usuario informa que terminó algo pero aún no se ha verificado, marcarlo `REVIEW` o `TESTING` y registrar la afirmación sin presentarla como prueba.

## Construcción del plan

Adaptar las fases al módulo; no crear capas o pasos vacíos. Considerar, cuando correspondan:

1. alcance, dependencias y preflight;
2. contrato y criterios de aceptación;
3. pruebas que expresan el comportamiento esperado;
4. dominio y reglas;
5. aplicación y puertos;
6. infraestructura, persistencia o mensajería;
7. integración y aislamiento por tenant;
8. verificación reproducible;
9. documentación, evidencia y cierre.

Cada paso debe registrar:

- objetivo y razón;
- estado;
- responsable `USER` o `CODEX_MECHANICAL`;
- dependencias;
- archivos esperados;
- instrucciones concretas para el usuario;
- cambio mecánico que el agente podría ejecutar;
- comprobación y criterio de aceptación;
- evidencia obtenida;
- decisiones y trabajo restante.

Mantener los pasos suficientemente pequeños para completarlos y comprobarlos en una sesión, pero no fragmentar una sola decisión coherente en tareas artificiales.

## Contrato de interacción

En una invocación normal:

1. actualizar el plan con la auditoría actual;
2. mostrar el estado general y cualquier diferencia entre el plan y el repositorio;
3. resumir lo completado y lo pendiente;
4. seleccionar un solo siguiente paso desbloqueado;
5. explicar qué debe aplicar el usuario, en qué archivos y por qué;
6. indicar cómo verificarlo y qué evidencia devolver;
7. señalar por separado cualquier lote mecánico que el agente pueda realizar.

Mostrar el plan completo solo al crearlo, cuando cambie materialmente o cuando el usuario lo pida. En continuaciones, priorizar el delta y el siguiente paso para no abrumar.

Responder en español salvo que el usuario solicite otro idioma.

## Límite de edición

La invocación autoriza inspección y mantenimiento de `docs/plans/<id>.md` y de la documentación de progreso del módulo. No autoriza modificar la lógica principal.

El usuario conserva la implementación conceptual, incluyendo:

- decisiones de arquitectura y modelado;
- reglas de dominio y algoritmos;
- contratos públicos y autorización;
- consultas, transacciones y migraciones con decisiones de datos;
- políticas de tenant, reintentos, idempotencia o errores;
- cambios cuyo resultado no sea una transformación determinista ya acordada.

El agente puede editar código solamente cuando el usuario pida explícitamente aplicar un lote mecánico y la transformación esté completamente determinada, por ejemplo:

- renombres o sustituciones repetitivas con un mapa aprobado;
- actualización repetida de imports, exports, registros y wiring;
- propagación de enums o tipos ya decididos;
- scaffolding repetitivo sin lógica de negocio;
- adaptación repetitiva de fixtures o casos de prueba existentes;
- formato y correcciones mecánicas derivadas de una herramienta;
- sincronización de documentación, índices y comandos.

Si un cambio combina mecánica y criterio de negocio, separar el lote y dejar la parte conceptual al usuario. Si no puede separarse de forma segura, clasificar todo el paso como `USER`.

## Protocolo para lotes mecánicos

Antes de editar:

1. confirmar que el usuario pidió aplicar el lote;
2. enumerar la transformación, rutas y exclusiones;
3. comprobar que no pisa cambios ajenos;
4. usar ediciones deterministas y revisar el diff;
5. ejecutar comprobaciones proporcionales mediante Docker Compose según `AGENTS.md`;
6. actualizar plan e informe con resultados reales.

No crear commits por invocar este skill. Si el usuario pide commits, aplicar también `sls-workflow-commits` cuando esté disponible y mantener cada commit enfocado.

## Documentación persistente

El plan canónico vive en `docs/plans/<id>.md`.

Para el informe:

- reutilizar primero un documento existente como `docs/geospatial/gdb-06-report.md`;
- si no existe una convención de dominio, usar `docs/modules/<id>-report.md` basado en [assets/module-report-template.md](assets/module-report-template.md);
- conservar una sección por cada punto completado con alcance, decisiones, archivos, verificación, evidencia y pendientes;
- actualizar documentación solo con resultados observados; no copiar conteos de pruebas antiguos como si fueran actuales;
- enlazar el informe desde el plan y el plan desde el informe.

Registrar en la bitácora del plan cada auditoría o avance significativo. No reemplazar notas manuales del usuario ni borrar pendientes para hacer parecer terminado el módulo.

## Cierre

Declarar el módulo `DONE` solo cuando se cumplan su aceptación, verificaciones aplicables, aislamiento y documentación. El cierre debe mostrar:

- alcance completado;
- pruebas y comandos reproducibles;
- evidencia de migración o infraestructura cuando aplique;
- documentación final;
- trabajo explícitamente fuera de alcance;
- commits relacionados, si existen.

Si queda integración posterior, distinguir entre “módulo cerrado para su alcance” y “flujo funcional completo”; no ocultar esa diferencia.
