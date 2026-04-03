/**
 * Seed Philadelphia historical & existing Open Streets data into Supabase.
 * Geometries extracted directly from Street_Centerline.geojson.
 * Run: node scripts/seed-open-streets.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { readFileSync } from 'fs';
config();

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// ── Load street geometry source ───────────────────────────────────────────────
const geojson = JSON.parse(readFileSync('./flexible street data source/Street_Centerline.geojson'));
const features = geojson.features;

/**
 * Extract and merge all segments of a street within a bounding box.
 * Returns a single GeoJSON LineString.
 */
function extractStreet(stnamePattern, minLng, minLat, maxLng, maxLat, sortAxis = 'lat') {
  const segs = features.filter(feat => {
    const stn = (feat.properties.stname || '').toUpperCase();
    if (!stnamePattern.test(stn)) return false;
    return feat.geometry.coordinates.some(
      ([lng, lat]) => lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat
    );
  });

  if (!segs.length) return null;

  let all = segs.flatMap(s => s.geometry.coordinates);
  // Sort so the LineString flows in one direction
  all.sort(sortAxis === 'lat'
    ? (a, b) => b[1] - a[1]   // north → south
    : (a, b) => a[0] - b[0]   // west → east
  );
  // Deduplicate
  all = all.filter((c, i) =>
    i === 0 ||
    Math.abs(c[0] - all[i-1][0]) > 0.000005 ||
    Math.abs(c[1] - all[i-1][1]) > 0.000005
  );

  return { type: 'LineString', coordinates: all };
}

// ── Build geometries from real street data ───────────────────────────────────
const GEOM = {
  // Walnut St 13th → 19th (Center City)
  WALNUT_13_19: extractStreet(
    /^WALNUT ST$/,
    -75.178, 39.948, -75.159, 39.951, 'lng'
  ),
  // 13th St Chestnut → Locust (Midtown Village)
  ST13_CHESTNUT_LOCUST: extractStreet(
    /13TH ST/,
    -75.165, 39.946, -75.158, 39.953, 'lat'
  ),
  // Baltimore Ave 40th → 51st (West Philly)
  BALTIMORE_40_51: extractStreet(
    /^BALTIMORE AVE$/,
    -75.240, 39.948, -75.200, 39.962, 'lng'
  ),
  // Sansom St 19th → 22nd (COVID dining, Rittenhouse)
  SANSOM_19_22: extractStreet(
    /^SANSOM ST$/,
    -75.180, 39.948, -75.168, 39.954, 'lng'
  ),
  // Frankford Ave (Fishtown, near Girard Ave)
  FRANKFORD_FISHTOWN: extractStreet(
    /^FRANKFORD AVE$/,
    -75.136, 39.968, -75.130, 39.982, 'lat'
  ),
  // 9th St Christian → Washington (Italian Market)
  ST9_ITALIAN_MARKET: extractStreet(
    /9TH ST/,
    -75.160, 39.933, -75.152, 39.942, 'lat'
  ),
  // Broad St (Broad Street Run corridor)
  BROAD_RUN: extractStreet(
    /BROAD ST/,
    -75.172, 39.870, -75.160, 39.956, 'lat'
  ),
  // Main St Manayunk
  MAIN_MANAYUNK: extractStreet(
    /^MAIN ST$/,
    -75.232, 40.020, -75.218, 40.030, 'lng'
  ),
  // Play Streets – West Philly
  PINE_49_50: extractStreet(
    /^PINE ST$/,
    -75.238, 39.951, -75.228, 39.956, 'lng'
  ),
  CATHERINE_48_50: extractStreet(
    /^CATHARINE ST$/,
    -75.238, 39.948, -75.228, 39.953, 'lng'
  ),
  SPRUCE_50_52: extractStreet(
    /^SPRUCE ST$/,
    -75.242, 39.952, -75.230, 39.957, 'lng'
  ),
  LOCUST_46_48: extractStreet(
    /^LOCUST ST$/,
    -75.232, 39.952, -75.220, 39.957, 'lng'
  ),
  OSAGE_50_52: extractStreet(
    /^OSAGE AVE$/,
    -75.242, 39.950, -75.228, 39.955, 'lng'
  ),
  // Block parties – very short local streets
  MOLE_ST: extractStreet(
    /^MOLE ST$/,
    -75.162, 39.952, -75.158, 39.956, 'lng'
  ),
  PERCY_ST: extractStreet(
    /^PERCY ST$/,
    -75.174, 39.942, -75.170, 39.946, 'lng'
  ),
  SARTAIN_ST: extractStreet(
    /^SARTAIN ST$/,
    -75.162, 39.945, -75.158, 39.949, 'lng'
  ),
};

