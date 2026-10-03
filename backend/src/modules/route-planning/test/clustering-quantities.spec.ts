import {
  parseKgToGrams,
  parseM3ToCm3,
  gramsToKg,
  cm3ToM3,
  InvalidClusteringInputError,
} from '../domain';

describe('clustering-quantities', () => {
  describe('parseKgToGrams', () => {
    it('parses valid integer and decimal kilogram strings to exact grams', () => {
      // Arrange & Act & Assert
      expect(parseKgToGrams('10')).toBe(10000);
      expect(parseKgToGrams('10.5')).toBe(10500);
      expect(parseKgToGrams('10.25')).toBe(10250);
      expect(parseKgToGrams('10.125')).toBe(10125);
      expect(parseKgToGrams('0.001')).toBe(1);
      expect(parseKgToGrams('0.000')).toBe(0);
      expect(parseKgToGrams('0')).toBe(0);
    });

    it('throws INVALID_QUANTITY_FORMAT when scale exceeds 3 decimal places', () => {
      // Arrange & Act & Assert
      expect(() => parseKgToGrams('10.1234')).toThrow(
        expect.objectContaining({
          name: 'InvalidClusteringInputError',
          reason: 'INVALID_QUANTITY_FORMAT',
        }),
      );
    });

    it('throws INVALID_QUANTITY_FORMAT on non-canonical or non-numeric strings', () => {
      // Arrange & Act & Assert
      expect(() => parseKgToGrams('abc')).toThrow(
        expect.objectContaining({ reason: 'INVALID_QUANTITY_FORMAT' }),
      );
      expect(() => parseKgToGrams('')).toThrow(
        expect.objectContaining({ reason: 'INVALID_QUANTITY_FORMAT' }),
      );
      expect(() => parseKgToGrams('-5.000')).toThrow(
        expect.objectContaining({ reason: 'INVALID_QUANTITY_FORMAT' }),
      );
      expect(() => parseKgToGrams('01.500')).toThrow(
        expect.objectContaining({ reason: 'INVALID_QUANTITY_FORMAT' }),
      );
      expect(() => parseKgToGrams(123 as unknown as string)).toThrow(
        expect.objectContaining({ reason: 'INVALID_QUANTITY_FORMAT' }),
      );
    });

    it('throws NEGATIVE_QUANTITY when allowZero is false and value is zero', () => {
      // Arrange & Act & Assert
      expect(() => parseKgToGrams('0', false)).toThrow(
        expect.objectContaining({
          name: 'InvalidClusteringInputError',
          reason: 'NEGATIVE_QUANTITY',
        }),
      );
      expect(() => parseKgToGrams('0.000', false)).toThrow(
        expect.objectContaining({
          name: 'InvalidClusteringInputError',
          reason: 'NEGATIVE_QUANTITY',
        }),
      );
    });

    it('throws INTEGER_OVERFLOW on numbers exceeding safe integer range', () => {
      // Arrange: 9007199254740992 kg * 1000 excede Number.MAX_SAFE_INTEGER
      const hugeKg = '9007199254741';

      // Act & Assert
      expect(() => parseKgToGrams(hugeKg)).toThrow(
        expect.objectContaining({
          name: 'InvalidClusteringInputError',
          reason: 'INTEGER_OVERFLOW',
        }),
      );
    });
  });

  describe('parseM3ToCm3', () => {
    it('parses valid integer and decimal cubic meters strings to exact cm3', () => {
      // Arrange & Act & Assert
      expect(parseM3ToCm3('1')).toBe(1000000);
      expect(parseM3ToCm3('0.5')).toBe(500000);
      expect(parseM3ToCm3('0.123456')).toBe(123456);
      expect(parseM3ToCm3('0.000001')).toBe(1);
      expect(parseM3ToCm3('0.000000')).toBe(0);
      expect(parseM3ToCm3('0')).toBe(0);
    });

    it('throws INVALID_QUANTITY_FORMAT when scale exceeds 6 decimal places', () => {
      // Arrange & Act & Assert
      expect(() => parseM3ToCm3('0.1234567')).toThrow(
        expect.objectContaining({
          name: 'InvalidClusteringInputError',
          reason: 'INVALID_QUANTITY_FORMAT',
        }),
      );
    });

    it('throws NEGATIVE_QUANTITY when allowZero is false and value is zero', () => {
      // Arrange & Act & Assert
      expect(() => parseM3ToCm3('0', false)).toThrow(
        expect.objectContaining({
          name: 'InvalidClusteringInputError',
          reason: 'NEGATIVE_QUANTITY',
        }),
      );
    });
  });

  describe('gramsToKg', () => {
    it('formats exact grams to canonical kilogram strings with 3 decimals', () => {
      // Arrange & Act & Assert
      expect(gramsToKg(10000)).toBe('10.000');
      expect(gramsToKg(10500)).toBe('10.500');
      expect(gramsToKg(10125)).toBe('10.125');
      expect(gramsToKg(1)).toBe('0.001');
      expect(gramsToKg(0)).toBe('0.000');
    });

    it('throws INTEGER_OVERFLOW on negative or unsafe integers', () => {
      // Arrange & Act & Assert
      expect(() => gramsToKg(-1)).toThrow(
        expect.objectContaining({
          name: 'InvalidClusteringInputError',
          reason: 'INTEGER_OVERFLOW',
        }),
      );
      expect(() => gramsToKg(Number.MAX_SAFE_INTEGER + 1)).toThrow(
        expect.objectContaining({
          name: 'InvalidClusteringInputError',
          reason: 'INTEGER_OVERFLOW',
        }),
      );
    });
  });

  describe('cm3ToM3', () => {
    it('formats exact cm3 to canonical cubic meter strings with 6 decimals', () => {
      // Arrange & Act & Assert
      expect(cm3ToM3(1000000)).toBe('1.000000');
      expect(cm3ToM3(500000)).toBe('0.500000');
      expect(cm3ToM3(123456)).toBe('0.123456');
      expect(cm3ToM3(1)).toBe('0.000001');
      expect(cm3ToM3(0)).toBe('0.000000');
    });

    it('throws INTEGER_OVERFLOW on negative or unsafe integers', () => {
      // Arrange & Act & Assert
      expect(() => cm3ToM3(-1)).toThrow(
        expect.objectContaining({
          name: 'InvalidClusteringInputError',
          reason: 'INTEGER_OVERFLOW',
        }),
      );
    });
  });
});
