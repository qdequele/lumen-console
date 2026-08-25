"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Browser client, used only for auth (sign in / sign up / sign out). */
export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
