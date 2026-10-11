import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  slug!: string;

  @IsEmail()
  @MaxLength(255)
  email!: string;

  // Bounded so an oversized body cannot be fed to argon2.
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  password!: string;
}
