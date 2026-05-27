"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatKRWShort, formatPctAbs } from "@/lib/format";
import type { PeriodAgg, PeriodAggRow } from "@/lib/targets";

function rateColor(rate: number | null): string {
  if (rate === null) return "bg-neutral-50 text-neutral-500";
  if (rate >= 1.0) return "bg-emerald-100 text-emerald-800";
  if (rate >= 0.95) return "bg-emerald-50/60 text-emerald-700";
  if (rate >= 0.7) return "bg-amber-50 text-amber-700";
  return "bg-rose-50 text-rose-700";
}

function Cell({ rate, actual, target }: { rate: number | null; actual: number; target: number }) {
  if (target === 0 && actual === 0) {
    return <td className="px-2 py-2 text-center text-[11px] text-muted-foreground">—</td>;
  }
  return (
    <td className={`px-2 py-2 text-center ${rateColor(rate)}`}>
      <div className="text-sm font-semibold tabular-nums">{formatPctAbs(rate, 1)}</div>
      <div className="text-[10px] opacity-75 tabular-nums leading-tight">
        {formatKRWShort(actual)} / {formatKRWShort(target)}
      </div>
    </td>
  );
}

function ProspectiveCell() {
  return (
    <td className="px-2 py-2 text-center bg-neutral-50">
      <div className="text-[11px] text-muted-foreground">신규 추진</div>
    </td>
  );
}

type ChannelRow = {
  division: string;
  customerKey: string;
  cells: { rate: number | null; actual: number; target: number; prospective: boolean }[];
};

function buildChannelRows(periods: PeriodAgg[]): { domestic: ChannelRow[]; overseas: ChannelRow[] } {
  const allKeys = new Map<string, { division: string; customerKey: string; maxTarget: number; prospective: boolean }>();

  for (const p of periods) {
    for (const ch of p.byChannel) {
      const k = `${ch.division}|${ch.customerKey}`;
      const existing = allKeys.get(k);
      if (!existing) {
        allKeys.set(k, { division: ch.division, customerKey: ch.customerKey, maxTarget: ch.target, prospective: ch.prospective });
      } else {
        existing.maxTarget = Math.max(existing.maxTarget, ch.target);
        if (!ch.prospective) existing.prospective = false;
      }
    }
  }

  const rows: ChannelRow[] = [];
  for (const [, meta] of allKeys) {
    const cells = periods.map((p) => {
      const ch = p.byChannel.find(
        (c) => c.division === meta.division && c.customerKey === meta.customerKey,
      );
      return ch
        ? { rate: ch.rate, actual: ch.actual, target: ch.target, prospective: ch.prospective }
        : { rate: null, actual: 0, target: 0, prospective: meta.prospective };
    });
    rows.push({ division: meta.division, customerKey: meta.customerKey, cells });
  }

  const domestic = rows
    .filter((r) => r.division === "국내")
    .sort((a, b) => {
      const at = Math.max(...a.cells.map((c) => c.target));
      const bt = Math.max(...b.cells.map((c) => c.target));
      return bt - at;
    });

  const overseas = rows
    .filter((r) => r.division === "해외")
    .sort((a, b) => {
      const at = Math.max(...a.cells.map((c) => c.target));
      const bt = Math.max(...b.cells.map((c) => c.target));
      return bt - at;
    });

  return { domestic, overseas };
}

export function AchievementMatrix({ periods }: { periods: PeriodAgg[] }) {
  const { domestic, overseas } = buildChannelRows(periods);

  const headers = periods.map((p) => p.label);

  return (
    <Card>
      <CardHeader>
        <CardTitle>기간별 채널 달성률 종합</CardTitle>
        <div className="text-[11px] text-muted-foreground">
          {periods.map((p) => `${p.label}: ${p.periodDesc}`).join(" · ")}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-2 text-left text-[11px] font-medium text-muted-foreground sticky left-0 bg-muted/50 min-w-[120px]">
                  채널
                </th>
                {headers.map((h) => (
                  <th key={h} className="px-2 py-2 text-center text-[11px] font-medium text-muted-foreground min-w-[130px]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* 종합 */}
              <tr className="border-b-2 border-foreground/20 bg-muted/30 font-semibold">
                <td className="px-3 py-2 sticky left-0 bg-muted/30">종합</td>
                {periods.map((p) => (
                  <Cell key={p.label} rate={p.totalRate} actual={p.totalActual} target={p.totalTarget} />
                ))}
              </tr>

              {/* 국내 */}
              {domestic.length > 0 && (
                <tr className="border-b bg-muted/20">
                  <td colSpan={headers.length + 1} className="px-3 py-1 text-[10px] font-semibold text-muted-foreground tracking-wider">
                    국내
                  </td>
                </tr>
              )}
              {domestic.map((row) => (
                <tr key={`국내-${row.customerKey}`} className="border-b hover:bg-muted/10">
                  <td className="px-3 py-2 sticky left-0 bg-background">{row.customerKey}</td>
                  {row.cells.map((c, i) =>
                    c.prospective ? (
                      <ProspectiveCell key={i} />
                    ) : (
                      <Cell key={i} rate={c.rate} actual={c.actual} target={c.target} />
                    ),
                  )}
                </tr>
              ))}

              {/* 해외 */}
              {overseas.length > 0 && (
                <tr className="border-b bg-muted/20">
                  <td colSpan={headers.length + 1} className="px-3 py-1 text-[10px] font-semibold text-muted-foreground tracking-wider">
                    해외
                  </td>
                </tr>
              )}
              {overseas.map((row) => (
                <tr key={`해외-${row.customerKey}`} className="border-b hover:bg-muted/10">
                  <td className="px-3 py-2 sticky left-0 bg-background">{row.customerKey}</td>
                  {row.cells.map((c, i) =>
                    c.prospective ? (
                      <ProspectiveCell key={i} />
                    ) : (
                      <Cell key={i} rate={c.rate} actual={c.actual} target={c.target} />
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
