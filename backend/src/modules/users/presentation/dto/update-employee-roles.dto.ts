import { ArrayMaxSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';
import { MAX_ROLES_PER_EMPLOYEE, roleIdIdentity } from './role-ids';

export class UpdateEmployeeRolesDto {
  // May be empty (an employee with no roles), subject to the last-admin rule.
  @IsArray()
  @ArrayUnique(roleIdIdentity)
  @ArrayMaxSize(MAX_ROLES_PER_EMPLOYEE)
  @IsUUID('all', { each: true })
  roleIds!: string[];
}
