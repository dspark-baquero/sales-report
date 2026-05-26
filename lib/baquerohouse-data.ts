import { BigQuery } from "@google-cloud/bigquery";

export type BHPartner = {
  partnerName: string;
  grade: string;
  commissionRate: number;
  salesRep: string;
  bizType: string;
  agencyLinker: string | null;
};

export type BHPartnerSale = {
  partnerName: string;
  orderDate: string;
  yearMonth: string;
  orderNo: string;
  paymentAmount: number;
  estimatedCommission: number;
  commissionPaid: boolean;
  agency: string | null;
  agencyCommission: number;
  brand: string;
  productName: string;
  quantity: number;
};

export type BHData = {
  partners: BHPartner[];
  partnerMap: Map<string, BHPartner>;
  sales: BHPartnerSale[];
  available: boolean;
};

type Cached = {
  partners: BHPartner[];
  partnerMap: Map<string, BHPartner>;
  salesByMonth: Map<string, BHPartnerSale[]>;
  available: boolean;
};

let cached: Cached | null = null;

function str(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object" && "value" in (v as Record<string, unknown>))
    return String((v as { value: unknown }).value);
  return String(v);
}

function num(v: unknown): number {
  const s = str(v).replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function parseDate(v: unknown): { date: string; ym: string } {
  const s = str(v);
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return { date: `${m[1]}-${m[2]}-${m[3]}`, ym: `${m[1]}-${m[2]}` };
  const m2 = s.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (m2) {
    const mm = m2[2].padStart(2, "0");
    const dd = m2[3].padStart(2, "0");
    return { date: `${m2[1]}-${mm}-${dd}`, ym: `${m2[1]}-${mm}` };
  }
  if (typeof v === "object" && v !== null && "value" in (v as Record<string, unknown>)) {
    return parseDate((v as { value: unknown }).value);
  }
  return { date: "", ym: "" };
}

async function ensureLoaded(): Promise<Cached> {
  if (cached) return cached;

  const projectId = process.env.BQ_PROJECT_ID;
  const dataset = process.env.BQ_DATASET ?? "dashboard_1";

  try {
    const bq = new BigQuery({
      ...(projectId ? { projectId } : {}),
      scopes: [
        "https://www.googleapis.com/auth/bigquery",
        "https://www.googleapis.com/auth/drive.readonly",
      ],
    });
    const fqDataset = projectId ? `${projectId}.${dataset}` : dataset;

    const [partnerRows] = await bq.query({
      query: `SELECT * FROM \`${fqDataset}.bh_partners\``,
      maxResults: 10_000,
    });
    const [saleRows] = await bq.query({
      query: `SELECT * FROM \`${fqDataset}.bh_partner_sales\``,
      maxResults: 200_000,
    });

    const partners: BHPartner[] = partnerRows.map((r: Record<string, unknown>) => ({
      partnerName: str(r.partner_name),
      grade: str(r.grade),
      commissionRate: num(r.commission_rate),
      salesRep: str(r.sales_rep),
      bizType: str(r.biz_type),
      agencyLinker: str(r.agency_linker) || null,
    }));

    const partnerMap = new Map<string, BHPartner>();
    for (const p of partners) {
      if (p.partnerName) partnerMap.set(p.partnerName, p);
    }

    const salesByMonth = new Map<string, BHPartnerSale[]>();
    for (const r of saleRows) {
      const { date, ym } = parseDate(r.order_date);
      if (!ym) continue;
      const sale: BHPartnerSale = {
        partnerName: str(r.partner_name),
        orderDate: date,
        yearMonth: ym,
        orderNo: str(r.order_no),
        paymentAmount: num(r.payment_amount),
        estimatedCommission: num(r.estimated_commission),
        commissionPaid: str(r.commission_paid) === "지급완료",
        agency: str(r.agency) || null,
        agencyCommission: num(r.agency_commission),
        brand: str(r.brand),
        productName: str(r.product_name),
        quantity: num(r.quantity),
      };
      const arr = salesByMonth.get(ym);
      if (arr) arr.push(sale);
      else salesByMonth.set(ym, [sale]);
    }

    console.log(
      `[baquerohouse-data] 파트너 ${partners.length}명, 매출 ${saleRows.length}건 로드`,
    );
    cached = { partners, partnerMap, salesByMonth, available: true };
  } catch (e) {
    console.warn(
      "[baquerohouse-data] 파트너 데이터 조회 실패 (로컬 dev에서는 정상):",
      (e as Error).message,
    );
    cached = {
      partners: [],
      partnerMap: new Map(),
      salesByMonth: new Map(),
      available: false,
    };
  }
  return cached;
}

export async function loadBHPartners(): Promise<BHPartner[]> {
  return (await ensureLoaded()).partners;
}

export async function loadBHPartnerMap(): Promise<Map<string, BHPartner>> {
  return (await ensureLoaded()).partnerMap;
}

export async function loadBHSales(ym: string): Promise<BHPartnerSale[]> {
  return (await ensureLoaded()).salesByMonth.get(ym) ?? [];
}

export async function loadBHSalesRange(
  fromYM: string,
  toYM: string,
): Promise<BHPartnerSale[]> {
  const { salesByMonth } = await ensureLoaded();
  const out: BHPartnerSale[] = [];
  for (const [ym, arr] of salesByMonth) {
    if (ym >= fromYM && ym <= toYM) out.push(...arr);
  }
  return out;
}

export async function isBHDataAvailable(): Promise<boolean> {
  return (await ensureLoaded()).available;
}
