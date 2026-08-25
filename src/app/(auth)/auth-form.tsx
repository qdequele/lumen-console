"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Asterisk } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AuthFormProps {
  mode: "login" | "signup";
}

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    const supabase = supabaseBrowser();
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
        setPending(false);
        return;
      }
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setError(error.message);
        setPending(false);
        return;
      }
      // With email confirmation enabled there is no session yet.
      if (!data.session) {
        setConfirmationSent(true);
        setPending(false);
        return;
      }
    }
    router.push("/");
    // Re-run server components with the fresh session cookie.
    router.refresh();
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-xs">
          <Asterisk className="size-10" strokeWidth={2.25} aria-hidden />
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">
            {mode === "login" ? "Sign in to Lumen" : "Create your account"}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {mode === "login"
              ? "Your teams and gateways are where you left them."
              : "One account, any number of teams and gateways."}
          </p>

          {confirmationSent ? (
            <p className="mt-8 text-sm text-muted-foreground">
              Check your inbox — we sent a confirmation link to{" "}
              <strong className="text-foreground">{email}</strong>.
            </p>
          ) : (
            <form onSubmit={submit} className="mt-8 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  required
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? "…" : mode === "login" ? "Sign in" : "Sign up"}
              </Button>
            </form>
          )}

          <p className="mt-8 border-t pt-6 text-sm text-muted-foreground">
            {mode === "login" ? (
              <>
                No account?{" "}
                <Link
                  href="/signup"
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  Sign up
                </Link>
              </>
            ) : (
              <>
                Already registered?{" "}
                <Link
                  href="/login"
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  Sign in
                </Link>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
