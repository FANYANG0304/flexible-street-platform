import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { ScenarioConfig, TimeBin } from '../types';
import { Layers, Radio, ChevronDown, GitBranch, MapPin, Flag, BarChart3, Square } from 'lucide-react';
import { STREET_COLORS, STREET_FALLBACK, POI_COLORS, PLAYSTREETS_COLOR, STREET_EVENTS_COLOR, SCORE_COLOR_STOPS } from './MapComponent';
import { getPhillyHoliday } from '../lib/events';

interface SidebarProps {
  scenarios: ScenarioConfig[];
  timeBins: TimeBin[];
  selectedTimeBin: string;
  onScenarioToggle: (scenarioId: string) => void;
  onTimeBinChange: (timeBinId: string) => void;
  onSelectAll?: () => void;
  onDeselectAll?: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  showTraffic?: boolean;
  onTrafficToggle?: (show: boolean) => void;
  showStreetCenterline?: boolean;
  onStreetCenterlineToggle?: (show: boolean) => void;
  showPOI?: boolean;
  onPOIToggle?: (show: boolean) => void;
  showPlaystreets?: boolean;
  onPlaystreetsToggle?: (show: boolean) => void;
  showStreetEvents?: boolean;
  onStreetEventsToggle?: (show: boolean) => void;
  showStreetScore?: boolean;
  onStreetScoreToggle?: (show: boolean) => void;
  showCloseableOnly?: boolean;
  onCloseableOnlyToggle?: (show: boolean) => void;
  showTestBBox?: boolean;
  onTestBBoxToggle?: (show: boolean) => void;
  width: number;
  onWidthChange: (w: number) => void;
  anchorCount?: number;
  selectedDate?: Date;
  onDateChange?: (d: Date) => void;
}

const MIN_W = 320;
const MAX_W = 480;

// ── Portal-based InfoTip (not clipped by overflow:hidden) ─────────────────────
const InfoTip = ({ text }: { text: string }) => {
  const [tipPos, setTipPos] = useState<{ left: number; top: number } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);

  const show = (e: React.MouseEvent) => {
    e.stopPropagation();
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) setTipPos({ left: r.right + 10, top: r.top - 4 });
  };

  return (
    <>
      <span
        ref={triggerRef}
        onClick={(e) => e.stopPropagation()}
        onMouseEnter={show}
        onMouseLeave={() => setTipPos(null)}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full cursor-help ml-1 flex-shrink-0 transition-colors"
        style={{
          border: tipPos ? '1px solid #818CF8' : '1px solid rgba(255,255,255,0.22)',
          color: tipPos ? '#A5B4FC' : 'rgba(255,255,255,0.38)',
          fontSize: '9px', fontWeight: 700,
        }}
      >
        ?
      </span>
      {tipPos && createPortal(
        <div
          style={{
            position: 'fixed',
            left: tipPos.left,
            top: tipPos.top,
            zIndex: 99999,
            width: '230px',
            background: '#1a1b2e',
            border: '1px solid rgba(129,140,248,0.3)',
            borderRadius: '12px',
            padding: '10px 13px',
            fontSize: '11.5px',
            color: '#D1D5DB',
            lineHeight: '1.65',
            boxShadow: '0 12px 40px rgba(0,0,0,0.85)',
            pointerEvents: 'none',
          }}
        >
          {text}
        </div>,
        document.body
      )}
    </>
  );
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function getCurrentTimeBin(): string {
  const h = new Date().getHours();
  if (h >= 6  && h < 12) return 'morning';
  if (h >= 12 && h < 18) return 'afternoon';
  if (h >= 18 && h < 24) return 'evening';
  return 'night';
}

function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(d.getDate() + n);
  return next;
}

