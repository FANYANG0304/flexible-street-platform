import { useRef, useState, useEffect } from 'react';
import { X, TrendingUp, ShoppingBag, Users, Star, Sparkles, GripHorizontal, Info } from 'lucide-react';
import { getCloseability, closeabilityLabel, closeabilityColor } from '../lib/fsiScores';
import type { FSIData, Closeability, EducationBreakdown } from '../lib/fsiScores';

const SV_KEY = import.meta.env.VITE_GOOGLE_SV_KEY;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StreetScore {
  featureId:    number;
  streetName:   string;
  responsibl:   string;
  commercial:   number;
  /** Civic institutions sub-score. */
  community:    number;
  /** Transit accessibility sub-score. */
  mobility:     number;
  /** Legacy bundled social = max(community, mobility). */
  social:       number;
  total:        number;
  closeability: Closeability;
  /** Education POIs in the community corridor, split by age group served.
   *  Display-only — does NOT alter the composite or community score. */
  educationBreakdown?: EducationBreakdown;
  // AI sensory fields — present only when the street has been analysed
  aiScore?:     number;
  keywords?:    string[];
  lat?:         number;
  lng?:         number;
  // Live conditions
  trafficLabel?:   string;
  trafficMod?:     number;
  weatherLabel?:   string;
  weatherIcon?:    string;
  weatherMod?:     number;
  // Events & holidays
  eventsMod?:      number;
  eventsLabel?:    string;   // event name if street is near a venue today
  holidayMod?:     number;
  holidayLabel?:   string;   // holiday/festival name if today
  holidayIcon?:    string;
}

interface StreetScorePanelProps {
  score:   StreetScore | null;
  onClose: () => void;
}

// ── FSI score generator — real POI-density data only ──

export function generateStreetScores(
  featureId:  number,
  streetName?: string,
  fsiData?:    FSIData,
  responsibl?: string,
  educationBreakdown?: EducationBreakdown,
): StreetScore {
  const closeability = getCloseability(responsibl ?? '');
  const community    = fsiData?.community ?? 0;
  const mobility     = fsiData?.mobility  ?? 0;
  return {
    featureId,
    streetName:   streetName || '',
    responsibl:   responsibl || '',
    commercial:   fsiData?.commercial ?? 0,
    community,
    mobility,
    social:       Math.max(community, mobility),
    total:        fsiData?.total      ?? 0,
    closeability,
    educationBreakdown,
  };
}

// ── Score utilities (UNCHANGED) ───────────────────────────────────────────────

export function getScoreColor(score: number): string {
  if (score >= 90) return '#10B981';
  if (score >= 75) return '#EAB308';
  if (score >= 50) return '#F97316';
  return '#EF4444';
}

export function getScoreLabel(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Good';
  if (score >= 50) return 'Fair';
  return 'Low';
}

// ── Bar config (UNCHANGED) ────────────────────────────────────────────────────

