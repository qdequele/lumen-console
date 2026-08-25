import { NextRequest, NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/server/respond";
import { requireUser } from "@/lib/server/role";
import { supabaseServer } from "@/lib/server/supabase";

type Params = { params: Promise<{ teamId: string; inviteId: string }> };

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    await requireUser();
    const { teamId, inviteId } = await params;
    const supabase = await supabaseServer();
    const { data, error } = await supabase
      .from("invitations")
      .delete()
      .eq("team_id", teamId)
      .eq("id", inviteId)
      .select("id")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data) {
      return NextResponse.json(
        { error: "invitation not found, or you lack the admin role" },
        { status: 403 },
      );
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
