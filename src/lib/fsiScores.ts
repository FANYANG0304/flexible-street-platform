/**
 * FSI (Flexibility Score Index) — POI density + proximity scoring.
 *
 * Each street's FSI is computed on-the-fly from the density and proximity
 * of Points of Interest (POIs) in the Supabase poi table.
 *
 * Dimension → POI category mapping:
 *   commercial = Food & Dining + Culture + Finance
 *   social     = Education + Community + Religious + Public Safety
 *   ecological = Healthcare + Transport
 *
 * Formula per dimension:
 *   raw   = Σ exp(−distance / decay_m)  for each relevant POI within range
 *   score = round(100 × (1 − exp(−raw / saturation)))   [sigmoid squeeze 0–100]
 *
 * The sigmoid ensures:
 *   • Multiple nearby POIs add up meaningfully (density matters)
 *   • Scores don't explode in very dense areas — they saturate naturally
 *   • Streets with zero nearby POIs score 0
 *
 * Parameters (tuned against Philadelphia study areas):
 *   commercial: decay 400 m, saturation 2.5
 *   social:     decay 300 m, saturation 1.5
 *   ecological: decay 500 m, saturation 3.0
 *
 * Playstreets and Open Streets are intentionally excluded as inputs —
 * they are validation datasets, not training signals.
 */

export interface FSIData {
  commercial: number;
  social:     number;
  ecological: number;
  total:      number;
}

/** Minimal POI record used for FSI scoring. */
export interface POIRecord {
  lat:      number;
  lng:      number;
  category: string;
}

// Streets that city can close unilaterally
const CITY_CLOSEABLE = new Set([
  'CITY', 'FAIRMOUNT PARK', 'PHA', 'PIDC', 'FAM',
]);

// Streets requiring inter-agency coordination
const NEEDS_APPROVAL = new Set([
  'STATE', 'SEPTA', 'DRPA', 'BCBC', 'TOWNSHIP',
]);

export type Closeability = 'yes' | 'approval' | 'no';

export function getCloseability(responsibl: string): Closeability {
  const r = (responsibl ?? '').trim().toUpperCase();
  if (CITY_CLOSEABLE.has(r))  return 'yes';
  if (NEEDS_APPROVAL.has(r))  return 'approval';
  return 'no';
}

export function closeabilityLabel(c: Closeability): string {
  if (c === 'yes')      return 'City-managed · Can close';
  if (c === 'approval') return 'Needs agency approval';
  return 'Cannot close';
}

export function closeabilityColor(c: Closeability): string {
  if (c === 'yes')      return '#6EE7B7';
  if (c === 'approval') return '#FCD34D';
  return '#F87171';
}

// ── Traffic modifier ─────────────────────────────────────────────────────────

type RoadType = 'highway' | 'arterial' | 'collector' | 'local';

/**
 * Infer road type from street name suffix + responsible agency.
 * No external data required — uses existing vector tile properties.
 */
function inferRoadType(stname: string, responsibl: string): RoadType {
  if ((responsibl ?? '').trim().toUpperCase() === 'STATE') return 'highway';
  const suffix = (stname ?? '').trim().toUpperCase().split(' ').pop() ?? '';
  if (['AVE', 'BLVD', 'PKWY', 'DR', 'HWY', 'FWY', 'EXPY'].includes(suffix)) return 'arterial';
  if (['ST', 'RD', 'WAY'].includes(suffix)) return 'collector';
  return 'local';  // LN, PL, CT, ALY, TER, etc.
}

/**
 * Traffic congestion modifier per road type × time period.
 * Returns a 0–1 multiplier: 1.0 = free-flowing, lower = more congested.
 *
 * Logic:
 *   - Highways are always high-traffic → hard to close at any time
 *   - Arterials peak in morning / evening rush
 *   - Collectors are moderate
 *   - Local streets are nearly always closeable
 */
const TRAFFIC_TABLE: Record<RoadType, Record<string, number>> = {
  highway:   { morning: 0.20, afternoon: 0.35, evening: 0.25, night: 0.60 },
  arterial:  { morning: 0.40, afternoon: 0.65, evening: 0.45, night: 0.90 },
  collector: { morning: 0.70, afternoon: 0.80, evening: 0.70, night: 1.00 },
  local:     { morning: 0.90, afternoon: 0.95, evening: 0.90, night: 1.00 },
};

export type TrafficLevel = 'Heavy' | 'Moderate' | 'Light' | 'Free';

export function trafficLabel(mod: number): TrafficLevel {
  if (mod <= 0.40) return 'Heavy';
  if (mod <= 0.65) return 'Moderate';
  if (mod <= 0.85) return 'Light';
  return 'Free';
}

