import {
  category,
  channelGroup,
  brandHouse,
  isNonRevenueBiz,
  b2bCustomerType,
  extractCountry,
  type Category,
  type ChannelGroup,
  type BrandHouse,
} from "@/config/mappings";

export type SalesRow = {
  channel: string;
  date: Date;
  orderNo: string;
  productName: string;
  productCode: string;
  qty: number;
  realRevenue: number;
  orderAmount: number;
  discount: number;
  fee: number;
  shippingFee: number;
  settlement: number;
  dealer: string;
  customer: string;
  bizType: string;
  cost: number | null;
  brand: string;

  yearMonth: string;
  category: Category;
  channelGroup: ChannelGroup;
  brandHouse: BrandHouse;
  isNonRevenue: boolean;
  country: string | null;
  b2bCustomerType: string | null;
  gp: number | null;
};

export function parseDate(s: string): Date | null {
  if (!s) return null;
  const trimmed = s.trim();
  const parts = trimmed.replace(/\./g, " ").replace(/-/g, " ").split(/\s+/).filter(Boolean);
  if (parts.length < 3) return null;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

export function parseNum(s: string | undefined | null): number {
  if (!s) return 0;
  const cleaned = String(s).replace(/,/g, "").replace(/\s/g, "").trim();
  if (!cleaned || cleaned === "#N/A" || cleaned === "N/A" || cleaned === "-") return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function parseCost(s: string | undefined | null): number | null {
  if (!s) return null;
  const cleaned = String(s).replace(/,/g, "").replace(/\s/g, "").trim();
  if (!cleaned || cleaned === "#N/A" || cleaned === "N/A" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function ym(d: Date): string {
  const y = d.getUTCFullYear();
  const m = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  return `${y}-${m}`;
}

export function parseRow(r: Record<string, string>): SalesRow | null {
  const date = parseDate(r["날짜"]);
  if (!date) return null;

  const channel = (r["채널"] || "").trim();
  const brand = (r["브랜드"] || "기타").trim();
  const bizType = (r["거래처 사업형태"] || "").trim();
  const dealer = (r["딜러"] || "").trim() || "미지정";
  const realRevenue = parseNum(r["실 매출"]);
  const cat = category(channel);
  // 사업형태 '임직원'이라도 B2B몰 채널의 실판매(실매출>0)는 매출로 집계 (사용자 정책 2026-07).
  // 그 외 채널의 임직원 및 나머지 비매출 사업형태(증정/직원/마케팅용 등)는 종전대로 제외.
  const nonRevByBiz = isNonRevenueBiz(bizType) && !(cat === "B2B" && bizType === "임직원");
  const isNonRev = nonRevByBiz || realRevenue === 0;
  const costVal = parseCost(r["원가"]);

  return {
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
    cost: costVal,
    brand,
    yearMonth: ym(date),
    category: cat,
    channelGroup: channelGroup(channel),
    brandHouse: brandHouse(brand),
    isNonRevenue: isNonRev,
    country: cat === "수출" ? extractCountry(bizType) : null,
    b2bCustomerType: cat === "B2B" ? b2bCustomerType(bizType) : null,
    gp: costVal !== null ? realRevenue - costVal : null,
  };
}
