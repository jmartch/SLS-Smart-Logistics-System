import {
    PackageState as PrismaPackageState,
    RouteState as PrismaRouteState,
} from '../../../../generated/prisma/client';
import { PackageEventType } from '../domain/events/package-state-changed.event';
import { PackageStatus } from '../domain/package-state.types';

describe('Package and route state compatibility', () => {
    it('keeps Prisma and domain package states synchronized', () => {
        expect(Object.values(PrismaPackageState)).toEqual(
            Object.values(PackageStatus),
        );

        expect(Object.values(PrismaPackageState)).not.toContain('ASSIGNED');
        expect(Object.values(PrismaPackageState)).toContain(
            'ASSIGNED_TO_ROUTE',
        );
    });

    it('defines one unique event type for every package state', () => {
        expect(Object.keys(PackageEventType)).toEqual(
            Object.values(PackageStatus),
        );

        const eventTypes = Object.values(PackageEventType);

        expect(new Set(eventTypes).size).toBe(eventTypes.length);
    });

    it('keeps the required route lifecycle in Prisma', () => {
        expect(Object.values(PrismaRouteState)).toEqual([
            'DRAFT',
            'PLANNING',
            'PLANNED',
            'READY',
            'IN_PROGRESS',
            'COMPLETED',
            'PLANNING_FAILED',
            'INTERRUPTED',
            'CANCELLED',
        ]);
    });
});
