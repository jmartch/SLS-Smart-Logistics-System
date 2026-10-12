import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  InvalidCourierError,
  type InvalidCourierReason,
} from '../domain/invalid-courier.error';

const REASON_MESSAGES: Record<InvalidCourierReason, string> = {
  REQUIRED: 'El identificador de usuario (userId) es obligatorio.',
  INVALID_FORMAT:
    'El identificador de usuario (userId) debe ser un UUID válido.',
};

export function handleCourierDomainError(error: unknown): never {
  if (error instanceof InvalidCourierError) {
    const detail = REASON_MESSAGES[error.reason];

    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: detail,
      fields: { [error.field]: detail },
    });
  }

  throw error;
}

export function handleCourierFailure(code: string): never {
  if (code === 'COURIER_USER_NOT_FOUND') {
    throw new NotFoundException({
      code: 'COURIER_USER_NOT_FOUND',
      message: 'El usuario no existe en esta empresa.',
      fields: { userId: 'Indica un usuario de esta empresa.' },
    });
  }

  if (code === 'COURIER_USER_NOT_ELIGIBLE') {
    throw new ConflictException({
      code: 'COURIER_USER_NOT_ELIGIBLE',
      message: 'El usuario no está activo y no puede ser repartidor.',
      fields: { userId: 'Usa un usuario activo.' },
    });
  }

  if (code === 'COURIER_USER_ALREADY_LINKED') {
    throw new ConflictException({
      code: 'COURIER_USER_ALREADY_LINKED',
      message: 'Ese usuario ya está registrado como repartidor.',
      fields: { userId: 'Elige otro usuario.' },
    });
  }

  throw new ConflictException({ code, message: 'Conflicto en la operación.' });
}
