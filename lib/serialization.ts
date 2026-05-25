import type {
  FactCube,
  FactCell,
  ProductFactCell,
  NonRevCell,
  DailyCell,
} from "./facts";
import type { SalesRow } from "./parsers";
import type { Category, ChannelGroup, BrandHouse } from "@/config/mappings";

// ── 직렬화된 타입 (JSON 호환) ──────────────────────

type SerializedFactCell = Omit<FactCell, "orders"> & { ordersCount: number };
type SerializedProductFactCell = Omit<ProductFactCell, "orders"> & { ordersCount: number };

export type SerializedFactCube = {
  byMonth: Record<string, SerializedFactCell>;
  byMonthCategory: Record<string, Record<string, SerializedFactCell>>;
  byMonthChannelGroup: Record<string, Record<string, SerializedFactCell>>;
  byMonthChannel: Record<string, Record<string, SerializedFactCell>>;
  byMonthBrand: Record<string, Record<string, SerializedFactCell>>;
  byMonthBrandHouse: Record<string, Record<string, SerializedFactCell>>;
  byMonthCustomer: Record<string, Record<string, SerializedFactCell>>;
  byMonthDealer: Record<string, Record<string, SerializedFactCell>>;
  byMonthCountry: Record<string, Record<string, SerializedFactCell>>;
  byMonthB2bType: Record<string, Record<string, SerializedFactCell>>;
  byMonthDealerType: Record<string, Record<string, Record<string, SerializedFactCell>>>;
  byMonthBrandChannelGroup: Record<string, Record<string, Record<string, SerializedFactCell>>>;
  byMonthCountryBrand: Record<string, Record<string, Record<string, SerializedFactCell>>>;
  byMonthDealerCustomers: Record<string, Record<string, string[]>>;
  byMonthProduct: Record<string, Record<string, SerializedProductFactCell>>;
  byMonthNonRevBizType: Record<string, Record<string, NonRevCell>>;
  byMonthDay: Record<string, Record<string, DailyCell>>;
  monthsAsc: string[];
  customers: string[];
  dealers: string[];
  brands: string[];
  channels: string[];
  countries: string[];
  customerToCategory: Record<string, Category>;
  customerToBrand: Record<string, string>;
  customerToDealer: Record<string, string>;
};

export type KVMeta = {
  lastSync: string;
  months: string[];
  rowCount: number;
};

// ── 직렬화 (FactCube → JSON) ───────────────────────

function serializeCell(c: FactCell): SerializedFactCell {
  return {
    revenue: c.revenue,
    qty: c.qty,
    ordersCount: c.orders.size,
    discount: c.discount,
    fee: c.fee,
    shippingFee: c.shippingFee,
    settlement: c.settlement,
    orderAmount: c.orderAmount,
    gpSum: c.gpSum,
    gpRevenueBase: c.gpRevenueBase,
    costMissingCount: c.costMissingCount,
    rowCount: c.rowCount,
  };
}

function serializeProductCell(c: ProductFactCell): SerializedProductFactCell {
  return {
    ...serializeCell(c),
    productName: c.productName,
    brand: c.brand,
    productCode: c.productCode,
  };
}

function serializeMap1D<V>(m: Map<string, V>, fn: (v: V) => unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of m) out[k] = fn(v);
  return out;
}

function serializeMap2D(m: Map<string, Map<string, FactCell>>): Record<string, Record<string, SerializedFactCell>> {
  const out: Record<string, Record<string, SerializedFactCell>> = {};
  for (const [k1, inner] of m) {
    out[k1] = {};
    for (const [k2, cell] of inner) out[k1][k2] = serializeCell(cell);
  }
  return out;
}

function serializeMap3D(
  m: Map<string, Map<string, Map<string, FactCell>>>,
): Record<string, Record<string, Record<string, SerializedFactCell>>> {
  const out: Record<string, Record<string, Record<string, SerializedFactCell>>> = {};
  for (const [k1, m2] of m) {
    out[k1] = {};
    for (const [k2, m3] of m2) {
      out[k1][k2] = {};
      for (const [k3, cell] of m3) out[k1][k2][k3] = serializeCell(cell);
    }
  }
  return out;
}

