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
  // 기본 true: 옵션이 props로 바뀔 때마다 ECharts가 이전 옵션과 머지하지 않도록.
  // 머지가 켜져 있으면 series 개수/이름이 바뀌었을 때 툴팁 formatter나 캐시된 axisLabel 데이터가
  // 이전 옵션의 것을 그대로 사용해 "차트는 새 데이터 / 툴팁은 옛 데이터" 같은 불일치가 발생.
  return (
    <ReactEChartsCore
      echarts={echarts}
      option={option}
      style={{ height, width: "100%" }}
      className={className}
      notMerge={notMerge ?? true}
      lazyUpdate
      onEvents={onEvents}
      opts={{ renderer: "canvas" }}
    />
  );
}
