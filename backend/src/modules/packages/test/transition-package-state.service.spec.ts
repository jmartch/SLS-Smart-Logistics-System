import { TransitionPackageStateService } from '../application/transition-package-state.service';
import { InvalidPackageTransitionError } from '../domain/invalid-package-transition.error';
import {
    PackageLifecycleRepository,
    type LockedPackageIdentity,
    type PackageLifecycleOperation,
    type PackageLifecycleResult,
} from '../domain/package-lifecycle.repository';
import { PackageAggregate } from '../domain/package.aggregate';

const tenantId = '10000000-0000-4000-8000-000000000001';
const packageId = '20000000-0000-4000-8000-000000000001';
const changedByUserId = '30000000-0000-4000-8000-000000000001';
const correlationId = '40000000-0000-4000-8000-000000000001';

class InMemoryPackageLifecycleRepository extends PackageLifecycleRepository {
    packageAggregate: PackageAggregate | null = null;
    lastIdentity?: LockedPackageIdentity;
    persistedEvents = 0;

    async transitionAtomically(
        identity: LockedPackageIdentity,
        operation: PackageLifecycleOperation,
    ): Promise<PackageLifecycleResult> {
        this.lastIdentity = identity;

        if (!this.packageAggregate) {
            return { kind: 'NOT_FOUND' };
        }

        operation(this.packageAggregate);

        const [event] = this.packageAggregate.pullDomainEvents();

        if (!event) {
            throw new Error('Expected one package transition event');
        }

        this.persistedEvents += 1;

        return {
            kind: 'TRANSITIONED',
            event,
        };
    }
}

describe('TransitionPackageStateService', () => {
    let repository: InMemoryPackageLifecycleRepository;
    let service: TransitionPackageStateService;

    beforeEach(() => {
        repository = new InMemoryPackageLifecycleRepository();
        service = new TransitionPackageStateService(repository);
    });

    it('transitions a package using trusted tenant context and metadata', async () => {
        repository.packageAggregate = PackageAggregate.reconstitute({
            id: packageId,
            tenantId,
            state: 'CLASSIFIED',
        });

        const result = await service.execute({
            tenantId,
            packageId,
            targetState: 'ASSIGNED_TO_ROUTE',
            changedByUserId,
            reasonCode: 'ROUTE_ASSIGNED',
            correlationId,
        });

        expect(repository.lastIdentity).toEqual({
            tenantId,
            packageId,
        });
        expect(repository.packageAggregate.state).toBe('ASSIGNED_TO_ROUTE');
        expect(repository.persistedEvents).toBe(1);
        expect(result).toEqual({
            kind: 'TRANSITIONED',
            event: expect.objectContaining({
                tenantId,
                aggregateId: packageId,
                eventType: 'PackageAssigned',
                fromState: 'CLASSIFIED',
                toState: 'ASSIGNED_TO_ROUTE',
                changedByUserId,
                reasonCode: 'ROUTE_ASSIGNED',
                correlationId,
                version: 1,
            }),
        });
    });

    it('returns NOT_FOUND without running a transition', async () => {
        const result = await service.execute({
            tenantId,
            packageId,
            targetState: 'CLASSIFIED',
        });

        expect(result).toEqual({ kind: 'NOT_FOUND' });
        expect(repository.persistedEvents).toBe(0);
    });

    it('does not persist when the transition is invalid', async () => {
        repository.packageAggregate = PackageAggregate.reconstitute({
            id: packageId,
            tenantId,
            state: 'REGISTERED',
        });

        await expect(
            service.execute({
                tenantId,
                packageId,
                targetState: 'DELIVERED',
            }),
        ).rejects.toBeInstanceOf(InvalidPackageTransitionError);

        expect(repository.packageAggregate.state).toBe('REGISTERED');
        expect(repository.persistedEvents).toBe(0);
    });
});