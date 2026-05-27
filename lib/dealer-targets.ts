import { BigQuery } from "@google-cloud/bigquery";

export type DealerTargetType = "영업사원" | "대리점";

export type DealerTargetRow = {
  name: string;
  type: DealerTargetType;
  yearMonth: string;
  target: number;
};

function toYearMonth(s: string): string | null {
  const m1 = s.trim().match(/^(\d{4})\s*\/\s*(\d{1,2})$/);
  if (m1) return `${m1[1]}-${String(Number(m1[2])).padStart(2, "0")}`;
  const m2 = s.trim().match(/^(\d{4})-(\d{1,2})$/);
  if (m2) return `${m2[1]}-${String(Number(m2[2])).padStart(2, "0")}`;
  return null;
}

let cache: DealerTargetRow[] | null = null;

export async function loadDealerTargets(): Promise<DealerTargetRow[]> {
  if (cache) return cache;

  const projectId = process.env.BQ_PROJECT_ID;
  const dataset = process.env.BQ_DATASET ?? "dashboard_1";
  const table = "dealer_targets";

  const bq = new BigQuery(projectId ? { projectId } : undefined);
  const query = projectId
    ? `SELECT * FROM \`${projectId}.${dataset}.${table}\``
    : `SELECT * FROM \`${dataset}.${table}\``;

  const [rawRows] = await bq.query({ query });
  const rows: DealerTargetRow[] = [];

  for (const raw of rawRows) {
    const name = String(raw.name ?? "").trim();
    const type = String(raw.type ?? "").trim();
    const monthRaw = String(raw.month ?? "").trim();
    const targetRaw = raw.target;

    if (!name || !type || !monthRaw) continue;
    const yearMonth = toYearMonth(monthRaw);
    if (!yearMonth) continue;
    if (type !== "영업사원" && type !== "대리점") continue;

    const target =
      typeof targetRaw === "number"
        ? targetRaw
        : Number(String(targetRaw ?? "").replace(/[,\s]/g, "")) || 0;

    rows.push({ name, type: type as DealerTargetType, yearMonth, target });
  }

  console.log(`[dealer-targets] ${rows.length} rows loaded`);
  cache = rows;
  return rows;
}

export function dealerTargetsForMonth(
  targets: DealerTargetRow[],
  ym: string,
  type?: DealerTargetType,
): DealerTargetRow[] {
  return targets.filter(
    (t) => t.yearMonth === ym && (type == null || t.type === type),
  );
}

export function dealerTargetMap(
  targets: DealerTargetRow[],
  ym: string,
  type?: DealerTargetType,
): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of targets) {
    if (t.yearMonth !== ym) continue;
    if (type != null && t.type !== type) continue;
    m.set(t.name, (m.get(t.name) ?? 0) + t.target);
  }
  return m;
}

export function dealerTargetMapRange(
  targets: DealerTargetRow[],
  months: string[],
  type?: DealerTargetType,
): Map<string, number> {
  const ms = new Set(months);
  const m = new Map<string, number>();
  for (const t of targets) {
    if (!ms.has(t.yearMonth)) continue;
    if (type != null && t.type !== type) continue;
    m.set(t.name, (m.get(t.name) ?? 0) + t.target);
  }
  return m;
}

export type DealerAchievement = {
  name: string;
  type: DealerTargetType;
  monthTarget: number;
  monthActual: number;
  monthRate: number | null;
  ytdTarget: number;
  ytdActual: number;
  ytdRate: number | null;
};

export function buildDealerAchievements(
  targets: DealerTargetRow[],
  monthActualMap: Map<string, number>,
  ytdActualMap: Map<string, number>,
  ym: string,
  ytdMonths: string[],
  type: DealerTargetType,
): DealerAchievement[] {
  const monthTargetMap = dealerTargetMap(targets, ym, type);
  const ytdTargetMap = dealerTargetMapRange(targets, ytdMonths, type);

  const allNames = new Set([
    ...monthTargetMap.keys(),
    ...monthActualMap.keys(),
  ]);

  const results: DealerAchievement[] = [];
  for (const name of allNames) {
    const mt = monthTargetMap.get(name) ?? 0;
    const ma = monthActualMap.get(name) ?? 0;
    const yt = ytdTargetMap.get(name) ?? 0;
    const ya = ytdActualMap.get(name) ?? 0;

    if (mt === 0 && ma === 0 && yt === 0 && ya === 0) continue;

    results.push({
      name,
      type,
      monthTarget: mt,
      monthActual: ma,
      monthRate: mt > 0 ? ma / mt : null,
      ytdTarget: yt,
      ytdActual: ya,
      ytdRate: yt > 0 ? ya / yt : null,
    });
  }

  return results.sort((a, b) => b.monthTarget - a.monthTarget);
}
