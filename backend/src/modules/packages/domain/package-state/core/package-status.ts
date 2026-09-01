export enum PackageStatus {
  READY_FOR_DISPATCH = 'READY_FOR_DISPATCH',
  IN_TRANSIT = 'IN_TRANSIT',
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY',
  DELIVERED = 'DELIVERED',
  DELIVERY_FAILED = 'DELIVERY_FAILED',
}

export type PackageTransitionAction =
  'startTransit' | 'startDelivery' | 'deliver' | 'failDelivery';
