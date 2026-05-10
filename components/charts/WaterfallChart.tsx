"use client";
import { Chart } from "./ChartBase";
import { formatKRWLong, formatKRWShort } from "@/lib/format";
import type { WaterfallStep } from "@/lib/changeAttribution";

type WaterfallChartProps = {
  steps: WaterfallStep[];
  height?: number;
};

export function WaterfallChart({ steps, height = 360 }: WaterfallChartProps) {
  // ECharts waterfall = stacked bars: 시작 누적값(투명) + 본 값(색).
  // type=start/end: 절대값. gain/loss: 누적 위에 ± 추가.
  const placeholder: number[] = [];
  const positive: number[] = [];
  const negative: number[] = [];
  let acc = 0;
  steps.forEach((s) => {
    if (s.type === "start") {
      placeholder.push(0);
      positive.push(s.value);
      negative.push(0);
      acc = s.value;
    } else if (s.type === "end") {
      placeholder.push(0);
      positive.push(s.value);
      negative.push(0);
    } else if (s.value >= 0) {
      placeholder.push(acc);
      positive.push(s.value);
      negative.push(0);
      acc += s.value;
    } else {
      const newAcc = acc + s.value; // s.value < 0
      placeholder.push(newAcc);
      positive.push(0);
      negative.push(-s.value);
      acc = newAcc;
    }
  });

  const categories = steps.map((s) => s.name);
  const colorMap = (s: WaterfallStep) => {
    if (s.type === "start") return "#475569";
    if (s.type === "end") return "#0f172a";
    if (s.type === "gain") return "#10b981";
    if (s.type === "loss") return "#f43f5e";
    return "#94a3b8";
  };

  return (
    <Chart
      height={height}
      option={{
        grid: { left: 70, right: 30, top: 30, bottom: 70, containLabel: true },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          formatter: (params: any) => {
            const idx = (Array.isArray(params) ? params[0] : params).dataIndex as number;
            const s = steps[idx];
            const sign = s.type === "loss" || s.value < 0 ? "" : (s.type === "gain" ? "+" : "");
            const prefix = s.type === "start" ? "전월 합계" : s.type === "end" ? "본월 합계" : s.value >= 0 ? "기여" : "감소";
            return `<div style="font-weight:600;margin-bottom:4px">${s.name}</div><div>${prefix}: <span style="font-variant-numeric:tabular-nums">${sign}${formatKRWLong(Math.abs(s.value))}</span></div>`;
          },
        },
        xAxis: {
          type: "category",
          data: categories,
          axisLabel: {
            rotate: categories.length > 6 ? -25 : 0,
            fontSize: 11,
            interval: 0,
            formatter: (v: string) => (v.length > 12 ? v.slice(0, 12) + "…" : v),
          },
        },
        yAxis: { type: "value", axisLabel: { formatter: (v: number) => formatKRWShort(v) } },
        series: [
          {
            type: "bar",
            name: "받침",
            stack: "wf",
            data: placeholder.map((v, i) => ({
              value: v,
              itemStyle: { color: "transparent", borderColor: "transparent" },
              // start/end는 placeholder=0이라 색칠 X
              label: { show: false },
            })),
            barMaxWidth: 40,
          },
          {
            type: "bar",
            name: "증가/시작/끝",
            stack: "wf",
            data: positive.map((v, i) => ({
              value: v,
              itemStyle: { color: colorMap(steps[i]) },
            })),
            label: {
              show: true,
              position: "top",
              formatter: (p: any) => {
                const s = steps[p.dataIndex];
                if (s.type === "start" || s.type === "end") return formatKRWShort(s.value);
                if (s.value > 0) return `+${formatKRWShort(s.value)}`;
                return "";
              },
              fontSize: 11,
            },
            barMaxWidth: 40,
          },
          {
            type: "bar",
            name: "감소",
            stack: "wf",
            data: negative.map((v, i) => ({
              value: v,
              itemStyle: { color: colorMap(steps[i]) },
            })),
            label: {
              show: true,
              position: "bottom",
              formatter: (p: any) => {
                const s = steps[p.dataIndex];
                if (s.type === "loss" || (s.value < 0 && s.type !== "start" && s.type !== "end")) {
                  return formatKRWShort(s.value); // 음수
                }
                return "";
              },
              fontSize: 11,
            },
            barMaxWidth: 40,
          },
        ],
      }}
    />
  );
}
