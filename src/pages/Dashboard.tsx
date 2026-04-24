import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { MapPin, TrendingUp, Layers, Calendar, ArrowRight } from 'lucide-react';
import { scenarioConfigs } from '../data/mockData';
import { supabase } from '../lib/supabase';

// Maps each scenario to the POI categories that represent its "anchors"
const SCENARIO_POI_CATEGORIES: Record<string, string[]> = {
  school_dismissal: ['Education'],
  weekend_market:   ['Community', 'Culture'],
  dining_activation:['Food & Dining'],
  play_street:      ['Community', 'Education'],
  event_spillover:  ['Culture'],
  transit_zone:     ['Transport'],
};

export const Dashboard = () => {
  const navigate = useNavigate();
  const accent = '#6366F1';
  const accentHover = '#818CF8';
  const accentShadow = 'rgba(99,102,241,0.25)';

  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [totalPOIs, setTotalPOIs] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const { data, error } = await supabase.rpc('get_poi_in_bounds', {
          min_lng: -75.30, min_lat: 39.86, max_lng: -74.95, max_lat: 40.14,
        });
        if (error) { console.error('POI fetch error:', error); return; }
        const features = (data?.features ?? []) as any[];
        const counts: Record<string, number> = {};
        features.forEach((f: any) => {
          const cat = f.properties?.poi_category ?? 'Unknown';
          counts[cat] = (counts[cat] || 0) + 1;
        });
        setCategoryCounts(counts);
        setTotalPOIs(features.length);
      } catch (err) { console.error('Stats error:', err); }
      finally { setLoading(false); }
    }
    fetchStats();
  }, []);

  // Sum POI counts for all categories mapped to a scenario (deduplicated)
  const getCount = (id: string): number => {
    const cats = SCENARIO_POI_CATEGORIES[id] ?? [];
    const seen = new Set<string>();
    let total = 0;
    for (const cat of cats) {
      if (!seen.has(cat)) { seen.add(cat); total += categoryCounts[cat] ?? 0; }
    }
    return total;
  };

  return (
    <div className="min-h-screen bg-[#0c0d12]">
      <div className="border-b border-white/[0.06] bg-[#0c0d12]/80 backdrop-blur-xl">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: accent }}><MapPin className="w-5 h-5 text-white" /></div>
              <span className="text-lg font-extrabold text-gray-100 tracking-wide">Flexible Streets</span>
            </div>
            <button onClick={() => navigate('/')} className="text-gray-500 hover:text-gray-300 transition-colors text-sm">&larr; Back to Home</button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-12">
        <h1 className="text-3xl font-extrabold text-white mb-2 tracking-wide">Philadelphia Pilot Project</h1>
        <p className="text-gray-500 mb-12">Overview of flexible street scenarios and anchor analysis</p>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
          {[
            { Icon: MapPin, bg: 'rgba(99,102,241,0.15)', ic: '#A5B4FC', label: 'Total', val: loading ? '...' : totalPOIs.toLocaleString(), sub: 'Points of Interest' },
            { Icon: Layers, bg: 'rgba(16,185,129,0.15)', ic: '#6EE7B7', label: 'Active', val: '6', sub: 'Scenarios' },
            { Icon: TrendingUp, bg: 'rgba(147,51,234,0.15)', ic: '#C4B5FD', label: 'Indexed', val: loading ? '...' : Object.keys(categoryCounts).length.toString(), sub: 'POI Categories' },
            { Icon: Calendar, bg: 'rgba(245,158,11,0.15)', ic: '#FCD34D', label: 'Analyzed', val: '4', sub: 'Time Periods' },
          ].map(({ Icon, bg, ic, label, val, sub }) => (
            <div key={sub} className="bg-white/[0.03] rounded-xl p-6 border border-white/[0.06] hover:bg-white/[0.05] transition-all">
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: bg }}><Icon className="w-5 h-5" style={{ color: ic }} /></div>
                <span className="text-xs font-semibold" style={{ color: ic }}>{label}</span>
              </div>
              <div className="text-3xl font-extrabold text-gray-100 mb-1">{val}</div>
              <div className="text-sm text-gray-500">{sub}</div>
            </div>
          ))}
        </div>

        <h2 className="text-xl font-extrabold text-white mb-6">Scenario Breakdown</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
          {scenarioConfigs.map(s => {
            const count = getCount(s.id);
            return (
              <div key={s.id} className="bg-white/[0.03] rounded-xl p-5 border border-white/[0.06] hover:bg-white/[0.05] transition-all group">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center text-lg"
                    style={{ background: `${s.color}18`, border: `1px solid ${s.color}30` }}>
                    {s.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-gray-200 group-hover:text-white transition-colors">{s.name}</h3>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-extrabold" style={{ color: s.color }}>{loading ? '...' : count.toLocaleString()}</p>
                    <p className="text-[10px] text-gray-600">POIs</p>
                  </div>
                </div>
                <p className="text-xs text-gray-500">{s.description}</p>
                <div className="mt-3 w-full bg-white/[0.04] rounded-full h-1.5">
                  <div className="h-1.5 rounded-full transition-all duration-500"
                    style={{ background: s.color, width: totalPOIs > 0 ? `${Math.min(100, (count / totalPOIs) * 100 * 4)}%` : '0%', opacity: 0.7 }} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="relative rounded-2xl p-12 text-center overflow-hidden border border-white/[0.06]">
          <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(99,102,241,0.1), rgba(147,51,234,0.1))' }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[250px] rounded-full blur-[80px]" style={{ background: 'rgba(99,102,241,0.12)' }} />
          <div className="relative z-10">
            <h2 className="text-3xl font-extrabold text-white mb-4">Ready to Explore?</h2>
            <p className="text-gray-400 mb-8 max-w-2xl mx-auto text-lg">Dive into the interactive map to explore 6 flexible street scenarios, toggle overlays, and analyze anchor points across different time periods.</p>
            <button onClick={() => navigate('/map')} className="group px-8 py-4 text-white rounded-lg transition-all font-semibold inline-flex items-center gap-2" style={{ background: accent, boxShadow: `0 8px 24px ${accentShadow}` }}
              onMouseEnter={e => (e.currentTarget.style.background = accentHover)}
              onMouseLeave={e => (e.currentTarget.style.background = accent)}
            >
              Open Interactive Map <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
