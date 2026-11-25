# Plan de TRACK-01 — Consulta pública segura del estado de paquetes

## Identidad

| Campo | Valor |
| --- | --- |
| Módulo | `TRACK-01` |
| Responsable humano | Vivian |
| Estado general | `TODO`; contrato en `REVIEW` |
| Rama observada | `develop` |
| Rama propuesta | `feature/public-tracking`, desde develop actualizado |
| Última auditoría | 2026-11-09 |
| Commit auditado | `33e09eb` |
| Informe | [TRACK-01](../modules/track-01-report.md) |
| Contrato compartido | [UI-04 / NOTIF / TRACK v1](../contracts/ui-04-notifications-tracking-v1.md) |

## Alcance

### Incluido

- Un endpoint GET público por token, con proyección limitada de estado e historial.
- Acceso a datos con RLS preservado y mecanismo público de lectura acotado, revisado y probado.
- Rate limiting local, caché/referrer seguros, pruebas de privacidad y enlace real desde UI-04.

### Fuera de alcance

- Búsqueda por guía comercial, UUID o tenant enviado por cliente; listado público y emisión/regeneración de tokens.
- Coordenadas, dirección, personas, evidencias, causas internas, GPS y escritura de estados.
- Cambiar registro/geocodificación o usar conexión administrativa para atender peticiones.

## Dependencias y fuentes

- `AGENTS.md`: arquitectura, tenant, eventos, pruebas, ejecución por Compose y coordinación.
- Contrato compartido: autoridad propuesta de rutas, JSON, errores, audiencia y alcance; revisar antes de implementar.
- [UI-04](ui-04.md) y contrato compartido.
- `backend/prisma/schema/packages.prisma`, `backend/prisma/schema/identity.prisma`.
- `backend/src/modules/packages/infrastructure/crypto-public-tracking-token.generator.ts`, `backend/src/modules/packages/application/ports/package-registration.port.ts`.
- `backend/src/database/run-with-tenant.ts`, migración inicial tenant_isolation y `backend/src/app.setup.ts`.
- `backend/src/modules/auth/presentation/login-rate-limiter.ts`: referencia acotada de reloj/buckets; no usarla como política de tracking sin adaptación.

## Diagnóstico actual

Package.publicTrackingToken es único global y el generador actual emite 43 caracteres base64url con randomBytes(32). RegisteredPackage y POST /packages ya lo devuelven al usuario autorizado de registro. No existe controlador público. Package y PackageStatusHistory tienen FORCE RLS según app.tenant_id; Prisma sin contexto no ofrece un lookup público válido. El historial contiene reasonCode/changedByUserId que nunca deben salir al visitante. El estado público debe usar los 13 nombres reales, no el ASSIGNED simulado de frontend.

La inspección fue estática. No se ejecutaron tests, builds, migraciones ni servicios para elaborar este plan. El árbol inicial contenía `.github/` sin seguimiento, ajeno a estas entregas; se preserva. Los archivos propuestos a continuación no se presentan como existentes.

## Plan verificable

| Paso | Fase | Responsable | Estado | Objetivo | Aceptación | Evidencia |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | Auditoría documental | `CODEX_MECHANICAL` | `DONE` | Contrastar existencia y dependencias | Referencias actuales y límites documentados | Lectura estática de la base indicada |
| 1 | Contrato y revisión del acceso público | `USER` | `REVIEW` | Acordar la proyección y resolver el acceso por capacidad sin romper RLS. | Revisión de seguridad registrada: función solo SELECT de campos permitidos, tenant ACTIVE, runtime NOBYPASSRLS sin herencia del propietario y sin acceso público a tablas completas. | Pendiente |
| 2 | Puerto y caso de uso públicos | `USER` | `TODO` | Expresar consulta y errores sin depender de HTTP/Prisma. | C07: allowlist exacta, trece estados, historial vacío y truncado, repetición/reprogramación, fechas reales; núcleo instanciable sin Nest/Prisma. | Pendiente |
| 3 | Persistencia, controlador y límites | `USER` | `TODO` | Exponer solo GET /api/v1/public/tracking/:token de forma segura. | C07-C08: 404 uniforme, público sin cookies, 429 determinista, cabeceras, ningún campo interno ni token en cuerpo/error; regresión de endpoints privados intacta. | Pendiente |
| 4 | Pruebas de SQL, privacidad e integración | `USER` | `TODO` | Verificar los privilegios reales y el recorrido desde el registro. | C07-C08/C10; ninguna lectura SQL general sin contexto; retorno al pool no conserva privilegios/contexto; tests no usan rol admin para solicitudes runtime. | Pendiente |
| 5 | Entrega a Santiago y cierre | `USER` | `TODO` | Acreditar contrato consumible y preservar aislamiento histórico. | API y UI coinciden sin endpoints extra, build y pruebas aprobados; rastreo funcional sin sesión y sin exposición de datos de tenant. | Pendiente |

