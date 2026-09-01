import { InvalidPackageTransitionError } from '../core/invalid-package-transition.error';
import { Package } from '../core/package';
import { PackageStatus } from '../core/package-status';

describe('Package State pattern', () => {
  it('starts ready for dispatch', () => {
    const packageContext = new Package('package-1');

    expect(packageContext.status).toBe(PackageStatus.READY_FOR_DISPATCH);
    expect(packageContext.history).toEqual([PackageStatus.READY_FOR_DISPATCH]);
  });

  it('executes the successful delivery flow', () => {
    const packageContext = new Package('package-1');

    packageContext.startTransit();
    packageContext.startDelivery();
    packageContext.deliver();

    expect(packageContext.status).toBe(PackageStatus.DELIVERED);
    expect(packageContext.history).toEqual([
      PackageStatus.READY_FOR_DISPATCH,
      PackageStatus.IN_TRANSIT,
      PackageStatus.OUT_FOR_DELIVERY,
      PackageStatus.DELIVERED,
    ]);
  });

  it('executes the failed delivery flow', () => {
    const packageContext = new Package('package-1');

    packageContext.startTransit();
    packageContext.startDelivery();
    packageContext.failDelivery();

    expect(packageContext.status).toBe(PackageStatus.DELIVERY_FAILED);
    expect(packageContext.history).toEqual([
      PackageStatus.READY_FOR_DISPATCH,
      PackageStatus.IN_TRANSIT,
      PackageStatus.OUT_FOR_DELIVERY,
      PackageStatus.DELIVERY_FAILED,
    ]);
  });

  it('rejects delivery before the package is out for delivery', () => {
    const packageContext = new Package('package-1');

    expect(() => packageContext.deliver()).toThrow(
      InvalidPackageTransitionError,
    );

    try {
      packageContext.deliver();
    } catch (error) {
      expect(error).toMatchObject({
        code: 'INVALID_PACKAGE_TRANSITION',
        currentStatus: PackageStatus.READY_FOR_DISPATCH,
        attemptedAction: 'deliver',
      });
    }

    expect(packageContext.status).toBe(PackageStatus.READY_FOR_DISPATCH);
  });

  it('rejects transitions after delivery', () => {
    const packageContext = new Package('package-1');

    packageContext.startTransit();
    packageContext.startDelivery();
    packageContext.deliver();

    expect(() => packageContext.startTransit()).toThrow(
      InvalidPackageTransitionError,
    );
    expect(packageContext.status).toBe(PackageStatus.DELIVERED);
  });
});
