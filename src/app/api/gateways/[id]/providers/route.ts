import { NextRequest, NextResponse } from "next/server";
import { findGateway } from "@/lib/server/gateways";
import { lumenFetchPublic } from "@/lib/server/lumen";
import { notFound, toErrorResponse } from "@/lib/server/respond";
import type { ProviderHealthMap } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const gateway = await findGateway(id);
    if (!gateway) return notFound(`gateway "${id}"`);
    const health = await lumenFetchPublic<ProviderHealthMap>(gateway.url, "/health/providers");
    return NextResponse.json(health);
  } catch (error) {
    return toErrorResponse(error);
  }
}
