import { z } from 'zod';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export type FieldErrors = Record<string, string[]>;

/** Every failure of an API call, including network failures, is normalised to this type. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: FieldErrors | undefined;

  constructor(status: number, code: string, message: string, fieldErrors?: FieldErrors) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

const errorBodySchema = z.object({
  code: z.string(),
  message: z.string(),
  fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
});

export interface ApiFetchOptions<TBody = undefined> {
  method?: HttpMethod;
  /** JSON-serialised, except `FormData`, which is sent as multipart (the browser sets the boundary). */
  body?: TBody;
  /** Incoming `cookie` header to forward. Only needed for server-side calls. */
  cookie?: string;
}

function serializeBody(body: unknown): BodyInit {
  return body instanceof FormData ? body : JSON.stringify(body);
}

/**
 * Transport only: JSON (or FormData) in, Zod-validated JSON out, errors normalised to `ApiError`.
 * A response body is only returned when the caller supplies a schema for it, so nothing is
 * forced into a type with a cast. Calls without a schema resolve to `void`.
 */
export async function apiFetch<TResponse, TBody = undefined>(
  path: string,
  options: ApiFetchOptions<TBody> & { schema: z.ZodType<TResponse> },
): Promise<TResponse>;
export async function apiFetch<TBody = undefined>(
  path: string,
  options?: ApiFetchOptions<TBody> & { schema?: undefined },
): Promise<void>;
export async function apiFetch<TResponse, TBody = undefined>(
  path: string,
  options: ApiFetchOptions<TBody> & { schema?: z.ZodType<TResponse> } = {},
): Promise<TResponse | void> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.cookie) {
    headers['Cookie'] = options.cookie;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : serializeBody(options.body),
      credentials: 'include',
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server');
  }

  if (!response.ok) {
    throw await toApiError(response);
  }

  if (options.schema === undefined) {
    return;
  }
  if (response.status === 204) {
    throw new ApiError(204, 'UNEXPECTED_RESPONSE', 'Expected a response body');
  }

  const payload: unknown = await response.json();
  const parsed = options.schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError(response.status, 'INVALID_RESPONSE', 'Unexpected response from the server');
  }
  return parsed.data;
}

async function toApiError(response: Response): Promise<ApiError> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return new ApiError(response.status, 'UNKNOWN_ERROR', 'Unexpected error');
  }

  const parsed = errorBodySchema.safeParse(payload);
  if (!parsed.success) {
    return new ApiError(response.status, 'UNKNOWN_ERROR', 'Unexpected error');
  }
  return new ApiError(
    response.status,
    parsed.data.code,
    parsed.data.message,
    parsed.data.fieldErrors,
  );
}
