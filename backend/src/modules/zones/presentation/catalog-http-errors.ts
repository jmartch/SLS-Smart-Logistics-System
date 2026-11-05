import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InvalidCatalogCodeError } from '../domain/catalog-code';
import {
  CatalogCodeConflictError,
  CatalogDomainError,
  CatalogForbiddenError,
  CatalogNotFoundError,
  CatalogValidationError,
} from '../domain/catalog-errors';
import { InvalidCatalogNameError } from '../domain/catalog-name';
import { InvalidCatalogReferenceError } from '../domain/invalid-catalog-reference.error';

export function handleCatalogDomainError(error: unknown): never {
  if (error instanceof CatalogNotFoundError) {
    throw new NotFoundException({
      code: error.code,
      message: error.message,
    });
  }

  if (error instanceof CatalogForbiddenError) {
    throw new ForbiddenException({
      code: error.code,
      message: error.message,
    });
  }

  if (error instanceof CatalogCodeConflictError) {
    throw new ConflictException({
      code: error.code,
      message: error.message,
      ...(error.field ? { field: error.field } : {}),
    });
  }

  if (error instanceof InvalidCatalogReferenceError) {
    if (
      error.code === 'ZONE_TENANT_MISMATCH' ||
      error.code === 'SECTOR_TENANT_MISMATCH'
    ) {
      throw new NotFoundException({
        code: 'CATALOG_RESOURCE_NOT_FOUND',
        message: error.message,
      });
    }

    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: error.message,
      field: error.field,
    });
  }

  if (
    error instanceof CatalogValidationError ||
    error instanceof InvalidCatalogCodeError ||
    error instanceof InvalidCatalogNameError
  ) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: error.message,
      ...(error.field ? { field: error.field } : {}),
    });
  }

  if (error instanceof CatalogDomainError) {
    throw new BadRequestException({
      code: error.code,
      message: error.message,
      ...(error.field ? { field: error.field } : {}),
    });
  }

  throw error;
}

export function handleCatalogConflict(code: string): never {
  if (code === 'CATALOG_CODE_CONFLICT') {
    return handleCatalogDomainError(new CatalogCodeConflictError());
  }

  if (code === 'ZONE_NOT_FOUND') {
    return handleCatalogDomainError(
      new CatalogNotFoundError(undefined, 'Zone'),
    );
  }

  throw new ConflictException({
    code,
    message: 'Catalog operation conflict',
  });
}
