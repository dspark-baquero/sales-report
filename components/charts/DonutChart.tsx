"use client";
import { Chart } from "./ChartBase";
import { formatKRWLong, formatPctAbs } from "@/lib/format";

export type DonutItem = {
  name: string;
  value: number;
  color?: string;
};

type DonutChartProps = {
  items: DonutItem[];
  height?: number;
  showCenter?: { label?: string; value?: string };
};

export function DonutChart({ items, height = 280, showCenter }: DonutChartProps) {
  const total = items.reduce((s, i) => s + i.value, 0);
  return (
    <Chart
      height={height}
      option={{
        tooltip: {
          formatter: (p: any) => {
            const pct = total > 0 ? (p.value as number) / total : 0;
            return `<div style="font-weight:600">${p.name}</div><div style="font-variant-numeric:tabular-nums">${formatKRWLong(p.value as number)} · ${formatPctAbs(pct)}</div>`;
          },
        },
        legend: { orient: "vertical", right: 8, top: "middle", textStyle: { fontSize: 11 } },
        graphic: showCenter
          ? {
              type: "group",
              left: "30%",
              top: "center",
              children: [
                {
                  type: "text",
                  left: "center",
                  top: -14,
                  style: { text: showCenter.label ?? "", fill: "#64748b", fontSize: 11 },
                },
                {
                  type: "text",
                  left: "center",
                  top: 4,
                  style: { text: showCenter.value ?? "", fill: "#0f172a", fontSize: 16, fontWeight: 700 },
                },
              ],
            }
          : undefined,
        series: [
          {
            type: "pie",
            radius: ["55%", "78%"],
            center: ["30%", "50%"],
            data: items.map((i) => ({
              name: i.name,
              value: i.value,
              itemStyle: i.color ? { color: i.color } : undefined,
            })),
            label: { show: false },
            emphasis: {
              label: { show: false },
              itemStyle: { borderWidth: 2, borderColor: "#fff" },
            },
          },
        ],
      }}
    />
  );
}