export function serializeFactCube(cube: FactCube): SerializedFactCube {
  return {
    byMonth: serializeMap1D(cube.byMonth, serializeCell) as Record<string, SerializedFactCell>,
    byMonthCategory: serializeMap2D(cube.byMonthCategory as Map<string, Map<string, FactCell>>),
    byMonthChannelGroup: serializeMap2D(cube.byMonthChannelGroup as Map<string, Map<string, FactCell>>),
    byMonthChannel: serializeMap2D(cube.byMonthChannel),
    byMonthBrand: serializeMap2D(cube.byMonthBrand),
    byMonthBrandHouse: serializeMap2D(cube.byMonthBrandHouse as Map<string, Map<string, FactCell>>),
    byMonthCustomer: serializeMap2D(cube.byMonthCustomer),
    byMonthDealer: serializeMap2D(cube.byMonthDealer),
    byMonthCountry: serializeMap2D(cube.byMonthCountry),
    byMonthB2bType: serializeMap2D(cube.byMonthB2bType),
    byMonthDealerType: serializeMap3D(cube.byMonthDealerType),
    byMonthBrandChannelGroup: serializeMap3D(cube.byMonthBrandChannelGroup as Map<string, Map<string, Map<string, FactCell>>>),
    byMonthCountryBrand: serializeMap3D(cube.byMonthCountryBrand),
    byMonthDealerCustomers: (() => {
      const out: Record<string, Record<string, string[]>> = {};
      for (const [ym, m2] of cube.byMonthDealerCustomers) {
        out[ym] = {};
        for (const [d, s] of m2) out[ym][d] = [...s].sort();
      }
      return out;
    })(),
    byMonthProduct: (() => {
      const out: Record<string, Record<string, SerializedProductFactCell>> = {};
      for (const [ym, m2] of cube.byMonthProduct) {
        out[ym] = {};
        for (const [k, c] of m2) out[ym][k] = serializeProductCell(c);
      }
      return out;
    })(),
    byMonthNonRevBizType: (() => {
      const out: Record<string, Record<string, NonRevCell>> = {};
      for (const [ym, m2] of cube.byMonthNonRevBizType) {
        out[ym] = {};
        for (const [k, c] of m2) out[ym][k] = { ...c };
      }
      return out;
    })(),
    byMonthDay: (() => {
      const out: Record<string, Record<string, DailyCell>> = {};
      for (const [ym, m2] of cube.byMonthDay) {
        out[ym] = {};
        for (const [d, c] of m2) out[ym][String(d)] = { ...c };
      }
      return out;
    })(),
    monthsAsc: cube.monthsAsc,
    customers: [...cube.customers].sort(),
    dealers: [...cube.dealers].sort(),
    brands: [...cube.brands].sort(),
    channels: [...cube.channels].sort(),
    countries: [...cube.countries].sort(),
    customerToCategory: Object.fromEntries(cube.customerToCategory),
    customerToBrand: Object.fromEntries(cube.customerToBrand),
    customerToDealer: Object.fromEntries(cube.customerToDealer),
  };
}

// ── 역직렬화 (JSON → FactCube) ──────────────────────

function deserializeCell(s: SerializedFactCell): FactCell {
  const cell = {
    revenue: s.revenue,
    qty: s.qty,
    orders: new Set<string>(),
    discount: s.discount,
    fee: s.fee,
    shippingFee: s.shippingFee,
    settlement: s.settlement,
    orderAmount: s.orderAmount,
    gpSum: s.gpSum,
    gpRevenueBase: s.gpRevenueBase,
    costMissingCount: s.costMissingCount,
    rowCount: s.rowCount,
  } as FactCell & { ordersCount: number };
  cell.ordersCount = s.ordersCount;
  return cell;
}

function deserializeProductCell(s: SerializedProductFactCell): ProductFactCell {
  return {
    ...deserializeCell(s),
    productName: s.productName,
    brand: s.brand,
    productCode: s.productCode,
  } as ProductFactCell;
}

function deserializeMap2D(obj: Record<string, Record<string, SerializedFactCell>>): Map<string, Map<string, FactCell>> {
  const m = new Map<string, Map<string, FactCell>>();
  for (const [k1, inner] of Object.entries(obj)) {
    const m2 = new Map<string, FactCell>();
    for (const [k2, cell] of Object.entries(inner)) m2.set(k2, deserializeCell(cell));
    m.set(k1, m2);
  }
  return m;
}

