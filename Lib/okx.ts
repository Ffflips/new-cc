// Engine 1: Market Collector
// Talks to OKX's public (no-auth) REST endpoints. All endpoints used here are
// public market-data endpoints — no API key/secret required, and nothing in
// this file ever places, amends, or cancels an order.

import type { Candle, FundingSnapshot, OpenInterestSnapshot, OrderBookSnapshot } from "./types";

const BASE = "https://www.okx.com";

async function okxGet<T>(path: string, params: Record<string, string | number>): Promise<T> {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
  ).toString();
  const url = `${BASE}${path}?${qs}`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) {
    throw new Error(`OKX request failed: ${path} (${res.status})`);
  }
  const json = await res.json();
  if (json.code !== "0") {
    throw new Error(`OKX API error on ${path}: ${json.code} ${json.msg}`);
  }
  return json.data as T;
}

export type Bar = "1m" | "3m" | "5m" | "15m" | "30m" | "1H" | "4H";

/**
 * Fetch recent candles for an instrument. OKX returns newest-first;
 * this returns oldest-first, which is what every downstream engine expects.
 */
export async function getCandles(instId: string, bar: Bar, limit = 300): Promise<Candle[]> {
  const raw = await okxGet<string[][]>("/api/v5/market/candles", {
    instId,
    bar,
    limit: Math.min(limit, 300)
  });
  return raw
    .map((row) => ({
      ts: Number(row[0]),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
      volCcyQuote: Number(row[7])
    }))
    .reverse();
}

/**
 * Fetch older candles than `before` (ms epoch). Used by the backfill script
 * to walk backwards through history and seed the Similarity Engine's
 * knowledge base. OKX's history-candles endpoint caps at 100 per call.
 */
export async function getHistoryCandles(
  instId: string,
  bar: Bar,
  before: number,
  limit = 100
): Promise<Candle[]> {
  const raw = await okxGet<string[][]>("/api/v5/market/history-candles", {
    instId,
    bar,
    before,
    limit: Math.min(limit, 100)
  });
  return raw
    .map((row) => ({
      ts: Number(row[0]),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
      volCcyQuote: Number(row[7])
    }))
    .reverse();
}

export async function getOrderBook(instId: string, depth = 400): Promise<OrderBookSnapshot> {
  const raw = await okxGet<any[]>("/api/v5/market/books", { instId, sz: depth });
  const d = raw[0];
  return {
    ts: Number(d.ts),
    bids: d.bids.map((b: string[]) => [Number(b[0]), Number(b[1])]),
    asks: d.asks.map((a: string[]) => [Number(a[0]), Number(a[1])])
  };
}

export async function getFunding(instId: string): Promise<FundingSnapshot> {
  const raw = await okxGet<any[]>("/api/v5/public/funding-rate", { instId });
  const d = raw[0];
  return {
    ts: Number(d.fundingTime),
    fundingRate: Number(d.fundingRate),
    nextFundingRate: d.nextFundingRate ? Number(d.nextFundingRate) : undefined
  };
}

export async function getOpenInterest(instId: string): Promise<OpenInterestSnapshot> {
  const raw = await okxGet<any[]>("/api/v5/public/open-interest", { instId, instType: "SWAP" });
  const d = raw[0];
  return {
    ts: Number(d.ts),
    oi: Number(d.oi),
    oiCcy: Number(d.oiCcy)
  };
}

export async function getTicker(instId: string) {
  const raw = await okxGet<any[]>("/api/v5/market/ticker", { instId });
  const d = raw[0];
  return {
    last: Number(d.last),
    bidPx: Number(d.bidPx),
    askPx: Number(d.askPx),
    vol24h: Number(d.vol24h)
  };
}

export const SUPPORTED_INSTRUMENTS = [
  "BTC-USDT-SWAP",
  "ETH-USDT-SWAP"
  // Extend this list to support all USDT-margined perpetuals (spec: "后续支持所有USDT合约").
  // Pull the full list dynamically from /api/v5/public/instruments?instType=SWAP
  // once you're ready to widen coverage past BTC/ETH.
] as const;
