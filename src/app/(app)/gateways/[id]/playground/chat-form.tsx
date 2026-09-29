"use client";

import { useState } from "react";
import { Eraser, Send, Square, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { streamChat, useInvalidateUsage, usePlaygroundCall } from "./client";
import { ModelSelect } from "./model-select";
import { buildChatRequest } from "./requests";
import { playgroundState, usePlaygroundForm, type ChatTurn } from "./store";

/**
 * In-flight calls, by gateway: outlives the form so Stop still works after
 * switching sub-tabs and back.
 */
const controllers = new Map<string, AbortController>();

function appendToLast(turns: ChatTurn[], text: string): ChatTurn[] {
  const last = turns.at(-1);
  if (!last || last.role !== "assistant") return turns;
  return [...turns.slice(0, -1), { ...last, content: last.content + text }];
}

interface ChatCompletion {
  choices?: { message?: { content?: string | null } }[];
}

function useChatSession(gatewayId: string) {
  const [, patch] = usePlaygroundForm(gatewayId, "chat");
  const call = usePlaygroundCall(gatewayId, "chat/completions");
  const invalidateUsage = useInvalidateUsage(gatewayId);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function send() {
    const chat = playgroundState(gatewayId).chat;
    const draft = chat.draft;
    if (chat.running || !draft.trim()) return;
    const turns: ChatTurn[] = [...chat.turns, { role: "user", content: draft }];
    const built = buildChatRequest(chat, turns);
    if ("errors" in built) {
      setErrors(built.errors);
      return;
    }
    setErrors({});
    const controller = new AbortController();
    controllers.set(gatewayId, controller);
    patch({ turns, draft: "", running: true });

    // Whether anything came back worth keeping in the conversation.
    let gotReply = false;
    let result;
    if (built.request.stream) {
      patch((previous) => ({ turns: [...previous.turns, { role: "assistant", content: "" }] }));
      result = await streamChat(gatewayId, built.request, {
        signal: controller.signal,
        onDelta: (text) => patch((previous) => ({ turns: appendToLast(previous.turns, text) })),
      });
      gotReply = Boolean((result.body as { message?: { content?: string } } | null)?.message?.content);
      invalidateUsage();
    } else {
      result = await call.mutateAsync({ request: built.request, signal: controller.signal });
      if (result.status !== null && result.status < 300) {
        const content = (result.body as ChatCompletion | null)?.choices?.[0]?.message?.content ?? "";
        patch((previous) => ({ turns: [...previous.turns, { role: "assistant", content }] }));
        gotReply = true;
      }
    }
    controllers.delete(gatewayId);

    patch((previous) =>
      gotReply
        ? { running: false, result }
        : {
            // Nothing came back: drop the message (and the empty reply) and
            // put it back in the composer, so a retry is one click.
            running: false,
            result,
            turns: previous.turns.slice(0, turns.length - 1),
            draft: previous.draft || draft,
          },
    );
  }

  return { send, stop: () => controllers.get(gatewayId)?.abort(), errors };
}

export function ChatForm({ gatewayId }: { gatewayId: string }) {
  const [chat, patch] = usePlaygroundForm(gatewayId, "chat");
  const { send, stop, errors } = useChatSession(gatewayId);
  const lastIndex = chat.turns.length - 1;

  return (
    <div className="space-y-4">
      <ModelSelect
        gatewayId={gatewayId}
        capability="chat"
        value={chat.model}
        onChange={(model) => patch({ model })}
        error={errors.model}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="col-span-2 flex items-center gap-2 sm:col-span-1 sm:pt-6">
          <Switch
            id="chat-stream"
            checked={chat.stream}
            onCheckedChange={(stream) => patch({ stream })}
            disabled={chat.running}
          />
          <Label htmlFor="chat-stream">Stream</Label>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="chat-temperature">Temperature</Label>
          <Input
            id="chat-temperature"
            inputMode="decimal"
            placeholder="default"
            value={chat.temperature}
            onChange={(event) => patch({ temperature: event.target.value })}
            aria-invalid={Boolean(errors.temperature)}
          />
          {errors.temperature && <p className="text-xs text-destructive">{errors.temperature}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="chat-max-tokens">Max tokens</Label>
          <Input
            id="chat-max-tokens"
            inputMode="numeric"
            placeholder="default"
            value={chat.maxTokens}
            onChange={(event) => patch({ maxTokens: event.target.value })}
            aria-invalid={Boolean(errors.maxTokens)}
          />
          {errors.maxTokens && <p className="text-xs text-destructive">{errors.maxTokens}</p>}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="chat-system">System prompt</Label>
        <Textarea
          id="chat-system"
          rows={2}
          placeholder="Optional"
          value={chat.system}
          onChange={(event) => patch({ system: event.target.value })}
        />
      </div>

      <div className="rounded-lg border">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-medium">Conversation</p>
          <Button
            variant="ghost"
            size="xs"
            disabled={chat.running || chat.turns.length === 0}
            onClick={() => patch({ turns: [], result: null })}
          >
            <Eraser /> Clear
          </Button>
        </div>
        {chat.turns.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            No messages yet. Follow-ups send the whole conversation.
          </p>
        ) : (
          <ol className="max-h-[28rem] divide-y overflow-y-auto">
            {chat.turns.map((turn, index) => {
              const streaming = chat.running && index === lastIndex && turn.role === "assistant";
              return (
                <li key={index} className="group flex gap-3 px-3 py-2.5">
                  <span
                    className={cn(
                      "w-16 shrink-0 pt-0.5 text-xs font-medium uppercase tracking-wide",
                      turn.role === "user" ? "text-muted-foreground" : "text-primary",
                    )}
                  >
                    {turn.role}
                  </span>
                  <p className="min-w-0 flex-1 text-sm whitespace-pre-wrap break-words">
                    {turn.content}
                    {streaming && (
                      <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-foreground/60 align-text-bottom" />
                    )}
                  </p>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    aria-label={`Remove ${turn.role} message`}
                    disabled={chat.running}
                    onClick={() =>
                      patch((previous) => ({
                        turns: previous.turns.filter((_, position) => position !== index),
                      }))
                    }
                  >
                    <X />
                  </Button>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <Label htmlFor="chat-draft" className="sr-only">
          Message
        </Label>
        <Textarea
          id="chat-draft"
          rows={3}
          placeholder="Write a message…"
          value={chat.draft}
          onChange={(event) => patch({ draft: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">⌘/Ctrl + Enter to send</p>
          {chat.running ? (
            <Button type="button" variant="secondary" onClick={stop}>
              <Square /> Stop
            </Button>
          ) : (
            <Button type="submit" disabled={!chat.draft.trim()}>
              <Send /> Send
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
