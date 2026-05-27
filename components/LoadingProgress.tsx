"use client";

import { useEffect, useState } from "react";
import { Progress } from "@/components/ui/progress";

const stages = [
  { threshold: 15, label: "서버 연결 중…" },
  { threshold: 45, label: "데이터 로딩 중…" },
  { threshold: 75, label: "데이터 처리 중…" },
  { threshold: 90, label: "화면 구성 중…" },
];

function getLabel(pct: number) {
  for (let i = stages.length - 1; i >= 0; i--) {
    if (pct >= stages[i].threshold) return stages[i].label;
  }
  return stages[0].label;
}

export function LoadingProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let elapsed = 0;
    const interval = setInterval(() => {
      elapsed += 200;
      setProgress((prev) => {
        if (prev >= 90) return 90;
        // 처음엔 빠르게, 갈수록 느리게
        const remaining = 90 - prev;
        const step = remaining * 0.04;
        return Math.min(prev + Math.max(step, 0.3), 90);
      });
    }, 200);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center gap-4 py-12">
      <div className="w-full max-w-sm space-y-3">
        <Progress value={progress} className="h-2.5" />
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>{getLabel(progress)}</span>
          <span className="tabular-nums">{Math.round(progress)}%</span>
        </div>
      </div>
    </div>
  );
}
