import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { PrismaDeliveryUnitOfWork } from './infrastructure/persistence/prisma-delivery-unit-of-work';
import { LocalEvidenceStorageAdapter } from './infrastructure/storage/local-evidence-storage.adapter';
import { AuthDeliveryAccessAdapter } from './infrastructure/authorization/auth-delivery-access.adapter';
import { AttendRouteStopUseCase } from './application/use-cases/attend-route-stop.use-case';
import { RecordSuccessfulDeliveryUseCase } from './application/use-cases/record-successful-delivery.use-case';
import { RecordFailedDeliveryUseCase } from './application/use-cases/record-failed-delivery.use-case';
import { RescheduleDeliveryUseCase } from './application/use-cases/reschedule-delivery.use-case';
import { RequestPackageReturnUseCase } from './application/use-cases/request-package-return.use-case';
import { ReturnPackageToDepotUseCase } from './application/use-cases/return-package-to-depot.use-case';
import { ReportIncidentUseCase } from './application/use-cases/report-incident.use-case';
import { GetDeliveryManifestUseCase } from './application/use-cases/get-delivery-manifest.use-case';
import { DeliveriesController } from './presentation/deliveries.controller';

@Module({
  imports: [PrismaModule],
  controllers: [DeliveriesController],
  providers: [
    PrismaDeliveryUnitOfWork,
    {
      provide: LocalEvidenceStorageAdapter,
      useFactory: () =>
        new LocalEvidenceStorageAdapter(process.env.EVIDENCE_STORAGE_ROOT),
    },
    AuthDeliveryAccessAdapter,
    {
      provide: AttendRouteStopUseCase,
      useFactory: (
        uow: PrismaDeliveryUnitOfWork,
        access: AuthDeliveryAccessAdapter,
      ) => new AttendRouteStopUseCase(uow, access),
      inject: [PrismaDeliveryUnitOfWork, AuthDeliveryAccessAdapter],
    },
    {
      provide: RecordSuccessfulDeliveryUseCase,
      useFactory: (
        uow: PrismaDeliveryUnitOfWork,
        access: AuthDeliveryAccessAdapter,
        storage: LocalEvidenceStorageAdapter,
      ) => new RecordSuccessfulDeliveryUseCase(uow, access, storage),
      inject: [
        PrismaDeliveryUnitOfWork,
        AuthDeliveryAccessAdapter,
        LocalEvidenceStorageAdapter,
      ],
    },
    {
      provide: RecordFailedDeliveryUseCase,
      useFactory: (
        uow: PrismaDeliveryUnitOfWork,
        access: AuthDeliveryAccessAdapter,
        storage: LocalEvidenceStorageAdapter,
      ) => new RecordFailedDeliveryUseCase(uow, access, storage),
      inject: [
        PrismaDeliveryUnitOfWork,
        AuthDeliveryAccessAdapter,
        LocalEvidenceStorageAdapter,
      ],
    },
    {
      provide: RescheduleDeliveryUseCase,
      useFactory: (
        uow: PrismaDeliveryUnitOfWork,
        access: AuthDeliveryAccessAdapter,
      ) => new RescheduleDeliveryUseCase(uow, access),
      inject: [PrismaDeliveryUnitOfWork, AuthDeliveryAccessAdapter],
    },
    {
      provide: RequestPackageReturnUseCase,
      useFactory: (
        uow: PrismaDeliveryUnitOfWork,
        access: AuthDeliveryAccessAdapter,
      ) => new RequestPackageReturnUseCase(uow, access),
      inject: [PrismaDeliveryUnitOfWork, AuthDeliveryAccessAdapter],
    },
    {
      provide: ReturnPackageToDepotUseCase,
      useFactory: (
        uow: PrismaDeliveryUnitOfWork,
        access: AuthDeliveryAccessAdapter,
      ) => new ReturnPackageToDepotUseCase(uow, access),
      inject: [PrismaDeliveryUnitOfWork, AuthDeliveryAccessAdapter],
    },
    {
      provide: ReportIncidentUseCase,
      useFactory: (
        uow: PrismaDeliveryUnitOfWork,
        access: AuthDeliveryAccessAdapter,
      ) => new ReportIncidentUseCase(uow, access),
      inject: [PrismaDeliveryUnitOfWork, AuthDeliveryAccessAdapter],
    },
    {
      provide: GetDeliveryManifestUseCase,
      useFactory: (
        uow: PrismaDeliveryUnitOfWork,
        access: AuthDeliveryAccessAdapter,
      ) => new GetDeliveryManifestUseCase(uow, access),
      inject: [PrismaDeliveryUnitOfWork, AuthDeliveryAccessAdapter],
    },
  ],
  exports: [
    PrismaDeliveryUnitOfWork,
    LocalEvidenceStorageAdapter,
    AuthDeliveryAccessAdapter,
    AttendRouteStopUseCase,
    RecordSuccessfulDeliveryUseCase,
    RecordFailedDeliveryUseCase,
    RescheduleDeliveryUseCase,
    RequestPackageReturnUseCase,
    ReturnPackageToDepotUseCase,
    ReportIncidentUseCase,
    GetDeliveryManifestUseCase,
  ],
})
export class DeliveriesModule {}
