// 한국식 숫자/날짜 표기 헬퍼.
// 원칙:
//  - 모든 매출 숫자는 3자리 콤마 (Intl.NumberFormat ko-KR).
//  - "풀어쓸" 때는 "1억 5,623만원"처럼 만원/억 단위로 묶음.
//  - 영문 단위(M/B 등)는 절대 사용하지 않음.

const NF = new Intl.NumberFormat("ko-KR");

const ONE_MAN = 10_000;
const ONE_EOK = 100_000_000;
const ONE_JO = 1_000_000_000_000;

function formatComma(n: number): string {
  return NF.format(Math.round(n));
}

// 정확값 (예: 156,234,000원)
export function formatKRW(n: number): string {
  return `${formatComma(n)}원`;
}

// 풀어쓰기. 단위는 만원→억원→조원으로 절삭. 0인 자리는 생략.
// - 1만 미만:        "1,234원"
// - 1만 이상 1억 미만: "5,623만원"
// - 1억 이상 1조 미만: "1억 5,623만원" (만원 단위 0이면 "1억원")
// - 1조 이상:        "1조 5,623억원"
export function formatKRWLong(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const negative = n < 0;
  const v = Math.abs(Math.round(n));
  const sign = negative ? "-" : "";

  if (v < ONE_MAN) {
    return `${sign}${formatComma(v)}원`;
  }
  if (v < ONE_EOK) {
    const man = Math.floor(v / ONE_MAN);
    const won = v % ONE_MAN;
    if (won === 0) return `${sign}${formatComma(man)}만원`;
    return `${sign}${formatComma(man)}만 ${formatComma(won)}원`;
  }
  if (v < ONE_JO) {
    const eok = Math.floor(v / ONE_EOK);
    const remainder = v % ONE_EOK;
    const man = Math.floor(remainder / ONE_MAN);
    if (man === 0) return `${sign}${formatComma(eok)}억원`;
    return `${sign}${formatComma(eok)}억 ${formatComma(man)}만원`;
  }
  const jo = Math.floor(v / ONE_JO);
  const remainder = v % ONE_JO;
  const eok = Math.floor(remainder / ONE_EOK);
  if (eok === 0) return `${sign}${formatComma(jo)}조원`;
  return `${sign}${formatComma(jo)}조 ${formatComma(eok)}억원`;
}

// 짧은 형태 (차트 축, 배지). "1.5억원" "5,623만원" 등.
// 숫자 + 단위 형태이지만 영문 약자 없음.
export function formatKRWShort(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const negative = n < 0;
  const v = Math.abs(Math.round(n));
  const sign = negative ? "-" : "";
  if (v < ONE_MAN) return `${sign}${formatComma(v)}원`;
  if (v < ONE_EOK) {
    return `${sign}${formatComma(Math.round(v / ONE_MAN))}만원`;
  }
  if (v < ONE_JO) {
    const eok = v / ONE_EOK;
    if (eok >= 100) return `${sign}${eok.toFixed(0)}억원`;
    if (eok >= 10) return `${sign}${eok.toFixed(1)}억원`;
    return `${sign}${eok.toFixed(2)}억원`;
  }
  return `${sign}${(v / ONE_JO).toFixed(2)}조원`;
}

export function formatPct(p: number | null | undefined, digits = 1): string {
  if (p === null || p === undefined || !Number.isFinite(p)) return "—";
  const sign = p > 0 ? "+" : "";
  return `${sign}${(p * 100).toFixed(digits)}%`;
}

// 부호 없이 절대값 (달성률 등)
export function formatPctAbs(p: number | null | undefined, digits = 1): string {
  if (p === null || p === undefined || !Number.isFinite(p)) return "—";
  return `${(p * 100).toFixed(digits)}%`;
}

export function formatInt(n: number): string {
  return NF.format(Math.round(n));
}

// 수량/개수 표기: "1,234개" / "1,234곳" 등
export function formatCount(n: number, suffix = "개"): string {
  return `${formatInt(n)}${suffix}`;
}

