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
import type { Request, Response } from 'express';
import { LoginTenantUserService } from '../application/login-tenant-user.service';
import { LogoutService } from '../application/logout.service';
import { GetCurrentIdentityService } from '../application/get-current-identity.service';
import { LoginDto } from './dto/login.dto';
import { AuthGuard, SESSION_COOKIE_NAME } from './auth.guard';
import { CurrentActor } from './current-actor.decorator';
import { sessionCookieOptions } from './session-cookie';
import type { ActorContext } from '../../../shared/application/actor-context';

@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly loginService: LoginTenantUserService,
    private readonly logoutService: LogoutService,
    private readonly getCurrentIdentity: GetCurrentIdentityService,
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

  // Spec section 6.3. Takes nothing from query, body or headers: the identity
  // is the session actor's. Explicit field lists: nothing else is returned.
  @Get('me')
  @UseGuards(AuthGuard)
  async me(@CurrentActor() actor: ActorContext) {
    const identity = await this.getCurrentIdentity.get(actor);

    if (!identity) {
      throw new UnauthorizedException({
        error: {
          code: 'SESSION_EXPIRED',
          message: 'La sesion expiro o fue revocada.',
          fields: null,
        },
      });
    }

    if (identity.kind === 'PLATFORM_ADMIN') {
      return {
        platformAdminId: identity.platformAdminId,
        email: identity.email,
      };
    }

    return {
      userId: identity.userId,
      tenantId: identity.tenantId,
      email: identity.email,
      roles: identity.roles.map((role) => ({ id: role.id, name: role.name })),
      permissions: [...identity.permissions],
    };
  }
}
