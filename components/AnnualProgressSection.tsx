"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { AnnualProgressCard } from "@/components/AnnualProgressCard";
import { formatKRWLong } from "@/lib/format";
import { cn } from "@/lib/cn";

export type ChannelProgress = {
  title: string;
  ytdActual: number;
  annualTarget: number;
};

type Props = {
  // 전체 연 목표 진도 카드 (대표)
  overall: {
    title: string;
    ytdActual: number;
    annualTarget: number;
    hint?: string;
  };
  // 펼치면 보이는 채널별 진도
  channels: ChannelProgress[];
  monthsElapsed: number;
  // 같은 그리드에 들어가는 나머지 게이지 카드 (서버 컴포넌트로 전달)
  gauges: React.ReactNode;
};

// 연 목표 진도 카드 + (클릭 시) 채널별 연 목표 진도 펼침 패널.
export function AnnualProgressSection({ overall, channels, monthsElapsed, gauges }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <AnnualProgressCard
          title={overall.title}
          ytdActual={overall.ytdActual}
          annualTarget={overall.annualTarget}
          monthsElapsed={monthsElapsed}
          hint={overall.hint}
          footer={
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="mt-1 flex w-full items-center justify-center gap-1 border-t pt-2 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              채널별 연 목표 진도 {expanded ? "접기" : "펼치기"}
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")}
              />
            </button>
          }
        />
        {gauges}
      </div>

      {expanded && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {channels.map((ch) => (
            <AnnualProgressCard
              key={ch.title}
              title={ch.title}
              ytdActual={ch.ytdActual}
              annualTarget={ch.annualTarget}
              monthsElapsed={monthsElapsed}
              hint={`연 목표 ${formatKRWLong(ch.annualTarget)}`}
            />
          ))}
        </div>
      )}
    </>
  );
}