function isToday(d: Date): boolean {
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

const DAY_NAMES   = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
const MONTH_NAMES = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

// ── Clock time picker ─────────────────────────────────────────────────────────
const CLOCK_PERIODS = [
  { id: 'night',     startDeg: 0,   endDeg: 90,  activeColor: '#60A5FA', dimColor: '#172554', label: 'Night',     hours: '0 – 6',   abbr: 'NGT' },
  { id: 'morning',   startDeg: 90,  endDeg: 180, activeColor: '#FCD34D', dimColor: '#451a03', label: 'Morning',   hours: '6 – 12',  abbr: 'AM'  },
  { id: 'afternoon', startDeg: 180, endDeg: 270, activeColor: '#FB923C', dimColor: '#431407', label: 'Afternoon', hours: '12 – 18', abbr: 'PM'  },
  { id: 'evening',   startDeg: 270, endDeg: 360, activeColor: '#C084FC', dimColor: '#2e1065', label: 'Evening',   hours: '18 – 24', abbr: 'EVE' },
];

function ClockTimePicker({
  selected, onChange, selectedDate = new Date(), onDateChange,
}: {
  selected: string; onChange: (id: string) => void;
  selectedDate?: Date; onDateChange?: (d: Date) => void;
}) {
  const cx = 82, cy = 82, outerR = 66, innerR = 40;
  const dateInputRef = useRef<HTMLInputElement>(null);
  const dateValue = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;

  function toXY(r: number, angleDeg: number) {
    const rad = (angleDeg - 90) * Math.PI / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function sectorPath(startDeg: number, endDeg: number, gap = 2.5): string {
    const s = startDeg + gap, e = endDeg - gap;
    const sp = toXY(outerR, s), ep = toXY(outerR, e);
    const si = toXY(innerR, e), ei = toXY(innerR, s);
    return `M ${sp.x.toFixed(2)} ${sp.y.toFixed(2)} A ${outerR} ${outerR} 0 0 1 ${ep.x.toFixed(2)} ${ep.y.toFixed(2)} L ${si.x.toFixed(2)} ${si.y.toFixed(2)} A ${innerR} ${innerR} 0 0 0 ${ei.x.toFixed(2)} ${ei.y.toFixed(2)} Z`;
  }

  // Live clock hand always shows real current time
  const now = new Date();
  const hourFrac   = now.getHours() + now.getMinutes() / 60;
  const handAngle  = (hourFrac / 24) * 360;
  const handTip    = toXY(34, handAngle);
  const handBase   = toXY(8,  handAngle + 180);

  const activePeriod = CLOCK_PERIODS.find(p => p.id === selected) ?? CLOCK_PERIODS[0];
  const holiday      = getPhillyHoliday(selectedDate);
  const simDate      = isToday(selectedDate) ? null : selectedDate;

  // Date string based on selectedDate
  const dateStr = `${DAY_NAMES[selectedDate.getDay()]}  ·  ${MONTH_NAMES[selectedDate.getMonth()]} ${selectedDate.getDate()}, ${selectedDate.getFullYear()}`;

  // Outer bezel tick marks (every hour = 24 ticks)
  const ticks = Array.from({ length: 24 }, (_, i) => {
    const angle   = (i / 24) * 360;
    const isMajor = i % 6 === 0;
    const inner   = toXY(outerR + 3, angle);
    const outer   = toXY(outerR + (isMajor ? 10 : 6), angle);
    return { inner, outer, isMajor };
  });

  // Hour labels at major quadrant ticks (outside the ticks)
  const HOUR_LABELS = [
    { hour: '0',  pos: toXY(outerR + 18, 0),   ta: 'middle', db: 'auto'    },
    { hour: '6',  pos: toXY(outerR + 18, 90),  ta: 'start',  db: 'middle'  },
    { hour: '12', pos: toXY(outerR + 18, 180), ta: 'middle', db: 'hanging' },
    { hour: '18', pos: toXY(outerR + 18, 270), ta: 'end',    db: 'middle'  },
  ];

  const isNow = selected === getCurrentTimeBin();

  return (
    <div className="flex flex-col items-center pb-3 pt-1">

      {/* Retro date display with navigation */}
      <div className="w-full px-4 pb-3 text-center">
        <div className="flex items-center justify-center gap-1">
          <button
            onClick={() => onDateChange?.(addDays(selectedDate, -1))}
            className="w-6 h-6 rounded flex items-center justify-center text-gray-500 hover:text-gray-200 hover:bg-white/[0.06] transition-colors text-xs font-bold"
            title="Previous day"
          >‹</button>
          <p
            className="flex-1 text-[10px] font-mono font-bold tracking-[0.18em] uppercase cursor-pointer hover:opacity-70 transition-opacity relative"
            style={{ color: simDate ? '#FCD34D' : 'rgba(165,180,252,0.6)' }}
            title="Click to pick a date"
            onClick={() => dateInputRef.current?.showPicker?.() ?? dateInputRef.current?.click()}
          >
            {dateStr}
            <input
              ref={dateInputRef}
              type="date"
              value={dateValue}
              onChange={(e) => { if (e.target.value) onDateChange?.(new Date(e.target.value + 'T12:00:00')); }}
              style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0, top: 0, left: 0 }}
              tabIndex={-1}
            />
          </p>
          <button
            onClick={() => onDateChange?.(addDays(selectedDate, +1))}
            className="w-6 h-6 rounded flex items-center justify-center text-gray-500 hover:text-gray-200 hover:bg-white/[0.06] transition-colors text-xs font-bold"
            title="Next day"
          >›</button>
        </div>
        {simDate && (
          <button
            onClick={() => onDateChange?.(new Date())}
            className="mt-1 text-[9px] font-semibold transition-colors hover:text-indigo-300"
            style={{ color: 'rgba(165,180,252,0.55)' }}
          >
            ↩ Back to today
          </button>
        )}
        {holiday && (
          <div className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full"
            style={{ background: 'rgba(252,211,77,0.1)', border: '1px solid rgba(252,211,77,0.25)' }}>
            <span style={{ fontSize: '11px' }}>{holiday.icon}</span>
            <span className="text-[10px] font-semibold" style={{ color: '#FCD34D' }}>{holiday.name}</span>
            <span className="text-[9px] font-mono ml-0.5" style={{ color: '#92703a' }}>×{holiday.modifier.toFixed(2)}</span>
          </div>
        )}
      </div>

      {/* SVG clock */}
      <svg width="164" height="164" viewBox="0 0 164 164" style={{ overflow: 'visible' }}>
        {/* Active sector glow (blurred, behind everything) */}
        {CLOCK_PERIODS.filter(p => p.id === selected).map(p => (
          <path key="glow" d={sectorPath(p.startDeg, p.endDeg, -2)} fill={p.activeColor} opacity={0.12}
            style={{ filter: 'blur(8px)' }} />
        ))}

        {/* Sector arcs */}
        {CLOCK_PERIODS.map(p => {
          const isActive = selected === p.id;
          const midDeg = (p.startDeg + p.endDeg) / 2;
          const labelPos = toXY((outerR + innerR) / 2, midDeg);
          return (
            <g key={p.id} onClick={() => onChange(p.id)} style={{ cursor: 'pointer' }}>
              <path
                d={sectorPath(p.startDeg, p.endDeg)}
                fill={isActive ? p.activeColor : p.dimColor}
                opacity={isActive ? 1 : 0.7}
                style={{ transition: 'all 0.25s ease' }}
              />
              {isActive && (
                <path d={sectorPath(p.startDeg, p.endDeg)} fill="none"
                  stroke={p.activeColor} strokeWidth="1.5" opacity={0.5} />
              )}
              {/* Abbreviated label inside arc — stroke gives contrast on any bg */}
              <text x={labelPos.x} y={labelPos.y} textAnchor="middle" dominantBaseline="middle"
                fontSize="8.5" fontWeight="800" fontFamily="monospace" letterSpacing="0.8"
                fill={isActive ? '#000000' : 'rgba(255,255,255,0.75)'}
                stroke={isActive ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.9)'}
                strokeWidth={isActive ? '0.5' : '2.5'}
                paintOrder="stroke"
                style={{ pointerEvents: 'none', userSelect: 'none' }}>
                {p.abbr}
              </text>
            </g>
          );
        })}

        {/* Outer bezel ticks */}
        {ticks.map((t, i) => (
          <line key={i}
            x1={t.inner.x} y1={t.inner.y} x2={t.outer.x} y2={t.outer.y}
            stroke={t.isMajor ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.15)'}
            strokeWidth={t.isMajor ? 1.5 : 0.75} strokeLinecap="round" />
        ))}

        {/* Hour number labels */}
        {HOUR_LABELS.map(m => (
          <text key={m.hour} x={m.pos.x} y={m.pos.y} textAnchor={m.ta as any}
            dominantBaseline={m.db as any} fontSize="9" fontFamily="monospace" fontWeight="700"
            fill="rgba(255,255,255,0.45)">
            {m.hour}
          </text>
        ))}

        {/* Center fill */}
        <circle cx={cx} cy={cy} r={innerR - 1.5} fill="#0c0d14" />
        <circle cx={cx} cy={cy} r={innerR - 1.5} fill="none"
          stroke={activePeriod.activeColor} strokeWidth="1" opacity={0.3} />

        {/* Center inner glow */}
        <circle cx={cx} cy={cy} r={innerR - 6} fill={activePeriod.activeColor} opacity={0.06} />

        {/* Clock hand */}
        <line x1={handBase.x} y1={handBase.y} x2={handTip.x} y2={handTip.y}
          stroke="rgba(255,255,255,0.85)" strokeWidth="2" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="3.5" fill={activePeriod.activeColor} opacity={0.9} />
        <circle cx={cx} cy={cy} r="1.5" fill="white" opacity={0.9} />
      </svg>

      {/* Active period label + reset */}
      <div className="flex items-center gap-3 mt-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: activePeriod.activeColor, boxShadow: `0 0 6px ${activePeriod.activeColor}` }} />
          <span className="text-sm font-bold" style={{ color: activePeriod.activeColor }}>{activePeriod.label}</span>
          <span className="text-xs font-mono" style={{ color: 'rgba(255,255,255,0.3)' }}>{activePeriod.hours}h</span>
        </div>
        {!isNow && (
          <button
            onClick={() => onChange(getCurrentTimeBin())}
            className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold transition-all hover:opacity-100"
            style={{ background: 'rgba(99,102,241,0.15)', color: '#A5B4FC', border: '1px solid rgba(99,102,241,0.25)', opacity: 0.85 }}
            title="Reset to current time"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
            </svg>
            Now
          </button>
        )}
      </div>

      {/* Period selector dots */}
      <div className="flex items-center gap-4 mt-3">
        {CLOCK_PERIODS.map(p => (
          <button
            key={p.id}
            onClick={() => onChange(p.id)}
            title={`${p.label} (${p.hours}:00)`}
            className="w-2 h-2 rounded-full transition-all duration-200"
            style={{
              background: selected === p.id ? p.activeColor : 'rgba(255,255,255,0.15)',
              boxShadow: selected === p.id ? `0 0 7px ${p.activeColor}` : 'none',
              transform: selected === p.id ? 'scale(1.6)' : 'scale(1)',
            }}
          />
        ))}
      </div>
    </div>
  );
}

