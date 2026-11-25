# NOTIF-01 — Inbox y materialización de notificaciones internas

Estado: **TODO para la implementación; contrato en REVIEW**.

Plan de trabajo: [NOTIF-01](../plans/notif-01.md).
Contrato común: [UI-04 / NOTIF / TRACK v1](../contracts/ui-04-notifications-tracking-v1.md).
Responsable humano: Juanangel.

## Alcance verificado

Inspección estática sobre `develop`, commit `33e09eb`, realizada el 2026-11-09.
`backend/prisma/schema/messaging.prisma` define Notification con tenantId, templateId, sourceEventId, recipient, channel, status, attempts y sentAt. Faltan usuario destinatario, contenido, tipo, createdAt, readAt y unicidad por evento/destinatario/canal. Notification ya tiene FORCE RLS por tenant. No existe módulo notifications ni API de inbox. `IdempotentConsumer` es reutilizable, pero `RabbitmqConsumerRunner`, `RabbitmqFailureRouter` y la topología están ligados a audit; no basta con registrar otro módulo. El catálogo admite los eventos elegidos, pero aún se debe probar la emisión de cada rama real.

## Implementación por puntos

### Punto 0 — Auditoría y planificación

- Objetivo: entregar un alcance verificable, con API acordable y límites de responsabilidad.
- Decisión: tres entregas de equipo; NOTIF-01 y NOTIF-02 son dos fases del mismo backend de Juanangel. El usuario aprobó coordinadores primero y externos en una ampliación explícita.
- Archivos: plan canónico enlazado, este informe y contrato común; solo documentación en esta sesión.
- Resultado: documentación creada; no representa una API desplegada.
- Evidencia: lectura de las rutas de código consignadas en el plan, esquemas Prisma, wiring, scripts y pruebas existentes. No se ejecutaron pruebas funcionales.
- Pendiente: revisión conjunta de contrato y pasos 1 a 5 del plan, todos sin evidencia de implementación nueva.

## Decisiones técnicas

- Coordinadores activos por COORDINATE_ROUTES: Sin contactos externos ni comparación de nombres de rol.
- Lectura propia separada de canal EMAIL: Cuatro endpoints IN_APP y ningún endpoint manual de envío.
- Materialización atómica e idempotente: UoW de aplicación y unicidad persistente, conservando RLS.

## Verificación reproducible

Ver comandos previstos y casos C01-C10 aplicables en el plan y contrato común.
Los scripts futuros se distinguen de los existentes; no ejecutarlos hasta implementar los runners correspondientes.

Resultados observados:

- Se confirmó el diagnóstico estático; no se trasladan conteos de auditorías anteriores.
- No se ejecutaron build, tests, lint, migraciones ni llamadas SMTP.
- La documentación no está confirmada en un commit de esta sesión.
- Revisión documental 2026-11-10: el lote de 10 documentos pasó comprobación de 42 enlaces locales, 5 ejemplos JSON, cierres de bloques y ausencia de placeholders/whitespace final. No equivale a una prueba funcional.

## Estado en el entorno compartido

No se alteraron servicios, datos, credenciales, migraciones ni código de aplicación.
La carpeta `.github/` sin seguimiento ya existía y queda fuera de este trabajo.
El estado desplegado se considera no verificado.

## Trabajo fuera de alcance

- Enviar correo: corresponde a NOTIF-02; conservar únicamente sus puntos de extensión acordados.
- Remitentes/destinatarios externos, CRUD de plantillas, nuevas políticas logísticas y endpoints de creación manual.
- Permitir a administradores consultar inbox ajenos o añadir permisos nuevos sin necesidad.

## Cierre

Módulo aún sin implementar. Al completar cada paso, agregar una sección con resultado, archivos, comandos reales, logs, fecha y limitaciones; no reemplazar el registro histórico de esta auditoría.
