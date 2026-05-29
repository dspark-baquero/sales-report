"use client";

import { useState } from "react";
import Link from "next/link";
import { X, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatKRWLong, formatKRWShort, formatPct, formatPctAbs } from "@/lib/format";
import { customerHref } from "@/components/CustomerLink";
import {
  CHANNEL_KEYS,
  type BrandChannelMatrixData,
  type BrandCustomerMatrixData,
  type CellColor,
  type ChannelKey,
  type ChannelMatrixCell,
  type CustomerMatrixCell,
} from "@/lib/brandCustomerMatrix";

// ── 색상 클래스 ────────────────────────────────────────

const COLOR_CLASS: Record<CellColor, string> = {
  blue: "bg-blue-100 hover:bg-blue-200 text-blue-900 border-blue-200",
  green: "bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border-emerald-200",
  red: "bg-rose-100 hover:bg-rose-200 text-rose-900 border-rose-200",
  amber: "bg-amber-100 hover:bg-amber-200 text-amber-900 border-amber-200",
  gray: "bg-muted hover:bg-muted/80 text-muted-foreground border-border",
};

const COLOR_DOT: Record<CellColor, string> = {
  blue: "bg-blue-400",
  green: "bg-emerald-400",
  red: "bg-rose-400",
  amber: "bg-amber-400",
  gray: "bg-muted-foreground/40",
};

const LEGEND_4WAY: { color: CellColor; label: string }[] = [
  { color: "blue", label: "전년 ↑ · 목표 달성" },
  { color: "green", label: "전년 ↑ · 목표 미달" },
  { color: "amber", label: "전년 ↓ · 목표 달성" },
  { color: "red", label: "전년 ↓ · 목표 미달" },
  { color: "gray", label: "데이터 부족" },
];

const LEGEND_3WAY: { color: CellColor; label: string }[] = [
  { color: "blue", label: "전년 동기 ↑" },
  { color: "red", label: "전년 동기 ↓" },
  { color: "gray", label: "변동 미미 / 매출 미미" },
];

// ── 컨테이너 (export) ─────────────────────────────────

export function BrandMatrix({
  depth1,
  depth2ByChannel,
  ym,
}: {
  depth1: BrandChannelMatrixData;
  depth2ByChannel: Record<ChannelKey, BrandCustomerMatrixData>;
  ym: string;
}) {
  const [selectedChannel, setSelectedChannel] = useState<ChannelKey>("해외영업");
  const [selectedDepth1Key, setSelectedDepth1Key] = useState<string | null>(null);
  const [selectedDepth2Key, setSelectedDepth2Key] = useState<string | null>(null);

  const depth2 = depth2ByChannel[selectedChannel];

  const handleDepth1Click = (brand: string, channel: ChannelKey) => {
    const key = `${brand}|${channel}`;
    // 같은 셀 재클릭 시 패널만 닫음. 채널이 다른 셀 클릭 시 채널 전환 + 2뎁스 selection 초기화
    if (selectedDepth1Key === key) {
      setSelectedDepth1Key(null);
      return;
    }
    setSelectedDepth1Key(key);
    if (selectedChannel !== channel) {
      setSelectedChannel(channel);
      setSelectedDepth2Key(null);
    }
  };

  const handleDepth2Click = (key: string) => {
    setSelectedDepth2Key(selectedDepth2Key === key ? null : key);
  };

  const selectedDepth1Cell: ChannelMatrixCell | null = selectedDepth1Key
    ? depth1.cells.get(selectedDepth1Key) ?? null
    : null;
  const selectedDepth2Cell: CustomerMatrixCell | null = selectedDepth2Key
    ? depth2.cells.get(selectedDepth2Key) ?? null
    : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ChannelMatrixCard
        data={depth1}
        selectedKey={selectedDepth1Key}
        selectedChannel={selectedChannel}
        selectedCell={selectedDepth1Cell}
        onCellClick={handleDepth1Click}
        onClosePanel={() => setSelectedDepth1Key(null)}
      />
      <CustomerMatrixCard
        data={depth2}
        ym={ym}
        selectedKey={selectedDepth2Key}
        selectedCell={selectedDepth2Cell}
        onCellClick={handleDepth2Click}
        onClosePanel={() => setSelectedDepth2Key(null)}
      />
    </div>
  );
}

// 기존 named export 유지 (alias)
export { BrandMatrix as BrandCustomerMatrix };

// ── 좌측: 1뎁스 카드 ────────────────────────────────────