export function getTrafficModifier(
  stname:     string | undefined,
  responsibl: string | undefined,
  timeBin:    string,
): number {
  const type = inferRoadType(stname ?? '', responsibl ?? '');
  return TRAFFIC_TABLE[type][timeBin] ?? 1.0;
}

// ── Composite FSI ─────────────────────────────────────────────────────────────

/**
 * Composite FSI total score:
 *
 *   1. Closeability gate — cannot close → 0
 *   2. Weighted blend:
 *        hasAI  →  mlTotal × 0.60 + aiScore × 0.40
 *        no AI  →  mlTotal (unweighted)
 *   3. Approval penalty — needs agency sign-off → × 0.75
 *   4. Traffic modifier (time-period based) × weather modifier
 *
 * Sub-scores (commercial / social / ecological) are unchanged.
 */
export function computeCompositeTotal(
  mlTotal:      number,
  aiScore:      number | undefined,
  closeability: Closeability,
  trafficMod:   number = 1.0,
  weatherMod:   number = 1.0,
): number {
  if (closeability === 'no') return 0;

  const raw = (aiScore != null)
    ? mlTotal * 0.6 + aiScore * 0.4
    : mlTotal;

  const penalised = (closeability === 'approval') ? raw * 0.75 : raw;
  const adjusted  = penalised * trafficMod * weatherMod;
  return Math.min(100, Math.max(0, Math.round(adjusted)));
}

// ── POI density-based FSI ────────────────────────────────────────────────────

/** Haversine distance in metres between two WGS-84 points. */
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R  = 6_371_000;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const dφ = (lat2 - lat1) * Math.PI / 180;
  const dλ = (lng2 - lng1) * Math.PI / 180;
  const a  = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type Dim = keyof Omit<FSIData, 'total'>;

const DIM_CATEGORIES: Record<Dim, string[]> = {
  commercial: ['Food & Dining', 'Culture', 'Finance'],
  social:     ['Education', 'Community', 'Religious', 'Public Safety'],
  ecological: ['Healthcare', 'Transport'],
};

/** Decay radius (metres) — how quickly contribution falls off with distance. */
const DECAY_M: Record<Dim, number> = {
  commercial: 400,   // walking distance to restaurants / shops
  social:     300,   // schools / community centres serve a tight catchment
  ecological: 500,   // transit stops and hospitals have wider reach
};

/**
 * Saturation constant for the sigmoid normaliser.
 * Higher value → need more POIs to reach high scores (avoids over-saturation
 * in dense categories like Food & Dining with 1158 entries).
 */
const SATURATION: Record<Dim, number> = {
  commercial: 2.5,
  social:     1.5,
  ecological: 3.0,   // Transport is dense (342 stops) — needs higher saturation
};

/** Fast rectangular pre-filter: ±0.025° ≈ ±2.8 km. */
const FAST_FILTER_DEG = 0.025;

function dimScore(lat: number, lng: number, pois: POIRecord[], dim: Dim): number {
  const categories = DIM_CATEGORIES[dim];
  const decay      = DECAY_M[dim];
  const saturation = SATURATION[dim];
  let raw = 0;

  for (const p of pois) {
    // Cheap rectangular bbox reject before expensive haversine
    if (Math.abs(p.lat - lat) > FAST_FILTER_DEG) continue;
    if (Math.abs(p.lng - lng) > FAST_FILTER_DEG) continue;
    if (!categories.includes(p.category)) continue;

    const d = haversineMeters(lat, lng, p.lat, p.lng);
    if (d > decay * 4) continue;            // hard cutoff at 4× decay radius

    raw += Math.exp(-d / decay);
  }

  // Sigmoid squeeze: maps [0, ∞) → [0, 100)
  // raw = saturation → score ≈ 63;  raw = 2×sat → score ≈ 86
  return Math.min(100, Math.round(100 * (1 - Math.exp(-raw / saturation))));
}

/**
 * Compute POI-density FSI for a street at (lat, lng).
 *
 * Returns null when the POI list hasn't loaded yet so callers can fall back
 * to pseudo-random scores during the initial load.
 */
export function computePoiFSI(
  lat:  number,
  lng:  number,
  pois: POIRecord[],
): FSIData | null {
  if (pois.length === 0) return null;

  const commercial = dimScore(lat, lng, pois, 'commercial');
  const social     = dimScore(lat, lng, pois, 'social');
  const ecological = dimScore(lat, lng, pois, 'ecological');
  return {
    commercial,
    social,
    ecological,
    total: Math.round((commercial + social + ecological) / 3),
  };
}
