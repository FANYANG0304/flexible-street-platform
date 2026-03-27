import { useState, useCallback, useEffect, useRef } from 'react';
import type { ScenarioConfig, TimeBin } from '../types';
import { Layers, Clock, Radio, ChevronDown, GitBranch, MapPin, Flag, BarChart3, Square } from 'lucide-react';
import { STREET_COLORS, STREET_FALLBACK, POI_COLORS, PLAYSTREETS_COLOR, STREET_EVENTS_COLOR, SCORE_COLOR_STOPS } from './MapComponent';

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
  showTestBBox?: boolean;
  onTestBBoxToggle?: (show: boolean) => void;
  width: number;
  onWidthChange: (w: number) => void;
  anchorCount?: number;
}

const MIN_W = 260;
const MAX_W = 480;

export const Sidebar = ({
  scenarios, timeBins, selectedTimeBin, onScenarioToggle, onTimeBinChange,
  onSelectAll, onDeselectAll,
  isCollapsed, showTraffic = false, onTrafficToggle,
  showStreetCenterline = false, onStreetCenterlineToggle,
  showPOI = false, onPOIToggle,
  showPlaystreets = false, onPlaystreetsToggle,
  showStreetEvents = false, onStreetEventsToggle,
  showStreetScore = false, onStreetScoreToggle,
  showTestBBox = false, onTestBBoxToggle,
  width, onWidthChange, anchorCount = 0,
}: SidebarProps) => {
  const accent = '#6366F1';

  const [timeOpen, setTimeOpen] = useState(false);
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

  const SectionHeader = ({ icon, label, open, onToggle, badge }: { icon: React.ReactNode; label: string; open: boolean; onToggle: () => void; badge?: string }) => (
    <button onClick={onToggle} className="w-full px-6 py-5 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide">{label}</h2>
        {badge && <span className="px-2 py-0.5 text-[10px] font-bold rounded-full" style={{ background: 'rgba(99,102,241,0.15)', color: '#A5B4FC' }}>{badge}</span>}
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

  return (
    <div className="absolute top-0 left-0 h-full transition-all duration-300 z-10" style={{ width: isCollapsed ? 0 : width, overflow: 'hidden' }}>
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
              <SectionHeader icon={<Clock className="w-4 h-4" style={{ color: '#A5B4FC' }} />} label="Time Period" open={timeOpen} onToggle={() => setTimeOpen(!timeOpen)} />
              <div className="overflow-hidden transition-all duration-200" style={{ maxHeight: timeOpen ? '400px' : '0px', opacity: timeOpen ? 1 : 0 }}>
                <div className="px-6 pb-5 grid grid-cols-1 gap-2">
                  {timeBins.map(bin => (
                    <button key={bin.id} onClick={() => onTimeBinChange(bin.id)}
                      className={`px-4 py-3 rounded-xl text-sm font-medium transition-all text-left ${selectedTimeBin === bin.id ? 'bg-white/[0.08] text-gray-100 border border-white/[0.1]' : 'text-gray-400 hover:bg-white/[0.03] border border-transparent'}`}
                    >
                      <span>{bin.label}</span>
                      <span className="text-xs text-gray-600 ml-2">{bin.startHour}:00–{bin.endHour}:00</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ── 2. Data Overlays ── */}
            <div className="border-b border-white/[0.06]">
              <SectionHeader icon={<Radio className="w-4 h-4" style={{ color: '#A5B4FC' }} />} label="Data Overlays" open={overlaysOpen} onToggle={() => setOverlaysOpen(!overlaysOpen)} />
              <div className="overflow-hidden transition-all duration-200" style={{ maxHeight: overlaysOpen ? '1400px' : '0px', opacity: overlaysOpen ? 1 : 0 }}>
                <div className="px-6 pb-5 space-y-1">

                  {/* Street Score — new */}
                  <label className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/[0.05] cursor-pointer transition-all duration-150 group">
                    <input type="checkbox" checked={showStreetScore} onChange={(e) => onStreetScoreToggle?.(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-600 bg-gray-800 focus:ring-offset-0" style={{ accentColor: '#10B981' }} />
                    <div className="flex items-center gap-2 flex-1">
                      <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-sm font-medium text-gray-300 group-hover:text-gray-100 transition-colors">Flexibility Score</span>
                    </div>
                  </label>
                  {showStreetScore && (
                    <div className="ml-7 mb-2 animate-fadeIn">
                      {/* Gradient bar */}
                      <div className="ml-4 mt-1 space-y-2 pb-1">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2.5 rounded-full overflow-hidden"
                            style={{ background: 'linear-gradient(90deg, #EF4444 0%, #F97316 25%, #EAB308 45%, #22C55E 65%, #10B981 80%, #059669 100%)' }} />
                        </div>
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
                        <p className="text-[10px] text-gray-600 mt-1 leading-relaxed">
                          Click a street to see Commercial, Social &amp; Ecological breakdown. Streets ≥80 glow and are recommended for activation.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Traffic */}
                  <label className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/[0.05] cursor-pointer transition-all duration-150 group">
                    <input type="checkbox" checked={showTraffic} onChange={(e) => onTrafficToggle?.(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-600 bg-gray-800 focus:ring-offset-0" style={{ accentColor: accent }} />
                    <div className="flex items-center gap-2 flex-1">
                      <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-green-400 via-yellow-400 to-red-400" />
                      <span className="text-sm font-medium text-gray-300 group-hover:text-gray-100 transition-colors">Real-time Traffic</span>
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

                  {/* Street Centerline */}
                  <label className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/[0.05] cursor-pointer transition-all duration-150 group">
                    <input type="checkbox" checked={showStreetCenterline} onChange={(e) => onStreetCenterlineToggle?.(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-600 bg-gray-800 focus:ring-offset-0" style={{ accentColor: accent }} />
                    <div className="flex items-center gap-2 flex-1">
                      <GitBranch className="w-3.5 h-3.5 text-indigo-400" />
                      <span className="text-sm font-medium text-gray-300 group-hover:text-gray-100 transition-colors">Street Centerline</span>
                    </div>
                  </label>
                  {showStreetCenterline && (
                    <SubLegend open={streetLegendOpen} onToggle={() => setStreetLegendOpen(!streetLegendOpen)}
                      count={STREET_COLORS.length} items={STREET_COLORS} fallbackLabel="Other" fallbackColor={STREET_FALLBACK} />
                  )}

                  {/* POI */}
                  <label className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/[0.05] cursor-pointer transition-all duration-150 group">
                    <input type="checkbox" checked={showPOI} onChange={(e) => onPOIToggle?.(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-600 bg-gray-800 focus:ring-offset-0" style={{ accentColor: accent }} />
                    <div className="flex items-center gap-2 flex-1">
                      <MapPin className="w-3.5 h-3.5 text-sky-400" />
                      <span className="text-sm font-medium text-gray-300 group-hover:text-gray-100 transition-colors">Points of Interest</span>
                    </div>
                  </label>
                  {showPOI && (
                    <SubLegend open={poiLegendOpen} onToggle={() => setPoiLegendOpen(!poiLegendOpen)}
                      count={POI_COLORS.length} items={POI_COLORS} />
                  )}

                  {/* Playstreets */}
                  <label className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/[0.05] cursor-pointer transition-all duration-150 group">
                    <input type="checkbox" checked={showPlaystreets} onChange={(e) => onPlaystreetsToggle?.(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-600 bg-gray-800 focus:ring-offset-0" style={{ accentColor: accent }} />
                    <div className="flex items-center gap-2 flex-1">
                      <Flag className="w-3.5 h-3.5" style={{ color: PLAYSTREETS_COLOR }} />
                      <span className="text-sm font-medium text-gray-300 group-hover:text-gray-100 transition-colors">Playstreets</span>
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

                  {/* Open Streets (Center City) */}
                  <label className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/[0.05] cursor-pointer transition-all duration-150 group">
                    <input type="checkbox" checked={showStreetEvents} onChange={(e) => onStreetEventsToggle?.(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-600 bg-gray-800 focus:ring-offset-0" style={{ accentColor: STREET_EVENTS_COLOR }} />
                    <div className="flex items-center gap-2 flex-1">
                      <Flag className="w-3.5 h-3.5" style={{ color: STREET_EVENTS_COLOR }} />
                      <span className="text-sm font-medium text-gray-300 group-hover:text-gray-100 transition-colors">Open Streets</span>
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

                  {/* Test BBox */}
                  <label className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/[0.05] cursor-pointer transition-all duration-150 group">
                    <input type="checkbox" checked={showTestBBox} onChange={(e) => onTestBBoxToggle?.(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-600 bg-gray-800 focus:ring-offset-0" style={{ accentColor: '#818CF8' }} />
                    <div className="flex items-center gap-2 flex-1">
                      <Square className="w-3.5 h-3.5" style={{ color: '#818CF8' }} />
                      <span className="text-sm font-medium text-gray-300 group-hover:text-gray-100 transition-colors">Test Area</span>
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

            {/* ── 3. Scenarios (LAST) ── */}
            <div>
              <SectionHeader
                icon={<Layers className="w-4 h-4" style={{ color: '#A5B4FC' }} />}
                label="Scenarios"
                open={scenariosOpen}
                onToggle={() => setScenariosOpen(!scenariosOpen)}
                badge={activeCount > 0 ? `${activeCount} active` : undefined}
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
