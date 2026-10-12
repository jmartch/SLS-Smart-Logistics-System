import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  apiFetch,
  onUnauthorizedResponse,
} from './shared/api/httpClient';
import {
  defaultHomeForUser,
  derivePrimaryRole,
  mapMeResponseToUser,
} from './auth';

vi.mock('./shared/config/environment', () => ({
  API_BASE_URL: '/api/v1',
  USE_MOCK_DATA: false,
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('httpClient + auth session helpers (AUTH-01 R7)', () => {
  it('envía credentials: include por defecto en apiFetch', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    await apiFetch<{ ok: boolean }>('/auth/me');

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/auth/me',
      expect.objectContaining({
        credentials: 'include',
      }),
    );
  });

  it('normaliza el envelope { error: { code, message, fields } } del backend en ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Los datos enviados no son validos.',
              fields: [
                { field: 'slug', reason: 'slug should not be empty' },
                { field: 'email', reason: 'email must be an email' },
              ],
            },
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      ),
    );

    await expect(
      apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ slug: '', email: 'bad', password: '123' }),
      }),
    ).rejects.toMatchObject({
      name: 'ApiError',
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Los datos enviados no son validos.',
      fields: {
        slug: 'slug should not be empty',
        email: 'email must be an email',
      },
    } satisfies Partial<ApiError>);
  });

  it('notifica al listener global de 401 en rutas protegidas pero no en /auth/login', async () => {
    const unauthorizedListener = vi.fn();
    const unsubscribe = onUnauthorizedResponse(unauthorizedListener);

    try {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              error: {
                code: 'INVALID_CREDENTIALS',
                message: 'Correo, empresa o contrasena incorrectos.',
                fields: null,
              },
            }),
            { status: 401, headers: { 'Content-Type': 'application/json' } },
          ),
        ),
      );

      await expect(
        apiFetch('/auth/login', { method: 'POST' }),
      ).rejects.toMatchObject({
        status: 401,
        code: 'INVALID_CREDENTIALS',
      });
      expect(unauthorizedListener).not.toHaveBeenCalled();

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              error: {
                code: 'SESSION_EXPIRED',
                message: 'La sesion expiro o fue revocada.',
                fields: null,
              },
            }),
            { status: 401, headers: { 'Content-Type': 'application/json' } },
          ),
        ),
      );

      await expect(apiFetch('/users')).rejects.toMatchObject({
        status: 401,
        code: 'SESSION_EXPIRED',
      });
      expect(unauthorizedListener).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
    }
  });

  it('mapea la respuesta de /auth/me para usuario de tenant y deriva su rol y ruta inicial por permisos', () => {
    const user = mapMeResponseToUser(
      {
        userId: '11111111-1111-4111-8111-111111111111',
        tenantId: '22222222-2222-4222-8222-222222222222',
        email: 'sofia.guzman@norte.co',
        roles: [{ id: 'r-admin', name: 'Administrador' }],
        permissions: ['MANAGE_TENANT', 'MANAGE_EMPLOYEES', 'REGISTER_PACKAGES'],
      },
      'logistica-del-norte',
    );

    expect(user).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Sofia Guzman',
      email: 'sofia.guzman@norte.co',
      role: 'admin',
      roles: [{ id: 'r-admin', name: 'Administrador' }],
      permissions: ['MANAGE_TENANT', 'MANAGE_EMPLOYEES', 'REGISTER_PACKAGES'],
      kind: 'TENANT_USER',
      tenant: 'logistica-del-norte',
      tenantId: '22222222-2222-4222-8222-222222222222',
      avatar: 'SG',
    });
    expect(defaultHomeForUser(user)).toBe('/app/admin/usuarios');
  });

  it('mapea la respuesta de /auth/me para superadministrador de plataforma', () => {
    const platformUser = mapMeResponseToUser({
      platformAdminId: '99999999-9999-4999-8999-999999999999',
      email: 'root@sls.local',
    });

    expect(platformUser.kind).toBe('PLATFORM_ADMIN');
    expect(platformUser.role).toBe('superadmin');
    expect(defaultHomeForUser(platformUser)).toBe('/app/admin/empresas');
    expect(derivePrimaryRole(['COORDINATE_ROUTES'], [])).toBe('coordinator');
  });
});
