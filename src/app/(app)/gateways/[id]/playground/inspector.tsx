"use client";

import { CircleAlert, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  curlCommand,
  isFallback,
  resultError,
  tokenSummary,
  type PlaygroundEndpoint,
  type PlaygroundResult,
} from "./result";

export async function copyText(text: string, what = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(what);
  } catch {
    toast.error("Could not copy to the clipboard");
  }
}

const ms = (value: number) => (value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${Math.round(value)} ms`);

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm tabular-nums">{children}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: number | null }) {
  if (status === null) return <Badge variant="destructive">no response</Badge>;
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-mono",
        status < 300 && "border-success/40 text-success",
        status >= 400 && status < 500 && "border-warning/40 text-warning",
        status >= 500 && "border-destructive/40 text-destructive",
      )}
    >
      {status}
    </Badge>
  );
}

function CodeBlock({ text, copyLabel }: { text: string; copyLabel: string }) {
  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon-sm"
        className="absolute top-1.5 right-1.5"
        aria-label={copyLabel}
        onClick={() => void copyText(text)}
      >
        <Copy />
      </Button>
      <pre className="max-h-[28rem] overflow-auto rounded-md border bg-muted/40 p-3 pr-10 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">
        {text}
      </pre>
    </div>
  );
}

const pretty = (value: unknown) =>
  typeof value === "string" ? value : JSON.stringify(value, null, 2) ?? "";

/** What came back from the last call of a sub-tab. */
export function Inspector({
  endpoint,
  result,
  running,
  gatewayUrl,
}: {
  endpoint: PlaygroundEndpoint;
  result: PlaygroundResult | null;
  running: boolean;
  gatewayUrl: string;
}) {
  if (!result) {
    return (
      <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        {running ? (
          <span className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" /> Waiting for the gateway…
          </span>
        ) : (
          <>
            Send a request to see the status, latency, model used and tokens here.
            <br />
            Calls use this gateway&apos;s playground key and count toward its usage.
          </>
        )}
      </div>
    );
  }

  const error = resultError(result);
  const tokens = tokenSummary(result.body);
  const fallback = isFallback(result);
  const streamed = result.chunks !== undefined;

  return (
    <div className={cn("space-y-4 rounded-lg border p-4", running && "opacity-60")}>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Status">
          <StatusBadge status={result.status} />
          {error?.code && (
            <Badge variant="secondary" className="font-mono">
              {error.code}
            </Badge>
          )}
        </Stat>
        <Stat label="Latency">
          <span>{ms(result.latencyMs)}</span>
          {result.ttftMs !== undefined && (
            <span className="text-xs text-muted-foreground" title="Browser-measured, includes the console hop">
              TTFT (via console) {ms(result.ttftMs)}
            </span>
          )}
        </Stat>
        <Stat label="Model used">
          {result.modelUsed ? (
            <span className="truncate font-mono text-xs">{result.modelUsed}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
          {fallback && (
            <Badge
              variant="outline"
              className="border-warning/40 text-warning"
              title={`Requested ${result.requestedModel}`}
            >
              fallback
            </Badge>
          )}
        </Stat>
        <Stat label="Tokens">
          {tokens ? (
            <>
              <span>
                {tokens.input ?? "—"} in / {tokens.output ?? "—"} out
              </span>
              {tokens.searchUnits !== undefined && (
                <span className="text-xs text-muted-foreground">{tokens.searchUnits} search unit(s)</span>
              )}
              {tokens.estimated && <Badge variant="secondary">estimated</Badge>}
            </>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </Stat>
      </div>

      {result.aborted && (
        <p className="text-sm text-muted-foreground">Stopped. The partial reply is kept.</p>
      )}
      {error && (
        <Alert variant="destructive">
          <CircleAlert className="size-4" />
          <AlertTitle>
            {result.streamError
              ? "The stream failed after it started"
              : error.console
                ? "Console-side failure"
                : "The gateway returned an error"}
          </AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="response">
        <TabsList>
          <TabsTrigger value="request">Request</TabsTrigger>
          <TabsTrigger value="response">Response</TabsTrigger>
          <TabsTrigger value="curl">curl</TabsTrigger>
        </TabsList>
        <TabsContent value="request">
          {result.request === null ? (
            <p className="py-4 text-sm text-muted-foreground">GET request, no body.</p>
          ) : (
            <CodeBlock text={pretty(result.request)} copyLabel="Copy request" />
          )}
        </TabsContent>
        <TabsContent value="response" className="space-y-2">
          {streamed && (
            <p className="text-xs text-muted-foreground">
              Assembled from {result.chunks} stream chunk{result.chunks === 1 ? "" : "s"}.
            </p>
          )}
          <CodeBlock text={pretty(result.body)} copyLabel="Copy response" />
        </TabsContent>
        <TabsContent value="curl" className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Calls the gateway directly. Set <code className="font-mono">LUMEN_API_KEY</code> to one
            of your virtual keys.
          </p>
          <CodeBlock text={curlCommand(gatewayUrl, endpoint, result.request)} copyLabel="Copy curl" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
