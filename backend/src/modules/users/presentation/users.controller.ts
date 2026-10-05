import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../auth/presentation/auth.guard';
import { CurrentTenant } from '../../auth/presentation/current-tenant.decorator';
import { PermissionsGuard } from '../../auth/presentation/permissions.guard';
import { RequirePermission } from '../../auth/presentation/require-permission.decorator';
import type { TenantContext } from '../../../shared/application/tenant-context';
import { CreateEmployeeService } from '../application/create-employee.service';
import { ListEmployeesService } from '../application/list-employees.service';
import { UpdateEmployeeStatusService } from '../application/update-employee-status.service';
import { UpdateEmployeeRolesService } from '../application/update-employee-roles.service';
import { MANAGE_EMPLOYEES, type EmployeeRecord } from '../domain/employee';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeStatusDto } from './dto/update-employee-status.dto';
import { UpdateEmployeeRolesDto } from './dto/update-employee-roles.dto';

const employeeIdPipe = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Los datos enviados no son validos.',
        fields: [{ field: 'id', reason: 'id must be a UUID' }],
      },
    }),
});

// Same code and message whether the resource is missing or belongs to another
// tenant, so the response never confirms it exists elsewhere.
function roleNotFound(): NotFoundException {
  return new NotFoundException({
    error: {
      code: 'RESOURCE_NOT_FOUND',
      message: 'Uno de los roles no existe.',
      fields: null,
    },
  });
}

function employeeNotFound(): NotFoundException {
  return new NotFoundException({
    error: {
      code: 'RESOURCE_NOT_FOUND',
      message: 'El empleado no existe.',
      fields: null,
    },
  });
}

function lastAdmin(): ConflictException {
  return new ConflictException({
    error: {
      code: 'LAST_ADMIN_CANNOT_BE_REMOVED',
      message:
        'No se puede dejar la empresa sin ningun usuario activo con permiso para administrar empleados.',
      fields: null,
    },
  });
}

// Explicit field list: nothing beyond these ever reaches the client.
function toResponse(employee: EmployeeRecord) {
  return {
    id: employee.id,
    email: employee.email,
    status: employee.status,
    roleIds: [...employee.roleIds],
  };
}

// Class-level requirement: every handler, including any added later, needs
// MANAGE_EMPLOYEES. The guards run before the ValidationPipe, so callers
// without it get 403 before any 400.
@Controller('api/users')
@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermission(MANAGE_EMPLOYEES)
export class UsersController {
  constructor(
    private readonly createEmployee: CreateEmployeeService,
    private readonly listEmployees: ListEmployeesService,
    private readonly updateEmployeeStatus: UpdateEmployeeStatusService,
    private readonly updateEmployeeRoles: UpdateEmployeeRolesService,
  ) {}

  @Post()
  async create(
    @Body() dto: CreateEmployeeDto,
    @CurrentTenant() tenant: TenantContext,
  ) {
    const result = await this.createEmployee.create(tenant, {
      email: dto.email,
      password: dto.password,
      roleIds: dto.roleIds,
    });

    if (result.kind === 'ROLE_NOT_IN_TENANT') {
      throw roleNotFound();
    }

    if (result.kind === 'EMAIL_ALREADY_EXISTS') {
      throw new ConflictException({
        error: {
          code: 'EMAIL_ALREADY_EXISTS',
          message: 'Ya existe un empleado con ese correo en la empresa.',
          fields: null,
        },
      });
    }

    return toResponse(result.employee);
  }

  // Not paginated yet: tenants have tens of employees in the MVP.
  @Get()
  async list(@CurrentTenant() tenant: TenantContext) {
    const employees = await this.listEmployees.list(tenant);
    return employees.map(toResponse);
  }

  @Patch(':id/status')
  async patchStatus(
    @Param('id', employeeIdPipe) id: string,
    @Body() dto: UpdateEmployeeStatusDto,
    @CurrentTenant() tenant: TenantContext,
  ) {
    const result = await this.updateEmployeeStatus.updateStatus(
      tenant,
      id,
      dto.status,
    );

    if (result.kind === 'NOT_FOUND') {
      throw employeeNotFound();
    }

    if (result.kind === 'LAST_ADMIN') {
      throw lastAdmin();
    }

    return { ok: true };
  }

  @Patch(':id/roles')
  async patchRoles(
    @Param('id', employeeIdPipe) id: string,
    @Body() dto: UpdateEmployeeRolesDto,
    @CurrentTenant() tenant: TenantContext,
  ) {
    const result = await this.updateEmployeeRoles.updateRoles(
      tenant,
      id,
      dto.roleIds,
    );

    if (result.kind === 'ROLE_NOT_IN_TENANT') {
      throw roleNotFound();
    }

    if (result.kind === 'NOT_FOUND') {
      throw employeeNotFound();
    }

    if (result.kind === 'LAST_ADMIN') {
      throw lastAdmin();
    }

    return { ok: true };
  }
}
