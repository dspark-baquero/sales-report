"use client";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/DataTable";
import { CustomerLink } from "@/components/CustomerLink";
import { SalesRepLink } from "@/components/SalesRepLink";
import { Badge } from "@/components/ui/badge";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
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

// 엑셀에서 바로 열리도록 UTF-8 BOM을 붙인 CSV로 내보낸다.
// 금액·개월 수는 서식 없는 raw 숫자로 넣어야 엑셀에서 계산·정렬이 된다.
const CSV_HEADERS = [
  "거래처",
  "우선순위 등급",
  "상태",
  "담당자",
  "이전 담당",
  "무매출 구간",
  "무매출 개월",
  "마지막 거래월",
  "최근 12개월 매출",
  "누적 매출",
  "지역",
  "사업형태",
  "회원 등급",
];

function csvCell(v: string | number | null): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildCsv(rows: MemberTableRow[]): string {
  const lines = [CSV_HEADERS.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.client,
        r.tier === "-" ? "" : r.tier,
        r.status,
        r.salesRep,
        r.prevDealer ?? "",
        r.gapBucket,
        r.silentMonths ?? "",
        r.lastActiveMonth ?? "",
        Math.round(r.last12mRevenue),
        Math.round(r.lifetimeRevenue),
        r.region,
        r.bizTypeLeaf,
        r.grade,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return "\uFEFF" + lines.join("\r\n");
}

function downloadCsv(rows: MemberTableRow[], filename: string): void {
  const blob = new Blob([buildCsv(rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function MemberTable({
  rows,
  ym,
  emptyText,
  downloadName,
}: {
  rows: MemberTableRow[];
  ym: string;
  emptyText?: string;
  downloadName?: string;
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
        <span className="tabular-nums font-medium">
          {row.original.lifetimeRevenue > 0 ? formatKRWShort(row.original.lifetimeRevenue) : "—"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={rows.length === 0}
          onClick={() => downloadCsv(rows, downloadName ?? `재영업목록_${ym}.csv`)}
        >
          <Download className="h-3.5 w-3.5 mr-1.5" />
          엑셀 내려받기 ({rows.length}개)
        </Button>
      </div>
      <DataTable
      columns={columns}
      data={rows}
      pageSize={25}
      density="compact"
      searchPlaceholder="거래처명 · 담당자 검색"
      searchAccessor={(r) => `${r.client} ${r.salesRep} ${r.region} ${r.bizTypeLeaf}`}
      emptyText={emptyText ?? "해당 조건의 거래처가 없습니다"}
      />
    </div>
  );
}
