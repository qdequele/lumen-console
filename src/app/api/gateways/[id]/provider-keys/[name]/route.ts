import { NextRequest, NextResponse } from "next/server";
import { connectGateway } from "@/lib/server/gateways";
import { lumenFetch } from "@/lib/server/lumen";
import { notFound, toErrorResponse } from "@/lib/server/respond";

type Params = { params: Promise<{ id: string; name: string }> };

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id, name } = await params;
    const result = await connectGateway(id, { admin: true });
    if (!result) return notFound(`gateway "${id}"`);
    const body = await request.text();
    await lumenFetch<void>(result.conn, `/admin/provider-keys/${encodeURIComponent(name)}`, {
      method: "PUT",
      body,
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
