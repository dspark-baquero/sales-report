"use client";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/DataTable";
import { CustomerLink } from "@/components/CustomerLink";
import { SalesRepLink } from "@/components/SalesRepLink";
import { Badge } from "@/components/ui/badge";
import { formatKRWShort, formatYMShort } from "@/lib/format";

// 서버에서 넘기는 flat DTO — Map/Set/Date 금지(직렬화 대상).
export type MemberTableRow = {
  client: string;
  tier: string;
  status: string;
  salesRep: string;
  prevDealer: string | null;
  gapBucket: string;
  silentMonths: number | null;
  lastActiveMonth: string | null;
  last12mRevenue: number;
  lifetimeRevenue: number;
  recoveryValue: number;
  region: string;
  bizTypeLeaf: string;
  grade: string;
};

const TIER_VARIANT: Record<string, "negative" | "warn" | "info" | "muted"> = {
  S: "negative",
  A: "warn",
  B: "info",
  C: "muted",
};

const STATUS_VARIANT: Record<string, "positive" | "muted" | "warn"> = {
  활성: "positive",
  비활성: "muted",
  승인전: "warn",
};

export function MemberTable({
  rows,
  ym,
  emptyText,
}: {
  rows: MemberTableRow[];
  ym: string;
  emptyText?: string;
}) {
  const columns: ColumnDef<MemberTableRow>[] = [
    {
      accessorKey: "client",
      header: "거래처",
      cell: ({ row }) => (
        <div className="min-w-[160px]">
          <CustomerLink customer={row.original.client} ym={ym} className="font-medium" />
          <div className="text-[10px] text-muted-foreground">
            {row.original.region || "지역 미입력"}
            {row.original.bizTypeLeaf ? ` · ${row.original.bizTypeLeaf}` : ""}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "tier",
      header: "등급",
      cell: ({ row }) =>
        row.original.tier === "-" ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <Badge variant={TIER_VARIANT[row.original.tier] ?? "muted"}>{row.original.tier}</Badge>
        ),
    },
    {
      accessorKey: "status",
      header: "상태",
      cell: ({ row }) => (
        <Badge variant={STATUS_VARIANT[row.original.status] ?? "muted"}>
          {row.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: "salesRep",
      header: "담당자",
      cell: ({ row }) => (
        <div className="min-w-[90px]">
          <SalesRepLink rep={row.original.salesRep} ym={ym} />
          {row.original.prevDealer && (
            <div className="text-[10px] text-muted-foreground">
              이전 {row.original.prevDealer}
            </div>
          )}
        </div>
      ),
    },
    {
      accessorKey: "silentMonths",
      header: "무매출",
      cell: ({ row }) => (
        <div className="whitespace-nowrap">
          <div>{row.original.gapBucket}</div>
          <div className="text-[10px] text-muted-foreground">
            {row.original.lastActiveMonth
              ? `마지막 ${formatYMShort(row.original.lastActiveMonth)}`
              : "거래 이력 없음"}
          </div>
        </div>
      ),
      sortingFn: (a, b) =>
        (a.original.silentMonths ?? 9999) - (b.original.silentMonths ?? 9999),
    },
    {
      accessorKey: "recoveryValue",
      header: "회수 기대값",
      cell: ({ row }) => (
        <span className="tabular-nums font-medium">
          {row.original.recoveryValue > 0 ? formatKRWShort(row.original.recoveryValue) : "—"}
        </span>
      ),
    },
    {
      accessorKey: "last12mRevenue",
      header: "최근 12개월",
      cell: ({ row }) => (
        <span className="tabular-nums text-muted-foreground">
          {row.original.last12mRevenue > 0 ? formatKRWShort(row.original.last12mRevenue) : "—"}
        </span>
      ),
    },
    {
      accessorKey: "lifetimeRevenue",
      header: "누적 매출",
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.original.lifetimeRevenue > 0 ? formatKRWShort(row.original.lifetimeRevenue) : "—"}
        </span>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      pageSize={25}
      density="compact"
      searchPlaceholder="거래처명 · 담당자 검색"
      searchAccessor={(r) => `${r.client} ${r.salesRep} ${r.region} ${r.bizTypeLeaf}`}
      emptyText={emptyText ?? "해당 조건의 거래처가 없습니다"}
    />
  );
}
