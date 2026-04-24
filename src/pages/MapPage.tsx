import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, Maximize } from 'lucide-react';
import { MapComponent } from '../components/MapComponent';
import type { MapHandle } from '../components/MapComponent';
import { Sidebar } from '../components/Sidebar';
import { MapLegend } from '../components/MapLegend';
import { AnchorDetailPanel } from '../components/AnchorDetailPanel';
import { StreetScorePanel } from '../components/StreetScorePanel';
import type { StreetScore } from '../components/StreetScorePanel';
import { StreetEventPanel } from '../components/StreetEventPanel';
import type { StreetEventInfo } from '../components/StreetEventPanel';
import { scenarioConfigs, timeBins } from '../data/mockData';
import { loadStreetAICache } from '../lib/streetScores';
import type { StreetAIData } from '../lib/streetScores';
import { fetchWeather } from '../lib/weather';
import type { WeatherData } from '../lib/weather';
import { computePoiFSI, computeCompositeTotal, getTrafficModifier } from '../lib/fsiScores';
import type { POIRecord } from '../lib/fsiScores';
import { logCalibration } from '../lib/fsiCalibrate';
import { fetchPhillyEvents, getPhillyHoliday, getEventModifier } from '../lib/events';
import type { PhillyEvent } from '../lib/events';
import { supabase } from '../lib/supabase';
import type { Anchor, ScenarioConfig, ScenarioId } from '../types';

function getCurrentTimeBin(): string {
  const h = new Date().getHours();
  if (h >= 6  && h < 12) return 'morning';
  if (h >= 12 && h < 18) return 'afternoon';
  if (h >= 18 && h < 24) return 'evening';
  return 'night';
}

// ── Quick-start help overlay ──────────────────────────────────────────────────
const HELP_TIPS = [
  { icon: '🖱️', title: 'Click a street', body: 'Click any street on the map to open a detail panel with its Flexibility Score, street-level photo, and dimension breakdown.' },
  { icon: '📊', title: 'Enable Flexibility Score', body: 'Toggle "Flexibility Score" in the sidebar\'s Data Overlays to color every street by activation potential. Greener = higher score.' },
  { icon: '🕐', title: 'Change the time of day', body: 'Use the clock in the sidebar to switch between Morning, Afternoon, Evening, and Night. Scores update based on traffic patterns.' },
  { icon: '✅', title: 'Score ≥ 80 = Recommended', body: 'Streets scoring 80 or above glow on the map and are flagged as strong candidates for temporary pedestrian or commercial use.' },
  { icon: '🗺️', title: 'Explore layers', body: 'Use Data Overlays to add traffic, Points of Interest, Playstreets, and more. Combine layers to understand why a street scores the way it does.' },
  { icon: '📍', title: 'Use scenarios', body: 'Enable Scenarios in the sidebar to see targeted overlays for markets, dining, community events, and other activation use cases.' },
];

function HelpOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-[90] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl" style={{ background: '#16171e', border: '1px solid rgba(255,255,255,0.1)' }} onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(99,102,241,0.08)' }}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-extrabold text-gray-100">How to use Flexible Streets</h2>
              <p className="text-xs text-gray-500 mt-0.5">A quick guide for new users</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/[0.08] transition-colors text-gray-400 hover:text-gray-200">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
        <div className="px-6 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
          {HELP_TIPS.map((tip, i) => (
            <div key={i} className="flex gap-3 p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <span className="text-xl flex-shrink-0 mt-0.5">{tip.icon}</span>
              <div>
                <p className="text-sm font-semibold text-gray-200 mb-0.5">{tip.title}</p>
                <p className="text-xs text-gray-500 leading-relaxed">{tip.body}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="px-6 py-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <button onClick={onClose} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90" style={{ background: 'linear-gradient(135deg, #6366F1, #818CF8)' }}>
            Got it — start exploring
          </button>
        </div>
      </div>
    </div>
  );
}

export const MapPage = () => {
  const navigate = useNavigate();
  const mapRef   = useRef<MapHandle>(null);

  const [scenarios, setScenarios] = useState<ScenarioConfig[]>(() =>
    scenarioConfigs.map(s => ({ ...s, visible: false }))
  );
  const [selectedTimeBin, setSelectedTimeBin]       = useState(getCurrentTimeBin);
  const [selectedAnchor, setSelectedAnchor]         = useState<Anchor | null>(null);
  const [selectedStreetScore, setSelectedStreetScore] = useState<StreetScore | null>(null);
  const [showHelp, setShowHelp] = useState(() => !localStorage.getItem('fsp-help-seen'));
  const handleCloseHelp = useCallback(() => {
    setShowHelp(false);
    localStorage.setItem('fsp-help-seen', '1');
  }, []);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [sidebarCollapsed, setSidebarCollapsed]     = useState(() => window.innerWidth < 768);
  const [sidebarWidth, setSidebarWidth]             = useState(355);

  useEffect(() => {
    const handler = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  const [showTraffic, setShowTraffic]               = useState(false);
  const [showStreetCenterline, setShowStreetCenterline] = useState(true);
  const [showPOI, setShowPOI]                       = useState(false);
  const [showPlaystreets, setShowPlaystreets]       = useState(false);
  const [showStreetEvents, setShowStreetEvents]       = useState(false);
  const [selectedStreetEvent, setSelectedStreetEvent] = useState<StreetEventInfo | null>(null);
  const [showStreetScore, setShowStreetScore]       = useState(false);
  const [showCloseableOnly, setShowCloseableOnly]   = useState(false);
  const [showTestBBox, setShowTestBBox]             = useState(false);
  const [anchorCount]                               = useState(0);

  // ── AI sensory cache + POI density (for FSI) + weather ──────────────────────
  const [aiCache,      setAICache]      = useState<Map<number, StreetAIData>>(new Map());
  const [allPOIs,      setAllPOIs]      = useState<POIRecord[]>([]);
  const [weatherData,  setWeatherData]  = useState<WeatherData | undefined>(undefined);
  const [phillyEvents,  setPhillyEvents]  = useState<PhillyEvent[]>([]);
  const [selectedDate,  setSelectedDate]  = useState(() => new Date());
  const [playstreetFeatures,    setPlaystreetFeatures]    = useState<any[]>([]);
  const [streetEventFeatures,   setStreetEventFeatures]   = useState<any[]>([]);
  const holidayInfo = useMemo(() => getPhillyHoliday(selectedDate) ?? undefined, [selectedDate]);

  // ── Validation accuracy: playstreets + open streets vs FSI threshold ──────────
  // Uses the same composite score as the map display so results are consistent
  // with what the user sees (green = high composite, not just high raw density).
  const validationStats = useMemo(() => {
    if (allPOIs.length === 0) return null;
    const THRESHOLD = 75;
    const TIME_BIN_HOURS: Record<string, [number, number]> = {
      morning: [6, 12], afternoon: [12, 18], evening: [18, 24], night: [0, 6],
    };

    /** Polyline coords [[lng, lat], ...] of a Line / MultiLine / Point feature. */
    const getCoords = (f: any): [number, number][] | null => {
      const geom = f.geometry;
      if (!geom) return null;
      if (geom.type === 'LineString')      return geom.coordinates as [number, number][];
      if (geom.type === 'MultiLineString') return (geom.coordinates as [number, number][][]).flat();
      if (geom.type === 'Point') {
        const [lng, lat] = geom.coordinates as [number, number];
        return [[lng, lat]];
      }
      return null;
    };

    // Same formula as the map: composite = fsi × traffic × weather × events × holiday
    const compositeScore = (coords: [number, number][], stname: string): number => {
      const fsi = computePoiFSI(coords, allPOIs);
      if (!fsi) return 0;
      const cLng = coords.reduce((s, c) => s + c[0], 0) / coords.length;
      const cLat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
      return computeCompositeTotal(
        fsi.total, undefined,
        getTrafficModifier(stname, 'CITY', selectedTimeBin),
        weatherData?.modifier ?? 1.0,
        getEventModifier(cLat, cLng, phillyEvents).mod,
        holidayInfo?.modifier ?? 1.0,
      );
    };

    let playPass = 0, playTotal = 0;
    for (const f of playstreetFeatures) {
      const c = getCoords(f);
      if (!c) continue;
      if (compositeScore(c, f.properties?.block_name ?? '') >= THRESHOLD) playPass++;
      playTotal++;
    }

    const [binStart, binEnd] = TIME_BIN_HOURS[selectedTimeBin] ?? [0, 24];
    let openPass = 0, openTotal = 0;
    for (const f of streetEventFeatures) {
      const p = f.properties ?? {};
      const parseH = (t: string) => parseInt((t ?? '0').split(':')[0]);
      const openH  = parseH(p.open_time  ?? p.openTime  ?? '10:00');
      const closeH = parseH(p.close_time ?? p.closeTime ?? '18:00');
      if (openH >= binEnd || closeH <= binStart) continue;
      const c = getCoords(f);
      if (!c) continue;
      if (compositeScore(c, p.street_name ?? '') >= THRESHOLD) openPass++;
      openTotal++;
    }

    return { playTotal, playPass, openTotal, openPass };
  }, [allPOIs, playstreetFeatures, streetEventFeatures, selectedTimeBin, weatherData, phillyEvents, holidayInfo]);

  useEffect(() => {
    loadStreetAICache().then(setAICache);
    // Load all POIs once for POI-density FSI scoring (playstreets/openstreets excluded)
    supabase.rpc('get_poi_in_bounds', {
      min_lng: -75.30, min_lat: 39.86, max_lng: -74.95, max_lat: 40.14,
    }).then(({ data, error }) => {
      if (error) { console.warn('allPOIs fetch:', error.message); return; }
      const pois: POIRecord[] = (data?.features ?? []).map((f: any) => ({
        lat:      f.geometry.coordinates[1],
        lng:      f.geometry.coordinates[0],
        category: f.properties?.poi_category ?? '',
        amenity:  f.properties?.amenity ?? undefined,
      }));
      setAllPOIs(pois);
      console.log(`✅ Loaded ${pois.length} POIs for FSI density scoring`);
    });
    supabase.rpc('get_playstreets_lines_in_bounds', {
      min_lng: -75.35, min_lat: 39.85, max_lng: -74.95, max_lat: 40.15,
    }).then(({ data }) => setPlaystreetFeatures(data?.features ?? []));
    supabase.rpc('get_street_events_in_bounds', {
      min_lng: -75.26, min_lat: 39.91, max_lng: -75.03, max_lat: 40.05,
    }).then(({ data }) => setStreetEventFeatures(data?.features ?? []));
    fetchWeather().then(setWeatherData);
    // Fetch Ticketmaster events (refreshes every 4 hours)
    fetchPhillyEvents().then(setPhillyEvents);
    const eventsInterval = setInterval(() => fetchPhillyEvents().then(setPhillyEvents), 4 * 60 * 60 * 1000);
    // Refresh weather every 30 minutes
    const weatherInterval = setInterval(() => fetchWeather().then(setWeatherData), 30 * 60 * 1000);
    return () => {
      clearInterval(eventsInterval);
      clearInterval(weatherInterval);
    };
  }, []);

  // One-shot saturation calibration using two positive-sample sets:
  //   playstreets  — calibrates COMMUNITY (residential blocks w/ schools etc.)
  //   open streets — calibrates COMMERCIAL (Center City activation corridors)
  // Both print to the console; copy the sat you want into SATURATION in
  // `src/lib/fsiScores.ts` and hard-reload (Ctrl+Shift+R).
  const calibratedRef = useRef(false);
  useEffect(() => {
    if (calibratedRef.current) return;
    if (allPOIs.length === 0) return;
    if (playstreetFeatures.length === 0 && streetEventFeatures.length === 0) return;
    calibratedRef.current = true;
    if (playstreetFeatures.length) logCalibration('playstreets',  playstreetFeatures,  allPOIs, 75);
    if (streetEventFeatures.length) logCalibration('open streets', streetEventFeatures, allPOIs, 75);
  }, [allPOIs, playstreetFeatures, streetEventFeatures]);
  // ────────────────────────────────────────────────────────────────────────────

  const activeScenarios = useMemo(
    () => new Set(scenarios.filter(s => s.visible).map(s => s.id)) as Set<ScenarioId>,
    [scenarios]
  );
  const activeScenariosConfig = useMemo(() => scenarios.filter(s => s.visible), [scenarios]);

  const handleScenarioToggle = useCallback((id: string) => {
    setScenarios(prev => prev.map(s => s.id === id ? { ...s, visible: !s.visible } : s));
  }, []);
  const handleSelectAll   = useCallback(() =>
    setScenarios(prev => prev.map(s => ({ ...s, visible: true }))), []);
  const handleDeselectAll = useCallback(() =>
    setScenarios(prev => prev.map(s => ({ ...s, visible: false }))), []);

  const handleAnchorClick = useCallback((anchor: Anchor) => {
    setSelectedAnchor(anchor);
    setSelectedStreetScore(null);
  }, []);

  const handleStreetScoreClick = useCallback((score: StreetScore) => {
    setSelectedStreetScore(score);
    setSelectedAnchor(null);
  }, []);

  const handleStreetScoreToggle = useCallback((show: boolean) => {
    setShowStreetScore(show);
    if (!show) setSelectedStreetScore(null);
  }, []);

  // On mobile, sidebar overlays the map (doesn't push it)
  const effectiveLeft = (!sidebarCollapsed && !isMobile) ? sidebarWidth : 0;

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#0f1017]">
      <Sidebar
        scenarios={scenarios}
        timeBins={timeBins}
        selectedTimeBin={selectedTimeBin}
        onScenarioToggle={handleScenarioToggle}
        onTimeBinChange={setSelectedTimeBin}
        onSelectAll={handleSelectAll}
        onDeselectAll={handleDeselectAll}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        showTraffic={showTraffic}
        onTrafficToggle={setShowTraffic}
        showStreetCenterline={showStreetCenterline}
        onStreetCenterlineToggle={setShowStreetCenterline}
        showPOI={showPOI}
        onPOIToggle={setShowPOI}
        showPlaystreets={showPlaystreets}
        onPlaystreetsToggle={setShowPlaystreets}
        showStreetEvents={showStreetEvents}
        onStreetEventsToggle={(v) => { setShowStreetEvents(v); if (!v) setSelectedStreetEvent(null); }}
        showStreetScore={showStreetScore}
        onStreetScoreToggle={handleStreetScoreToggle}
        showCloseableOnly={showCloseableOnly}
        onCloseableOnlyToggle={setShowCloseableOnly}
        showTestBBox={showTestBBox}
        onTestBBoxToggle={setShowTestBBox}
        width={sidebarWidth}
        onWidthChange={setSidebarWidth}
        anchorCount={anchorCount}
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
      />

      {/* Mobile backdrop — tap to close sidebar */}
      {isMobile && !sidebarCollapsed && (
        <div
          className="absolute inset-0 z-20 bg-black/60 backdrop-blur-sm"
          onClick={() => setSidebarCollapsed(true)}
        />
      )}

      {/* Sidebar toggle */}
      <button
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        className="absolute z-50 bg-[#1e1f2b] p-3 rounded-lg shadow-lg hover:shadow-xl transition-all hover:bg-[#282938] border border-white/[0.06]"
        style={{
          top: '16px',
          left: sidebarCollapsed ? '16px' : isMobile ? `${Math.min(sidebarWidth, window.innerWidth * 0.85) + 4}px` : `${sidebarWidth + 16}px`,
          transition: 'left 0.3s ease-in-out',
        }}
        title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {sidebarCollapsed ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        )}
      </button>

      {/* Map */}
      <div
        className="absolute top-0 right-0 bottom-0 transition-all duration-300"
        style={{ left: effectiveLeft }}
      >
        <MapComponent
          ref={mapRef}
          activeScenarios={activeScenarios}
          selectedTimeBin={selectedTimeBin}
          onAnchorClick={handleAnchorClick}
          showTraffic={showTraffic}
          showStreetCenterline={showStreetCenterline}
          showPOI={showPOI}
          showPlaystreets={showPlaystreets}
          showStreetEvents={showStreetEvents}
          onStreetEventClick={setSelectedStreetEvent}
          showStreetScore={showStreetScore}
          onStreetScoreClick={handleStreetScoreClick}
          showCloseableOnly={showCloseableOnly}
          showTestBBox={showTestBBox}
          streetAICache={aiCache}
          allPOIs={allPOIs}
          weatherData={weatherData}
          phillyEvents={phillyEvents}
          holidayInfo={holidayInfo}
        />
        <MapLegend
          showStreetScore={showStreetScore}
          showTraffic={showTraffic}
          showStreetCenterline={showStreetCenterline}
          showPOI={showPOI}
          showPlaystreets={showPlaystreets}
          showTestBBox={showTestBBox}
          activeScenarios={activeScenariosConfig}
          anchorPanelOpen={selectedAnchor !== null}
        />
        <StreetScorePanel score={selectedStreetScore} onClose={() => setSelectedStreetScore(null)} />
        <StreetEventPanel event={selectedStreetEvent} onClose={() => setSelectedStreetEvent(null)} />

        {/* Validation accuracy badge */}
        {validationStats && (validationStats.playTotal + validationStats.openTotal) > 0 && (() => {
          const total = validationStats.playTotal + validationStats.openTotal;
          const pass  = validationStats.playPass  + validationStats.openPass;
          const pct   = Math.round((pass / total) * 100);
          const color = pct >= 75 ? '#10B981' : pct >= 50 ? '#F59E0B' : '#EF4444';
          return (
            <div className="absolute bottom-6 left-4 z-40 rounded-xl shadow-lg"
              style={{ background: 'rgba(12,13,20,0.88)', border: '1px solid rgba(255,255,255,0.07)', backdropFilter: 'blur(10px)', minWidth: '130px' }}>
              <div className="px-3 pt-2 pb-2">
                <p className="text-[8.5px] font-bold uppercase tracking-[0.15em] text-gray-600 mb-1">Score Validation</p>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-extrabold leading-none" style={{ color }}>{pct}%</span>
                  <span className="text-[10px] font-mono text-gray-600">{pass}/{total}</span>
                  <span className="text-[9px] text-gray-700">≥75</span>
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[9px]" style={{ color: 'rgba(34,211,238,0.7)' }}>🛝 {validationStats.playPass}/{validationStats.playTotal}</span>
                  {validationStats.openTotal > 0 && (
                    <span className="text-[9px]" style={{ color: 'rgba(245,158,11,0.7)' }}>🏙 {validationStats.openPass}/{validationStats.openTotal}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Floating help button */}
        <button
          onClick={() => setShowHelp(true)}
          className="absolute bottom-6 right-4 z-40 w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-all hover:scale-110 hover:shadow-xl"
          style={{ background: 'rgba(30,31,43,0.92)', border: '1.5px solid rgba(99,102,241,0.4)', backdropFilter: 'blur(8px)', color: '#A5B4FC', fontSize: '16px', fontWeight: 700 }}
          title="How to use this map"
        >
          ?
        </button>
      </div>

      <AnchorDetailPanel anchor={selectedAnchor} onClose={() => setSelectedAnchor(null)} />

      {/* Help overlay */}
      {showHelp && <HelpOverlay onClose={handleCloseHelp} />}

      {/* Top bar */}
      <div
        className="absolute top-0 transition-all duration-300 z-40 py-3 sm:py-4 bg-[#0f1017]/90 backdrop-blur-md border-b border-white/[0.04]"
        style={{
          left: effectiveLeft, right: 0,
          paddingLeft:  sidebarCollapsed ? '58px' : isMobile ? '58px' : '80px',
          paddingRight: '12px',
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm sm:text-lg font-extrabold text-gray-100 tracking-wide truncate">Flexible Street Platform</h2>
            <p className="text-[10px] sm:text-xs text-gray-500 truncate">
              <span className="font-semibold text-gray-400">
                {timeBins.find(t => t.id === selectedTimeBin)?.label}
              </span>
              {' · '}<span className="font-semibold text-gray-400">{activeScenarios.size} scenarios</span>
              {showStreetScore && <>{' · '}<span className="text-emerald-400 font-semibold">Scores</span></>}
              {showTraffic     && <>{' · '}<span className="text-green-400 font-semibold">Traffic</span></>}
            </p>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
            <div
              className="hidden sm:block px-3 py-1 rounded-full text-xs font-semibold"
              style={{ background: 'rgba(99,102,241,0.12)', color: '#A5B4FC', border: '1px solid rgba(99,102,241,0.2)' }}
            >
              Philadelphia Pilot
            </div>
            <button
              onClick={() => setShowHelp(true)}
              className="p-2 bg-[#1e1f2b] rounded-lg shadow-md hover:shadow-lg transition-all hover:bg-[#282938] border border-white/[0.06]"
              title="How to use this platform"
            >
              <span className="w-5 h-5 flex items-center justify-center font-bold text-gray-400" style={{ fontSize: '14px' }}>?</span>
            </button>
            <button
              onClick={() => mapRef.current?.fitToPhiladelphia()}
              className="p-2 bg-[#1e1f2b] rounded-lg shadow-md hover:shadow-lg transition-all hover:bg-[#282938] border border-white/[0.06]"
              title="Fit to Philadelphia"
            >
              <Maximize className="w-5 h-5 text-gray-400" />
            </button>
            <button
              onClick={() => navigate('/')}
              className="p-2 bg-[#1e1f2b] rounded-lg shadow-md hover:shadow-lg transition-all hover:bg-[#282938] border border-white/[0.06]"
              title="Back to home"
            >
              <Home className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
