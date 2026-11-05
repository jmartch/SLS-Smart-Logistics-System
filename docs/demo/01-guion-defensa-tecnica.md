# Guion de exposición y defensa técnica — SLS

Estado: borrador organizativo reconciliado con `DEMO-01` (`8035fa6`) y OpenStreetMap (`6a32d9c`).

Duración objetivo: 12 a 15 minutos, ajustable al tiempo asignado por el docente.

> [!warning] Documento sujeto a cambios
> Este guion sirve para organizar y ensayar la exposición. Los responsables, tiempos, pantallas, rutas y evidencias pueden cambiar después de los ensayos o de una nueva verificación del repositorio. Antes de la entrega final se deben confirmar los nombres, ejecutar nuevamente la demo y sustituir cualquier referencia que ya no coincida con el código. Un cambio de orden no elimina la obligación de que cada integrante explique su patrón, el problema que resuelve, su implementación, los trade-offs y su convivencia con Clean Architecture.

Última actualización organizativa: 12 de octubre de 2026.

## 1. Mensaje central

> SLS es un monolito modular multiempresa con Clean Architecture y comunicación orientada a eventos. El flujo síncrono protege las reglas de negocio y persiste el evento en un outbox; un worker separado lo publica y consume mediante RabbitMQ con idempotencia, reintentos limitados y DLQ.

La defensa debe demostrar coherencia entre problema, arquitectura, código y ejecución. No conviene enumerar tecnologías sin explicar qué riesgo resuelve cada decisión.

## 2. Orden sugerido y ubicación de cada solución

| Tiempo | Responsable sugerido | Tema que defiende | Solución específica que se muestra | Dónde se muestra |
| --- | --- | --- | --- | --- |
| 0:00–1:00 | Humberto | Problema, actores y alcance | Separación entre operación del tenant, plataforma SLS y dependencia externa del mapa | `docs/architecture/c4-registration.md`, **Nivel 1 — Contexto** |
| 1:00–2:30 | Juanangel | Event-driven y contenedores | API y worker como procesos distintos; PostgreSQL + Outbox; RabbitMQ con retry/DLQ | C4 nivel 2; `docker-compose.yml`, servicios `backend`, `worker`, `postgres` y `rabbitmq` |
| 2:30–4:00 | Vivian | Clean Architecture en registro de paquetes | Recorrido `Controller → Use Case → Domain → Port → Prisma Adapter`; registro atómico de paquete, historial y Outbox | C4 nivel 3; `backend/src/modules/packages/{presentation,application,domain,infrastructure}`; Bruno paso 04 |
| 4:00–5:15 | Humberto | Chain of Responsibility | Validaciones ordenadas, corte temprano y resultado `PENDING_ASSIGNMENT` como negocio | `backend/src/modules/assignments/domain/validation.chain.ts`, `domain/handlers/` y `test/assignment-validation-chain.spec.ts` |
| 5:15–6:15 | Vivian | State | Transición válida, transición inválida y evento de cambio de estado | `backend/src/modules/packages/domain/package-state.ts`, `package-states.ts` y `test/package-state.spec.ts` |
| 6:15–7:15 | Santiago | Iterator + visualización de ruta | Recorridos ordered/pending/failed; frontend consume paradas ordenadas y mantiene lista si fallan los tiles | `backend/src/modules/routes/domain/route-stop-iterator/`, `/app/rutas/:routeId` y `frontend/src/app/rutas/RouteMap.tsx` |
| 7:15–8:30 | Juanangel | Outbox, Idempotent Consumer, retry y DLQ | Publicación posterior al commit, duplicado sin repetir efecto y fallo agotado aislado | `backend/src/shared/application/messaging/`, `backend/src/shared/infrastructure/messaging/`, RabbitMQ Management y tablas de evidencia |
| 8:30–12:30 | Operador: Santiago; narración rotativa | Demo funcional integrada | Login → recursos → paquete → historial/Outbox → worker → error controlado → ruta/mapa | `bruno/SLS API/00 Demo MVP`, interfaz `/app`, logs, RabbitMQ Management y consultas del runbook |
| 12:30–14:00 | Todo el grupo | Trade-offs, límites y cierre | Coherencia entre C4, código, pruebas y ejecución; alcance real y pendientes declarados | C4 resumido, matriz de evidencias y sección 9 de este guion |

Los responsables son una propuesta basada en el reparto actual. El grupo puede intercambiarlos, pero cada estudiante debe poder explicar problema, implementación, trade-offs y convivencia con Clean Architecture.

