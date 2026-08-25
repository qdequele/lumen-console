import { NextRequest, NextResponse } from "next/server";
import { connectGateway } from "@/lib/server/gateways";
import { fetchConfig, toRawProvider, writeConfig } from "@/lib/server/config";
import { notFound, toErrorResponse } from "@/lib/server/respond";
import type { NewProviderBody, ProviderConfig } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

/**
 * Add a provider (with no models yet). Read-modify-write against the
 * gateway config under the If-Match hash, so a concurrent edit fails with
 * 409 instead of being overwritten.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const result = await connectGateway(id, { admin: true });
    if (!result) return notFound(`gateway "${id}"`);
    const body = (await request.json()) as NewProviderBody;
    if (!body.name?.trim() || !body.kind?.trim()) {
      return NextResponse.json({ error: "`name` and `kind` are required" }, { status: 400 });
    }
    if (body.base_url && !/^https?:\/\//.test(body.base_url)) {
      return NextResponse.json({ error: "`base_url` must be http(s)" }, { status: 400 });
    }

    const document = await fetchConfig(result.conn);
    const name = body.name.trim();
    if (document.providers.some((provider) => provider.name === name)) {
      return NextResponse.json(
        { error: `a provider named "${name}" already exists on this gateway` },
        { status: 400 },
      );
    }
    const provider: ProviderConfig = {
      name,
      kind: body.kind.trim(),
      api_key_env: body.api_key_env?.trim() || undefined,
      base_url: body.base_url?.trim().replace(/\/+$/, "") || undefined,
      models: [],
    };
    document.root.providers = [
      ...document.providers.map(toRawProvider),
      toRawProvider(provider),
    ];
    await writeConfig(result.conn, document);
    return NextResponse.json(provider, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