## Pasos de implementación

### Paso 1 — Contrato y revisión del acceso público

- Estado: `REVIEW`. Responsable: `USER` (Vivian).
- Objetivo y razón: Acordar la proyección y resolver el acceso por capacidad sin romper RLS.
- Dependencias: Contrato común con Santiago; esquema y privilegios actuales.
- Archivos previstos: `docs/contracts/ui-04-notifications-tracking-v1.md`; `docs/adr/011-public-tracking-access.md`; `backend/prisma/migrations/<timestamp>_public_tracking_projection/migration.sql`.
- Debe aplicar el usuario: Diseñar función SQL de proyección por token exacto con propietario dedicado NOLOGIN/BYPASSRLS y SELECT limitado a columnas necesarias; revisar esa excepción privilegiada y mantener runtime NOBYPASSRLS sin membresía en el propietario. Fijar objetos calificados y search_path seguro con pg_temp al final, ausencia de SQL dinámico, REVOKE PUBLIC y EXECUTE limitado en una transacción. Inspeccionar roles/grants y compatibilidad con despliegue. Presentar ADR y SQL para revisión explícita antes de aplicar.
- Lote mecánico posible para Codex, solo a petición: sincronizar imports, wiring o fixtures conforme a una transformación previamente acordada; no decidir lógica ni autorización.
- Comprobación y salida: Revisión de seguridad registrada: función solo SELECT de campos permitidos, tenant ACTIVE, runtime NOBYPASSRLS sin herencia del propietario y sin acceso público a tablas completas.
- Evidencia obtenida: ninguna ejecución de este paso; solo diagnóstico estático inicial.
- Decisiones y trabajo restante: El token no suministra tenant autenticado. Si el mecanismo no es aceptado, revisar ADR antes de programar; no sustituir por admin URL, bucle de tenants o bypass silencioso.

### Paso 2 — Puerto y caso de uso públicos

- Estado: `TODO`. Responsable: `USER` (Vivian).
- Objetivo y razón: Expresar consulta y errores sin depender de HTTP/Prisma.
- Dependencias: Paso 1 revisado; contrato v1.
- Archivos previstos: `backend/src/modules/packages/application/ports/public-tracking-query.port.ts`; `backend/src/modules/packages/application/get-public-tracking.use-case.ts`; `backend/src/modules/packages/application/public-tracking.types.ts`; `backend/src/modules/packages/domain/public-tracking-errors.ts`; `backend/src/modules/packages/test/get-public-tracking.use-case.spec.ts`.
- Debe aplicar el usuario: Puerto findByToken devuelve proyección permitida o ausencia. Validar token case-sensitive sin normalizar contenido; devolver estado real, últimos 100 cambios ordenados e historyTruncated. Mal formado/desconocido y tenant suspendido comparten ausencia; no fabricar historial o updatedAt.
- Lote mecánico posible para Codex, solo a petición: sincronizar imports, wiring o fixtures conforme a una transformación previamente acordada; no decidir lógica ni autorización.
- Comprobación y salida: C07: allowlist exacta, trece estados, historial vacío y truncado, repetición/reprogramación, fechas reales; núcleo instanciable sin Nest/Prisma.
- Evidencia obtenida: ninguna ejecución de este paso; solo diagnóstico estático inicial.
- Decisiones y trabajo restante: No compartir DTO completo de paquete ni consultar datos de otras capacidades directamente.

