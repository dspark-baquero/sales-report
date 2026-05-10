"use client";
import * as React from "react";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/DataTable";
import { Badge } from "@/components/ui/badge";
import { formatKRWLong, formatPctAbs } from "@/lib/format";
import type { TargetRowWithActual } from "@/lib/targets";

export function TargetsTable({ rows }: { rows: TargetRowWithActual[] }) {
  const columns: ColumnDef<TargetRowWithActual>[] = React.useMemo(
    () => [
      {
        accessorKey: "brand",
        header: "브랜드",
        cell: ({ row }) => <span className="font-medium">{row.original.brand}</span>,
      },
      {
        accessorKey: "division",
        header: "구분",
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.division}</span>,
      },
      {
        accessorKey: "customerKey",
        header: "거래처",
      },
      {
        accessorKey: "target",
        header: "목표",
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.target > 0 ? formatKRWLong(row.original.target) : "—"}
          </span>
        ),
        sortingFn: (a, b) => a.original.target - b.original.target,
      },
      {
        accessorKey: "actual",
        header: "실적",
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.prospective ? (
              <Badge variant="muted">신규 추진</Badge>
            ) : row.original.actual > 0 ? (
              formatKRWLong(row.original.actual)
            ) : (
              "0원"
            )}
          </span>
        ),
        sortingFn: (a, b) => a.original.actual - b.original.actual,
      },
      {
        accessorKey: "rate",
        header: "달성률",
        cell: ({ row }) => {
          const r = row.original;
          if (r.prospective) return <Badge variant="info">추진 중</Badge>;
          if (r.rate === null) return <span className="text-muted-foreground">—</span>;
          const cls =
            r.rate >= 1.0
              ? "text-emerald-700 font-semibold"
              : r.rate >= 0.7
                ? "text-amber-600"
                : "text-rose-700 font-semibold";
          return <span className={`tabular-nums ${cls}`}>{formatPctAbs(r.rate, 1)}</span>;
        },
        sortingFn: (a, b) => (a.original.rate ?? -1) - (b.original.rate ?? -1),
      },
      {
        id: "diff",
        header: "목표 대비",
        cell: ({ row }) => {
          const r = row.original;
          if (r.target === 0) return <span className="text-muted-foreground">—</span>;
          const diff = r.actual - r.target;
          const cls = diff >= 0 ? "text-emerald-700" : "text-rose-700";
          const sign = diff >= 0 ? "+" : "";
          return <span className={`tabular-nums ${cls}`}>{sign}{formatKRWLong(Math.abs(diff))}</span>;
        },
      },
    ],
    [],
  );

  return (
    <DataTable
      columns={columns}
      data={rows}
      pageSize={30}
      searchAccessor={(r) => `${r.brand} ${r.customerKey} ${r.division}`}
      searchPlaceholder="브랜드/거래처 검색…"
    />
  );
}
