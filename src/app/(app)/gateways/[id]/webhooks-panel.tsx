"use client";

import { useMemo, useState } from "react";
import { ChevronRight, CircleAlert, FileCog, RefreshCw, ShieldCheck } from "lucide-react";
import { ApiError } from "@/lib/api";
import {
  useDeleteWebhooks,
  useDeleteWebhookSigningKey,
  usePutWebhooks,
  usePutWebhookSigningKey,
  useWebhooks,
} from "@/lib/hooks";
import { validateWebhookSettings, WEBHOOK_DEFAULTS, WEBHOOK_EVENTS } from "@/lib/webhooks";
import type { WebhookConfigInfo, WebhookEventKind, WebhookSettings } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

/** Same section chrome as the Settings panel: fields above, hint + action below. */
function PanelCard({
  title,
  description,
  hint,
  saveLabel = "Save",
  saveDisabled,
  pending,
  destructive = false,
  onSave,
  children,
}: {
  title: string;
  description: React.ReactNode;
  hint: React.ReactNode;
  saveLabel?: string;
  saveDisabled: boolean;
  pending: boolean;
  destructive?: boolean;
  onSave: () => void;
  children?: React.ReactNode;
}) {
  return (
    <section className={`rounded-lg border ${destructive ? "border-destructive/50" : ""}`}>
      <div className="space-y-4 px-5 py-4">
        <div>
          <h2 className="text-sm font-medium">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        {children}
      </div>
      <div
        className={`flex items-center justify-between gap-3 rounded-b-lg border-t px-5 py-3 ${
          destructive ? "border-destructive/50 bg-destructive/5" : "bg-muted/50"
        }`}
      >
        <p className="text-xs text-muted-foreground">{hint}</p>
        <Button
          size="sm"
          variant={destructive ? "destructive" : "default"}
          disabled={saveDisabled || pending}
          onClick={onSave}
        >
          {pending ? "…" : saveLabel}
        </Button>
      </div>
    </section>
  );
}

function SourceBadge({ info }: { info: WebhookConfigInfo }) {
  if (!info.enabled) return <Badge variant="secondary">not configured</Badge>;
  return info.source === "config" ? (
    <Badge variant="outline">
      <FileCog className="size-3" /> from config file
    </Badge>
  ) : (
    <Badge variant="secondary">managed by the console</Badge>
  );
}

/** "50, 80, 95" → [50, 80, 95]; null when a token is not a number. */
function parseThresholds(text: string): number[] | null {
  const tokens = text
    .split(/[,\s]+/)
    .map((token) => token.trim())
    .filter(Boolean);
  const values = tokens.map(Number);
  return values.some(Number.isNaN) ? null : values;
}

function parseCount(text: string): number {
  const value = Number(text.trim());
  return Number.isFinite(value) ? value : NaN;
}

