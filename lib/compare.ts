// MoM / QoQ / YoY 비교 헬퍼.
// "현재월"을 기준으로 비교 대상 월(들)을 산출하고, 변화율을 계산.

export function prevMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split("-").map(Number);
  let py = y, pm = m - 1;
  if (pm < 1) { pm = 12; py--; }
  return `${py}-${String(pm).padStart(2, "0")}`;
}

export function prevYearSameMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split("-").map(Number);
  return `${y - 1}-${String(m).padStart(2, "0")}`;
}

// 분기 = 1~3 / 4~6 / 7~9 / 10~12
export function quarterOf(yearMonth: string): { qStart: string; qEnd: string; qNumber: number } {
  const [y, m] = yearMonth.split("-").map(Number);
  const q = Math.floor((m - 1) / 3); // 0~3
  const startM = q * 3 + 1;
  const endM = startM + 2;
  return {
    qStart: `${y}-${String(startM).padStart(2, "0")}`,
    qEnd: `${y}-${String(endM).padStart(2, "0")}`,
    qNumber: q + 1,
  };
}

export function prevQuarter(yearMonth: string): { qStart: string; qEnd: string } {
  const [y, m] = yearMonth.split("-").map(Number);
  const q = Math.floor((m - 1) / 3);
  let pq = q - 1;
  let py = y;
  if (pq < 0) { pq = 3; py--; }
  const startM = pq * 3 + 1;
  const endM = startM + 2;
  return {
    qStart: `${py}-${String(startM).padStart(2, "0")}`,
    qEnd: `${py}-${String(endM).padStart(2, "0")}`,
  };
}

// 분기 진행률 (1, 2, 3 중 몇 번째 달까지 들어왔나)
export function quarterProgress(yearMonth: string): number {
  const [, m] = yearMonth.split("-").map(Number);
  return ((m - 1) % 3) + 1;
}

export type Delta = {
  current: number;
  baseline: number;
  diff: number;
  pct: number | null; // baseline 0이면 null
  hasBaseline: boolean;
};

export function delta(current: number, baseline: number, hasBaseline: boolean = true): Delta {
  const diff = current - baseline;
  const pct = baseline !== 0 ? diff / baseline : null;
  return { current, baseline, diff, pct, hasBaseline };
}

export type ComparisonSet = {
  mom: Delta;
  qoq: Delta;
  yoy: Delta;
  qProgress: number; // 1~3
};

export function buildComparison(
  current: number,
  prevMo: number,
  curQ: number,
  prevQ: number,
  prevYear: number,
  prevYearExists: boolean,
  qProg: number,
): ComparisonSet {
  return {
    mom: delta(current, prevMo, true),
    qoq: delta(curQ, prevQ, true),
    yoy: delta(current, prevYear, prevYearExists),
    qProgress: qProg,
  };
}
