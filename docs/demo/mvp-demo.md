# Demo MVP: preparación y recorrido desde la página (`DEMO-01`)

Actualizado: 2026-10-13. La semilla deja el inicio del proceso, y las acciones de
clasificación, planificación, asignación y preparación se ejecutan desde la UI.

## Preparación

Todos los comandos de aplicación se ejecutan en Docker Compose:

```bash
docker compose up -d --build postgres rabbitmq backend worker frontend
docker compose exec backend npx prisma migrate deploy --config prisma7.config.ts
docker compose exec backend npm run build
```

Para reiniciar únicamente el tenant `demo-barranquilla`, detener el worker durante
la limpieza y vaciar las colas SLS del entorno de demo antes de volver a iniciarlo.
Las colas compartidas no deben vaciarse en un entorno multiempresa con trabajo ajeno.

```bash
docker compose stop worker
docker compose exec backend npm run demo:seed
```

Para una limpieza total de los datos operativos locales, autorizada explícitamente:

```bash
docker compose stop worker
docker compose exec backend npm run demo:reset
```

`demo:reset` elimina datos operativos de todas las empresas, sesiones y datasets,
y vuelve a importar el extracto OSM real. Conserva las migraciones, el catálogo de
permisos y las cuentas de acceso de plataforma. No cambia el esquema ni elimina
el volumen PostgreSQL. `demo:seed` limita la limpieza al tenant demo.

En el entorno local dedicado a esta demo, vaciar las seis colas antes del reinicio
impide que mensajes anteriores reconstruyan efectos sobre el estado nuevo:

```bash
docker compose exec rabbitmq rabbitmqctl purge_queue -p sls sls.audit.integration-events.v1
docker compose exec rabbitmq rabbitmqctl purge_queue -p sls sls.audit.integration-events.v1.retry.5s
docker compose exec rabbitmq rabbitmqctl purge_queue -p sls sls.audit.integration-events.v1.retry.10s
docker compose exec rabbitmq rabbitmqctl purge_queue -p sls sls.audit.integration-events.v1.retry.20s
docker compose exec rabbitmq rabbitmqctl purge_queue -p sls sls.audit.integration-events.v1.dlq
docker compose exec rabbitmq rabbitmqctl purge_queue -p sls sls.quarantine.v1
docker compose start worker
```

## Estado inicial real

| Recurso | Estado inicial |
| --- | --- |
| Empresa | `demo-barranquilla`, Mensajería Barranquilla Demo S.A.S. |
| Administrador | `admin@demo-baq.co`, todos los permisos operativos |
| Recepción | `recepcion@demo-baq.co`, REGISTER_PACKAGES |
| Mensajero | `mensajero.ruta@demo-baq.co`, OPERATE_DELIVERIES y perfil activo |
| Usuario candidato | `mensajero.candidato@demo-baq.co`, activo, sin perfil de mensajero todavía |
| Contraseña de usuarios demo | `DemoPassword123!` |
| Catálogos | Zona NORTH, sector N-PRADO y envío STANDARD |
| Flota | Un vehículo BAQ101, 850 kg y 6.5 m³, y un mensajero; ambos libres |
| Geografía | Dataset OSM READY de El Prado–Alto Prado y depósito compatible |
| Paquetes | Tres guías OSM-DEMO-329842F6-1/2/3, REGISTERED, sin zona asignada, geocodificación MATCHED y conexión vial válida |
| Historial/eventos | Registro inicial REGISTERED e historial/Outbox creados por RegisterPackageService |
| Rutas/asignaciones | Ninguna; las crea el coordinador desde la página |
| Turnos, entregas y DLQ simulada | Ninguno |

Los UUID operativos y los tokens públicos se generan mediante los servicios
actuales. La salida de la semilla informa los IDs; las guías, usuarios, catálogos
y datos geográficos permiten reconocer el mismo escenario en cada ejecución.
No se fuerzan estados ni se inventa una ejecución previa del algoritmo.

## Recorrido para el ensayo

1. Abrir `http://localhost:5173/login` e iniciar sesión con el administrador demo.
   La limpieza invalida las sesiones anteriores: volver a iniciar sesión.
2. Ir a **Paquetes**. Deben aparecer las tres guías en REGISTERED. El registro
   manual/QR sigue disponible para demostrar recepción adicional.
3. Ir a **Clasificación** y clasificar las tres guías con NORTH y N-PRADO. Se
   ejecuta la transición real REGISTERED → CLASSIFIED con historial y Outbox.
