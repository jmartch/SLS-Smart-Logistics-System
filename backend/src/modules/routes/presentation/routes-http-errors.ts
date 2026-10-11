import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  IdempotencyKeyReusedError,
  RouteAlreadyCompletedError,
  RouteConcurrencyConflictError,
  RouteCustodyUnresolvedError,
  RouteDomainError,
  RouteForbiddenError,
  RouteHasPendingStopsError,
  RouteManifestEmptyError,
  RouteManifestInconsistentError,
  RouteManifestInvalidError,
  RouteNotCompletedError,
  RouteNotFoundError,
  RouteResourceUnavailableError,
  RouteStateConflictError,
  RouteValidationError,
} from '../domain/route-errors';

export function handleRoutesDomainError(error: unknown): never {
  if (error instanceof RouteNotFoundError) {
    throw new NotFoundException({
      code: error.code,
      message: error.message,
    });
  }

  if (error instanceof RouteForbiddenError) {
    throw new ForbiddenException({
      code: error.code,
      message: error.message,
    });
  }

  if (
    error instanceof RouteStateConflictError ||
    error instanceof RouteResourceUnavailableError ||
    error instanceof RouteConcurrencyConflictError ||
    error instanceof RouteCustodyUnresolvedError ||
    error instanceof RouteManifestInconsistentError ||
    error instanceof RouteHasPendingStopsError ||
    error instanceof RouteAlreadyCompletedError ||
    error instanceof RouteNotCompletedError ||
    error instanceof IdempotencyKeyReusedError
  ) {
    throw new ConflictException({
      code: error.code,
      message: error.message,
    });
  }

  if (
    error instanceof RouteValidationError ||
    error instanceof RouteManifestInvalidError ||
    error instanceof RouteManifestEmptyError
  ) {
    throw new BadRequestException({
      code: error.code,
      message: error.message,
    });
  }

  if (error instanceof RouteDomainError) {
    throw new BadRequestException({
      code: error.code,
      message: error.message,
    });
  }

  // Errores imprevistos o genéricos
  throw error;
}
