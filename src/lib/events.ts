/**
 * Philadelphia event & holiday modifiers for FSI scoring.
 *
 * Two signals:
 *   1. Large events (Ticketmaster API) — streets near a major venue get a
 *      proximity boost because event crowds create pedestrian pressure that
 *      justifies temporary closures.
 *
 *   2. Philadelphia holiday calendar — fixed/variable holidays that
 *      historically see high street activation demand give a global city-wide
 *      bonus regardless of location.
 *
 * Event modifier: ×1.20 (<300 m) → ×1.10 (<1 km) → ×1.04 (<2.5 km) → ×1.0
 * Holiday modifier: ×1.08 – ×1.25 depending on event magnitude
 *
 * Both modifiers are applied multiplicatively in computeCompositeTotal after
 * the traffic and weather modifiers:
 *   adjusted = penalised × trafficMod × weatherMod × eventsMod × holidayMod
 *
 * Ticketmaster key: add VITE_TICKETMASTER_KEY to .env
 * Free tier: https://developer.ticketmaster.com  (5000 req/day, no CC)
 */

// ── Haversine ─────────────────────────────────────────────────────────────────

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R  = 6_371_000;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const dφ = (lat2 - lat1) * Math.PI / 180;
  const dλ = (lng2 - lng1) * Math.PI / 180;
  const a  = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PhillyEvent {
  id:       string;
  name:     string;
  lat:      number;
  lng:      number;
  date:     string;   // YYYY-MM-DD
  category: string;   // Music / Sports / Arts / etc.
}

export interface HolidayInfo {
  name:     string;
  icon:     string;
  modifier: number;   // 1.0 – 1.25
}

export interface EventModResult {
  mod:   number;
  label: string | null;  // name of the closest impactful event, or null
}

// ── Philadelphia holiday calendar ─────────────────────────────────────────────

/**
 * Day-of-month for the n-th occurrence of a weekday in a given month.
 * @param year    full year (e.g. 2026)
 * @param month   0-indexed (0=Jan … 11=Dec)
 * @param weekday 0=Sun … 6=Sat
 * @param n       1-based occurrence (1=first, 2=second, …)
 */
function nthWeekday(year: number, month: number, weekday: number, n: number): number {
  const firstDOW = new Date(year, month, 1).getDay();
  const offset   = (weekday - firstDOW + 7) % 7;
  return 1 + offset + (n - 1) * 7;
}

/**
 * Returns the Philadelphia holiday / festival active on `date`, or null.
 *
 * Holidays increase the FSI because street activation programmes (playstreets,
 * open streets, parade closures) are far more likely on these days.
 */
export function getPhillyHoliday(date: Date = new Date()): HolidayInfo | null {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;   // 1-indexed
  const d = date.getDate();

  // ── Fixed-date events ─────────────────────────────────────────────────────
  if (m === 1  && d === 1)  return { name: 'Mummers Parade',    icon: '🎭', modifier: 1.20 };
  if (m === 3  && d === 17) return { name: "St. Patrick's Day", icon: '☘️', modifier: 1.15 };
  if (m === 7  && d === 4)  return { name: 'Independence Day',  icon: '🎆', modifier: 1.25 };
  if (m === 12 && d === 25) return { name: 'Christmas Day',     icon: '🎄', modifier: 1.08 };
  if (m === 12 && d === 31) return { name: "New Year's Eve",    icon: '🎉', modifier: 1.15 };

  // ── Christmas Village: 15 Nov – 26 Dec ───────────────────────────────────
  if ((m === 11 && d >= 15) || (m === 12 && d <= 26)) {
    return { name: 'Christmas Village Season', icon: '🎄', modifier: 1.08 };
  }

  // ── Philadelphia Marathon: 3rd Sunday of November ────────────────────────
  if (m === 11) {
    const marathonDay = nthWeekday(y, 10, 0, 3);   // month 10 = Nov (0-idx), Sun = 0
    if (d === marathonDay) return { name: 'Philadelphia Marathon', icon: '🏃', modifier: 1.18 };
  }

  // ── Thanksgiving Day Parade: 4th Thursday of November ────────────────────
  if (m === 11) {
    const thanksgiving = nthWeekday(y, 10, 4, 4);  // 4th Thursday
    if (d === thanksgiving) return { name: 'Thanksgiving Day Parade', icon: '🦃', modifier: 1.18 };
  }

  // ── Penn Relays: last Fri–Sun of April ───────────────────────────────────
  if (m === 4) {
    // Last day of April is always the 30th
    const aprilLastDOW = new Date(y, 3, 30).getDay();       // DOW of Apr 30
    const lastSunday   = 30 - aprilLastDOW;                  // Apr 30 − DOW = last Sunday
    if (d >= lastSunday - 2 && d <= lastSunday) {
      return { name: 'Penn Relays Weekend', icon: '🏟️', modifier: 1.12 };
    }
  }

  // ── Made In America / Labor Day weekend ──────────────────────────────────
  if (m === 9 && d >= 1 && d <= 2) {
    const laborDay = nthWeekday(y, 8, 1, 1);   // 1st Monday of September
    if (d === laborDay || d === laborDay - 1) {
      return { name: 'Labor Day / Made In America', icon: '🎶', modifier: 1.12 };
    }
  }

  return null;
}

