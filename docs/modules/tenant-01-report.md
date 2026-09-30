# TENANT-01 — Contexto confiable y aislamiento entre empresas

Estado: `TODO` para el encargo funcional.

Plan canónico: [TENANT-01](../plans/tenant-01.md). Coordinación: [puntos 1 y 2](../plans/mvp-puntos-1-2.md).

## Alcance verificado

Inspección estática de `develop`, commit `8cdb2c4`, el 2026-09-29; documentación preparada hasta el 2026-09-30. Árbol limpio al inicio. Existe runWithTenant, que valida formato UUID y fija SET LOCAL dentro de una transacción. Eso no verifica identidad ni pertenencia: un UUID válido por sí solo no autoriza. PrismaService usa RUNTIME_DATABASE_URL y hay migraciones de RLS/relaciones compuestas. No hay módulo de contexto autenticado ni guardas; Tenant tiene RLS y el rol runtime no puede aprovisionar empresas. No se comprobó la base compartida ni se ejecutaron las pruebas existentes en esta auditoría.

## Implementación por puntos

### Punto 0 — Auditoría y planificación

- Objetivo: establecer brechas y entrega asignable sin rehacer código existente.
- Decisión: Juanangel; asignación confirmada por Humberto. Contratos por concretar en el paso 1.
- Archivos: fuentes enumeradas en el plan; nuevos plan e informe de este módulo.
- Resultado: aceptación, dependencias, rutas esperadas y lotes mecánicos documentados.
- Evidencia: lectura de esquema, código, documentación y estado Git.
- Pendiente: todos los pasos funcionales del plan; no hay pruebas nuevas ejecutadas.

## Decisiones técnicas

DATA-01 (esquema/migraciones existentes); contrato conjunto con AUTH-01. La base del contexto se implementa antes de las guardas; el E2E final se completa cuando AUTH funcione. Las decisiones pendientes de DTOs, políticas y migraciones están enumeradas por paso. No se consideran aprobadas ni implementadas por aparecer en este documento.

## Verificación reproducible

Seguir los comandos de Compose y preparación de integración indicados en el plan. Los runners de este módulo aún deben implementarse; no se atribuyen resultados históricos como ejecución actual.

Resultados observados: revisión documental únicamente. Build, pruebas y validación funcional pendientes.

## Estado en el entorno compartido

No se consultaron ni modificaron datos, roles ni migraciones de la base compartida. No se inspeccionó trabajo privado del compañero ni otras ramas.

## Trabajo fuera de alcance

Login, hashing, sesión, permisos y alta de empresas se implementan en AUTH-01. Publicador/worker y validación de mensajes futuros quedan para RMQ-01; no aceptar metadata AMQP sin una frontera confiable. No crear una base por empresa ni refactorizar todo el backend.

## Cierre

Implementación no cerrada. Actualizar una sección por cada paso completado, registrando comandos, resultados, límites y commit; enlazar siempre el plan.
