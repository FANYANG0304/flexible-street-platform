import 'mapbox-gl/dist/mapbox-gl.css';
import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import mapboxgl from 'mapbox-gl';
import type { Anchor, ScenarioId } from '../types';
import { PHILADELPHIA_CENTER, scenarioConfigs } from '../data/mockData';
import { supabase } from '../lib/supabase';
import { generateStreetScores, getScoreColor } from './StreetScorePanel';
import type { StreetScore } from './StreetScorePanel';
import type { StreetAIData } from '../lib/streetScores';
import { computeCompositeTotal, getTrafficModifier, trafficLabel, computePoiFSI, countEducationSubtypes, rawSumAlongStreet, saturate, PROMINENCE_BONUS, CLOSEABLE_RESPONSIBLES, getEmergencyVeto, getCloseability, findClusters } from '../lib/fsiScores';
import type { POIRecord, EducationBreakdown, Dim, EmergencyAmenity, ClusterCandidate } from '../lib/fsiScores';
import { getEventModifier } from '../lib/events';
import type { PhillyEvent, HolidayInfo } from '../lib/events';
import type { StreetEventInfo } from './StreetEventPanel';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

export interface MapHandle {
  fitToPhiladelphia: () => void;
  flyToPennSansom:   () => void;
}

interface MapComponentProps {
  activeScenarios: Set<ScenarioId>;
  selectedTimeBin?: string;
  onAnchorClick?: (anchor: Anchor) => void;
  showTraffic?: boolean;
  showStreetCenterline?: boolean;
  showPOI?: boolean;
  showPlaystreets?: boolean;
  showStreetEvents?: boolean;
  onStreetEventClick?: (event: StreetEventInfo) => void;
  showStreetScore?: boolean;
  onStreetScoreClick?: (score: StreetScore) => void;
  /** When true, hide every street whose responsibl is not in CLOSEABLE_RESPONSIBLES. */
  showCloseableOnly?: boolean;
  showTestBBox?: boolean;
  streetAICache?: Map<number, StreetAIData>;
  allPOIs?: POIRecord[];
  weatherData?: import('../lib/weather').WeatherData;
  phillyEvents?: PhillyEvent[];
  holidayInfo?:  HolidayInfo;
}

/* ── Palettes ── */
const SCENARIO_PALETTE: Record<string, { color: string; rgb: string }> = {};
for (const s of scenarioConfigs) SCENARIO_PALETTE[s.id] = { color: s.color, rgb: s.glowRgb };

export const STREET_COLORS: [string, string][] = [
  ['CITY','#6366F1'],['STATE','#F43F5E'],['SEPTA','#F59E0B'],['PRIVATE','#8B5CF6'],
  ['FAIRMOUNT PARK','#10B981'],['PHA','#3B82F6'],['PIDC','#06B6D4'],['DRPA','#EC4899'],
  ['FAM','#14B8A6'],['AIRPORT','#A78BFA'],['BCBC','#FB923C'],['STRICKEN','#EF4444'],['TOWNSHIP','#67E8F9'],
];
export const STREET_FALLBACK = '#475569';

export const POI_COLORS: [string, string][] = [
  ['Education','#60A5FA'],['Healthcare','#F87171'],['Food & Dining','#FB923C'],['Religious','#C084FC'],
  ['Community','#34D399'],['Public Safety','#FBBF24'],['Culture','#F472B6'],['Finance','#38BDF8'],['Transport','#A78BFA'],
];
const POI_FALLBACK = '#64748B';
export const PLAYSTREETS_COLOR    = '#22D3EE';
export const STREET_EVENTS_COLOR  = '#F59E0B';

/* ── Study zones — drives both the visual bbox layer and the analysis script ── */
const STUDY_ZONES = [
  { label: 'West Philadelphia',      sublabel: 'Community-led activation',  minLng: -75.248, minLat: 39.948, maxLng: -75.198, maxLat: 39.976 },
  { label: 'Center City / Downtown', sublabel: 'Commercial-led activation', minLng: -75.178, minLat: 39.939, maxLng: -75.142, maxLat: 39.963 },
];

const BBOX_FEATURES = STUDY_ZONES.map(z => ({
  type: 'Feature' as const,
  properties: { label: z.label, sublabel: z.sublabel },
  geometry: {
    type: 'Polygon' as const,
    coordinates: [[
      [z.minLng, z.minLat], [z.maxLng, z.minLat],
      [z.maxLng, z.maxLat], [z.minLng, z.maxLat],
      [z.minLng, z.minLat],
    ]],
  },
}));

/* ── Score color stops (exported for legend) ── */
export const SCORE_COLOR_STOPS: { value: number; color: string; label: string }[] = [
  { value: 0,  color: '#EF4444', label: '0–49   Low' },
  { value: 50, color: '#F97316', label: '50–74  Fair' },
  { value: 75, color: '#EAB308', label: '75–89  Good' },
  { value: 90, color: '#10B981', label: '90–100  Excellent' },
];

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/* ── Douglas-Peucker line simplification ────────────────────────────────── */
function dpPerp(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
  const t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function dpSimplify(pts: number[][], eps: number): number[][] {
  if (pts.length <= 2) return pts;
  let maxD = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = dpPerp(pts[i][0], pts[i][1], pts[0][0], pts[0][1], pts[pts.length-1][0], pts[pts.length-1][1]);
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD > eps) {
    const a = dpSimplify(pts.slice(0, idx + 1), eps);
    const b = dpSimplify(pts.slice(idx), eps);
    return [...a.slice(0, -1), ...b];
  }
  return [pts[0], pts[pts.length - 1]];
}
function simplifyFeatureCoords(fc: GeoJSON.FeatureCollection, eps: number): GeoJSON.FeatureCollection {
  return {
    ...fc,
    features: fc.features.map(f => {
      const g = f.geometry as any;
      if (!g) return f;
      let coords = g.coordinates;
      if (g.type === 'LineString') coords = dpSimplify(coords, eps);
      else if (g.type === 'MultiLineString') coords = (coords as number[][][]).map((c: number[][]) => dpSimplify(c, eps));
      return { ...f, geometry: { ...g, coordinates: coords } };
    }),
  };
}

/**
 * Polyline coordinates of a Line/MultiLine feature as [[lng, lat], ...].
 * Returns null for other geometry types or empty features.
 */
function getFeatureCoords(feat: { geometry?: any }): [number, number][] | null {
  const geom = feat.geometry;
  let coords: [number, number][] = [];
  if      (geom?.type === 'LineString')      coords = geom.coordinates;
  else if (geom?.type === 'MultiLineString') coords = (geom.coordinates as [number, number][][]).flat();
  else return null;
  return coords.length ? coords : null;
}

/** Arithmetic mean of [lng, lat] pairs — used as the events/anchor point. */
function centroidOf(coords: [number, number][]): [number, number] {
  const lng = coords.reduce((s, c) => s + c[0], 0) / coords.length;
  const lat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  return [lng, lat];
}

function useDebouncedCallback<T extends (...args: any[]) => any>(fn: T, delay: number) {
  const timer = useRef<ReturnType<typeof setTimeout>>();
  return useCallback((...args: Parameters<T>) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => fn(...args), delay);
  }, [fn, delay]) as T;
}

/* ── Popup CSS ── */
let _css = false;
function injectCSS() {
  if (_css) return; _css = true;
  document.head.insertAdjacentHTML('beforeend', `<style>
.anchor-popup .mapboxgl-popup-content,.poi-popup .mapboxgl-popup-content{background:#1e1f2b;border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:10px 14px;box-shadow:0 8px 24px rgba(0,0,0,0.5);color:#e2e4e9;}
.anchor-popup .mapboxgl-popup-tip,.poi-popup .mapboxgl-popup-tip{border-top-color:#1e1f2b;border-bottom-color:#1e1f2b;}
</style>`);
}


// Real composite score written via setFeatureState; -1 = not yet computed (shown as dim gray).
const SCORE_TOTAL: any = ['coalesce', ['feature-state', 'score'], -1];
// Hard-veto flag written by applyScores — used by the emergency-access layer.
const VETOED: any = ['coalesce', ['feature-state', 'vetoed'], false];
// Closure-cluster size (≥3 = part of a multi-street group of recommended,
// closeable streets). Drives the cyan cluster-outline layer.
const CLUSTER_SIZE: any = ['coalesce', ['feature-state', 'clusterSize'], 0];


