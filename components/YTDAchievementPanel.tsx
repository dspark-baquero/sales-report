// 올해 월별 매출 추이 차트 옆 사이드 패널.
// YTD 누적 목표 / 누적 실적 / 달성률을 슬림한 세로 스택으로 표시.
//
// 차트가 흐름을 보여주는 동안 이 패널은 "지금까지 얼마나 진척" 한 줄 요약.

import { Badge } from "@/components/ui/badge";
import { buildAchievement, buildChange, formatKRWLong } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { YTDAchievement } from "@/lib/ytd";

type Props = {
  achievement: YTDAchievement;
  caption?: string;
  prevYearActual?: number;   // 전년 동기 누적 실적. 있으면 전년 대비 비교 표시.
};

const STATUS_LABEL = {
  "no-target": "목표 미설정",
  underperform: "심각 미달",
  shortfall: "미달",
  ontrack: "정상 진행",
  near: "근접 달성",
  overperform: "초과 달성",
} as const;

const STATUS_VARIANT = {
  "no-target": "muted",
  underperform: "negative",
  shortfall: "warn",
  ontrack: "positive",
  near: "positive",
  overperform: "positive",
} as const;

const RATE_COLOR = {
  "no-target": "text-muted-foreground",
  underperform: "text-rose-600",
  shortfall: "text-amber-600",
  ontrack: "text-emerald-600",
  near: "text-emerald-600",
  overperform: "text-emerald-700",
} as const;

const CHANGE_COLOR = {
  up: "text-emerald-600",
  new: "text-emerald-600",
  down: "text-rose-600",
  lost: "text-rose-600",
  flat: "text-muted-foreground",
  na: "text-muted-foreground",
} as const;

const CHANGE_ARROW = {
  up: "▲",
  new: "▲",
  down: "▼",
  lost: "▼",
  flat: "●",
  na: "●",
} as const;

export function YTDAchievementPanel({ achievement, caption, prevYearActual }: Props) {
  const { ytdActual, ytdTarget, monthsElapsed } = achievement;
  const ach = buildAchievement(ytdActual, ytdTarget);
  const range = monthsElapsed === 1 ? "1월" : `1월~${monthsElapsed}월`;

  const prevYearChange =
    prevYearActual != null && prevYearActual > 0
      ? buildChange(ytdActual, prevYearActual, "전년 동기")
      : null;

  return (
    <div className="flex flex-col justify-center gap-3 rounded-md border bg-muted/30 px-4 py-4 h-full avoid-break">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-xs text-muted-foreground">올해 누적 ({range})</div>
        <Badge variant={STATUS_VARIANT[ach.status]} className="text-[10px]">
          {STATUS_LABEL[ach.status]}
        </Badge>
      </div>
      {caption && <div className="text-[11px] text-muted-foreground -mt-1">{caption}</div>}

      <div className="space-y-1">
        <div className="text-[11px] text-muted-foreground">누적 목표</div>
        <div className="text-sm font-medium tabular-nums">
          {ytdTarget > 0 ? formatKRWLong(ytdTarget) : "—"}
        </div>
      </div>

      <div className="space-y-1">
        <div className="text-[11px] text-muted-foreground">누적 실적</div>
        <div className="text-base font-semibold tabular-nums">{formatKRWLong(ytdActual)}</div>
      </div>

      {prevYearChange && (
        <div className="space-y-1">
          <div className="text-[11px] text-muted-foreground">전년 동기 누적</div>
          <div className="text-sm font-medium tabular-nums">{formatKRWLong(prevYearChange.prev)}</div>
          <div
            className={cn(
              "text-[11px] font-medium tabular-nums",
              CHANGE_COLOR[prevYearChange.direction],
            )}
          >
            {CHANGE_ARROW[prevYearChange.direction]} {prevYearChange.diffText} · {prevYearChange.pctText}
          </div>
        </div>
      )}

      <div className="pt-2 border-t">
        <div className="text-[11px] text-muted-foreground">달성률</div>
        <div className={cn("text-2xl font-bold tabular-nums", RATE_COLOR[ach.status])}>
          {ach.rateText}
        </div>
        {ach.status !== "no-target" && (
          <div className="text-[11px] text-muted-foreground mt-1">{ach.diffText}</div>
        )}
      </div>
    </div>
  );
}