// ── Ticketmaster Discovery API ────────────────────────────────────────────────

/**
 * Keywords that identify an event as a *seasonal / festival* event worth
 * factoring into the street activation score. Routine concerts, regular
 * league games, club shows etc. are NOT counted — they happen year-round
 * without any distinct street-level activation signal.
 */
const SEASONAL_KEYWORDS = [
  'parade', 'festival', 'marathon', 'relay', 'carnival',
  'mummer', 'thanksgiving', 'made in america', 'juneteenth',
  'christmas village', 'pride', 'oktoberfest',
  'broad street run', 'restaurant week', 'fringe',
  'open streets', 'night market', 'block party',
  'puerto rican day', 'cherry blossom', 'flower show',
  'mlk day of service',
];

/** True when the event name matches a seasonal / festival keyword. */
export function isSeasonalEvent(ev: Pick<PhillyEvent, 'name'>): boolean {
  const n = (ev.name ?? '').toLowerCase();
  return SEASONAL_KEYWORDS.some(k => n.includes(k));
}

/**
 * Fetches events within 10 miles of Philadelphia for the next 7 days.
 * Returns an empty array when VITE_TICKETMASTER_KEY is not set or the
 * request fails (fail-silent — callers degrade gracefully to mod=1.0).
 *
 * Only *seasonal* events are returned (parades, festivals, marathons, etc.).
 * Routine concerts and games are dropped so the score bonus only fires for
 * the kind of civic event that actually draws street activation demand.
 */
export async function fetchPhillyEvents(): Promise<PhillyEvent[]> {
  const key = import.meta.env.VITE_TICKETMASTER_KEY as string | undefined;
  if (!key) return [];

  const now  = new Date();
  const later = new Date(now.getTime() + 7 * 86_400_000);
  const fmt  = (dt: Date) =>
    dt.toISOString().replace(/\.\d{3}Z$/, 'Z');   // Ticketmaster wants no ms

  const url =
    `https://app.ticketmaster.com/discovery/v2/events.json` +
    `?apikey=${key}` +
    `&latlong=39.9526,-75.1652` +
    `&radius=10&unit=miles` +
    `&startDateTime=${fmt(now)}&endDateTime=${fmt(later)}` +
    `&size=50&sort=date,asc`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn('Ticketmaster API error:', res.status);
      return [];
    }
    const json = await res.json();
    const out: PhillyEvent[] = [];

    for (const ev of (json?._embedded?.events ?? [])) {
      const name = ev.name as string;
      if (!isSeasonalEvent({ name })) continue;  // drop routine concerts / games

      const venue = ev._embedded?.venues?.[0];
      const lat   = parseFloat(venue?.location?.latitude  ?? '');
      const lng   = parseFloat(venue?.location?.longitude ?? '');
      if (isNaN(lat) || isNaN(lng)) continue;

      out.push({
        id:       ev.id  as string,
        name,
        lat, lng,
        date:     ev.dates?.start?.localDate as string ?? '',
        category: ev.classifications?.[0]?.segment?.name as string ?? 'Other',
      });
    }
    console.log(`✅ Loaded ${out.length} seasonal Philadelphia events`);
    return out;
  } catch (err) {
    console.warn('Ticketmaster fetch failed:', err);
    return [];
  }
}

// ── Per-street event modifier ─────────────────────────────────────────────────

/**
 * Returns the multiplicative score boost a street receives based on its
 * proximity to any upcoming large event in the `events` list.
 *
 * Rationale: when a major concert or sports game is taking place nearby,
 * pedestrian demand is high and temporary street closures become desirable.
 *
 * Decay table:
 *   d < 300 m  → ×1.20  (immediately adjacent to venue)
 *   d < 1 km   → ×1.10  (event walking corridor)
 *   d < 2.5 km → ×1.04  (broader neighbourhood draw)
 *   else       → ×1.00  (no meaningful influence)
 */
export function getEventModifier(lat: number, lng: number, events: PhillyEvent[]): EventModResult {
  if (events.length === 0) return { mod: 1.0, label: null };

  let bestMod   = 1.0;
  let bestLabel: string | null = null;

  for (const ev of events) {
    const d = haversineM(lat, lng, ev.lat, ev.lng);
    const mod = d < 300 ? 1.20 : d < 1000 ? 1.10 : d < 2500 ? 1.04 : 1.0;
    if (mod > bestMod) {
      bestMod   = mod;
      bestLabel = `${ev.name}`;
    }
  }

  return { mod: bestMod, label: bestLabel };
}
