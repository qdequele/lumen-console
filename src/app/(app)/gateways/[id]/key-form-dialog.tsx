"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { GroupRecord, KeyPatchBody, NewKeyBody, VirtualKeyRecord } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NO_GROUP = "__none__";

const optionalNumber = (message: string) =>
  z
    .string()
    .trim()
    .refine(
      (value) => value === "" || (Number.isFinite(Number(value)) && Number(value) > 0),
      { message },
    );

const formSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  group_id: z.string(),
  budget_max: optionalNumber("Budget must be a positive number"),
  rpm_limit: optionalNumber("RPM must be a positive number"),
  tpm_limit: optionalNumber("TPM must be a positive number"),
  expires_at: z.string(),
});

type FormValues = z.infer<typeof formSchema>;

function toNullableNumber(value: string): number | null {
  return value.trim() === "" ? null : Number(value);
}

function toUnix(datetimeLocal: string): number | null {
  if (!datetimeLocal) return null;
  const timestamp = new Date(datetimeLocal).getTime();
  return Number.isNaN(timestamp) ? null : Math.floor(timestamp / 1000);
}

function toDatetimeLocal(unix: number | null): string {
  if (unix === null) return "";
  const date = new Date(unix * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

interface KeyFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: GroupRecord[];
  /** Present when editing; absent when creating. */
  existing?: VirtualKeyRecord;
  pending: boolean;
  onSubmit: (body: NewKeyBody & KeyPatchBody) => void;
}

export function KeyFormDialog({
  open,
  onOpenChange,
  groups,
  existing,
  pending,
  onSubmit,
}: KeyFormDialogProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      group_id: NO_GROUP,
      budget_max: "",
      rpm_limit: "",
      tpm_limit: "",
      expires_at: "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: existing?.name ?? "",
        group_id: existing?.group_id ?? NO_GROUP,
        budget_max: existing?.budget_max?.toString() ?? "",
        rpm_limit: existing?.rpm_limit?.toString() ?? "",
        tpm_limit: existing?.tpm_limit?.toString() ?? "",
        expires_at: toDatetimeLocal(existing?.expires_at ?? null),
      });
    }
  }, [open, existing, form]);

  const submit = (values: FormValues) => {
    onSubmit({
      name: values.name,
      group_id: values.group_id === NO_GROUP ? null : values.group_id,
      budget_max: toNullableNumber(values.budget_max),
      rpm_limit: toNullableNumber(values.rpm_limit),
      tpm_limit: toNullableNumber(values.tpm_limit),
      expires_at: toUnix(values.expires_at),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? `Edit “${existing.name}”` : "Create key"}</DialogTitle>
          <DialogDescription>
            {existing
              ? "Changes apply on the gateway immediately, no restart."
              : "The plaintext is shown exactly once after creation."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="team-search-prod" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="group_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Budget group</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NO_GROUP}>No group</SelectItem>
                      {groups.map((group) => (
                        <SelectItem key={group.id} value={group.id}>
                          {group.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Member keys draw from the group&apos;s shared pool in addition to their own
                    budget.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="budget_max"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Budget (USD)</FormLabel>
                    <FormControl>
                      <Input placeholder="unlimited" inputMode="decimal" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="rpm_limit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>RPM limit</FormLabel>
                    <FormControl>
                      <Input placeholder="none" inputMode="numeric" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="tpm_limit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>TPM limit</FormLabel>
                    <FormControl>
                      <Input placeholder="none" inputMode="numeric" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="expires_at"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Expires</FormLabel>
                  <FormControl>
                    <Input type="datetime-local" {...field} />
                  </FormControl>
                  <FormDescription>Leave empty for a non-expiring key.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : existing ? "Save changes" : "Create key"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
