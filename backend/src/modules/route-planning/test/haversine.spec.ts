import {
  calculateHaversineDistance,
  Coordinates,
  EARTH_RADIUS_METERS,
  haversineMetersToKilometers,
} from '../domain';

describe('Haversine Algorithm', () => {
  describe('calculateHaversineDistance', () => {
    it('returns zero for identical coordinates', () => {
      // Arrange
      const point = Coordinates.create(10.96854, -74.78132);

      // Act
      const distance = calculateHaversineDistance(point, point);

      // Assert
      expect(distance).toBe(0);
    });

    it('calculates the known distance between Barranquilla and Cartagena (~100 km)', () => {
      // Arrange:
      // Barranquilla: 10.96854, -74.78132
      // Cartagena: 10.39105, -75.47943
      const barranquilla = Coordinates.create(10.96854, -74.78132);
      const cartagena = Coordinates.create(10.39105, -75.47943);

      // Act
      const distanceMeters = calculateHaversineDistance(
        barranquilla,
        cartagena,
      );
      const distanceKm = haversineMetersToKilometers(distanceMeters);

      // Assert: Distancia geodésica real conocida ~99.7 km
      expect(distanceKm).toBeGreaterThan(95);
      expect(distanceKm).toBeLessThan(105);
      expect(Math.round(distanceKm)).toBe(100);
    });

    it('is symmetric: distance(A, B) equals distance(B, A)', () => {
      // Arrange
      const pointA = Coordinates.create(10.96854, -74.78132);
      const pointB = Coordinates.create(10.39105, -75.47943);

      // Act & Assert
      expect(calculateHaversineDistance(pointA, pointB)).toBe(
        calculateHaversineDistance(pointB, pointA),
      );
    });

    it('calculates distance across the equator (1 degree of longitude ~ 111.195 km)', () => {
      // Arrange: 1 grado en el ecuador es (2 * PI * R) / 360 ~ 111,194.9 m
      const a = Coordinates.create(0, 0);
      const b = Coordinates.create(0, 1);
      const expectedMeters = (2 * Math.PI * EARTH_RADIUS_METERS) / 360;

      // Act
      const distanceMeters = calculateHaversineDistance(a, b);

      // Assert
      expect(Math.abs(distanceMeters - expectedMeters)).toBeLessThan(1);
    });

    it('calculates distance between North and South Poles (~20,015 km)', () => {
      // Arrange: Distancia entre polos es PI * R
      const northPole = Coordinates.create(90, 0);
      const southPole = Coordinates.create(-90, 0);
      const expectedMeters = Math.PI * EARTH_RADIUS_METERS;

      // Act
      const distanceMeters = calculateHaversineDistance(northPole, southPole);

      // Assert
      expect(Math.abs(distanceMeters - expectedMeters)).toBeLessThan(1);
    });

    it('handles antimeridian crossing without numerical instability', () => {
      // Arrange: de 179.9 a -179.9 son 0.2 grados de longitud
      const east = Coordinates.create(0, 179.9);
      const west = Coordinates.create(0, -179.9);
      const expectedMeters = ((2 * Math.PI * EARTH_RADIUS_METERS) / 360) * 0.2;

      // Act
      const distanceMeters = calculateHaversineDistance(east, west);

      // Assert
      expect(Math.abs(distanceMeters - expectedMeters)).toBeLessThan(1);
    });

    it('is callable via Coordinates.prototype.distanceTo', () => {
      // Arrange
      const a = Coordinates.create(10.96854, -74.78132);
      const b = Coordinates.create(10.39105, -75.47943);

      // Act & Assert
      expect(a.distanceTo(b)).toBe(calculateHaversineDistance(a, b));
    });
  });

  describe('haversineMetersToKilometers', () => {
    it('converts meters to kilometers correctly', () => {
      // Arrange & Act & Assert
      expect(haversineMetersToKilometers(1000)).toBe(1);
      expect(haversineMetersToKilometers(5500)).toBe(5.5);
      expect(haversineMetersToKilometers(0)).toBe(0);
    });
  });
});
