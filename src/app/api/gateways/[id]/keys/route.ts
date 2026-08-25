import { NextRequest, NextResponse } from "next/server";
import { connectGateway } from "@/lib/server/gateways";
import { lumenFetch } from "@/lib/server/lumen";
import { notFound, toErrorResponse } from "@/lib/server/respond";
import type { CreatedKey, VirtualKeyRecord } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const result = await connectGateway(id, { admin: false });
    if (!result) return notFound(`gateway "${id}"`);
    const includeDeleted = request.nextUrl.searchParams.get("include_deleted") === "true";
    const keys = await lumenFetch<VirtualKeyRecord[]>(
      result.conn,
      `/admin/keys${includeDeleted ? "?include_deleted=true" : ""}`,
    );
    return NextResponse.json(keys);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const result = await connectGateway(id, { admin: true });
    if (!result) return notFound(`gateway "${id}"`);
    const body = await request.text();
    const created = await lumenFetch<CreatedKey>(result.conn, "/admin/keys", {
      method: "POST",
      body,
    });
    // The plaintext appears exactly once, in this response; it is never
    // stored or logged on the console side either.
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
