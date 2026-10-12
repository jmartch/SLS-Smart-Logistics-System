import {
  InvalidCatalogCodeError,
  normalizeCatalogCode,
} from '../domain/catalog-code';
import { CatalogDomainError } from '../domain/catalog-errors';
import {
  InvalidCatalogNameError,
  normalizeCatalogName,
} from '../domain/catalog-name';

describe('Catalog values', () => {
  describe('normalizeCatalogCode', () => {
    it('trims outer whitespace and converts a code to uppercase', () => {
      const input = ' norte ';

      const result = normalizeCatalogCode(input);

      expect(result).toBe('NORTE');
    });

    it('accepts digits, hyphens and underscores in a code', () => {
      const input = 'norte-1_a';

      const result = normalizeCatalogCode(input);

      expect(result).toBe('NORTE-1_A');
    });

    it('accepts codes at the minimum and maximum lengths', () => {
      const minimumLengthCode = 'A';
      const maximumLengthCode = 'A'.repeat(30);

      const minimumLengthResult = normalizeCatalogCode(minimumLengthCode);
      const maximumLengthResult = normalizeCatalogCode(maximumLengthCode);

      expect(minimumLengthResult).toBe('A');
      expect(maximumLengthResult).toBe('A'.repeat(30));
    });

    it('preserves a code when it is normalized again', () => {
      const normalizedCode = normalizeCatalogCode(' norte ');

      const result = normalizeCatalogCode(normalizedCode);

      expect(result).toBe(normalizedCode);
    });

    it.each([
      {
        scenario: 'an empty code',
        value: '',
        reason: 'EMPTY_CODE',
        message: 'Catalog code cannot be empty',
      },
      {
        scenario: 'a whitespace-only code',
        value: '   ',
        reason: 'EMPTY_CODE',
        message: 'Catalog code cannot be empty',
      },
      {
        scenario: 'a code longer than 30 characters',
        value: 'A'.repeat(31),
        reason: 'CODE_TOO_LONG',
        message: 'Catalog code cannot exceed 30 characters',
      },
      {
        scenario: 'a code containing inner whitespace',
        value: 'NORTE SUR',
        reason: 'INVALID_CODE_CHARACTERS',
        message:
          'Catalog code must contain only uppercase letters, digits, hyphens, or underscores',
      },
      {
        scenario: 'a code containing accented letters',
        value: 'RÍO',
        reason: 'INVALID_CODE_CHARACTERS',
        message:
          'Catalog code must contain only uppercase letters, digits, hyphens, or underscores',
      },
      {
        scenario: 'a code containing unsupported punctuation',
        value: 'NORTE!',
        reason: 'INVALID_CODE_CHARACTERS',
        message:
          'Catalog code must contain only uppercase letters, digits, hyphens, or underscores',
      },
    ])('rejects $scenario', ({ value, reason, message }) => {
      const normalize = () => normalizeCatalogCode(value);

      expect(new InvalidCatalogCodeError('EMPTY_CODE')).toBeInstanceOf(
        CatalogDomainError,
      );
      expect(normalize).toThrow(InvalidCatalogCodeError);
      expect(normalize).toThrow(
        expect.objectContaining({
          code: reason,
          field: 'code',
          message,
        }),
      );
    });
  });

  describe('normalizeCatalogName', () => {
    it('trims outer whitespace and preserves the name spelling', () => {
      const input = '  Zona río  ';

      const result = normalizeCatalogName(input);

      expect(result).toBe('Zona río');
    });

    it('preserves inner whitespace in a name', () => {
      const input = 'Zona  norte';

      const result = normalizeCatalogName(input);

      expect(result).toBe('Zona  norte');
    });

    it('accepts names at the minimum and maximum lengths', () => {
      const minimumLengthName = 'A';
      const maximumLengthName = 'A'.repeat(100);

      const minimumLengthResult = normalizeCatalogName(minimumLengthName);
      const maximumLengthResult = normalizeCatalogName(maximumLengthName);

      expect(minimumLengthResult).toBe('A');
      expect(maximumLengthResult).toBe('A'.repeat(100));
    });

    it('accepts a name containing 100 Unicode code points', () => {
      const input = '🚚'.repeat(100);

      const result = normalizeCatalogName(input);

      expect(result).toBe('🚚'.repeat(100));
    });

    it.each([
      {
        scenario: 'an empty name',
        value: '',
        reason: 'EMPTY_NAME',
        message: 'Catalog name cannot be empty',
      },
      {
        scenario: 'a whitespace-only name',
        value: '   ',
        reason: 'EMPTY_NAME',
        message: 'Catalog name cannot be empty',
      },
      {
        scenario: 'a name longer than 100 ASCII characters',
        value: 'A'.repeat(101),
        reason: 'NAME_TOO_LONG',
        message: 'Catalog name cannot exceed 100 characters',
      },
      {
        scenario: 'a name longer than 100 Unicode code points',
        value: '🚚'.repeat(101),
        reason: 'NAME_TOO_LONG',
        message: 'Catalog name cannot exceed 100 characters',
      },
    ])('rejects $scenario', ({ value, reason, message }) => {
      const normalize = () => normalizeCatalogName(value);

      expect(new InvalidCatalogNameError('EMPTY_NAME')).toBeInstanceOf(
        CatalogDomainError,
      );
      expect(normalize).toThrow(InvalidCatalogNameError);
      expect(normalize).toThrow(
        expect.objectContaining({
          code: reason,
          field: 'name',
          message,
        }),
      );
    });
  });
});
