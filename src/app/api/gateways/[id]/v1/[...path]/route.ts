import { NextRequest } from "next/server";
import { connectGateway } from "@/lib/server/gateways";
import { playgroundEndpoint, proxyToGateway } from "@/lib/server/playground-proxy";
import { notFound, toErrorResponse } from "@/lib/server/respond";
import { requireUser } from "@/lib/server/role";

type Params = { params: Promise<{ id: string; path: string[] }> };

/**
 * Playground proxy: any team member (viewers included) may call the
 * allowlisted /v1 endpoints with the gateway's console-owned playground key.
 */
async function handle(request: NextRequest, { params }: Params) {
  try {
    const { id, path } = await params;
    const endpoint = playgroundEndpoint(request.method, path);
    if (!endpoint) return notFound(`playground endpoint "${request.method} /v1/${path.join("/")}"`);
    const user = await requireUser();
    const result = await connectGateway(id, { admin: false });
    if (!result) return notFound(`gateway "${id}"`);
    return await proxyToGateway(request, { conn: result.conn, userId: user.id, endpoint });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export const GET = handle;
export const POST = handle;
