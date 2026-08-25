import { NextRequest, NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/server/respond";
import { requireUser } from "@/lib/server/role";
import { supabaseServer } from "@/lib/server/supabase";
import type { Team, TeamRole } from "@/lib/types";

export async function GET() {
  try {
    const user = await requireUser();
    const supabase = await supabaseServer();
    const [teams, memberships] = await Promise.all([
      supabase.from("teams").select("id, name, created_at").order("created_at"),
      supabase.from("team_members").select("team_id, role").eq("user_id", user.id),
    ]);
    if (teams.error) throw new Error(teams.error.message);
    if (memberships.error) throw new Error(memberships.error.message);
    const roles = new Map(
      memberships.data.map((row) => [row.team_id as string, row.role as TeamRole]),
    );
    const result: Team[] = teams.data.map((team) => ({
      id: team.id,
      name: team.name,
      created_at: team.created_at,
      role: roles.get(team.id) ?? "viewer",
    }));
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireUser();
    const body = (await request.json()) as { name?: string };
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "`name` is required" }, { status: 400 });
    }
    // The DB trigger makes the creator the owner atomically.
    const supabase = await supabaseServer();
    const { data, error } = await supabase
      .from("teams")
      .insert({ name: body.name.trim() })
      .select("id, name, created_at")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ...data, role: "owner" }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
