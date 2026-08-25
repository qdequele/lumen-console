import { NextRequest, NextResponse } from "next/server";
import { connectGateway } from "@/lib/server/gateways";
import { lumenFetch } from "@/lib/server/lumen";
import { notFound, toErrorResponse } from "@/lib/server/respond";
import type { VirtualKeyRecord } from "@/lib/types";

type Params = { params: Promise<{ id: string; keyId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id, keyId } = await params;
    const result = await connectGateway(id, { admin: true });
    if (!result) return notFound(`gateway "${id}"`);
    const body = await request.text();
    const record = await lumenFetch<VirtualKeyRecord>(
      result.conn,
      `/admin/keys/${encodeURIComponent(keyId)}/grant`,
      { method: "POST", body },
    );
    return NextResponse.json(record);
  } catch (error) {
    return toErrorResponse(error);
  }
}
