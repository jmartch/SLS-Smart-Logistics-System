import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { UsersController } from './presentation/users.controller';
import { CreateEmployeeService } from './application/create-employee.service';
import { ListEmployeesService } from './application/list-employees.service';
import { UpdateEmployeeStatusService } from './application/update-employee-status.service';
import { UpdateEmployeeRolesService } from './application/update-employee-roles.service';
import { UserManagementRepository } from './domain/user-management.repository';
import { PrismaUserManagementRepository } from './infrastructure/prisma-user-management.repository';

@Module({
  // AuthModule supplies AuthGuard, PermissionsGuard and SessionRepository.
  imports: [PrismaModule, AuthModule],
  controllers: [UsersController],
  providers: [
    {
      provide: UserManagementRepository,
      useClass: PrismaUserManagementRepository,
    },
    CreateEmployeeService,
    ListEmployeesService,
    UpdateEmployeeStatusService,
    UpdateEmployeeRolesService,
  ],
})
export class UsersModule {}
