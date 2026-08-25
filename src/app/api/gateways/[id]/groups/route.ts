import { NextRequest, NextResponse } from "next/server";
import { connectGateway } from "@/lib/server/gateways";
import { lumenFetch } from "@/lib/server/lumen";
import { notFound, toErrorResponse } from "@/lib/server/respond";
import type { GroupRecord } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const result = await connectGateway(id, { admin: false });
    if (!result) return notFound(`gateway "${id}"`);
    const includeDeleted = request.nextUrl.searchParams.get("include_deleted") === "true";
    const groups = await lumenFetch<GroupRecord[]>(
      result.conn,
      `/admin/groups${includeDeleted ? "?include_deleted=true" : ""}`,
    );
    return NextResponse.json(groups);
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
    const created = await lumenFetch<GroupRecord>(result.conn, "/admin/groups", {
      method: "POST",
      body,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
