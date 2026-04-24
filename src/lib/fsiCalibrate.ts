/**
 * Saturation calibration using playstreets as positive ground truth.
 *
 * Why this exists: the sigmoid `score = 100 × (1 − exp(−raw / saturation))`
 * has one free parameter per dimension — `saturation`. Picking it by hand is
 * guesswork. Playstreets are curated activation-friendly blocks, so they
 * should usually score well; the distribution of their raw (pre-saturation)
 * POI sums tells us what saturation value keeps most of them above a chosen
 * threshold.
 *
 * Math:
 *   score ≥ threshold  ⇔  raw / sat ≥ −ln(1 − threshold/100)
 *   → for the Pk percentile playstreet to reach `threshold`,
 *     sat = raw_Pk / −ln(1 − threshold/100)
 *
 * For threshold=75, −ln(0.25) ≈ 1.386.
 */

import {
  rawSumAlongStreet, SATURATION,
  type POIRecord, type Dim,
} from './fsiScores';

const DIMS: Dim[] = ['commercial', 'community', 'mobility'];

/** Coerce a GeoJSON feature's geometry into a [lng, lat] polyline. */
function featureToCoords(f: any): [number, number][] | null {
  const g = f?.geometry;
  if (!g) return null;
  if (g.type === 'LineString')      return g.coordinates as [number, number][];
  if (g.type === 'MultiLineString') return (g.coordinates as [number, number][][]).flat();
  return null;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[idx];
}

/**
 * Log a raw-sum distribution + suggested saturation values to the browser
 * console for a given positive-sample feature set (playstreets, open
 * streets, whatever you're using as ground truth).
 *
 * `label` appears in the header so you can tell the two tables apart.
 * The tool does not mutate anything — it prints numbers you copy back
 * into SATURATION in `fsiScores.ts`.
 */
export function logCalibration(
  label: string,
  features: any[],
  pois: POIRecord[],
  threshold = 75,
): void {
  if (features.length === 0 || pois.length === 0) return;

  // Collect raw sums per dimension
  const raws: Record<Dim, number[]> = { commercial: [], community: [], mobility: [] };
  for (const f of features) {
    const coords = featureToCoords(f);
    if (!coords) continue;
    for (const dim of DIMS) {
      raws[dim].push(rawSumAlongStreet(coords, pois, dim));
    }
  }

  const count = raws.commercial.length;
  const K     = -Math.log(1 - threshold / 100);   // ≈ 1.386 at threshold=75
  const fix   = (x: number) => (Number.isFinite(x) ? Number(x.toFixed(3)) : null);

  // Build one row per dimension for console.table — everything visible at once.
  const rows = DIMS.map(dim => {
    const sorted    = [...raws[dim]].sort((a, b) => a - b);
    const nonZero   = sorted.filter(v => v > 0).length;
    const medianRaw = percentile(sorted, 50);
    const p75Raw    = percentile(sorted, 75);
    const currentSat = SATURATION[dim];
    const currentMedianScore = Math.round(100 * (1 - Math.exp(-medianRaw / currentSat)));
    return {
      dim,
      currentSat,
      medianScoreNow: currentMedianScore,
      nonZero: `${nonZero}/${count}`,
      'raw P10': fix(percentile(sorted, 10)),
      'raw P25': fix(percentile(sorted, 25)),
      'raw P50': fix(medianRaw),
      'raw P75': fix(p75Raw),
      'raw P90': fix(percentile(sorted, 90)),
      'raw max': fix(sorted[sorted.length - 1]),
      'sat · 50% pass': medianRaw > 0 ? fix(medianRaw / K) : null,
      'sat · 25% pass': p75Raw    > 0 ? fix(p75Raw    / K) : null,
    };
  });

  console.log(
    `%c[FSI calibration] ${label} n=${count}, threshold=${threshold} — copy sat value back into SATURATION in fsiScores.ts`,
    'color:#6EE7B7;font-weight:700',
  );
  console.table(rows);
  console.log(
    `%cSat · 50% pass = median ${label} feature scores exactly ${threshold} (generous). ` +
    `Sat · 25% pass = only the top-quartile ${label} feature reaches ${threshold} ` +
    '(stricter, preserves discrimination across the city).',
    'color:#94A3B8;font-style:italic',
  );
}

/** Back-compat alias — playstreet calibration is the canonical entry point. */
export const logPlaystreetCalibration = (
  features: any[], pois: POIRecord[], threshold = 75,
) => logCalibration('playstreets', features, pois, threshold);
