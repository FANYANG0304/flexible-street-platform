import { useState, useEffect } from 'react';
import type { Anchor } from '../types';
import { scenarioConfigs } from '../data/mockData';
import { X, MapPin, Tag, Navigation, RotateCcw, Building2 } from 'lucide-react';

interface AnchorDetailPanelProps {
  anchor: Anchor | null;
  onClose: () => void;
}

const GOOGLE_MAPS_API_KEY = 'AIzaSyCYQ_bbFljqQr_g7NgDsPxq3G6Akh1aK6E';
const HEADINGS = [0, 90, 180, 270];

export const AnchorDetailPanel = ({ anchor, onClose }: AnchorDetailPanelProps) => {
  const [headingIndex, setHeadingIndex] = useState(0);
  const [imageError, setImageError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { setHeadingIndex(0); setImageError(false); setLoading(true); }, [anchor]);

  if (!anchor) return null;

  const scenario = scenarioConfigs.find(s => s.id === anchor.scenarioId);
  const accent = scenario?.color || '#6366F1';

  const streetViewUrl = `https://maps.googleapis.com/maps/api/streetview?size=800x400&location=${anchor.latitude},${anchor.longitude}&heading=${HEADINGS[headingIndex]}&fov=90&pitch=0&key=${GOOGLE_MAPS_API_KEY}`;
  const rotateLeft = () => { setLoading(true); setHeadingIndex(p => (p + 3) % 4); };
  const rotateRight = () => { setLoading(true); setHeadingIndex(p => (p + 1) % 4); };

  return (
    <div className="absolute top-0 right-0 h-full w-full sm:w-96 bg-[#13141c] shadow-2xl z-50 overflow-hidden border-l border-white/[0.06]">
      <div className="flex flex-col h-full">

        <div className="p-6 border-b border-white/[0.06]">
          <div className="flex items-start justify-between mb-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-extrabold text-gray-100 tracking-wide leading-tight">{anchor.name}</h2>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                  style={{ background: `${accent}18`, color: accent, border: `1px solid ${accent}30` }}>
                  <span>{scenario?.icon}</span>
                  <span>{scenario?.name || anchor.scenarioId}</span>
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs text-gray-500 bg-white/[0.04] border border-white/[0.06]">
                  <Tag className="w-3 h-3" />
                  {anchor.amenity}
                </span>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/[0.06] rounded-lg transition-colors flex-shrink-0 ml-2">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">

          <div className="relative bg-[#0a0b10]">
            {!imageError ? (
              <>
                <img key={headingIndex} src={streetViewUrl} alt="Street View" className="w-full h-64 object-cover transition-opacity duration-300"
                  onLoad={() => setLoading(false)} onError={() => { setImageError(true); setLoading(false); }} />
                {loading && <div className="absolute inset-0 flex items-center justify-center bg-[#0a0b10]"><div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: accent }} /></div>}
                <div className="absolute inset-y-0 left-0 flex items-center"><button onClick={rotateLeft} className="bg-black/50 hover:bg-black/70 text-gray-300 p-2 m-2 rounded-full backdrop-blur-sm">◀</button></div>
                <div className="absolute inset-y-0 right-0 flex items-center"><button onClick={rotateRight} className="bg-black/50 hover:bg-black/70 text-gray-300 p-2 m-2 rounded-full backdrop-blur-sm">▶</button></div>
                <div className="absolute top-3 left-3 px-3 py-1 bg-black/60 backdrop-blur rounded text-xs font-bold text-gray-200 flex items-center gap-1">
                  <RotateCcw className="w-3 h-3" />{HEADINGS[headingIndex]}°
                </div>
              </>
            ) : (
              <div className="w-full h-64 flex items-center justify-center text-gray-600 text-sm">No Street View available at this location</div>
            )}
          </div>

          <div className="p-6 space-y-6">

            <div>
              <div className="flex items-center gap-2 mb-3">
                <MapPin className="w-5 h-5" style={{ color: accent }} />
                <h3 className="text-sm font-bold text-gray-200">Location</h3>
              </div>
              <div className="bg-white/[0.04] rounded-lg p-4 border border-white/[0.06]">
                <p className="text-sm font-mono text-gray-300">{anchor.latitude.toFixed(4)}, {anchor.longitude.toFixed(4)}</p>
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-3">
                <Building2 className="w-5 h-5" style={{ color: accent }} />
                <h3 className="text-sm font-bold text-gray-200">Scenario</h3>
              </div>
              <div className="rounded-lg p-4 border" style={{ background: `${accent}08`, borderColor: `${accent}20` }}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{scenario?.icon}</span>
                  <span className="text-sm font-semibold text-gray-200">{scenario?.name}</span>
                </div>
                <p className="text-xs text-gray-500">{scenario?.description}</p>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold text-gray-200 mb-3">Flexible Street Score</h3>
              <div className="rounded-lg p-4 border" style={{ background: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.15)' }}>
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-xs text-gray-500">Pending Calculation</span>
                  <span className="text-3xl font-extrabold text-emerald-400">&mdash;</span>
                </div>
                <div className="w-full bg-white/[0.06] rounded-full h-2">
                  <div className="bg-white/[0.06] h-2 rounded-full" style={{ width: '0%' }} />
                </div>
                <p className="text-[10px] text-gray-600 mt-2">FSI score will be calculated after spatial analysis</p>
              </div>
            </div>

            {anchor.sourceTable && (
              <div>
                <h3 className="text-sm font-bold text-gray-200 mb-2">Data Source</h3>
                <p className="text-sm text-gray-400 capitalize">{anchor.sourceTable.replace(/_/g, ' ')}</p>
              </div>
            )}

            {anchor.metadata && Object.keys(anchor.metadata).length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-gray-200 mb-2">Additional Information</h3>
                <div className="space-y-1.5">
                  {Object.entries(anchor.metadata).map(([key, value]) => (
                    value && value !== '{}' && (
                      <div key={key} className="flex items-start gap-2 text-sm">
                        <span className="text-gray-500 capitalize flex-shrink-0">{key.replace(/_/g, ' ')}:</span>
                        <span className="text-gray-300">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
                      </div>
                    )
                  ))}
                </div>
              </div>
            )}

            <a
              href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${anchor.latitude},${anchor.longitude}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full px-4 py-3 text-white rounded-lg transition-all font-semibold"
              style={{ background: accent }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
            >
              <Navigation className="w-4 h-4" /><span>Open in Google Maps</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
