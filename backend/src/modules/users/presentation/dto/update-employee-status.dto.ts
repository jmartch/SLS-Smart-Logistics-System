import { IsIn } from 'class-validator';
import { EMPLOYEE_STATUSES, type EmployeeStatus } from '../../domain/employee';

export class UpdateEmployeeStatusDto {
  @IsIn(EMPLOYEE_STATUSES)
  status!: EmployeeStatus;
}
