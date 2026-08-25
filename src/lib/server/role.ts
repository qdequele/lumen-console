import "server-only";
import type { User } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/server/supabase";

export class UnauthorizedError extends Error {
  constructor() {
    super("sign in required");
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "this action requires the admin role") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** The signed-in user, or a 401 for the route to relay. */
export async function requireUser(): Promise<User> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new UnauthorizedError();
  return user;
}
