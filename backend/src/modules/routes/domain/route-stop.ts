import { RouteStopState } from './route-stop-state';

export interface RouteStopProps {
  readonly id: string;
  readonly tenantId: string;
  readonly routeId: string;
  readonly stopNumber: number;
  readonly latitude: number;
  readonly longitude: number;
  readonly state: RouteStopState;
  readonly packageId?: string | null;
  readonly trackingCode?: string | null;
  readonly address?: string | null;
}

export class RouteStop {
  constructor(private readonly props: RouteStopProps) {
    Object.freeze(this.props);
    Object.freeze(this);
  }

  get id(): string {
    return this.props.id;
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get routeId(): string {
    return this.props.routeId;
  }

  get stopNumber(): number {
    return this.props.stopNumber;
  }

  get latitude(): number {
    return this.props.latitude;
  }

  get longitude(): number {
    return this.props.longitude;
  }

  get state(): RouteStopState {
    return this.props.state;
  }

  get packageId(): string | null | undefined {
    return this.props.packageId;
  }

  get trackingCode(): string | null | undefined {
    return this.props.trackingCode;
  }

  get address(): string | null | undefined {
    return this.props.address;
  }
}
