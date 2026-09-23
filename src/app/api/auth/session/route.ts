import { NextResponse } from "next/server";

import {
  csrfCookieName,
  secureCookie,
  sessionCookieName,
  withSessionService,
} from "@/features/access/server";

export const runtime = "nodejs";

function correlationId(request: Request) {
  const supplied = request.headers.get("x-request-id");
  return supplied && supplied.length <= 160 ? supplied : crypto.randomUUID();
}

export async function POST(request: Request) {
  const requestCorrelationId = correlationId(request);

  try {
    const body = (await request.json()) as { idToken?: unknown };
    const csrfToken = request.headers.get("x-csrf-token") ?? "";
    const csrfCookieToken = readCookie(request, csrfCookieName) ?? "";
    const started = await withSessionService((sessions) =>
      sessions.start({
        correlationId: requestCorrelationId,
        csrfCookieToken,
        csrfToken,
        idToken: typeof body.idToken === "string" ? body.idToken : "",
      }),
    );
    const response = NextResponse.json({ ok: true });

    response.cookies.set(sessionCookieName, started.sessionToken, {
      expires: started.expiresAt,
      httpOnly: true,
      path: "/",
      sameSite: "strict",
      secure: secureCookie,
    });
    clearCsrfCookie(response);

    return response;
  } catch (error) {
    console.warn(
      JSON.stringify({
        code:
          typeof error === "object" && error && "code" in error
            ? String(error.code)
            : "AUTHENTICATION_REQUIRED",
        correlationId: requestCorrelationId,
        event: "session_start_denied",
      }),
    );
    return NextResponse.json(
      { error: "AUTHENTICATION_REQUIRED" },
      { status: 401 },
    );
  }
}

export async function DELETE(request: Request) {
  const requestCorrelationId = correlationId(request);
  const sessionToken = readCookie(request, sessionCookieName) ?? "";
  const csrfToken = request.headers.get("x-csrf-token") ?? "";
  const csrfCookieToken = readCookie(request, csrfCookieName) ?? "";

  if (!csrfToken || csrfToken !== csrfCookieToken) {
    return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  }

  let response: NextResponse;

  try {
    await withSessionService((sessions) =>
      sessions.end(sessionToken, requestCorrelationId),
    );
    response = NextResponse.json({ ok: true });
  } catch (error) {
    console.error(
      JSON.stringify({
        code: "OPERATION_FAILED",
        correlationId: requestCorrelationId,
        event: "session_end_failed",
        dependencyName: error instanceof Error ? error.name : "UnknownError",
      }),
    );
    response = NextResponse.json(
      { error: "OPERATION_FAILED" },
      { status: 503 },
    );
  }

  response.cookies.delete(sessionCookieName);
  clearCsrfCookie(response);
  return response;
}

function clearCsrfCookie(response: NextResponse) {
  response.cookies.set(csrfCookieName, "", {
    expires: new Date(0),
    httpOnly: false,
    path: "/api",
    sameSite: "strict",
    secure: secureCookie,
  });
}

function readCookie(request: Request, name: string) {
  const cookies = request.headers.get("cookie") ?? "";

  for (const part of cookies.split(";")) {
    const [key, ...value] = part.trim().split("=");

    if (key === name) {
      return decodeURIComponent(value.join("="));
    }
  }

  return undefined;
}
