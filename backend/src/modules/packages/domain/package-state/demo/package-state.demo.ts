import { InvalidPackageTransitionError } from '../core/invalid-package-transition.error';
import { Package } from '../core/package';

function showStatus(packageContext: Package): void {
  console.log(`[${packageContext.id}] -> ${packageContext.status}`);
}

console.log('\n=== Successful delivery ===');

const deliveredPackage = new Package('PKG-001');

showStatus(deliveredPackage);
deliveredPackage.startTransit();
showStatus(deliveredPackage);
deliveredPackage.startDelivery();
showStatus(deliveredPackage);
deliveredPackage.deliver();
showStatus(deliveredPackage);
console.log('History:', deliveredPackage.history);

console.log('\n=== Failed delivery ===');

const failedPackage = new Package('PKG-002');

showStatus(failedPackage);
failedPackage.startTransit();
showStatus(failedPackage);
failedPackage.startDelivery();
showStatus(failedPackage);
failedPackage.failDelivery();
showStatus(failedPackage);
console.log('History:', failedPackage.history);

console.log('\n=== Invalid transition ===');

const invalidPackage = new Package('PKG-003');

try {
  invalidPackage.deliver();
} catch (error) {
  if (error instanceof InvalidPackageTransitionError) {
    console.log({
      code: error.code,
      currentStatus: error.currentStatus,
      attemptedAction: error.attemptedAction,
      message: error.message,
    });
  } else {
    throw error;
  }
}
