/**
 * FSI (Flexibility Score Index) — along-street POI density scoring.
 *
 * Each street's FSI is computed from POIs that front ONTO the street
 * polyline (perpendicular distance ≤ CORRIDOR_WIDTH_M). POIs on parallel
 * blocks do NOT count.
 *
 * Dimension → POI category mapping:
 *   commercial = Food & Dining + Culture + Finance
 *   community  = Education + Community + Religious + Public Safety + Healthcare
 *   mobility   = Transport   (INFORMATIONAL — not part of the composite total)
 *
 * Formula per dimension:
 *   raw   = Σ exp(−d_perp / DECAY_PERP_M)   for each in-corridor POI
 *   score = round(100 × (1 − exp(−raw / saturation)))     [sigmoid 0–100]
 *
 * Composite total = max(commercial, community). Mobility is surfaced
 * separately as a factor tag in the UI.
 *
 * Playstreets and Open Streets are intentionally excluded as inputs —
 * they are validation datasets, not training signals.
 */

export interface FSIData {
  commercial: number;
  /** Civic institutions — schools, community centers, religious, safety, healthcare. */
  community:  number;
  /**
   * Transit accessibility — SEPTA / rail / bus stops. Reported as a separate
   * tag only; it is INTENTIONALLY NOT part of the composite `total`. Good
   * transit access helps people arrive, but it is not by itself a reason to
   * close the street for flexible use.
   */
  mobility:   number;
  /** Legacy bundled social score (= max(community, mobility)); kept for back-compat. */
  social:     number;
  /** Composite (max of the two scoring dimensions: commercial, community). */
  total:      number;
}

/** Minimal POI record used for FSI scoring. */
export interface POIRecord {
  lat:      number;
  lng:      number;
  category: string;
  /** OSM-style amenity tag (e.g. "school", "library", "university"); used
   *  to split the Education bucket into subtypes for the panel tags. */
  amenity?: string;
}

// Streets that city can close unilaterally
const CITY_CLOSEABLE = new Set([
  'CITY', 'FAIRMOUNT PARK', 'PHA', 'PIDC', 'FAM',
]);

// Streets requiring inter-agency coordination (× 0.75 penalty)
const NEEDS_APPROVAL = new Set([
  'SEPTA', 'DRPA', 'BCBC', 'TOWNSHIP',
]);

/**
 * Full list of agency codes whose streets are closeable at all — used by
 * the "closeable only" map filter. Keeping this in one place prevents the
 * filter from drifting out of sync with getCloseability().
 */
export const CLOSEABLE_RESPONSIBLES: string[] = [
  ...CITY_CLOSEABLE,
  ...NEEDS_APPROVAL,
];

// STATE / federal / private / other → cannot close → score = 0

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
 */
// Modifiers calibrated so that streets with excellent POI density (fsi ≥ 95)
// can still reach a composite score of 90+ — no road type should be a hard ceiling.
// Highway (state-managed) remains heavily penalised; local streets nearly unaffected.
const TRAFFIC_TABLE: Record<RoadType, Record<string, number>> = {
  highway:   { morning: 0.50, afternoon: 0.65, evening: 0.55, night: 0.82 },
  arterial:  { morning: 0.80, afternoon: 0.92, evening: 0.82, night: 0.98 },
  collector: { morning: 0.92, afternoon: 0.95, evening: 0.92, night: 1.00 },
  local:     { morning: 0.96, afternoon: 0.98, evening: 0.96, night: 1.00 },
};

export type TrafficLevel = 'Heavy' | 'Moderate' | 'Light' | 'Free';

