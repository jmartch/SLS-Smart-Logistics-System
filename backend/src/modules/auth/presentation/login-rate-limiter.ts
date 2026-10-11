import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';

export const LOGIN_RATE_LIMIT_OPTIONS = Symbol('LOGIN_RATE_LIMIT_OPTIONS');

export interface LoginRateLimitOptions {
  readonly maxAttempts?: number;
  readonly windowMs?: number;
  readonly maxTrackedKeys?: number;
}

interface FailureBucket {
  count: number;
  expiresAt: number;
}

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_TRACKED_KEYS = 10_000;

function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
): number {
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizePart(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

@Injectable()
export class LoginRateLimiter {
  private readonly maxAttempts: number;
  private readonly windowMs: number;
  private readonly maxTrackedKeys: number;
  private readonly buckets = new Map<string, FailureBucket>();

  constructor(
    @Optional()
    @Inject(LOGIN_RATE_LIMIT_OPTIONS)
    options?: LoginRateLimitOptions,
  ) {
    this.maxAttempts =
      options?.maxAttempts ??
      parsePositiveInt(
        process.env.AUTH_LOGIN_RATE_LIMIT_MAX,
        DEFAULT_MAX_ATTEMPTS,
      );
    this.windowMs =
      options?.windowMs ??
      parsePositiveInt(
        process.env.AUTH_LOGIN_RATE_LIMIT_WINDOW_MS,
        DEFAULT_WINDOW_MS,
      );
    this.maxTrackedKeys = options?.maxTrackedKeys ?? DEFAULT_MAX_TRACKED_KEYS;
  }

  forTenantLogin(
    ip: string | undefined,
    slug: string,
    email: string,
  ): string {
    return [
      'tenant',
      normalizePart(ip) || 'unknown',
      normalizePart(slug),
      normalizePart(email),
    ].join(':');
  }

  forPlatformLogin(ip: string | undefined, email: string): string {
    return [
      'platform',
      normalizePart(ip) || 'unknown',
      normalizePart(email),
    ].join(':');
  }

  assertAllowed(
    key: string,
    options?: {
      now?: number;
      setHeader?: (name: string, value: string) => unknown;
    },
  ): void {
    const now = options?.now ?? Date.now();
    this.pruneExpired(now);
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.expiresAt <= now) {
      this.buckets.delete(key);
      return;
    }

    if (bucket.count >= this.maxAttempts) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((bucket.expiresAt - now) / 1000),
      );
      options?.setHeader?.('Retry-After', String(retryAfterSeconds));
      throw new HttpException(
        {
          error: {
            code: 'TOO_MANY_REQUESTS',
            message: 'Too many login attempts. Please try again later.',
            fields: null,
          },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  recordFailure(key: string, now: number = Date.now()): void {
    this.pruneExpired(now);
    const existing = this.buckets.get(key);

    if (existing && existing.expiresAt > now) {
      existing.count += 1;
      return;
    }

    if (this.buckets.size >= this.maxTrackedKeys) {
      const oldestKey = this.buckets.keys().next().value;
      if (oldestKey !== undefined) {
        this.buckets.delete(oldestKey);
      }
    }

    this.buckets.set(key, {
      count: 1,
      expiresAt: now + this.windowMs,
    });
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }

  private pruneExpired(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.expiresAt <= now) {
        this.buckets.delete(key);
      }
    }
  }
}
