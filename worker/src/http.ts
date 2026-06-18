const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

export function json(body: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...headers },
  });
}

export function apiError(status: number, code: string, message: string, details?: unknown) {
  return json({
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
    },
  }, status);
}

export async function readJson(request: Request, maxBytes = 262_144) {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > maxBytes) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, 'BAD_REQUEST', 'Body is not valid JSON');
  }
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
