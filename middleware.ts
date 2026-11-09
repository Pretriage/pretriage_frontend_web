import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  SESSION_REFRESH_COOKIE_NAME,
  SESSION_RENEW_AT_COOKIE_NAME,
} from "@/lib/session-cookie";
import {
  type AuthTokenResponse,
  authTokenResponseSchema,
  clearSessionCookies,
  renewalEpochSeconds,
  setSessionCookies,
} from "@/lib/session-tokens";

const backendBaseUrl =
  process.env.BACKEND_API_URL?.trim() || "http://localhost:8080";
const renewalMarginSeconds = 60;
const sessionCheckPath = "/api/auth/sesion";
const rotationCooldownMs = 2_000;

type Renewal =
  | { status: "renewed"; tokens: AuthTokenResponse; renewAt: number }
  | { status: "invalid" | "unavailable" };

const pendingRenewals = new Map<string, Promise<Renewal>>();
const recentlyRotated = new Set<string>();

async function refreshSession(refreshToken: string): Promise<Renewal> {
  try {
    const response = await fetch(new URL("/api/renovar", backendBaseUrl), {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refreshToken }),
    });

    if (response.status === 401) return { status: "invalid" };
    if (!response.ok) return { status: "unavailable" };

    const parsed = authTokenResponseSchema.safeParse(await response.json());
    if (!parsed.success) return { status: "unavailable" };

    return {
      status: "renewed",
      tokens: parsed.data,
      renewAt: renewalEpochSeconds(parsed.data.renovarTokenEn),
    };
  } catch {
    return { status: "unavailable" };
  }
}

async function renewOnce(refreshToken: string): Promise<Renewal> {
  const key = createHash("sha256").update(refreshToken).digest("base64url");
  const pending = pendingRenewals.get(key);
  if (pending) return pending;
  if (recentlyRotated.has(key)) return { status: "unavailable" };

  const renewal = refreshSession(refreshToken).then((result) => {
    pendingRenewals.delete(key);
    if (result.status === "renewed") {
      // Late requests may still carry the old cookie. Keep only its digest
      // briefly so they can retry without reusing it against the provider.
      recentlyRotated.add(key);
      setTimeout(() => recentlyRotated.delete(key), rotationCooldownMs).unref();
    }
    return result;
  });
  pendingRenewals.set(key, renewal);
  return renewal;
}

function jwtExpiration(token: string | undefined) {
  if (!token) return null;
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { exp?: unknown };
    return typeof claims.exp === "number" ? claims.exp : null;
  } catch {
    return null;
  }
}

function sessionExpiration(request: NextRequest, accessToken?: string) {
  const jwtExpiresAt = jwtExpiration(accessToken);
  const storedValue = Number(
    request.cookies.get(SESSION_RENEW_AT_COOKIE_NAME)?.value,
  );
  const storedExpiresAt = Number.isSafeInteger(storedValue) && storedValue > 0
    ? storedValue
    : null;
  if (jwtExpiresAt && storedExpiresAt) {
    return Math.min(jwtExpiresAt, storedExpiresAt);
  }
  return jwtExpiresAt ?? storedExpiresAt;
}

function aplicarCabecerasSinCache(respuesta: NextResponse) {
  // Evita que el navegador guarde pantallas con datos sensibles y las
  // restaure con la flecha atrás después de cerrar sesión.
  respuesta.headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, private",
  );
  respuesta.headers.set("Pragma", "no-cache");
  respuesta.headers.set("Expires", "0");
  return respuesta;
}

function respuestaSiguienteSinCache() {
  return aplicarCabecerasSinCache(NextResponse.next());
}

function unauthenticated(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return aplicarCabecerasSinCache(
      NextResponse.json(
        { message: "La sesión expiró.", status: 401 },
        { status: 401 },
      ),
    );
  }
  return aplicarCabecerasSinCache(
    NextResponse.redirect(new URL("/login", request.url)),
  );
}

function refreshUnavailable(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return aplicarCabecerasSinCache(
      NextResponse.json(
        { message: "No pudimos renovar la sesión. Intentá nuevamente.", status: 503 },
        { status: 503 },
      ),
    );
  }
  return aplicarCabecerasSinCache(
    new NextResponse("No pudimos renovar la sesión. Intentá nuevamente.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    }),
  );
}

function continueWithRotatedSession(
  request: NextRequest,
  tokens: AuthTokenResponse,
  renewAt: number,
) {
  request.cookies.set(SESSION_COOKIE_NAME, tokens.token);
  request.cookies.set(SESSION_REFRESH_COOKIE_NAME, tokens.refreshToken);
  request.cookies.set(SESSION_RENEW_AT_COOKIE_NAME, String(renewAt));

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("cookie", request.cookies.toString());
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  setSessionCookies(response, tokens, renewAt);
  return aplicarCabecerasSinCache(response);
}

export async function middleware(request: NextRequest) {
  const checkingSession = request.nextUrl.pathname === sessionCheckPath;
  if (checkingSession && request.method !== "POST") {
    return respuestaSiguienteSinCache();
  }

  const accessToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const refreshToken = request.cookies.get(SESSION_REFRESH_COOKIE_NAME)?.value;
  const expiresAt = sessionExpiration(request, accessToken);
  const now = Math.floor(Date.now() / 1000);
  const accessTokenUsable = Boolean(accessToken && expiresAt !== null && expiresAt > now);
  const renewalDue = checkingSession && expiresAt !== null && expiresAt <= now + renewalMarginSeconds;

  if (accessTokenUsable && (!renewalDue || !refreshToken)) {
    return respuestaSiguienteSinCache();
  }
  if (!refreshToken) return unauthenticated(request);

  const renewal = await renewOnce(refreshToken);
  if (renewal.status === "renewed") {
    return continueWithRotatedSession(request, renewal.tokens, renewal.renewAt);
  }

  if (renewal.status === "invalid") {
    const response = unauthenticated(request);
    clearSessionCookies(response);
    return response;
  }

  return refreshUnavailable(request);
}

export const config = {
  runtime: "nodejs",
  matcher: [
    "/",
    "/admin/:path*",
    "/recepcion/:path*",
    "/medico/:path*",
    "/cuenta/:path*",
    "/api/auth/sesion",
    "/api/staff/:path*",
  ],
};
