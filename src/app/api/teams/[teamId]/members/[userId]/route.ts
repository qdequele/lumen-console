import { NextRequest, NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/server/respond";
import { requireUser } from "@/lib/server/role";
import { supabaseServer } from "@/lib/server/supabase";

type Params = { params: Promise<{ teamId: string; userId: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    await requireUser();
    const { teamId, userId } = await params;
    const body = (await request.json()) as { role?: string };
    if (!body.role || !["owner", "admin", "viewer"].includes(body.role)) {
      return NextResponse.json({ error: "role must be owner, admin or viewer" }, { status: 400 });
    }
    const supabase = await supabaseServer();
    const { data, error } = await supabase
      .from("team_members")
      .update({ role: body.role })
      .eq("team_id", teamId)
      .eq("user_id", userId)
      .select("user_id")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data) {
      return NextResponse.json(
        { error: "member not found, or you lack the admin role" },
        { status: 403 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { teamId, userId } = await params;
    const supabase = await supabaseServer();
    // Never orphan a team: the last owner cannot leave or be removed.
    const { data: owners, error: ownersError } = await supabase
      .from("team_members")
      .select("user_id")
      .eq("team_id", teamId)
      .eq("role", "owner");
    if (ownersError) throw new Error(ownersError.message);
    if (owners?.length === 1 && owners[0].user_id === userId) {
      return NextResponse.json(
        { error: "cannot remove the last owner; transfer ownership or delete the team" },
        { status: 400 },
      );
    }
    const { data, error } = await supabase
      .from("team_members")
      .delete()
      .eq("team_id", teamId)
      .eq("user_id", userId)
      .select("user_id")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data) {
      return NextResponse.json(
        { error: "member not found, or you lack the admin role" },
        { status: 403 },
      );
    }
    return NextResponse.json({ left: userId === user.id });
  } catch (error) {
    return toErrorResponse(error);
  }
}
