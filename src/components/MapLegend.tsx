import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { STREET_COLORS, STREET_FALLBACK, POI_COLORS, PLAYSTREETS_COLOR, SCORE_COLOR_STOPS } from './MapComponent';
import type { ScenarioConfig } from '../types';

interface MapLegendProps {
  showStreetScore: boolean;
  showTraffic: boolean;
  showStreetCenterline: boolean;
  showPOI: boolean;
  showPlaystreets: boolean;
  showTestBBox: boolean;
  activeScenarios: ScenarioConfig[];
  anchorPanelOpen: boolean;
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div>
    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">{title}</p>
    {children}
  </div>
);

export const MapLegend = ({
  showStreetScore, showTraffic, showStreetCenterline, showPOI,
  showPlaystreets, showTestBBox, activeScenarios, anchorPanelOpen,
}: MapLegendProps) => {
  const [open, setOpen] = useState(true);

  const hasContent = showStreetScore || showTraffic || showStreetCenterline ||
    showPOI || showPlaystreets || showTestBBox || activeScenarios.length > 0;

  if (!hasContent) return null;

  return (
    <div
      className="absolute z-30 transition-all duration-300"
      style={{ bottom: 44, right: anchorPanelOpen ? 400 : 16 }}
    >
      <div
        className="bg-[#13141c]/92 backdrop-blur-xl rounded-xl border border-white/[0.07] shadow-2xl overflow-hidden"
        style={{ width: 188 }}
      >
        {/* Header */}
        <button
          onClick={() => setOpen(o => !o)}
          className="w-full px-3 py-2 flex items-center justify-between hover:bg-white/[0.03] transition-colors"
        >
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Legend</span>
          <ChevronDown
            className="w-3.5 h-3.5 text-gray-500 transition-transform duration-200"
            style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
          />
        </button>

        {open && (
          <div className="px-3 pb-3 space-y-3 max-h-[58vh] overflow-y-auto">

            {/* Flexibility Score */}
            {showStreetScore && (
              <Section title="Flexibility Score">
                <div className="h-2 rounded-full mb-1.5"
                  style={{ background: 'linear-gradient(90deg,#EF4444 0%,#F97316 25%,#EAB308 45%,#22C55E 65%,#10B981 100%)' }} />
                <div className="space-y-1">
                  {SCORE_COLOR_STOPS.map(({ color, label }) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: color }} />
                      <span className="text-[10px] text-gray-500">{label}</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Closure Constraints — only meaningful when score layer is on */}
            {showStreetScore && (
              <Section title="Closure Constraints">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-[3px] rounded-full flex-shrink-0" style={{ background: '#EC4899' }} />
                    <span className="text-[10px] text-gray-500">Emergency access · cannot close</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="w-4 flex-shrink-0 rounded-full"
                      style={{ height: 6, background: 'rgba(6,182,212,0.32)' }}
                    />
                    <span className="text-[10px] text-gray-500">Closure cluster · coordinate group</span>
                  </div>
                </div>
              </Section>
            )}

            {/* Traffic */}
            {showTraffic && (
              <Section title="Traffic">
                <div className="space-y-1">
                  {([['#34D399','Free Flow'],['#FBBF24','Moderate'],['#FB923C','Heavy'],['#EF4444','Severe']] as [string,string][]).map(([c,t]) => (
                    <div key={t} className="flex items-center gap-2">
                      <span className="w-4 h-[3px] rounded-full flex-shrink-0" style={{ background: c }} />
                      <span className="text-[10px] text-gray-500">{t}</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Street Centerline */}
            {showStreetCenterline && (
              <Section title="Street Ownership">
                <div className="space-y-1">
                  {STREET_COLORS.map(([name, color]) => (
                    <div key={name} className="flex items-center gap-2">
                      <span className="w-4 h-[3px] rounded-full flex-shrink-0" style={{ background: color }} />
                      <span className="text-[10px] text-gray-500 truncate">{name}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-[3px] rounded-full flex-shrink-0" style={{ background: STREET_FALLBACK }} />
                    <span className="text-[10px] text-gray-600 italic">Other</span>
                  </div>
                </div>
              </Section>
            )}

            {/* POI */}
            {showPOI && (
              <Section title="Points of Interest">
                <div className="space-y-1">
                  {POI_COLORS.map(([name, color]) => (
                    <div key={name} className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                      <span className="text-[10px] text-gray-500 truncate">{name}</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Playstreets */}
            {showPlaystreets && (
              <Section title="Playstreets">
                <div className="flex items-center gap-2">
                  <span className="w-4 h-[3px] rounded-full flex-shrink-0" style={{ background: PLAYSTREETS_COLOR }} />
                  <span className="text-[10px] text-gray-500">Summer play streets</span>
                </div>
              </Section>
            )}

            {/* Test BBox */}
            {showTestBBox && (
              <Section title="Test Area">
                <div className="flex items-center gap-2">
                  <span className="w-4 h-3.5 rounded-sm flex-shrink-0 border border-dashed"
                    style={{ borderColor: '#818CF8', background: 'rgba(99,102,241,0.1)' }} />
                  <span className="text-[10px] text-gray-500">Analysis bbox</span>
                </div>
              </Section>
            )}

            {/* Scenarios */}
            {activeScenarios.length > 0 && (
              <Section title="Scenarios">
                <div className="space-y-1">
                  {activeScenarios.map(s => (
                    <div key={s.id} className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                      <span className="text-[10px] text-gray-500 truncate">{s.icon} {s.name}</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

          </div>
        )}
      </div>
    </div>
  );
};
