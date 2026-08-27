import { NextRequest, NextResponse } from "next/server";
import { connectGateway } from "@/lib/server/gateways";
import { webhookFetch } from "@/lib/server/webhooks";
import { notFound, toErrorResponse } from "@/lib/server/respond";

type Params = { params: Promise<{ id: string }> };

/**
 * Store (or rotate) the HMAC signing secret, sealed at rest on the gateway.
 * The secret passes through this handler once and is never logged, stored,
 * or returned — the browser only ever sees `signed` / `signing_key_stored`.
 */
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const result = await connectGateway(id, { admin: true });
    if (!result) return notFound(`gateway "${id}"`);
    const body = (await request.json()) as { secret?: unknown };
    if (typeof body.secret !== "string" || body.secret.trim() === "") {
      return NextResponse.json({ error: "`secret` must not be empty" }, { status: 400 });
    }
    await webhookFetch<void>(result.conn, "/admin/webhooks/signing-key", {
      method: "PUT",
      body: JSON.stringify({ secret: body.secret }),
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** Forget the stored secret; deliveries fall back to `signing_key_env` or unsigned. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const result = await connectGateway(id, { admin: true });
    if (!result) return notFound(`gateway "${id}"`);
    await webhookFetch<void>(result.conn, "/admin/webhooks/signing-key", { method: "DELETE" });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
