"use client";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { Chart } from "./ChartBase";
import { formatKRWLong, formatKRWShort } from "@/lib/format";
import { customerHref } from "@/components/CustomerLink";

export type TreemapNode = {
  name: string;
  value: number;
  itemStyle?: { color?: string };
  children?: TreemapNode[];
};

type TreemapProps = {
  data: TreemapNode[];
  height?: number;
  // 노드 클릭 시 거래처 분석으로 이동
  customerLinkMonth?: string;
  // 거래처명을 추출하는 prefix(예: "면세점/"). prefix로 시작하는 노드만 라우팅
  customerNamePrefix?: string;
};

export function Treemap({ data, height = 360, customerLinkMonth, customerNamePrefix }: TreemapProps) {
  const router = useRouter();
  const onEvents = useMemo(() => {
    if (!customerLinkMonth) return undefined;
    return {
      click: (params: unknown) => {
        const p = params as { name?: string };
        if (!p?.name) return;
        let customer = p.name;
        if (customerNamePrefix) {
          if (!p.name.startsWith(customerNamePrefix)) return;
          customer = p.name.slice(customerNamePrefix.length);
        }
        if (!customer) return;
        router.push(customerHref(customer, customerLinkMonth));
      },
    };
  }, [customerLinkMonth, customerNamePrefix, router]);

  return (
    <Chart
      height={height}
      onEvents={onEvents}
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
