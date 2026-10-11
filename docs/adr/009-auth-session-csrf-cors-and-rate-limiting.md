# ADR 009: Contrato de acceso AUTH-01, sesión en cookie, política CSRF/CORS y rate limiting de login

- **Estado:** Aceptado
- **Fecha:** 2026-10-10
- **Módulos relacionados:** `AUTH-01`, `TENANT-01`, `platform`, `users`

## 1. Contexto

El sistema Smart Logistics System (SLS) opera como una plataforma SaaS B2B multi-tenant donde:

1. Un mismo correo electrónico (`email`) puede existir en distintas empresas (`User_tenantId_email_key`), por lo que `email + password` no identifica de forma única una cuenta de empleado.
2. El superadministrador de plataforma (`PlatformAdmin`) opera el alta controlada de empresas (`POST /api/v1/platform/tenants`) fuera del dominio operativo de un tenant.
3. El cliente web no debe almacenar tokens de sesión en `localStorage` para mitigar la exfiltración de credenciales ante vectores XSS.
4. La superficie de autenticación (`POST /api/v1/auth/login` y `POST /api/v1/platform/login`) y las mutaciones autenticadas mediante cookie requieren protección explícita contra fuerza bruta, enumeración de empresas/usuarios y falsificación de peticiones cross-site (CSRF).

## 2. Decisiones

### 2.1 Identificador público de empresa (`Tenant.slug`)

- Cada empresa posee un identificador público e inmutable `slug` (`^[a-z0-9]+(-[a-z0-9]+)*$`, único en PostgreSQL) distinto de su UUID interno (`tenantId`).
- El login de empleados (`POST /api/v1/auth/login`) recibe `{ slug, email, password }`.
- Si el `slug` no existe, la empresa no está `ACTIVE`, el usuario no existe, el usuario no está `ACTIVE` o la contraseña no coincide, el backend ejecuta verificación Argon2id en tiempo constante (incluyendo hash señuelo cuando no existe fila) y responde con el mismo error `401 INVALID_CREDENTIALS`.

### 2.2 Sesión opaca en servidor y atributos de cookie (`sls_session`)

- La sesión se representa mediante un token aleatorio criptográfico de 256 bits (`32` bytes en `base64url`) enviado exclusivamente en la cookie `sls_session`.
- En PostgreSQL (`Session`) solo se almacena el hash `SHA-256` del token (`tokenHash`), junto con una restricción `CHECK` (`Session_actor_coherence_check`) que garantiza que cada sesión pertenezca exactamente a un `TENANT_USER` (`tenantId` + `userId`) o a un `PLATFORM_ADMIN` (`platformAdminId`).
- Atributos obligatorios de `sls_session` tanto al emitir (`res.cookie`) como al limpiar (`res.clearCookie`):
  - `HttpOnly: true` (inaccesible desde `document.cookie`).
  - `SameSite: 'lax'`.
  - `Path: '/'`.
  - `Secure: process.env.NODE_ENV === 'production'`.

### 2.3 Preferencia Same-Origin y política CORS / CSRF (Origin)

- **Same-origin por defecto:** En desarrollo (`frontend/vite.config.ts`), el servidor de Vite encamina `/api` hacia el servicio `backend`. En despliegue productivo, el reverse proxy sirve frontend y `/api/v1` bajo el mismo origen.
- **CORS con allowlist explícita:** Si se requiere acceso desde orígenes explícitos adicionales, se configuran mediante `CORS_ALLOWED_ORIGINS` (lista separada por comas) con `credentials: true`. Nunca se permite `origin: '*'` con cookies de sesión.
- **Validación de `Origin` / `Referer` en métodos mutantes (`POST`, `PUT`, `PATCH`, `DELETE`):**
  - Toda solicitud mutante que incluya cabecera `Origin` (o `Referer` cuando `Origin` esté ausente) debe coincidir con el propio `Host` de la solicitud (`http(s)://<host>`) o con uno de los orígenes declarados en `CORS_ALLOWED_ORIGINS`.
  - Si el origen no está autorizado, la solicitud se rechaza antes de ejecutar cualquier controlador con `403 Forbidden`:
    ```json
    {
      "error": {
        "code": "CSRF_ORIGIN_MISMATCH",
        "message": "Cross-origin state-changing request is not allowed.",
        "fields": null
      }
    }
    ```

### 2.4 Rate limiting en login sin enumeración de tenant o usuario

- Los endpoints `POST /api/v1/auth/login` y `POST /api/v1/platform/login` aplican un limitador de intentos fallidos en ventana móvil/fija (`LoginRateLimiter`) acotado en memoria:
  - Clave de login tenant: `tenant:<ip>:<slug_normalizado>:<email_normalizado>`.
  - Clave de login plataforma: `platform:<ip>:<email_normalizado>`.
- Todos los fallos de credenciales (`INVALID_CREDENTIALS`), exista o no la empresa o el usuario, incrementan el contador de la misma forma. Un intento exitoso dentro del límite restablece el contador de esa clave.
- Al alcanzar el umbral (`AUTH_LOGIN_RATE_LIMIT_MAX`, por defecto `5` intentos fallidos por ventana de `AUTH_LOGIN_RATE_LIMIT_WINDOW_MS`, por defecto `60000` ms), los intentos subsiguientes devuelven `429 Too Many Requests` con cabecera `Retry-After` y envelope estable:
  ```json
  {
    "error": {
      "code": "TOO_MANY_REQUESTS",
      "message": "Too many login attempts. Please try again later.",
      "fields": null
    }
  }
  ```

## 3. Consecuencias

- Ningún endpoint tenant-owned confía en `tenantId` enviado por el cliente; el contexto se deriva exclusivamente de la sesión validada (`request.actor`).
- Los intentos de fuerza bruta y las solicitudes mutantes cross-origin quedan bloqueados con códigos de error deterministas (`TOO_MANY_REQUESTS`, `CSRF_ORIGIN_MISMATCH`) y cubiertos por pruebas unitarias y E2E.
