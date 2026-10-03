export type InvalidCoordinatesReason =
  | 'INVALID_FORMAT'
  | 'LATITUDE_OUT_OF_RANGE'
  | 'LONGITUDE_OUT_OF_RANGE'
  | 'NON_FINITE_COORDINATE';

const ERROR_MESSAGES: Readonly<Record<InvalidCoordinatesReason, string>> = {
  INVALID_FORMAT: 'Coordinates must be numbers or numeric decimal strings.',
  LATITUDE_OUT_OF_RANGE: 'Latitude must be between -90 and 90 degrees.',
  LONGITUDE_OUT_OF_RANGE: 'Longitude must be between -180 and 180 degrees.',
  NON_FINITE_COORDINATE: 'Coordinates must be finite numbers.',
};

export class InvalidCoordinatesError extends Error {
  public readonly reason: InvalidCoordinatesReason;

  public constructor(
    reason: InvalidCoordinatesReason,
    message: string = ERROR_MESSAGES[reason],
  ) {
    super(message);

    this.name = 'InvalidCoordinatesError';
    this.reason = reason;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}
