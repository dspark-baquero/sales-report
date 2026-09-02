"use client";
import { Chart } from "./ChartBase";
import { axisFormatter, fullFormatter, type ValueFormat } from "./valueFormat";

type HeatmapChartProps = {
  xCategories: string[];
  yCategories: string[];
  data: { x: number; y: number; value: number }[];
  height?: number;
  // 값 서식. 함수를 받으면 서버 컴포넌트에서 넘길 수 없으므로 종류만 받는다(./valueFormat).
  valueFormat?: ValueFormat;
  unitSuffix?: string;         // valueFormat="count" 일 때 단위 (기본 "개")
  colorRange?: [string, string];
};

export function HeatmapChart({
  xCategories,
  yCategories,
  data,
  height = 360,
  valueFormat,
  unitSuffix,
  colorRange = ["#f1f5f9", "#0f172a"],
}: HeatmapChartProps) {
  const fmt = fullFormatter(valueFormat, unitSuffix);
  const axisFmt = axisFormatter(valueFormat, unitSuffix);
  const max = data.reduce((m, d) => Math.max(m, d.value), 0);
  const points = data.map((d) => [d.x, d.y, d.value]);
  return (
    <Chart
      height={height}
      option={{
        grid: { top: 30, bottom: 60, left: 10, right: 30, containLabel: true },
        tooltip: {
          formatter: (p: any) => {
            const [x, y, v] = p.value as [number, number, number];
            return `<div style="font-weight:600">${yCategories[y]} × ${xCategories[x]}</div><div style="font-variant-numeric:tabular-nums">${fmt(v)}</div>`;
          },
        },
        xAxis: { type: "category", data: xCategories, axisLabel: { rotate: -25 }, splitArea: { show: true } },
        yAxis: { type: "category", data: yCategories, splitArea: { show: true } },
        visualMap: {
          min: 0,
          max: max || 1,
          calculable: true,
          orient: "horizontal",
          left: "center",
          bottom: 0,
          inRange: { color: colorRange },
          textStyle: { fontSize: 11 },
          formatter: ((v: number | string) => axisFmt(typeof v === "number" ? v : Number(v))) as any,
        },
        series: [
          {
            type: "heatmap",
            data: points,
            label: { show: false },
            emphasis: { itemStyle: { borderColor: "#0f172a", borderWidth: 1 } },
          },
        ],
      }}
    />
  );
}
