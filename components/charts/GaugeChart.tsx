"use client";
import { Chart } from "./ChartBase";
import { formatPctAbs } from "@/lib/format";

type GaugeChartProps = {
  rate: number | null;     // 0 ~ 1+
  height?: number;
  label?: string;
};

export function GaugeChart({ rate, height = 220, label }: GaugeChartProps) {
  const v = rate === null ? 0 : Math.max(0, Math.min(1.5, rate));
  const colorStops: [number, string][] =
    rate === null
      ? [[1, "#94a3b8"]]
      : [
          [0.7 / 1.5, "#f43f5e"],
          [1.0 / 1.5, "#f59e0b"],
          [1.5 / 1.5, "#10b981"],
        ];
  return (
    <Chart
      height={height}
      option={{
        grid: { top: 0, bottom: 0, left: 0, right: 0 },
        series: [
          {
            type: "gauge",
            min: 0,
            max: 1.5,
            startAngle: 220,
            endAngle: -40,
            progress: { show: false },
            axisLine: {
              lineStyle: {
                width: 18,
                color: colorStops,
              },
            },
            axisTick: { show: false },
            splitLine: { length: 6, distance: -18, lineStyle: { color: "#fff" } },
            axisLabel: {
              distance: -28,
              color: "#94a3b8",
              fontSize: 10,
              formatter: (v: number) => (v === 0 || v === 1 || v === 1.5 ? `${Math.round(v * 100)}%` : ""),
            },
            pointer: {
              icon: "path://M2,0 L-2,0 L0,-65 z",
              length: "70%",
              width: 6,
              offsetCenter: [0, "0%"],
              itemStyle: { color: "#0f172a" },
            },
            anchor: { show: true, size: 10, itemStyle: { color: "#0f172a" } },
            title: { show: !!label, offsetCenter: [0, "70%"], color: "#64748b", fontSize: 12 },
            detail: {
              valueAnimation: false,
              offsetCenter: [0, "30%"],
              fontSize: 22,
              fontWeight: "bold",
              color: "#0f172a",
              formatter: () => (rate === null ? "—" : formatPctAbs(rate, 1)),
            },
            data: [{ value: v, name: label ?? "" }],
          },
        ],
      }}
    />
  );
}