function NumberField({
  id,
  label,
  unit,
  value,
  onChange,
}: {
  id: string;
  label: string;
  unit?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {unit && <span className="ml-1 text-xs text-muted-foreground">({unit})</span>}
      </Label>
      <Input
        id={id}
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

/**
 * The receiver form. PUT /admin/webhooks replaces EVERY setting, so this form
 * always submits the full document, seeded from the last GET — a partial
 * submit would silently reset the omitted fields to their defaults. The
 * parent remounts it (via `key`) whenever the server state changes.
 */
function ReceiverCard({
  info,
  pending,
  onSubmit,
}: {
  info: WebhookConfigInfo;
  pending: boolean;
  onSubmit: (settings: WebhookSettings) => void;
}) {
  const initial: WebhookSettings = useMemo(
    () => info.settings ?? { url: "", ...WEBHOOK_DEFAULTS },
    [info.settings],
  );

  const [url, setUrl] = useState(initial.url);
  const [events, setEvents] = useState<WebhookEventKind[]>(initial.events);
  const [thresholdsText, setThresholdsText] = useState(initial.thresholds.join(", "));
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [timeoutMs, setTimeoutMs] = useState(String(initial.timeout_ms));
  const [maxAttempts, setMaxAttempts] = useState(String(initial.max_attempts));
  const [retryBaseMs, setRetryBaseMs] = useState(String(initial.retry_base_ms));
  const [channelCapacity, setChannelCapacity] = useState(String(initial.channel_capacity));
  const [confirmOverride, setConfirmOverride] = useState(false);

  const wantsThresholds = events.includes("budget.threshold");

  const candidate: WebhookSettings | null = useMemo(() => {
    const thresholds = parseThresholds(thresholdsText);
    if (thresholds === null) return null;
    return {
      url: url.trim(),
      // Preserved verbatim: the env-var reference is not editable here, and
      // dropping it on submit would silently un-reference the gateway's env key.
      signing_key_env: initial.signing_key_env,
      events,
      thresholds,
      timeout_ms: parseCount(timeoutMs),
      max_attempts: parseCount(maxAttempts),
      retry_base_ms: parseCount(retryBaseMs),
      channel_capacity: parseCount(channelCapacity),
    };
  }, [
    url,
    events,
    thresholdsText,
    timeoutMs,
    maxAttempts,
    retryBaseMs,
    channelCapacity,
    initial.signing_key_env,
  ]);

  const problem =
    candidate === null
      ? "thresholds must be whole percentages between 1 and 100"
      : validateWebhookSettings(candidate);
  // Field-order-independent equality: the server may serialize keys in any order.
  const fingerprint = (settings: WebhookSettings) =>
    JSON.stringify([
      settings.url,
      settings.signing_key_env,
      settings.events,
      settings.thresholds,
      settings.timeout_ms,
      settings.max_attempts,
      settings.retry_base_ms,
      settings.channel_capacity,
    ]);
  const dirty = candidate === null || fingerprint(candidate) !== fingerprint(initial);

  const toggleEvent = (kind: WebhookEventKind, checked: boolean) => {
    setEvents((current) =>
      checked
        ? WEBHOOK_EVENTS.map((event) => event.kind).filter(
            (candidateKind) => current.includes(candidateKind) || candidateKind === kind,
          )
        : current.filter((candidateKind) => candidateKind !== kind),
    );
  };

  const submit = () => {
    if (!candidate || problem) return;
    // A PUT makes the stored row win over the gateway's [webhooks] config
    // block from then on — surface that before the first write, not after.
    if (info.enabled && info.source === "config" && !confirmOverride) {
      setConfirmOverride(true);
      return;
    }
    setConfirmOverride(false);
    onSubmit(candidate);
  };

  return (
    <PanelCard
      title="Receiver"
      description={
        <>
          Where this gateway POSTs budget and key lifecycle events. Applied immediately —
          every save replaces the whole configuration.
        </>
      }
      hint={
        info.enabled && info.source === "config" ? (
          <>
            Currently from the gateway&apos;s config file — saving here takes precedence over
            it, persistently.
          </>
        ) : problem && (url.trim() !== "" || info.enabled) ? (
          <span className="text-destructive">{problem}</span>
        ) : (
          <>All settings are runtime-editable; no gateway restart involved.</>
        )
      }
      saveLabel={info.enabled ? "Save" : "Enable webhooks"}
      saveDisabled={(!dirty && info.enabled) || problem !== null}
      pending={pending}
      onSave={submit}
    >
      <div className="space-y-2 sm:max-w-md">
        <Label htmlFor="webhook-url">Receiver URL</Label>
        <Input
          id="webhook-url"
          className="font-mono text-sm"
          placeholder="https://backend.example.com/lumen/events"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label>Events</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {WEBHOOK_EVENTS.map((event) => (
            <label
              key={event.kind}
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-md border p-3 transition-colors",
                events.includes(event.kind) ? "border-primary/50 bg-accent/40" : "hover:bg-accent/30",
              )}
            >
              <Checkbox
                className="mt-0.5"
                checked={events.includes(event.kind)}
                onCheckedChange={(checked) => toggleEvent(event.kind, checked === true)}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{event.label}</span>
                <span className="block font-mono text-[11px] text-muted-foreground">
                  {event.kind}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {event.description}
                </span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {wantsThresholds && (
        <div className="space-y-2 sm:max-w-md">
          <Label htmlFor="webhook-thresholds">Thresholds</Label>
          <Input
            id="webhook-thresholds"
            className="font-mono text-sm"
            placeholder="50, 80, 95"
            value={thresholdsText}
            onChange={(event) => setThresholdsText(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Budget percentages (1–100) at which <code>budget.threshold</code> fires, e.g.{" "}
            <code>50, 80, 95</code>.
          </p>
        </div>
      )}

      <div>
        <button
          type="button"
          className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          aria-expanded={advancedOpen}
          onClick={() => setAdvancedOpen((open) => !open)}
        >
          <ChevronRight className={cn("size-4 transition-transform", advancedOpen && "rotate-90")} />
          Advanced delivery
        </button>
        {advancedOpen && (
          <div className="mt-3 grid gap-3 sm:max-w-lg sm:grid-cols-2">
            <NumberField
              id="webhook-timeout"
              label="Timeout"
              unit="ms"
              value={timeoutMs}
              onChange={setTimeoutMs}
            />
            <NumberField
              id="webhook-attempts"
              label="Max attempts"
              value={maxAttempts}
              onChange={setMaxAttempts}
            />
            <NumberField
              id="webhook-retry"
              label="Retry base delay"
              unit="ms"
              value={retryBaseMs}
              onChange={setRetryBaseMs}
            />
            <NumberField
              id="webhook-capacity"
              label="Queue capacity"
              unit="events"
              value={channelCapacity}
              onChange={setChannelCapacity}
            />
          </div>
        )}
      </div>

      <Dialog open={confirmOverride} onOpenChange={setConfirmOverride}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Take over the config file&apos;s webhook settings?</DialogTitle>
            <DialogDescription>
              These settings currently come from the <code>[webhooks]</code> block in the
              gateway&apos;s config file. Saving from the console stores them in the
              gateway&apos;s database, which takes precedence from then on — the file&apos;s
              block becomes decorative, including across reloads. Keep managing it via GitOps
              instead if that matters to you.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOverride(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setConfirmOverride(false);
                if (candidate && !problem) onSubmit(candidate);
              }}
            >
              Save and take over
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PanelCard>
  );
}

/**
 * Write-only signing secret. The value is never returned by any route, so
 * this always renders empty — `signed` / `signing_key_stored` are the only
 * readable state. "Generate" mints one client-side and shows it once, since
 * the operator has to paste the same secret into their receiver.
 */
function SigningCard({
  info,
  putPending,
  deletePending,
  onStore,
  onForget,
}: {
  info: WebhookConfigInfo;
  putPending: boolean;
  deletePending: boolean;
  onStore: (secret: string, done: () => void) => void;
  onForget: () => void;
}) {
  const [secret, setSecret] = useState("");
  const [generated, setGenerated] = useState(false);

  const generate = () => {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    setSecret(
      `whsec_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`,
    );
    setGenerated(true);
  };

  return (
    <PanelCard
      title="Signing secret"
      description="HMAC secret the gateway signs deliveries with, sealed at rest. Your receiver needs the same secret to verify signatures."
      hint={
        generated && secret !== ""
          ? "Copy the generated secret into your receiver before storing — it is shown only now."
          : "The stored value is never shown again; to change it, store a new one."
      }
      saveLabel={info.signing_key_stored ? "Rotate secret" : "Store secret"}
      saveDisabled={secret.trim() === ""}
      pending={putPending}
      onSave={() =>
        onStore(secret.trim(), () => {
          setSecret("");
          setGenerated(false);
        })
      }
    >
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {info.signed ? (
          <Badge variant="secondary">
            <ShieldCheck className="size-3" /> deliveries signed
          </Badge>
        ) : (
          <Badge variant="outline">deliveries unsigned</Badge>
        )}
        {info.signing_key_stored && <Badge variant="outline">secret stored on gateway</Badge>}
        {info.settings?.signing_key_env && (
          <Badge variant="outline">
            env: <code>{info.settings.signing_key_env}</code>
          </Badge>
        )}
      </div>
      <div className="space-y-2 sm:max-w-md">
        <Label htmlFor="webhook-secret">
          {info.signing_key_stored ? "New secret" : "Secret"}
        </Label>
        <div className="flex gap-2">
          <Input
            id="webhook-secret"
            type={generated ? "text" : "password"}
            autoComplete="off"
            className="font-mono text-sm"
            value={secret}
            onChange={(event) => {
              setSecret(event.target.value);
              setGenerated(false);
            }}
          />
          <Button type="button" variant="outline" onClick={generate}>
            <RefreshCw className="size-4" /> Generate
          </Button>
        </div>
        {info.signing_key_stored && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            disabled={deletePending}
            onClick={onForget}
          >
            {deletePending ? "…" : "Forget the stored secret"}
          </Button>
        )}
      </div>
    </PanelCard>
  );
}

/** What a viewer sees: the live configuration, read-only (it carries no secret). */
function ReadOnlyView({ info }: { info: WebhookConfigInfo }) {
  if (!info.enabled) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-16 text-center">
        <p className="text-sm font-medium">No webhook receiver configured</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Configuring one requires the admin role on this gateway&apos;s team.
        </p>
      </div>
    );
  }
  const settings = info.settings;
  return (
    <section className="rounded-lg border">
      <div className="flex items-center gap-2 border-b px-5 py-3.5">
        <h2 className="text-sm font-medium">Receiver</h2>
        <SourceBadge info={info} />
        {info.signed && (
          <Badge variant="secondary">
            <ShieldCheck className="size-3" /> signed
          </Badge>
        )}
      </div>
      <dl className="grid gap-x-8 gap-y-3 px-5 py-4 text-sm sm:grid-cols-[max-content_1fr]">
        <dt className="text-muted-foreground">URL</dt>
        <dd className="font-mono">{settings?.url}</dd>
        <dt className="text-muted-foreground">Events</dt>
        <dd className="flex flex-wrap gap-1">
          {settings?.events.map((event) => (
            <Badge key={event} variant="outline">
              {event}
            </Badge>
          ))}
        </dd>
        <dt className="text-muted-foreground">Thresholds</dt>
        <dd className="font-mono">
          {settings && settings.thresholds.length > 0
            ? settings.thresholds.map((threshold) => `${threshold}%`).join(", ")
            : "—"}
        </dd>
        <dt className="text-muted-foreground">Delivery</dt>
        <dd className="text-muted-foreground">
          {settings?.timeout_ms} ms timeout · {settings?.max_attempts} attempts ·{" "}
          {settings?.retry_base_ms} ms retry base · queue {settings?.channel_capacity}
        </dd>
      </dl>
    </section>
  );
}

export function WebhooksPanel({
  gatewayId,
  canAdmin,
}: {
  gatewayId: string;
  canAdmin: boolean;
}) {
  const webhooks = useWebhooks(gatewayId);
  const putWebhooks = usePutWebhooks(gatewayId);
  const deleteWebhooks = useDeleteWebhooks(gatewayId);
  const putSigningKey = usePutWebhookSigningKey(gatewayId);
  const deleteSigningKey = useDeleteWebhookSigningKey(gatewayId);

  if (webhooks.isLoading) {
    return <Skeleton className="h-96 rounded-lg" />;
  }

  if (webhooks.isError) {
    const error = webhooks.error;
    if (error instanceof ApiError && error.status === 501) {
      return (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-16 text-center">
          <p className="text-sm font-medium">This gateway needs an upgrade</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Outbound budget webhooks (Lumen ADR 011) are not available on this gateway version
            — it does not expose <code>/admin/webhooks</code>. Upgrade the gateway to manage
            webhooks from the console; until then, the <code>[webhooks]</code> config file
            block still works.
          </p>
        </div>
      );
    }
    return (
      <Alert variant="destructive">
        <CircleAlert className="size-4" />
        <AlertTitle>Could not load the webhook configuration</AlertTitle>
        <AlertDescription>{(error as Error).message}</AlertDescription>
      </Alert>
    );
  }

  const info = webhooks.data;
  if (!info) return null;

  if (!canAdmin) {
    return (
      <div className="space-y-4">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Where this gateway POSTs <code>budget.*</code> and <code>key.*</code> events, so a
          billing backend can top budgets up before customers hit a 402.
        </p>
        <ReadOnlyView info={info} />
      </div>
    );
  }

  // Remount the form whenever the server state changes (save, delete, another
  // operator's edit) so it reseeds; identical refetches keep edits intact.
  const formKey = JSON.stringify([info.enabled, info.source, info.settings]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Where this gateway POSTs <code>budget.*</code> and <code>key.*</code> events, so a
          billing backend can top budgets up before customers hit a 402. One receiver per
          gateway; the gateway is the source of truth.
        </p>
        <SourceBadge info={info} />
      </div>

      <ReceiverCard
        key={formKey}
        info={info}
        pending={putWebhooks.isPending}
        onSubmit={(settings) => putWebhooks.mutate(settings)}
      />

      <SigningCard
        info={info}
        putPending={putSigningKey.isPending}
        deletePending={deleteSigningKey.isPending}
        onStore={(secret, done) => putSigningKey.mutate(secret, { onSuccess: done })}
        onForget={() => deleteSigningKey.mutate()}
      />

      {info.enabled && (
        <PanelCard
          title="Disable webhooks"
          description="Stops emitting events, persistently — a gateway reload does not re-enable them, and a config file [webhooks] block stays overridden."
          hint="The stored signing secret is kept; forget it above if it should go too."
          saveLabel="Disable"
          saveDisabled={false}
          pending={deleteWebhooks.isPending}
          destructive
          onSave={() => deleteWebhooks.mutate()}
        />
      )}
    </div>
  );
}
