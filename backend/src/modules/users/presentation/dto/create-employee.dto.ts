import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { MAX_ROLES_PER_EMPLOYEE, roleIdIdentity } from './role-ids';

export class CreateEmployeeDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  // Bounded so an oversized body cannot be fed to argon2.
  @IsString()
  @MinLength(8)
  @MaxLength(1024)
  password!: string;

  // Role ids are gen_random_uuid() values; any UUID version is accepted so
  // the contract does not depend on how ids are generated.
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique(roleIdIdentity)
  @ArrayMaxSize(MAX_ROLES_PER_EMPLOYEE)
  @IsUUID('all', { each: true })
  roleIds!: string[];
}
