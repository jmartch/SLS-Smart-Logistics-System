import { Coordinates, InvalidCoordinatesError } from '../domain';

describe('Coordinates', () => {
  describe('create', () => {
    it('creates an immutable instance for valid coordinates', () => {
      // Arrange
      const latitude = 10.96854;
      const longitude = -74.78132;

      // Act
      const coordinates = Coordinates.create(latitude, longitude);

      // Assert
      expect(coordinates.latitude).toBe(latitude);
      expect(coordinates.longitude).toBe(longitude);
      expect(Object.isFrozen(coordinates)).toBe(true);
    });

    it('normalizes negative zero to zero', () => {
      // Arrange & Act
      const coordinates = Coordinates.create(-0, -0);

      // Assert
      expect(Object.is(coordinates.latitude, 0)).toBe(true);
      expect(Object.is(coordinates.longitude, 0)).toBe(true);
    });

    it('accepts boundary values for latitude (-90 and 90) and longitude (-180 and 180)', () => {
      // Arrange & Act
      const southWest = Coordinates.create(-90, -180);
      const northEast = Coordinates.create(90, 180);

      // Assert
      expect(southWest.latitude).toBe(-90);
      expect(southWest.longitude).toBe(-180);
      expect(northEast.latitude).toBe(90);
      expect(northEast.longitude).toBe(180);
    });

    it('throws LATITUDE_OUT_OF_RANGE when latitude exceeds boundary', () => {
      // Arrange & Act & Assert
      expect(() => Coordinates.create(90.0001, 0)).toThrow(
        expect.objectContaining({
          name: 'InvalidCoordinatesError',
          reason: 'LATITUDE_OUT_OF_RANGE',
        }),
      );
      expect(() => Coordinates.create(-90.0001, 0)).toThrow(
        expect.objectContaining({
          reason: 'LATITUDE_OUT_OF_RANGE',
        }),
      );
    });

    it('throws LONGITUDE_OUT_OF_RANGE when longitude exceeds boundary', () => {
      // Arrange & Act & Assert
      expect(() => Coordinates.create(0, 180.0001)).toThrow(
        expect.objectContaining({
          name: 'InvalidCoordinatesError',
          reason: 'LONGITUDE_OUT_OF_RANGE',
        }),
      );
      expect(() => Coordinates.create(0, -180.0001)).toThrow(
        expect.objectContaining({
          reason: 'LONGITUDE_OUT_OF_RANGE',
        }),
      );
    });

    it('throws NON_FINITE_COORDINATE when given NaN or Infinity', () => {
      // Arrange & Act & Assert
      expect(() => Coordinates.create(NaN, 0)).toThrow(
        expect.objectContaining({
          reason: 'NON_FINITE_COORDINATE',
        }),
      );
      expect(() => Coordinates.create(0, Infinity)).toThrow(
        expect.objectContaining({
          reason: 'NON_FINITE_COORDINATE',
        }),
      );
    });

    it('throws INVALID_FORMAT when given non-numeric types at runtime', () => {
      // Arrange & Act & Assert
      // @ts-expect-error runtime type check
      expect(() => Coordinates.create('10.0', 0)).toThrow(
        expect.objectContaining({
          reason: 'INVALID_FORMAT',
        }),
      );
    });
  });

  describe('parse', () => {
    it('parses valid numeric strings and numbers', () => {
      // Arrange & Act
      const fromStrings = Coordinates.parse('10.96854', '-74.78132');
      const fromNumbers = Coordinates.parse(10.96854, -74.78132);

      // Assert
      expect(fromStrings.latitude).toBe(10.96854);
      expect(fromStrings.longitude).toBe(-74.78132);
      expect(fromNumbers.latitude).toBe(10.96854);
      expect(fromNumbers.longitude).toBe(-74.78132);
    });

    it('trims outer whitespace from input strings', () => {
      // Arrange & Act
      const coordinates = Coordinates.parse('  10.96854  ', ' -74.78132\t');

      // Assert
      expect(coordinates.latitude).toBe(10.96854);
      expect(coordinates.longitude).toBe(-74.78132);
    });

    it('throws INVALID_FORMAT on invalid string formats or empty values', () => {
      // Arrange & Act & Assert
      expect(() => Coordinates.parse('', '-74.78')).toThrow(
        expect.objectContaining({ reason: 'INVALID_FORMAT' }),
      );
      expect(() => Coordinates.parse('abc', '-74.78')).toThrow(
        expect.objectContaining({ reason: 'INVALID_FORMAT' }),
      );
      expect(() => Coordinates.parse(null, '-74.78')).toThrow(
        expect.objectContaining({ reason: 'INVALID_FORMAT' }),
      );
      expect(() => Coordinates.parse(undefined, '-74.78')).toThrow(
        expect.objectContaining({ reason: 'INVALID_FORMAT' }),
      );
    });
  });

  describe('equals', () => {
    it('returns true for identical coordinates and false for different ones', () => {
      // Arrange
      const a = Coordinates.create(10.96854, -74.78132);
      const b = Coordinates.create(10.96854, -74.78132);
      const c = Coordinates.create(10.96855, -74.78132);

      // Act & Assert
      expect(a.equals(b)).toBe(true);
      expect(a.equals(c)).toBe(false);
    });

    it('honors tolerance when provided', () => {
      // Arrange
      const a = Coordinates.create(10.96854, -74.78132);
      const b = Coordinates.create(10.96858, -74.78135);

      // Act & Assert
      expect(a.equals(b, 0.0001)).toBe(true);
      expect(a.equals(b, 0.00001)).toBe(false);
    });

    it('throws RangeError if tolerance is negative or non-finite', () => {
      // Arrange
      const a = Coordinates.create(0, 0);
      const b = Coordinates.create(0, 0);

      // Act & Assert
      expect(() => a.equals(b, -1)).toThrow(RangeError);
      expect(() => a.equals(b, NaN)).toThrow(RangeError);
    });
  });

  describe('toString', () => {
    it('formats coordinates as latitude, longitude', () => {
      // Arrange
      const coordinates = Coordinates.create(10.96854, -74.78132);

      // Act & Assert
      expect(coordinates.toString()).toBe('10.96854, -74.78132');
    });
  });
});
