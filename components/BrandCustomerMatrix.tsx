"use client";

import { useState } from "react";
import Link from "next/link";
import { X, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatKRWLong, formatKRWShort, formatPct, formatPctAbs } from "@/lib/format";
import { customerHref } from "@/components/CustomerLink";
import type { BrandCustomerMatrixData, CellColor, MatrixCell } from "@/lib/brandCustomerMatrix";

// 색상 클래스 매핑. 셀 본체 + 범례 dot에 공용.
const COLOR_CLASS: Record<CellColor, string> = {
  blue: "bg-blue-100 hover:bg-blue-200 text-blue-900 border-blue-200",
  green: "bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border-emerald-200",
  red: "bg-rose-100 hover:bg-rose-200 text-rose-900 border-rose-200",
  amber: "bg-amber-100 hover:bg-amber-200 text-amber-900 border-amber-200",
  gray: "bg-muted hover:bg-muted/80 text-muted-foreground border-border",
};

const COLOR_DOT: Record<CellColor, string> = {
  blue: "bg-blue-400",
  green: "bg-emerald-400",
  red: "bg-rose-400",
  amber: "bg-amber-400",
  gray: "bg-muted-foreground/40",
};

const LEGEND: { color: CellColor; label: string }[] = [
  { color: "blue", label: "전년 ↑ · 목표 달성" },
  { color: "green", label: "전년 ↑ · 목표 미달" },
  { color: "amber", label: "전년 ↓ · 목표 달성" },
  { color: "red", label: "전년 ↓ · 목표 미달" },
  { color: "gray", label: "데이터 부족" },
];

export function BrandCustomerMatrix({
  data,
  ym,
}: {
  data: BrandCustomerMatrixData;
  ym: string;
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selectedCell: MatrixCell | null = selectedKey ? data.cells.get(selectedKey) ?? null : null;

  if (data.customers.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <div>
            <CardTitle>브랜드 × 거래처 매트릭스</CardTitle>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              YTD 누적 · 전년 동기 대비 · 채널 목표 달성 — 셀 클릭으로 세부 정보
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
            {LEGEND.map((l) => (
              <div key={l.color} className="flex items-center gap-1">
                <span className={`inline-block w-2.5 h-2.5 rounded-sm ${COLOR_DOT[l.color]}`} />
                <span className="text-muted-foreground">{l.label}</span>
              </div>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="px-4 pb-4 overflow-x-auto">
          <table className="border-separate" style={{ borderSpacing: 0 }}>
            <thead>
              <tr>
                <th
                  className="sticky left-0 z-10 bg-card text-left text-[11px] text-muted-foreground font-medium pb-2 pr-2 align-bottom"
                  style={{ minWidth: 100 }}
                >
                  브랜드 \ 거래처
                </th>
                {data.customers.map((c) => (
                  <th
                    key={c}
                    className="text-[10px] text-muted-foreground font-medium pb-2 px-1 align-bottom"
                    style={{ minWidth: 84, maxWidth: 100 }}
                  >
                    <div
                      className="truncate whitespace-nowrap"
                      title={c}
                      style={{ maxWidth: 100 }}
                    >
                      {c}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.brands.map((b) => (
                <tr key={b}>
                  <td
                    className="sticky left-0 z-10 bg-card text-xs font-medium pr-2 py-1 border-r"
                    style={{ minWidth: 100 }}
                  >
                    {b}
                  </td>
                  {data.customers.map((c) => {
                    const key = `${b}|${c}`;
                    const cell = data.cells.get(key);
                    if (!cell) return <td key={key} />;
                    const cls = COLOR_CLASS[cell.color];
                    const active = selectedKey === key;
                    return (
                      <td
                        key={key}
                        className="px-0.5 py-0.5"
                        style={{ minWidth: 84, maxWidth: 100 }}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedKey(active ? null : key)}
                          className={`w-full px-1.5 py-1 text-left rounded border transition-colors ${cls} ${
                            active ? "ring-2 ring-primary" : ""
                          }`}
                          title={`${b} × ${c}: YTD ${formatKRWShort(cell.ytd)}`}
                        >
                          <div className="text-[10px] tabular-nums leading-tight">
                            {cell.ytd > 0 ? formatKRWShort(cell.ytd) : "—"}
                          </div>
                          {cell.ytd > 0 && cell.ytdPct !== null && (
                            <div className="text-[9px] tabular-nums leading-tight opacity-70">
                              {formatPct(cell.ytdPct, 0)}
                            </div>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selectedCell && (
          <div className="border-t bg-muted/30 px-4 py-3">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-block px-1.5 py-0.5 text-[10px] font-medium rounded bg-card border">
                    {selectedCell.brand}
                  </span>
                  <Link
                    href={customerHref(selectedCell.customer, ym)}
                    className="text-sm font-semibold hover:underline flex items-center gap-1"
                  >
                    {selectedCell.customer}
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                  {selectedCell.customerKey && (
                    <span className="text-[10px] text-muted-foreground">
                      ({selectedCell.customerKey})
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  {selectedCell.colorReason}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedKey(null)}
                className="p-1 rounded hover:bg-muted text-muted-foreground"
                aria-label="닫기"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
              <Metric label="이번달" value={selectedCell.monthCur} />
              <Metric label="전월" value={selectedCell.monthPrev} muted />
              <Metric label="전년 동월" value={selectedCell.monthPrevYear} muted />
              <Metric label="YTD 누적" value={selectedCell.ytd} bold />
              <Metric label="전년 동기 YTD" value={selectedCell.prevYtd} muted />
              <div className="rounded border bg-card px-2 py-1.5">
                <div className="text-[10px] text-muted-foreground">
                  채널 목표 (YTD)
                </div>
                {selectedCell.ytdTarget > 0 ? (
                  <>
                    <div className="text-sm font-semibold tabular-nums">
                      {formatKRWLong(selectedCell.ytdTarget)}
                    </div>
                    <div
                      className={`text-[10px] tabular-nums ${
                        selectedCell.achievementRate !== null && selectedCell.achievementRate >= 1
                          ? "text-emerald-700"
                          : "text-rose-700"
                      }`}
                    >
                      달성률{" "}
                      {selectedCell.achievementRate !== null
                        ? formatPctAbs(selectedCell.achievementRate, 1)
                        : "—"}
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground">목표 매칭 없음</div>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({
  label,
  value,
  muted,
  bold,
}: {
  label: string;
  value: number;
  muted?: boolean;
  bold?: boolean;
}) {
  return (
    <div className="rounded border bg-card px-2 py-1.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div
        className={`tabular-nums ${bold ? "text-sm font-semibold" : "text-sm"} ${
          muted ? "text-muted-foreground" : ""
        }`}
      >
        {value > 0 ? formatKRWLong(value) : "—"}
      </div>
    </div>
  );
}
