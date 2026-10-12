import { CatalogDomainError } from './catalog-errors';

export type InvalidCatalogNameReason = 'EMPTY_NAME' | 'NAME_TOO_LONG';

const CATALOG_NAME_ERROR_MESSAGES: Readonly<
  Record<InvalidCatalogNameReason, string>
> = {
  EMPTY_NAME: 'Catalog name cannot be empty',
  NAME_TOO_LONG: 'Catalog name cannot exceed 100 characters',
};

export class InvalidCatalogNameError extends CatalogDomainError {
  override readonly field = 'name' as const;

  constructor(readonly code: InvalidCatalogNameReason) {
    super(CATALOG_NAME_ERROR_MESSAGES[code], 'name');
  }
}

export function normalizeCatalogName(value: string): string {
  if (typeof value !== 'string') {
    throw new InvalidCatalogNameError('EMPTY_NAME');
  }

  const name = value.trim();

  if (name.length === 0) {
    throw new InvalidCatalogNameError('EMPTY_NAME');
  }

  if ([...name].length > 100) {
    throw new InvalidCatalogNameError('NAME_TOO_LONG');
  }

  return name;
}
