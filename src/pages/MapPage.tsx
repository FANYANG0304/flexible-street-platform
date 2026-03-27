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
import { loadFSIScores } from '../lib/fsiScores';
import type { FSIData } from '../lib/fsiScores';
import type { Anchor, ScenarioConfig, ScenarioId } from '../types';

function getCurrentTimeBin(): string {
  const h = new Date().getHours();
  if (h >= 6  && h < 12) return 'morning';
  if (h >= 12 && h < 18) return 'afternoon';
  if (h >= 18 && h < 24) return 'evening';
  return 'night';
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
  const [sidebarCollapsed, setSidebarCollapsed]     = useState(false);
  const [sidebarWidth, setSidebarWidth]             = useState(320);
  const [showTraffic, setShowTraffic]               = useState(false);
  const [showStreetCenterline, setShowStreetCenterline] = useState(true);
  const [showPOI, setShowPOI]                       = useState(false);
  const [showPlaystreets, setShowPlaystreets]       = useState(false);
  const [showStreetEvents, setShowStreetEvents]       = useState(false);
  const [selectedStreetEvent, setSelectedStreetEvent] = useState<StreetEventInfo | null>(null);
  const [showStreetScore, setShowStreetScore]       = useState(false);
  const [showTestBBox, setShowTestBBox]             = useState(false);
  const [anchorCount]                               = useState(0);

  // ── AI sensory cache + ML FSI scores ─────────────────────────────────────────
  const [aiCache,   setAICache]   = useState<Map<number, StreetAIData>>(new Map());
  const [fsiScores, setFSIScores] = useState<Map<string, FSIData>>(new Map());

  useEffect(() => {
    loadStreetAICache().then(setAICache);
    loadFSIScores().then(setFSIScores);
  }, []);
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

  const effectiveLeft = sidebarCollapsed ? 0 : sidebarWidth;

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
        onStreetEventClick={setSelectedStreetEvent}
        onStreetScoreToggle={handleStreetScoreToggle}
        showTestBBox={showTestBBox}
        onTestBBoxToggle={setShowTestBBox}
        width={sidebarWidth}
        onWidthChange={setSidebarWidth}
        anchorCount={anchorCount}
      />

      {/* Sidebar toggle */}
      <button
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        className="absolute z-50 bg-[#1e1f2b] p-3 rounded-lg shadow-lg hover:shadow-xl transition-all hover:bg-[#282938] border border-white/[0.06]"
        style={{
          top: '16px',
          left: sidebarCollapsed ? '16px' : `${sidebarWidth + 16}px`,
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
          showTestBBox={showTestBBox}
          streetAICache={aiCache}
          fsiScores={fsiScores}
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
      </div>

      <AnchorDetailPanel anchor={selectedAnchor} onClose={() => setSelectedAnchor(null)} />

      {/* Top bar */}
      <div
        className="absolute top-0 transition-all duration-300 z-40 py-4 bg-[#0f1017]/90 backdrop-blur-md border-b border-white/[0.04]"
        style={{
          left: effectiveLeft, right: 0,
          paddingLeft:  sidebarCollapsed ? '70px' : '80px',
          paddingRight: '24px',
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-extrabold text-gray-100 tracking-wide">Flexible Street Platform</h2>
            <p className="text-xs text-gray-500">
              Time: <span className="font-semibold text-gray-400">
                {timeBins.find(t => t.id === selectedTimeBin)?.label}
              </span>
              {' · '}Scenarios: <span className="font-semibold text-gray-400">{activeScenarios.size}</span>
              {showStreetScore && (
                <>
                  {' · '}<span className="text-emerald-400 font-semibold">📊 Scores</span>
                  {aiCache.size > 0 && (
                    <span className="text-gray-600 ml-1">({aiCache.size} AI vibes)</span>
                  )}
                </>
              )}
              {showTraffic          && <>{' · '}<span className="text-green-400 font-semibold">🚦 Traffic</span></>}
              {showStreetCenterline && <>{' · '}<span className="text-indigo-400 font-semibold">🛣️ Centerline</span></>}
              {showPOI              && <>{' · '}<span className="text-sky-400 font-semibold">📍 POI</span></>}
              {showPlaystreets      && <>{' · '}<span className="text-cyan-400 font-semibold">🛝 Playstreets</span></>}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div
              className="px-3 py-1 rounded-full text-xs font-semibold"
              style={{ background: 'rgba(99,102,241,0.12)', color: '#A5B4FC', border: '1px solid rgba(99,102,241,0.2)' }}
            >
              Philadelphia Pilot
            </div>
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
