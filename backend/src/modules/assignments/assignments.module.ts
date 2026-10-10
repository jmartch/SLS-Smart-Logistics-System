import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AssignPackageToRouteService } from './application/assign-package-to-route.service';
import { AssignmentReservationRepository } from './domain/reservation.repository';
import { PrismaAssignmentReservation } from './infrastructure/prisma-assignment-reservation';

@Module({
    imports: [PrismaModule],
    providers: [
        PrismaAssignmentReservation,
        {
            provide: AssignmentReservationRepository,
            useExisting: PrismaAssignmentReservation,
        },
        {
            provide: AssignPackageToRouteService,
            useFactory: (reservation: AssignmentReservationRepository) =>
                new AssignPackageToRouteService(reservation),
            inject: [AssignmentReservationRepository],
        },
    ],
    exports: [AssignPackageToRouteService],
})
export class AssignmentsModule {}
