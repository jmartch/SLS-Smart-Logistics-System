import {
	PackageEventType,
	type PackageStateChangedEvent,
	type PackageTransitionMetadata,
} from './events/package-state-changed.event';
import { InvalidPackageTransitionError } from './invalid-package-transition.error';
import type { PackageState } from './package-state';
import { createPackageState } from './package-state.factory';
import type { PackageStateName } from './package-state.types';

export interface ReconstitutePackageProperties {
	readonly id: string;
	readonly tenantId: string;
	readonly state: PackageStateName;
}

export class PackageAggregate {
	private currentState: PackageState;
	private readonly domainEvents: PackageStateChangedEvent[] = [];

	private constructor(
		readonly id: string,
		readonly tenantId: string,
		initialState: PackageState,
	) {
		this.currentState = initialState;
	}

	static reconstitute(
		properties: ReconstitutePackageProperties,
	): PackageAggregate {
		return new PackageAggregate(
			properties.id,
			properties.tenantId,
			createPackageState(properties.state),
		);
	}

	get state(): PackageStateName {
		return this.currentState.status;
	}

	transitionTo(
		targetState: PackageStateName,
		metadata: PackageTransitionMetadata = {},
	): void {
		const fromState = this.currentState.status;

		if (!this.currentState.canTransitionTo(targetState)) {
			throw new InvalidPackageTransitionError(fromState, targetState);
		}

		this.currentState = createPackageState(targetState);
		this.domainEvents.push({
			aggregateId: this.id,
			tenantId: this.tenantId,
			eventType: PackageEventType[targetState],
			version: 1,
			occurredAt: new Date(),
			fromState,
			toState: targetState,
			changedByUserId: metadata.changedByUserId,
			reasonCode: metadata.reasonCode,
			correlationId: metadata.correlationId,
		});
	}

	pullDomainEvents(): readonly PackageStateChangedEvent[] {
		const pendingEvents = [...this.domainEvents];
		this.domainEvents.length = 0;
		return pendingEvents;
	}
}
