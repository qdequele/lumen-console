"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WINDOWS } from "@/lib/format";

export const GROUP_BY_OPTIONS = [
  { value: "model", label: "Model" },
  { value: "model_used", label: "Model used" },
  { value: "provider", label: "Provider" },
  { value: "capability", label: "Capability" },
  { value: "key_id", label: "Key" },
  { value: "group_id", label: "Group" },
  { value: "status", label: "Status" },
] as const;

interface UsageControlsProps {
  hours: number;
  onHoursChange: (hours: number) => void;
  groupBy: string;
  onGroupByChange: (groupBy: string) => void;
  /** Restrict group_by choices (the combined view drops key/group dimensions). */
  groupByOptions?: ReadonlyArray<{ value: string; label: string }>;
}

export function UsageControls({
  hours,
  onHoursChange,
  groupBy,
  onGroupByChange,
  groupByOptions = GROUP_BY_OPTIONS,
}: UsageControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={String(hours)} onValueChange={(value) => onHoursChange(Number(value))}>
        <SelectTrigger className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {WINDOWS.map((window) => (
            <SelectItem key={window.hours} value={String(window.hours)}>
              {window.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={groupBy} onValueChange={onGroupByChange}>
        <SelectTrigger className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {groupByOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              By {option.label.toLowerCase()}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
