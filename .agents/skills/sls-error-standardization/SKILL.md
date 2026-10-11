---
name: sls-error-standardization
description: Audita, estandariza y normaliza las excepciones, mensajes de error y códigos de respuesta en Smart Logistics System (SLS), garantizando consistencia en inglés para el dominio, metadatos de campo para frontend, prevención de fuga multi-tenant y mapeo HTTP según AGENTS.md. Usar cuando se creen o revisen errores de dominio, validaciones de entidad, respuestas de error HTTP o se audite la consistencia de mensajes en SLS.
---

# Estandarización de Errores y Mensajes en SLS

Este skill define el estándar obligatorio para modelar, lanzar, documentar y mapear errores y excepciones en el backend de Smart Logistics System (SLS), alineado con Clean Architecture y las directrices de `AGENTS.md` (§9 y §17).

---

## 1. Principios Fundamentales

1. **Dominio en Inglés:** Todo mensaje lanzado por una excepción de dominio o aplicación (`throw new ...`) debe redactarse en **inglés técnico, conciso e imperativo**. No mezclar español e inglés (Spanglish) en el núcleo de la lógica.
2. **Códigos Estables (`code`):** Los errores de dominio no son solo texto; deben portar un código estable en mayúsculas (`SNAKE_CASE`) para que los clientes API y el frontend puedan reaccionar por código sin parsear texto libre.
3. **Metadatos de Campo (`field`):** Los errores de validación de entrada o propiedades de agregados/entidades deben reportar opcionalmente el campo específico que originó la falla (`field?: string`).
4. **Sanitización Defensiva (`trim`):** Toda comprobación de longitud o no-vacío de strings en el dominio debe evaluar `value.trim()`, evitando que espacios en blanco evadan o distorsionen las validaciones.
5. **Aislamiento Multi-Tenant (Cero Fugas):** Nunca revelar la existencia de recursos pertenecientes a otra empresa. Un recurso inexistente para ese `tenantId` devuelve un `404` o `403` neutro (`Resource not found`), jamás mensajes como `"Resource belongs to another tenant"`.

---

## 2. Jerarquía de Clases de Dominio

Cada módulo debe definir un archivo `<modulo>-errors.ts` dentro de `domain/` con una clase base abstracta y subclases especializadas:

```typescript
// 1. Clase Base del Módulo
export abstract class <Module>DomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// 2. Error de Validación (con campo opcional)
export class <Module>ValidationError extends <Module>DomainError {
  readonly code = 'VALIDATION_ERROR';

  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

// 3. Recurso no encontrado (neutro por tenant)
export class <Module>NotFoundError extends <Module>DomainError {
  readonly code = '<MODULE>_NOT_FOUND';

  constructor(resourceId: string, resourceName = 'Resource') {
    super(`${resourceName} with id '${resourceId}' was not found`);
  }
}

// 4. Conflicto de Estado / Transición Ilegal
export class <Module>StateConflictError extends <Module>DomainError {
  readonly code = '<MODULE>_STATE_CONFLICT';

  constructor(resourceId: string, currentState: string, targetOperation: string) {
    super(
      `${resourceName} '${resourceId}' is in state '${currentState}', which does not allow '${targetOperation}'`,
    );
  }
}

// 5. Permisos / Autorización
export class <Module>ForbiddenError extends <Module>DomainError {
  readonly code = 'FORBIDDEN';

  constructor(message = 'Actor is not authorized to perform this operation') {
    super(message);
  }
}

// 6. Concurrencia Transaccional
export class <Module>ConcurrencyConflictError extends <Module>DomainError {
  readonly code = '<MODULE>_CONCURRENCY_CONFLICT';

  constructor(message = 'Concurrent modification detected during operation') {
    super(message);
  }
}
```

---

## 3. Guía de Redacción de Mensajes

| Tipo de Error | ❌ Antipatrón (Evitar) | ✅ Estándar SLS |
| :--- | :--- | :--- |
| **Longitud máxima** | `throw new Error('Las notas no pueden superar 1000 caracteres.')` | `throw new DeliveryValidationError('Notes cannot exceed 1000 characters', 'notes')` |
| **Campo obligatorio** | `throw new Error('El motivo es obligatorio')` | `throw new DeliveryValidationError('Reason code is mandatory', 'reasonCode')` |
| **Formato / Hash** | `throw new Error('Hash no válido')` | `throw new DeliveryEvidenceValidationError('Checksum must be a valid 64-character SHA-256 hex string', 'checksum')` |
| **Precondición de estado** | `throw new Error('No se puede entregar si no salió')` | `throw new DeliveryStateConflictError(pkgId, state, 'deliver')` |
| **Multi-Tenant / Not Found** | `throw new Error('Este paquete es de otra empresa')` | `throw new DeliveryNotFoundError(pkgId, 'Package')` |

---

## 4. Mapeo en Presentación HTTP (`<modulo>-http-errors.ts`)

En la capa de presentación, un manejador centralizado traduce las excepciones de dominio a respuestas HTTP de NestJS con un payload uniforme:

```typescript
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

export function handle<Module>DomainError(error: unknown): never {
  if (error instanceof <Module>NotFoundError) {
    throw new NotFoundException({
      code: error.code,
      message: error.message,
    });
  }

  if (error instanceof <Module>ForbiddenError) {
    throw new ForbiddenException({
      code: error.code,
      message: error.message,
    });
  }

  if (
    error instanceof <Module>StateConflictError ||
    error instanceof <Module>ConcurrencyConflictError
  ) {
    throw new ConflictException({
      code: error.code,
      message: error.message,
    });
  }

  if (error instanceof <Module>ValidationError) {
    throw new BadRequestException({
      code: error.code,
      message: error.message,
      ...(error.field ? { field: error.field } : {}),
    });
  }

  // Error de dominio genérico
  if (error instanceof <Module>DomainError) {
    throw new BadRequestException({
      code: error.code,
      message: error.message,
    });
  }

  throw error;
}
```

---

## 5. Checklist de Auditoría de Mensajes

Al revisar o crear código en SLS, verificar:

- [ ] ¿Todos los mensajes en `domain/` y `application/` están en **inglés**?
- [ ] ¿Los errores de validación identifican el campo afectado (`field`)?
- [ ] ¿Las validaciones de texto aplican `.trim()` antes de verificar `.length` o contenido?
- [ ] ¿El código estable (`code`) está en mayúsculas y describe la causa de forma predecible?
- [ ] ¿Los errores de no encontrado o no autorizado ocultan información sobre la existencia de datos en otros tenants?
- [ ] ¿El mapper HTTP exporta el `{ code, message, field? }` consistente?