### 2.1 Cómo usar esta tabla durante los ensayos

- Las rutas técnicas indicadas en el guion son relativas al repositorio `SLS-Smart-Logistics-System`.
- **Tema que defiende** indica lo que debe explicar la persona; no es una lista de tecnologías.
- **Solución específica que se muestra** identifica el comportamiento concreto que prueba la afirmación.
- **Dónde se muestra** define la ventana que debe estar preparada antes de comenzar.
- Si una evidencia no funciona en un ensayo, se reemplaza por otra evidencia verificable o se declara como limitación; no se improvisa una funcionalidad.
- Después de cada ensayo se pueden ajustar tiempos, responsables y orden. Se debe registrar la fecha del ajuste al inicio de este documento.

## 3. Apertura

### Texto sugerido

"Smart Logistics System centraliza el ciclo logístico urbano desde el registro del paquete hasta la asignación, ejecución y cierre de rutas. El problema no era solamente guardar información: debíamos aislar empresas, controlar estados, respetar capacidad y procesar eventos sin duplicar efectos. Por eso usamos un monolito modular con Clean Architecture y una arquitectura orientada a eventos mediante RabbitMQ."

### Alcance que sí debe declararse

- SaaS B2B multiempresa con esquema compartido y `tenantId`.
- API NestJS modular, PostgreSQL/PostGIS, RabbitMQ y worker NestJS separado.
- Registro protegido de paquetes, vehículos y mensajeros.
- Zonas, planificación, asignación, rutas, entregas y cierre en el backend.
- State, Chain of Responsibility, Iterator, Outbox, Idempotent Consumer y DLQ con evidencia en código o pruebas.

### Afirmaciones que deben evitarse

- No decir "exactly once"; se ofrece entrega al menos una vez con efectos idempotentes.
- No afirmar optimización global de rutas; se usan heurísticas deterministas.
- Haversine representa distancia geográfica, no tiempo ni distancia vial.
- La polilínea de OpenStreetMap representa el orden de paradas, no navegación vial ni GPS en tiempo real.
- No afirmar que todo el frontend consume la API mientras `VITE_USE_MOCK_DATA` siga activo.
- No presentar correo/notificaciones como completos sin evidencia final.

## 4. Defensa de la arquitectura

### 4.1 Estilo orientado a eventos

**Momento:** 1:00–2:30, explicación de Juanangel.

**Dónde se muestra la solución:**

1. Abrir `docs/architecture/c4-registration.md` en **Nivel 2 — Contenedores**.
2. Señalar `backend`, `worker`, `postgres` y `rabbitmq` en `docker-compose.yml`.
3. Durante la demo, relacionar el paso 04 de Bruno con `OutboxEvent` y el paso 08 con el worker/RabbitMQ.

**Qué debe observar el público:** el comando HTTP puede terminar con la información persistida y el evento queda recuperable en Outbox; el worker se ocupa de la entrega asíncrona.

Problema: publicar directamente al broker después de guardar un paquete puede dejar la base confirmada y el evento perdido, o el evento publicado sin que la transacción se confirme.

Implementación: la operación guarda el agregado, su historial y un `OutboxEvent` en la misma transacción. El worker reclama eventos pendientes, publica con confirmación y luego actualiza su estado.

Trade-offs:

- Hay consistencia eventual entre API y consumidores.
- El diseño agrega tablas, estados operativos, reintentos y monitoreo.
- A cambio, el flujo HTTP no queda acoplado a la disponibilidad instantánea del broker.

Convivencia con Clean Architecture: aplicación depende de puertos de publicación/persistencia; RabbitMQ y Prisma son adaptadores externos.

### 4.2 Monolito modular

**Momento:** dentro del bloque 1:00–2:30, después del C4 nivel 2.

**Dónde se muestra la solución:** C4 nivel 3 y árbol `backend/src/modules/`. Comparar las capacidades `packages`, `assignments`, `routes` y `deliveries`, y mostrar que API y worker comparten el código base pero usan entry points distintos.

**Qué debe observar el público:** existen límites por capacidad y procesos separados sin afirmar que cada módulo sea un microservicio.

Problema: el equipo necesita separar capacidades sin asumir el costo operativo de microservicios.

Implementación: un código base NestJS organizado por negocio, con procesos distintos para API y worker.

