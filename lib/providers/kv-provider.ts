import type { FactCube } from "../facts";
import type { SalesRow } from "../parsers";
import type { DataProvider } from "../data-provider";
import { deserializeFactCube, deserializeRows, type KVMeta } from "../serialization";

type KV = { get(key: string): Promise<string | null> };

let cubeCache: FactCube | null = null;
let metaCache: KVMeta | null = null;

async function getKV(): Promise<KV> {
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  const ctx = await getCloudflareContext();
  return (ctx.env as Record<string, KV>).SALES_DATA;
}

export const kvProvider: DataProvider = {
  async loadFactCube(): Promise<FactCube> {
    if (cubeCache) return cubeCache;
    const kv = await getKV();
    const json = await kv.get("sales:cube");
    if (!json) throw new Error("KV에 sales:cube 데이터 없음 — sync-data 실행 필요");
    cubeCache = deserializeFactCube(JSON.parse(json));
    return cubeCache;
  },

  async loadMonthRows(ym: string): Promise<SalesRow[]> {
    const kv = await getKV();
    const json = await kv.get(`sales:raw:${ym}`);
    if (!json) return [];
    return deserializeRows(json);
  },

  async loadRangeRows(fromYM: string, toYM: string): Promise<SalesRow[]> {
    const months = await this.availableMonths();
    const targets = months.filter((m) => m >= fromYM && m <= toYM);
    const chunks = await Promise.all(targets.map((m) => this.loadMonthRows(m)));
    return chunks.flat();
  },

  async availableMonths(): Promise<string[]> {
    if (metaCache) return metaCache.months;
    const kv = await getKV();
    const json = await kv.get("sales:meta");
    if (!json) return [];
    metaCache = JSON.parse(json) as KVMeta;
    return metaCache.months;
  },
};
