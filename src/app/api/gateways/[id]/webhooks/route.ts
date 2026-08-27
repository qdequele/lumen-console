import { NextRequest, NextResponse } from "next/server";
import { connectGateway } from "@/lib/server/gateways";
import { webhookFetch } from "@/lib/server/webhooks";
import { notFound, toErrorResponse } from "@/lib/server/respond";
import { validateWebhookSettings } from "@/lib/webhooks";
import type { WebhookConfigInfo, WebhookSettings } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

/** Live webhook settings + source + signing state. No secret material — viewer-safe. */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const result = await connectGateway(id, { admin: false });
    if (!result) return notFound(`gateway "${id}"`);
    const info = await webhookFetch<WebhookConfigInfo>(result.conn, "/admin/webhooks");
    return NextResponse.json(info);
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** Replace EVERY setting, applied immediately. The stored row wins over the config file. */
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const result = await connectGateway(id, { admin: true });
    if (!result) return notFound(`gateway "${id}"`);
    const settings = (await request.json()) as WebhookSettings;
    const invalid = validateWebhookSettings(settings);
    if (invalid) {
      return NextResponse.json({ error: invalid }, { status: 400 });
    }
    const info = await webhookFetch<WebhookConfigInfo | undefined>(result.conn, "/admin/webhooks", {
      method: "PUT",
      body: JSON.stringify(settings),
    });
    if (info === undefined) return new NextResponse(null, { status: 204 });
    return NextResponse.json(info);
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** Stop emitting, persistently — a gateway reload does not undo this. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const result = await connectGateway(id, { admin: true });
    if (!result) return notFound(`gateway "${id}"`);
    await webhookFetch<void>(result.conn, "/admin/webhooks", { method: "DELETE" });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
