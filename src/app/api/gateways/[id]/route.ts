import { NextRequest, NextResponse } from "next/server";
import { findGateway, storeMasterKey } from "@/lib/server/gateways";
import { notFound, toErrorResponse } from "@/lib/server/respond";
import { ForbiddenError } from "@/lib/server/role";
import { supabaseServer } from "@/lib/server/supabase";
import type { GatewayUpdateBody } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const gateway = await findGateway(id);
    if (!gateway) return notFound(`gateway "${id}"`);
    if (gateway.role === "viewer") throw new ForbiddenError();
    const body = (await request.json()) as GatewayUpdateBody;
    const patch: Record<string, string> = {};
    if (body.name?.trim()) patch.name = body.name.trim();
    if (body.region?.trim()) patch.region = body.region.trim();
    if (body.url?.trim()) {
      if (!/^https?:\/\//.test(body.url)) {
        return NextResponse.json({ error: "url must be http(s)" }, { status: 400 });
      }
      patch.url = body.url.trim().replace(/\/+$/, "");
    }
    if (Object.keys(patch).length > 0) {
      const supabase = await supabaseServer();
      const { error } = await supabase.from("gateways").update(patch).eq("id", id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (body.master_key?.trim()) {
      await storeMasterKey(id, body.master_key.trim());
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const gateway = await findGateway(id);
    if (!gateway) return notFound(`gateway "${id}"`);
    if (gateway.role === "viewer") throw new ForbiddenError();
    // The secrets row follows via ON DELETE CASCADE.
    const supabase = await supabaseServer();
    const { error } = await supabase.from("gateways").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