export function formatYM(yearMonth: string): string {
  const [y, m] = yearMonth.split("-");
  return `${y}년 ${Number(m)}월`;
}

export function formatYMShort(yearMonth: string): string {
  const [y, m] = yearMonth.split("-");
  return `${y.slice(2)}년 ${Number(m)}월`;
}

// ── 비교 텍스트 생성 ─────────────────────────────────────
// MetricCard, ChangeBreakdown 등에서 일관 사용.
export type ChangeDirection = "up" | "down" | "flat" | "new" | "lost" | "na";

export type ChangeView = {
  current: number;
  prev: number;
  diff: number;
  pct: number | null;       // 비율. prev=0이면 null.
  direction: ChangeDirection;
  diffText: string;         // "+1,000만원"
  pctText: string;          // "+10.0%" or "신규"
  prevText: string;         // "지난달 1억"
  isNew: boolean;
  isLost: boolean;
};

export function buildChange(
  current: number,
  prev: number,
  prevLabel: string,
  options: {
    flatThreshold?: number;
    formatValue?: (n: number) => string;   // diff 표시용 (짧은 형태)
    formatPrev?: (n: number) => string;    // 전월 절대값 표시용
  } = {},
): ChangeView {
  const flatThreshold = options.flatThreshold ?? 0.02;
  const fmtValue = options.formatValue ?? formatKRWShort;
  const fmtPrev = options.formatPrev ?? formatKRWLong;
  const diff = current - prev;
  const isNew = prev === 0 && current !== 0;
  const isLost = prev !== 0 && current === 0;
  const pct = prev === 0 ? null : diff / Math.abs(prev);
  const sign = diff > 0 ? "+" : "";
  const diffText = `${sign}${fmtValue(diff)}`;
  let pctText: string;
  let direction: ChangeDirection;
  if (isNew) {
    pctText = "신규 발생";
    direction = "new";
  } else if (isLost) {
    pctText = "이탈";
    direction = "lost";
  } else if (pct === null || !Number.isFinite(pct)) {
    pctText = "—";
    direction = "na";
  } else if (Math.abs(pct) < flatThreshold) {
    pctText = formatPct(pct);
    direction = "flat";
  } else {
    pctText = formatPct(pct);
    direction = pct > 0 ? "up" : "down";
  }
  const prevText = `${prevLabel} ${fmtPrev(prev)}`;
  return {
    current,
    prev,
    diff,
    pct,
    direction,
    diffText,
    pctText,
    prevText,
    isNew,
    isLost,
  };
}

// ── 달성률 ────────────────────────────────────────────
export type AchievementStatus =
  | "no-target"      // 목표 0 또는 미설정
  | "underperform"   // <70%
  | "ontrack"        // 70%-100%
  | "near"           // 95%-100%
  | "overperform";   // >100%

export type AchievementView = {
  actual: number;
  target: number;
  rate: number | null;     // 0~1+
  rateText: string;        // "92.5%" or "—"
  status: AchievementStatus;
  diff: number;            // actual - target
  diffText: string;        // "+1,000만원" or "-2,000만원 부족"
};

export function buildAchievement(actual: number, target: number): AchievementView {
  if (target <= 0) {
    return {
      actual,
      target,
      rate: null,
      rateText: "—",
      status: "no-target",
      diff: actual,
      diffText: actual > 0 ? `목표 미설정 · 실적 ${formatKRWLong(actual)}` : "—",
    };
  }
  const rate = actual / target;
  let status: AchievementStatus;
  if (rate >= 1) status = "overperform";
  else if (rate >= 0.95) status = "near";
  else if (rate >= 0.7) status = "ontrack";
  else status = "underperform";
  const diff = actual - target;
  const diffText =
    diff >= 0
      ? `목표 대비 +${formatKRWShort(Math.abs(diff))}`
      : `목표 대비 -${formatKRWShort(Math.abs(diff))} 부족`;
  return {
    actual,
    target,
    rate,
    rateText: formatPctAbs(rate, 1),
    status,
    diff,
    diffText,
  };
}
