import { NextRequest, NextResponse } from "next/server";
import { connectGateway } from "@/lib/server/gateways";
import { lumenFetch } from "@/lib/server/lumen";
import { notFound, toErrorResponse } from "@/lib/server/respond";
import type { GroupRecord } from "@/lib/types";

type Params = { params: Promise<{ id: string; groupId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id, groupId } = await params;
    const result = await connectGateway(id, { admin: true });
    if (!result) return notFound(`gateway "${id}"`);
    const body = await request.text();
    const record = await lumenFetch<GroupRecord>(
      result.conn,
      `/admin/groups/${encodeURIComponent(groupId)}/grant`,
      { method: "POST", body },
    );
    return NextResponse.json(record);
  } catch (error) {
    return toErrorResponse(error);
  }
}