/* ═══════════════════════════════════════
   MapComponent
   ═══════════════════════════════════════ */
export const MapComponent = forwardRef<MapHandle, MapComponentProps>(({
  activeScenarios, selectedTimeBin = 'morning', onAnchorClick,
  showTraffic = false, showStreetCenterline = false, showPOI = false, showPlaystreets = false,
  showStreetEvents = false, onStreetEventClick,
  showStreetScore = false, onStreetScoreClick,
  showCloseableOnly = false,
  showTestBBox = false,
  streetAICache,
  allPOIs,
  weatherData,
  phillyEvents,
  holidayInfo,
}, ref) => {
  const ctr = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const loadingAnchors = useRef(false);
  const loadingPOI = useRef(false);
  const loadingPlaystreets = useRef(false);
  const aiCacheRef       = useRef<Map<number, StreetAIData>>(new Map());
  const aiNameIndexRef   = useRef<Map<string, StreetAIData>>(new Map());
  const allPOIsRef       = useRef<POIRecord[]>([]);
  const selectedTimeBinRef = useRef(selectedTimeBin);
  const weatherDataRef     = useRef(weatherData);
  const phillyEventsRef    = useRef<PhillyEvent[]>([]);
  const holidayInfoRef     = useRef<HolidayInfo | undefined>(undefined);
  const showStreetScoreRef = useRef(showStreetScore);
  /**
   * Monotonic abort tag. Bumped on time / weather / POI / AI changes AND on
   * movestart so in-flight batched scoring runs bail out cleanly.
   */
  const scoreVersionRef    = useRef(0);
  /**
   * Per-feature skip cache (objectId → already scored at the current
   * cache generation). Cleared only by clearScoredFeatures — i.e. NOT on
   * pan, so panning back to an already-coloured area is instant.
   */
  const scoredObjectsRef   = useRef<Set<number>>(new Set());
  /** Stable ref to the current applyStreetScores impl (set once map is ready). */
  const applyScoresRef     = useRef<(() => void) | null>(null);
  useEffect(() => { selectedTimeBinRef.current = selectedTimeBin; }, [selectedTimeBin]);
  useEffect(() => { weatherDataRef.current = weatherData; }, [weatherData]);
  useEffect(() => { phillyEventsRef.current = phillyEvents ?? []; }, [phillyEvents]);
  useEffect(() => { holidayInfoRef.current = holidayInfo; }, [holidayInfo]);
  useEffect(() => { showStreetScoreRef.current = showStreetScore; }, [showStreetScore]);

  /** Real cache invalidation: abort in-flight batches, drop the per-feature
   *  skip cache, AND wipe the feature-state that was written by the previous
   *  batch. Without the wipe, lines keep rendering yesterday's colour until
   *  the new batch happens to reach them — which is what produced the
   *  "line is one colour, popup says another, click re-paints" race. */
  function clearScoredFeatures() {
    scoreVersionRef.current++;
    scoredObjectsRef.current.clear();
    if (map.current?.getSource('street-centerline')) {
      map.current.removeFeatureState({
        source:      'street-centerline',
        sourceLayer: 'Street_Centerline-46lvna',
      });
    }
  }

  useEffect(() => {
    const cache = streetAICache ?? new Map();
    aiCacheRef.current = cache;
    const nameIdx = new Map<string, StreetAIData>();
    for (const v of cache.values()) nameIdx.set(v.streetName.toUpperCase().trim(), v);
    aiNameIndexRef.current = nameIdx;
    // Re-score map so AI-adjusted colors match the detail panel
    if (cache.size > 0 && showStreetScoreRef.current) {
      clearScoredFeatures();
      applyScoresRef.current?.();
    }
  }, [streetAICache]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    allPOIsRef.current = allPOIs ?? [];
    // When POIs arrive, re-score street score layer if it's already visible
    if (allPOIs?.length && showStreetScoreRef.current) {
      clearScoredFeatures();   // bumps version → next rAF batch re-scores
      applyScoresRef.current?.();
    }
  }, [allPOIs]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Inject AI scores into Mapbox feature state ── */
  useEffect(() => {
    if (!map.current || !ready || !streetAICache || streetAICache.size === 0) return;
    if (!map.current.getSource('street-centerline')) return;
    streetAICache.forEach((data, featureId) => {
      if (typeof data.aiScore === 'number') {
        map.current!.setFeatureState(
          { source: 'street-centerline', sourceLayer: 'Street_Centerline-46lvna', id: featureId },
          { aiScore: data.aiScore },
        );
      }
    });
  }, [ready, streetAICache]);

  useImperativeHandle(ref, () => ({
    fitToPhiladelphia: () => { map.current?.flyTo({ center: [PHILADELPHIA_CENTER.longitude, PHILADELPHIA_CENTER.latitude], zoom: PHILADELPHIA_CENTER.zoom, duration: 1000 }); },
    // Demo focus point — Sansom St between 34th and 35th, in front of Penn
    // Carey Law (3400 block) and White Dog Cafe (3420). The pilot project's
    // canonical example street.
    flyToPennSansom: () => { map.current?.flyTo({ center: [-75.1928, 39.9534], zoom: 17.5, duration: 1200 }); },
  }));

  useEffect(injectCSS, []);

  /* ── Fetch Anchors ── */
  const fetchAnchors = useCallback(async () => {
    if (!map.current || loadingAnchors.current) return;
    const active = Array.from(activeScenarios);
    if (active.length === 0) {
      const src = map.current?.getSource('anchor-data') as mapboxgl.GeoJSONSource;
      src?.setData(EMPTY_FC); return;
    }
    loadingAnchors.current = true;
    try {
      const b = map.current.getBounds(); if (!b) return;
      const { data, error } = await supabase.rpc('get_anchors_in_bounds', {
        min_lng: b.getWest(), min_lat: b.getSouth(), max_lng: b.getEast(), max_lat: b.getNorth(),
        scenario_ids: active,
      });
      if (error) { console.error('Anchor fetch error:', error); return; }
      const src = map.current?.getSource('anchor-data') as mapboxgl.GeoJSONSource;
      if (src && data) src.setData(data);
    } finally { loadingAnchors.current = false; }
  }, [activeScenarios]);

  /* ── Fetch POI ── */
  const fetchPOI = useCallback(async () => {
    if (!map.current || !showPOI || loadingPOI.current) return;
    loadingPOI.current = true;
    try {
      const b = map.current.getBounds(); if (!b) return;
      const { data, error } = await supabase.rpc('get_poi_in_bounds', {
        min_lng: b.getWest(), min_lat: b.getSouth(), max_lng: b.getEast(), max_lat: b.getNorth(),
      });
      if (error) { console.error('POI fetch error:', error); return; }
      const src = map.current?.getSource('poi-data') as mapboxgl.GeoJSONSource;
      if (src && data) src.setData(data);
    } finally { loadingPOI.current = false; }
  }, [showPOI]);

  /* ── Fetch Playstreets ── */
  const playstreetsLoaded = useRef(false);
  const fetchPlaystreets = useCallback(async () => {
    if (!map.current || !showPlaystreets || loadingPlaystreets.current || playstreetsLoaded.current) return;
    loadingPlaystreets.current = true;
    try {
      const { data, error } = await supabase.rpc('get_playstreets_lines_in_bounds', {
        min_lng: -75.35, min_lat: 39.85, max_lng: -74.95, max_lat: 40.15,
      });
      if (error) { console.error('Playstreets fetch error:', error); return; }
      const src = map.current?.getSource('playstreets-data') as mapboxgl.GeoJSONSource;
      if (src && data) { src.setData(data); playstreetsLoaded.current = true; }
    } finally { loadingPlaystreets.current = false; }
  }, [showPlaystreets]);

  /* ── Fetch Street Events ── */
  const streetEventsLoaded = useRef(false);
  const loadingStreetEvents = useRef(false);
  const fetchStreetEvents = useCallback(async () => {
    if (!map.current || !showStreetEvents || loadingStreetEvents.current || streetEventsLoaded.current) return;
    loadingStreetEvents.current = true;
    try {
      const { data, error } = await supabase.rpc('get_street_events_in_bounds', {
        min_lng: -75.26, min_lat: 39.91, max_lng: -75.03, max_lat: 40.05,
      });
      if (error) { console.error('Street events fetch error:', error); return; }
      const src = map.current?.getSource('street-events-data') as mapboxgl.GeoJSONSource;
      if (src && data) {
        // ~5 m tolerance in degrees to straighten jagged boundary-traced geometries
        src.setData(simplifyFeatureCoords(data as GeoJSON.FeatureCollection, 0.00005));
        streetEventsLoaded.current = true;
      }
    } finally { loadingStreetEvents.current = false; }
  }, [showStreetEvents]);

  const debouncedFetchAnchors = useDebouncedCallback(fetchAnchors, 300);
  const debouncedFetchPOI = useDebouncedCallback(fetchPOI, 300);

  /* ── Init map ── */
  useEffect(() => {
    if (!ctr.current || map.current) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;
    map.current = new mapboxgl.Map({
      container: ctr.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [PHILADELPHIA_CENTER.longitude, PHILADELPHIA_CENTER.latitude],
      zoom: PHILADELPHIA_CENTER.zoom, pitch: 0, bearing: 0,
    });
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
    map.current.addControl(new mapboxgl.ScaleControl({ maxWidth: 100, unit: 'imperial' }), 'bottom-right');
    map.current.on('load', () => setReady(true));
    return () => { map.current?.remove(); map.current = null; };
  }, []);

  /* ══════════════════════════════════════
     Setup sources & layers
     ORDER: street → score → playstreets → poi → ANCHORS (last = on top)
     ══════════════════════════════════════ */
  useEffect(() => {
    if (!map.current || !ready) return;

    /* ── 1. Street Centerline (bottom) ── */
    if (!map.current.getSource('street-centerline')) {
      // promoteId pins the stable GIS objectid as each feature's Mapbox `id`
      // across ALL zoom levels. Without this, Mapbox auto-assigns per-zoom
      // feature IDs independently, so feature-state written at z=17 for one
      // street would randomly collide with a DIFFERENT street's id at z=13 —
      // that's the "green when zoomed out, yellow when zoomed in" glitch.
      map.current.addSource('street-centerline', {
        type: 'vector',
        url:  'mapbox://yangf0304.az4ve7hc',
        promoteId: 'objectid',
      });
      const sm: any[] = ['match', ['get', 'responsibl']];
      for (const [v, c] of STREET_COLORS) sm.push(v, c);
      sm.push(STREET_FALLBACK);
      map.current.addLayer({
        id: 'street-centerline-lines', type: 'line', source: 'street-centerline',
        'source-layer': 'Street_Centerline-46lvna', minzoom: 12,
        filter: ['any', ['>=', ['zoom'], 13.5], ['match', ['get', 'responsibl'], ['STATE'], true, false]],
        layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': sm as any, 'line-width': ['interpolate',['linear'],['zoom'],12,0.8,14,1.8,18,3.5], 'line-opacity': 0.75 },
      });
    }

    /* ── 1b. Street Score layers ── */
    if (!map.current.getLayer('street-score-glow')) {
      // Closure-cluster outline — wide cyan halo drawn UNDER the score line
      // for streets that belong to a multi-street group of closeable, ≥75
      // recommendations. Signals "closing one of these implies coordinating
      // the rest of the cluster" without overriding the underlying score
      // color. Streets not in a cluster render at opacity 0.
      map.current.addLayer({
        id: 'street-cluster-outline', type: 'line', source: 'street-centerline',
        'source-layer': 'Street_Centerline-46lvna', minzoom: 12,
        layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
        filter: ['any', ['>=', ['zoom'], 13.5], ['match', ['get', 'responsibl'], ['STATE'], true, false]],
        paint: {
          'line-color': '#06B6D4',
          'line-width': ['interpolate',['linear'],['zoom'],12,4,14,8,18,14],
          'line-opacity': ['case', ['>=', CLUSTER_SIZE, 3], 0.32, 0] as any,
          'line-blur': 2,
        },
      });

      // Glow for high-scoring streets (>= 80). Mapbox GL disallows
      // feature-state expressions inside a layer filter, so the "score ≥ 80"
      // gate lives in `line-opacity` (which DOES accept feature-state) —
      // below-80 features render at opacity 0 and are effectively invisible.
      // Vetoed streets also render at 0 — a vetoed street is not a candidate
      // regardless of score, so it must not glow as "recommended".
      map.current.addLayer({
        id: 'street-score-glow', type: 'line', source: 'street-centerline',
        'source-layer': 'Street_Centerline-46lvna', minzoom: 12,
        layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
        filter: ['any', ['>=', ['zoom'], 13.5], ['match', ['get', 'responsibl'], ['STATE'], true, false]],
        paint: {
          'line-color': '#10B981',
          'line-width': ['interpolate',['linear'],['zoom'],12,6,14,12,18,22],
          'line-opacity': ['case',
            ['==', VETOED, true], 0,
            ['>=', SCORE_TOTAL, 80], 0.12,
            0,
          ] as any,
          'line-blur': 4,
        },
      });

      // Main score lines — color by total score.
      // When a street is vetoed (emergency access), the score is irrelevant,
      // so this layer fades to 0 and the solid-red `street-veto-blocked`
      // layer takes over. No stacking, no ambiguity.
      map.current.addLayer({
        id: 'street-score-lines', type: 'line', source: 'street-centerline',
        'source-layer': 'Street_Centerline-46lvna', minzoom: 12,
        filter: ['any', ['>=', ['zoom'], 13.5], ['match', ['get', 'responsibl'], ['STATE'], true, false]],
        layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          // Discrete bands matching the sidebar legend exactly — no
          // interpolation, so 86 reads as yellow (75-89), not yellow-green.
          'line-color': [
            'step', SCORE_TOTAL,
            'rgba(100,116,139,0.35)',  // < 0  unscored
            0,  '#EF4444',             // 0–49   red
            50, '#F97316',             // 50–74  orange
            75, '#EAB308',             // 75–89  yellow
            90, '#10B981',             // 90+    green
          ] as any,
          'line-width': ['interpolate',['linear'],['zoom'],12,1.5,14,3,18,5],
          'line-opacity': ['case', ['==', VETOED, true], 0, 0.85] as any,
        },
      });

      // Hard veto: solid magenta replaces the score color entirely. Magenta
      // sits OUTSIDE the score gradient (red→orange→yellow→green), so a
      // vetoed street can never be confused with a low-score street that
      // also paints red. Drawn slightly thicker than the score line for
      // additional emphasis. The score-lines layer renders at opacity 0
      // for these features, so this magenta is the ONLY color visible on
      // emergency-access streets.
      map.current.addLayer({
        id: 'street-veto-blocked', type: 'line', source: 'street-centerline',
        'source-layer': 'Street_Centerline-46lvna', minzoom: 12,
        layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
        filter: ['any', ['>=', ['zoom'], 13.5], ['match', ['get', 'responsibl'], ['STATE'], true, false]],
        paint: {
          'line-color': '#EC4899',
          'line-width': ['interpolate',['linear'],['zoom'],12,2.2,14,4.2,18,6.5],
          'line-opacity': ['case', ['==', VETOED, true], 0.95, 0] as any,
        },
      });

      // Highlight layer for clicked street
      map.current.addLayer({
        id: 'street-score-highlight', type: 'line', source: 'street-centerline',
        'source-layer': 'Street_Centerline-46lvna', minzoom: 12,
        layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#ffffff',
          'line-width': ['interpolate',['linear'],['zoom'],12,4,14,7,18,10],
          'line-opacity': 0.25,
          'line-blur': 2,
        },
        filter: ['==', ['id'], -1], // nothing selected
      });
    }

    if (!map.current.getSource('test-bbox')) {
      map.current.addSource('test-bbox', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: BBOX_FEATURES } as any,
      });

      // Fill — subtle tinted wash
      map.current.addLayer({
        id: 'test-bbox-fill',
        type: 'fill',
        source: 'test-bbox',
        layout: { visibility: 'none' },
        paint: {
          'fill-color': '#6366F1',
          'fill-opacity': 0.07,
        },
      });

      // Glow — wide blurred halo behind the border
      map.current.addLayer({
        id: 'test-bbox-glow',
        type: 'line',
        source: 'test-bbox',
        layout: { visibility: 'none' },
        paint: {
          'line-color': '#818CF8',
          'line-width': 12,
          'line-blur': 10,
          'line-opacity': 0.18,
        },
      });

      // Border — crisp solid line on top
      map.current.addLayer({
        id: 'test-bbox-border',
        type: 'line',
        source: 'test-bbox',
        layout: { visibility: 'none' },
        paint: {
          'line-color': '#a5b4fc',
          'line-width': 1.5,
          'line-opacity': 0.75,
        },
      });

      // Label — title only (sublabel as second line, dimmer)
      map.current.addLayer({
        id: 'test-bbox-label',
        type: 'symbol',
        source: 'test-bbox',
        layout: {
          visibility: 'none',
          'text-field': ['concat', ['get', 'label'], '\n', ['get', 'sublabel']],
          'text-size': 13,
          'text-anchor': 'top-left',
          'text-offset': [0.8, 0.8],
          'text-letter-spacing': 0.04,
        },
        paint: {
          'text-color': '#c7d2fe',
          'text-halo-color': '#0d0e18',
          'text-halo-width': 2.5,
          'text-opacity': 0.9,
        },
      });
    }

    /* ── 2. Playstreets ── */
    if (!map.current.getSource('playstreets-data')) {
      map.current.addSource('playstreets-data', { type: 'geojson', data: EMPTY_FC });
      map.current.addLayer({
        id: 'playstreets-glow', type: 'line', source: 'playstreets-data',
        minzoom: 13,
        layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': PLAYSTREETS_COLOR, 'line-width': ['interpolate',['linear'],['zoom'],13,4,14,10,18,20], 'line-opacity': 0.15, 'line-blur': 4 },
      });
      map.current.addLayer({
        id: 'playstreets-lines', type: 'line', source: 'playstreets-data',
        minzoom: 13,
        layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': PLAYSTREETS_COLOR, 'line-width': ['interpolate',['linear'],['zoom'],10,1.5,14,3,18,6], 'line-opacity': 0.85 },
      });
      map.current.on('mouseenter', 'playstreets-lines', (e) => {
        if (!map.current) return; map.current.getCanvas().style.cursor = 'pointer';
        const feat = e.features?.[0]; if (!feat) return;
        const props = feat.properties || {};
        popupRef.current?.remove();
        popupRef.current = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 12, className: 'poi-popup' })
          .setLngLat(e.lngLat)
          .setHTML(`<div style="font-family:'Plus Jakarta Sans',sans-serif;padding:2px 0;">
            <div style="font-weight:700;font-size:13px;color:#f1f5f9;margin-bottom:3px;">🛝 ${props.block_name||'Playstreet'}</div>
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <span style="width:8px;height:8px;border-radius:50%;background:${PLAYSTREETS_COLOR};display:inline-block;"></span>
              <span style="font-size:11px;color:#94a3af;">Playstreet</span>
              <span style="font-size:10px;color:#64748b;">· ${props.year||''} · ${props.zip_code||''}</span>
            </div>
            ${props.street_name?`<div style="font-size:10px;color:#64748b;margin-top:2px;">Matched: ${props.street_name} (${props.responsibl||''})</div>`:''}</div>`)
          .addTo(map.current);
      });
      map.current.on('mouseleave', 'playstreets-lines', () => { if (map.current) map.current.getCanvas().style.cursor = ''; popupRef.current?.remove(); });
    }

    /* ── 3. Street Events (Center City Open Streets) ── */
    if (!map.current.getSource('street-events-data')) {
      map.current.addSource('street-events-data', { type: 'geojson', data: EMPTY_FC, tolerance: 1.0 });
      map.current.addLayer({
        id: 'street-events-glow', type: 'line', source: 'street-events-data',
        minzoom: 12,
        layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': STREET_EVENTS_COLOR, 'line-width': ['interpolate',['linear'],['zoom'],12,6,14,14,18,24], 'line-opacity': 0.18, 'line-blur': 5 },
      });
      map.current.addLayer({
        id: 'street-events-lines', type: 'line', source: 'street-events-data',
        minzoom: 12,
        layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': STREET_EVENTS_COLOR, 'line-width': ['interpolate',['linear'],['zoom'],10,2,14,4,18,7], 'line-opacity': 0.9 },
      });
      map.current.on('mouseenter', 'street-events-lines', (e) => {
        if (!map.current) return; map.current.getCanvas().style.cursor = 'pointer';
        const feat = e.features?.[0]; if (!feat) return;
        const p = feat.properties || {};
        popupRef.current?.remove();
        popupRef.current = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 12, className: 'poi-popup' })
          .setLngLat(e.lngLat)
          .setHTML(`<div style="font-family:'Plus Jakarta Sans',sans-serif;padding:2px 0;">
            <div style="font-weight:700;font-size:13px;color:#f1f5f9;margin-bottom:3px;">🏙 ${p.street_name || 'Open Street'}</div>
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <span style="width:8px;height:8px;border-radius:50%;background:${STREET_EVENTS_COLOR};display:inline-block;"></span>
              <span style="font-size:11px;color:#94a3af;">${p.series_name || 'Open Streets'}</span>
            </div>
            <div style="font-size:10px;color:#64748b;margin-top:3px;">${p.location_desc || ''}</div>
            <div style="font-size:10px;color:#64748b;">${p.event_date || ''} · ${p.day_of_week || ''} · ${p.open_time||''}–${p.close_time||''}</div>
            ${p.notes ? `<div style="font-size:10px;color:#f59e0b;margin-top:2px;">${p.notes}</div>` : ''}
          </div>`)
          .addTo(map.current);
      });
      map.current.on('mouseleave', 'street-events-lines', () => { if (map.current) map.current.getCanvas().style.cursor = ''; popupRef.current?.remove(); });
      map.current.on('click', 'street-events-lines', (e) => {
        if (!onStreetEventClick) return;
        const feat = e.features?.[0]; if (!feat) return;
        const p = feat.properties || {};
        const coords: number[][] = (feat.geometry as GeoJSON.LineString).coordinates;
        const mid = coords[Math.floor(coords.length / 2)];

        // Look up AI data by street name (case-insensitive)
        const ai = aiNameIndexRef.current.get((p.street_name ?? '').toUpperCase().trim());

        onStreetEventClick({
          streetName:   p.street_name   ?? '',
          seriesName:   p.series_name   ?? '',
          locationDesc: p.location_desc ?? '',
          neighborhood: p.neighborhood  ?? '',
          eventDate:    p.event_date    ?? '',
          dayOfWeek:    p.day_of_week   ?? '',
          openTime:     p.open_time     ?? '',
          closeTime:    p.close_time    ?? '',
          notes:        p.notes         ?? null,
          lat:          mid[1],
          lng:          mid[0],
          aiScore:      ai?.aiScore,
          keywords:     ai?.keywords,
        });
        e.originalEvent.stopPropagation();
      });
    }

    /* ── 4. POI ── */
    if (!map.current.getSource('poi-data')) {
      map.current.addSource('poi-data', { type: 'geojson', data: EMPTY_FC });
      const pm: any[] = ['match', ['get', 'poi_category']];
      for (const [cat, color] of POI_COLORS) pm.push(cat, color);
      pm.push(POI_FALLBACK);
      map.current.addLayer({
        id: 'poi-circles', type: 'circle', source: 'poi-data',
        layout: { visibility: 'none' },
        paint: { 'circle-radius': ['interpolate',['linear'],['zoom'],10,2,14,4.5,18,8], 'circle-color': pm as any, 'circle-opacity': 0.8, 'circle-stroke-width': 1, 'circle-stroke-color': 'rgba(0,0,0,0.3)' },
      });
      map.current.on('mouseenter', 'poi-circles', (e) => {
        if (!map.current) return; map.current.getCanvas().style.cursor = 'pointer';
        const feat = e.features?.[0]; if (!feat) return;
        const props = feat.properties || {};
        const coords = (feat.geometry as any).coordinates.slice() as [number,number];
        const cat = props.poi_category || '';
        const color = POI_COLORS.find(([c]) => c === cat)?.[1] || POI_FALLBACK;
        popupRef.current?.remove();
        popupRef.current = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 12, className: 'poi-popup' })
          .setLngLat(coords)
          .setHTML(`<div style="font-family:'Plus Jakarta Sans',sans-serif;padding:2px 0;">
            <div style="font-weight:700;font-size:13px;color:#f1f5f9;margin-bottom:3px;">${props.name||'Unnamed'}</div>
            <div style="display:flex;align-items:center;gap:6px;">
              <span style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block;"></span>
              <span style="font-size:11px;color:#94a3af;">${cat}</span>
              <span style="font-size:10px;color:#64748b;">· ${props.amenity||''}</span>
            </div></div>`)
          .addTo(map.current);
      });
      map.current.on('mouseleave', 'poi-circles', () => { if (map.current) map.current.getCanvas().style.cursor = ''; popupRef.current?.remove(); });
    }

    /* ── 4. ANCHOR layers (LAST = renders on TOP) ── */
    if (!map.current.getSource('anchor-data')) {
      map.current.addSource('anchor-data', { type: 'geojson', data: EMPTY_FC });
      const cm: any[] = ['match', ['get', 'scenario_id']];
      for (const s of scenarioConfigs) cm.push(s.id, s.color);
      cm.push('#94A3B8');

      // Glow
      map.current.addLayer({
        id: 'anchor-glow', type: 'circle', source: 'anchor-data',
        paint: { 'circle-radius': ['interpolate',['linear'],['zoom'],10,6,14,14,18,24], 'circle-color': cm as any, 'circle-opacity': 0.15, 'circle-blur': 1 },
      });
      // Main dot
      map.current.addLayer({
        id: 'anchor-circles', type: 'circle', source: 'anchor-data',
        paint: {
          'circle-radius': ['interpolate',['linear'],['zoom'],10,3,14,6,18,10],
          'circle-color': cm as any, 'circle-opacity': 0.9,
          'circle-stroke-width': ['interpolate',['linear'],['zoom'],10,1,14,2,18,2.5],
          'circle-stroke-color': 'rgba(255,255,255,0.7)',
        },
      });

      // Hover popup
      map.current.on('mouseenter', 'anchor-circles', (e) => {
        if (!map.current) return; map.current.getCanvas().style.cursor = 'pointer';
        const feat = e.features?.[0]; if (!feat) return;
        const props = feat.properties || {};
        const coords = (feat.geometry as any).coordinates.slice() as [number,number];
        const sid = props.scenario_id || '';
        const pal = SCENARIO_PALETTE[sid];
        const cfg = scenarioConfigs.find(s => s.id === sid);
        popupRef.current?.remove();
        popupRef.current = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 12, className: 'anchor-popup' })
          .setLngLat(coords)
          .setHTML(`<div style="font-family:'Plus Jakarta Sans',sans-serif;padding:2px 0;">
            <div style="font-weight:700;font-size:13px;color:#f1f5f9;margin-bottom:3px;">${props.name||'Unnamed'}</div>
            <div style="display:flex;align-items:center;gap:6px;">
              <span style="width:8px;height:8px;border-radius:50%;background:${pal?.color||'#94A3B8'};display:inline-block;"></span>
              <span style="font-size:11px;color:#94a3af;">${cfg?.icon||''} ${cfg?.name||sid}</span>
              <span style="font-size:10px;color:#64748b;">· ${props.amenity||''}</span>
            </div></div>`)
          .addTo(map.current);
      });
      map.current.on('mouseleave', 'anchor-circles', () => { if (map.current) map.current.getCanvas().style.cursor = ''; popupRef.current?.remove(); });

      // Click → detail panel
      map.current.on('click', 'anchor-circles', (e) => {
        const feat = e.features?.[0]; if (!feat || !onAnchorClick) return;
        const props = feat.properties || {};
        const coords = (feat.geometry as any).coordinates as [number,number];
        let meta = props.metadata;
        if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch { meta = {}; } }
        onAnchorClick({
          id: props.id, name: props.name || 'Unnamed', scenarioId: props.scenario_id as any,
          amenity: props.amenity || '', longitude: coords[0], latitude: coords[1],
          sourceTable: props.source_table, metadata: meta,
        });
      });
    }

    /* ── Street Score interactions ── */
    // Hover on score layer
    map.current.on('mouseenter', 'street-score-lines', (e) => {
      if (!map.current || !showStreetScore) return;
      map.current.getCanvas().style.cursor = 'pointer';
      const feat = e.features?.[0]; if (!feat) return;
      const props = feat.properties || {};
      const fid      = typeof feat.id === 'number' ? feat.id : 0;
      const objectId = props.objectid != null ? Number(props.objectid) : fid;

      // Single source of truth: read the values applyScores wrote to
      // feature-state. Fall back to this tile's centroid only when the idle
      // batch hasn't reached this feature yet.
      const state = map.current.getFeatureState({
        source: 'street-centerline', sourceLayer: 'Street_Centerline-46lvna', id: fid,
      }) as {
        commercial?: number; community?: number; mobility?: number;
        fsiLat?: number; fsiLng?: number; edu?: EducationBreakdown;
      } | undefined;

      let commercial: number, community: number, mobility: number, fsiLat: number, fsiLng: number;
      let eduBreakdown: EducationBreakdown | undefined;
      let fromFallback = false;
      if (state
          && typeof state.commercial === 'number'
          && typeof state.community  === 'number'
          && typeof state.mobility   === 'number'
          && typeof state.fsiLat     === 'number'
          && typeof state.fsiLng     === 'number') {
        commercial   = state.commercial;
        community    = state.community;
        mobility     = state.mobility;
        fsiLat       = state.fsiLat;
        fsiLng       = state.fsiLng;
        eduBreakdown = state.edu;
      } else {
        const coords = getFeatureCoords(feat);
        if (!coords) return;
        const fsi = computePoiFSI(coords, allPOIsRef.current);
        if (!fsi) return;  // POIs not loaded yet; skip tooltip
        const [cLng, cLat] = centroidOf(coords);
        commercial   = fsi.commercial;
        community    = fsi.community;
        mobility     = fsi.mobility;
        fsiLat       = cLat;
        fsiLng       = cLng;
        eduBreakdown = countEducationSubtypes(coords, allPOIsRef.current);
        fromFallback = true;
      }

      const social = Math.max(community, mobility);
      const scores = generateStreetScores(
        objectId, props.stname,
        { commercial, community, mobility, social, total: Math.max(commercial, community) },
        props.responsibl,
        eduBreakdown,
      );

      // 叠加 AI 感官数据（如果有）— name > objectid
      const ai = aiNameIndexRef.current.get((props.stname ?? '').toUpperCase().trim())
              ?? aiCacheRef.current.get(objectId);

      // 交通 + 天气 + 活动 + 节日修正 — anchored to the SAME point applyScores used.
      const tMod  = getTrafficModifier(props.stname, props.responsibl, selectedTimeBinRef.current);
      const wMod  = weatherDataRef.current?.modifier ?? 1.0;
      const { mod: eMod } = getEventModifier(fsiLat, fsiLng, phillyEventsRef.current);
      const hMod  = holidayInfoRef.current?.modifier ?? 1.0;

      // 综合 FSI
      scores.total = computeCompositeTotal(scores.total, ai?.aiScore, tMod, wMod, eMod, hMod);
      const color  = getScoreColor(scores.total);

      // If we got here via fallback, persist the result so the line colour
      // immediately matches the popup AND the next idle batch skips this
      // feature. First-touch wins; nothing recomputes afterwards.
      if (fromFallback) {
        void social; // keep for back-compat debuggers
        map.current.setFeatureState(
          { source: 'street-centerline', sourceLayer: 'Street_Centerline-46lvna', id: fid },
          { score: scores.total, commercial, community, mobility, fsiLat, fsiLng, edu: eduBreakdown },
        );
        scoredObjectsRef.current.add(objectId);
      }

      const dispName = ai?.streetName || props.stname || `Street #${objectId}`;
      const kwHtml   = ai?.keywords?.length
        ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:5px;">${
            ai.keywords.map(k =>
              `<span style="font-size:10px;padding:1px 7px;border-radius:99px;` +
              `background:rgba(99,102,241,0.18);color:#a5b4fc;border:1px solid rgba(99,102,241,0.25);">${k}</span>`
            ).join('')
          }</div>`
        : '';

      popupRef.current?.remove();
      popupRef.current = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 12, className: 'poi-popup' })
        .setLngLat(e.lngLat)
        .setHTML(`<div style="font-family:'Plus Jakarta Sans',sans-serif;padding:2px 0;">
          <div style="font-weight:700;font-size:13px;color:#f1f5f9;margin-bottom:3px;">${dispName}</div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:18px;font-weight:800;color:${color};">${scores.total}</span>
            <span style="font-size:11px;color:#94a3af;">Flexibility Score</span>
            ${scores.total >= 90 ? '<span style="font-size:10px;color:#6EE7B7;font-weight:700;">★ Recommended</span>' : ''}
          </div>${kwHtml}</div>`)
        .addTo(map.current);
    });
    map.current.on('mouseleave', 'street-score-lines', () => {
      if (!map.current || !showStreetScore) return;
      map.current.getCanvas().style.cursor = '';
      popupRef.current?.remove();
    });

    // Click on score layer → detail panel (skip if an Open Streets segment was clicked)
    map.current.on('click', 'street-score-lines', (e) => {
      if (!showStreetScore || !onStreetScoreClick) return;
      if (e.originalEvent.defaultPrevented) return;
      const eventsAtPoint = map.current!.queryRenderedFeatures(e.point, { layers: ['street-events-lines'] });
      if (eventsAtPoint.length > 0) return;
      const feat = e.features?.[0]; if (!feat) return;
      const props = feat.properties || {};
      const fid      = typeof feat.id === 'number' ? feat.id : 0;
      const objectId = props.objectid != null ? Number(props.objectid) : fid;

      // Read the canonical values applyScores wrote to feature-state — those
      // ARE the numbers the line colour was drawn from. Fall back to this
      // tile's centroid only if the feature hasn't been batch-scored yet.
      const state = map.current!.getFeatureState({
        source: 'street-centerline', sourceLayer: 'Street_Centerline-46lvna', id: fid,
      }) as {
        commercial?: number; community?: number; mobility?: number;
        fsiLat?: number; fsiLng?: number; edu?: EducationBreakdown;
      } | undefined;

      let commercial: number, community: number, mobility: number, fsiLat: number, fsiLng: number;
      let eduBreakdown: EducationBreakdown | undefined;
      if (state
          && typeof state.commercial === 'number'
          && typeof state.community  === 'number'
          && typeof state.mobility   === 'number'
          && typeof state.fsiLat     === 'number'
          && typeof state.fsiLng     === 'number') {
        commercial   = state.commercial;
        community    = state.community;
        mobility     = state.mobility;
        fsiLat       = state.fsiLat;
        fsiLng       = state.fsiLng;
        eduBreakdown = state.edu;
      } else {
        const coords = getFeatureCoords(feat);
        if (!coords) return;
        const fsi = computePoiFSI(coords, allPOIsRef.current);
        if (!fsi) return;  // POIs not loaded yet; skip panel
        const [cLng, cLat] = centroidOf(coords);
        commercial   = fsi.commercial;
        community    = fsi.community;
        mobility     = fsi.mobility;
        fsiLat       = cLat;
        fsiLng       = cLng;
        eduBreakdown = countEducationSubtypes(coords, allPOIsRef.current);
      }

      const social = Math.max(community, mobility);
      const scores = generateStreetScores(
        objectId, props.stname,
        { commercial, community, mobility, social, total: Math.max(commercial, community) },
        props.responsibl,
        eduBreakdown,
      );

      // Street View should reflect what the user actually clicked on.
      scores.lat = e.lngLat.lat;
      scores.lng = e.lngLat.lng;

      // Overlay AI sensory data if available — name lookup > objectid lookup
      const ai = aiNameIndexRef.current.get((props.stname ?? '').toUpperCase().trim())
              ?? aiCacheRef.current.get(objectId);
      if (ai) {
        scores.streetName = ai.streetName || scores.streetName;
        scores.aiScore    = ai.aiScore;
        scores.keywords   = ai.keywords;
        // AI lat/lng is more precise (centroid of the analysed segment)
        scores.lat        = ai.lat ?? scores.lat;
        scores.lng        = ai.lng ?? scores.lng;
      }

      // 交通 + 天气 + 活动 + 节日修正 — anchored to the SAME point applyScores used.
      const tMod = getTrafficModifier(props.stname, props.responsibl, selectedTimeBinRef.current);
      const wMod = weatherDataRef.current?.modifier ?? 1.0;
      const { mod: eMod, label: eLabel } = getEventModifier(fsiLat, fsiLng, phillyEventsRef.current);
      const holiday = holidayInfoRef.current;
      const hMod    = holiday?.modifier ?? 1.0;

      scores.trafficMod   = tMod;
      scores.trafficLabel = trafficLabel(tMod);
      scores.weatherMod   = wMod;
      scores.weatherLabel = weatherData?.label;
      scores.weatherIcon  = weatherData?.icon;
      if (eMod > 1.0) {
        scores.eventsMod   = eMod;
        scores.eventsLabel = eLabel ?? undefined;
      }
      if (hMod > 1.0) {
        scores.holidayMod   = hMod;
        scores.holidayLabel = holiday?.name;
        scores.holidayIcon  = holiday?.icon;
      }

      // 综合 FSI
      scores.total = computeCompositeTotal(scores.total, scores.aiScore, tMod, wMod, eMod, hMod);

      // Pull emergency veto + cluster info from feature-state if applyScores
      // has run; otherwise compute the emergency veto on-demand so the panel
      // banner is always correct. (Cluster info requires viewport context, so
      // it stays unset when the batch hasn't run yet.)
      const safetyState = state as {
        vetoReason?:  EmergencyAmenity | null;
        vetoDist?:    number | null;
        clusterSize?: number | null;
      } | undefined;
      if (safetyState?.vetoReason) {
        scores.vetoReason    = safetyState.vetoReason;
        scores.vetoDistanceM = safetyState.vetoDist ?? undefined;
      } else {
        const coordsForVeto = getFeatureCoords(feat);
        if (coordsForVeto && allPOIsRef.current.length) {
          const v = getEmergencyVeto(coordsForVeto, allPOIsRef.current);
          if (v.vetoed) {
            scores.vetoReason    = v.reason;
            scores.vetoDistanceM = v.distanceM;
          }
        }
      }
      if (safetyState?.clusterSize != null) {
        scores.clusterSize = safetyState.clusterSize;
      }

      // Push the full state (total + sub-scores + anchor) so the line picks up
      // the new colour without waiting for the next idle, and subsequent hovers
      // keep reading the same numbers.
      if (fid != null) {
        void social; // legacy derived value; feature-state carries its components
        map.current?.setFeatureState(
          { source: 'street-centerline', sourceLayer: 'Street_Centerline-46lvna', id: fid },
          {
            score: scores.total, commercial, community, mobility, fsiLat, fsiLng, edu: eduBreakdown,
            vetoed:     scores.vetoReason != null,
            vetoReason: scores.vetoReason ?? null,
            vetoDist:   scores.vetoDistanceM ?? null,
          },
        );
        scoredObjectsRef.current.add(objectId);
      }

      if (map.current?.getLayer('street-score-highlight')) {
        map.current.setFilter('street-score-highlight', ['==', ['id'], fid]);
      }
      onStreetScoreClick(scores);
    });

  }, [ready, onAnchorClick, showStreetScore, onStreetScoreClick]);

  /* ── Map move → refetch ── */
  useEffect(() => {
    if (!map.current || !ready) return;
    const handler = () => { if (activeScenarios.size > 0) debouncedFetchAnchors(); if (showPOI) debouncedFetchPOI(); };
    map.current.on('moveend', handler);
    return () => { map.current?.off('moveend', handler); };
  }, [ready, activeScenarios, showPOI, debouncedFetchAnchors, debouncedFetchPOI]);

  /* ── Toggle anchors ── */
  useEffect(() => { if (map.current && ready) fetchAnchors(); }, [ready, activeScenarios, fetchAnchors]);

  /* ── Toggle POI ── */
  useEffect(() => {
    if (!map.current || !ready) return;
    if (map.current.getLayer('poi-circles')) map.current.setLayoutProperty('poi-circles', 'visibility', showPOI ? 'visible' : 'none');
    if (showPOI) fetchPOI(); else { popupRef.current?.remove(); (map.current.getSource('poi-data') as mapboxgl.GeoJSONSource)?.setData(EMPTY_FC); }
  }, [ready, showPOI, fetchPOI]);

  /* ── Toggle Streets ── */
  useEffect(() => {
    if (!map.current || !ready) return;
    if (!map.current.getLayer('street-centerline-lines')) return;
    // When the score layer is on, hide the ownership-coloured centerline so
    // it can never blend through and dirty the score colours.
    const visible = showStreetCenterline && !showStreetScore;
    map.current.setLayoutProperty('street-centerline-lines', 'visibility', visible ? 'visible' : 'none');
  }, [ready, showStreetCenterline, showStreetScore]);

  /* ── Real street scores via feature-state ── */
  // Register map idle listener once; apply scores for newly visible features.
  useEffect(() => {
    if (!ready || !map.current) return;

    function applyScores() {
      if (!map.current || !allPOIsRef.current.length) return;
      if (!map.current.getLayer('street-score-lines')) return;

      const features = map.current.queryRenderedFeatures({ layers: ['street-score-lines'] });
      const version  = scoreVersionRef.current;

      // Vector tiles clip each street into multiple partial features — one per
      // tile the street crosses. If we score each partial separately, the last
      // tile processed wins and the same fid can flip between tile centroids
      // on every pan. Group by fid and merge the coordinates so each feature
      // gets ONE deterministic viewport-anchored centroid per idle.
      type Group = { coords: [number, number][]; props: any };
      const byFid = new Map<number, Group>();
      for (const feat of features) {
        const rawId = feat.id;
        if (rawId == null) continue;
        const fid = typeof rawId === 'number' ? rawId : parseInt(String(rawId), 10);
        if (isNaN(fid)) continue;

        const geom = (feat.geometry as any);
        let coords: [number, number][] = [];
        if      (geom?.type === 'LineString')      coords = geom.coordinates;
        else if (geom?.type === 'MultiLineString') coords = (geom.coordinates as [number, number][][]).flat();
        if (!coords.length) continue;

        const g = byFid.get(fid);
        if (g) g.coords.push(...coords);
        else byFid.set(fid, { coords: coords.slice(), props: feat.properties || {} });
      }

      // ── Pass 1 ─ compute raw sums + centroid for EVERY viewport feature
      // (including already-scored ones — they provide the neighbourhood
      // context for Pass 2's prominence comparison).
      interface FeatureData {
        fid:       number;
        objectId:  number;
        coords:    [number, number][];
        props:     any;
        centroid:  [number, number];   // [lng, lat]
        rawC:      number;
        rawCo:     number;
        rawM:      number;
        vetoReason?: EmergencyAmenity; // emergency-services veto
        vetoDist?:   number;
        // Filled in during the score loop, then read by the post-batch
        // cluster pass. Defaulted to -1 so unscored features are excluded.
        score:     number;
      }
      const pois = allPOIsRef.current;
      const featureData: FeatureData[] = [];
      for (const [fid, { coords, props }] of byFid) {
        const objectId = props.objectid != null ? Number(props.objectid) : fid;
        const centroid = centroidOf(coords);
        const veto     = getEmergencyVeto(coords, pois);
        featureData.push({
          fid,
          objectId,
          coords,
          props,
          centroid,
          rawC:  rawSumAlongStreet(coords, pois, 'commercial'),
          rawCo: rawSumAlongStreet(coords, pois, 'community'),
          rawM:  rawSumAlongStreet(coords, pois, 'mobility'),
          vetoReason: veto.vetoed ? veto.reason : undefined,
          vetoDist:   veto.vetoed ? veto.distanceM : undefined,
          score: -1,
        });
      }

      // Spatial grid keyed by ~400m cells so each feature can cheaply query
      // its neighbourhood (the 3×3 surrounding cells ≈ 1.2 km radius).
      const CELL_DEG = 0.004;   // ≈ 440 m at Philly latitude
      const grid = new Map<string, FeatureData[]>();
      for (const fd of featureData) {
        const cx = Math.floor(fd.centroid[0] / CELL_DEG);
        const cy = Math.floor(fd.centroid[1] / CELL_DEG);
        const key = `${cx}_${cy}`;
        const cell = grid.get(key);
        if (cell) cell.push(fd);
        else grid.set(key, [fd]);
      }
      const neighboursOf = (fd: FeatureData): FeatureData[] => {
        const cx = Math.floor(fd.centroid[0] / CELL_DEG);
        const cy = Math.floor(fd.centroid[1] / CELL_DEG);
        const out: FeatureData[] = [];
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
          const cell = grid.get(`${cx + dx}_${cy + dy}`);
          if (cell) out.push(...cell);
        }
        return out;
      };
      const median = (arr: number[]): number => {
        if (arr.length === 0) return 0;
        const s = [...arr].sort((a, b) => a - b);
        return s[Math.floor(s.length / 2)];
      };
      const prominenceBonus = (raw: number, neighbourRaws: number[], dim: Dim): number => {
        const cap = PROMINENCE_BONUS[dim];
        if (cap === 0 || neighbourRaws.length <= 1) return 0;
        const med = median(neighbourRaws);
        if (raw <= med) return 0;
        // Local scale: in sparse areas the scale floors at 0.3; in dense
        // neighbourhoods it grows with the median so only really dominant
        // features earn the full cap.
        const scale = Math.max(0.3, med * 2);
        const dominance = Math.min(1, (raw - med) / scale);
        return cap * dominance;
      };

      // ── Pass 2 ─ batched rAF scoring with prominence bonus layered on top.
      const BATCH = 30;
      let idx = 0;
      function processBatch() {
        if (!map.current || scoreVersionRef.current !== version) return;

        const end = Math.min(idx + BATCH, featureData.length);
        for (; idx < end; idx++) {
          const fd = featureData[idx];
          // Already scored at this cache generation → skip writeback.
          if (scoredObjectsRef.current.has(fd.objectId)) continue;

          const nbrs = neighboursOf(fd);
          const nbrC  = nbrs.map(n => n.rawC);
          const nbrCo = nbrs.map(n => n.rawCo);
          const nbrM  = nbrs.map(n => n.rawM);

          // Per-dim score = saturated absolute + local-leader bonus.
          const commercial = Math.min(100,
            saturate(fd.rawC,  'commercial') + prominenceBonus(fd.rawC,  nbrC,  'commercial'));
          const community  = Math.min(100,
            saturate(fd.rawCo, 'community')  + prominenceBonus(fd.rawCo, nbrCo, 'community'));
          const mobility   = Math.min(100,
            saturate(fd.rawM,  'mobility')   + prominenceBonus(fd.rawM,  nbrM,  'mobility'));

          const mlTotal    = Math.max(commercial, community);   // mobility excluded
          const [lng, lat] = fd.centroid;
          const props      = fd.props;
          const ai = aiNameIndexRef.current.get((props.stname ?? '').toUpperCase().trim())
                  ?? aiCacheRef.current.get(fd.objectId);
          const score = computeCompositeTotal(
            mlTotal, ai?.aiScore,
            getTrafficModifier(props.stname, props.responsibl, selectedTimeBinRef.current),
            weatherDataRef.current?.modifier ?? 1.0,
            getEventModifier(lat, lng, phillyEventsRef.current).mod,
            holidayInfoRef.current?.modifier ?? 1.0,
          );
          const eduBreakdown = countEducationSubtypes(fd.coords, pois);

          fd.score = score;
          map.current.setFeatureState(
            { source: 'street-centerline', sourceLayer: 'Street_Centerline-46lvna', id: fd.fid },
            {
              score,
              commercial,
              community,
              mobility,
              fsiLat: lat,
              fsiLng: lng,
              edu:    eduBreakdown,
              vetoed:        fd.vetoReason != null,
              vetoReason:    fd.vetoReason ?? null,
              vetoDist:      fd.vetoDist ?? null,
            },
          );
          scoredObjectsRef.current.add(fd.objectId);
        }

        if (idx < featureData.length) {
          requestAnimationFrame(processBatch);
        } else {
          applyClusters();
        }
      }

      // ── Post-batch cluster pass ─────────────────────────────────────
      // Runs ONCE after every viewport feature has a final score. Groups
      // closeable, ≥75-score, non-vetoed streets that share intersections,
      // and writes the cluster size back to feature-state. The map's
      // cluster-outline layer reacts via the CLUSTER_SIZE expression.
      function applyClusters() {
        if (!map.current) return;
        if (scoreVersionRef.current !== version) return;

        const candidates: ClusterCandidate[] = [];
        // Also collect all viewport fids so we can clear stale cluster
        // state on streets that USED to be in a cluster but no longer are.
        const viewportFids: number[] = [];
        for (const fd of featureData) {
          viewportFids.push(fd.fid);
          if (fd.score < 0) continue;
          candidates.push({
            fid:          fd.fid,
            coords:       fd.coords,
            score:        fd.score,
            closeability: getCloseability(fd.props.responsibl ?? ''),
            vetoed:       fd.vetoReason != null,
          });
        }

        const { clusterByFid } = findClusters(candidates);

        for (const fid of viewportFids) {
          const info = clusterByFid.get(fid);
          map.current.setFeatureState(
            { source: 'street-centerline', sourceLayer: 'Street_Centerline-46lvna', id: fid },
            {
              clusterSize: info ? info.size : null,
              clusterId:   info ? info.clusterId : null,
            },
          );
        }
      }

      requestAnimationFrame(processBatch);
    }

    applyScoresRef.current = applyScores;
    const onIdle      = () => { if (showStreetScoreRef.current) applyScores(); };
    // Any new user interaction (drag / zoom) bumps the version so the
    // scheduled rAF batches notice and bail out — the next idle restarts
    // scoring with the up-to-date viewport.
    const onMoveStart = () => { scoreVersionRef.current++; };
    map.current.on('idle',      onIdle);
    map.current.on('movestart', onMoveStart);
    return () => {
      map.current?.off('idle',      onIdle);
      map.current?.off('movestart', onMoveStart);
      applyScoresRef.current = null;
    };
  }, [ready]);

  // Re-score all visible features when time / weather / events / holiday change.
  useEffect(() => {
    if (!ready || !showStreetScore || !map.current) return;
    clearScoredFeatures();
    applyScoresRef.current?.();
  }, [ready, showStreetScore, selectedTimeBin, weatherData, phillyEvents, holidayInfo]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Toggle Street Score ── */
  useEffect(() => {
    if (!map.current || !ready) return;
    const vis = showStreetScore ? 'visible' : 'none';
    for (const lid of ['street-score-lines', 'street-score-glow', 'street-score-highlight', 'street-veto-blocked', 'street-cluster-outline']) {
      if (map.current.getLayer(lid)) map.current.setLayoutProperty(lid, 'visibility', vis);
    }
    if (showStreetScore) {
      // Apply real scores immediately when layer turns on
      applyScoresRef.current?.();
    } else {
      if (map.current.getLayer('street-score-highlight')) map.current.setFilter('street-score-highlight', ['==', ['id'], -1]);
      popupRef.current?.remove();
    }
  }, [ready, showStreetScore]);

  /* ── Toggle Closeable-Only filter ──
     Swaps the filter on score / glow / centerline layers so non-closeable
     streets (STATE / PRIVATE / AIRPORT / STRICKEN / ...) drop out entirely.
     One-shot quick filter for "what could we actually activate?" */
  useEffect(() => {
    if (!map.current || !ready) return;

    const baseLines: any  = ['any',
      ['>=', ['zoom'], 13.5],
      ['match', ['get', 'responsibl'], ['STATE'], true, false],
    ];
    const closeable: any = ['all',
      ['>=', ['zoom'], 13.5],
      ['match', ['get', 'responsibl'], CLOSEABLE_RESPONSIBLES, true, false],
    ];
    const linesFilter = showCloseableOnly ? closeable : baseLines;

    if (map.current.getLayer('street-score-lines'))      map.current.setFilter('street-score-lines',      linesFilter);
    if (map.current.getLayer('street-centerline-lines')) map.current.setFilter('street-centerline-lines', linesFilter);
    if (map.current.getLayer('street-veto-blocked'))     map.current.setFilter('street-veto-blocked',     linesFilter);
    if (map.current.getLayer('street-cluster-outline'))  map.current.setFilter('street-cluster-outline',  linesFilter);
    if (map.current.getLayer('street-score-glow')) {
      // Feature-state can't go in filter; the ≥80 gate is enforced by the
      // `line-opacity` case expression in the glow layer's paint instead.
      map.current.setFilter('street-score-glow', linesFilter);
    }
  }, [ready, showCloseableOnly]);

  /* ── Toggle Playstreets ── */
  useEffect(() => {
    if (!map.current || !ready) return;
    const vis = showPlaystreets ? 'visible' : 'none';
    if (map.current.getLayer('playstreets-lines')) map.current.setLayoutProperty('playstreets-lines', 'visibility', vis);
    if (map.current.getLayer('playstreets-glow')) map.current.setLayoutProperty('playstreets-glow', 'visibility', vis);
    if (showPlaystreets) fetchPlaystreets();
    else { popupRef.current?.remove(); playstreetsLoaded.current = false; (map.current.getSource('playstreets-data') as mapboxgl.GeoJSONSource)?.setData(EMPTY_FC); }
  }, [ready, showPlaystreets, fetchPlaystreets]);

  /* ── Toggle Street Events ── */
  useEffect(() => {
    if (!map.current || !ready) return;
    const vis = showStreetEvents ? 'visible' : 'none';
    if (map.current.getLayer('street-events-lines')) map.current.setLayoutProperty('street-events-lines', 'visibility', vis);
    if (map.current.getLayer('street-events-glow')) map.current.setLayoutProperty('street-events-glow', 'visibility', vis);
    if (showStreetEvents) fetchStreetEvents();
    else { popupRef.current?.remove(); streetEventsLoaded.current = false; (map.current.getSource('street-events-data') as mapboxgl.GeoJSONSource)?.setData(EMPTY_FC); }
  }, [ready, showStreetEvents, fetchStreetEvents]);

  /* ── Toggle Test BBox ── */
  useEffect(() => {
    if (!map.current || !ready) return;
    const vis = showTestBBox ? 'visible' : 'none';
    for (const lid of ['test-bbox-fill', 'test-bbox-glow', 'test-bbox-border', 'test-bbox-label']) {
      if (map.current.getLayer(lid)) map.current.setLayoutProperty(lid, 'visibility', vis);
    }
  }, [ready, showTestBBox]);

  /* ── Traffic ── */
  useEffect(() => {
    if (!map.current || !ready) return;
    if (showTraffic) {
      if (!map.current.getSource('mapbox-traffic')) map.current.addSource('mapbox-traffic', { type: 'vector', url: 'mapbox://mapbox.mapbox-traffic-v1' });
      if (!map.current.getLayer('traffic-flow')) {
        map.current.addLayer({
          id: 'traffic-flow', type: 'line', source: 'mapbox-traffic', 'source-layer': 'traffic', minzoom: 10,
          paint: {
            'line-width': ['interpolate',['linear'],['zoom'],10,2,14,4,18,8],
            'line-color': ['case',['==',['get','congestion'],'low'],'#34D399',['==',['get','congestion'],'moderate'],'#FBBF24',['==',['get','congestion'],'heavy'],'#FB923C',['==',['get','congestion'],'severe'],'#EF4444','#34D399'],
            'line-opacity': 0.75,
          },
        }, 'anchor-glow');
      } else map.current.setLayoutProperty('traffic-flow', 'visibility', 'visible');
    } else { if (map.current?.getLayer('traffic-flow')) map.current.setLayoutProperty('traffic-flow', 'visibility', 'none'); }
  }, [ready, showTraffic]);

  /* ── Resize ── */
  useEffect(() => {
    if (!map.current || !ready || !ctr.current) return;
    const ro = new ResizeObserver(() => requestAnimationFrame(() => map.current?.resize()));
    ro.observe(ctr.current); return () => ro.disconnect();
  }, [ready]);

  return <div ref={ctr} className="w-full h-full" style={{ position:'absolute',top:0,left:0,right:0,bottom:0 }} />;
});
