import type { AssignmentValidationContext } from '../core/assignment-validation.types';

export function createContext(): AssignmentValidationContext {
  return {
    tenantId: 'tenant-a',
    hasActiveAssignment: false,
    package: {
      id: 'package-1',
      tenantId: 'tenant-a',
      recipientAddress: 'Calle 84 # 50-20',
      latitude: 11.0041,
      longitude: -74.807,
      zoneId: 'zone-north',
      weightKg: 10,
      volumeM3: 0.2,
    },
    vehicle: {
      id: 'vehicle-1',
      tenantId: 'tenant-a',
      available: true,
      remainingWeightKg: 100,
      remainingVolumeM3: 5,
      supportedZoneIds: ['zone-north'],
    },
    courier: {
      id: 'courier-1',
      tenantId: 'tenant-a',
      available: true,
    },
  };
}