// Mobility is reported as a factor tag only (see getScoreFactors) — it is
// intentionally NOT a top-level bar, because transit access is informational,
// not part of the composite score.
const BAR_CONFIG = [
  { key: 'commercial' as const, label: 'Commercial Value', sub: 'Food & dining, culture, finance along this block',                  Icon: ShoppingBag, accent: '#818CF8' },
  { key: 'community'  as const, label: 'Community Value',  sub: 'Schools, community centers, healthcare & safety along this block',  Icon: Users,       accent: '#F472B6' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Resolve display name: DB name > props name > Street #ID */
function resolveDisplayName(score: StreetScore): string {
  const n = (score.streetName || '').trim();
  if (n && n.toLowerCase() !== 'unnamed street') return n;
  return `Street #${score.featureId}`;
}

function getAIScoreLabel(s: number): string {
  if (s >= 90) return 'Excellent';
  if (s >= 75) return 'Good';
  if (s >= 50) return 'Fair';
  return 'Low';
}

/** Which of the two SCORING dimensions is driving the total (mobility is
 *  informational and never a driver). */
function getActivationType(score: StreetScore): { label: string; icon: string; color: string } | null {
  const diff = score.commercial - score.community;
  if (diff >=  15) return { label: 'Commercial-led', icon: '🏪', color: '#818CF8' };
  if (diff <= -15) return { label: 'Community-led',  icon: '👥', color: '#F472B6' };
  if (score.total >= 40) return { label: 'Mixed potential', icon: '⚡', color: '#FCD34D' };
  return null;
}

// ── Score explanation ─────────────────────────────────────────────────────────

type FactorImpact = 'positive' | 'neutral' | 'negative' | 'blocking';

interface ScoreFactor {
  icon:    string;
  label:   string;
  impact:  FactorImpact;
  detail:  string;
  /** One-line rationale shown when the tag is clicked. */
  explain: string;
}

function getScoreFactors(score: StreetScore): ScoreFactor[] {
  const factors: ScoreFactor[] = [];

  // 1. Ownership — informational only, does NOT modify the score
  if (score.closeability === 'no') {
    factors.push({
      icon: '🚫', label: 'Closure not permitted', impact: 'blocking', detail: 'Ownership warning · score unchanged',
      explain: 'Managed by a state / federal / private agency (STATE, PRIVATE, AIRPORT, STRICKEN …). The physical activation potential is still computed, but in practice this street cannot be closed for flexible use without a change in jurisdiction. Nothing is subtracted from the score — treat this as a deployment blocker, not a value signal.',
    });
  } else if (score.closeability === 'approval') {
    factors.push({
      icon: '⚠️', label: 'Needs agency approval', impact: 'negative', detail: 'Ownership warning · score unchanged',
      explain: 'SEPTA / DRPA / BCBC / Township streets can be closed, but only with inter-agency sign-off. That is a planning / logistics cost, not an activation-value cost, so the FSI is reported without penalty. Factor the approval overhead into your project timeline separately.',
    });
  } else {
    factors.push({
      icon: '✅', label: 'City-managed street', impact: 'positive', detail: 'Can close directly',
      explain: 'Managed by the Philadelphia municipal government (or FAIRMOUNT PARK / PHA / PIDC / FAM). The city can issue a closure permit without external coordination — the simplest ownership status for activation.',
    });
  }

  // 2. POI dimensions — commercial, community, mobility, sorted strongest first
  const dims = [
    {
      icon: '🏪', label: 'Commercial activity', val: score.commercial,
      explain: 'Methodology: we sum food & dining, culture, and finance POIs that sit within ~35 m perpendicular of this street\'s centerline — essentially the curb of this block. POIs on the next parallel block are outside this radius and excluded from the sum. Score bands follow the legend: 0–49 Low, 50–74 Fair, 75–89 Good, 90+ Excellent.',
    },
    {
      icon: '👥', label: 'Community institutions', val: score.community,
      explain: 'Methodology: schools, community centers, religious buildings, healthcare, and public safety within ~150 m perpendicular of this street — a 1–2 block walk-shed. Wider than Commercial because a civic anchor two blocks over still pulls foot traffic on a Saturday. Score bands follow the legend: 0–49 Low → 90+ Excellent.',
    },
    {
      icon: '🚍', label: 'Mobility', val: score.mobility,
      explain: 'Transit stop accessibility within ~80 m of this block (SEPTA bus / rail / subway). Reported as context only — mobility is intentionally excluded from the composite score. Good transit is a prerequisite for car-free activation, but transit access alone is not a reason to close the street.',
    },
  ].sort((a, b) => b.val - a.val);

  for (const d of dims) {
    factors.push({
      icon:    d.icon,
      label:   d.label,
      // Tag colour must match the legend bands on the left side: 0–49 red,
      // 50–74 orange, 75–89 yellow, 90+ green. "Positive" (green) should only
      // fire in the true Good / Excellent range, otherwise a 66 reads as
      // "excellent" even though the legend calls it Fair.
      impact:  d.val >= 75 ? 'positive' : d.val >= 50 ? 'neutral' : 'negative',
      detail:  `Score ${d.val}`,
      explain: d.explain,
    });
  }

  // 2a. Education subtype breakdown — display-only drill-down into the
  // community corridor. The community score itself is unchanged; this just
  // tells the user WHICH education types are driving it. Tags are omitted
  // when a subtype has zero POIs in the corridor.
  const edu = score.educationBreakdown;
  if (edu) {
    const subs: Array<{ key: keyof EducationBreakdown; icon: string; label: string; explain: string }> = [
      { key: 'preschool',  icon: '🧸', label: 'Pre-K / Daycare',
        explain: 'Kindergartens, pre-schools, and daycare facilities within the 150 m community corridor. Primary pedestrian users are parents with young children — strong signal for weekday-morning playstreet activation.' },
      { key: 'k12',        icon: '🏫', label: 'K-12 Schools',
        explain: 'Elementary, middle, and high schools within the community corridor. K-8 in particular drives parent-child foot traffic — the core demographic for block-level playstreet programmes. (OSM data does not cleanly separate K-8 from high school, so both roll up here.)' },
      { key: 'higher_ed',  icon: '🎓', label: 'Higher Education',
        explain: 'Colleges and universities within the community corridor. Adult / student pedestrians; drives evening + weekend commercial activation more than daytime playstreet demand.' },
      { key: 'library',    icon: '📚', label: 'Libraries',
        explain: 'Public libraries within the community corridor. Cross-generational community anchors — useful for any activation type (children\'s programmes, adult events, civic gatherings).' },
    ];
    for (const s of subs) {
      const n = edu[s.key];
      if (!n) continue;
      factors.push({
        icon:   s.icon,
        label:  s.label,
        impact: 'neutral',
        detail: `${n} within 150 m`,
        explain: s.explain,
      });
    }
  }

  // 3. Traffic
  if (score.trafficMod != null && score.trafficMod < 1.0) {
    factors.push({
      icon: '🚗', label: `${score.trafficLabel ?? 'Traffic'} traffic`,
      impact: score.trafficMod <= 0.40 ? 'blocking'
            : score.trafficMod <= 0.65 ? 'negative'
            : 'neutral',
      detail:  `×${score.trafficMod.toFixed(2)} multiplier`,
      explain: 'Estimated through-traffic at the selected time of day. Heavier flows make temporary closures harder — the multiplier scales the FSI down accordingly.',
    });
  }

  // 4. Weather — only show if penalising
  if (score.weatherMod != null && score.weatherMod < 1.0) {
    factors.push({
      icon: score.weatherIcon ?? '🌧️', label: score.weatherLabel ?? 'Adverse weather',
      impact:  score.weatherMod < 0.70 ? 'negative' : 'neutral',
      detail:  `×${score.weatherMod.toFixed(2)} multiplier`,
      explain: 'Live / forecast weather for the selected date. Rain, cold, snow, and heat reduce outdoor activation appeal — the score is multiplied down proportionally.',
    });
  }

  // 5. Nearby seasonal event boost
  if (score.eventsMod != null && score.eventsMod > 1.0) {
    factors.push({
      icon: '🎟️', label: score.eventsLabel ? `Event: ${score.eventsLabel}` : 'Nearby seasonal event',
      impact:  'positive',
      detail:  `×${score.eventsMod.toFixed(2)} boost`,
      explain: 'A seasonal / festival event is happening nearby (parade, marathon, festival, etc.). Crowds create pedestrian pressure that justifies street activation — routine concerts and games are NOT counted.',
    });
  }

  // 6. Holiday / festival bonus
  if (score.holidayMod != null && score.holidayMod > 1.0) {
    factors.push({
      icon: score.holidayIcon ?? '🎉', label: score.holidayLabel ?? 'Philadelphia holiday',
      impact:  'positive',
      detail:  `×${score.holidayMod.toFixed(2)} city bonus`,
      explain: 'Today is on the Philadelphia seasonal calendar (e.g. Mummers, Penn Relays, Thanksgiving Parade). City-wide activation demand is elevated, so every street gets a proportional bonus.',
    });
  }

  // 7. AI vibe — flag if it meaningfully shifted the POI average (mobility
  // excluded here too, since it isn't part of the composite score).
  if (score.aiScore != null) {
    const poiAvg = Math.round((score.commercial + score.community) / 2);
    const delta  = score.aiScore - poiAvg;
    if (Math.abs(delta) >= 10) {
      factors.push({
        icon: '✨', label: delta > 0 ? 'AI vibe boosted score' : 'AI vibe lowered score',
        impact:  delta > 0 ? 'positive' : 'negative',
        detail:  `AI ${score.aiScore} vs POI avg ${poiAvg}`,
        explain: 'LLaVA vision-language model reading Street View imagery — it scores street character (materials, greenery, activity, disrepair). The vibe can push the final score up or down when it disagrees with the POI-density baseline.',
      });
    }
  }

  return factors;
}

function generateSummary(score: StreetScore): string {
  const poiAvg   = Math.round((score.commercial + score.community) / 2);
  const dims = [
    { key: 'commercial', label: 'commercial activity (restaurants & shops)', driver: 'commercial', val: score.commercial },
    { key: 'community',  label: 'community institutions & healthcare',        driver: 'community',  val: score.community  },
  ].sort((a, b) => b.val - a.val);
  const strongest = dims[0];
  const driver = strongest.driver;

  // Build base sentence from POI density
  let base = '';
  if (poiAvg >= 65)      base = `Strong ${strongest.label} makes this a clear ${driver}-led candidate`;
  else if (poiAvg >= 35) base = `Moderate ${strongest.label} supports ${driver}-focused activation`;
  else                   base = `Limited amenity density along this block — low activation demand`;

  // Collect active penalties (closeability is no longer a score penalty)
  const penalties: string[] = [];
  if (score.trafficMod != null && score.trafficMod <= 0.65)
    penalties.push(`${(score.trafficLabel ?? 'heavy').toLowerCase()} traffic at this time`);
  if (score.weatherMod != null && score.weatherMod < 0.85)
    penalties.push(`${(score.weatherLabel ?? 'adverse weather').toLowerCase()} conditions`);

  // Collect active bonuses
  const bonuses: string[] = [];
  if (score.eventsMod != null && score.eventsMod > 1.0 && score.eventsLabel)
    bonuses.push(`nearby event (${score.eventsLabel})`);
  if (score.holidayMod != null && score.holidayMod > 1.0 && score.holidayLabel)
    bonuses.push(score.holidayLabel);

  let body: string;
  if (penalties.length > 0 && bonuses.length > 0)
    body = `${base}, boosted by ${bonuses.join(' and ')}, but offset by ${penalties.join(' and ')}.`;
  else if (bonuses.length > 0)
    body = `${base}, with today's ${bonuses.join(' and ')} boosting street activation demand.`;
  else if (penalties.length > 0)
    body = `${base}, with ${penalties.join(' and ')} reducing the final score.`;
  else
    body = `${base}.`;

  // Ownership is reported separately — never as a score penalty.
  if (score.closeability === 'no')
    body += ' Heads up: this street cannot actually be closed for flexible use — the score reflects activation potential only, not feasibility.';
  else if (score.closeability === 'approval')
    body += ' Note: closure here requires inter-agency sign-off (not a score penalty, but a planning cost).';

  return body;
}

const IMPACT_STYLE: Record<FactorImpact, { bg: string; border: string; text: string }> = {
  positive: { bg: 'rgba(16,185,129,0.10)',  border: 'rgba(16,185,129,0.22)', text: '#6EE7B7' },
  neutral:  { bg: 'rgba(100,116,139,0.12)', border: 'rgba(100,116,139,0.2)', text: '#94A3B8' },
  negative: { bg: 'rgba(249,115,22,0.10)',  border: 'rgba(249,115,22,0.22)', text: '#FDBA74' },
  blocking: { bg: 'rgba(239,68,68,0.10)',   border: 'rgba(239,68,68,0.22)',  text: '#FCA5A5' },
};

// ── Factor breakdown with click-to-expand explanations ───────────────────────

function FactorBreakdown({ score }: { score: StreetScore }) {
  const factors = getScoreFactors(score);
  const summary = generateSummary(score);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  // Reset the open pill whenever the user clicks a different street
  useEffect(() => { setExpandedIdx(null); }, [score.featureId]);

  return (
    <div className="rounded-xl border" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.07)' }}>
      <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <Info className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Why this score?</span>
        <span className="ml-auto text-[9px] text-gray-600 italic">Tap a tag for detail</span>
      </div>
      <div className="px-4 py-3 space-y-3">
        <p className="text-xs text-gray-400 leading-relaxed">{summary}</p>

        <div className="flex flex-wrap gap-1.5">
          {factors.map((f, i) => {
            const s = IMPACT_STYLE[f.impact];
            const open = expandedIdx === i;
            return (
              <button
                key={i}
                type="button"
                onClick={() => setExpandedIdx(open ? null : i)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all duration-150"
                style={{
                  background: s.bg,
                  border: `1px solid ${open ? s.text : s.border}`,
                  color: s.text,
                  boxShadow: open ? `0 0 0 2px ${s.bg}` : undefined,
                }}
              >
                <span>{f.icon}</span>
                <span>{f.label}</span>
                <span className="opacity-50 text-[10px]">{f.detail}</span>
              </button>
            );
          })}
        </div>

        {/* Explanation row — appears beneath the pills when one is selected */}
        {expandedIdx !== null && factors[expandedIdx] && (() => {
          const f = factors[expandedIdx];
          const s = IMPACT_STYLE[f.impact];
          return (
            <div
              className="mt-1 rounded-lg p-3 animate-fadeIn"
              style={{ background: s.bg, border: `1px solid ${s.border}` }}
            >
              <div className="flex items-start gap-2">
                <span className="text-base leading-none pt-0.5">{f.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-[11px] font-bold" style={{ color: s.text }}>{f.label}</span>
                    <span className="text-[10px] opacity-60" style={{ color: s.text }}>{f.detail}</span>
                  </div>
                  <p className="text-[11px] leading-relaxed" style={{ color: s.text, opacity: 0.88 }}>
                    {f.explain}
                  </p>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export const StreetScorePanel = ({ score, onClose }: StreetScorePanelProps) => {
  const panelRef  = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ mouseX: number; mouseY: number; panelLeft: number; panelTop: number } | null>(null);
  const [dragPos, setDragPos]     = useState<{ left: number; top: number } | null>(null);
  const [dragging, setDragging]   = useState(false);

  // Reset position each time a new street is selected
  useEffect(() => { setDragPos(null); }, [score?.featureId]);

  const onDragMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Allow close button to work without starting a drag
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();

    const rect       = panelRef.current!.getBoundingClientRect();
    const parentRect = panelRef.current!.parentElement!.getBoundingClientRect();
    const initLeft   = rect.left - parentRect.left;
    const initTop    = rect.top  - parentRect.top;
    dragState.current = {
      mouseX: e.clientX, mouseY: e.clientY,
      panelLeft: initLeft, panelTop: initTop,
    };
    setDragPos({ left: initLeft, top: initTop });
    setDragging(true);

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragState.current) return;
      setDragPos({
        left: dragState.current.panelLeft + (ev.clientX - dragState.current.mouseX),
        top:  dragState.current.panelTop  + (ev.clientY - dragState.current.mouseY),
      });
    };
    const onMouseUp = () => {
      dragState.current = null;
      setDragging(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  if (!score) return null;

  const totalColor  = getScoreColor(score.total);
  const recommended = score.total >= 90;
  const displayName = resolveDisplayName(score);

  const hasAI       = typeof score.aiScore === 'number';
  const hasKeywords = hasAI && Array.isArray(score.keywords) && score.keywords.length > 0;
  const aiColor     = hasAI ? getScoreColor(score.aiScore!) : '#6B7280';
  // Street View shown whenever we have coordinates + key — independent of AI analysis
  const svImageUrl  = score.lat && score.lng && SV_KEY
    ? `https://maps.googleapis.com/maps/api/streetview?size=640x320&location=${score.lat},${score.lng}&fov=90&pitch=0&key=${SV_KEY}`
    : null;

  const isMobileScreen = typeof window !== 'undefined' && window.innerWidth < 640;

  const posStyle: React.CSSProperties = dragPos
    ? { position: 'absolute', left: dragPos.left, top: dragPos.top }
    : isMobileScreen
      ? { position: 'absolute', bottom: 0, left: 0, right: 0 }
      : { position: 'absolute', bottom: 24, left: 16 };

  return (
    <div
      ref={panelRef}
      className={`z-50 animate-fadeIn ${isMobileScreen ? 'w-full' : 'w-[520px] max-w-[calc(100vw-48px)]'}`}
      style={posStyle}
    >
      <div className={`bg-[#16171e]/95 backdrop-blur-xl shadow-2xl border border-white/[0.08] overflow-hidden ${isMobileScreen ? 'rounded-t-2xl rounded-b-none' : 'rounded-2xl'}`}>

        {/* ── Header (drag handle — desktop only) ── */}
        <div
          className="px-4 sm:px-6 pt-4 pb-4 border-b border-white/[0.06] select-none"
          style={{ cursor: isMobileScreen ? 'default' : dragging ? 'grabbing' : 'grab' }}
          onMouseDown={isMobileScreen ? undefined : onDragMouseDown}
        >
          {/* Grip indicator */}
          <div className="flex justify-center mb-2 opacity-30">
            <GripHorizontal className="w-4 h-4 text-gray-400" />
          </div>

          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h3 className="text-lg font-extrabold text-gray-100 truncate tracking-wide">
                  {displayName}
                </h3>
                {recommended && (
                  <span
                    className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                    style={{ background: 'rgba(16,185,129,0.15)', color: '#6EE7B7', border: '1px solid rgba(16,185,129,0.25)' }}
                  >
                    <Star className="w-3 h-3" /> RECOMMENDED
                  </span>
                )}
                {(() => {
                  const act = getActivationType(score);
                  if (!act) return null;
                  return (
                    <span
                      className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                      style={{ background: `${act.color}18`, color: act.color, border: `1px solid ${act.color}44` }}
                    >
                      {act.icon} {act.label}
                    </span>
                  );
                })()}
              </div>
              <div className="flex items-center gap-2 flex-wrap mt-0.5">
                {score.responsibl && (
                  <p className="text-xs text-gray-500">
                    Managed by <span className="text-gray-400 font-semibold">{score.responsibl}</span>
                  </p>
                )}
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{
                    background: `${closeabilityColor(score.closeability)}18`,
                    color: closeabilityColor(score.closeability),
                    border: `1px solid ${closeabilityColor(score.closeability)}44`,
                  }}>
                  {closeabilityLabel(score.closeability)}
                </span>
              </div>

              {/* Live conditions row */}
              {(score.trafficLabel || score.weatherLabel || score.eventsLabel || score.holidayLabel) && (
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {score.trafficLabel && (
                    <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full"
                      style={{
                        background: score.trafficMod != null && score.trafficMod <= 0.4
                          ? 'rgba(239,68,68,0.12)' : score.trafficMod != null && score.trafficMod <= 0.65
                          ? 'rgba(249,115,22,0.12)' : 'rgba(71,85,105,0.25)',
                        color: score.trafficMod != null && score.trafficMod <= 0.4
                          ? '#fca5a5' : score.trafficMod != null && score.trafficMod <= 0.65
                          ? '#fdba74' : '#94a3b8',
                        border: '1px solid rgba(255,255,255,0.06)',
                      }}>
                      🚗 {score.trafficLabel} traffic
                    </span>
                  )}
                  {score.weatherLabel && score.weatherLabel !== 'N/A' && (
                    <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full"
                      style={{
                        background: score.weatherMod != null && score.weatherMod < 0.7
                          ? 'rgba(99,102,241,0.12)' : 'rgba(71,85,105,0.25)',
                        color: score.weatherMod != null && score.weatherMod < 0.7
                          ? '#a5b4fc' : '#94a3b8',
                        border: '1px solid rgba(255,255,255,0.06)',
                      }}>
                      {score.weatherIcon} {score.weatherLabel}
                    </span>
                  )}
                  {score.eventsLabel && (
                    <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(251,191,36,0.12)', color: '#fde68a', border: '1px solid rgba(251,191,36,0.2)' }}>
                      🎟️ {score.eventsLabel}
                    </span>
                  )}
                  {score.holidayLabel && (
                    <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(52,211,153,0.12)', color: '#6ee7b7', border: '1px solid rgba(52,211,153,0.2)' }}>
                      {score.holidayIcon ?? '🎉'} {score.holidayLabel}
                    </span>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={onClose}
              className="p-1.5 hover:bg-white/[0.06] rounded-lg transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="px-4 sm:px-6 py-4 sm:py-5 space-y-4 sm:space-y-5 max-h-[60vh] sm:max-h-none overflow-y-auto">

          {/* ── Street View — shown whenever coordinates + key are available ── */}
          {svImageUrl && (
            <div className="rounded-xl overflow-hidden border border-white/[0.06]">
              <img
                src={svImageUrl}
                alt={`Street View of ${score.streetName}`}
                className="w-full object-cover"
                style={{ height: 160 }}
              />
            </div>
          )}

          {/* ── AI Sensory Score (only shown when data exists) ── */}
          {hasAI && (
            <div
              className="rounded-xl p-4 border"
              style={{ background: 'rgba(99,102,241,0.06)', borderColor: 'rgba(99,102,241,0.15)' }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4" style={{ color: '#818CF8' }} />
                <span className="text-xs font-bold text-gray-300 uppercase tracking-widest">AI Street Vibe</span>
                <span className="text-[10px] text-gray-600 ml-auto">llava:7b vision analysis</span>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex flex-col items-center flex-shrink-0">
                  <span className="text-3xl font-extrabold" style={{ color: aiColor }}>
                    {score.aiScore}
                  </span>
                  <span className="text-[10px] font-semibold mt-0.5" style={{ color: aiColor }}>
                    {getAIScoreLabel(score.aiScore!)}
                  </span>
                </div>
                <div className="flex-1">
                  <div className="w-full h-2 rounded-full bg-white/[0.06] overflow-hidden mb-3">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${score.aiScore}%`,
                        background: `linear-gradient(90deg, ${aiColor}80, ${aiColor})`,
                      }}
                    />
                  </div>
                  {hasKeywords && (
                    <div className="flex gap-2 flex-wrap">
                      {score.keywords!.map(kw => (
                        <span
                          key={kw}
                          className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold"
                          style={{
                            background: 'rgba(99,102,241,0.14)',
                            color: '#a5b4fc',
                            border: '1px solid rgba(99,102,241,0.25)',
                          }}
                        >
                          {kw}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── FSI Score ── */}
          <div className="flex gap-6">

            {/* Total ring */}
            <div className="flex-shrink-0 flex flex-col items-center justify-center w-28">
              <div className="relative w-24 h-24 flex items-center justify-center">
                <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
                  <circle
                    cx="50" cy="50" r="42" fill="none"
                    stroke={totalColor} strokeWidth="6"
                    strokeDasharray={`${score.total * 2.64} 264`}
                    strokeLinecap="round"
                    style={{
                      transition: 'stroke-dasharray 0.6s ease-out',
                      filter: `drop-shadow(0 0 6px ${totalColor}40)`,
                    }}
                  />
                </svg>
                <span className="text-3xl font-extrabold" style={{ color: totalColor }}>
                  {score.total}
                </span>
              </div>
              <span className="text-xs font-bold mt-2" style={{ color: totalColor }}>
                {getScoreLabel(score.total)}
              </span>
              <span className="text-[10px] text-gray-600 mt-0.5">Composite FSI</span>
            </div>

            {/* Sub-score bars */}
            <div className="flex-1 space-y-3.5">
              {BAR_CONFIG.map(({ key, label, sub, Icon, accent }) => {
                const val      = score[key];
                const valColor = getScoreColor(val);
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <Icon className="w-3.5 h-3.5" style={{ color: accent }} />
                        <span className="text-xs font-semibold text-gray-300">{label}</span>
                      </div>
                      <span className="text-sm font-extrabold" style={{ color: valColor }}>{val}</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-white/[0.06] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500 ease-out"
                        style={{
                          width: `${val}%`,
                          background: `linear-gradient(90deg, ${accent}90, ${accent})`,
                          boxShadow: `0 0 8px ${accent}30`,
                        }}
                      />
                    </div>
                    <p className="text-[10px] text-gray-600 mt-0.5">{sub}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Why this score? — factor pills are click-to-expand ── */}
          <FactorBreakdown score={score} />


          {/* Recommended callout */}
          {recommended && (
            <div
              className="px-4 py-3 rounded-xl border"
              style={{ background: 'rgba(16,185,129,0.06)', borderColor: 'rgba(16,185,129,0.15)' }}
            >
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <p className="text-xs text-emerald-300/80">
                  <span className="font-bold text-emerald-300">High flexibility potential.</span>{' '}
                  This street segment scores above 80 and is recommended for flexible use activation.
                </p>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
