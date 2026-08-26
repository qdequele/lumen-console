import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { listGatewaysForUser } from "@/lib/server/gateways";
import { Onboarding } from "./onboarding";

/**
 * There is no home page: the console is gateway-first. `/` sends you to the
 * gateway you visited last (cookie set by the gateway page), falling back
 * to the first registered one. Only an account with no gateway at all sees
 * a page here — the onboarding steps.
 */
export default async function HomePage() {
  const gateways = await listGatewaysForUser();
  if (gateways.length > 0) {
    const last = (await cookies()).get("lumen-last-gateway")?.value;
    const target = gateways.find((gateway) => gateway.id === last) ?? gateways[0];
    redirect(`/gateways/${target.id}`);
  }
  return <Onboarding />;
}
