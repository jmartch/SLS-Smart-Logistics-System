import {
  InvalidCatalogCodeError,
  normalizeCatalogCode,
} from '../domain/catalog-code';
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
      },
      {
        scenario: 'a whitespace-only code',
        value: '   ',
        reason: 'EMPTY_CODE',
      },
      {
        scenario: 'a code longer than 30 characters',
        value: 'A'.repeat(31),
        reason: 'CODE_TOO_LONG',
      },
      {
        scenario: 'a code containing inner whitespace',
        value: 'NORTE SUR',
        reason: 'INVALID_CODE_CHARACTERS',
      },
      {
        scenario: 'a code containing accented letters',
        value: 'RÍO',
        reason: 'INVALID_CODE_CHARACTERS',
      },
      {
        scenario: 'a code containing unsupported punctuation',
        value: 'NORTE!',
        reason: 'INVALID_CODE_CHARACTERS',
      },
    ])('rejects $scenario', ({ value, reason }) => {
      const normalize = () => normalizeCatalogCode(value);

      expect(normalize).toThrow(InvalidCatalogCodeError);
      expect(normalize).toThrow(
        expect.objectContaining({
          code: reason,
          field: 'code',
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
      },
      {
        scenario: 'a whitespace-only name',
        value: '   ',
        reason: 'EMPTY_NAME',
      },
      {
        scenario: 'a name longer than 100 ASCII characters',
        value: 'A'.repeat(101),
        reason: 'NAME_TOO_LONG',
      },
      {
        scenario: 'a name longer than 100 Unicode code points',
        value: '🚚'.repeat(101),
        reason: 'NAME_TOO_LONG',
      },
    ])('rejects $scenario', ({ value, reason }) => {
      const normalize = () => normalizeCatalogName(value);

      expect(normalize).toThrow(InvalidCatalogNameError);
      expect(normalize).toThrow(
        expect.objectContaining({
          code: reason,
          field: 'name',
        }),
      );
    });
  });
});
