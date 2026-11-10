# TRACK-01 — Consulta pública segura del estado de paquetes

Estado: **TODO para la implementación; contrato en REVIEW**.

Plan de trabajo: [TRACK-01](../plans/track-01.md).
Contrato común: [UI-04 / NOTIF / TRACK v1](../contracts/ui-04-notifications-tracking-v1.md).
Responsable humano: Vivian.

## Alcance verificado

Inspección estática sobre `develop`, commit `33e09eb`, realizada el 2026-11-09.
Package.publicTrackingToken es único global y el generador actual emite 43 caracteres base64url con randomBytes(32). RegisteredPackage y POST /packages ya lo devuelven al usuario autorizado de registro. No existe controlador público. Package y PackageStatusHistory tienen FORCE RLS según app.tenant_id; Prisma sin contexto no ofrece un lookup público válido. El historial contiene reasonCode/changedByUserId que nunca deben salir al visitante. El estado público debe usar los 13 nombres reales, no el ASSIGNED simulado de frontend.

## Implementación por puntos

### Punto 0 — Auditoría y planificación

- Objetivo: entregar un alcance verificable, con API acordable y límites de responsabilidad.
- Decisión: tres entregas de equipo; NOTIF-01 y NOTIF-02 son dos fases del mismo backend de Juanangel. El usuario aprobó coordinadores primero y externos en una ampliación explícita.
- Archivos: plan canónico enlazado, este informe y contrato común; solo documentación en esta sesión.
- Resultado: documentación creada; no representa una API desplegada.
- Evidencia: lectura de las rutas de código consignadas en el plan, esquemas Prisma, wiring, scripts y pruebas existentes. No se ejecutaron pruebas funcionales.
- Pendiente: revisión conjunta de contrato y pasos 1 a 5 del plan, todos sin evidencia de implementación nueva.

## Decisiones técnicas

- Token opaco como capacidad pública: No permitir lookup por trackingCode ni recibir tenantId.
- Proyección SQL acotada sujeta a revisión: Migración/ADR y pruebas de privilegios obligatorias antes de producción.
- Reutilizar token devuelto por registro: Sin endpoints de emisión o regeneración adicionales.

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

- Búsqueda por guía comercial, UUID o tenant enviado por cliente; listado público y emisión/regeneración de tokens.
- Coordenadas, dirección, personas, evidencias, causas internas, GPS y escritura de estados.
- Cambiar registro/geocodificación o usar conexión administrativa para atender peticiones.

## Cierre

Módulo aún sin implementar. Al completar cada paso, agregar una sección con resultado, archivos, comandos reales, logs, fecha y limitaciones; no reemplazar el registro histórico de esta auditoría.
