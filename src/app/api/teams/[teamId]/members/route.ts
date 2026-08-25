import { NextRequest, NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/server/respond";
import { requireUser } from "@/lib/server/role";
import { supabaseServer, supabaseService } from "@/lib/server/supabase";
import type { TeamMemberInfo, TeamRole } from "@/lib/types";

type Params = { params: Promise<{ teamId: string }> };

/**
 * Roster with emails. Membership rows come through RLS (which proves the
 * caller belongs to the team); emails are then resolved with the service
 * role because `auth.users` is not client-readable.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requireUser();
    const { teamId } = await params;
    const supabase = await supabaseServer();
    const { data: members, error } = await supabase
      .from("team_members")
      .select("user_id, role, created_at")
      .eq("team_id", teamId)
      .order("created_at");
    if (error) throw new Error(error.message);
    if (!members || members.length === 0) {
      // RLS returns an empty set for non-members; report it as not-found
      // rather than leaking whether the team exists.
      return NextResponse.json({ error: "unknown team" }, { status: 404 });
    }
    const service = supabaseService();
    const emails = new Map<string, string>();
    await Promise.all(
      members.map(async (member) => {
        const { data } = await service.auth.admin.getUserById(member.user_id);
        emails.set(member.user_id, data.user?.email ?? "unknown");
      }),
    );
    const result: TeamMemberInfo[] = members.map((member) => ({
      user_id: member.user_id,
      email: emails.get(member.user_id) ?? "unknown",
      role: member.role as TeamRole,
      created_at: member.created_at,
    }));
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
