import fs from "fs";
import path from "path";
import Papa from "papaparse";
import {
  category,
  channelGroup,
  brandHouse,
  isNonRevenueBiz,
  extractCountry,
  b2bCustomerType,
  type Category,
  type ChannelGroup,
  type BrandHouse,
} from "@/config/mappings";

export type SalesRow = {
  // 원본
  channel: string;
  date: Date;
  orderNo: string;
  productName: string;
  productCode: string;
  qty: number;
  realRevenue: number;   // 실 매출
  orderAmount: number;   // 주문금액
  discount: number;      // 할인금액
  fee: number;           // 수수료
  shippingFee: number;   // 배송비
  settlement: number;    // 정산금액
  dealer: string;
  customer: string;
  bizType: string;       // 거래처 사업형태
  cost: number | null;   // 원가 합계 (행당, 단가 아님). #N/A → null
  brand: string;

  // 파생
  yearMonth: string;     // "2026-04"
  category: Category;
  channelGroup: ChannelGroup;
  brandHouse: BrandHouse;
  isNonRevenue: boolean;
  country: string | null;        // 수출만
  b2bCustomerType: string | null; // B2B만
  gp: number | null;     // 실매출 - 원가 (cost null이면 null) — 원가는 행당 합계임
};

function parseDate(s: string): Date | null {
  if (!s) return null;
  const trimmed = s.trim();
  // "2023-12-21" or "2026. 4. 9" or "2026.4.9"
  const parts = trimmed.replace(/\./g, " ").replace(/-/g, " ").split(/\s+/).filter(Boolean);
  if (parts.length < 3) return null;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

function parseNum(s: string | undefined | null): number {
  if (!s) return 0;
  const cleaned = String(s).replace(/,/g, "").replace(/\s/g, "").trim();
  if (!cleaned || cleaned === "#N/A" || cleaned === "N/A" || cleaned === "-") return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function parseCost(s: string | undefined | null): number | null {
  if (!s) return null;
  const cleaned = String(s).replace(/,/g, "").replace(/\s/g, "").trim();
  if (!cleaned || cleaned === "#N/A" || cleaned === "N/A" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function ym(d: Date): string {
  const y = d.getUTCFullYear();
  const m = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  return `${y}-${m}`;
}

let cached: { rows: SalesRow[]; loadedAt: number; mtime: number } | null = null;

export function loadSalesRows(): SalesRow[] {
  const csvPath = path.join(process.cwd(), "sales.csv");
  const stat = fs.statSync(csvPath);
  const mtime = stat.mtimeMs;

  if (cached && cached.mtime === mtime) {
    return cached.rows;
  }

  const text = fs.readFileSync(csvPath, "utf8");
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const rows: SalesRow[] = [];
  for (const r of parsed.data) {
    const date = parseDate(r["날짜"]);
    if (!date) continue;

    const channel = (r["채널"] || "").trim();
    const brand = (r["브랜드"] || "기타").trim();
    const bizType = (r["거래처 사업형태"] || "").trim();
    const dealer = (r["딜러"] || "").trim() || "미지정";
    const realRevenue = parseNum(r["실 매출"]);
    const cat = category(channel);

    const isNonRev = isNonRevenueBiz(bizType) || realRevenue === 0;

    const row: SalesRow = {
      channel,
      date,
      orderNo: (r["주문번호"] || "").trim(),
      productName: (r["제품명"] || "").trim(),
      productCode: (r["품목코드"] || "").trim(),
      qty: parseNum(r["판매수량"]),
      realRevenue,
      orderAmount: parseNum(r["주문금액"]),
      discount: parseNum(r["할인금액"]),
      fee: parseNum(r["수수료"]),
      shippingFee: parseNum(r["배송비"]),
      settlement: parseNum(r["정산금액"]),
      dealer,
      customer: (r["거래처"] || "").trim(),
      bizType,
      cost: parseCost(r["원가"]),
      brand,
      yearMonth: ym(date),
      category: cat,
      channelGroup: channelGroup(channel),
      brandHouse: brandHouse(brand),
      isNonRevenue: isNonRev,
      country: cat === "수출" ? extractCountry(bizType) : null,
      b2bCustomerType: cat === "B2B" ? b2bCustomerType(bizType) : null,
      gp: 0, // fill below
    };

    if (row.cost !== null) {
      row.gp = row.realRevenue - row.cost;
    } else {
      row.gp = null;
    }

    rows.push(row);
  }

  cached = { rows, loadedAt: Date.now(), mtime };
  return rows;
}

// 테스트/스크립트용
export function _resetCache() {
  cached = null;
}
