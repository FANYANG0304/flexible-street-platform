import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { MapPin, Clock, Layers, ArrowRight, TrendingUp, Users, BarChart3, Map, Zap, Shield, Menu, X } from 'lucide-react';

export const LandingPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const currentYear = new Date().getFullYear();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  const handleHomeClick = () => {
    if (location.pathname === '/') scrollToTop();
    else { navigate('/'); setTimeout(scrollToTop, 100); }
  };
  const closeMobileMenu = () => setMobileMenuOpen(false);

  const accent       = '#6366F1';
  const accentHover  = '#818CF8';
  const accentBg     = 'rgba(99,102,241,0.12)';
  const accentBorder = 'rgba(99,102,241,0.2)';
  const accentText   = '#A5B4FC';
  const accentShadow = 'rgba(99,102,241,0.25)';

  return (
    <div className="w-full bg-[#0c0d12] text-gray-200">

      {/* ── Nav ── */}
      <nav className="fixed top-0 left-0 right-0 bg-[#0c0d12]/90 backdrop-blur-xl border-b border-white/[0.06] z-50">
        <div className="container mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 cursor-pointer" onClick={scrollToTop}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: accent }}>
                <MapPin className="w-5 h-5 text-white" />
              </div>
              <span className="text-lg font-extrabold text-gray-100 tracking-wide">Flexible Streets</span>
            </div>

            {/* Desktop links */}
            <div className="hidden md:flex items-center gap-6">
              <button onClick={handleHomeClick} className="text-gray-400 hover:text-gray-100 transition-colors text-sm font-medium">Home</button>
              <a href="#about" className="text-gray-400 hover:text-gray-100 transition-colors text-sm font-medium">About</a>
              <a href="#features" className="text-gray-400 hover:text-gray-100 transition-colors text-sm font-medium">Features</a>
              <a href="#how-it-works" className="text-gray-400 hover:text-gray-100 transition-colors text-sm font-medium">How It Works</a>
              <button onClick={() => navigate('/map')} className="px-5 py-2 text-white rounded-lg transition-colors text-sm font-semibold" style={{ background: accent }}>
                Open Map
              </button>
            </div>

            {/* Mobile hamburger */}
            <button
              className="md:hidden p-2 rounded-lg hover:bg-white/[0.06] transition-colors"
              onClick={() => setMobileMenuOpen(o => !o)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5 text-gray-300" /> : <Menu className="w-5 h-5 text-gray-300" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-white/[0.06] bg-[#0c0d12]/95 px-4 py-4 space-y-1">
            <button onClick={() => { handleHomeClick(); closeMobileMenu(); }} className="w-full text-left px-4 py-3 rounded-lg text-gray-300 hover:bg-white/[0.06] transition-colors text-sm font-medium">Home</button>
            <a href="#about"        onClick={closeMobileMenu} className="block px-4 py-3 rounded-lg text-gray-300 hover:bg-white/[0.06] transition-colors text-sm font-medium">About</a>
            <a href="#features"     onClick={closeMobileMenu} className="block px-4 py-3 rounded-lg text-gray-300 hover:bg-white/[0.06] transition-colors text-sm font-medium">Features</a>
            <a href="#how-it-works" onClick={closeMobileMenu} className="block px-4 py-3 rounded-lg text-gray-300 hover:bg-white/[0.06] transition-colors text-sm font-medium">How It Works</a>
            <button onClick={() => { navigate('/map'); closeMobileMenu(); }} className="w-full mt-2 py-3 px-4 text-white rounded-lg text-sm font-semibold" style={{ background: accent }}>
              Open Map
            </button>
          </div>
        )}
      </nav>

      {/* ── Hero ── */}
      <div className="relative overflow-hidden">
        <div className="absolute top-[-200px] left-[-100px] w-[600px] h-[600px] rounded-full blur-[120px] pointer-events-none" style={{ background: 'rgba(99,102,241,0.08)' }} />
        <div className="absolute top-[100px] right-[-150px] w-[500px] h-[500px] rounded-full blur-[120px] pointer-events-none" style={{ background: 'rgba(147,51,234,0.06)' }} />

        <div className="container mx-auto px-4 sm:px-6 pt-28 sm:pt-36 pb-16 sm:pb-24 relative z-10">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
              <div>
                <div className="inline-block px-4 py-1.5 rounded-full text-sm font-semibold mb-6 sm:mb-8" style={{ background: accentBg, color: accentText, border: `1px solid ${accentBorder}` }}>
                  Philadelphia Pilot Project
                </div>
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white mb-5 sm:mb-6 leading-[1.1] tracking-wide">
                  Reimagining Urban<br />Streets for People
                </h1>
                <p className="text-base sm:text-lg text-gray-400 mb-8 sm:mb-10 leading-relaxed max-w-lg">
                  An interactive planning tool that uses machine learning to score Philadelphia's
                  streets for flexible use — play zones, outdoor dining, community events, and more.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                  <button onClick={() => navigate('/map')}
                    className="group px-6 sm:px-8 py-3.5 sm:py-4 text-white rounded-lg transition-all flex items-center justify-center gap-2 font-semibold text-sm sm:text-base"
                    style={{ background: accent, boxShadow: `0 8px 24px ${accentShadow}` }}
                    onMouseEnter={e => (e.currentTarget.style.background = accentHover)}
                    onMouseLeave={e => (e.currentTarget.style.background = accent)}
                  >
                    Explore Map <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 group-hover:translate-x-1 transition-transform" />
                  </button>
                  <button onClick={() => navigate('/dashboard')} className="px-6 sm:px-8 py-3.5 sm:py-4 text-gray-300 rounded-lg border border-white/[0.1] hover:border-white/[0.2] hover:bg-white/[0.04] transition-all font-semibold text-sm sm:text-base">
                    View Dashboard
                  </button>
                </div>
              </div>

              <div className="relative mt-6 lg:mt-0">
                <div className="bg-[#15161e] rounded-2xl p-6 sm:p-8 border border-white/[0.06] shadow-2xl shadow-black/30">
                  <div className="aspect-[4/3] rounded-xl mb-5 sm:mb-6 flex items-center justify-center relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #1a1b26, #12131a)' }}>
                    <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
                    <div className="absolute w-32 h-32 rounded-full blur-[40px]" style={{ background: 'rgba(99,102,241,0.2)' }} />
                    <div className="relative z-10 text-center">
                      <MapPin className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-2" style={{ color: 'rgba(99,102,241,0.5)' }} />
                      <p className="text-xs text-gray-600">Philadelphia, PA</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 sm:gap-4">
                    <div className="text-center">
                      <div className="text-2xl sm:text-3xl font-extrabold mb-1" style={{ color: accentText }}>13</div>
                      <div className="text-[10px] sm:text-xs text-gray-500 font-semibold uppercase tracking-wide">Anchors</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl sm:text-3xl font-extrabold text-purple-400 mb-1">11</div>
                      <div className="text-[10px] sm:text-xs text-gray-500 font-semibold uppercase tracking-wide">Categories</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl sm:text-3xl font-extrabold text-emerald-400 mb-1">4</div>
                      <div className="text-[10px] sm:text-xs text-gray-500 font-semibold uppercase tracking-wide">Time Periods</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── About ── */}
      <div id="about" className="py-16 sm:py-24 border-t border-white/[0.04]">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
              <div>
                <div className="inline-block px-4 py-1.5 rounded-full text-sm font-semibold mb-6"
                  style={{ background: 'rgba(16,185,129,0.12)', color: '#6EE7B7', border: '1px solid rgba(16,185,129,0.2)' }}>
                  About the Project
                </div>
                <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-6 tracking-wide leading-tight">
                  Turning Streets Into<br />Community Spaces
                </h2>
                <div className="space-y-4 text-gray-400 leading-relaxed text-sm sm:text-base">
                  <p>
                    Philadelphia has over 2,500 miles of public streets. Most of the time, they exist
                    for car movement — but they can be so much more: play zones, outdoor dining areas,
                    community markets, and gathering spaces for residents.
                  </p>
                  <p>
                    The <strong className="text-gray-200">Flexible Streets Platform</strong> is a planning
                    research tool that uses machine learning and AI to evaluate every street segment and score
                    its potential for temporary activation — helping planners and communities identify the
                    best candidates for open street programs.
                  </p>
                  <p>
                    This pilot focuses on <strong className="text-gray-200">West Philadelphia</strong> (community
                    play & neighborhood activation) and <strong className="text-gray-200">Center City</strong>
                    (commercial & cultural events) — two districts with different needs and activation models.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { icon: '🏘️', label: 'West Philadelphia', desc: 'Community activation, neighborhood play, and school safety zones', color: '#818CF8' },
                  { icon: '🏙️', label: 'Center City',       desc: 'Commercial corridors, outdoor dining, and cultural events',          color: '#F472B6' },
                  { icon: '🤖', label: 'ML + AI Scoring',   desc: 'XGBoost model trained on Philadelphia Open Streets data',            color: '#34D399' },
                  { icon: '📡', label: 'Real-Time Data',    desc: 'Traffic patterns and live weather conditions factored in',            color: '#FCD34D' },
                ].map(({ icon, label, desc, color }) => (
                  <div key={label} className="p-4 sm:p-5 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] transition-all">
                    <div className="text-2xl sm:text-3xl mb-2 sm:mb-3">{icon}</div>
                    <div className="text-sm font-bold mb-1" style={{ color }}>{label}</div>
                    <div className="text-xs text-gray-500 leading-relaxed">{desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Features ── */}
      <div id="features" className="py-16 sm:py-24 border-t border-white/[0.04]">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12 sm:mb-16">
              <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4 tracking-wide">Platform Features</h2>
              <p className="text-base sm:text-lg text-gray-500 max-w-3xl mx-auto">Everything you need to analyze, visualize, and optimize flexible street opportunities</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
              {[
                { Icon: MapPin,    bg: 'rgba(99,102,241,0.15)',  ic: '#A5B4FC', t: 'Interactive Map',       d: 'Explore Philadelphia with anchor points, street scores, and customizable data layers all in one view.' },
                { Icon: Clock,     bg: 'rgba(147,51,234,0.15)',  ic: '#C4B5FD', t: 'Time-Based Analysis',   d: 'See how streets change across morning, afternoon, evening, and night — and pick the best activation window.' },
                { Icon: Layers,    bg: 'rgba(16,185,129,0.15)',  ic: '#6EE7B7', t: 'Multi-Layer View',      d: 'Toggle 11 anchor categories: schools, restaurants, cultural sites, hospitals, and more.' },
                { Icon: TrendingUp,bg: 'rgba(245,158,11,0.15)',  ic: '#FCD34D', t: 'FSI Scoring',           d: 'Every street gets a Flexibility Score Index — composite of ML model, AI analysis, and live conditions.' },
                { Icon: BarChart3, bg: 'rgba(244,63,94,0.15)',   ic: '#FDA4AF', t: 'Open Streets History',  d: 'Browse 9 historical and current Philadelphia open street programs with accurate street geometries.' },
                { Icon: Zap,       bg: 'rgba(99,102,241,0.15)',  ic: '#A5B4FC', t: 'Live Conditions',       d: 'Real-time traffic modifiers and Philadelphia weather data influence every street score dynamically.' },
              ].map(({ Icon, bg, ic, t, d }) => (
                <div key={t} className="p-5 sm:p-6 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] hover:border-white/[0.1] transition-all">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-4" style={{ background: bg }}>
                    <Icon className="w-5 h-5" style={{ color: ic }} />
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-gray-100 mb-2">{t}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{d}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Understanding FSI ── */}
      <div className="py-16 sm:py-24 border-t border-white/[0.04]" style={{ background: 'rgba(0,0,0,0.15)' }}>
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-10 sm:mb-12">
              <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4 tracking-wide">Understanding FSI Scores</h2>
              <p className="text-base sm:text-lg text-gray-500 max-w-2xl mx-auto">
                Each street gets a score from 0–100, combining three dimensions of flexibility potential
                plus live traffic and weather adjustments.
              </p>
            </div>

            {/* Sub-dimensions */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-10 sm:mb-12">
              {[
                { icon: '🏪', label: 'Commercial', color: '#818CF8', desc: 'Business activity & economic potential near shops, restaurants, and landmark destinations.' },
                { icon: '👥', label: 'Social',     color: '#F472B6', desc: 'Community engagement potential — proximity to schools, parks, and neighborhood institutions.' },
                { icon: '🌳', label: 'Ecological', color: '#34D399', desc: 'Environmental quality and health factors — green space access and hospital proximity.' },
              ].map(({ icon, label, color, desc }) => (
                <div key={label} className="text-center p-5 sm:p-6 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                  <div className="text-3xl sm:text-4xl mb-3">{icon}</div>
                  <h3 className="text-base font-bold mb-2" style={{ color }}>{label}</h3>
                  <p className="text-xs sm:text-sm text-gray-500 leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>

            {/* Score bands */}
            <div>
              <h3 className="text-center text-xs font-bold text-gray-500 uppercase tracking-widest mb-5 sm:mb-6">Score Bands</h3>
              <div className="space-y-3">
                {[
                  { range: '90–100', label: 'Excellent', color: '#10B981', bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.2)',  w: '95%', desc: 'Prime candidate. Low barriers, high community value, city-managed street.' },
                  { range: '75–89',  label: 'Good',      color: '#EAB308', bg: 'rgba(234,179,8,0.08)',   border: 'rgba(234,179,8,0.2)',   w: '82%', desc: 'Strong potential. Minor barriers — coordination or off-peak timing may help.' },
                  { range: '50–74',  label: 'Fair',      color: '#F97316', bg: 'rgba(249,115,22,0.08)',  border: 'rgba(249,115,22,0.2)',  w: '62%', desc: 'Feasible with planning. Requires inter-agency coordination or traffic measures.' },
                  { range: '0–49',   label: 'Low',       color: '#EF4444', bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.2)',   w: '25%', desc: 'Significant barriers — heavy traffic, non-city ownership, or unsafe conditions.' },
                ].map(({ range, label, color, bg, border, w, desc }) => (
                  <div key={range} className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl border" style={{ background: bg, borderColor: border }}>
                    <div className="flex-shrink-0 text-center w-16 sm:w-20">
                      <div className="text-base sm:text-xl font-extrabold" style={{ color }}>{range}</div>
                      <div className="text-[10px] sm:text-xs font-bold mt-0.5" style={{ color }}>{label}</div>
                    </div>
                    <div className="flex-1 h-2.5 sm:h-3 rounded-full bg-black/20 overflow-hidden hidden sm:block">
                      <div className="h-full rounded-full" style={{ width: w, background: color }} />
                    </div>
                    <p className="text-xs sm:text-sm text-gray-400 flex-1 sm:flex-none sm:w-64 leading-relaxed">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── How It Works ── */}
      <div id="how-it-works" className="py-16 sm:py-24 border-t border-white/[0.04]">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12 sm:mb-16">
              <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4 tracking-wide">How to Use the Platform</h2>
              <p className="text-base sm:text-lg text-gray-500 max-w-3xl mx-auto">Four steps to start analyzing flexible street opportunities in Philadelphia</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 sm:gap-10">
              {[
                { n: '1', bg: 'rgba(99,102,241,0.15)',  c: '#A5B4FC', bd: 'rgba(99,102,241,0.25)',  t: 'Pick a Time Period',  d: 'Choose morning, afternoon, evening, or night — FSI scores update to reflect traffic and activity at that time of day.' },
                { n: '2', bg: 'rgba(147,51,234,0.15)',  c: '#C4B5FD', bd: 'rgba(147,51,234,0.25)',  t: 'Enable Score Layer',  d: 'Toggle "Flexibility Score" in the sidebar. Streets light up in red → orange → yellow → green based on their FSI score.' },
                { n: '3', bg: 'rgba(16,185,129,0.15)',  c: '#6EE7B7', bd: 'rgba(16,185,129,0.25)',  t: 'Click a Street',      d: 'Tap any scored street to see its Commercial, Social, and Ecological breakdown, plus AI-analyzed street view data.' },
                { n: '4', bg: 'rgba(245,158,11,0.15)',  c: '#FCD34D', bd: 'rgba(245,158,11,0.25)',  t: 'Explore Open Streets', d: 'Turn on "Open Streets" to see where Philadelphia has already run flexible street programs — and compare with FSI scores.' },
              ].map(({ n, bg, c, bd, t, d }) => (
                <div key={n} className="text-center">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center text-lg sm:text-xl font-extrabold mx-auto mb-5"
                    style={{ background: bg, color: c, border: `1px solid ${bd}` }}>{n}</div>
                  <h3 className="text-base sm:text-lg font-bold text-gray-100 mb-3">{t}</h3>
                  <p className="text-xs sm:text-sm text-gray-500 leading-relaxed">{d}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Insights ── */}
      <div id="insights" className="py-16 sm:py-24 border-t border-white/[0.04]">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
              <div>
                <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-6 tracking-wide">Data-Driven Urban Planning</h2>
                <p className="text-base sm:text-lg text-gray-400 mb-8 sm:mb-10 leading-relaxed">
                  Combining ML predictions, AI visual analysis, real-time traffic, and weather to give each street a holistic, time-aware flexibility score.
                </p>
                <div className="space-y-5 sm:space-y-6">
                  {[
                    { Icon: Map,    bg: 'rgba(99,102,241,0.15)',  ic: '#A5B4FC', bd: 'rgba(99,102,241,0.2)',  t: 'Anchor Point Analysis',  d: '13 anchor points across 11 categories. Each anchor generates its own scenario layer — select any combination to explore.' },
                    { Icon: Users,  bg: 'rgba(147,51,234,0.15)',  ic: '#C4B5FD', bd: 'rgba(147,51,234,0.2)',  t: 'Pedestrian & Community',  d: 'Time-based analysis shows when each street type sees peak activity — critical for scheduling street closures.' },
                    { Icon: Shield, bg: 'rgba(16,185,129,0.15)',  ic: '#6EE7B7', bd: 'rgba(16,185,129,0.2)',  t: 'Safety & Accessibility',  d: 'Closeability ratings flag which streets are city-managed, need agency approval, or cannot be closed at all.' },
                  ].map(({ Icon, bg, ic, bd, t, d }) => (
                    <div key={t} className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: bg, border: `1px solid ${bd}` }}>
                        <Icon className="w-5 h-5" style={{ color: ic }} />
                      </div>
                      <div>
                        <h3 className="text-sm sm:text-base font-bold text-gray-100 mb-1">{t}</h3>
                        <p className="text-xs sm:text-sm text-gray-500 leading-relaxed">{d}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-[#15161e] rounded-2xl p-6 sm:p-10 border border-white/[0.06] text-center mt-4 lg:mt-0">
                <div className="mb-6 sm:mb-8">
                  <div className="text-4xl sm:text-6xl font-extrabold mb-2" style={{ color: accentText }}>2,500+</div>
                  <div className="text-xs sm:text-sm text-gray-500 uppercase tracking-wide font-semibold">Miles of Streets Scored</div>
                </div>
                <div className="grid grid-cols-2 gap-6 sm:gap-8">
                  <div><div className="text-2xl sm:text-3xl font-extrabold text-gray-100 mb-1">9</div><div className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wide">Open Street Programs</div></div>
                  <div><div className="text-2xl sm:text-3xl font-extrabold text-gray-100 mb-1">4</div><div className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wide">Time Periods</div></div>
                  <div><div className="text-2xl sm:text-3xl font-extrabold text-gray-100 mb-1">11</div><div className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wide">Scenario Categories</div></div>
                  <div><div className="text-2xl sm:text-3xl font-extrabold text-gray-100 mb-1">60/40</div><div className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wide">ML/AI Score Blend</div></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Use Cases ── */}
      <div className="py-16 sm:py-24 border-t border-white/[0.04]">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12 sm:mb-16">
              <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4 tracking-wide">Real-World Applications</h2>
              <p className="text-base sm:text-lg text-gray-500 max-w-3xl mx-auto">See how the Flexible Streets Platform supports planning decisions in Philadelphia</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              {[
                { e: '🛝', t: 'Play Streets',         d: 'Find residential streets near schools and parks that score high for temporary summer closures, giving kids safe outdoor play space.',  s: 'Especially: West Philadelphia',   sc: '#A5B4FC' },
                { e: '🍽️', t: 'Outdoor Dining',       d: 'Identify commercial corridors with strong FSI scores near restaurants and cafés — ideal for dining street programs and parklets.',    s: 'Especially: Center City, Manayunk', sc: '#C4B5FD' },
                { e: '🎨', t: 'Cultural Events',       d: 'Plan street closures around museums, theaters, and historic districts for festivals and community gatherings.',                         s: 'Especially: Italian Market, Arts corridor', sc: '#6EE7B7' },
                { e: '🚶', t: 'Pedestrian Corridors', d: 'Spot arterials with high pedestrian activity and fair FSI scores where temporary pedestrianization can be piloted with coordination.',  s: 'Especially: Broad St, Walnut St',   sc: '#FCD34D' },
              ].map(({ e, t, d, s, sc }) => (
                <div key={t} className="bg-white/[0.02] rounded-xl p-5 sm:p-6 border border-white/[0.06] hover:bg-white/[0.04] hover:border-white/[0.1] transition-all">
                  <div className="text-2xl sm:text-3xl mb-3 sm:mb-4">{e}</div>
                  <h3 className="text-base sm:text-xl font-bold text-gray-100 mb-2">{t}</h3>
                  <p className="text-xs sm:text-sm text-gray-500 mb-3 sm:mb-4 leading-relaxed">{d}</p>
                  <div className="text-xs sm:text-sm font-semibold" style={{ color: sc }}>{s} →</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── CTA ── */}
      <div className="py-16 sm:py-24 relative overflow-hidden border-t border-white/[0.04]">
        <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(99,102,241,0.08), rgba(147,51,234,0.08))' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] rounded-full blur-[100px] pointer-events-none" style={{ background: 'rgba(99,102,241,0.1)' }} />
        <div className="container mx-auto px-4 sm:px-6 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-5 sm:mb-6 tracking-wide">Ready to Explore Philadelphia's Streets?</h2>
            <p className="text-base sm:text-lg text-gray-400 mb-8 sm:mb-10">Start with the interactive map — enable the Flexibility Score layer and click any street to see its full analysis.</p>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
              <button onClick={() => navigate('/map')}
                className="group px-6 sm:px-8 py-3.5 sm:py-4 text-white rounded-lg transition-all font-semibold inline-flex items-center justify-center gap-2 text-sm sm:text-base"
                style={{ background: accent, boxShadow: `0 8px 24px ${accentShadow}` }}
                onMouseEnter={e => (e.currentTarget.style.background = accentHover)}
                onMouseLeave={e => (e.currentTarget.style.background = accent)}
              >
                Open Interactive Map <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 group-hover:translate-x-1 transition-transform" />
              </button>
              <button onClick={() => navigate('/dashboard')} className="px-6 sm:px-8 py-3.5 sm:py-4 text-gray-300 rounded-lg border border-white/[0.1] hover:border-white/[0.2] hover:bg-white/[0.04] transition-all font-semibold text-sm sm:text-base">
                View Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <footer className="py-10 sm:py-12 border-t border-white/[0.06] bg-[#0a0b10]">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 mb-8">
              <div className="col-span-2 sm:col-span-2 md:col-span-1">
                <div className="flex items-center gap-2 mb-3 sm:mb-4">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: accent }}><MapPin className="w-4 h-4 text-white" /></div>
                  <span className="text-gray-100 font-extrabold text-sm">Flexible Streets</span>
                </div>
                <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">Making Philadelphia's streets more flexible, accessible, and people-friendly.</p>
              </div>
              <div>
                <h3 className="text-gray-300 font-bold text-sm mb-3 sm:mb-4">Platform</h3>
                <ul className="space-y-2 text-xs sm:text-sm text-gray-500">
                  <li><button onClick={() => navigate('/map')} className="hover:text-gray-300 transition-colors">Interactive Map</button></li>
                  <li><button onClick={() => navigate('/dashboard')} className="hover:text-gray-300 transition-colors">Dashboard</button></li>
                </ul>
              </div>
              <div>
                <h3 className="text-gray-300 font-bold text-sm mb-3 sm:mb-4">Learn</h3>
                <ul className="space-y-2 text-xs sm:text-sm text-gray-500">
                  <li><a href="#about" className="hover:text-gray-300 transition-colors">About</a></li>
                  <li><a href="#features" className="hover:text-gray-300 transition-colors">Features</a></li>
                  <li><a href="#how-it-works" className="hover:text-gray-300 transition-colors">How It Works</a></li>
                </ul>
              </div>
              <div>
                <h3 className="text-gray-300 font-bold text-sm mb-3 sm:mb-4">Project</h3>
                <ul className="space-y-2 text-xs sm:text-sm text-gray-500">
                  <li><a href="https://github.com/FANYANG0304/flexible-street-platform" target="_blank" rel="noopener noreferrer" className="hover:text-gray-300 transition-colors">GitHub</a></li>
                </ul>
              </div>
            </div>
            <div className="border-t border-white/[0.06] pt-6 sm:pt-8 text-xs text-center text-gray-600">
              <p>© {currentYear} Flexible Streets Platform · Philadelphia Pilot Project · University of Pennsylvania</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
