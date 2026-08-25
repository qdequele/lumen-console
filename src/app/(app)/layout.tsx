import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";

export default function AppLayout({ children }: LayoutProps<"/">) {
  // Suspense: AppShell reads the URL search params (active gateway tab).
  return (
    <Suspense>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
