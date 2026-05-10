// 거래처 변동 하이라이트 — 종합/B2B 탭에 삽입 가능한 묶음 카드.
// Top 상승/하락, 동면 복귀, 분기 절벽, 상실된 핵심 거래처를 한 번에 보여줌.

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, AlertTriangle, Sparkles, ArrowRight } from "lucide-react";
import {
  formatKRWLong,
  formatKRWShort,
  formatPct,
} from "@/lib/format";
import {
  topMovers,
  sleepingReturned,
  quarterlyCliff,
  lostKeyAccounts,
} from "@/lib/accountAnalysis";
import type { FactCube } from "@/lib/facts";
import { prevMonth } from "@/lib/compare";

function CustomerLink({ customer, ym, children }: { customer: string; ym: string; children: React.ReactNode }) {
  return (
    <Link
      href={`/accounts?customer=${encodeURIComponent(customer)}&month=${ym}`}
      className="hover:underline"
    >
      {children}
    </Link>
  );
}

export function AccountHighlights({ cube, ym }: { cube: FactCube; ym: string }) {
  const movers = topMovers(cube, ym, prevMonth(ym), 5);
  const sleeping = sleepingReturned(cube, ym, { minRevenue: 3_000_000 });
  const cliff = quarterlyCliff(cube, ym);
  const lost = lostKeyAccounts(cube, ym, { lookback: "quarter", topN: 10 });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-foreground">주요 거래처 변동 하이라이트</h3>
        <span className="text-[10px] text-muted-foreground">
          전월 비교 / 분기 비교 / 동면 복귀 / 핵심 이탈 — 거래처명 클릭 시 거래처 분석 탭으로 이동
        </span>
      </div>

      {/* Top 상승 / 하락 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-600" />
                전월 대비 상위 상승
              </CardTitle>
              <Badge variant="info">{movers.gainers.length}곳</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4">
              {movers.gainers.length === 0 ? (
                <div className="text-sm text-muted-foreground py-2">해당 없음</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] text-muted-foreground border-b">
                      <th className="py-2">거래처</th>
                      <th className="py-2 text-right">이번달</th>
                      <th className="py-2 text-right">전월</th>
                      <th className="py-2 text-right">증가</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movers.gainers.map((g) => (
                      <tr key={g.customer} className="border-b last:border-0">
                        <td className="py-2">
                          <CustomerLink customer={g.customer} ym={ym}>
                            {g.customer}
                          </CustomerLink>
                        </td>
                        <td className="py-2 text-right tabular-nums">{formatKRWShort(g.current)}</td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">
                          {g.prev > 0 ? formatKRWShort(g.prev) : "—"}
                        </td>
                        <td className="py-2 text-right tabular-nums text-emerald-700">
                          +{formatKRWShort(g.diff)}
                          <div className="text-[10px]">{formatPct(g.pct)}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-rose-600" />
                전월 대비 상위 하락
              </CardTitle>
              <Badge variant="negative">{movers.decliners.length}곳</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4">
              {movers.decliners.length === 0 ? (
                <div className="text-sm text-muted-foreground py-2">해당 없음</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] text-muted-foreground border-b">
                      <th className="py-2">거래처</th>
                      <th className="py-2 text-right">이번달</th>
                      <th className="py-2 text-right">전월</th>
                      <th className="py-2 text-right">감소</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movers.decliners.map((d) => (
                      <tr key={d.customer} className="border-b last:border-0">
                        <td className="py-2">
                          <CustomerLink customer={d.customer} ym={ym}>
                            {d.customer}
                          </CustomerLink>
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {d.current > 0 ? formatKRWShort(d.current) : <span className="text-rose-700">0원</span>}
                        </td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">
                          {formatKRWShort(d.prev)}
                        </td>
                        <td className="py-2 text-right tabular-nums text-rose-700">
                          {formatKRWShort(d.diff)}
                          <div className="text-[10px]">{d.pct === null ? "이탈" : formatPct(d.pct)}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 동면 복귀 + 분기 절벽 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-violet-600" />
                동면 거래처 복귀
              </CardTitle>
              <Badge variant="info">{sleeping.length}곳</Badge>
            </div>
            <div className="text-[11px] text-muted-foreground">
              직전 3개월 무거래 → 이번달 매출 (300만원 이상)
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4">
              {sleeping.length === 0 ? (
                <div className="text-sm text-muted-foreground py-2">해당 없음</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] text-muted-foreground border-b">
                      <th className="py-2">거래처</th>
                      <th className="py-2 text-right">이번달 매출</th>
                      <th className="py-2 text-right">동면 기간</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sleeping.slice(0, 8).map((s) => (
                      <tr key={s.customer} className="border-b last:border-0">
                        <td className="py-2">
                          <CustomerLink customer={s.customer} ym={ym}>
                            {s.customer}
                          </CustomerLink>
                          {s.lastActiveMonth && (
                            <div className="text-[10px] text-muted-foreground">
                              마지막 활성: {s.lastActiveMonth}
                            </div>
                          )}
                        </td>
                        <td className="py-2 text-right tabular-nums">{formatKRWShort(s.returnedRevenue)}</td>
                        <td className="py-2 text-right tabular-nums text-violet-700">
                          {s.silentMonths}개월
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className={cliff.length > 0 ? "border-rose-200" : undefined}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className={cliff.length > 0 ? "h-4 w-4 text-rose-600" : "h-4 w-4 text-muted-foreground"} />
                분기 절벽 경보
              </CardTitle>
              <Badge variant={cliff.length > 0 ? "negative" : "muted"}>{cliff.length}곳</Badge>
            </div>
            <div className="text-[11px] text-muted-foreground">
              지난 분기 상위 거래처 중 이번 분기 누적이 진행률 보정 -40% 이상 하락
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4">
              {cliff.length === 0 ? (
                <div className="text-sm text-muted-foreground py-2">해당 없음 — 안정적</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] text-muted-foreground border-b">
                      <th className="py-2">거래처</th>
                      <th className="py-2 text-right">지난 분기</th>
                      <th className="py-2 text-right">이번 분기</th>
                      <th className="py-2 text-right">진행률 보정</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cliff.slice(0, 8).map((c) => (
                      <tr key={c.customer} className="border-b last:border-0">
                        <td className="py-2">
                          <CustomerLink customer={c.customer} ym={ym}>
                            <span className="text-muted-foreground text-xs mr-1">#{c.prevRank}</span>
                            {c.customer}
                          </CustomerLink>
                        </td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">
                          {formatKRWShort(c.prevQuarterRevenue)}
                        </td>
                        <td className="py-2 text-right tabular-nums">{formatKRWShort(c.curQuarterAccum)}</td>
                        <td className="py-2 text-right tabular-nums text-rose-700">{formatPct(c.pct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 상실된 핵심 거래처 */}
      {lost.length > 0 && (
        <Card className="border-rose-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-600" />
                상실된 핵심 거래처 (지난 분기 상위 10 → 이번달 0원)
              </CardTitle>
              <Badge variant="negative">{lost.length}곳</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-muted-foreground border-b">
                    <th className="py-2">순위</th>
                    <th className="py-2">거래처</th>
                    <th className="py-2 text-right">{lost[0].baselineLabel} 매출</th>
                    <th className="py-2">마지막 매출 월</th>
                    <th className="py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {lost.map((l) => (
                    <tr key={l.customer} className="border-b last:border-0">
                      <td className="py-2 text-muted-foreground tabular-nums">#{l.baselineRank}</td>
                      <td className="py-2">
                        <CustomerLink customer={l.customer} ym={ym}>
                          {l.customer}
                        </CustomerLink>
                      </td>
                      <td className="py-2 text-right tabular-nums">{formatKRWLong(l.baselineRevenue)}</td>
                      <td className="py-2 text-muted-foreground tabular-nums">
                        {l.lastSeenMonth ?? "—"}
                      </td>
                      <td className="py-2">
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
