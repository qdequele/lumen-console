import { NextRequest, NextResponse } from "next/server";
import { connectGateway } from "@/lib/server/gateways";
import {
  allModelIds,
  fetchConfig,
  modelFromBody,
  toRawProvider,
  validateModel,
  writeConfig,
} from "@/lib/server/config";
import { notFound, toErrorResponse } from "@/lib/server/respond";
import type { ModelBody } from "@/lib/types";

type Params = { params: Promise<{ id: string; name: string }> };

/** Add a model to a provider. Model ids are unique across ALL providers. */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id, name } = await params;
    const result = await connectGateway(id, { admin: true });
    if (!result) return notFound(`gateway "${id}"`);
    const body = (await request.json()) as ModelBody;

    const document = await fetchConfig(result.conn);
    const provider = document.providers.find((entry) => entry.name === name);
    if (!provider) return notFound(`provider "${name}"`);

    const model = modelFromBody(body);
    const existingIds = allModelIds(document.providers);
    if (existingIds.has(model.id)) {
      return NextResponse.json(
        { error: `model id "${model.id}" already exists on this gateway (ids are global)` },
        { status: 400 },
      );
    }
    const invalid = validateModel(model, existingIds);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

    provider.models.push(model);
    document.root.providers = document.providers.map(toRawProvider);
    await writeConfig(result.conn, document);
    return NextResponse.json(model, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