// Log what was found
Object.entries(GEOM).forEach(([k, v]) => {
  if (!v) console.warn(`⚠️  No geometry found for ${k}`);
  else console.log(`✅ ${k}: ${v.coordinates.length} coords`);
});

// ── Helper ────────────────────────────────────────────────────────────────────
function expand(template, dates) {
  return dates.map(([date, dow]) => ({ ...template, event_date: date, day_of_week: dow }));
}

// ── Build rows ────────────────────────────────────────────────────────────────
const rows = [

  // 1. CCD – Walnut St 13th → 19th (2023 pilot)
  ...expand({
    series_name:  'CCD Open Streets – Walnut',
    street_name:  'Walnut St',
    location_desc:'13th St to 19th St',
    neighborhood: 'Rittenhouse / Washington Square West',
    zone_type:    'commercial',
    open_time:    '10:00:00',
    close_time:   '17:00:00',
    notes:        'Full vehicle closure. Retail spill-out, seating, performances. Center City District pilot.',
    source_url:   'https://centercityphila.org/programs/open-streets',
    geometry:     GEOM.WALNUT_13_19,
  }, [
    ['2023-09-10','Sunday'],['2023-09-17','Sunday'],['2023-09-24','Sunday'],
    ['2023-10-01','Sunday'],['2023-10-08','Sunday'],
  ]),

  // 2. Midtown Village – 13th St Chestnut → Locust
  ...expand({
    series_name:  'Midtown Village Street Activation',
    street_name:  '13th St',
    location_desc:'Chestnut St to Locust St',
    neighborhood: 'Midtown Village',
    zone_type:    'commercial',
    open_time:    '18:00:00',
    close_time:   '23:00:00',
    notes:        'Seasonal evening closures tied to festivals and food/nightlife events. Strong non-daytime demand profile.',
    source_url:   'https://midtownvillage.org',
    geometry:     GEOM.ST13_CHESTNUT_LOCUST,
  }, [
    ['2024-06-07','Friday'],['2024-06-14','Friday'],['2024-06-21','Friday'],
    ['2024-07-05','Friday'],['2024-07-12','Friday'],['2024-08-02','Friday'],
    ['2024-09-06','Friday'],
  ]),

  // 3. Play Streets – West Philly (summer 2024)
  ...expand({
    series_name:'Philadelphia Play Streets', street_name:'Pine St',
    location_desc:'49th St to 50th St', neighborhood:'Walnut Hill',
    zone_type:'community', open_time:'10:00:00', close_time:'16:00:00',
    notes:'Temporary weekday closure for children\'s play. Community-run with Philadelphia Parks & Recreation.',
    source_url:'https://www.phila.gov/programs/play-streets/',
    geometry: GEOM.PINE_49_50,
  }, [
    ['2024-07-08','Monday'],['2024-07-09','Tuesday'],['2024-07-10','Wednesday'],
    ['2024-07-11','Thursday'],['2024-07-12','Friday'],
    ['2024-07-15','Monday'],['2024-07-16','Tuesday'],['2024-07-17','Wednesday'],
  ]),

  ...expand({
    series_name:'Philadelphia Play Streets', street_name:'Catharine St',
    location_desc:'48th St to 50th St', neighborhood:'Walnut Hill',
    zone_type:'community', open_time:'10:00:00', close_time:'16:00:00',
    notes:'Temporary weekday closure for children\'s play.',
    source_url:'https://www.phila.gov/programs/play-streets/',
    geometry: GEOM.CATHERINE_48_50,
  }, [
    ['2024-07-22','Monday'],['2024-07-23','Tuesday'],['2024-07-24','Wednesday'],
    ['2024-07-25','Thursday'],['2024-07-26','Friday'],
  ]),

  ...expand({
    series_name:'Philadelphia Play Streets', street_name:'Spruce St',
    location_desc:'50th St to 52nd St', neighborhood:'Cedar Park',
    zone_type:'community', open_time:'10:00:00', close_time:'16:00:00',
    notes:'Temporary weekday closure for children\'s play.',
    source_url:'https://www.phila.gov/programs/play-streets/',
    geometry: GEOM.SPRUCE_50_52,
  }, [
    ['2024-08-05','Monday'],['2024-08-06','Tuesday'],['2024-08-07','Wednesday'],
    ['2024-08-08','Thursday'],['2024-08-09','Friday'],
  ]),

  ...expand({
    series_name:'Philadelphia Play Streets', street_name:'Locust St',
    location_desc:'46th St to 48th St', neighborhood:'Spruce Hill',
    zone_type:'community', open_time:'10:00:00', close_time:'16:00:00',
    notes:'Temporary weekday closure for children\'s play.',
    source_url:'https://www.phila.gov/programs/play-streets/',
    geometry: GEOM.LOCUST_46_48,
  }, [
    ['2024-08-12','Monday'],['2024-08-13','Tuesday'],['2024-08-14','Wednesday'],
  ]),

  ...expand({
    series_name:'Philadelphia Play Streets', street_name:'Osage Ave',
    location_desc:'50th St to 52nd St', neighborhood:'Cedar Park',
    zone_type:'community', open_time:'10:00:00', close_time:'16:00:00',
    notes:'Temporary weekday closure for children\'s play.',
    source_url:'https://www.phila.gov/programs/play-streets/',
    geometry: GEOM.OSAGE_50_52,
  }, [
    ['2024-07-29','Monday'],['2024-07-30','Tuesday'],['2024-07-31','Wednesday'],
  ]),

  // 4a. COVID Outdoor Dining – Sansom St
  ...expand({
    series_name:'COVID Outdoor Dining – Sansom St', street_name:'Sansom St',
    location_desc:'19th St to 22nd St', neighborhood:'Rittenhouse Square',
    zone_type:'commercial', open_time:'11:00:00', close_time:'22:00:00',
    notes:'Curb lane → dining platforms. COVID outdoor dining permit program 2020–2022.',
    source_url:'https://www.phila.gov/2020-06-19-philadelphia-launches-outdoor-dining-program/',
    geometry: GEOM.SANSOM_19_22,
  }, [
    ['2021-06-01','Tuesday'],['2021-07-01','Thursday'],['2021-08-01','Sunday'],
    ['2021-09-01','Wednesday'],['2022-06-01','Wednesday'],['2022-07-15','Friday'],
  ]),

  // 4b. COVID Outdoor Dining – Frankford Ave Fishtown
  ...expand({
    series_name:'COVID Outdoor Dining – Frankford Ave', street_name:'Frankford Ave',
    location_desc:'Girard Ave to Berks St', neighborhood:'Fishtown',
    zone_type:'commercial', open_time:'12:00:00', close_time:'23:00:00',
    notes:'Curb lane repurposed for outdoor dining during COVID program 2020–2022.',
    source_url:'https://www.phila.gov/2020-06-19-philadelphia-launches-outdoor-dining-program/',
    geometry: GEOM.FRANKFORD_FISHTOWN,
  }, [
    ['2021-06-15','Tuesday'],['2021-07-15','Thursday'],['2021-08-15','Sunday'],
    ['2022-06-15','Wednesday'],['2022-07-04','Monday'],
  ]),

  // 5. Open Streets West Philly – Baltimore Ave
  ...expand({
    series_name:'Open Streets West Philly', street_name:'Baltimore Ave',
    location_desc:'40th St to 51st St', neighborhood:'Cedar Park / University City',
    zone_type:'community', open_time:'10:00:00', close_time:'17:00:00',
    notes:'Full pedestrianization. Vendors, performances, community use. University City District partnership 2020–2021.',
    source_url:'https://www.universitycity.org/openstreets',
    geometry: GEOM.BALTIMORE_40_51,
  }, [
    ['2020-08-02','Sunday'],['2020-08-09','Sunday'],['2020-08-16','Sunday'],
    ['2020-08-23','Sunday'],['2020-09-06','Sunday'],['2020-09-13','Sunday'],
    ['2021-07-25','Sunday'],['2021-08-01','Sunday'],['2021-08-08','Sunday'],
    ['2021-08-15','Sunday'],['2021-08-22','Sunday'],
  ]),

  // 6. Broad Street Run
  { series_name:'Broad Street Run', street_name:'Broad St',
    location_desc:'City Hall to Pattison Ave (10-mile route)',
    neighborhood:'Citywide Spine', zone_type:'event',
    event_date:'2024-05-05', day_of_week:'Sunday',
    open_time:'07:00:00', close_time:'13:00:00',
    notes:'Annual 10-mile race, ~30,000 participants. Full road closure. High conflict factor tolerated due to event scale.',
    source_url:'https://www.broadstreetrun.com',
    geometry: GEOM.BROAD_RUN,
  },
  { series_name:'Broad Street Run', street_name:'Broad St',
    location_desc:'City Hall to Pattison Ave (10-mile route)',
    neighborhood:'Citywide Spine', zone_type:'event',
    event_date:'2025-05-04', day_of_week:'Sunday',
    open_time:'07:00:00', close_time:'13:00:00',
    notes:'Annual 10-mile race, ~30,000 participants.',
    source_url:'https://www.broadstreetrun.com',
    geometry: GEOM.BROAD_RUN,
  },

  // 7. Italian Market Festival
  { series_name:'Italian Market Festival', street_name:'9th St',
    location_desc:'Christian St to Washington Ave',
    neighborhood:'Italian Market / Bella Vista', zone_type:'event',
    event_date:'2024-05-18', day_of_week:'Saturday',
    open_time:'09:00:00', close_time:'18:00:00',
    notes:'Annual cultural street closure. Strong historic anchor influence.',
    source_url:'https://www.italianmarketphilly.org/festival',
    geometry: GEOM.ST9_ITALIAN_MARKET,
  },
  { series_name:'Italian Market Festival', street_name:'9th St',
    location_desc:'Christian St to Washington Ave',
    neighborhood:'Italian Market / Bella Vista', zone_type:'event',
    event_date:'2024-05-19', day_of_week:'Sunday',
    open_time:'09:00:00', close_time:'18:00:00',
    notes:'Annual cultural street closure.',
    source_url:'https://www.italianmarketphilly.org/festival',
    geometry: GEOM.ST9_ITALIAN_MARKET,
  },

  // 8. Manayunk StrEAT Festival
  { series_name:'Manayunk StrEAT Food Festival', street_name:'Main St',
    location_desc:'Cresson St to Roxborough Ave',
    neighborhood:'Manayunk', zone_type:'event',
    event_date:'2024-06-08', day_of_week:'Saturday',
    open_time:'11:00:00', close_time:'21:00:00',
    notes:'Annual food festival with full street closure. Operator: Manayunk Development Corporation.',
    source_url:'https://www.manayunk.com/events',
    geometry: GEOM.MAIN_MANAYUNK,
  },
  { series_name:'Manayunk StrEAT Food Festival', street_name:'Main St',
    location_desc:'Cresson St to Roxborough Ave',
    neighborhood:'Manayunk', zone_type:'event',
    event_date:'2024-06-09', day_of_week:'Sunday',
    open_time:'11:00:00', close_time:'20:00:00',
    notes:'Annual food festival with full street closure.',
    source_url:'https://www.manayunk.com/events',
    geometry: GEOM.MAIN_MANAYUNK,
  },

  // 9. Residential Block Parties
  ...expand({
    series_name:'Residential Block Party', street_name:'Mole St',
    location_desc:'19th St to 20th St', neighborhood:'Rittenhouse Square',
    zone_type:'community', open_time:'12:00:00', close_time:'20:00:00',
    notes:'City-permitted residential block party. One of thousands of annual closures.',
    source_url:'https://www.phila.gov/services/permits-violations-licenses/get-a-permit/block-party-permit/',
    geometry: GEOM.MOLE_ST,
  }, [['2024-07-04','Thursday'],['2024-08-10','Saturday']]),

  ...expand({
    series_name:'Residential Block Party', street_name:'Percy St',
    location_desc:'South St to Bainbridge St', neighborhood:'South Philadelphia',
    zone_type:'community', open_time:'13:00:00', close_time:'21:00:00',
    notes:'City-permitted residential block party.',
    source_url:'https://www.phila.gov/services/permits-violations-licenses/get-a-permit/block-party-permit/',
    geometry: GEOM.PERCY_ST,
  }, [['2024-06-22','Saturday'],['2024-09-07','Saturday']]),

  ...expand({
    series_name:'Residential Block Party', street_name:'Sartain St',
    location_desc:'Pine St to Spruce St', neighborhood:'Washington Square West',
    zone_type:'community', open_time:'14:00:00', close_time:'22:00:00',
    notes:'City-permitted residential block party.',
    source_url:'https://www.phila.gov/services/permits-violations-licenses/get-a-permit/block-party-permit/',
    geometry: GEOM.SARTAIN_ST,
  }, [['2024-08-03','Saturday'],['2024-08-31','Saturday']]),
];

// Filter out rows with missing geometry
const valid = rows.filter(r => {
  if (!r.geometry) { console.warn('Skipping (no geometry):', r.series_name, r.street_name); return false; }
  return true;
});

// ── Delete previously wrong-coord rows (id >= 46) ────────────────────────────
console.log('\nDeleting previously inserted wrong-coord rows...');
const { error: delErr } = await sb.from('street_events').delete().gte('id', 46);
if (delErr) console.error('Delete error:', delErr.message);
else console.log('✅ Deleted rows id >= 46');

// ── Insert corrected rows ─────────────────────────────────────────────────────
console.log(`\nInserting ${valid.length} corrected rows...`);
const BATCH = 50;
for (let i = 0; i < valid.length; i += BATCH) {
  const batch = valid.slice(i, i + BATCH);
  const { error } = await sb.from('street_events').insert(batch);
  if (error) console.error(`Batch ${i}–${i+BATCH} failed:`, error.message);
  else console.log(`✅ Inserted rows ${i+1}–${Math.min(i+BATCH, valid.length)}`);
}
console.log('Done.');
