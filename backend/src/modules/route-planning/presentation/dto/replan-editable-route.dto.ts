import { BadRequestException } from '@nestjs/common';
import type { ReplanEditableRouteCommand } from '../../application/ports/replan-editable-route.contract';

const UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateAndBuildReplanEditableRouteCommand(
    routeId: string,
    body: unknown,
): ReplanEditableRouteCommand {
    if (!routeId || !UUID_REGEX.test(routeId.trim())) {
        throw new BadRequestException({
            code: 'VALIDATION_ERROR',
            message: 'routeId debe ser un UUID válido.',
        });
    }

    const raw =
        body && typeof body === 'object'
            ? (body as Record<string, unknown>)
            : {};

    let packageIds: string[] = [];
    if (raw.packageIds !== undefined) {
        if (!Array.isArray(raw.packageIds)) {
            throw new BadRequestException({
                code: 'VALIDATION_ERROR',
                message: 'packageIds debe ser un arreglo de UUIDs.',
            });
        }
        packageIds = raw.packageIds.map((id) => {
            if (typeof id !== 'string' || !UUID_REGEX.test(id.trim())) {
                throw new BadRequestException({
                    code: 'VALIDATION_ERROR',
                    message:
                        'Cada elemento de packageIds debe ser un UUID válido.',
                });
            }
            return id.trim();
        });
    }

    let ordering: 'nearest-neighbor' | 'nearest-neighbor-two-opt' =
        'nearest-neighbor';
    if (raw.ordering !== undefined) {
        if (
            raw.ordering !== 'nearest-neighbor' &&
            raw.ordering !== 'nearest-neighbor-two-opt'
        ) {
            throw new BadRequestException({
                code: 'VALIDATION_ERROR',
                message:
                    'ordering debe ser nearest-neighbor o nearest-neighbor-two-opt.',
            });
        }
        ordering = raw.ordering;
    }

    return {
        routeId: routeId.trim(),
        packageIds,
        ordering,
    };
}