4. Ir a **Planificación**. Elegir la fecha del ensayo, una ventana horaria,
   **Depósito OSM demo · El Prado** y **Barranquilla · El Prado–Alto Prado · OSM demo**.
   Seleccionar solamente las guías 1 y 2 y planificar. El backend elige la pareja
   disponible y crea una ruta PLANNED con dos asignaciones.
5. Con la misma fecha y ventana, intentar crear otra ruta para la guía 3. Como
   la única pareja está comprometida, el paquete queda PENDING_ASSIGNMENT con
   motivo. Es resultado de negocio, no error técnico ni mensaje DLQ.
6. Ir a **Pendientes**, elegir la ruta PLANNED creada y asignar la guía 3.
   El caso de uso recalcula la ruta, conserva el historial y agrega la asignación.
7. Revisar las tres paradas, direcciones y mapa en **Rutas**. Pulsar **Preparar
   ruta**. El manifiesto queda congelado y los paquetes pasan a READY_FOR_DISPATCH.
8. La ruta deja de ser editable. Un intento HTTP de replanificación debe devolver
   409 sin cambiar asignaciones ni paradas. El frontend ya no la ofrece como editable.
9. Iniciar sesión como `mensajero.ruta@demo-baq.co`, abrir **Mi ruta** e iniciar
   la ruta preparada. La UI actual permite también interrumpirla.

Para reproducir el pendiente del paso 5, mantener una sola pareja activa y usar
la misma ventana. Registrar otra pareja antes puede permitir asignar la guía 3
a una segunda ruta, lo cual también sería correcto según la lógica actual.
El alta adicional de vehículo/mensajero puede demostrarse después de ese paso.

La pantalla de resultado de parada continúa simulada. Entrega, fallo, evidencia,
incidentes y cierre existen en backend y esperan integración web; no se deben
presentar como terminados desde la página. Notificaciones y rastreo público
siguen pendientes de implementación funcional.

## Evidencia técnica

- Registro: Package, Address, PackageStatusHistory y OutboxEvent atómicos.
- Clasificación: transición State real y evento PackageClassified.
- Planificación: Chain, coordenadas/Haversine, clustering, capacidad y ordenamiento.
- Recuperación: una asignación activa por paquete e historial preservado.
- Preparación: evento RoutePrepared y rechazo posterior de edición.
- RabbitMQ: publicación de Outbox, confirms, consumo idempotente y ACK después del commit.

```bash
docker compose exec postgres psql -U postgres -d sls -c 'SELECT state, count(*) FROM "Package" GROUP BY state;'
docker compose exec postgres psql -U postgres -d sls -c 'SELECT "eventType", status, count(*) FROM "OutboxEvent" GROUP BY "eventType", status;'
docker compose exec postgres psql -U postgres -d sls -c 'SELECT "consumerName", count(*) FROM "ProcessedEvent" GROUP BY "consumerName";'
docker compose exec rabbitmq rabbitmqctl list_queues -p sls name consumers messages_ready messages_unacknowledged
```

Idempotencia, retry, DLQ y redrive deben demostrarse mediante eventos realmente
procesados o sus pruebas de integración. La semilla no inserta un fallo ficticio.
Las operaciones deliberadas de recuperación siguen disponibles en `messaging:ops`;
usar los identificadores de un DeadLetterMessage existente.

## Colección Bruno

`bruno/SLS API/00 Demo MVP` continúa como respaldo para login, altas, error de
validación/duplicado, consulta de ruta y estado de RabbitMQ. Antes del paso 05,
copiar el routeId real creado desde planificación; no hay una ruta de UUID fijo
sembrada. packageId y stopId también se obtienen de respuestas reales.
El paso 05 consulta detalle de ruta; el historial del paquete se consulta en
`GET /packages/:packageId` o directamente en PackageStatusHistory.

## Verificación reproducible y contingencia

```bash
make integration-test TEST=demo-01
docker compose exec backend npm test -- --runInBand
docker compose exec frontend npm test
docker compose exec backend npm run build
docker compose exec frontend npm run build
```

`test:demo-01` usa PostgreSQL/PostGIS desechable: comprueba estado inicial,
repetición sin duplicados, clasificación → planificación → pendiente →
recuperación → preparación → rechazo de edición, permisos y aislamiento de la
limpieza por tenant. La limpieza global mantiene migraciones y acceso de plataforma.

Si falla la UI, utilizar Bruno o la prueba integrada. Si fallan los tiles externos,
mostrar la lista de paradas: no se ofrece GPS ni navegación giro a giro. El mapa y
la geocodificación tienen cobertura acotada al extracto descrito en
[la guía OSM](osm-barranquilla-demo.md).