### Paso 3 — Persistencia, controlador y límites

- Estado: `TODO`. Responsable: `USER` (Vivian).
- Objetivo y razón: Exponer solo GET /api/v1/public/tracking/:token de forma segura.
- Dependencias: Paso 2 y migración de paso 1 revisada.
- Archivos previstos: `backend/src/modules/packages/infrastructure/prisma-public-tracking-query.adapter.ts`; `backend/src/modules/packages/presentation/public-tracking.controller.ts`; `backend/src/modules/packages/presentation/public-tracking-rate-limiter.ts`; `backend/src/modules/packages/presentation/public-tracking-rate-limiter.spec.ts`; `backend/src/modules/packages/presentation/public-tracking-http-errors.ts`; `backend/src/modules/packages/packages.module.ts`; `backend/src/modules/packages/test/public-tracking-architecture.spec.ts`.
- Debe aplicar el usuario: Adaptador ejecuta función con parámetro, nunca interpolación SQL. Nuevo controlador público separado del PackagesController protegido; no retirar guards existentes. Aplicar rate limit antes de consulta incluyendo tokens inválidos, 30/min/IP, máximo 10.000 buckets y clock de prueba. Cabeceras no-store/no-referrer y 429 con Retry-After; no access logs con token. No confiar en X-Forwarded-For sin política proxy.
- Lote mecánico posible para Codex, solo a petición: sincronizar imports, wiring o fixtures conforme a una transformación previamente acordada; no decidir lógica ni autorización.
- Comprobación y salida: C07-C08: 404 uniforme, público sin cookies, 429 determinista, cabeceras, ningún campo interno ni token en cuerpo/error; regresión de endpoints privados intacta.
- Evidencia obtenida: ninguna ejecución de este paso; solo diagnóstico estático inicial.
- Decisiones y trabajo restante: Una instancia no equivale a límite distribuido; documentar límite y no añadir Redis para este alcance.

### Paso 4 — Pruebas de SQL, privacidad e integración

- Estado: `TODO`. Responsable: `USER` (Vivian).
- Objetivo y razón: Verificar los privilegios reales y el recorrido desde el registro.
- Dependencias: Paso 3, PostGIS desechable y UI-04 para integración visual.
- Archivos previstos: `backend/test/public-tracking.e2e-spec.ts`; `backend/test/integration/track-01.cjs`; `backend/package.json`; `backend/test/integration/README.md`; `docs/modules/track-01-report.md`.
- Debe aplicar el usuario: Crear test:track-01 siguiendo runner aislado, aplicar migraciones, conectar con sls_app. Probar dos tenants, tokens y guías comerciales iguales entre tenants, A/B concurrentes en pool, tenant suspendido, token inválido, SQL directo sin contexto y permisos efectivos de función/propietario. Registrar paquete por API autorizada y consultar su token sin sesión. Inspeccionar respuesta por allowlist y ausencia de PII.
- Lote mecánico posible para Codex, solo a petición: sincronizar imports, wiring o fixtures conforme a una transformación previamente acordada; no decidir lógica ni autorización.
- Comprobación y salida: C07-C08/C10; ninguna lectura SQL general sin contexto; retorno al pool no conserva privilegios/contexto; tests no usan rol admin para solicitudes runtime.
- Evidencia obtenida: ninguna ejecución de este paso; solo diagnóstico estático inicial.
- Decisiones y trabajo restante: El runner usa admin solo para preparar DB desechable. La función tiene que probarse con los roles reales, no únicamente con mocks.

### Paso 5 — Entrega a Santiago y cierre

