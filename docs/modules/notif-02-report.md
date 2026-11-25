# NOTIF-02 — Email operativo a coordinadores

Estado: **TODO para la implementación; contrato en REVIEW**.

Plan de trabajo: [NOTIF-02](../plans/notif-02.md).
Contrato común: [UI-04 / NOTIF / TRACK v1](../contracts/ui-04-notifications-tracking-v1.md).
Responsable humano: Juanangel.

## Alcance verificado

Inspección estática sobre `develop`, commit `33e09eb`, realizada el 2026-11-09.
Existen amqplib, outbox, publisher confirm, retry policy, DLQ y consumidor idempotente. No hay puerto/adaptador SMTP ni consumidor de notifications. NotificationStatus actual es PENDING/SENT/FAILED: el plan propone añadir PROCESSING y CANCELLED al mismo enum, junto con columnas de lease/reintento, sin duplicar estados. El repositorio no incluye dependencia SMTP ni servidor de captura en Compose. FailureRouter y runner están ligados a audit, por lo que requieren el cambio delimitado de NOTIF-01. No hay contactos externos de paquetes; el alcance aprobado usa User.email de coordinadores del mismo tenant.

## Implementación por puntos

### Punto 0 — Auditoría y planificación

- Objetivo: entregar un alcance verificable, con API acordable y límites de responsabilidad.
- Decisión: tres entregas de equipo; NOTIF-01 y NOTIF-02 son dos fases del mismo backend de Juanangel. El usuario aprobó coordinadores primero y externos en una ampliación explícita.
- Archivos: plan canónico enlazado, este informe y contrato común; solo documentación en esta sesión.
- Resultado: documentación creada; no representa una API desplegada.
- Evidencia: lectura de las rutas de código consignadas en el plan, esquemas Prisma, wiring, scripts y pruebas existentes. No se ejecutaron pruebas funcionales.
- Pendiente: revisión conjunta de contrato y pasos 1 a 5 del plan, todos sin evidencia de implementación nueva.

## Decisiones técnicas

- Coordinadores primero; externos después: User.email como única fuente en v1; sin contacto nuevo de paquetes.
- Email solo para pendiente y fallo: Entrega exitosa se notifica solo en inbox.
- SMTP fuera de transacción y job durable: Reserva/lease y recuperación; ventana de duplicado declarada.

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

- API o pantalla de administración de email; cambios adicionales a UI-04.
- Remitentes/destinatarios externos y su modelo de contactos, campañas, adjuntos, preferencias y editor de plantillas.
- Proveedor de pago, garantías exactly-once SMTP y notificar por email cada evento del catálogo.

## Cierre

Módulo aún sin implementar. Al completar cada paso, agregar una sección con resultado, archivos, comandos reales, logs, fecha y limitaciones; no reemplazar el registro histórico de esta auditoría.
