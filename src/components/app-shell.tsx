"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Asterisk,
  Cable,
  ChartColumn,
  Check,
  ChevronsUpDown,
  KeyRound,
  LayoutGrid,
  Layers,
  LogOut,
  Monitor,
  Moon,
  Server,
  Settings,
  Sun,
  Users,
} from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { useGateways, useMe, useTeams } from "@/lib/hooks";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { ScopeAvatar } from "@/components/scope-avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NavItemProps {
  href: string;
  icon: ReactNode;
  label: string;
  active: boolean;
}

function NavItem({ href, icon, label, active }: NavItemProps) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
        active
          ? "bg-accent font-medium text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      <span className="[&_svg]:size-4">{icon}</span>
      <span className="truncate">{label}</span>
    </Link>
  );
}

const GATEWAY_NAV = [
  { tab: "overview", label: "Overview", icon: <LayoutGrid /> },
  { tab: "usage", label: "Usage", icon: <ChartColumn /> },
  { tab: "keys", label: "API Keys", icon: <KeyRound /> },
  { tab: "groups", label: "Budget Groups", icon: <Layers /> },
  { tab: "providers", label: "Providers", icon: <Cable /> },
  // Settings is admin-only; the shell filters it out for viewers.
  { tab: "settings", label: "Settings", icon: <Settings /> },
] as const;

