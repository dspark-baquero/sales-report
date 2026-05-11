"use client";
import { Chart } from "./ChartBase";
import { formatKRWLong, formatKRWShort } from "@/lib/format";

export type BarSeries = {
  name: string;
  values: number[];
  color?: string;
  stack?: string;        // 같은 stack 값을 가진 series는 누적
};

type BarChartProps = {
  categories: string[];
  series: BarSeries[];
  horizontal?: boolean;
  height?: number;
  showLegend?: boolean;
  yLabel?: string;
  formatter?: (v: number) => string;
  showValueLabels?: boolean;
  showStackTotals?: boolean;   // 스택 막대의 합계를 막대 최상단에 표기
};

export function BarChart({
  categories,
  series,
  horizontal,
  height = 300,
  showLegend = true,
  yLabel,
  formatter,
  showValueLabels,
  showStackTotals,
}: BarChartProps) {
  const fmt = formatter ?? formatKRWLong;
  const axisFmt = formatKRWShort;

  const TOTAL_KEY = "__stack_total__";
  const stack0 = series[0]?.stack;
  const stackedAll = !!stack0 && series.every((s) => s.stack === stack0);
  const totals: number[] | null =
    showStackTotals && stackedAll
      ? categories.map((_, i) => series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0))
      : null;

  const baseSeries: any[] = series.map((s) => ({
    type: "bar",
    name: s.name,
    data: s.values,
    stack: s.stack,
    itemStyle: s.color ? { color: s.color } : undefined,
    label: showValueLabels
      ? {
          show: true,
          position: horizontal ? "right" : "top",
          formatter: (p: any) => axisFmt(p.value as number),
          fontSize: 11,
        }
      : undefined,
    barMaxWidth: 40,
  }));

  // 합계 표기용 투명 0높이 시리즈 — 같은 stack에 묶여 최상단 위치에 라벨만 표시
  if (totals) {
    baseSeries.push({
      type: "bar",
      name: TOTAL_KEY,
      data: totals.map(() => 0),
      stack: stack0,
      itemStyle: { color: "transparent" },
      emphasis: { disabled: true },
      silent: true,
      tooltip: { show: false },
      label: {
        show: true,
        position: horizontal ? "right" : "top",
        formatter: (p: any) => fmt(totals[p.dataIndex] ?? 0),
        fontSize: 12,
        fontWeight: 600,
        color: "#111827",
        distance: 6,
      },
      barMaxWidth: 40,
    });
  }

  const legendData = series.map((s) => s.name);

  return (
    <Chart
      height={height}
      option={{
        legend: showLegend && series.length > 1
          ? { data: legendData, top: 0, type: "scroll" }
          : { show: false },
        grid: { top: showLegend && series.length > 1 ? 30 : 10, left: 10, right: 30, bottom: 30, containLabel: true },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          formatter: (params: any) => {
            const arr = (Array.isArray(params) ? params : [params]).filter(
              (p: any) => p.seriesName !== TOTAL_KEY,
            );
            const cat = arr[0]?.axisValueLabel ?? arr[0]?.name ?? "";
            const lines = arr.map(
              (p: any) =>
                `<div style="display:flex;justify-content:space-between;gap:12px"><span>${p.marker} ${p.seriesName}</span><span style="font-variant-numeric:tabular-nums">${fmt(p.value as number)}</span></div>`,
            );
            const showSum = totals !== null && arr.length > 1;
            const sumLine = showSum
              ? `<div style="display:flex;justify-content:space-between;gap:12px;margin-top:4px;padding-top:4px;border-top:1px solid #e5e7eb;font-weight:600"><span>합계</span><span style="font-variant-numeric:tabular-nums">${fmt(
                  arr.reduce((s: number, p: any) => s + ((p.value as number) ?? 0), 0),
                )}</span></div>`
              : "";
            return `<div style="font-weight:600;margin-bottom:4px">${cat}</div>${lines.join("")}${sumLine}`;
          },
        },
        xAxis: horizontal
          ? { type: "value", axisLabel: { formatter: (v: number) => axisFmt(v) }, name: yLabel }
          : { type: "category", data: categories, axisLabel: { interval: 0, rotate: categories.length > 8 ? -25 : 0 } },
        yAxis: horizontal
          ? { type: "category", data: categories, inverse: true }
          : { type: "value", axisLabel: { formatter: (v: number) => axisFmt(v) }, name: yLabel },
        series: baseSeries,
      }}
    />
  );
}