Trade-off: los módulos comparten despliegue y base de datos, pero se reducen la complejidad de red, despliegue y observabilidad.

Frase de defensa: "Event-driven no significa obligatoriamente microservicios. Separamos procesos donde la asincronía aporta resiliencia y mantenemos el dominio en un monolito modular realizable para cuatro estudiantes."

## 5. Defensa individual de patrones

### 5.1 Humberto — Chain of Responsibility

- Momento: 4:00–5:15.
- Problema: la asignación debe ejecutar validaciones ordenadas sin crear un servicio monolítico lleno de condicionales.
- Implementación: handlers independientes para tenant, datos, coordenadas, zona, disponibilidad, peso, volumen y mensajero delegan al siguiente o interrumpen con una razón estable.
- Evidencia: `backend/src/modules/assignments/domain/handlers/`, `validation.chain.ts` y `assignment-validation-chain.spec.ts`.
- Mostrar en vivo: abrir primero `validation.chain.ts` para señalar el orden; después abrir un handler de capacidad y una prueba que demuestre interrupción temprana. Si la demo funcional incluye un paquete sin capacidad, mostrar `PENDING_ASSIGNMENT` y aclarar que no es DLQ.
- Frase puente a la solución: "La solución no es el diagrama de la cadena: es este flujo ejecutable, donde cada handler decide una regla y el primero que rechaza evita crear una asignación inválida".
- Trade-off: el orden es significativo y una cadena demasiado larga puede dificultar el seguimiento; se compensa con handlers pequeños y pruebas de orden/interrupción.
- Clean Architecture: la cadena vive en dominio y no importa NestJS, Prisma ni HTTP.

### 5.2 Vivian — State

- Momento: 5:15–6:15.
- Problema: impedir transiciones arbitrarias del paquete y centralizar el comportamiento por estado.
- Implementación: el contexto delega en implementaciones de `PackageState`; una transición válida genera historial/evento y una inválida produce un error tipado.
- Evidencia: `package-state.ts`, `package-state.factory.ts`, `package-states.ts` y sus pruebas.
- Mostrar en vivo: abrir `package-states.ts` y comparar una transición permitida con una rechazada en `backend/src/modules/packages/test/package-state.spec.ts`. Relacionar la transición con el historial visible en el paso 05 de Bruno.
- Frase puente a la solución: "El estado no se cambia con una asignación libre; el objeto de dominio controla la transición y produce la evidencia que luego persiste la aplicación".
- Trade-off: aparecen más clases y se debe mantener sincronía con enums y persistencia.
- Clean Architecture: la regla de transición permanece en dominio; el adaptador Prisma solo persiste el resultado.

### 5.3 Santiago — Iterator

- Momento: 6:15–7:15.
- Problema: recorrer diferentes vistas de las paradas sin exponer ni duplicar la colección interna de una ruta.
- Implementación: iteradores ordered, pending y failed consumen una ruta ya calculada.
- Evidencia: `backend/src/modules/routes/domain/route-stop-iterator/` y `route-stop-iterator.spec.ts`.
- Mostrar en vivo: abrir `ordered-route-stop.iterator.ts`, `pending-route-stop.iterator.ts` y una prueba comparativa; después navegar a `/app/rutas/:routeId` y señalar que `RouteMap` representa el orden recibido, mientras la lista conserva la información operativa.
- Frase puente a la solución: "El Iterator resuelve cómo recorrer una ruta ya calculada; OpenStreetMap solo visualiza el resultado y no reemplaza el algoritmo del backend".
- Trade-off: es abstracción adicional para una colección que podría recorrerse directamente; se justifica porque existen recorridos semánticos diferentes.
- Clean Architecture: el patrón es dominio puro y no calcula clustering ni ordenamiento.

Santiago puede conectar esta explicación con `RouteMap`: el frontend recibe paradas ya ordenadas y solamente las representa mediante marcadores y una polilínea.

### 5.4 Juanangel — Idempotent Consumer y DLQ

