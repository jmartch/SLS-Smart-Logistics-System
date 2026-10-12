import type { NextFunction, Request, Response } from 'express';
import {
  createOriginCsrfMiddleware,
  parseAllowedOrigins,
} from './origin-policy';

function makeRes() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return {
    res: { status, json } as unknown as Response,
    status,
    json,
  };
}

describe('origin-policy (CSRF & CORS allowlist)', () => {
  describe('parseAllowedOrigins', () => {
    it('normalizes valid origins and ignores wildcard * or malformed entries', () => {
      expect(
        parseAllowedOrigins(
          ' http://localhost:5173/path , *, https://App.SLS.co , not-a-url ',
        ),
      ).toEqual(['http://localhost:5173', 'https://app.sls.co']);
    });

    it('returns an empty list when undefined or blank', () => {
      expect(parseAllowedOrigins(undefined)).toEqual([]);
      expect(parseAllowedOrigins('   ')).toEqual([]);
    });
  });

  describe('createOriginCsrfMiddleware', () => {
    const middleware = createOriginCsrfMiddleware(['http://localhost:5173']);

    it('always allows safe read methods even with a foreign Origin header', () => {
      const req = {
        method: 'GET',
        headers: {
          host: 'localhost:3000',
          origin: 'https://evil.example.com',
        },
      } as unknown as Request;
      const { res, status } = makeRes();
      const next: NextFunction = jest.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(status).not.toHaveBeenCalled();
    });

    it('allows mutating requests without Origin or Referer (CLI / Supertest)', () => {
      const req = {
        method: 'POST',
        headers: { host: 'localhost:3000' },
      } as unknown as Request;
      const { res, status } = makeRes();
      const next: NextFunction = jest.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(status).not.toHaveBeenCalled();
    });

    it('allows mutating requests whose Origin matches the request Host', () => {
      const req = {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
        },
      } as unknown as Request;
      const { res, status } = makeRes();
      const next: NextFunction = jest.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(status).not.toHaveBeenCalled();
    });

    it('allows mutating requests whose Origin is in the explicit allowlist', () => {
      const req = {
        method: 'PATCH',
        headers: {
          host: 'localhost:3000',
          origin: 'http://localhost:5173',
        },
      } as unknown as Request;
      const { res, status } = makeRes();
      const next: NextFunction = jest.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(status).not.toHaveBeenCalled();
    });

    it('rejects mutating requests with an untrusted Origin or Referer with 403 CSRF_ORIGIN_MISMATCH', () => {
      for (const headers of [
        { host: 'localhost:3000', origin: 'https://evil.example.com' },
        { host: 'localhost:3000', origin: 'null' },
        {
          host: 'localhost:3000',
          referer: 'https://evil.example.com/attack.html',
        },
      ]) {
        const req = {
          method: 'POST',
          headers,
        } as unknown as Request;
        const { res, status, json } = makeRes();
        const next: NextFunction = jest.fn();

        middleware(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(status).toHaveBeenCalledWith(403);
        expect(json).toHaveBeenCalledWith({
          error: {
            code: 'CSRF_ORIGIN_MISMATCH',
            message: 'Cross-origin state-changing request is not allowed.',
            fields: null,
          },
        });
      }
    });
  });
});
