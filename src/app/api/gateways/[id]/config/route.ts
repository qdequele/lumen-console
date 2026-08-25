import { NextRequest, NextResponse } from "next/server";
import { connectGateway } from "@/lib/server/gateways";
import { fetchConfig } from "@/lib/server/config";
import { notFound, toErrorResponse } from "@/lib/server/respond";
import type { GatewayConfigInfo } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

/** Providers and models as configured on the gateway, plus the config hash. */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const result = await connectGateway(id, { admin: false });
    if (!result) return notFound(`gateway "${id}"`);
    const document = await fetchConfig(result.conn);
    const info: GatewayConfigInfo = { hash: document.hash, providers: document.providers };
    return NextResponse.json(info);
  } catch (error) {
    return toErrorResponse(error);
  }
}
