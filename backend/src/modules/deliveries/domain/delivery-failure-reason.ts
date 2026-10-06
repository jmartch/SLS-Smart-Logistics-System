export const DeliveryFailureReason = {
  RECIPIENT_ABSENT: 'RECIPIENT_ABSENT',
  ADDRESS_NOT_FOUND: 'ADDRESS_NOT_FOUND',
  RECIPIENT_REFUSED: 'RECIPIENT_REFUSED',
  ACCESS_RESTRICTED: 'ACCESS_RESTRICTED',
  DAMAGED_PACKAGE: 'DAMAGED_PACKAGE',
  OTHER: 'OTHER',
} as const;

export type DeliveryFailureReason =
  (typeof DeliveryFailureReason)[keyof typeof DeliveryFailureReason];

export function isValidDeliveryFailureReason(
  reason: string,
): reason is DeliveryFailureReason {
  return Object.values(DeliveryFailureReason).includes(
    reason as DeliveryFailureReason,
  );
}
