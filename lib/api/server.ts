import "server-only";
import { getSession } from "@/lib/session";

const backendBaseUrl = process.env.BACKEND_API_URL ?? "http://localhost:8080";

export const GENERIC_OPERATION_ERROR =
  "No pudimos completar la operación. Intentá nuevamente.";
export const SERVICE_UNAVAILABLE_ERROR =
  "No pudimos completar la operación en este momento. Intentá nuevamente más tarde.";

export class BackendApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "BackendApiError";
  }
}

function safeMessage(payload: unknown, fallback: string) {
  let candidate: string | null = null;
  if (payload && typeof payload === "object") {
    if ("message" in payload && typeof payload.message === "string") {
      candidate = payload.message;
    } else if ("error" in payload && typeof payload.error === "string") {
      candidate = payload.error;
    } else {
      candidate =
        Object.values(payload).find(
          (value): value is string => typeof value === "string",
        ) ?? null;
    }
  }

  const message = candidate?.trim();
  const containsTechnicalDetails =
    /\b(backend|server|servidor|endpoint|exception|stack|trace|sql|database|connection|fetch|http|json|auth0|smtp)\b/i.test(
      message ?? "",
    );
  return message && message.length <= 300 && !containsTechnicalDetails
    ? message
    : fallback;
}

function responseErrorMessage(status: number, payload: unknown) {
  if (status >= 500) return SERVICE_UNAVAILABLE_ERROR;
  return safeMessage(payload, GENERIC_OPERATION_ERROR);
}

export async function publicBackendRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(new URL(path, backendBaseUrl), {
      ...init,
      cache: "no-store",
      signal: init.signal ?? AbortSignal.timeout(30_000),
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new BackendApiError(502, SERVICE_UNAVAILABLE_ERROR);
  }
  const contentType = response.headers.get("content-type") ?? "";
  const payload: unknown = contentType.includes("application/json")
    ? await response.json()
    : null;
  if (!response.ok) {
    throw new BackendApiError(
      response.status,
      responseErrorMessage(response.status, payload),
    );
  }
  return payload as T;
}

export async function backendResponse(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const session = await getSession();
  if (!session) throw new BackendApiError(401, "La sesión expiró.");

  let response: Response;
  try {
    response = await fetch(new URL(path, backendBaseUrl), {
      ...init,
      cache: "no-store",
      signal: init.signal ?? AbortSignal.timeout(60_000),
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${session.token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch (error) {
    if (
      error instanceof DOMException &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    ) {
      throw new BackendApiError(
        504,
        "La operación tardó demasiado. Podés reintentar sin perder el borrador.",
      );
    }
    throw new BackendApiError(502, SERVICE_UNAVAILABLE_ERROR);
  }

  if (!response.ok) {
    const payload = await readJson(response);
    throw new BackendApiError(
      response.status,
      responseErrorMessage(response.status, payload),
    );
  }

  return response;
}

function readJson(response: Response): Promise<unknown> {
  return response.headers.get("content-type")?.includes("application/json")
    ? response.json()
    : Promise.resolve(null);
}

export async function backendRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await backendResponse(path, init);
  return response.status === 204 ? null as T : await readJson(response) as T;
}
