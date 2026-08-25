"use client";

import type { UsageAggregate } from "@/lib/types";
import { compact, usd } from "@/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function UsageTable({ rows }: { rows: UsageAggregate[] }) {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No usage in this window.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Group</TableHead>
            <TableHead className="text-right">Requests</TableHead>
            <TableHead className="text-right">OK</TableHead>
            <TableHead className="text-right">4xx</TableHead>
            <TableHead className="text-right">5xx</TableHead>
            <TableHead className="text-right">Tokens in</TableHead>
            <TableHead className="text-right">Tokens out</TableHead>
            <TableHead className="text-right">Cost</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.group}>
              <TableCell className="max-w-56 truncate font-medium">{row.group}</TableCell>
              <TableCell className="text-right tabular-nums">{compact(row.requests)}</TableCell>
              <TableCell className="text-right tabular-nums">{compact(row.requests_ok)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {compact(row.requests_client_error)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {compact(row.requests_server_error)}
              </TableCell>
              <TableCell className="text-right tabular-nums">{compact(row.tokens_in)}</TableCell>
              <TableCell className="text-right tabular-nums">{compact(row.tokens_out)}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">{usd(row.cost)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
