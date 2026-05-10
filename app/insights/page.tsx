import fs from "fs";
import path from "path";
import { marked } from "marked";
import { loadSalesRows } from "@/lib/load";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart } from "@/components/charts/BarChart";
import { HeatmapChart } from "@/components/charts/HeatmapChart";
import {
  formatKRWLong,
  formatInt,
  formatYM,
  formatPctAbs,
  buildChange,
} from "@/lib/format";

type SearchParams = Promise<{ month?: string }>;

export default async function InsightsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const ym = resolveMonth(sp.month);
  const all = loadSalesRows();

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
        <h2 className="text-xl font-semibold tracking-tight">{formatYM(ym)} 인사이트</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          사람이 작성한 코멘트 + 자동 통계 카드
        </p>
      </div>

      {humanComment ? (
        <Card>
          <CardHeader>
            <CardTitle>이번 달 코멘트 (사람 작성)</CardTitle>
          </CardHeader>
          <CardContent>
            <article
              className="prose prose-sm max-w-none [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_h1]:mt-4 [&_h2]:mt-4 [&_h3]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-neutral-300 [&_blockquote]:pl-3 [&_blockquote]:text-neutral-500"
              dangerouslySetInnerHTML={{ __html: humanComment }}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">
              <p className="font-medium mb-1 text-foreground">코멘트 파일이 없습니다.</p>
              <p>
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">insights/{ym}.md</code>
                를 만들어 이번 달 코멘트를 마크다운으로 작성하세요.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

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
    </div>
  );
}