- Estado: `TODO`. Responsable: `USER` (Vivian).
- Objetivo y razón: Acreditar contrato consumible y preservar aislamiento histórico.
- Dependencias: Paso 4 y cliente de UI-04.
- Archivos previstos: `docs/modules/track-01-report.md`; `docs/contracts/ui-04-notifications-tracking-v1.md`; `docs/frontend/api-integration-audit.md`.
- Debe aplicar el usuario: Entregar JSON exacto, ejemplos seguros de prueba y errores a Santiago. Validar /seguimiento, /track?token y recibo de alta real; documentar que las guías code antiguas ya no buscan. Registrar migración, variables/roles requeridos, límites de rate limit y datos que nunca salen.
- Lote mecánico posible para Codex, solo a petición: sincronizar imports, wiring o fixtures conforme a una transformación previamente acordada; no decidir lógica ni autorización.
- Comprobación y salida: API y UI coinciden sin endpoints extra, build y pruebas aprobados; rastreo funcional sin sesión y sin exposición de datos de tenant.
- Evidencia obtenida: ninguna ejecución de este paso; solo diagnóstico estático inicial.
- Decisiones y trabajo restante: No regenerar tokens antiguos ni cambiar el esquema de contactos; ampliar solo mediante nueva solicitud.

## Paso actual

Paso 1: revisar el contrato común con los otros responsables. Las firmas y rutas nuevas son propuestas; no hay API nueva disponible que Santiago pueda consumir todavía. Crear fixtures de contrato después del acuerdo y registrar las decisiones en el informe. La autorización de esta solicitud cubre documentación, no implementación del módulo.

Al terminar el contrato, implementar y comprobar un paso por vez. Reportar evidencia y esperar revisión humana antes de la siguiente fase, conforme a `AGENTS.md`. No marcar implementación `DONE` por tener documentación.

## Verificación reproducible prevista

```bash
docker compose exec backend npm run build
docker compose exec backend npm test -- --runInBand --testPathPatterns='modules/packages'
```

Después de implementar el runner y configurar GDB_TEST_ADMIN_URL exclusivamente para PostGIS desechable:

```bash
docker compose exec backend npm run test:track-01
```

El último script no existe todavía. Acreditar por separado pruebas SQL de privilegios y HTTP sin sesión; un test unitario del adaptador no demuestra aislamiento real.

Todo tooling de aplicación se ejecuta en Compose. Los comandos son propuestas para después de implementar, no resultados actuales. Integración usa un PostgreSQL/PostGIS desechable y, donde corresponda, RabbitMQ/SMTP locales aislados; nunca la base demo compartida. No ejecutar seeds, resets ni migraciones sobre ella.

El formato se comprueba de forma acotada cuando lo exija el repositorio o un fallo concreto; no es una fase independiente. No usar el script backend de lint con `--fix` durante revisión.

## Decisiones

| Fecha | Decisión | Motivo | Consecuencia |
| --- | --- | --- | --- |
| 2026-11-09 | Token opaco como capacidad pública | Guías son únicas solo por tenant | No permitir lookup por trackingCode ni recibir tenantId |
| 2026-11-09 | Proyección SQL acotada sujeta a revisión | FORCE RLS actual impide lookup global ingenuo | Migración/ADR y pruebas de privilegios obligatorias antes de producción |
| 2026-11-09 | Reutilizar token devuelto por registro | Ya existe generador y respuesta de alta | Sin endpoints de emisión o regeneración adicionales |

## Bitácora de progreso

| Fecha | Paso | Cambio observado | Verificación | Commit |
| --- | --- | --- | --- | --- |
| 2026-11-09 | Auditoría y plan | Alcance y contratos propuestos documentados | Inspección estática; sin ejecución funcional | Base `33e09eb`; documentación nueva sin commit |
| 2026-11-10 | Revisión documental | Firmas, audiencia aprobada y límites sincronizados con contrato común | Lote de 10 documentos: 42 enlaces locales y 5 ejemplos JSON válidos; sin whitespace final | Sin commit |

## Cierre

- [ ] Contrato revisado con propietarios backend/frontend.
- [ ] Aceptación funcional y casos compartidos del contrato satisfechos.
- [ ] Build y pruebas relevantes acreditados por Compose.
- [ ] Aislamiento y autorización comprobados.
- [ ] Migración o infraestructura revisada cuando corresponda.
- [ ] Informe actualizado por cada punto, con logs y límites reales.
- [ ] Integración real comprobada, no solo fixtures.
- [ ] Fuera de alcance y trabajo restante explícitos.
- [ ] Sin cambios ajenos sobrescritos; commits solo propuestos al usuario.
