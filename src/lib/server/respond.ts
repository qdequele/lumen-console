import "server-only";
import { NextResponse } from "next/server";
import { LumenError } from "@/lib/server/lumen";
import { ForbiddenError, UnauthorizedError } from "@/lib/server/role";

export interface ApiErrorBody {
  error: string;
  code?: string;
}

/** Map route failures to a JSON envelope the client hooks understand. */
export function toErrorResponse(error: unknown): NextResponse<ApiErrorBody> {
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof LumenError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : "internal error";
  return NextResponse.json({ error: message }, { status: 500 });
}

export function notFound(what: string): NextResponse<ApiErrorBody> {
  return NextResponse.json({ error: `unknown ${what}` }, { status: 404 });
}