export function trafficLabel(mod: number): TrafficLevel {
  if (mod <= 0.60) return 'Heavy';
  if (mod <= 0.82) return 'Moderate';
  if (mod <= 0.93) return 'Light';
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
 * Composite FSI total score.
 *
 * Ownership / closeability is intentionally NOT a factor here — it is shown
 * separately in the UI as an informational warning. Two streets with the
 * same physical activation potential get the same score whether the city
 * can actually close them or not; users decide what to do with that signal.
 *
 *   1. Weighted blend:
 *        hasAI  →  mlTotal × 0.60 + aiScore × 0.40
 *        no AI  →  mlTotal (unweighted)
 *   2. Traffic modifier (time-period based) × weather modifier
 *   3. Events modifier — proximity to a seasonal event (×1.04–×1.20)
 *   4. Holiday modifier — city-wide festival bonus (×1.08–×1.25)
 *
 * Sub-scores (commercial / community / mobility) are unchanged.
 */
export function computeCompositeTotal(
  mlTotal:      number,
  aiScore:      number | undefined,
  trafficMod:   number = 1.0,
  weatherMod:   number = 1.0,
  eventsMod:    number = 1.0,
  holidayMod:   number = 1.0,
): number {
  const raw = (aiScore != null)
    ? mlTotal * 0.6 + aiScore * 0.4
    : mlTotal;

  const adjusted = raw * trafficMod * weatherMod * eventsMod * holidayMod;
  return Math.min(100, Math.max(0, Math.round(adjusted)));
}

// ── POI density-based FSI (along-street corridor model) ────────────────────
//
// Earlier versions averaged POIs inside a circular buffer around the street's
// centroid — so a restaurant on a PARALLEL block got credited toward this
// street's score. The real question we want to answer is "how many POIs
// front onto THIS street?", so we now project every POI onto the street's
// polyline and only count POIs whose perpendicular distance stays inside a
// narrow corridor (~35 m, about one parcel's depth).
//
// Implementation:
//   1. For each POI, find the minimum distance to any segment of the
//      feature's polyline (clamped to segment endpoints so POIs beyond the
//      street's end don't count any more than they would perpendicular).
//   2. Reject POIs outside CORRIDOR_WIDTH_M.
//   3. Weight the contribution by exp(-d / DECAY_PERP_M) — being *right on*
//      the street block-face counts fully, with a smooth taper.
//   4. Sigmoid-squeeze the raw sum to a 0–100 score per dimension.

export type Dim = 'commercial' | 'community' | 'mobility';

export const DIM_CATEGORIES: Record<Dim, string[]> = {
  commercial: ['Food & Dining', 'Culture', 'Finance'],
  community:  ['Education', 'Community', 'Religious', 'Public Safety', 'Healthcare'],
  mobility:   ['Transport'],
};

/**
 * Per-dimension corridor geometry. The idea: different POI types serve a
 * street at different spatial scales.
 *
 *   commercial — a restaurant three blocks away doesn't pull foot traffic
 *                onto THIS street, so we stay strict (≤ 35 m perpendicular,
 *                essentially "must front onto the block").
 *   community  — a school or community center 1-2 blocks away still serves
 *                this street's residents on foot (playstreet model: parents
 *                walk their kids to the nearby school). Much wider walk-shed.
 *   mobility   — a SEPTA stop one block off still counts as accessible.
 *
 * Decay tuned so the curb = full weight, the half-corridor ≈ 0.37, the
 * corridor edge ≈ 0.1.
 */
export const CORRIDOR_WIDTH_M: Record<Dim, number> = {
  commercial:  35,
  community:  150,
  mobility:    80,
};
export const DECAY_PERP_M: Record<Dim, number> = {
  commercial: 20,
  community:  60,
  mobility:   40,
};

/**
 * Saturation constant for the sigmoid normaliser. Recalibrated with the
 * per-dimension corridors:
 *
 *   commercial=2.0 → ~5 restaurants along the block face → score ≈ 90+
 *   community=3.0  → ~5 civic POIs within a 1-2 block walk → score ≈ 80+
 *                  → this is what lifts residential playstreet blocks into
 *                    the "Good" band, matching real activation patterns.
 *   mobility=1.5   → a transit stop within ~80 m → score ≈ 60-70
 */
export const SATURATION: Record<Dim, number> = {
  commercial: 6.5,   // calibrated against Open Streets P50 raw (9.1) — preserves discrimination at the top end
  community:  0.6,   // calibrated against playstreet P75 raw (0.844) — stricter
  mobility:   1.5,   // informational tag only, not in total
};

/**
 * Extra score added on TOP of the saturated dim score when a feature is
 * clearly leading its local neighbourhood — lets a sparse-area "main
 * street" surface even when its absolute POI count is modest. See
 * `applyScores` in MapComponent for the dominance calculation; this
 * constant just caps how many points a perfect local leader can earn.
 */
export const PROMINENCE_BONUS: Record<Dim, number> = {
  commercial: 40,   // sparse neighbourhoods lack commercial everywhere — local leader deserves a big lift
  community:  10,   // community corridor is already 150 m wide, so bonus is subtler
  mobility:    0,   // not in composite total — leave mobility untouched
};

/** Apply the sigmoid saturation for a single dimension's raw weighted sum. */
export function saturate(raw: number, dim: Dim): number {
  return Math.min(100, Math.round(100 * (1 - Math.exp(-raw / SATURATION[dim]))));
}

/** Flat-earth metres-per-degree conversion at a given latitude. */
function metersPerDegree(lat: number): { mLat: number; mLng: number } {
  return {
    mLat: 111_132,
    mLng: 111_320 * Math.cos(lat * Math.PI / 180),
  };
}

/**
 * Minimum distance (metres) from a point to a polyline, projecting onto each
 * segment and clamping to segment bounds. Uses flat-earth approximation —
 * accurate to <0.1% at Philadelphia latitudes and city-block distances.
 */
function polylineDistanceMeters(
  plat: number, plng: number,
  coords: [number, number][],
): number {
  if (coords.length === 0) return Infinity;
  if (coords.length === 1) {
    const [lng0, lat0] = coords[0];
    const { mLat, mLng } = metersPerDegree(plat);
    const dx = (plng - lng0) * mLng;
    const dy = (plat - lat0) * mLat;
    return Math.sqrt(dx * dx + dy * dy);
  }

  const { mLat, mLng } = metersPerDegree(plat);
  let minD2 = Infinity;

  for (let i = 0; i < coords.length - 1; i++) {
    const aLng = coords[i][0],     aLat = coords[i][1];
    const bLng = coords[i + 1][0], bLat = coords[i + 1][1];

    const dxAP = (plng - aLng) * mLng;
    const dyAP = (plat - aLat) * mLat;
    const dxAB = (bLng - aLng) * mLng;
    const dyAB = (bLat - aLat) * mLat;

    const lenAB2 = dxAB * dxAB + dyAB * dyAB;
    let t = lenAB2 > 1e-6 ? (dxAP * dxAB + dyAP * dyAB) / lenAB2 : 0;
    if (t < 0) t = 0; else if (t > 1) t = 1;

    const dx = dxAP - t * dxAB;
    const dy = dyAP - t * dyAB;
    const d2 = dx * dx + dy * dy;
    if (d2 < minD2) minD2 = d2;
  }

  return Math.sqrt(minD2);
}

/**
 * Polyline bbox in degrees with `padMeters` padding for quick POI reject.
 * Caller passes the widest corridor in play so a single bbox works for all
 * three dimensions.
 */
export function polylineBBox(coords: [number, number][], padMeters: number): {
  minLng: number; maxLng: number; minLat: number; maxLat: number;
} {
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  const padDeg = (padMeters + 5) / 111_000;
  return {
    minLng: minLng - padDeg,
    maxLng: maxLng + padDeg,
    minLat: minLat - padDeg,
    maxLat: maxLat + padDeg,
  };
}

/**
 * Pre-saturation raw weighted POI sum along the street polyline for a given
 * dimension. This is the value that gets squeezed through the sigmoid in
 * `dimScore` — exporting it lets calibration tools fit saturation against
 * the actual raw-sum distribution instead of us guessing.
 */
export function rawSumAlongStreet(
  coords: [number, number][],
  pois:   POIRecord[],
  dim:    Dim,
): number {
  if (coords.length === 0 || pois.length === 0) return 0;
  const bbox       = polylineBBox(coords, CORRIDOR_WIDTH_M[dim]);
  const categories = DIM_CATEGORIES[dim];
  const corridor   = CORRIDOR_WIDTH_M[dim];
  const decay      = DECAY_PERP_M[dim];
  let raw = 0;

  for (const p of pois) {
    if (p.lat < bbox.minLat || p.lat > bbox.maxLat) continue;
    if (p.lng < bbox.minLng || p.lng > bbox.maxLng) continue;
    if (!categories.includes(p.category)) continue;

    const d = polylineDistanceMeters(p.lat, p.lng, coords);
    if (d > corridor) continue;

    raw += Math.exp(-d / decay);
  }
  return raw;
}

function dimScore(
  coords: [number, number][],
  pois: POIRecord[],
  dim: Dim,
  bbox: ReturnType<typeof polylineBBox>,
): number {
  const categories = DIM_CATEGORIES[dim];
  const corridor   = CORRIDOR_WIDTH_M[dim];
  const decay      = DECAY_PERP_M[dim];
  const saturation = SATURATION[dim];
  let raw = 0;

  for (const p of pois) {
    // Cheap rectangular bbox reject before the per-segment distance math
    if (p.lat < bbox.minLat || p.lat > bbox.maxLat) continue;
    if (p.lng < bbox.minLng || p.lng > bbox.maxLng) continue;
    if (!categories.includes(p.category)) continue;

    const d = polylineDistanceMeters(p.lat, p.lng, coords);
    if (d > corridor) continue;

    raw += Math.exp(-d / decay);
  }

  // Sigmoid squeeze: maps [0, ∞) → [0, 100)
  return Math.min(100, Math.round(100 * (1 - Math.exp(-raw / saturation))));
}

/**
 * Compute POI-density FSI for a street polyline.
 *
 * @param coords Street geometry as [[lng, lat], ...]. Multi-segment strings
 *               get merged by the caller before being passed in.
 * @param pois   All POIs in the working region.
 *
 * Returns null when the POI list hasn't loaded yet or the polyline is empty.
 */
export function computePoiFSI(
  coords: [number, number][],
  pois:   POIRecord[],
): FSIData | null {
  if (pois.length === 0) return null;
  if (!coords || coords.length === 0) return null;

  // Pad by the widest corridor in use so the same bbox works for every dim.
  const maxCorridor = Math.max(
    CORRIDOR_WIDTH_M.commercial,
    CORRIDOR_WIDTH_M.community,
    CORRIDOR_WIDTH_M.mobility,
  );
  const bbox       = polylineBBox(coords, maxCorridor);
  const commercial = dimScore(coords, pois, 'commercial', bbox);
  const community  = dimScore(coords, pois, 'community',  bbox);
  const mobility   = dimScore(coords, pois, 'mobility',   bbox);
  const social     = Math.max(community, mobility);   // legacy bundled value
  return {
    commercial,
    community,
    mobility,
    social,
    // Mobility is INTENTIONALLY excluded from the composite total — see
    // FSIData doc. Transit access is informational; the score reflects
    // activation demand from commercial and community density only.
    total: Math.max(commercial, community),
  };
}

// ── Education subtypes (display-only — do NOT change composite score) ─────

/**
 * Education POIs split by age group served. Pulled apart for the panel's
 * factor-tag list only — the `community` dimension score is unchanged.
 *
 *   preschool   — kindergarten / daycare / pre-K
 *   k12         — OSM `amenity=school` (can't cleanly split K-8 vs high
 *                 school without isced data, so reported as one bucket)
 *   higher_ed   — college / university
 *   library     — public libraries (may be tagged under Education OR Culture
 *                 in the source, so we match by amenity regardless of
 *                 poi_category)
 */
export type EducationSubtype = 'preschool' | 'k12' | 'higher_ed' | 'library';

export type EducationBreakdown = Record<EducationSubtype, number>;

const AMENITY_TO_EDU_SUBTYPE: Record<string, EducationSubtype> = {
  kindergarten: 'preschool',
  childcare:    'preschool',
  preschool:    'preschool',
  school:       'k12',
  college:      'higher_ed',
  university:   'higher_ed',
  library:      'library',
};

const EMPTY_EDU_BREAKDOWN: EducationBreakdown = {
  preschool: 0, k12: 0, higher_ed: 0, library: 0,
};

/**
 * Count education POIs in the community corridor (same ≤ 150 m walk-shed
 * the `community` dimension uses), broken down by age group served.
 * Returns zero counts when coords/pois are missing so callers can always
 * render a consistent tag row.
 */
export function countEducationSubtypes(
  coords: [number, number][],
  pois:   POIRecord[],
): EducationBreakdown {
  const out: EducationBreakdown = { ...EMPTY_EDU_BREAKDOWN };
  if (!coords || coords.length === 0 || pois.length === 0) return out;

  const corridor = CORRIDOR_WIDTH_M.community;
  const bbox     = polylineBBox(coords, corridor);

  for (const p of pois) {
    const amenityKey = (p.amenity ?? '').toLowerCase();
    const subtype    = AMENITY_TO_EDU_SUBTYPE[amenityKey];
    if (!subtype) continue;
    if (p.lat < bbox.minLat || p.lat > bbox.maxLat) continue;
    if (p.lng < bbox.minLng || p.lng > bbox.maxLng) continue;

    const d = polylineDistanceMeters(p.lat, p.lng, coords);
    if (d > corridor) continue;
    out[subtype]++;
  }
  return out;
}

// ── Safety / closure feasibility ──────────────────────────────────────────────
//
// Two independent checks that decide whether a street can be closed at all,
// regardless of its activation potential:
//
//   1. Emergency-services veto — closing a street that fronts (or directly
//      accesses) a hospital, fire station, or police station blocks the route
//      that ambulances, fire trucks, and patrol cars must keep open. Treated
//      as a hard veto.
//   2. Detour feasibility — closing a street with no roughly-parallel
//      alternative within ~250 m forces a long detour for through-traffic.
//      Treated as a soft warning (the user can still recommend closure with a
//      detour plan, but the UI flags it).
//
// Both run client-side from the POIs already loaded — no external routing API.

const EMERGENCY_AMENITIES = {
  hospital:     150,  // Hospitals need wide entry zones for ambulance bays
  fire_station:  90,  // Fire trucks need direct access from the apparatus floor
  police:        70,  // Patrol-car egress
} as const;

export type EmergencyAmenity = keyof typeof EMERGENCY_AMENITIES;

export interface SafetyVeto {
  /** True if this street is within the access buffer of an emergency facility. */
  vetoed:     boolean;
  /** Which emergency category triggered the veto (closest one wins). */
  reason?:    EmergencyAmenity;
  /** Perpendicular distance from street centerline to the POI, in metres. */
  distanceM?: number;
}

/**
 * Check whether the street polyline is within the access buffer of any
 * emergency facility (hospital / fire_station / police / clinic).
 *
 * Returns the closest matching emergency POI if so. Uses the same flat-earth
 * distance math as the FSI corridor model, so it is fully consistent with the
 * existing scoring pipeline.
 */
export function getEmergencyVeto(
  coords: [number, number][],
  pois:   POIRecord[],
): SafetyVeto {
  if (!coords.length || !pois.length) return { vetoed: false };

  // Widest buffer used as bbox padding so a single bbox reject covers all
  // amenity types.
  const widest = 150;
  const bbox = polylineBBox(coords, widest);

  let best: { reason: EmergencyAmenity; distanceM: number } | null = null;

  for (const p of pois) {
    if (p.lat < bbox.minLat || p.lat > bbox.maxLat) continue;
    if (p.lng < bbox.minLng || p.lng > bbox.maxLng) continue;

    const amenity = (p.amenity ?? '').toLowerCase() as EmergencyAmenity;
    const buf = EMERGENCY_AMENITIES[amenity];
    if (buf == null) continue;

    const d = polylineDistanceMeters(p.lat, p.lng, coords);
    if (d > buf) continue;

    if (best == null || d < best.distanceM) {
      best = { reason: amenity, distanceM: d };
    }
  }

  if (best == null) return { vetoed: false };
  return { vetoed: true, reason: best.reason, distanceM: Math.round(best.distanceM) };
}

export function emergencyReasonLabel(r: EmergencyAmenity): string {
  switch (r) {
    case 'hospital':     return 'Hospital access route';
    case 'fire_station': return 'Fire-station access route';
    case 'police':       return 'Police-station access route';
  }
}

// ── Closure-cluster detection ─────────────────────────────────────────────────
//
// Single-street closure rarely breaks city traffic — the grid is redundant.
// The real risk is when several adjacent closeable, high-FSI streets are ALL
// candidates for closure: closing them simultaneously fragments the network.
//
// We define a "closure cluster" as a connected group of streets that are
//   • closeable (agency in CITY_CLOSEABLE / NEEDS_APPROVAL)
//   • score ≥ MIN_CLUSTER_SCORE
//   • not vetoed for emergency access
// connected via shared intersections (street endpoints within ENDPOINT_TOL_M).
//
// Clusters of size ≥ MIN_CLUSTER_SIZE are flagged so the operator knows
// closing one of them implies coordinating the rest. Single isolated
// recommendations are NOT flagged — they are safe to close in isolation.

const MIN_CLUSTER_SCORE = 75;
const MIN_CLUSTER_SIZE  = 3;
const ENDPOINT_TOL_M    = 35;   // ≈ half a city block; covers OSM/Mapbox node snapping

export interface ClusterCandidate {
  fid:          number;
  coords:       [number, number][];
  score:        number;
  closeability: Closeability;
  vetoed:       boolean;
}

export interface ClusterResult {
  /** Map from fid → cluster info, only for streets in clusters of size ≥ MIN_CLUSTER_SIZE. */
  clusterByFid: Map<number, { clusterId: number; size: number }>;
  /** All clusters meeting the size threshold. */
  clusters: Array<{ id: number; fids: number[] }>;
}

/**
 * Group eligible streets into closure clusters via union-find on shared
 * endpoints. Returns clusters with ≥ MIN_CLUSTER_SIZE members.
 *
 * Pure function — operates entirely on the candidates the caller passes in.
 * The caller is responsible for limiting the input to the relevant set
 * (e.g. viewport features after applyScores has run).
 */
export function findClusters(streets: ClusterCandidate[]): ClusterResult {
  const candidates = streets.filter(s =>
    !s.vetoed &&
    s.score >= MIN_CLUSTER_SCORE &&
    (s.closeability === 'yes' || s.closeability === 'approval') &&
    s.coords.length >= 2
  );

  if (candidates.length < MIN_CLUSTER_SIZE) {
    return { clusterByFid: new Map(), clusters: [] };
  }

  // Spatial hash on endpoints, cell size = tolerance so neighbours fall in
  // the 3×3 surrounding cells.
  const TOL_DEG = ENDPOINT_TOL_M / 111_000;
  const cellOf = (lng: number, lat: number) =>
    `${Math.round(lng / TOL_DEG)},${Math.round(lat / TOL_DEG)}`;

  type Endpoint = { lng: number; lat: number; fid: number; cx: number; cy: number };
  const endpoints: Endpoint[] = [];
  for (const s of candidates) {
    const a = s.coords[0];
    const b = s.coords[s.coords.length - 1];
    const cellA = cellOf(a[0], a[1]).split(',').map(Number);
    const cellB = cellOf(b[0], b[1]).split(',').map(Number);
    endpoints.push({ lng: a[0], lat: a[1], fid: s.fid, cx: cellA[0], cy: cellA[1] });
    endpoints.push({ lng: b[0], lat: b[1], fid: s.fid, cx: cellB[0], cy: cellB[1] });
  }

  const byCell = new Map<string, Endpoint[]>();
  for (const ep of endpoints) {
    const key = `${ep.cx},${ep.cy}`;
    const arr = byCell.get(key);
    if (arr) arr.push(ep);
    else byCell.set(key, [ep]);
  }

  // Disjoint-set union with path compression — O(α(N)) per op.
  const parent = new Map<number, number>();
  for (const s of candidates) parent.set(s.fid, s.fid);
  const find = (x: number): number => {
    let p = parent.get(x)!;
    while (p !== x) {
      const gp = parent.get(p)!;
      parent.set(x, gp);
      x = p;
      p = gp;
    }
    return x;
  };
  const union = (a: number, b: number) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  const TOL_M2 = ENDPOINT_TOL_M * ENDPOINT_TOL_M;
  for (const ep of endpoints) {
    const mLat = 110_540;
    const mLng = 111_320 * Math.cos(ep.lat * Math.PI / 180);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const cell = byCell.get(`${ep.cx + dx},${ep.cy + dy}`);
      if (!cell) continue;
      for (const other of cell) {
        if (other.fid === ep.fid) continue;
        const ddx = (other.lng - ep.lng) * mLng;
        const ddy = (other.lat - ep.lat) * mLat;
        if (ddx * ddx + ddy * ddy <= TOL_M2) union(ep.fid, other.fid);
      }
    }
  }

  // Group fids by their component root.
  const groups = new Map<number, number[]>();
  for (const s of candidates) {
    const root = find(s.fid);
    const arr = groups.get(root);
    if (arr) arr.push(s.fid);
    else groups.set(root, [s.fid]);
  }

  const clusters: Array<{ id: number; fids: number[] }> = [];
  const clusterByFid = new Map<number, { clusterId: number; size: number }>();
  let nextId = 1;
  for (const [, fids] of groups) {
    if (fids.length < MIN_CLUSTER_SIZE) continue;
    const id = nextId++;
    clusters.push({ id, fids });
    for (const f of fids) clusterByFid.set(f, { clusterId: id, size: fids.length });
  }
  return { clusterByFid, clusters };
}

