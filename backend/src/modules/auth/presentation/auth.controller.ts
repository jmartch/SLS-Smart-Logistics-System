import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import { LoginTenantUserService } from '../application/login-tenant-user.service';
import { LogoutService } from '../application/logout.service';
import { LoginDto } from './dto/login.dto';
import { AuthGuard, SESSION_COOKIE_NAME } from './auth.guard';
import { CurrentActor } from './current-actor.decorator';
import type { ActorContext } from '../../../shared/application/actor-context';

// Browsers only clear a cookie when the clearing Set-Cookie matches the
// attributes it was set with, so set and clear share these options.
function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  };
}

@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly loginService: LoginTenantUserService,
    private readonly logoutService: LogoutService,
  ) {}

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.loginService.login(dto);

    if (result.kind === 'INVALID_CREDENTIALS') {
      throw new UnauthorizedException({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Correo, empresa o contrasena incorrectos.',
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

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    // cookie-parser JSON-decodes "j:" cookies, so the value may not be a string.
    const rawToken: unknown = (
      req.cookies as Record<string, unknown> | undefined
    )?.[SESSION_COOKIE_NAME];

    if (typeof rawToken === 'string' && rawToken.length > 0) {
      await this.logoutService.logout(rawToken);
    }

    res.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions());
    return { ok: true };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentActor() actor: ActorContext) {
    if (actor.kind === 'PLATFORM_ADMIN') {
      return { platformAdminId: actor.platformAdminId };
    }

    return {
      userId: actor.userId,
      tenantId: actor.tenantId,
      permissions: Array.from(actor.permissions),
    };
  }
}
