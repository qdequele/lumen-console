import { NextRequest, NextResponse } from "next/server";
import { connectGateway } from "@/lib/server/gateways";
import { lumenFetch } from "@/lib/server/lumen";
import { notFound, toErrorResponse } from "@/lib/server/respond";
import type { UsageExportPage } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

/** Pass-through of GET /admin/usage/export query parameters. */
const ALLOWED_PARAMS = new Set(["since", "until", "cursor", "limit"]);

/**
 * One page of raw usage rows (ADR 010). The client paginates with
 * `next_cursor`, pinning `since`/`until` from the first page so the window
 * cannot drift between pages.
 */
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
    const page = await lumenFetch<UsageExportPage>(result.conn, `/admin/usage/export${suffix}`);
    return NextResponse.json(page);
  } catch (error) {
    return toErrorResponse(error);
  }
}