export const Sidebar = ({
  scenarios, timeBins, selectedTimeBin, onScenarioToggle, onTimeBinChange,
  onSelectAll, onDeselectAll,
  isCollapsed, showTraffic = false, onTrafficToggle,
  showStreetCenterline = false, onStreetCenterlineToggle,
  showPOI = false, onPOIToggle,
  showPlaystreets = false, onPlaystreetsToggle,
  showStreetEvents = false, onStreetEventsToggle,
  showStreetScore = false, onStreetScoreToggle,
  showCloseableOnly = false, onCloseableOnlyToggle,
  showTestBBox = false, onTestBBoxToggle,
  width, onWidthChange, anchorCount = 0,
  selectedDate, onDateChange,
}: SidebarProps) => {
  const accent = '#6366F1';

  const [overlaysOpen, setOverlaysOpen] = useState(false);
  const [scenariosOpen, setScenariosOpen] = useState(false);
  const [streetLegendOpen, setStreetLegendOpen] = useState(true);
  const [poiLegendOpen, setPoiLegendOpen] = useState(true);

  const allSelected = scenarios.every(s => s.visible);
  const noneSelected = scenarios.every(s => !s.visible);
  const activeCount = scenarios.filter(s => s.visible).length;

  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(width);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    startW.current = width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [width]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      onWidthChange(Math.min(MAX_W, Math.max(MIN_W, startW.current + (e.clientX - startX.current))));
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [onWidthChange]);

  const SectionHeader = ({ icon, label, open, onToggle, badge, tip }: {
    icon: React.ReactNode; label: string; open: boolean; onToggle: () => void; badge?: string; tip?: string;
  }) => (
    <button onClick={onToggle} className="w-full px-6 py-5 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide">{label}</h2>
        {badge && <span className="px-2 py-0.5 text-[10px] font-bold rounded-full" style={{ background: 'rgba(99,102,241,0.15)', color: '#A5B4FC' }}>{badge}</span>}
        {tip && <InfoTip text={tip} />}
      </div>
      <ChevronDown className="w-4 h-4 text-gray-500 transition-transform duration-200" style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }} />
    </button>
  );

  const SubLegend = ({ open, onToggle, count, items, fallbackLabel, fallbackColor }: {
    open: boolean; onToggle: () => void; count: number;
    items: [string, string][]; fallbackLabel?: string; fallbackColor?: string;
  }) => (
    <div className="ml-7 animate-fadeIn">
      <button onClick={onToggle} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors py-1 ml-4">
        <ChevronDown className="w-3 h-3 transition-transform duration-150" style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }} />
        <span>Legend ({count} types)</span>
      </button>
      <div className="overflow-hidden transition-all duration-200" style={{ maxHeight: open ? '600px' : '0px', opacity: open ? 1 : 0 }}>
        <div className="ml-4 mt-1 space-y-1.5 pb-1">
          {items.map(([name, color]) => (
            <div key={name} className="flex items-center gap-2 text-xs text-gray-500">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
              <span className="truncate">{name}</span>
            </div>
          ))}
          {fallbackLabel && (
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: fallbackColor || '#475569' }} />
              <span className="truncate italic">{fallbackLabel}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const validTimeBinIds = new Set(timeBins.map(b => b.id));
  const safeSelected = validTimeBinIds.has(selectedTimeBin) ? selectedTimeBin : timeBins[0]?.id ?? 'morning';

  return (
    <div className="absolute top-0 left-0 h-full transition-all duration-300 z-30" style={{ width: isCollapsed ? 0 : width, overflow: 'hidden' }}>
      <div className="flex h-full p-4" style={{ width }}>
        <div className="flex flex-col h-full flex-1 bg-[#16171e]/90 backdrop-blur-xl rounded-2xl shadow-2xl overflow-hidden border border-white/[0.06]">

          {/* Header */}
          <div className="px-6 py-6 border-b border-white/[0.06]">
            <h1 className="text-xl font-extrabold text-gray-100 mb-1 tracking-wide">Flexible Streets</h1>
            <p className="text-sm text-gray-500">Philadelphia Pilot Project</p>
          </div>

          <div className="flex-1 overflow-y-auto">

            {/* ── 1. Time Period ── */}
            <div className="border-b border-white/[0.06]">
              <div className="px-6 pt-5 pb-1 flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#A5B4FC" strokeWidth="2.5" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
                <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide">Time Period</h2>
                <InfoTip text="Select the time of day for analysis. Traffic congestion and street flexibility scores change by period — the same street can behave very differently at 9 AM vs 9 PM. The live hand on the clock shows the current real time." />
              </div>
              <ClockTimePicker
                selected={safeSelected}
                onChange={onTimeBinChange}
                selectedDate={selectedDate}
                onDateChange={onDateChange}
              />
            </div>

            {/* ── 2. Data Overlays ── */}
            <div className="border-b border-white/[0.06]">
              <SectionHeader
                icon={<Radio className="w-4 h-4" style={{ color: '#A5B4FC' }} />}
                label="Data Overlays"
                open={overlaysOpen}
                onToggle={() => setOverlaysOpen(!overlaysOpen)}
                tip="Toggle map layers to visualize different datasets. Layers are independent — combine Flexibility Score with Points of Interest to see why a street scores the way it does."
              />
              <div className="overflow-hidden transition-all duration-200" style={{ maxHeight: overlaysOpen ? '1400px' : '0px', opacity: overlaysOpen ? 1 : 0 }}>
                <div className="px-6 pb-5 space-y-1">

                  <label className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/[0.05] cursor-pointer transition-all duration-150 group">
                    <input type="checkbox" checked={showStreetScore} onChange={(e) => onStreetScoreToggle?.(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-600 bg-gray-800 focus:ring-offset-0" style={{ accentColor: '#10B981' }} />
                    <div className="flex items-center gap-2 flex-1">
                      <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-sm font-medium text-gray-300 group-hover:text-gray-100 transition-colors">Flexibility Score</span>
                      <InfoTip text="AI + POI-density score (0–100) rating each street's potential for temporary activation. Streets scoring ≥80 glow green and are flagged RECOMMENDED. Click any street to see its full breakdown." />
                    </div>
                  </label>
                  {showStreetScore && (
                    <div className="ml-7 mb-2 animate-fadeIn">
                      <div className="ml-4 mt-1 space-y-2 pb-1">
                        <div className="flex-1 h-2.5 rounded-full overflow-hidden"
                          style={{ background: 'linear-gradient(90deg, #EF4444 0%, #F97316 25%, #EAB308 45%, #22C55E 65%, #10B981 80%, #059669 100%)' }} />
                        <div className="flex justify-between text-[10px] text-gray-600 px-0.5">
                          <span>0</span><span>25</span><span>50</span><span>75</span><span>100</span>
                        </div>
                        <div className="space-y-1 mt-1">
                          {SCORE_COLOR_STOPS.map(({ color, label }) => (
                            <div key={label} className="flex items-center gap-2 text-xs text-gray-500">
                              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: color }} />
                              <span>{label}</span>
                            </div>
                          ))}
                        </div>

                        {/* One-click filter: hide everything that can't actually be closed */}
                        <button
                          onClick={() => onCloseableOnlyToggle?.(!showCloseableOnly)}
                          className="w-full mt-2 px-3 py-2 rounded-lg text-[11px] font-bold tracking-wide transition-all flex items-center justify-between gap-2"
                          style={{
                            background: showCloseableOnly ? 'rgba(16,185,129,0.16)' : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${showCloseableOnly ? 'rgba(16,185,129,0.45)' : 'rgba(255,255,255,0.08)'}`,
                            color: showCloseableOnly ? '#6EE7B7' : '#9ca3af',
                          }}
                          title="Hide STATE / PRIVATE / AIRPORT / etc. — keep only city-managed and approval-required streets."
                        >
                          <span className="flex items-center gap-2">
                            <span className="text-sm leading-none">{showCloseableOnly ? '●' : '○'}</span>
                            <span>Closeable streets only</span>
                          </span>
                          <span className="text-[9px] font-mono opacity-70">CITY · PARK · PHA · SEPTA · DRPA · …</span>
                        </button>

                        <p className="text-[10px] text-gray-600 mt-1 leading-relaxed">
                          Click a street to see Commercial &amp; Social dimension breakdown. Streets ≥80 glow and are recommended for activation.
                        </p>
                      </div>
                    </div>
                  )}

                  <label className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/[0.05] cursor-pointer transition-all duration-150 group">
                    <input type="checkbox" checked={showTraffic} onChange={(e) => onTrafficToggle?.(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-600 bg-gray-800 focus:ring-offset-0" style={{ accentColor: accent }} />
                    <div className="flex items-center gap-2 flex-1">
                      <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-green-400 via-yellow-400 to-red-400" />
                      <span className="text-sm font-medium text-gray-300 group-hover:text-gray-100 transition-colors">Real-time Traffic</span>
                      <InfoTip text="Traffic congestion modeled by road type and time of day. Heavy congestion lowers a street's Flexibility Score — an arterial road at morning rush hour is much harder to temporarily close than a local street at night." />
                    </div>
                  </label>
                  {showTraffic && (
                    <div className="ml-11 mb-2 space-y-1.5 animate-fadeIn">
                      {[['#34D399','Free Flow'],['#FBBF24','Moderate'],['#FB923C','Heavy'],['#EF4444','Severe']].map(([c,t]) => (
                        <div key={t} className="flex items-center gap-2 text-xs text-gray-500">
                          <span className="w-4 h-[3px] rounded-full" style={{ background: c }} /><span>{t}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <label className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/[0.05] cursor-pointer transition-all duration-150 group">
                    <input type="checkbox" checked={showStreetCenterline} onChange={(e) => onStreetCenterlineToggle?.(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-600 bg-gray-800 focus:ring-offset-0" style={{ accentColor: accent }} />
                    <div className="flex items-center gap-2 flex-1">
                      <GitBranch className="w-3.5 h-3.5 text-indigo-400" />
                      <span className="text-sm font-medium text-gray-300 group-hover:text-gray-100 transition-colors">Street Centerline</span>
                      <InfoTip text="Official Philadelphia street network colored by managing agency. City-managed streets (green) are easiest to activate. SEPTA/DRPA streets need inter-agency approval. State highways cannot be closed." />
                    </div>
                  </label>
                  {showStreetCenterline && (
                    <SubLegend open={streetLegendOpen} onToggle={() => setStreetLegendOpen(!streetLegendOpen)}
                      count={STREET_COLORS.length} items={STREET_COLORS} fallbackLabel="Other" fallbackColor={STREET_FALLBACK} />
                  )}

                  <label className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/[0.05] cursor-pointer transition-all duration-150 group">
                    <input type="checkbox" checked={showPOI} onChange={(e) => onPOIToggle?.(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-600 bg-gray-800 focus:ring-offset-0" style={{ accentColor: accent }} />
                    <div className="flex items-center gap-2 flex-1">
                      <MapPin className="w-3.5 h-3.5 text-sky-400" />
                      <span className="text-sm font-medium text-gray-300 group-hover:text-gray-100 transition-colors">Points of Interest</span>
                      <InfoTip text="~2,600 Philadelphia POIs across 9 categories — restaurants, schools, community centers, healthcare, transit, etc. POI density within 400 m of a street is the primary input for its Commercial and Social dimension scores." />
                    </div>
                  </label>
                  {showPOI && (
                    <SubLegend open={poiLegendOpen} onToggle={() => setPoiLegendOpen(!poiLegendOpen)}
                      count={POI_COLORS.length} items={POI_COLORS} />
                  )}

                  <label className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/[0.05] cursor-pointer transition-all duration-150 group">
                    <input type="checkbox" checked={showPlaystreets} onChange={(e) => onPlaystreetsToggle?.(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-600 bg-gray-800 focus:ring-offset-0" style={{ accentColor: accent }} />
                    <div className="flex items-center gap-2 flex-1">
                      <Flag className="w-3.5 h-3.5" style={{ color: PLAYSTREETS_COLOR }} />
                      <span className="text-sm font-medium text-gray-300 group-hover:text-gray-100 transition-colors">Playstreets</span>
                      <InfoTip text="Philadelphia's summer Playstreets program — city blocks closed for children's outdoor play. These are real-world validated activations used to verify the scoring model. High-scoring streets should overlap with Playstreets locations." />
                    </div>
                  </label>
                  {showPlaystreets && (
                    <div className="ml-11 mb-1 animate-fadeIn">
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span className="w-4 h-[3px] rounded-full" style={{ background: PLAYSTREETS_COLOR }} />
                        <span>Summer play streets (matched to road segments)</span>
                      </div>
                    </div>
                  )}

                  <label className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/[0.05] cursor-pointer transition-all duration-150 group">
                    <input type="checkbox" checked={showStreetEvents} onChange={(e) => onStreetEventsToggle?.(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-600 bg-gray-800 focus:ring-offset-0" style={{ accentColor: STREET_EVENTS_COLOR }} />
                    <div className="flex items-center gap-2 flex-1">
                      <Flag className="w-3.5 h-3.5" style={{ color: STREET_EVENTS_COLOR }} />
                      <span className="text-sm font-medium text-gray-300 group-hover:text-gray-100 transition-colors">Open Streets</span>
                      <InfoTip text="Center City 2026 scheduled Open Streets events — temporary road closures for pedestrian and commercial use. Click a highlighted segment to see event name, dates, and the street's score at that time." />
                    </div>
                  </label>
                  {showStreetEvents && (
                    <div className="ml-11 mb-1 animate-fadeIn">
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span className="w-4 h-[3px] rounded-full" style={{ background: STREET_EVENTS_COLOR }} />
                        <span>Center City commercial activations (2026)</span>
                      </div>
                    </div>
                  )}

                  <label className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/[0.05] cursor-pointer transition-all duration-150 group">
                    <input type="checkbox" checked={showTestBBox} onChange={(e) => onTestBBoxToggle?.(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-600 bg-gray-800 focus:ring-offset-0" style={{ accentColor: '#818CF8' }} />
                    <div className="flex items-center gap-2 flex-1">
                      <Square className="w-3.5 h-3.5" style={{ color: '#818CF8' }} />
                      <span className="text-sm font-medium text-gray-300 group-hover:text-gray-100 transition-colors">Test Area</span>
                      <InfoTip text="Geographic bounding box used for the pilot analysis and data loading. Used for development and validation purposes only." />
                    </div>
                  </label>
                  {showTestBBox && (
                    <div className="ml-11 mb-1 animate-fadeIn">
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span className="w-4 h-3 rounded-sm border border-dashed" style={{ borderColor: '#818CF8', background: 'rgba(99,102,241,0.1)' }} />
                        <span>Analysis bounding box</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── 3. Scenarios ── */}
            <div>
              <SectionHeader
                icon={<Layers className="w-4 h-4" style={{ color: '#A5B4FC' }} />}
                label="Scenarios"
                open={scenariosOpen}
                onToggle={() => setScenariosOpen(!scenariosOpen)}
                badge={activeCount > 0 ? `${activeCount} active` : undefined}
                tip="Predefined use-case overlays showing where streets could be activated for specific purposes — markets, outdoor dining, community events, and more. Toggle multiple scenarios to compare coverage across the city."
              />
              <div className="overflow-hidden transition-all duration-200" style={{ maxHeight: scenariosOpen ? '900px' : '0px', opacity: scenariosOpen ? 1 : 0 }}>
                <div className="px-6 pb-5">
                  <div className="flex items-center gap-2 mb-3">
                    <button onClick={onSelectAll} disabled={allSelected}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg transition-all"
                      style={{ background: allSelected ? 'rgba(255,255,255,0.03)' : 'rgba(99,102,241,0.15)', color: allSelected ? '#4b5563' : '#A5B4FC', cursor: allSelected ? 'default' : 'pointer' }}>
                      Select All
                    </button>
                    <button onClick={onDeselectAll} disabled={noneSelected}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg transition-all"
                      style={{ background: noneSelected ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)', color: noneSelected ? '#4b5563' : '#9ca3af', cursor: noneSelected ? 'default' : 'pointer' }}>
                      Deselect All
                    </button>
                    <span className="ml-auto text-xs text-gray-600">{activeCount}/{scenarios.length}</span>
                  </div>
                  <div className="space-y-2">
                    {scenarios.map(scenario => (
                      <label key={scenario.id}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all duration-150 group ${scenario.visible ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'}`}
                      >
                        <input type="checkbox" checked={scenario.visible} onChange={() => onScenarioToggle(scenario.id)}
                          className="w-4 h-4 rounded border-gray-600 bg-gray-800 focus:ring-offset-0" style={{ accentColor: scenario.color }} />
                        <div className="flex items-center gap-2.5 flex-1 min-w-0">
                          <div className="w-3 h-3 rounded-full flex-shrink-0 shadow-sm"
                            style={{ backgroundColor: scenario.color, boxShadow: scenario.visible ? `0 0 8px ${scenario.color}50` : `0 0 4px ${scenario.color}30` }} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm">{scenario.icon}</span>
                              <span className="text-sm font-medium text-gray-300 group-hover:text-gray-100 transition-colors truncate">{scenario.name}</span>
                            </div>
                            <p className="text-[10px] text-gray-600 truncate mt-0.5">{scenario.description}</p>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Footer */}
          <div className="px-6 py-5 border-t border-white/[0.06] bg-white/[0.02]">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide font-semibold">Scenarios</p>
                <p className="text-2xl font-extrabold text-gray-100">{activeCount}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide font-semibold">Anchors</p>
                <p className="text-2xl font-extrabold text-gray-100">{anchorCount.toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>

        {!isCollapsed && (
          <div onMouseDown={onMouseDown} className="flex-shrink-0 w-2 cursor-col-resize group flex items-center justify-center" title="Drag to resize">
            <div className="w-[3px] h-12 rounded-full bg-white/[0.08] group-hover:bg-indigo-500/60 group-active:bg-indigo-500 transition-colors" />
          </div>
        )}
      </div>
    </div>
  );
};
