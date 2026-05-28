"use client";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { Chart } from "./ChartBase";
import { formatKRWLong, formatPctAbs } from "@/lib/format";
import { customerHref } from "@/components/CustomerLink";

export type DonutItem = {
  name: string;
  value: number;
  color?: string;
};

type DonutChartProps = {
  items: DonutItem[];
  height?: number;
  showCenter?: { label?: string; value?: string };
  // items.name이 거래처명일 때 ym을 전달하면 조각 클릭 시 거래처 분석으로 이동
  customerLinkMonth?: string;
};

export function DonutChart({ items, height = 280, showCenter, customerLinkMonth }: DonutChartProps) {
  const total = items.reduce((s, i) => s + i.value, 0);
  const router = useRouter();
  const onEvents = useMemo(() => {
    if (!customerLinkMonth) return undefined;
    return {
      click: (params: unknown) => {
        const p = params as { name?: string };
        if (!p?.name) return;
        router.push(customerHref(p.name, customerLinkMonth));
      },
    };
  }, [customerLinkMonth, router]);
  return (
    <Chart
      height={height}
      onEvents={onEvents}
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
