import type { CookieOptions } from 'express';

// Browsers only clear a cookie when the clearing Set-Cookie matches the
// attributes it was set with, so set and clear share these options. Tenant and
// platform logins both use them so every session cookie behaves the same.
export function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  };
}