function deserializeMap3D(
  obj: Record<string, Record<string, Record<string, SerializedFactCell>>>,
): Map<string, Map<string, Map<string, FactCell>>> {
  const m = new Map<string, Map<string, Map<string, FactCell>>>();
  for (const [k1, o2] of Object.entries(obj)) {
    const m2 = new Map<string, Map<string, FactCell>>();
    for (const [k2, o3] of Object.entries(o2)) {
      const m3 = new Map<string, FactCell>();
      for (const [k3, cell] of Object.entries(o3)) m3.set(k3, deserializeCell(cell));
      m2.set(k2, m3);
    }
    m.set(k1, m2);
  }
  return m;
}

export function deserializeFactCube(s: SerializedFactCube): FactCube {
  return {
    byMonth: new Map(Object.entries(s.byMonth).map(([k, v]) => [k, deserializeCell(v)])),
    byMonthCategory: deserializeMap2D(s.byMonthCategory) as Map<string, Map<Category, FactCell>>,
    byMonthChannelGroup: deserializeMap2D(s.byMonthChannelGroup) as Map<string, Map<ChannelGroup, FactCell>>,
    byMonthChannel: deserializeMap2D(s.byMonthChannel),
    byMonthBrand: deserializeMap2D(s.byMonthBrand),
    byMonthBrandHouse: deserializeMap2D(s.byMonthBrandHouse) as Map<string, Map<BrandHouse, FactCell>>,
    byMonthCustomer: deserializeMap2D(s.byMonthCustomer),
    byMonthDealer: deserializeMap2D(s.byMonthDealer),
    byMonthCountry: deserializeMap2D(s.byMonthCountry),
    byMonthB2bType: deserializeMap2D(s.byMonthB2bType),
    byMonthDealerType: deserializeMap3D(s.byMonthDealerType),
    byMonthBrandChannelGroup: deserializeMap3D(s.byMonthBrandChannelGroup) as Map<string, Map<string, Map<ChannelGroup, FactCell>>>,
    byMonthCountryBrand: deserializeMap3D(s.byMonthCountryBrand),
    byMonthDealerCustomers: (() => {
      const m = new Map<string, Map<string, Set<string>>>();
      for (const [ym, o2] of Object.entries(s.byMonthDealerCustomers)) {
        const m2 = new Map<string, Set<string>>();
        for (const [d, arr] of Object.entries(o2)) m2.set(d, new Set(arr));
        m.set(ym, m2);
      }
      return m;
    })(),
    byMonthProduct: (() => {
      const m = new Map<string, Map<string, ProductFactCell>>();
      for (const [ym, o2] of Object.entries(s.byMonthProduct)) {
        const m2 = new Map<string, ProductFactCell>();
        for (const [k, c] of Object.entries(o2)) m2.set(k, deserializeProductCell(c));
        m.set(ym, m2);
      }
      return m;
    })(),
    byMonthNonRevBizType: (() => {
      const m = new Map<string, Map<string, NonRevCell>>();
      for (const [ym, o2] of Object.entries(s.byMonthNonRevBizType)) {
        const m2 = new Map<string, NonRevCell>();
        for (const [k, c] of Object.entries(o2)) m2.set(k, { ...c });
        m.set(ym, m2);
      }
      return m;
    })(),
    byMonthDay: (() => {
      const m = new Map<string, Map<number, DailyCell>>();
      for (const [ym, o2] of Object.entries(s.byMonthDay)) {
        const m2 = new Map<number, DailyCell>();
        for (const [d, c] of Object.entries(o2)) m2.set(Number(d), { ...c });
        m.set(ym, m2);
      }
      return m;
    })(),
    monthsAsc: s.monthsAsc,
    customers: new Set(s.customers),
    dealers: new Set(s.dealers),
    brands: new Set(s.brands),
    channels: new Set(s.channels),
    countries: new Set(s.countries),
    customerToCategory: new Map(Object.entries(s.customerToCategory)) as Map<string, Category>,
    customerToBrand: new Map(Object.entries(s.customerToBrand)),
    customerToDealer: new Map(Object.entries(s.customerToDealer)),
  };
}

// ── SalesRow 직렬화 (Date → ISO string) ────────────

export function serializeRows(rows: SalesRow[]): string {
  return JSON.stringify(rows, (key, value) => {
    if (key === "date" && value instanceof Date) return value.toISOString();
    return value;
  });
}

export function deserializeRows(json: string): SalesRow[] {
  const raw = JSON.parse(json) as Array<SalesRow & { date: string }>;
  return raw.map((r) => ({
    ...r,
    date: new Date(r.date),
  }));
}
