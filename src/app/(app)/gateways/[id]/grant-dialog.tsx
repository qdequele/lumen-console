"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
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

interface GrantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetName: string;
  pending: boolean;
  onGrant: (amount: number) => void;
}

/** Atomic budget top-up (POST .../grant): raises the cap by `amount` USD. */
export function GrantDialog({ open, onOpenChange, targetName, pending, onGrant }: GrantDialogProps) {
  const [amount, setAmount] = useState("");
  const parsed = Number(amount);
  const valid = Number.isFinite(parsed) && parsed > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setAmount("");
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Grant budget to “{targetName}”</DialogTitle>
          <DialogDescription>
            Atomically raises the budget cap — concurrent top-ups never lose an update. Requires
            an existing cap.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="grant-amount">Amount (USD)</Label>
          <Input
            id="grant-amount"
            inputMode="decimal"
            placeholder="25"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </div>
        <DialogFooter>
          <Button disabled={!valid || pending} onClick={() => onGrant(parsed)}>
            {pending ? "Granting…" : "Grant"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
