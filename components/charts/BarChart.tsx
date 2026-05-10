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
}: BarChartProps) {
  const fmt = formatter ?? formatKRWLong;
  const axisFmt = formatKRWShort;

  return (
    <Chart
      height={height}
      option={{
        legend: showLegend && series.length > 1
          ? { data: series.map((s) => s.name), top: 0, type: "scroll" }
          : { show: false },
        grid: { top: showLegend && series.length > 1 ? 30 : 10, left: 10, right: 30, bottom: 30, containLabel: true },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          formatter: (params: any) => {
            const arr = Array.isArray(params) ? params : [params];
            const cat = arr[0]?.axisValueLabel ?? arr[0]?.name ?? "";
            const lines = arr.map(
              (p: any) =>
                `<div style="display:flex;justify-content:space-between;gap:12px"><span>${p.marker} ${p.seriesName}</span><span style="font-variant-numeric:tabular-nums">${fmt(p.value as number)}</span></div>`,
            );
            return `<div style="font-weight:600;margin-bottom:4px">${cat}</div>${lines.join("")}`;
          },
        },
        xAxis: horizontal
          ? { type: "value", axisLabel: { formatter: (v: number) => axisFmt(v) }, name: yLabel }
          : { type: "category", data: categories, axisLabel: { interval: 0, rotate: categories.length > 8 ? -25 : 0 } },
        yAxis: horizontal
          ? { type: "category", data: categories, inverse: true }
          : { type: "value", axisLabel: { formatter: (v: number) => axisFmt(v) }, name: yLabel },
        series: series.map((s) => ({
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
        })),
      }}
    />
  );
}
