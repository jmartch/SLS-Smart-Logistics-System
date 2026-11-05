import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from '@nestjs/common';

export function handlePlanningDomainError(error: unknown): never {
    if (error instanceof Error) {
        const msg = error.message;

        if (msg === 'REQUEST_ID_CONFLICT') {
            throw new ConflictException({
                code: 'REQUEST_ID_CONFLICT',
                message: 'La solicitud de planificación ya existe con parámetros diferentes o está en proceso.',
            });
        }

        if (msg === 'PLANNING_RESULT_UNAVAILABLE' || msg.includes('PLANNING_RESULT_UNAVAILABLE')) {
            throw new ConflictException({
                code: 'PLANNING_RESULT_UNAVAILABLE',
                message: 'El resultado histórico de la solicitud de planificación no está disponible.',
            });
        }

        if (msg.includes('TENANT_MISMATCH') || msg.includes('Security validation failed')) {
            throw new ForbiddenException({
                code: 'TENANT_MISMATCH',
                message: 'Uno o más recursos no pertenecen a la empresa activa.',
            });
        }

        if (msg.includes('ROUTE_NOT_EDITABLE')) {
            throw new ConflictException({
                code: 'ROUTE_NOT_EDITABLE',
                message:
                    'La ruta seleccionada ya no es editable (solo las rutas en estado PLANNED pueden replanificarse).',
            });
        }

        if (msg.includes('already has an active assignment')) {
            throw new ConflictException({
                code: 'PACKAGE_ALREADY_ASSIGNED',
                message: msg,
            });
        }

        if (msg.includes('not found in tenant snapshot')) {
            throw new NotFoundException({
                code: 'RESOURCE_NOT_FOUND',
                message: msg,
            });
        }

        if (
            msg.includes('requestId is required') ||
            msg.includes('routeId is required') ||
            msg.includes('packageIds must') ||
            msg.includes('Duplicate packageId') ||
            msg.includes('operating window') ||
            msg.includes('Invalid zoneId')
        ) {
            throw new BadRequestException({
                code: 'VALIDATION_ERROR',
                message: msg,
            });
        }
    }

    throw error;
}