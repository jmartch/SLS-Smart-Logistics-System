import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { HttpErrorFilter } from './modules/auth/presentation/http-error.filter';
import { validationExceptionFactory } from './modules/auth/presentation/validation-exception.factory';

// Shared by main.ts and the e2e specs so tests exercise the real HTTP
// configuration (cookies, validation, error envelope).
export function configureApp(app: INestApplication): void {
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.useGlobalFilters(new HttpErrorFilter());
}
