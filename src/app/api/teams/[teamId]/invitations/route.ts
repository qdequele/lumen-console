import { NextRequest, NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/server/respond";
import { requireUser } from "@/lib/server/role";
import { supabaseServer } from "@/lib/server/supabase";
import type { InvitationInfo, TeamRole } from "@/lib/types";

type Params = { params: Promise<{ teamId: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requireUser();
    const { teamId } = await params;
    const supabase = await supabaseServer();
    const { data, error } = await supabase
      .from("invitations")
      .select("id, email, role, created_at")
      .eq("team_id", teamId)
      .order("created_at");
    if (error) throw new Error(error.message);
    return NextResponse.json(
      (data ?? []).map(
        (row): InvitationInfo => ({
          id: row.id,
          email: row.email,
          role: row.role as TeamRole,
          created_at: row.created_at,
        }),
      ),
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { teamId } = await params;
    const body = (await request.json()) as { email?: string; role?: string };
    const email = body.email?.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "a valid `email` is required" }, { status: 400 });
    }
    if (!body.role || !["admin", "viewer"].includes(body.role)) {
      return NextResponse.json({ error: "role must be admin or viewer" }, { status: 400 });
    }
    const supabase = await supabaseServer();
    const { data, error } = await supabase
      .from("invitations")
      .insert({ team_id: teamId, email, role: body.role, invited_by: user.id })
      .select("id, email, role, created_at")
      .single();
    if (error) {
      const message = error.message.includes("duplicate")
        ? `${email} is already invited to this team`
        : error.message;
      return NextResponse.json({ error: message }, { status: 400 });
    }
    // The invite is claimed automatically on the invitee's next visit
    // (claim_invitations RPC in /api/me). No email delivery in v1.
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
