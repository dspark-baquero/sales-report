"use client";
import dynamic from "next/dynamic";
import type { EChartsOption } from "echarts";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

export type ChartProps = {
  option: EChartsOption;
  height?: number | string;
  className?: string;
  notMerge?: boolean;
  onEvents?: Record<string, (params: unknown) => void>;
};

const KOREAN_FONT_FAMILY =
  'Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

const BASE_OPTION: Partial<EChartsOption> = {
  textStyle: { fontFamily: KOREAN_FONT_FAMILY, fontSize: 12 },
  animation: false,
  grid: { left: 70, right: 30, top: 20, bottom: 50, containLabel: true },
  tooltip: {
    confine: true,
    backgroundColor: "rgba(15, 23, 42, 0.95)",
    borderWidth: 0,
    textStyle: { color: "#fff", fontFamily: KOREAN_FONT_FAMILY, fontSize: 12 },
    extraCssText: "border-radius: 6px; padding: 8px 10px;",
  },
};

function deepMergeOption(base: Partial<EChartsOption>, user: EChartsOption): EChartsOption {
  return {
    ...base,
    ...user,
    textStyle: { ...base.textStyle, ...user.textStyle },
    grid: { ...(base.grid as object), ...(user.grid as object) } as EChartsOption["grid"],
    tooltip: { ...(base.tooltip as object), ...(user.tooltip as object) } as EChartsOption["tooltip"],
  };
}

export function Chart({ option, height = 300, className, notMerge, onEvents }: ChartProps) {
  const merged = deepMergeOption(BASE_OPTION, option);
  return (
    <ReactECharts
      option={merged}
      style={{ height, width: "100%" }}
      className={className}
      notMerge={notMerge}
      lazyUpdate
      onEvents={onEvents}
      opts={{ renderer: "canvas" }}
    />
  );
}
