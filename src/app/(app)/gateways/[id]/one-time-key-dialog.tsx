"use client";

import { useState } from "react";
import { Check, Copy, TriangleAlert } from "lucide-react";
import type { CreatedKey } from "@/lib/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Shows a freshly minted plaintext key exactly once (creation or rotation).
 * The plaintext exists only in this dialog's state — closing it is final,
 * mirroring the gateway's one-time-plaintext contract.
 */
export function OneTimeKeyDialog({
  created,
  onClose,
}: {
  created: CreatedKey | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(created?.key ?? "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={created !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Key for “{created?.name}”</DialogTitle>
          <DialogDescription>
            This is the only time the plaintext is shown — the gateway stores a hash and the
            console stores nothing.
          </DialogDescription>
        </DialogHeader>
        <Alert>
          <TriangleAlert className="size-4" />
          <AlertTitle>Copy it now</AlertTitle>
          <AlertDescription>Once this dialog closes, the key cannot be recovered.</AlertDescription>
        </Alert>
        <div className="flex items-center gap-2">
          <code className="flex-1 overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-sm">
            {created?.key}
          </code>
          <Button variant="outline" size="icon" onClick={copy} aria-label="Copy key">
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>I stored it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
