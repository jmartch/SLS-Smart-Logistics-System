import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InvalidCatalogCodeError } from '../domain/catalog-code';
import { InvalidCatalogNameError } from '../domain/catalog-name';

export function handleCatalogDomainError(error: unknown): never {
  if (
    error instanceof InvalidCatalogCodeError ||
    error instanceof InvalidCatalogNameError
  ) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: error.message,
    });
  }

  throw error;
}

export function handleCatalogConflict(code: string): never {
  if (code === 'CATALOG_CODE_CONFLICT') {
    throw new ConflictException({
      code: 'CATALOG_CODE_CONFLICT',
      message: 'El código ya está en uso en este catálogo.',
      fields: { code: 'Utiliza otro código.' },
    });
  }

  if (code === 'ZONE_NOT_FOUND') {
    throw new NotFoundException({
      code: 'CATALOG_RESOURCE_NOT_FOUND',
      message: 'La zona especificada no existe en la empresa.',
    });
  }

  throw new ConflictException({ code, message: 'Conflicto en la operación.' });
}
