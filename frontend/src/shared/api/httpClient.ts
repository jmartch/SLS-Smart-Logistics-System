import { API_BASE_URL } from '../config/environment';

export interface ValidationFieldIssue {
  readonly field: string;
  readonly reason: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string>;
  readonly fieldIssues: readonly ValidationFieldIssue[];

  constructor(
    status: number,
    code: string,
    message: string,
    fields: Record<string, string> = {},
    fieldIssues: readonly ValidationFieldIssue[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.fieldIssues = fieldIssues;
  }
}

interface RawErrorPayload {
  code?: unknown;
  message?: unknown;
  field?: unknown;
  fields?: unknown;
}

type UnauthorizedListener = () => void;

const unauthorizedListeners = new Set<UnauthorizedListener>();

export function onUnauthorizedResponse(
  listener: UnauthorizedListener,
): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

function notifyUnauthorized(path: string): void {
  if (
    path === '/auth/login' ||
    path === '/platform/login' ||
    path === '/auth/logout'
  ) {
    return;
  }
  for (const listener of unauthorizedListeners) {
    listener();
  }
}

function normalizeFields(
  rawFields: unknown,
  singleField: unknown,
  fallbackMessage: string,
): {
  fields: Record<string, string>;
  fieldIssues: ValidationFieldIssue[];
} {
  const fields: Record<string, string> = {};
  const fieldIssues: ValidationFieldIssue[] = [];

  if (Array.isArray(rawFields)) {
    for (const item of rawFields) {
      if (
        typeof item === 'object' &&
        item !== null &&
        typeof (item as { field?: unknown }).field === 'string' &&
        typeof (item as { reason?: unknown }).reason === 'string'
      ) {
        const issue: ValidationFieldIssue = {
          field: (item as { field: string }).field,
          reason: (item as { reason: string }).reason,
        };
        fieldIssues.push(issue);
        if (!(issue.field in fields)) {
          fields[issue.field] = issue.reason;
        }
      }
    }
  } else if (typeof rawFields === 'object' && rawFields !== null) {
    for (const [key, value] of Object.entries(rawFields)) {
      if (typeof value === 'string') {
        fields[key] = value;
        fieldIssues.push({ field: key, reason: value });
      }
    }
  }

  if (typeof singleField === 'string' && singleField.length > 0) {
    if (!(singleField in fields)) {
      fields[singleField] = fallbackMessage;
    }
    if (!fieldIssues.some((issue) => issue.field === singleField)) {
      fieldIssues.push({ field: singleField, reason: fallbackMessage });
    }
  }

  return { fields, fieldIssues };
}

function extractErrorPayload(body: unknown): RawErrorPayload {
  if (typeof body !== 'object' || body === null) {
    return {};
  }
  if (
    'error' in body &&
    typeof (body as { error?: unknown }).error === 'object' &&
    (body as { error?: unknown }).error !== null
  ) {
    return (body as { error: RawErrorPayload }).error;
  }
  return body as RawErrorPayload;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    const headers = new Headers(init?.headers);
    if (init?.body instanceof FormData) {
      headers.delete('Content-Type');
    } else if (init?.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: 'include',
      ...init,
      headers,
    });
  } catch {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'No se pudo conectar con el servidor.',
    );
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

  if (response.status === 401) {
    notifyUnauthorized(path);
  }

  const payload = extractErrorPayload(body);
  const code =
    typeof payload.code === 'string'
      ? payload.code
      : statusToDefaultCode(response.status);
  const message =
    typeof payload.message === 'string'
      ? payload.message
      : 'Ocurrió un error inesperado.';
  const { fields, fieldIssues } = normalizeFields(
    payload.fields,
    payload.field,
    message,
  );

  throw new ApiError(response.status, code, message, fields, fieldIssues);
}

function statusToDefaultCode(status: number): string {
  if (status === 401) return 'UNAUTHENTICATED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 409) return 'CONFLICT';
  if (status === 429) return 'TOO_MANY_REQUESTS';
  if (status === 400) return 'VALIDATION_ERROR';
  return 'UNKNOWN_ERROR';
}
