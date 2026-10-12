import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { LoginPlatformAdminService } from '../application/login-platform-admin.service';
import { LoginRateLimiter } from '../../auth/presentation/login-rate-limiter';
import {
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from '../../auth/presentation/session-cookie';
import { PlatformLoginDto } from './dto/platform-login.dto';

@Controller('platform')
export class PlatformAuthController {
  constructor(
    private readonly loginService: LoginPlatformAdminService,
    private readonly rateLimiter: LoginRateLimiter,
  ) {}

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: PlatformLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rateLimitKey = this.rateLimiter.forPlatformLogin(req.ip, dto.email);
    this.rateLimiter.assertAllowed(rateLimitKey, {
      setHeader: (name, value) => res.setHeader(name, value),
    });

    const result = await this.loginService.login(dto);

    if (result.kind === 'INVALID_CREDENTIALS') {
      this.rateLimiter.recordFailure(rateLimitKey);
      throw new UnauthorizedException({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Correo o contrasena incorrectos.',
          fields: null,
        },
      });
    }

    this.rateLimiter.reset(rateLimitKey);

    res.cookie(SESSION_COOKIE_NAME, result.rawToken, {
      ...sessionCookieOptions(),
      expires: result.expiresAt,
    });

    return { ok: true };
  }
}
