// Engine 5: Similarity Engine — the "soul" of AF.
// Compares the current Wave + Volume + Smart Money vector against every
// resolved vector in the knowledge base using a weighted blend of cosine,
// euclidean, and pearson measures, and returns the top matches.

import type { FeatureVector, SimilarityMatch } from "./types";
import { cosineSimilarity, euclideanDistance, pearsonCorrelation } from "./math";
import { smartMoneyToArray } from "./smart-money";
import { volumeProfileToArray } from "./volume-profile";
import { waveVectorToArray } from "./wave-engine";

export function vectorToArray(v: FeatureVector): number[] {
  return [
    ...waveVectorToArray(v.wave),
    ...volumeProfileToArray(v.volumeProfile, v.price),
    ...smartMoneyToArray(v.smartMoney)
  ];
}

export function findTopMatches(
  current: FeatureVector,
  history: FeatureVector[],
  topN = 20
): SimilarityMatch[] {
  const currentArr = vectorToArray(current);

  // Only compare against vectors that have resolved outcomes — an unresolved
  // vector can't tell Engine 6 what happened next.
  const resolvable = history.filter((h) => h.outcome && h.id !== current.id);

  const scored = resolvable.map((h) => {
    const arr = vectorToArray(h);
    const cosine = cosineSimilarity(currentArr, arr); // -1..1
    const euclid = euclideanDistance(currentArr, arr); // 0..inf
    const euclidSim = 1 / (1 + euclid); // squashed to 0..1, higher = more similar
    const pearson = pearsonCorrelation(currentArr, arr); // -1..1

    // Combined score per the project spec: Similarity = Cosine + DTW + Euclidean + Pearson.
    // DTW is omitted here (single-snapshot vectors, not raw time series) and its
    // weight folded into euclidean; swap in a real DTW pass if you start comparing
    // whole sub-sequences instead of single feature snapshots.
    const combined =
      0.4 * normalize(cosine) + 0.35 * euclidSim + 0.25 * normalize(pearson);

    return {
      vector: h,
      score: Math.round(combined * 1000) / 10, // 0-100
      cosine: Math.round(cosine * 1000) / 1000,
      euclidean: Math.round(euclid * 1000) / 1000,
      pearson: Math.round(pearson * 1000) / 1000
    };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, topN);
}

function normalize(x: number) {
  // Maps a -1..1 similarity measure to 0..1.
  return (x + 1) / 2;
}
