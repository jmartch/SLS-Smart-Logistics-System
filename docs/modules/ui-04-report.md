# UI-04 — Notificaciones y seguimiento público

Estado: **TODO para la implementación; contrato en REVIEW**.

Plan de trabajo: [UI-04](../plans/ui-04.md).
Contrato común: [UI-04 / NOTIF / TRACK v1](../contracts/ui-04-notifications-tracking-v1.md).
Responsable humano: Santiago.

## Alcance verificado

Inspección estática sobre `develop`, commit `33e09eb`, realizada el 2026-11-09.
`frontend/src/app/notificaciones/NotificationsPage.tsx` mantiene NOTIFICATIONS en estado local y marca todas solo en memoria; `frontend/src/app/AppShell.tsx` calcula la campana desde el mismo mock. `frontend/src/track/PublicTrackingPage.tsx` busca PACKAGES por code y usa ASSIGNED, distinto de ASSIGNED_TO_ROUTE. `frontend/src/seguimiento/TrackingPage.tsx` navega con ?code=. Ambas rutas públicas están activas en routes.tsx. El cliente común apiFetch ya maneja base /api/v1, cookies, ApiError y campos de validación. El backend de alta devuelve publicTrackingToken, pero aún se debe comprobar y propagar en el tipo y recibo del frontend.

## Implementación por puntos

### Punto 0 — Auditoría y planificación

- Objetivo: entregar un alcance verificable, con API acordable y límites de responsabilidad.
- Decisión: tres entregas de equipo; NOTIF-01 y NOTIF-02 son dos fases del mismo backend de Juanangel. El usuario aprobó coordinadores primero y externos en una ampliación explícita.
- Archivos: plan canónico enlazado, este informe y contrato común; solo documentación en esta sesión.
- Resultado: documentación creada; no representa una API desplegada.
- Evidencia: lectura de las rutas de código consignadas en el plan, esquemas Prisma, wiring, scripts y pruebas existentes. No se ejecutaron pruebas funcionales.
- Pendiente: revisión conjunta de contrato y pasos 1 a 5 del plan, todos sin evidencia de implementación nueva.

## Decisiones técnicas

- Coordinadores primero, aprobado por usuario: Santiago no añade formularios de contactos externos.
- Una fuente de contrato para los tres responsables: Sin endpoints propios de frontend.
- Actualizar datos al entrar, mutar y refrescar: No WebSocket ni polling permanente.

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

- Implementar backend, autorización, selección de destinatarios, emails o migraciones.
- WebSocket/SSE, polling permanente, editor de plantillas, panel administrativo y rediseño global.
- Cambiar el flujo de entregas, rutas o geocodificación; retirar globalmente mockData.ts.

## Cierre

Módulo aún sin implementar. Al completar cada paso, agregar una sección con resultado, archivos, comandos reales, logs, fecha y limitaciones; no reemplazar el registro histórico de esta auditoría.
