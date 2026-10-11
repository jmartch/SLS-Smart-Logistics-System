export interface StartRouteBody {
  readonly timestamp?: string;
}

export function validateStartRouteBody(body: unknown): StartRouteBody {
  if (body === undefined || body === null || typeof body !== 'object') {
    return {};
  }
  const raw = body as Record<string, unknown>;
  const timestamp =
    typeof raw.timestamp === 'string' && raw.timestamp.trim()
      ? raw.timestamp.trim()
      : undefined;
  return { timestamp };
}
