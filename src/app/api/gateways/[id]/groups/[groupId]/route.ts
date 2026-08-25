import { NextRequest, NextResponse } from "next/server";
import { connectGateway } from "@/lib/server/gateways";
import { lumenFetch } from "@/lib/server/lumen";
import { notFound, toErrorResponse } from "@/lib/server/respond";
import type { GroupRecord } from "@/lib/types";

type Params = { params: Promise<{ id: string; groupId: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id, groupId } = await params;
    const result = await connectGateway(id, { admin: true });
    if (!result) return notFound(`gateway "${id}"`);
    const body = await request.text();
    const updated = await lumenFetch<GroupRecord>(
      result.conn,
      `/admin/groups/${encodeURIComponent(groupId)}`,
      { method: "PATCH", body },
    );
    return NextResponse.json(updated);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id, groupId } = await params;
    const result = await connectGateway(id, { admin: true });
    if (!result) return notFound(`gateway "${id}"`);
    await lumenFetch<void>(result.conn, `/admin/groups/${encodeURIComponent(groupId)}`, {
      method: "DELETE",
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
