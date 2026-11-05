import type { NextFunction, Request, Response } from 'express';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function parseAllowedOrigins(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }

  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && entry !== '*')
    .map((entry) => {
      try {
        return new URL(entry).origin.toLowerCase();
      } catch {
        return '';
      }
    })
    .filter((entry) => entry.length > 0);
}

function extractRequestOrigin(req: Request): string | null {
  const originHeader = req.headers.origin;
  if (typeof originHeader === 'string' && originHeader.trim().length > 0) {
    const trimmed = originHeader.trim();
    if (trimmed.toLowerCase() === 'null') {
      return 'null';
    }
    try {
      return new URL(trimmed).origin.toLowerCase();
    } catch {
      return 'invalid';
    }
  }

  const refererHeader = req.headers.referer;
  if (typeof refererHeader === 'string' && refererHeader.trim().length > 0) {
    try {
      return new URL(refererHeader.trim()).origin.toLowerCase();
    } catch {
      return 'invalid';
    }
  }

  return null;
}

function isSameHostOrigin(req: Request, candidateOrigin: string): boolean {
  const host = req.headers.host;
  if (typeof host !== 'string' || host.trim().length === 0) {
    return false;
  }

  const normalizedHost = host.trim().toLowerCase();
  return (
    candidateOrigin === `http://${normalizedHost}` ||
    candidateOrigin === `https://${normalizedHost}`
  );
}

export function createOriginCsrfMiddleware(
  allowedOrigins: readonly string[],
) {
  const allowedSet = new Set(
    allowedOrigins.map((origin) => origin.toLowerCase()),
  );

  return function originCsrfMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    if (!MUTATING_METHODS.has(req.method.toUpperCase())) {
      next();
      return;
    }

    const candidateOrigin = extractRequestOrigin(req);
    // Non-browser clients (e.g. CLI tools or internal integration runners)
    // that do not send Origin/Referer are allowed; browsers send Origin on
    // every POST/PUT/PATCH/DELETE and cross-origin fetch/form submission.
    if (candidateOrigin === null) {
      next();
      return;
    }

    if (
      candidateOrigin !== 'null' &&
      candidateOrigin !== 'invalid' &&
      (isSameHostOrigin(req, candidateOrigin) ||
        allowedSet.has(candidateOrigin))
    ) {
      next();
      return;
    }

    res.status(403).json({
      error: {
        code: 'CSRF_ORIGIN_MISMATCH',
        message: 'Cross-origin state-changing request is not allowed.',
        fields: null,
      },
    });
  };
}
