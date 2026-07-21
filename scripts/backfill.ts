// Run with: npm run backfill -- --instId=BTC-USDT-SWAP --bar=1m --pages=500
//
// Requires KV_REST_API_URL / KV_REST_API_TOKEN in your environment (same
// values as your Vercel project) so the vectors land in the same knowledge
// base your deployed app reads from. Without those set it'll write to an
// in-memory store that disappears when the script exits — useless for a
// real backfill, fine only for a dry-run smoke test.

import { runBackfill } from "../lib/backfill-core";
import type { Bar } from "../lib/okx";

function arg(name: string, fallback: string): string {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.split("=")[1] : fallback;
}

async function main() {
  const instId = arg("instId", "BTC-USDT-SWAP");
  const bar = arg("bar", "1m") as Bar;
  const pages = Number(arg("pages", "500")); // 500 pages * 100 candles ~ 50k 1m candles (~35 days)

  if (!process.env.KV_REST_API_URL) {
    console.warn(
      "⚠️  KV_REST_API_URL is not set — vectors will be written to an in-memory store " +
        "that disappears when this script exits. Set KV_REST_API_URL / KV_REST_API_TOKEN " +
        "(copy them from your Vercel project's Storage tab) before running a real backfill."
    );
  }

  console.log(`Backfilling ${instId} ${bar} — up to ${pages} history pages...`);
  const result = await runBackfill({ instId, bar, pages });
  console.log("Done:", result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
