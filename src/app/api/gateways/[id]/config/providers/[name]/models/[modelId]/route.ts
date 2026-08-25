import { NextRequest, NextResponse } from "next/server";
import { connectGateway } from "@/lib/server/gateways";
import {
  allModelIds,
  fetchConfig,
  toRawProvider,
  validateModel,
  writeConfig,
} from "@/lib/server/config";
import { notFound, toErrorResponse } from "@/lib/server/respond";
import type { ModelBody, ModelConfig } from "@/lib/types";

type Params = { params: Promise<{ id: string; name: string; modelId: string }> };

/**
 * Replace a model definition. The model id itself can change; every
 * fallback chain referencing the old id is rewritten to the new one, so a
 * rename never silently breaks resilience routing.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id, name, modelId } = await params;
    const result = await connectGateway(id, { admin: true });
    if (!result) return notFound(`gateway "${id}"`);
    const body = (await request.json()) as Partial<ModelBody>;

    const document = await fetchConfig(result.conn);
    const provider = document.providers.find((entry) => entry.name === name);
    if (!provider) return notFound(`provider "${name}"`);
    const index = provider.models.findIndex((entry) => entry.id === modelId);
    if (index === -1) return notFound(`model "${modelId}" on provider "${name}"`);
    const current = provider.models[index];

    const updated: ModelConfig = {
      id: body.id?.trim() || current.id,
      upstream_id:
        body.upstream_id !== undefined
          ? body.upstream_id.trim() || undefined
          : current.upstream_id,
      capabilities: body.capabilities ?? current.capabilities,
      modalities: body.modalities ?? current.modalities,
      cost_per_1m_input:
        body.cost_per_1m_input !== undefined ? body.cost_per_1m_input : current.cost_per_1m_input,
      cost_per_1m_output:
        body.cost_per_1m_output !== undefined
          ? body.cost_per_1m_output
          : current.cost_per_1m_output,
      fallbacks: body.fallbacks ?? current.fallbacks,
    };

    const otherIds = allModelIds(document.providers);
    otherIds.delete(modelId);
    if (otherIds.has(updated.id)) {
      return NextResponse.json(
        { error: `model id "${updated.id}" already exists on this gateway (ids are global)` },
        { status: 400 },
      );
    }
    const invalid = validateModel(updated, new Set([...otherIds, updated.id]));
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

    provider.models[index] = updated;
    if (updated.id !== modelId) {
      for (const anyProvider of document.providers) {
        for (const model of anyProvider.models) {
          model.fallbacks = model.fallbacks?.map((fallback) =>
            fallback === modelId ? updated.id : fallback,
          );
        }
      }
    }
    document.root.providers = document.providers.map(toRawProvider);
    await writeConfig(result.conn, document);
    return NextResponse.json(updated);
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** Remove a model. Refused while any fallback chain still references it. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id, name, modelId } = await params;
    const result = await connectGateway(id, { admin: true });
    if (!result) return notFound(`gateway "${id}"`);

    const document = await fetchConfig(result.conn);
    const provider = document.providers.find((entry) => entry.name === name);
    if (!provider) return notFound(`provider "${name}"`);
    if (!provider.models.some((entry) => entry.id === modelId)) {
      return notFound(`model "${modelId}" on provider "${name}"`);
    }

    for (const anyProvider of document.providers) {
      for (const model of anyProvider.models) {
        if (model.id !== modelId && (model.fallbacks ?? []).includes(modelId)) {
          return NextResponse.json(
            {
              error: `model "${model.id}" (provider "${anyProvider.name}") falls back to "${modelId}"; update its fallbacks first`,
            },
            { status: 400 },
          );
        }
      }
    }

    provider.models = provider.models.filter((entry) => entry.id !== modelId);
    document.root.providers = document.providers.map(toRawProvider);
    await writeConfig(result.conn, document);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
