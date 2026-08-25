import { NextRequest, NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/server/respond";
import { requireUser } from "@/lib/server/role";
import { supabaseServer } from "@/lib/server/supabase";

type Params = { params: Promise<{ teamId: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    await requireUser();
    const { teamId } = await params;
    const body = (await request.json()) as { name?: string };
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "`name` is required" }, { status: 400 });
    }
    // RLS: only the owner can update; a non-owner's update matches 0 rows.
    const supabase = await supabaseServer();
    const { data, error } = await supabase
      .from("teams")
      .update({ name: body.name.trim() })
      .eq("id", teamId)
      .select("id")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data) {
      return NextResponse.json({ error: "only the team owner can rename it" }, { status: 403 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    await requireUser();
    const { teamId } = await params;
    // Cascades to memberships, invitations, gateways and their secrets.
    const supabase = await supabaseServer();
    const { data, error } = await supabase
      .from("teams")
      .delete()
      .eq("id", teamId)
      .select("id")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data) {
      return NextResponse.json({ error: "only the team owner can delete it" }, { status: 403 });
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
