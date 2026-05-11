import fs from "fs";
import path from "path";
import Link from "next/link";
import { marked } from "marked";
import { loadSalesRows, loadFactCube } from "@/lib/load";
import { resolveMonth } from "@/lib/months";
import {
  newProducts,
  decliningProducts,
  weekdayPattern,
  customerConcentration,
  brandChannelGroupHeatmap,
  discountFeeByChannelGroup,
  bestWorstChannelGroups,
} from "@/lib/insights";
import {
  quarterlyCliff,
  sleepingReturned,
  lostKeyAccounts,
  newAccounts,
} from "@/lib/accountAnalysis";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart } from "@/components/charts/BarChart";
import { HeatmapChart } from "@/components/charts/HeatmapChart";
import { YearToDateChart } from "@/components/YearToDateChart";
import { ytdCategorySeries } from "@/lib/ytd";
import {
  formatKRWLong,
  formatKRWShort,
  formatInt,
  formatYM,
  formatPct,
  formatPctAbs,
  buildChange,
} from "@/lib/format";

type SearchParams = Promise<{ month?: string }>;

export default async function InsightsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const ym = resolveMonth(sp.month);
  const all = loadSalesRows();
  const cube = loadFactCube();

  // 사람 코멘트
  const insightsPath = path.join(process.cwd(), "insights", `${ym}.md`);
  let humanComment: string | null = null;
  if (fs.existsSync(insightsPath)) {
    const md = fs.readFileSync(insightsPath, "utf8");
    humanComment = marked.parse(md, { async: false }) as string;
  }

  const bw = bestWorstChannelGroups(all, ym);
  const np = newProducts(all, ym);
  const dec = decliningProducts(all, ym);
  const weekday = weekdayPattern(all, ym);
  const conc = customerConcentration(all, ym);
  const heat = brandChannelGroupHeatmap(all, ym);
  const df = discountFeeByChannelGroup(all, ym);

  // 거래처 심층 자동 분석 (큐브 기반)
  const cliff = quarterlyCliff(cube, ym);
  const sleeping = sleepingReturned(cube, ym, { minRevenue: 1_000_000 });
  const lostKey = lostKeyAccounts(cube, ym, { lookback: "quarter", topN: 10 });
  const newAcc = newAccounts(cube, ym, 6);

  // 데이터 품질
  const monthRows = all.filter((r) => r.yearMonth === ym);
  const revRows = monthRows.filter((r) => !r.isNonRevenue);
  const costMissing = revRows.filter((r) => r.cost === null).length;
  const nonRevenue = monthRows.filter((r) => r.isNonRevenue).length;

  const heatmapData = heat.values.flatMap((row, bi) =>
    row.map((v, gi) => ({ x: gi, y: bi, value: v })),
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{formatYM(ym)} 심층 자동 분석</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          헤더 / 거래처 변동 / SKU / 채널 / 데이터 품질 — 휴리스틱 기반 자동 통계 (각 탭 상단의 인사이트보다 깊은 표 형태)
        </p>
      </div>

      <YearToDateChart
        ym={ym}
        series={ytdCategorySeries(cube, ym)}
        caption="대분류별 (B2B / B2C / 면세점) — 심층 표 해석의 기준선"
      />

      {/* 거래처 심층 — 분기 절벽 / 동면 복귀 / 핵심 이탈 / 신규 진입 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className={cliff.length > 0 ? "border-rose-200" : undefined}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>분기 절벽 거래처 (지난 분기 상위 → 이번 분기 -40%↓)</CardTitle>
              <Badge variant={cliff.length > 0 ? "negative" : "muted"}>{cliff.length}곳</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4 overflow-x-auto">
              {cliff.length === 0 ? (
                <div className="text-sm text-muted-foreground py-2">해당 없음 — 안정적</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] text-muted-foreground border-b">
                      <th className="py-2">#</th>
                      <th className="py-2">거래처</th>
                      <th className="py-2 text-right">지난 분기</th>
                      <th className="py-2 text-right">이번 분기 누적</th>
                      <th className="py-2 text-right">변화율</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cliff.slice(0, 15).map((c) => (
                      <tr key={c.customer} className="border-b last:border-0">
                        <td className="py-2 text-muted-foreground tabular-nums">#{c.prevRank}</td>
                        <td className="py-2">
                          <Link
                            href={`/accounts?customer=${encodeURIComponent(c.customer)}&month=${ym}`}
                            className="hover:underline"
                          >
                            {c.customer}
                          </Link>
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

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>동면 거래처 복귀 (직전 3개월 무거래 → 이번달)</CardTitle>
              <Badge variant="info">{sleeping.length}곳</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4 overflow-x-auto">
              {sleeping.length === 0 ? (
                <div className="text-sm text-muted-foreground py-2">해당 없음</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] text-muted-foreground border-b">
                      <th className="py-2">거래처</th>
                      <th className="py-2 text-right">이번달</th>
                      <th className="py-2 text-right">동면</th>
                      <th className="py-2">마지막 활성</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sleeping.slice(0, 15).map((s) => (
                      <tr key={s.customer} className="border-b last:border-0">
                        <td className="py-2">
                          <Link
                            href={`/accounts?customer=${encodeURIComponent(s.customer)}&month=${ym}`}
                            className="hover:underline"
                          >
                            {s.customer}
                          </Link>
                        </td>
                        <td className="py-2 text-right tabular-nums">{formatKRWShort(s.returnedRevenue)}</td>
                        <td className="py-2 text-right tabular-nums text-violet-700">{s.silentMonths}개월</td>
                        <td className="py-2 text-muted-foreground tabular-nums text-xs">
                          {s.lastActiveMonth ?? "—"}
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className={lostKey.length > 0 ? "border-rose-200" : undefined}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>상실된 핵심 거래처 (지난 분기 상위 10 → 이번달 0)</CardTitle>
              <Badge variant={lostKey.length > 0 ? "negative" : "muted"}>{lostKey.length}곳</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4 overflow-x-auto">
              {lostKey.length === 0 ? (
                <div className="text-sm text-muted-foreground py-2">해당 없음</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] text-muted-foreground border-b">
                      <th className="py-2">#</th>
                      <th className="py-2">거래처</th>
                      <th className="py-2 text-right">지난 분기 매출</th>
                      <th className="py-2">마지막</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lostKey.map((l) => (
                      <tr key={l.customer} className="border-b last:border-0">
                        <td className="py-2 text-muted-foreground tabular-nums">#{l.baselineRank}</td>
                        <td className="py-2">
                          <Link
                            href={`/accounts?customer=${encodeURIComponent(l.customer)}&month=${ym}`}
                            className="hover:underline"
                          >
                            {l.customer}
                          </Link>
                        </td>
                        <td className="py-2 text-right tabular-nums">{formatKRWLong(l.baselineRevenue)}</td>
                        <td className="py-2 text-muted-foreground tabular-nums text-xs">
                          {l.lastSeenMonth ?? "—"}
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
              <CardTitle>신규 진입 거래처 (직전 6개월 무거래 → 이번달 첫 매출)</CardTitle>
              <Badge variant="info">{newAcc.length}곳</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4 overflow-x-auto">
              {newAcc.length === 0 ? (
                <div className="text-sm text-muted-foreground py-2">해당 없음</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] text-muted-foreground border-b">
                      <th className="py-2">거래처</th>
                      <th className="py-2">카테고리</th>
                      <th className="py-2">브랜드</th>
                      <th className="py-2 text-right">이번달</th>
                    </tr>
                  </thead>
                  <tbody>
                    {newAcc.slice(0, 15).map((n) => (
                      <tr key={n.customer} className="border-b last:border-0">
                        <td className="py-2">
                          <Link
                            href={`/accounts?customer=${encodeURIComponent(n.customer)}&month=${ym}`}
                            className="hover:underline"
                          >
                            {n.customer}
                          </Link>
                        </td>
                        <td className="py-2 text-xs text-muted-foreground">{n.category ?? "—"}</td>
                        <td className="py-2 text-xs text-muted-foreground">{n.brand ?? "—"}</td>
                        <td className="py-2 text-right tabular-nums">{formatKRWShort(n.currentRevenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 데이터 품질 */}
      <Card>
        <CardHeader>
          <CardTitle>데이터 품질 점검</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-[11px] text-muted-foreground">매출 행 수</div>
              <div className="text-lg font-semibold tabular-nums">{formatInt(revRows.length)}건</div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">비매출 행</div>
              <div className="text-lg font-semibold tabular-nums">{formatInt(nonRevenue)}건</div>
              <div className="text-[10px] text-muted-foreground">집계 제외</div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">원가 누락 행</div>
              <div className="text-lg font-semibold tabular-nums">{formatInt(costMissing)}건</div>
              <div className="text-[10px] text-muted-foreground">
                {revRows.length > 0
                  ? `(${formatPctAbs(costMissing / revRows.length, 1)})`
                  : ""}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">활성 거래처 수</div>
              <div className="text-lg font-semibold tabular-nums">{formatInt(conc.customerCount)}곳</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 베스트/워스트 채널그룹 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>이번달 상승 채널그룹 (전월 대비)</CardTitle>
              <Badge variant="positive">상승 Top 3</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-muted-foreground border-b">
                    <th className="py-2">채널그룹</th>
                    <th className="py-2 text-right">이번달</th>
                    <th className="py-2 text-right">전월</th>
                    <th className="py-2 text-right">증가</th>
                  </tr>
                </thead>
                <tbody>
                  {bw.best.map((b) => {
                    const ch = buildChange(b.current, b.prev, "전월");
                    return (
                      <tr key={b.group} className="border-b last:border-0">
                        <td className="py-2 font-medium">{b.group}</td>
                        <td className="py-2 text-right tabular-nums">{formatKRWLong(b.current)}</td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">
                          {formatKRWLong(b.prev)}
                        </td>
                        <td className="py-2 text-right tabular-nums text-emerald-700">
                          <div>{ch.diffText}</div>
                          <div className="text-[10px]">{ch.pctText}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>이번달 하락 채널그룹 (전월 대비)</CardTitle>
              <Badge variant="negative">하락 Top 3</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-muted-foreground border-b">
                    <th className="py-2">채널그룹</th>
                    <th className="py-2 text-right">이번달</th>
                    <th className="py-2 text-right">전월</th>
                    <th className="py-2 text-right">감소</th>
                  </tr>
                </thead>
                <tbody>
                  {bw.worst.map((b) => {
                    const ch = buildChange(b.current, b.prev, "전월");
                    return (
                      <tr key={b.group} className="border-b last:border-0">
                        <td className="py-2 font-medium">{b.group}</td>
                        <td className="py-2 text-right tabular-nums">{formatKRWLong(b.current)}</td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">
                          {formatKRWLong(b.prev)}
                        </td>
                        <td className="py-2 text-right tabular-nums text-rose-700">
                          <div>{ch.diffText}</div>
                          <div className="text-[10px]">{ch.pctText}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 신제품 / 이탈 SKU */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>신제품 (직전 13개월 무매출 → 이번달)</CardTitle>
              <Badge variant="info">{np.length}개</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4 overflow-x-auto">
              {np.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4">해당 없음</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] text-muted-foreground border-b">
                      <th className="py-2">제품</th>
                      <th className="py-2 text-right">수량</th>
                      <th className="py-2 text-right">실매출</th>
                    </tr>
                  </thead>
                  <tbody>
                    {np.map((p) => (
                      <tr key={p.name} className="border-b last:border-0">
                        <td className="py-2 max-w-[280px] truncate">
                          <span className="text-muted-foreground text-xs mr-1">[{p.brand}]</span>
                          {p.name}
                        </td>
                        <td className="py-2 text-right tabular-nums">{formatInt(p.qty)}</td>
                        <td className="py-2 text-right tabular-nums">{formatKRWLong(p.revenue)}</td>
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
              <CardTitle>이탈 위험 SKU (직전 3개월 평균 대비 -50% 이상)</CardTitle>
              <Badge variant="negative">{dec.length}개</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4 overflow-x-auto">
              {dec.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4">해당 없음</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] text-muted-foreground border-b">
                      <th className="py-2">제품</th>
                      <th className="py-2 text-right">직전 평균</th>
                      <th className="py-2 text-right">이번달</th>
                      <th className="py-2 text-right">변화</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dec.map((p) => (
                      <tr key={p.name} className="border-b last:border-0">
                        <td className="py-2 max-w-[240px] truncate">
                          <span className="text-muted-foreground text-xs mr-1">[{p.brand}]</span>
                          {p.name}
                        </td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">
                          {formatKRWLong(p.prevAvg)}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {p.current > 0 ? formatKRWLong(p.current) : "0원"}
                        </td>
                        <td className="py-2 text-right tabular-nums text-rose-700">
                          {formatPctAbs(p.pct, 0)}
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

      {/* 요일별 + 거래처 집중도 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>요일별 매출 패턴</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart
              categories={weekday.map((w) => `${w.day}요일`)}
              series={[
                {
                  name: "실매출",
                  values: weekday.map((w) => w.revenue),
                  color: "#6366f1",
                },
              ]}
              height={240}
              showLegend={false}
              yLabel="실매출"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>거래처 집중도</CardTitle>
            <div className="text-[11px] text-muted-foreground">
              상위 거래처 의존도 + 집중지수
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              <div>
                <div className="text-[11px] text-muted-foreground">상위 10 거래처 비중</div>
                <div className="text-2xl font-semibold tabular-nums">
                  {formatPctAbs(conc.top10Pct)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground">거래처 집중지수</div>
                <div className="text-lg font-semibold tabular-nums">{conc.hhi.toFixed(0)}</div>
                <div className="text-[10px] text-muted-foreground">
                  {conc.hhi < 1500 ? "낮음 (분산 거래)" : conc.hhi < 2500 ? "중간" : "높음 (집중 거래)"}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground">활성 거래처 수</div>
                <div className="text-lg font-semibold tabular-nums">
                  {formatInt(conc.customerCount)}곳
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 브랜드 × 채널그룹 히트맵 */}
      {heat.brands.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>브랜드 × 채널그룹 히트맵 (이번달 실매출)</CardTitle>
          </CardHeader>
          <CardContent>
            <HeatmapChart
              xCategories={heat.groups}
              yCategories={heat.brands}
              data={heatmapData}
              height={Math.max(280, heat.brands.length * 40)}
            />
          </CardContent>
        </Card>
      )}

      {/* 채널그룹별 할인율/수수료율 */}
      <Card>
        <CardHeader>
          <CardTitle>채널그룹별 할인율 / 수수료율</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="px-4 pb-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground border-b">
                  <th className="py-2">채널그룹</th>
                  <th className="py-2 text-right">실매출</th>
                  <th className="py-2 text-right">주문금액</th>
                  <th className="py-2 text-right">할인율</th>
                  <th className="py-2 text-right">수수료율</th>
                  <th className="py-2 text-right">정산매출</th>
                </tr>
              </thead>
              <tbody>
                {df.map((g) => (
                  <tr key={g.group} className="border-b last:border-0">
                    <td className="py-2 font-medium">{g.group}</td>
                    <td className="py-2 text-right tabular-nums">{formatKRWLong(g.revenue)}</td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">
                      {formatKRWLong(g.orderAmount)}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatPctAbs(g.discountRate, 1)}
                    </td>
                    <td className="py-2 text-right tabular-nums">{formatPctAbs(g.feeRate, 1)}</td>
                    <td className="py-2 text-right tabular-nums">{formatKRWLong(g.settlement)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 사람 코멘트 — 옵션. insights/{ym}.md 가 있을 때만 노출 */}
      {humanComment && (
        <Card>
          <CardHeader>
            <CardTitle>이번 달 사람 코멘트 (수기 작성)</CardTitle>
            <div className="text-[11px] text-muted-foreground">
              insights/{ym}.md 파일 — 자동 분석으로 잡히지 않는 맥락(특이 발주, 영업 액션포인트 등)을 기록
            </div>
          </CardHeader>
          <CardContent>
            <article
              className="prose prose-sm max-w-none [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_h1]:mt-4 [&_h2]:mt-4 [&_h3]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-neutral-300 [&_blockquote]:pl-3 [&_blockquote]:text-neutral-500"
              dangerouslySetInnerHTML={{ __html: humanComment }}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