- Momento: 7:15–8:30.
- Problema: RabbitMQ puede volver a entregar mensajes; repetir el efecto podría duplicar auditoría, capacidad o notificaciones.
- Implementación: identidad `tenantId + eventId + consumerName`, registro y efecto en una transacción local, ACK posterior al commit. Fallos transitorios pasan por reintentos limitados; contratos inválidos o intentos agotados llegan a DLQ; identidad dudosa se pone en cuarentena.
- Evidencia: `idempotent-consumer.ts`, `retry-policy.ts`, `rabbitmq-failure.router.ts`, `dead-letter-recorder.ts` y las pruebas RMQ.
- Mostrar en vivo: abrir `backend/src/shared/application/messaging/idempotent-consumer.ts` y su prueba de duplicado; en RabbitMQ Management señalar cola principal, retries y DLQ; en base de datos mostrar un único `ProcessedEvent` para el mismo consumidor. Para recuperación, usar únicamente el redrive documentado en `docs/demo/mvp-demo.md`.
- Frase puente a la solución: "RabbitMQ puede entregar más de una vez; la garantía de negocio está en no repetir el efecto, no en prometer que el transporte nunca duplica".
- Trade-off: requiere persistencia adicional, claves únicas y disciplina transaccional; no elimina duplicados del transporte, evita repetir el efecto.
- Clean Architecture: las políticas y puertos están en aplicación; AMQP y Prisma están en infraestructura.

## 6. Demo principal

La persona que opera no debe improvisar datos. Debe seguir la colección Bruno numerada que entregue `DEMO-01`.

### 6.1 Mapa de pantallas y evidencia específica

| Paso | Quién narra | Solución que se demuestra | Lugar exacto |
| --- | --- | --- | --- |
| Servicios | Juanangel | API y worker separados; dependencias disponibles | `docker compose ps`, logs de `backend`/`worker`, RabbitMQ Management |
| Login | Juanangel | Identidad y tenant obtenidos de sesión confiable | Bruno `01 Login Admin`; respuesta/cookie sin mostrar secretos |
| Vehículo y courier | Vivian | Recursos del mismo tenant y capacidad disponible | Bruno `02 Register Vehicle` y `03 Register Courier`; opcional `/app/admin/vehiculos` |
| Registro de paquete | Vivian | Validación, persistencia atómica, estado inicial e historial | `/app/paquetes/nuevo` o Bruno `04 Register Package`; luego `/app/paquetes/:packageId` |
| Historial y ruta | Vivian → Humberto | State persistido y paquete incorporado al flujo logístico | Bruno `05 Evidence - Route and Package History` y detalle de paquete/ruta |
| Planificación | Humberto | Coordenadas, capacidad, Chain y resultado asignado o pendiente | `/app/planificacion`, `/app/pendientes` y respuesta de planificación preparada |
| Outbox y worker | Juanangel | Evento recuperable, publicación y consumo idempotente | Consulta `OutboxEvent`/`ProcessedEvent`, logs y Bruno `08 Evidence - Worker and RabbitMQ Queue Status` |
| Error controlado | Vivian o Juanangel | Código estable sin filtrar datos ni producir éxito falso | Bruno `06 Controlled Error - Duplicate Tracking Code` y `07 Controlled Error - Invalid Vehicle Data` |
| Ruta y mapa | Santiago | Paradas ordenadas, lista operativa y visualización OpenStreetMap | `/app/rutas/:routeId`, componente `frontend/src/app/rutas/RouteMap.tsx` |

> [!note] Ajuste permitido
> Si el tiempo real es menor, conservar login, registro de paquete, historial/Outbox, un patrón, un error controlado y el mapa. Los demás pasos pueden quedar como evidencia de respaldo. Esta selección también está sujeta a cambios después del ensayo general.

### Flujo esperado

1. Mostrar servicios saludables: API, PostgreSQL, RabbitMQ y worker.
2. Iniciar sesión y conservar la cookie segura de la colección.
3. Registrar o consultar catálogos deterministas: zona y tipo de envío.
4. Registrar vehículo y mensajero.
5. Registrar paquete con coordenadas de Barranquilla.
6. Mostrar respuesta HTTP, historial y evento `PackageRegistered` en outbox.
7. Mostrar al worker publicando/consumiendo y el efecto de auditoría.
8. Repetir un evento o ejecutar la evidencia preparada de idempotencia: un solo efecto.
9. Ejecutar un error controlado: dato inválido, permiso insuficiente o recurso ajeno; mostrar código y respuesta estable sin filtrar datos.
10. Mostrar ruta/paradas y el mapa OpenStreetMap, aclarando que la lista permanece disponible si fallan los tiles.

### Evidencia reportada que debe revalidarse antes de exponer

