import { useRef, useState, useEffect } from 'react';
import { X, Calendar, Clock, MapPin, GripHorizontal, Navigation } from 'lucide-react';

const SV_KEY = import.meta.env.VITE_GOOGLE_SV_KEY;

export interface StreetEventInfo {
  streetName:   string;
  seriesName:   string;
  locationDesc: string;
  neighborhood: string;
  eventDate:    string;   // 'YYYY-MM-DD'
  dayOfWeek:    string;
  openTime:     string;
  closeTime:    string;
  notes:        string | null;
  lat:          number;
  lng:          number;
  aiScore?:     number;
  keywords?:    string[];
}

interface Props {
  event:   StreetEventInfo | null;
  onClose: () => void;
}

const SERIES_COLOR: Record<string, string> = {
  'Open Streets: West Walnut':    '#F59E0B',
  'Open Streets: Midtown Village':'#FB923C',
};

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

export const StreetEventPanel = ({ event, onClose }: Props) => {
  const panelRef  = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ mx: number; my: number; pl: number; pt: number } | null>(null);
  const [dragPos, setDragPos]   = useState<{ left: number; top: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => { setDragPos(null); }, [event?.streetName, event?.eventDate]);

  const onDragMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    const rect = panelRef.current!.getBoundingClientRect();
    const par  = panelRef.current!.parentElement!.getBoundingClientRect();
    dragState.current = { mx: e.clientX, my: e.clientY, pl: rect.left - par.left, pt: rect.top - par.top };
    setDragPos({ left: rect.left - par.left, top: rect.top - par.top });
    setDragging(true);
    const onMove = (ev: MouseEvent) => {
      if (!dragState.current) return;
      setDragPos({ left: dragState.current.pl + (ev.clientX - dragState.current.mx), top: dragState.current.pt + (ev.clientY - dragState.current.my) });
    };
    const onUp = () => { dragState.current = null; setDragging(false); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  if (!event) return null;

  const color    = SERIES_COLOR[event.seriesName] ?? '#F59E0B';
  const svUrl    = SV_KEY
    ? `https://maps.googleapis.com/maps/api/streetview?size=640x320&location=${event.lat},${event.lng}&fov=90&pitch=0&key=${SV_KEY}`
    : null;
  const mapsUrl  = `https://www.google.com/maps?q=${event.lat},${event.lng}`;
  const posStyle: React.CSSProperties = dragPos
    ? { position: 'absolute', left: dragPos.left, top: dragPos.top }
    : { position: 'absolute', bottom: 24, left: 16 };

  return (
    <div ref={panelRef} className="z-50 w-[420px] max-w-[calc(100vw-48px)] animate-fadeIn" style={posStyle}>
      <div className="bg-[#16171e]/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/[0.08] overflow-hidden">

        {/* Header / drag handle */}
        <div
          className="px-5 pt-4 pb-4 border-b border-white/[0.06] select-none"
          style={{ cursor: dragging ? 'grabbing' : 'grab' }}
          onMouseDown={onDragMouseDown}
        >
          <div className="flex justify-center mb-2 opacity-30">
            <GripHorizontal className="w-4 h-4 text-gray-400" />
          </div>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold"
                  style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}>
                  🏙 {event.seriesName}
                </span>
              </div>
              <h3 className="text-lg font-extrabold text-gray-100 tracking-wide">{event.streetName}</h3>
              <p className="text-xs text-gray-500 mt-0.5">{event.locationDesc} · {event.neighborhood}</p>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-white/[0.06] rounded-lg transition-colors flex-shrink-0">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Street View */}
        {svUrl && (
          <div className="relative">
            <img src={svUrl} alt={`Street View of ${event.streetName}`} className="w-full object-cover" style={{ height: 180 }} />
            <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-[#16171e]/80 to-transparent pointer-events-none" />
          </div>
        )}

        {/* AI Street Vibe */}
        {(event.aiScore != null || event.keywords?.length) && (
          <div className="px-5 pt-4 pb-0">
            <div className="rounded-xl p-3.5 border border-white/[0.06]" style={{ background: 'rgba(99,102,241,0.07)' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold tracking-widest text-indigo-400 uppercase flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                  AI Street Vibe
                </span>
                {event.aiScore != null && (
                  <span className="text-xl font-black" style={{ color: event.aiScore >= 70 ? '#6EE7B7' : event.aiScore >= 50 ? '#FCD34D' : '#F87171' }}>
                    {event.aiScore}
                  </span>
                )}
              </div>
              {event.keywords?.length && (
                <div className="flex flex-wrap gap-1.5">
                  {event.keywords.map(k => (
                    <span key={k} className="text-[10px] px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(99,102,241,0.18)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.25)' }}>
                      {k}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Body */}
        <div className="px-5 py-4 space-y-3">

          {/* Date & time */}
          <div className="rounded-xl p-3.5 border border-white/[0.06]" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <div className="flex items-start gap-3">
              <Calendar className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color }} />
              <div>
                <p className="text-sm font-semibold text-gray-200">{formatDate(event.eventDate)}</p>
                <p className="text-xs text-gray-500 mt-0.5">{event.dayOfWeek}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-2.5">
              <Clock className="w-4 h-4 flex-shrink-0" style={{ color }} />
              <p className="text-sm font-semibold text-gray-200">{event.openTime} – {event.closeTime}</p>
            </div>
          </div>

          {/* Notes */}
          {event.notes && (
            <div className="flex items-center gap-2 px-1">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: `${color}22`, color }}>
                {event.notes}
              </span>
            </div>
          )}

          {/* Location */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <MapPin className="w-3.5 h-3.5" />
              <span>{event.lat.toFixed(5)}, {event.lng.toFixed(5)}</span>
            </div>
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
              style={{ background: `${color}18`, color }}
              onClick={e => e.stopPropagation()}>
              <Navigation className="w-3 h-3" />
              Google Maps
            </a>
          </div>

        </div>
      </div>
    </div>
  );
};