/** "quentin.dq@company.com" → "Quentin Dq" — cosmetic, header only. */
function displayName(email: string | undefined): string {
  if (!email) return "…";
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length === 0) return email;
  return parts.map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const gateways = useGateways();
  const teams = useTeams();
  const me = useMe();
  const { theme, setTheme } = useTheme();

  const gatewayId = pathname.startsWith("/gateways/") ? pathname.split("/")[2] : null;
  const gateway = gatewayId ? gateways.data?.find((entry) => entry.id === gatewayId) : null;
  const activeTab = searchParams.get("tab") ?? "overview";

  const downCount =
    gateways.data?.filter((entry) => entry.reachable === "down").length ?? 0;

  const signOut = async () => {
    await supabaseBrowser().auth.signOut();
    router.push("/login");
    router.refresh();
  };

  // The gateway's own name lives in the scope selector; the top bar names
  // the active section instead, so the name never repeats.
  const pageTitle = gateway
    ? (GATEWAY_NAV.find((item) => item.tab === activeTab)?.label ?? "Overview")
    : pathname.startsWith("/usage")
      ? "Usage"
      : pathname.startsWith("/teams")
        ? "Teams"
        : "Gateways";

  const themeChoices = [
    { value: "system", icon: <Monitor className="size-3.5" />, label: "System theme" },
    { value: "light", icon: <Sun className="size-3.5" />, label: "Light theme" },
    { value: "dark", icon: <Moon className="size-3.5" />, label: "Dark theme" },
  ] as const;

  return (
    <div className="flex min-h-screen">
      {/* ---- Sidebar ---------------------------------------------------- */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r bg-background md:flex">
        {/* Logo + gateway selector */}
        <div className="flex items-center gap-1 px-3 pt-3">
          <Link
            href="/"
            aria-label="Lumen Console home"
            className="rounded-md p-1.5 transition-colors hover:bg-accent/60"
          >
            <Asterisk className="size-5" strokeWidth={2.5} />
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors hover:bg-accent/60">
              {gateway ? (
                <>
                  <ScopeAvatar seed={gateway.id} className="size-4" />
                  <span className="truncate">{gateway.name}</span>
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      gateway.reachable === "up" ? "bg-success" : "bg-destructive",
                    )}
                    aria-label={gateway.reachable === "up" ? "reachable" : "unreachable"}
                  />
                </>
              ) : (
                <span className="truncate">All gateways</span>
              )}
              <ChevronsUpDown className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-60">
              <DropdownMenuItem onClick={() => router.push("/")}>
                <LayoutGrid className="size-4" />
                All gateways
                {!gateway && <Check className="ml-auto size-4" />}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {(gateways.data ?? []).map((entry) => (
                <DropdownMenuItem
                  key={entry.id}
                  onClick={() => router.push(`/gateways/${entry.id}`)}
                >
                  <ScopeAvatar seed={entry.id} className="size-4" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{entry.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {entry.team_name} · {entry.region}
                    </span>
                  </span>
                  {gateway?.id === entry.id ? (
                    <Check className="size-4" />
                  ) : (
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        entry.reachable === "up" ? "bg-success" : "bg-destructive",
                      )}
                    />
                  )}
                </DropdownMenuItem>
              ))}
              {gateways.data?.length === 0 && (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">
                  No gateways yet — register one from the Gateways page.
                </p>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Navigation */}
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 pt-4">
          {gateway ? (
            <>
              <Link
                href="/"
                className="mb-2 flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
              >
                <ArrowLeft className="size-4" />
                <span className="truncate">All gateways</span>
              </Link>
              {GATEWAY_NAV.filter(
                (item) => item.tab !== "settings" || gateway.role !== "viewer",
              ).map((item) => (
                <NavItem
                  key={item.tab}
                  href={
                    item.tab === "overview"
                      ? `/gateways/${gateway.id}`
                      : `/gateways/${gateway.id}?tab=${item.tab}`
                  }
                  icon={item.icon}
                  label={item.label}
                  active={activeTab === item.tab}
                />
              ))}
            </>
          ) : (
            <>
              <NavItem
                href="/"
                icon={<Server />}
                label="Gateways"
                active={pathname === "/"}
              />
              <NavItem
                href="/usage"
                icon={<ChartColumn />}
                label="Usage"
                active={pathname.startsWith("/usage")}
              />
              <NavItem
                href="/teams"
                icon={<Users />}
                label="Teams"
                active={pathname.startsWith("/teams")}
              />
            </>
          )}
        </nav>

        {/* Account */}
        <div className="border-t px-3 py-3">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/60">
              <ScopeAvatar seed={me.data?.email ?? "account"} className="size-7" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{displayName(me.data?.email)}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {me.data?.email ?? "…"}
                </span>
              </span>
              <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-64">
              <DropdownMenuLabel className="flex items-center gap-2.5 font-normal">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {displayName(me.data?.email)}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {me.data?.email ?? "…"}
                  </span>
                </span>
                <Link
                  href="/teams"
                  aria-label="Manage teams"
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Settings className="size-4" />
                </Link>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />

              <DropdownMenuLabel className="pb-0 text-xs font-normal text-muted-foreground">
                Teams
              </DropdownMenuLabel>
              {(teams.data ?? []).map((team) => (
                <DropdownMenuItem key={team.id} onClick={() => router.push("/teams")}>
                  <ScopeAvatar seed={team.id} className="size-4" />
                  <span className="min-w-0 flex-1 truncate">{team.name}</span>
                  <Badge variant="secondary" className="text-[10px]">
                    {team.role}
                  </Badge>
                </DropdownMenuItem>
              ))}
              {teams.data?.length === 0 && (
                <DropdownMenuItem onClick={() => router.push("/teams")}>
                  <Users className="size-4" /> Create your first team
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />

              {/* Theme: inline segmented control, keeps the menu open. */}
              <div className="flex items-center justify-between px-2 py-1.5 text-sm">
                <span>Theme</span>
                <div className="flex items-center gap-0.5 rounded-full border p-0.5">
                  {themeChoices.map((choice) => (
                    <button
                      key={choice.value}
                      type="button"
                      aria-label={choice.label}
                      aria-pressed={theme === choice.value}
                      onClick={() => setTheme(choice.value)}
                      className={cn(
                        "rounded-full p-1.5 transition-colors",
                        theme === choice.value
                          ? "bg-accent text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {choice.icon}
                    </button>
                  ))}
                </div>
              </div>
              <DropdownMenuSeparator />

              <DropdownMenuItem onClick={signOut}>
                <LogOut className="size-4" /> Log out
              </DropdownMenuItem>
              <DropdownMenuSeparator />

              {/* Gateway health, at a glance. */}
              <Link
                href="/"
                className={cn(
                  "flex items-center justify-between px-2 py-2 text-sm",
                  downCount === 0 ? "text-chart-1" : "text-destructive",
                )}
              >
                {downCount === 0
                  ? "All gateways operational."
                  : `${downCount} gateway${downCount === 1 ? "" : "s"} down.`}
                <span
                  className={cn(
                    "size-2.5 rounded-full",
                    downCount === 0 ? "bg-chart-1" : "bg-destructive",
                  )}
                />
              </Link>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* ---- Main ------------------------------------------------------- */}
      <div className="flex min-w-0 flex-1 flex-col md:pl-64">
        <header className="sticky top-0 z-30 flex h-12 items-center justify-center border-b bg-background/80 backdrop-blur">
          <span className="truncate px-4 text-sm font-medium">{pageTitle}</span>
        </header>
        <main className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-5xl px-4 py-8 md:px-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
