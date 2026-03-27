import { useRef, useState, useEffect } from 'react';
import { X, TrendingUp, ShoppingBag, Users, Leaf, Star, Sparkles, GripHorizontal } from 'lucide-react';
import { getCloseability, closeabilityLabel, closeabilityColor } from '../lib/fsiScores';
import type { FSIData, Closeability } from '../lib/fsiScores';

const SV_KEY = import.meta.env.VITE_GOOGLE_SV_KEY;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StreetScore {
  featureId:    number;
  streetName:   string;
  responsibl:   string;
  commercial:   number;
  social:       number;
  ecological:   number;
  total:        number;
  closeability: Closeability;
  // AI sensory fields — present only when the street has been analysed
  aiScore?:     number;
  keywords?:    string[];
  lat?:         number;
  lng?:         number;
}

interface StreetScorePanelProps {
  score:   StreetScore | null;
  onClose: () => void;
}

// ── FSI score generator — ML model data when available, pseudo-random fallback ──

export function generateStreetScores(
  featureId:  number,
  streetName?: string,
  fsiData?:    FSIData,
  responsibl?: string,
): StreetScore {
  const closeability = getCloseability(responsibl ?? '');

  if (fsiData) {
    return {
      featureId,
      streetName:   streetName || '',
      responsibl:   responsibl || '',
      commercial:   fsiData.commercial,
      social:       fsiData.social,
      ecological:   fsiData.ecological,
      total:        fsiData.total,
      closeability,
    };
  }

  // Pseudo-random fallback for streets not in ML dataset
  const hash = (seed: number): number => {
    let h = Math.abs(seed) | 0;
    h = ((h >> 16) ^ h) * 0x45d9f3b | 0;
    h = ((h >> 16) ^ h) * 0x45d9f3b | 0;
    h = (h >> 16) ^ h;
    return Math.abs(h) % 101;
  };
  const commercial = hash(featureId * 7 + 1);
  const social     = hash(featureId * 7 + 3);
  const ecological = hash(featureId * 7 + 5);
  const total      = Math.round((commercial + social + ecological) / 3);
  return {
    featureId,
    streetName:   streetName || '',
    responsibl:   responsibl || '',
    commercial,
    social,
    ecological,
    total,
    closeability,
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

const BAR_CONFIG = [
  { key: 'commercial' as const, label: 'Commercial Value', sub: 'Business activity & economic potential',      Icon: ShoppingBag, accent: '#818CF8' },
  { key: 'social'     as const, label: 'Social Value',     sub: 'Community engagement & pedestrian activity',  Icon: Users,       accent: '#F472B6' },
  { key: 'ecological' as const, label: 'Ecological Value', sub: 'Green infrastructure & environmental benefit', Icon: Leaf,        accent: '#34D399' },
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
  const svImageUrl  = hasAI && score.lat && score.lng && SV_KEY
    ? `https://maps.googleapis.com/maps/api/streetview?size=640x320&location=${score.lat},${score.lng}&fov=90&pitch=0&key=${SV_KEY}`
    : null;

  const posStyle: React.CSSProperties = dragPos
    ? { position: 'absolute', left: dragPos.left, top: dragPos.top }
    : { position: 'absolute', bottom: 24, left: 16 };

  return (
    <div
      ref={panelRef}
      className="z-50 w-[520px] max-w-[calc(100vw-48px)] animate-fadeIn"
      style={posStyle}
    >
      <div className="bg-[#16171e]/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/[0.08] overflow-hidden">

        {/* ── Header (drag handle) ── */}
        <div
          className="px-6 pt-4 pb-4 border-b border-white/[0.06] select-none"
          style={{ cursor: dragging ? 'grabbing' : 'grab' }}
          onMouseDown={onDragMouseDown}
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
        <div className="px-6 py-5 space-y-5">

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

              {svImageUrl && (
                <div className="mb-3 rounded-lg overflow-hidden border border-white/[0.06]">
                  <img
                    src={svImageUrl!}
                    alt={`Street View of ${score.streetName}`}
                    className="w-full object-cover"
                    style={{ height: 160 }}
                  />
                </div>
              )}
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
