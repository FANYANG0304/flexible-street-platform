/**
 * FSI (Flexibility Score Index) — XGBoost ML model scores.
 *
 * Trained on CompleteStreets.geojson:
 *   Positive (label=1): Playstreets locations (community activation)
 *   Negative (label=0): Snow Emergency Routes + Arterial roads (should stay open)
 *
 * 4 models, one per anchor context:
 *   school   → community / social activation potential
 *   hospital → health & accessibility
 *   landmark → cultural / commercial activation potential
 *   historic → heritage / cultural activation potential
 *
 * Mapped to display dimensions:
 *   commercial = (landmark + historic) / 2
 *   social     = school
 *   ecological = hospital
 *   total      = (commercial + social + ecological) / 3
 */

export interface FSIData {
  commercial: number;
  social:     number;
  ecological: number;
  total:      number;
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

/**
 * Composite FSI total score:
 *
 *   1. Closeability gate — cannot close → 0
 *   2. Weighted blend:
 *        hasAI  →  mlTotal × 0.60 + aiScore × 0.40
 *        no AI  →  mlTotal (unweighted)
 *   3. Approval penalty — needs agency sign-off → × 0.75
 *
 * Sub-scores (commercial / social / ecological) are unchanged.
 */
export function computeCompositeTotal(
  mlTotal:      number,
  aiScore:      number | undefined,
  closeability: Closeability,
): number {
  if (closeability === 'no') return 0;

  const raw = (aiScore != null)
    ? mlTotal * 0.6 + aiScore * 0.4
    : mlTotal;

  const penalised = (closeability === 'approval') ? raw * 0.75 : raw;
  return Math.min(100, Math.max(0, Math.round(penalised)));
}

/**
 * Load /fsi_scores.csv and build a name-indexed lookup.
 * Multiple segments with the same STNAME are averaged.
 */
export async function loadFSIScores(): Promise<Map<string, FSIData>> {
  const byName = new Map<string, FSIData>();
  try {
    const resp = await fetch(`${import.meta.env.BASE_URL}fsi_scores.csv`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text  = await resp.text();
    const lines = text.trim().split('\n');

    // Accumulate multiple segments per name, then average
    const acc = new Map<string, { c: number; s: number; e: number; t: number; n: number }>();

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      if (cols.length < 6) continue;
      const name     = cols[1].trim().toUpperCase();
      const school   = parseFloat(cols[2]) || 0;
      const hospital = parseFloat(cols[3]) || 0;
      const landmark = parseFloat(cols[4]) || 0;
      const historic = parseFloat(cols[5]) || 0;

      const c = (landmark + historic) / 2;
      const s = school;
      const e = hospital;
      const t = (c + s + e) / 3;

      const prev = acc.get(name);
      if (prev) { prev.c += c; prev.s += s; prev.e += e; prev.t += t; prev.n++; }
      else        acc.set(name, { c, s, e, t, n: 1 });
    }

    for (const [name, { c, s, e, t, n }] of acc) {
      byName.set(name, {
        commercial: Math.round(c / n),
        social:     Math.round(s / n),
        ecological: Math.round(e / n),
        total:      Math.round(t / n),
      });
    }

    console.log(`✅ Loaded FSI ML scores for ${byName.size} unique street names`);
  } catch (err) {
    console.warn('loadFSIScores error:', err);
  }
  return byName;
}
