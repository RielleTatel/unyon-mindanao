import { NextResponse } from "next/server";

import {
  AccessError,
  csrfCookieName,
  secureCookie,
  sessionCookieName,
  withSessionService,
} from "@/features/access/server";
import { withUniversityAdminInvitationFeature } from "@/features/directory/server";

export const runtime = "nodejs";

function correlationId(request: Request) {
  const supplied = request.headers.get("x-request-id");
  return supplied && supplied.length <= 160 ? supplied : crypto.randomUUID();
}

function readCookie(request: Request, name: string) {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");

    if (key === name) {
      return decodeURIComponent(value.join("="));
    }
  }

  return "";
}

export async function POST(request: Request) {
  const requestCorrelationId = correlationId(request);
  const csrfToken = request.headers.get("x-csrf-token") ?? "";
  const csrfCookieToken = readCookie(request, csrfCookieName);

  if (!csrfToken || csrfToken !== csrfCookieToken) {
    return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      fullName?: unknown;
      idToken?: unknown;
      token?: unknown;
    };
    const idToken = typeof body.idToken === "string" ? body.idToken : "";
    await withUniversityAdminInvitationFeature((feature) =>
      feature.accept({
        correlationId: requestCorrelationId,
        fullName: typeof body.fullName === "string" ? body.fullName : "",
        idToken,
        token: typeof body.token === "string" ? body.token : "",
      }),
    );
    const started = await withSessionService((sessions) =>
      sessions.start({
        correlationId: requestCorrelationId,
        csrfCookieToken,
        csrfToken,
        idToken,
      }),
    );
    const response = NextResponse.json(
      { ok: true },
      { headers: { "cache-control": "no-store" } },
    );

    response.cookies.set(sessionCookieName, started.sessionToken, {
      expires: started.expiresAt,
      httpOnly: true,
      path: "/",
      sameSite: "strict",
      secure: secureCookie,
    });
    response.cookies.set(csrfCookieName, "", {
      expires: new Date(0),
      httpOnly: false,
      path: "/api",
      sameSite: "strict",
      secure: secureCookie,
    });

    return response;
  } catch (error) {
    const status =
      error instanceof AccessError &&
      (error.code === "INVALID_INVITATION" || error.code === "INVITATION_EMAIL_MISMATCH")
        ? 400
        : error instanceof AccessError && error.code === "INVALID_INPUT"
          ? 400
        : error instanceof AccessError && error.code === "CONFLICT"
          ? 409
          : error instanceof AccessError && error.code === "AUTHENTICATION_REQUIRED"
            ? 401
            : 503;
    const code = error instanceof AccessError ? error.code : "OPERATION_FAILED";

    return NextResponse.json(
      { error: code },
      { status, headers: { "cache-control": "no-store" } },
    );
  }
}
