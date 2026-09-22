const BASE_URL = import.meta.env.VITE_API_BASE_URL;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string>;

  constructor(status: number, code: string, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

// TODO(AUTH-01): reemplazar por el mecanismo real una vez exista el módulo
// de autenticación (contexto de sesión, cookie httpOnly, etc.).
function getAuthToken(): string | null {
  return localStorage.getItem('sls_auth_token');
}

interface ErrorBody {
  code?: string;
  message?: string;
  fields?: Record<string, string>;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getAuthToken() ?? ''}`,
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'No se pudo conectar con el servidor.');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Respuesta sin cuerpo JSON; se maneja según el código HTTP más abajo.
  }

  if (response.ok) {
    return body as T;
  }

  const errorBody = (body ?? {}) as ErrorBody;
  throw new ApiError(
    response.status,
    errorBody.code ?? statusToDefaultCode(response.status),
    errorBody.message ?? 'Ocurrió un error inesperado.',
    errorBody.fields,
  );
}

function statusToDefaultCode(status: number): string {
  if (status === 401) return 'UNAUTHENTICATED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 409) return 'CONFLICT';
  if (status === 400) return 'VALIDATION_ERROR';
  return 'UNKNOWN_ERROR';
}
