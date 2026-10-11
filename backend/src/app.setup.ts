import {
  INestApplication,
  RequestMethod,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { HttpErrorFilter } from './modules/auth/presentation/http-error.filter';
import {
  createOriginCsrfMiddleware,
  parseAllowedOrigins,
} from './modules/auth/presentation/origin-policy';
import { validationExceptionFactory } from './modules/auth/presentation/validation-exception.factory';

// Shared by main.ts and the e2e specs so tests exercise the real HTTP
// configuration (global prefix, URI versioning, cookies, validation, error envelope).
export function configureApp(app: INestApplication): void {
  const allowedOrigins = parseAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS);
  if (allowedOrigins.length > 0) {
    app.enableCors({
      origin: allowedOrigins,
      credentials: true,
    });
  }

  app.setGlobalPrefix('api', {
    exclude: [{ path: '', method: RequestMethod.GET }],
  });
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });
  app.use(cookieParser());
  app.use(createOriginCsrfMiddleware(allowedOrigins));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.useGlobalFilters(new HttpErrorFilter());
}
