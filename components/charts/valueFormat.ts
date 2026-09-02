// 차트 값 서식 지정 — 서버 컴포넌트에서 클라이언트 차트로 넘길 수 있도록 "함수가 아닌 값"으로 둔다.
//
// 예전에는 차트 wrapper가 `formatter?: (v: number) => string` 함수 prop을 받았는데,
// 차트는 "use client"이고 페이지는 서버 컴포넌트라 함수를 넘기면 직렬화 단계에서
// "Functions cannot be passed directly to Client Components"로 렌더 자체가 죽는다.
// (2026-09 `/members` 탭 500 에러 원인) 서식이 필요하면 여기 종류를 늘린다.
//
// 기본값은 "won" — 기존 차트가 전부 금액이었으므로 동작이 바뀌지 않는다.

import { formatKRWLong, formatKRWShort, formatCount } from "@/lib/format";

export type ValueFormat = "won" | "count";

// 툴팁·합계처럼 넓은 자리: 금액은 긴 표기(1억 5,623만원)
export function fullFormatter(vf: ValueFormat | undefined, unitSuffix?: string) {
  return vf === "count" ? (v: number) => formatCount(v, unitSuffix ?? "개") : formatKRWLong;
}

// 축·막대 라벨처럼 좁은 자리: 금액은 짧은 표기
export function axisFormatter(vf: ValueFormat | undefined, unitSuffix?: string) {
  return vf === "count" ? (v: number) => formatCount(v, unitSuffix ?? "개") : formatKRWShort;
}
