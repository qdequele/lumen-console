import { NextRequest, NextResponse } from "next/server";
import { connectGateway } from "@/lib/server/gateways";
import { lumenFetch } from "@/lib/server/lumen";
import { notFound, toErrorResponse } from "@/lib/server/respond";
import type { CreatedKey } from "@/lib/types";

type Params = { params: Promise<{ id: string; keyId: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const { id, keyId } = await params;
    const result = await connectGateway(id, { admin: true });
    if (!result) return notFound(`gateway "${id}"`);
    const rotated = await lumenFetch<CreatedKey>(
      result.conn,
      `/admin/keys/${encodeURIComponent(keyId)}/rotate`,
      { method: "POST" },
    );
    return NextResponse.json(rotated);
  } catch (error) {
    return toErrorResponse(error);
  }
}
