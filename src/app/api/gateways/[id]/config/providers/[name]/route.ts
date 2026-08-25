import { NextRequest, NextResponse } from "next/server";
import { connectGateway } from "@/lib/server/gateways";
import { fetchConfig, toRawProvider, writeConfig } from "@/lib/server/config";
import { notFound, toErrorResponse } from "@/lib/server/respond";
import type { ProviderPatchBody } from "@/lib/types";

type Params = { params: Promise<{ id: string; name: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id, name } = await params;
    const result = await connectGateway(id, { admin: true });
    if (!result) return notFound(`gateway "${id}"`);
    const body = (await request.json()) as ProviderPatchBody;
    if (body.base_url && !/^https?:\/\//.test(body.base_url)) {
      return NextResponse.json({ error: "`base_url` must be http(s)" }, { status: 400 });
    }

    const document = await fetchConfig(result.conn);
    const provider = document.providers.find((entry) => entry.name === name);
    if (!provider) return notFound(`provider "${name}"`);

    if (body.kind?.trim()) provider.kind = body.kind.trim();
    // Explicit null clears the field; absent leaves it untouched.
    if (body.api_key_env !== undefined) {
      provider.api_key_env = body.api_key_env?.trim() || undefined;
    }
    if (body.base_url !== undefined) {
      provider.base_url = body.base_url?.trim().replace(/\/+$/, "") || undefined;
    }

    document.root.providers = document.providers.map(toRawProvider);
    await writeConfig(result.conn, document);
    return NextResponse.json(provider);
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * Remove a provider and all its models. Refused while another provider's
 * fallback chain still references one of its models — silently breaking a
 * fallback chain would be worse than this 400.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id, name } = await params;
    const result = await connectGateway(id, { admin: true });
    if (!result) return notFound(`gateway "${id}"`);

    const document = await fetchConfig(result.conn);
    const provider = document.providers.find((entry) => entry.name === name);
    if (!provider) return notFound(`provider "${name}"`);

    const removedIds = new Set(provider.models.map((model) => model.id));
    for (const other of document.providers) {
      if (other.name === name) continue;
      for (const model of other.models) {
        const broken = (model.fallbacks ?? []).find((fallback) => removedIds.has(fallback));
        if (broken) {
          return NextResponse.json(
            {
              error: `model "${model.id}" (provider "${other.name}") falls back to "${broken}"; update its fallbacks first`,
            },
            { status: 400 },
          );
        }
      }
    }

    document.root.providers = document.providers
      .filter((entry) => entry.name !== name)
      .map(toRawProvider);
    await writeConfig(result.conn, document);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
