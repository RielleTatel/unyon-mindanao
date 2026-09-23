import { NextResponse } from "next/server";

import { withUniversityAdminInvitationFeature } from "@/features/directory/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { token?: unknown };
    const preview = await withUniversityAdminInvitationFeature((feature) =>
      feature.preview(typeof body.token === "string" ? body.token : ""),
    );

    if (!preview) {
      return NextResponse.json(
        { error: "INVALID_INVITATION" },
        { status: 404, headers: { "cache-control": "no-store" } },
      );
    }

    return NextResponse.json(preview, {
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "OPERATION_FAILED" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
