import {
  Body,
  Controller,
  HttpCode,
  Post,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { LoginPlatformAdminService } from '../application/login-platform-admin.service';
import {
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from '../../auth/presentation/session-cookie';
import { PlatformLoginDto } from './dto/platform-login.dto';

@Controller('api/platform')
export class PlatformAuthController {
  constructor(private readonly loginService: LoginPlatformAdminService) {}

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: PlatformLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.loginService.login(dto);

    if (result.kind === 'INVALID_CREDENTIALS') {
      throw new UnauthorizedException({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Correo o contrasena incorrectos.',
          fields: null,
        },
      });
    }

    res.cookie(SESSION_COOKIE_NAME, result.rawToken, {
      ...sessionCookieOptions(),
      expires: result.expiresAt,
    });

    return { ok: true };
  }
}
