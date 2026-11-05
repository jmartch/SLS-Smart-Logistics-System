import { CatalogDomainError } from './catalog-errors';

export type InvalidCatalogCodeReason =
  'EMPTY_CODE' | 'CODE_TOO_LONG' | 'INVALID_CODE_CHARACTERS';

const CATALOG_CODE_ERROR_MESSAGES: Readonly<
  Record<InvalidCatalogCodeReason, string>
> = {
  EMPTY_CODE: 'Catalog code cannot be empty',
  CODE_TOO_LONG: 'Catalog code cannot exceed 30 characters',
  INVALID_CODE_CHARACTERS:
    'Catalog code must contain only uppercase letters, digits, hyphens, or underscores',
};

export class InvalidCatalogCodeError extends CatalogDomainError {
  override readonly field = 'code' as const;

  constructor(readonly code: InvalidCatalogCodeReason) {
    super(CATALOG_CODE_ERROR_MESSAGES[code], 'code');
  }
}

export function normalizeCatalogCode(value: string): string {
  if (typeof value !== 'string') {
    throw new InvalidCatalogCodeError('EMPTY_CODE');
  }

  const code = value.trim().toUpperCase();

  if (code.length === 0) {
    throw new InvalidCatalogCodeError('EMPTY_CODE');
  }

  if (code.length > 30) {
    throw new InvalidCatalogCodeError('CODE_TOO_LONG');
  }

  if (!/^[A-Z0-9_-]+$/.test(code)) {
    throw new InvalidCatalogCodeError('INVALID_CODE_CHARACTERS');
  }

  return code;
}
