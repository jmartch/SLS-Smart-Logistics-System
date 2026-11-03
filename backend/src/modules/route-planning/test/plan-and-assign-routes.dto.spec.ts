import { BadRequestException } from '@nestjs/common';
import { validateAndBuildCommand } from '../presentation/dto/plan-and-assign-routes.dto';

function createBody() {
  return {
    zoneId: 'zone-1',
    depotId: 'depot-1',
    packageIds: ['package-1'],
    window: { startAt: '2026-10-13T13:00:00Z', endAt: '2026-10-13T18:00:00Z' },
  };
}

describe('validateAndBuildCommand', () => {
  describe('resource selection', () => {
    it('defaults to automatic selection when resource IDs are omitted', () => {
      const body = createBody();

      const command = validateAndBuildCommand(body);

      expect(command).toMatchObject({
        resourceSelection: 'AUTOMATIC',
        vehicleIds: [],
        courierIds: [],
      });
    });

    it('preserves explicit resource lists for existing manual clients', () => {
      const body = {
        ...createBody(),
        vehicleIds: ['vehicle-1'],
        courierIds: ['courier-1'],
      };

      const command = validateAndBuildCommand(body);

      expect(command).toMatchObject({
        resourceSelection: 'MANUAL',
        vehicleIds: ['vehicle-1'],
        courierIds: ['courier-1'],
      });
    });

    it('ignores supplied resource lists when automatic selection is explicit', () => {
      const body = {
        ...createBody(),
        resourceSelection: 'AUTOMATIC',
        vehicleIds: ['vehicle-1'],
        courierIds: ['courier-1'],
      };

      const command = validateAndBuildCommand(body);

      expect(command).toMatchObject({
        resourceSelection: 'AUTOMATIC',
        vehicleIds: [],
        courierIds: [],
      });
    });

    it('rejects an unsupported selection mode', () => {
      const body = { ...createBody(), resourceSelection: 'UNKNOWN' };

      const validate = () => validateAndBuildCommand(body);

      expect(validate).toThrow(BadRequestException);
    });
  });
});
