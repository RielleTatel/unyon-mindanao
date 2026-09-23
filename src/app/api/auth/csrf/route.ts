import { NextResponse } from "next/server";

import {
  createCsrfToken,
  csrfCookieName,
  secureCookie,
} from "@/features/access/server";

export const runtime = "nodejs";

export function GET() {
  const token = createCsrfToken();
  const response = NextResponse.json(
    { token },
    { headers: { "cache-control": "no-store" } },
  );

  response.cookies.set(csrfCookieName, token, {
    httpOnly: false,
    maxAge: 10 * 60,
    path: "/api",
    sameSite: "strict",
    secure: secureCookie,
  });

  return response;
}
