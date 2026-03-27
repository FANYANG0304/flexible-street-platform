import 'mapbox-gl/dist/mapbox-gl.css';
import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import mapboxgl from 'mapbox-gl';
import type { Anchor, ScenarioId } from '../types';
import { PHILADELPHIA_CENTER, scenarioConfigs } from '../data/mockData';
import { supabase } from '../lib/supabase';
import { generateStreetScores, getScoreColor } from './StreetScorePanel';
import type { StreetScore } from './StreetScorePanel';
import type { StreetAIData } from '../lib/streetScores';
import type { FSIData } from '../lib/fsiScores';
import { computeCompositeTotal } from '../lib/fsiScores';
import type { StreetEventInfo } from './StreetEventPanel';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

export interface MapHandle { fitToPhiladelphia: () => void; }

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
  showTestBBox?: boolean;
  streetAICache?: Map<number, StreetAIData>;
  fsiScores?: Map<string, FSIData>;
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


/* ── Pseudo-random score from feature ID (Mapbox expression) ── */
function buildScoreExpr(offset: number): any {
  return [
    'min', 100,
    ['max', 0,
      ['%', ['abs', ['+', ['*', ['%', ['+', ['coalesce', ['id'], 1], offset], 9973], 7919], offset * 13]], 101]
    ]
  ];
}
const SCORE_COMMERCIAL = buildScoreExpr(1);
const SCORE_SOCIAL     = buildScoreExpr(3);
const SCORE_ECOLOGICAL = buildScoreExpr(5);
const SCORE_TOTAL: any = ['round', ['/', ['+', SCORE_COMMERCIAL, SCORE_SOCIAL, SCORE_ECOLOGICAL], 3]];


/* ═══════════════════════════════════════
   MapComponent
   ═══════════════════════════════════════ */
export const MapComponent = forwardRef<MapHandle, MapComponentProps>(({
  activeScenarios, selectedTimeBin: _t, onAnchorClick,
  showTraffic = false, showStreetCenterline = false, showPOI = false, showPlaystreets = false,
  showStreetEvents = false, onStreetEventClick,
  showStreetScore = false, onStreetScoreClick,
  showTestBBox = false,
  streetAICache,
  fsiScores,
}, ref) => {
  const ctr = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const loadingAnchors = useRef(false);
  const loadingPOI = useRef(false);
  const loadingPlaystreets = useRef(false);
  const aiCacheRef     = useRef<Map<number, StreetAIData>>(new Map());
  const aiNameIndexRef = useRef<Map<string, StreetAIData>>(new Map());
  const fsiCacheRef    = useRef<Map<string, FSIData>>(new Map());

  useEffect(() => {
    const cache = streetAICache ?? new Map();
    aiCacheRef.current = cache;
    const nameIdx = new Map<string, StreetAIData>();
    for (const v of cache.values()) nameIdx.set(v.streetName.toUpperCase().trim(), v);
    aiNameIndexRef.current = nameIdx;
  }, [streetAICache]);

  useEffect(() => { fsiCacheRef.current = fsiScores ?? new Map(); }, [fsiScores]);

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
        min_lng: -75.20, min_lat: 39.93, max_lng: -75.12, max_lat: 39.97,
      });
      if (error) { console.error('Street events fetch error:', error); return; }
      const src = map.current?.getSource('street-events-data') as mapboxgl.GeoJSONSource;
      if (src && data) { src.setData(data); streetEventsLoaded.current = true; }
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
      map.current.addSource('street-centerline', { type: 'vector', url: 'mapbox://yangf0304.az4ve7hc' });
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
      // Glow for high-scoring streets (>= 80)
      map.current.addLayer({
        id: 'street-score-glow', type: 'line', source: 'street-centerline',
        'source-layer': 'Street_Centerline-46lvna', minzoom: 12,
        layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
        filter: ['all',
          ['>=', SCORE_TOTAL, 80],
          ['any', ['>=', ['zoom'], 13.5], ['match', ['get', 'responsibl'], ['STATE'], true, false]],
        ],
        paint: {
          'line-color': '#10B981',
          'line-width': ['interpolate',['linear'],['zoom'],12,6,14,12,18,22],
          'line-opacity': 0.12,
          'line-blur': 4,
        },
      });

      // Main score lines — color by total score
      map.current.addLayer({
        id: 'street-score-lines', type: 'line', source: 'street-centerline',
        'source-layer': 'Street_Centerline-46lvna', minzoom: 12,
        filter: ['any', ['>=', ['zoom'], 13.5], ['match', ['get', 'responsibl'], ['STATE'], true, false]],
        layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': [
            'interpolate', ['linear'], SCORE_TOTAL,
            0,  '#EF4444',
            50, '#F97316',
            75, '#EAB308',
            90, '#10B981',
            100,'#059669',
          ] as any,
          'line-width': ['interpolate',['linear'],['zoom'],12,1.5,14,3,18,5],
          'line-opacity': 0.85,
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
      map.current.addSource('street-events-data', { type: 'geojson', data: EMPTY_FC });
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
      const stkey    = (props.stname ?? '').toUpperCase().trim();
      const fsiData  = fsiCacheRef.current.get(stkey);

      const scores = generateStreetScores(objectId, props.stname, fsiData, props.responsibl);

      // 叠加 AI 感官数据（如果有）— name > objectid
      const ai = aiNameIndexRef.current.get((props.stname ?? '').toUpperCase().trim())
              ?? aiCacheRef.current.get(objectId);

      // 综合 FSI
      scores.total = computeCompositeTotal(scores.total, ai?.aiScore, scores.closeability);
      const color  = getScoreColor(scores.total);

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
      const stkey    = (props.stname ?? '').toUpperCase().trim();
      const fsiData  = fsiCacheRef.current.get(stkey);

      const scores = generateStreetScores(objectId, props.stname, fsiData, props.responsibl);

      // 叠加 AI 感官数据（如果有）— name > objectid
      const ai = aiNameIndexRef.current.get((props.stname ?? '').toUpperCase().trim())
              ?? aiCacheRef.current.get(objectId);
      if (ai) {
        scores.streetName = ai.streetName || scores.streetName; // 修复 Unnamed Street
        scores.aiScore    = ai.aiScore;
        scores.keywords   = ai.keywords;
        scores.lat        = ai.lat;
        scores.lng        = ai.lng;
      }

      // 综合 FSI = ML分 × 60% + AI感官 × 40%（无AI则纯ML），不可关闭→0，需审批→×0.75
      scores.total = computeCompositeTotal(scores.total, scores.aiScore, scores.closeability);

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
    if (map.current.getLayer('street-centerline-lines')) map.current.setLayoutProperty('street-centerline-lines', 'visibility', showStreetCenterline ? 'visible' : 'none');
  }, [ready, showStreetCenterline]);

  /* ── Toggle Street Score ── */
  useEffect(() => {
    if (!map.current || !ready) return;
    const vis = showStreetScore ? 'visible' : 'none';
    for (const lid of ['street-score-lines', 'street-score-glow', 'street-score-highlight']) {
      if (map.current.getLayer(lid)) map.current.setLayoutProperty(lid, 'visibility', vis);
    }
    if (!showStreetScore) {
      // Clear highlight & popup
      if (map.current.getLayer('street-score-highlight')) map.current.setFilter('street-score-highlight', ['==', ['id'], -1]);
      popupRef.current?.remove();
    }
  }, [ready, showStreetScore]);

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
