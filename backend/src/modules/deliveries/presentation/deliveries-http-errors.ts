import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  DeliveryDomainError,
  DeliveryForbiddenError,
  DeliveryNotFoundError,
  DeliveryStateConflictError,
  DeliveryValidationError,
  IdempotencyConflictError,
  StopStateConflictError,
} from '../domain/delivery-errors';

export function handleDeliveriesDomainError(error: unknown): never {
  if (error instanceof DeliveryNotFoundError) {
    throw new NotFoundException({
      code: error.code,
      message: error.message,
    });
  }

  if (error instanceof DeliveryForbiddenError) {
    throw new ForbiddenException({
      code: error.code,
      message: error.message,
    });
  }

  if (
    error instanceof DeliveryStateConflictError ||
    error instanceof StopStateConflictError ||
    error instanceof IdempotencyConflictError
  ) {
    throw new ConflictException({
      code: error.code,
      message: error.message,
    });
  }

  if (error instanceof DeliveryValidationError) {
    throw new BadRequestException({
      code: error.code,
      message: error.message,
      field: error.field,
    });
  }

  if (error instanceof DeliveryDomainError) {
    throw new BadRequestException({
      code: error.code,
      message: error.message,
    });
  }

  throw error;
}
