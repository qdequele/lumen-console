import { NextRequest, NextResponse } from "next/server";
import { connectGateway } from "@/lib/server/gateways";
import { lumenFetch } from "@/lib/server/lumen";
import { notFound, toErrorResponse } from "@/lib/server/respond";
import type { UsageReport } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

/** Pass-through of GET /admin/usage query parameters the gateway accepts. */
const ALLOWED_PARAMS = new Set([
  "key_id",
  "group_id",
  "model",
  "provider",
  "capability",
  "since",
  "until",
  "group_by",
  "limit",
]);

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const result = await connectGateway(id, { admin: false });
    if (!result) return notFound(`gateway "${id}"`);
    const query = new URLSearchParams();
    for (const [name, value] of request.nextUrl.searchParams) {
      if (ALLOWED_PARAMS.has(name)) query.set(name, value);
    }
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    const report = await lumenFetch<UsageReport>(result.conn, `/admin/usage${suffix}`);
    return NextResponse.json(report);
  } catch (error) {
    return toErrorResponse(error);
  }
}
