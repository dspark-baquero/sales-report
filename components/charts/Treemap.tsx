"use client";
import { Chart } from "./ChartBase";
import { formatKRWLong, formatKRWShort } from "@/lib/format";

export type TreemapNode = {
  name: string;
  value: number;
  itemStyle?: { color?: string };
  children?: TreemapNode[];
};

type TreemapProps = {
  data: TreemapNode[];
  height?: number;
};

export function Treemap({ data, height = 360 }: TreemapProps) {
  return (
    <Chart
      height={height}
      option={{
        tooltip: {
          formatter: (p: any) =>
            `<div style="font-weight:600">${p.name}</div><div style="font-variant-numeric:tabular-nums">${formatKRWLong(p.value as number)}</div>`,
        },
        series: [
          {
            type: "treemap",
            data,
            roam: false,
            nodeClick: false,
            breadcrumb: { show: false },
            label: {
              show: true,
              formatter: (p: any) => {
                const v = p.value as number;
                if (v <= 0) return "";
                return `{name|${p.name}}\n{val|${formatKRWShort(v)}}`;
              },
              rich: {
                name: { fontSize: 12, fontWeight: 600, color: "#fff", lineHeight: 14 },
                val: { fontSize: 11, color: "#e2e8f0", fontFamily: "tabular-nums" },
              },
            },
            upperLabel: { show: false },
            itemStyle: { borderColor: "#fff", borderWidth: 2, gapWidth: 2 },
            levels: [{ itemStyle: { borderWidth: 0, gapWidth: 1 } }],
          },
        ],
      }}
    />
  );
}