- [ ] Servicios activos: PostgreSQL y RabbitMQ saludables; API, worker y frontend en ejecución.
- [ ] Flujo HTTP: login `200`, vehículo `201`, mensajero `201`, paquete `201`, detalle de ruta `200` y duplicado controlado `409`.
- [ ] Mensajería: `PackageRegistered` publicado, consumido una sola vez y registrado en auditoría.
- [ ] Recuperación: redrive desde DLQ con resultado `PUBLISHED` y protección posterior `ALREADY_PROCESSED`.
- [ ] Backend: ejecutar nuevamente build y pruebas; registrar el total real del ensayo, sin reutilizar una cifra histórica.
- [ ] Frontend: ejecutar nuevamente build y pruebas; registrar el total real del ensayo.

Los totales de pruebas son evidencia fechada, no una cifra permanente. Deben actualizarse si cambia la rama o el conjunto de suites.

### Narración durante la demo

No describir solamente clics. Para cada paso decir:

1. qué regla se está demostrando;
2. en qué capa se decide;
3. qué infraestructura se usa;
4. cuál es la evidencia observable.

Ejemplo: "Esta solicitud no envía libremente el tenant; el contexto se obtiene de la sesión. El controlador mapea el DTO, el caso de uso coordina el registro y el adaptador persiste paquete, historial y outbox en una transacción."

## 7. Manejo de errores para mostrar

Elegir al menos dos evidencias:

- Validación: `400` con código estable y metadato de campo.
- Autorización o tenant: `401/403/404` sin revelar que el recurso pertenece a otra empresa.
- Resultado de negocio: paquete `PENDING_ASSIGNMENT` por falta de capacidad, no DLQ.
- Fallo asíncrono: reintento limitado y posterior DLQ/cuarentena.
- Logs: correlación suficiente sin tokens, contraseñas ni datos personales completos.

## 8. Plan de contingencia

Si falla un componente durante la exposición:

- API disponible, broker caído: mostrar que el registro se conserva junto con el outbox pendiente y explicar recuperación posterior.
- Tiles de OpenStreetMap caídos: conservar la lista de paradas; el mapa no es fuente de verdad.
- Frontend inestable: ejecutar el flujo Bruno contra la API.
- Seed fallido: usar los identificadores deterministas previamente documentados, no crear datos improvisados.
- Demo completa no recuperable: mostrar capturas fechadas, salida de pruebas y el C4, declarando con honestidad que es evidencia previa.

## 9. Preguntas probables

### ¿Por qué RabbitMQ y no Kafka?

El MVP necesita colas de trabajo, ACK manual, reintentos, routing y DLQ; no necesita retención prolongada ni reproducción masiva de streams.

### ¿Por qué no microservicios?

El monolito modular conserva límites internos y permite separar el worker, sin introducir despliegues, redes y consistencia distribuida innecesarios para el equipo y el plazo.

### ¿Cómo garantizan aislamiento multiempresa?

El tenant proviene de identidad confiable, los repositorios filtran por tenant, PostgreSQL aplica RLS y existen pruebas con Tenant A/Tenant B.

### ¿Qué pasa si llega dos veces el mismo evento?

El consumidor intenta registrar su identidad transaccional. Si ya existe, confirma el mensaje sin repetir el efecto.

### ¿Qué pasa si no hay capacidad?

Es un resultado de negocio: el paquete queda `PENDING_ASSIGNMENT` para revisión manual. No se trata como fallo técnico ni se envía a DLQ.

### ¿La ruta mostrada en el mapa es la ruta real por calles?

No. Si el mapa está presente, la polilínea muestra el orden calculado de paradas. El MVP no promete navegación vial exacta ni GPS en tiempo real.

## 10. Lista de cierre del ensayo

- Cada integrante puede explicar su patrón sin leer definiciones genéricas.
- Cada afirmación importante apunta a un archivo, prueba o paso de demo.
- Cada integrante sabe exactamente qué ventana abre y qué parte de la solución señala.
- Las rutas de archivos y pantallas de la tabla de la sección 2 coinciden con la rama que se presentará.
- Una persona controla la demo y otra mantiene la narración.
- La colección Bruno se ejecutó desde un entorno limpio.
- Existen capturas de respaldo de los pasos críticos.
- El grupo conoce qué quedó fuera del MVP.
- El grupo revisó y aceptó los últimos cambios de responsables, orden y tiempos.

> [!warning] Cierre organizativo
> Hasta que el grupo realice el ensayo general y marque esta lista, el reparto debe considerarse provisional y sujeto a cambios. La versión usada el día de la exposición debe incluir la fecha del último ensayo y el nombre del operador principal de la demo.
