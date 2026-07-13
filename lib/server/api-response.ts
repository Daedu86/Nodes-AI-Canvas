import type { ZodType } from "zod";

export type ApiErrorDescriptor = {
  code: string;
  error: string;
  status: number;
};

type ParsedJsonBody<T> =
  | { data: T; ok: true }
  | { ok: false; response: Response };

export function jsonNoStore<T>(body: T, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(body, { ...init, headers });
}

export function apiError(
  descriptor: ApiErrorDescriptor,
  init: Omit<ResponseInit, "status"> = {},
) {
  return jsonNoStore(
    { code: descriptor.code, error: descriptor.error },
    { ...init, status: descriptor.status },
  );
}

export async function parseJsonBody<T>(
  request: Request,
  schema: ZodType<T>,
  invalid: ApiErrorDescriptor,
): Promise<ParsedJsonBody<T>> {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return { ok: false, response: apiError(invalid) };
  }
  return { data: parsed.data, ok: true };
}