function ChannelMatrixCard({
  data,
  selectedKey,
  selectedChannel,
  selectedCell,
  onCellClick,
  onClosePanel,
}: {
  data: BrandChannelMatrixData;
  selectedKey: string | null;
  selectedChannel: ChannelKey;
  selectedCell: ChannelMatrixCell | null;
  onCellClick: (brand: string, channel: ChannelKey) => void;
  onClosePanel: () => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <div>
            <CardTitle>브랜드 × 채널 매트릭스</CardTitle>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              YTD 누적 · 전년 동기 대비 · 채널 목표 달성 — 셀 클릭 시 우측 매트릭스 전환
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
            {LEGEND_4WAY.map((l) => (
              <div key={l.color} className="flex items-center gap-1">
                <span className={`inline-block w-2.5 h-2.5 rounded-sm ${COLOR_DOT[l.color]}`} />
                <span className="text-muted-foreground">{l.label}</span>
              </div>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="px-4 pb-4 overflow-x-auto">
          <table className="border-separate w-full" style={{ borderSpacing: 0 }}>
            <thead>
              <tr>
                <th
                  className="sticky left-0 z-10 bg-card text-left text-[11px] text-muted-foreground font-medium pb-2 pr-2 align-bottom"
                  style={{ minWidth: 90 }}
                >
                  브랜드 \ 채널
                </th>
                {data.channels.map((c) => (
                  <th
                    key={c}
                    className={`text-[11px] font-medium pb-2 px-1 align-bottom whitespace-nowrap ${
                      c === selectedChannel ? "text-primary font-semibold" : "text-muted-foreground"
                    }`}
                    style={{ minWidth: 86 }}
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.brands.map((b) => (
                <tr key={b}>
                  <td
                    className="sticky left-0 z-10 bg-card text-xs font-medium pr-2 py-1 border-r"
                    style={{ minWidth: 90 }}
                  >
                    {b}
                  </td>
                  {data.channels.map((c) => {
                    const key = `${b}|${c}`;
                    const cell = data.cells.get(key);
                    if (!cell) return <td key={key} />;
                    const cls = COLOR_CLASS[cell.color];
                    const active = selectedKey === key;
                    return (
                      <td key={key} className="px-0.5 py-0.5" style={{ minWidth: 86 }}>
                        <button
                          type="button"
                          onClick={() => onCellClick(b, c)}
                          className={`w-full px-1.5 py-1 text-left rounded border transition-colors ${cls} ${
                            active ? "ring-2 ring-primary" : ""
                          }`}
                          title={`${b} × ${c}: YTD ${formatKRWShort(cell.ytd)}`}
                        >
                          <div className="text-[11px] tabular-nums leading-tight font-medium">
                            {cell.ytd > 0 ? formatKRWShort(cell.ytd) : "—"}
                          </div>
                          <div className="text-[9px] tabular-nums leading-tight opacity-70">
                            {cell.ytdPct !== null
                              ? `전년 ${formatPct(cell.ytdPct, 0)}`
                              : cell.ytd > 0
                                ? "신규"
                                : ""}
                          </div>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selectedCell && (
          <div className="border-t bg-muted/30 px-4 py-3">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-block px-1.5 py-0.5 text-[10px] font-medium rounded bg-card border">
                    {selectedCell.brand}
                  </span>
                  <span className="text-sm font-semibold">{selectedCell.channel}</span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  {selectedCell.colorReason}
                </div>
              </div>
              <button
                type="button"
                onClick={onClosePanel}
                className="p-1 rounded hover:bg-muted text-muted-foreground"
                aria-label="닫기"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
              <Metric label="이번달" value={selectedCell.monthCur} />
              <Metric label="전월" value={selectedCell.monthPrev} muted />
              <Metric label="전년 동월" value={selectedCell.monthPrevYear} muted />
              <Metric label="YTD 누적" value={selectedCell.ytd} bold />
              <Metric label="전년 동기 YTD" value={selectedCell.prevYtd} muted />
              <div className="rounded border bg-card px-2 py-1.5">
                <div className="text-[10px] text-muted-foreground">채널 YTD 목표</div>
                {selectedCell.ytdTarget > 0 ? (
                  <>
                    <div className="text-sm font-semibold tabular-nums">
                      {formatKRWLong(selectedCell.ytdTarget)}
                    </div>
                    <div
                      className={`text-[10px] tabular-nums ${
                        selectedCell.achievementRate !== null && selectedCell.achievementRate >= 1
                          ? "text-emerald-700"
                          : "text-rose-700"
                      }`}
                    >
                      달성률{" "}
                      {selectedCell.achievementRate !== null
                        ? formatPctAbs(selectedCell.achievementRate, 1)
                        : "—"}
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground">목표 매칭 없음</div>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── 우측: 2뎁스 카드 ────────────────────────────────────

function CustomerMatrixCard({
  data,
  ym,
  selectedKey,
  selectedCell,
  onCellClick,
  onClosePanel,
}: {
  data: BrandCustomerMatrixData;
  ym: string;
  selectedKey: string | null;
  selectedCell: CustomerMatrixCell | null;
  onCellClick: (key: string) => void;
  onClosePanel: () => void;
}) {
  void CHANNEL_KEYS;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2 flex-wrap">
              <span>브랜드 × 거래처</span>
              <span className="inline-block px-1.5 py-0.5 text-[11px] font-medium rounded bg-primary/10 text-primary">
                {data.channel}
              </span>
            </CardTitle>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {data.channel} 채널 · YTD 매출 상위 {data.customers.length} 거래처
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
            {LEGEND_3WAY.map((l) => (
              <div key={l.color} className="flex items-center gap-1">
                <span className={`inline-block w-2.5 h-2.5 rounded-sm ${COLOR_DOT[l.color]}`} />
                <span className="text-muted-foreground">{l.label}</span>
              </div>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="px-4 pb-4 overflow-x-auto">
          {data.customers.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {data.channel} 채널에 매출 데이터가 없습니다.
            </div>
          ) : (
            <table className="border-separate" style={{ borderSpacing: 0 }}>
              <thead>
                <tr>
                  <th
                    className="sticky left-0 z-10 bg-card text-left text-[11px] text-muted-foreground font-medium pb-2 pr-2 align-bottom"
                    style={{ minWidth: 90 }}
                  >
                    브랜드 \ 거래처
                  </th>
                  {data.customers.map((c) => (
                    <th
                      key={c}
                      className="text-[10px] text-muted-foreground font-medium pb-2 px-1 align-bottom"
                      style={{ minWidth: 80, maxWidth: 100 }}
                    >
                      <div
                        className="truncate whitespace-nowrap"
                        title={c}
                        style={{ maxWidth: 100 }}
                      >
                        {c}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.brands.map((b) => (
                  <tr key={b}>
                    <td
                      className="sticky left-0 z-10 bg-card text-xs font-medium pr-2 py-1 border-r"
                      style={{ minWidth: 90 }}
                    >
                      {b}
                    </td>
                    {data.customers.map((c) => {
                      const key = `${b}|${c}`;
                      const cell = data.cells.get(key);
                      if (!cell) return <td key={key} />;
                      const cls = COLOR_CLASS[cell.color];
                      const active = selectedKey === key;
                      return (
                        <td key={key} className="px-0.5 py-0.5" style={{ minWidth: 80, maxWidth: 100 }}>
                          <button
                            type="button"
                            onClick={() => onCellClick(key)}
                            className={`w-full px-1.5 py-1 text-left rounded border transition-colors ${cls} ${
                              active ? "ring-2 ring-primary" : ""
                            }`}
                            title={`${b} × ${c}: YTD ${formatKRWShort(cell.ytd)}`}
                          >
                            <div className="text-[10px] tabular-nums leading-tight">
                              {cell.ytd > 0 ? formatKRWShort(cell.ytd) : "—"}
                            </div>
                            <div className="text-[9px] tabular-nums leading-tight opacity-70">
                              {cell.ytdPct !== null
                                ? formatPct(cell.ytdPct, 0)
                                : cell.ytd > 0
                                  ? "신규"
                                  : ""}
                            </div>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {selectedCell && (
          <div className="border-t bg-muted/30 px-4 py-3">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-block px-1.5 py-0.5 text-[10px] font-medium rounded bg-card border">
                    {selectedCell.brand}
                  </span>
                  <Link
                    href={customerHref(selectedCell.customer, ym)}
                    className="text-sm font-semibold hover:underline flex items-center gap-1"
                  >
                    {selectedCell.customer}
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  {selectedCell.colorReason}
                </div>
              </div>
              <button
                type="button"
                onClick={onClosePanel}
                className="p-1 rounded hover:bg-muted text-muted-foreground"
                aria-label="닫기"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
              <Metric label="이번달" value={selectedCell.monthCur} />
              <Metric label="전월" value={selectedCell.monthPrev} muted />
              <Metric label="전년 동월" value={selectedCell.monthPrevYear} muted />
              <Metric label="YTD 누적" value={selectedCell.ytd} bold />
              <Metric label="전년 동기 YTD" value={selectedCell.prevYtd} muted />
              <div className="rounded border bg-card px-2 py-1.5">
                <div className="text-[10px] text-muted-foreground">전년 동기 대비</div>
                <div
                  className={`text-sm font-semibold tabular-nums ${
                    selectedCell.ytdDiff > 0
                      ? "text-emerald-700"
                      : selectedCell.ytdDiff < 0
                        ? "text-rose-700"
                        : "text-muted-foreground"
                  }`}
                >
                  {selectedCell.ytdPct !== null ? formatPct(selectedCell.ytdPct, 1) : "신규"}
                </div>
                <div className="text-[10px] tabular-nums text-muted-foreground">
                  {selectedCell.ytdDiff > 0 ? "+" : ""}
                  {formatKRWShort(selectedCell.ytdDiff)}
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── 공통 ────────────────────────────────────────────

function Metric({
  label,
  value,
  muted,
  bold,
}: {
  label: string;
  value: number;
  muted?: boolean;
  bold?: boolean;
}) {
  return (
    <div className="rounded border bg-card px-2 py-1.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div
        className={`tabular-nums ${bold ? "text-sm font-semibold" : "text-sm"} ${
          muted ? "text-muted-foreground" : ""
        }`}
      >
        {value > 0 ? formatKRWLong(value) : "—"}
      </div>
    </div>
  );
}
