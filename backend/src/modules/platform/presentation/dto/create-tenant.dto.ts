import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsEmail()
  @MaxLength(255)
  adminEmail!: string;

  // Bounded so an oversized body cannot be fed to argon2.
  @IsString()
  @MinLength(8)
  @MaxLength(1024)
  adminPassword!: string;
}
