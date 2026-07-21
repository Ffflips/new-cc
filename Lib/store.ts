// AF Knowledge Base storage.
//
// Every resolved feature vector (Raw Candle -> Feature -> Vector -> Prediction
// -> Outcome) is persisted here so the Similarity Engine has something to
// compare against. On Vercel, wire this up to Vercel KV (Upstash Redis) by
// setting KV_REST_API_URL / KV_REST_API_TOKEN in your project's env vars —
// see README.md. Without those set, it falls back to an in-memory store,
// which works for local dev but will NOT persist across serverless
// invocations on Vercel (each request may hit a cold instance). Don't ship
// to production without configuring KV or swapping this for Postgres.

import type { FeatureVector } from "./types";

const memoryStore = new Map<string, FeatureVector>();
let kv: any = null;
let kvChecked = false;

async function getKv() {
  if (kvChecked) return kv;
  kvChecked = true;
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      const mod = await import("@vercel/kv");
      kv = mod.kv;
    } catch {
      kv = null;
    }
  }
  return kv;
}

function key(instId: string, bar: string, id: string) {
  return `af:vec:${instId}:${bar}:${id}`;
}

function indexKey(instId: string, bar: string) {
  return `af:index:${instId}:${bar}`;
}

export async function saveVector(v: FeatureVector): Promise<void> {
  const client = await getKv();
  if (client) {
    await client.set(key(v.instId, v.bar, v.id), v);
    await client.sadd(indexKey(v.instId, v.bar), v.id);
  } else {
    memoryStore.set(key(v.instId, v.bar, v.id), v);
  }
}

export async function getAllVectors(instId: string, bar: string): Promise<FeatureVector[]> {
  const client = await getKv();
  if (client) {
    const ids: string[] = (await client.smembers(indexKey(instId, bar))) ?? [];
    if (ids.length === 0) return [];
    const results = await Promise.all(ids.map((id) => client.get(key(instId, bar, id))));
    return results.filter(Boolean) as FeatureVector[];
  }
  return Array.from(memoryStore.values()).filter((v) => v.instId === instId && v.bar === bar);
}

export async function updateOutcome(
  instId: string,
  bar: string,
  id: string,
  outcome: FeatureVector["outcome"]
): Promise<void> {
  const client = await getKv();
  if (client) {
    const existing = (await client.get(key(instId, bar, id))) as FeatureVector | null;
    if (existing) {
      existing.outcome = outcome;
      await client.set(key(instId, bar, id), existing);
    }
  } else {
    const existing = memoryStore.get(key(instId, bar, id));
    if (existing) existing.outcome = outcome;
  }
}

export async function knowledgeBaseSize(instId: string, bar: string): Promise<number> {
  const all = await getAllVectors(instId, bar);
  return all.length;
}

export function isUsingPersistentStore(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}
