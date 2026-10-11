import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class PlatformLoginDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  // Bounded so an oversized body cannot be fed to argon2.
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  password!: string;
}
