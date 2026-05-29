// CSS keyframe 기반 progress bar.
// JS hydration 없이도 HTML 도착 즉시 시각적으로 진행됨 (콜드 스타트 최초 접속 대응).
// 라벨은 SSR 기본값 "서버 연결 중…" 로 시작하고, hydrate 이후엔 시간에 따라 갱신.

"use client";

import { useEffect, useState } from "react";

const stages = [
  { atSec: 0, label: "서버 연결 중…" },
  { atSec: 4, label: "데이터 로딩 중…" },
  { atSec: 12, label: "데이터 처리 중…" },
  { atSec: 20, label: "화면 구성 중…" },
];

function labelAt(sec: number): string {
  let cur = stages[0].label;
  for (const s of stages) {
    if (sec >= s.atSec) cur = s.label;
  }
  return cur;
}

export function LoadingProgress() {
  const [label, setLabel] = useState(stages[0].label);

  useEffect(() => {
    const start = performance.now();
    const tick = () => {
      const sec = (performance.now() - start) / 1000;
      setLabel(labelAt(sec));
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col items-center gap-4 py-12">
      <div className="w-full max-w-sm space-y-3">
        <div className="h-2.5 rounded-full bg-muted overflow-hidden">
          <div className="loading-progress-bar h-full bg-primary rounded-full" />
        </div>
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>{label}</span>
          <span className="text-xs">최초 접속 시 수십 초 소요</span>
        </div>
      </div>
    </div>
  );
}
