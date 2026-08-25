import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/role";
import { supabaseServer } from "@/lib/server/supabase";
import { toErrorResponse } from "@/lib/server/respond";

export async function GET() {
  try {
    const user = await requireUser();
    // Claim any pending team invitations addressed to this email; cheap
    // no-op when there are none, and it makes invites "just work" on the
    // invitee's next visit.
    const supabase = await supabaseServer();
    await supabase.rpc("claim_invitations");
    return NextResponse.json({ id: user.id, email: user.email ?? "" });
  } catch (error) {
    return toErrorResponse(error);
  }
}
