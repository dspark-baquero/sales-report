"use client";
import { Chart } from "./ChartBase";
import { formatKRWLong, formatKRWShort } from "@/lib/format";

export type LineSeries = {
  name: string;
  values: number[];
  color?: string;
  dashed?: boolean;
  smooth?: boolean;
  area?: boolean;
};

type LineChartProps = {
  categories: string[];
  series: LineSeries[];
  height?: number;
  showLegend?: boolean;
  yLabel?: string;
  formatter?: (v: number) => string;
};

export function LineChart({
  categories,
  series,
  height = 300,
  showLegend = true,
  yLabel,
  formatter,
}: LineChartProps) {
  const fmt = formatter ?? formatKRWLong;
  const axisFmt = formatKRWShort;

  return (
    <Chart
      height={height}
      option={{
        legend: showLegend ? { data: series.map((s) => s.name), top: 0, type: "scroll" } : { show: false },
        grid: { top: showLegend ? 30 : 10, left: 10, right: 30, bottom: 30, containLabel: true },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "line" },
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
        xAxis: { type: "category", data: categories, boundaryGap: false },
        yAxis: { type: "value", axisLabel: { formatter: (v: number) => axisFmt(v) }, name: yLabel },
        series: series.map((s) => ({
          type: "line",
          name: s.name,
          data: s.values,
          smooth: s.smooth ?? false,
          showSymbol: true,
          symbolSize: 5,
          lineStyle: { color: s.color, width: 2, type: s.dashed ? "dashed" : "solid" },
          itemStyle: { color: s.color },
          areaStyle: s.area ? { opacity: 0.1, color: s.color } : undefined,
        })),
      }}
    />
  );
}
