"use client";
// 트리쉐이킹된 ECharts + React 래퍼. 다이나믹 청크로만 진입하도록 분리.
import * as echarts from "echarts/core";
import {
  BarChart as BarSeries,
  LineChart as LineSeries,
  PieChart,
  HeatmapChart,
  TreemapChart,
  GaugeChart,
} from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  VisualMapComponent,
  TitleComponent,
  GraphicComponent,
  AxisPointerComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import ReactEChartsCore from "echarts-for-react/lib/core";
import type { EChartsOption } from "echarts";

echarts.use([
  BarSeries,
  LineSeries,
  PieChart,
  HeatmapChart,
  TreemapChart,
  GaugeChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  VisualMapComponent,
  TitleComponent,
  GraphicComponent,
  AxisPointerComponent,
  CanvasRenderer,
]);

type Props = {
  option: EChartsOption;
  height?: number | string;
  className?: string;
  notMerge?: boolean;
  onEvents?: Record<string, (params: unknown) => void>;
};

export default function ChartImpl({ option, height = 300, className, notMerge, onEvents }: Props) {
  return (
    <ReactEChartsCore
      echarts={echarts}
      option={option}
      style={{ height, width: "100%" }}
      className={className}
      notMerge={notMerge}
      lazyUpdate
      onEvents={onEvents}
      opts={{ renderer: "canvas" }}
    />
  );
}
