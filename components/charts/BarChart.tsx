"use client";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { Chart } from "./ChartBase";
import { formatKRWLong, formatKRWShort } from "@/lib/format";
import { customerHref } from "@/components/CustomerLink";

export type BarSeries = {
  name: string;
  values: number[];
  color?: string;
  stack?: string;        // 같은 stack 값을 가진 series는 누적
};

// 막대 위에 겹쳐 그리는 라인 (예: 월별 목표, 전년 동기)
export type LineOverlay = {
  name: string;
  values: number[];
  color?: string;
  dashed?: boolean;
  symbol?: "diamond" | "circle" | "rect" | "triangle";
};

// X축 카테고리 라벨 아래 한 줄 더 표기 (예: 월별 달성률). tone으로 색상 구분.
export type XAxisSubLabel = { text: string; tone: "good" | "warn" | "bad" | "muted" };

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
  lineOverlays?: LineOverlay[]; // 막대 위에 겹쳐 그리는 라인 (vertical only)
  // categories가 거래처명일 때 ym을 전달하면 막대/카테고리 라벨 클릭 시 거래처 분석으로 이동
  customerLinkMonth?: string;
  // X축 라벨 아래 보조 라벨 (예: 월별 달성률). categories와 같은 길이, 없는 항목은 null. (vertical only)
  xAxisSubLabels?: (XAxisSubLabel | null)[];
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
  lineOverlays,
  customerLinkMonth,
  xAxisSubLabels,
}: BarChartProps) {
  const fmt = formatter ?? formatKRWLong;
  // formatter를 주면 축·값 라벨까지 그 포맷을 따른다
  // (금액이 아닌 차트 — 거래처 수 등 — 에서 축이 "원"으로 찍히지 않도록).
  const axisFmt = formatter ?? formatKRWShort;

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
        // 합계 0(빈 칸, 예: 전망 월)은 라벨 숨김.
        formatter: (p: any) => {
          const v = totals[p.dataIndex] ?? 0;
          return v > 0 ? fmt(v) : "";
        },
        fontSize: 12,
        fontWeight: 600,
        color: "#111827",
        distance: 6,
      },
      barMaxWidth: 40,
    });
  }

  // 라인 오버레이 시리즈 (vertical only) — 합계 sum 계산에서 제외하기 위해 이름을 set으로 저장
  const overlayNames = new Set<string>();
  if (!horizontal && lineOverlays && lineOverlays.length > 0) {
    for (const ov of lineOverlays) {
      overlayNames.add(ov.name);
      baseSeries.push({
        type: "line",
        name: ov.name,
        data: ov.values,
        smooth: false,
        symbol: ov.symbol ?? "circle",
        symbolSize: 8,
        itemStyle: ov.color ? { color: ov.color } : undefined,
        lineStyle: {
          type: ov.dashed ? "dashed" : "solid",
          width: 2,
          color: ov.color,
        },
        z: 5,
        emphasis: { focus: "series" },
      });
    }
  }

  const legendData = [
    ...series.map((s) => s.name),
    ...(lineOverlays ?? []).map((ov) => ov.name),
  ];
  const showLegendFinal = showLegend && (series.length > 1 || (lineOverlays?.length ?? 0) > 0);

  const router = useRouter();
  const onEvents = useMemo(() => {
    if (!customerLinkMonth) return undefined;
    return {
      click: (params: unknown) => {
        const p = params as { name?: string; seriesName?: string };
        if (!p?.name || p.seriesName === TOTAL_KEY) return;
        router.push(customerHref(p.name, customerLinkMonth));
      },
    };
  }, [customerLinkMonth, router]);

  return (
    <Chart
      height={height}
      onEvents={onEvents}
      option={{
        legend: showLegendFinal
          ? { data: legendData, top: 0, type: "scroll" }
          : { show: false },
        grid: { top: showLegendFinal ? 30 : 10, left: 10, right: 30, bottom: 30, containLabel: true },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          formatter: (params: any) => {
            const arr = (Array.isArray(params) ? params : [params]).filter(
              (p: any) => p.seriesName !== TOTAL_KEY,
            );
            const cat = arr[0]?.axisValueLabel ?? arr[0]?.name ?? "";
            // 막대 시리즈와 라인 오버레이 시리즈를 구분해서 정렬 (라인은 항상 마지막에)
            const barItems = arr.filter((p: any) => !overlayNames.has(p.seriesName));
            const lineItems = arr.filter((p: any) => overlayNames.has(p.seriesName));
            const barLines = barItems.map(
              (p: any) =>
                `<div style="display:flex;justify-content:space-between;gap:12px"><span>${p.marker} ${p.seriesName}</span><span style="font-variant-numeric:tabular-nums">${fmt(p.value as number)}</span></div>`,
            );
            const showSum = totals !== null && barItems.length > 1;
            const sumLine = showSum
              ? `<div style="display:flex;justify-content:space-between;gap:12px;margin-top:4px;padding-top:4px;border-top:1px solid #e5e7eb;font-weight:600"><span>합계</span><span style="font-variant-numeric:tabular-nums">${fmt(
                  barItems.reduce((s: number, p: any) => s + ((p.value as number) ?? 0), 0),
                )}</span></div>`
              : "";
            const overlayLines = lineItems.length > 0
              ? `<div style="margin-top:4px;padding-top:4px;border-top:1px solid #e5e7eb">${lineItems
                  .map(
                    (p: any) =>
                      `<div style="display:flex;justify-content:space-between;gap:12px"><span>${p.marker} ${p.seriesName}</span><span style="font-variant-numeric:tabular-nums">${fmt(p.value as number)}</span></div>`,
                  )
                  .join("")}</div>`
              : "";
            return `<div style="font-weight:600;margin-bottom:4px">${cat}</div>${barLines.join("")}${sumLine}${overlayLines}`;
          },
        },
        xAxis: horizontal
          ? { type: "value", axisLabel: { formatter: (v: number) => axisFmt(v) }, name: yLabel }
          : {
              type: "category",
              data: categories,
              axisLabel: xAxisSubLabels
                ? {
                    interval: 0,
                    // 보조 라벨(달성률)을 두 줄로 표기하므로 회전하지 않음.
                    formatter: (value: string, index: number) => {
                      const sub = xAxisSubLabels[index];
                      return sub ? `${value}\n{${sub.tone}|${sub.text}}` : value;
                    },
                    rich: {
                      good: { fontSize: 10, fontWeight: 600, color: "#047857", padding: [3, 0, 0, 0] },
                      warn: { fontSize: 10, fontWeight: 600, color: "#d97706", padding: [3, 0, 0, 0] },
                      bad: { fontSize: 10, fontWeight: 600, color: "#e11d48", padding: [3, 0, 0, 0] },
                      muted: { fontSize: 10, fontWeight: 600, color: "#94a3b8", padding: [3, 0, 0, 0] },
                    },
                  }
                : { interval: 0, rotate: categories.length > 8 ? -25 : 0 },
            },
        yAxis: horizontal
          ? { type: "category", data: categories, inverse: true }
          : { type: "value", axisLabel: { formatter: (v: number) => axisFmt(v) }, name: yLabel },
        series: baseSeries,
      }}
    />
  );
}
