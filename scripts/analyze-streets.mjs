#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import fs    from 'fs';
import http  from 'http';
import https from 'https';
import { config } from 'dotenv';

config();

// ── Config ────────────────────────────────────────────────────────────────────
const GOOGLE_SV_KEY = 'AIzaSyCYQ_bbFljqQr_g7NgDsPxq3G6Akh1aK6E';
const MODEL         = 'llava:7b';
const SV_SIZE       = '640x320';
const CONCURRENCY   = 4;
const BATCH_DELAY   = 300;
const MAX_RETRIES   = 3;

// ── Study zones: West Philadelphia (community) + Center City (commercial) ─────
// Pass --bbox to override, or --full to process all streets
const DEFAULT_BBOXES = [
  { minLng: -75.248, minLat: 39.948, maxLng: -75.198, maxLat: 39.976 }, // West Philadelphia
  { minLng: -75.178, minLat: 39.939, maxLng: -75.142, maxLat: 39.963 }, // Center City / Downtown
];

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
);

// ── Progress bar ──────────────────────────────────────────────────────────────
function renderProgress(done, total, startTime, errors, noImg) {
  const pct     = total > 0 ? done / total : 0;
  const BAR_W   = 28;
  const filled  = Math.round(pct * BAR_W);
  const bar     = '█'.repeat(filled) + '░'.repeat(BAR_W - filled);
  const elapsed = (Date.now() - startTime) / 1000;
  const rate    = elapsed > 0 ? done / elapsed : 0;
  const etaSec  = rate > 0 ? (total - done) / rate : 0;
  const fmt = s => s > 3600 ? `${(s/3600).toFixed(1)}h` : s > 60 ? `${Math.round(s/60)}min` : `${Math.round(s)}s`;
  process.stdout.write(
    `\r[${bar}] ${done}/${total} (${(pct*100).toFixed(1)}%)  ` +
    `✓${done} ✗${errors} 🚫${noImg}  ${(rate*60).toFixed(1)}/min  elapsed:${fmt(elapsed)}  ETA:${fmt(etaSec)}   `
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function withRetry(fn) {
  for (let i = 0; i < MAX_RETRIES; i++) {
    try { return await fn(); }
    catch (err) {
      if (i < MAX_RETRIES - 1) await sleep(3000);
      else throw err;
    }
  }
}

function midpoint(geometry) {
  const coords = geometry?.coordinates;
  if (!coords?.length) return null;
  const m = coords[Math.floor(coords.length / 2)];
  return { lat: m[1], lng: m[0] };
}

function inBbox(pt, bbox) {
  return pt.lng >= bbox.minLng && pt.lng <= bbox.maxLng &&
         pt.lat >= bbox.minLat && pt.lat <= bbox.maxLat;
}

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end',  () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function isNoImagery(buf) { return buf.length < 6000; }

async function getStreetViewBase64(lat, lng) {
  const url = `https://maps.googleapis.com/maps/api/streetview` +
    `?size=${SV_SIZE}&location=${lat},${lng}&fov=90&pitch=0&key=${GOOGLE_SV_KEY}`;
  const buf = await fetchBuffer(url);
  if (isNoImagery(buf)) return null;
  return buf.toString('base64');
}

async function analyzeStreet(imageBase64, streetName) {
  const body = JSON.stringify({
    model: MODEL,
    messages: [{
      role: 'user',
      content: `You are analyzing a Philadelphia street for urban planning purposes.
This is a Google Street View image of "${streetName || 'a Philadelphia street'}".

Reply with ONLY valid JSON, nothing else:
{"keywords":["adj1","adj2","adj3"],"score":NUMBER}

RULES:
- keywords: 3 different single adjectives about the walking experience
  Use varied words: vibrant/quiet/green/narrow/historic/industrial/lively/desolate/
  tree-lined/bustling/cozy/sterile/open/shadowed/welcoming/gritty/airy/
  rundown/charming/wide/cluttered/peaceful/residential/overgrown
- score: integer 0-100 based STRICTLY on what you see in this specific image
  Look at: trees, sidewalk quality, building condition, pedestrian space, activity signs
  0-20  = abandoned/severely bleak (no sidewalk, debris, boarded windows)
  21-40 = poor (cracked pavement, no greenery, industrial only)
  41-55 = below average (minimal greenery, worn but functional)
  56-70 = average (typical residential, some trees, clean)
  71-85 = good (nice sidewalks, greenery, active storefronts)
  86-100 = excellent (tree-lined, well-maintained, vibrant)
  IMPORTANT: Most Philadelphia streets score 40-70. Only give 71+ if you clearly see
  good trees/greenery AND well-maintained sidewalks. Only give <40 if truly bleak.`,
      images: [imageBase64],
    }],
    stream: false,
  });

  const res = await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1', port: 11434, path: '/api/chat', method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, r => {
      const chunks = [];
      r.on('data', c => chunks.push(c));
      r.on('end',  () => resolve({ status: r.statusCode, body: Buffer.concat(chunks).toString() }));
      r.on('error', reject);
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });

  if (res.status !== 200) throw new Error(`Ollama ${res.status}: ${res.body.slice(0, 200)}`);

  const data    = JSON.parse(res.body);
  const content = data.message?.content ?? '';
  const raw     = content.trim().replace(/```json|```/g, '').trim();
  const match   = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`No JSON in response`);
  const parsed  = JSON.parse(match[0]);

  if (!Array.isArray(parsed.keywords)) parsed.keywords = [];
  while (parsed.keywords.length < 3) parsed.keywords.push('urban');

  return {
    keywords: parsed.keywords.slice(0, 3).map(k => String(k).toLowerCase()),
    score:    Math.min(100, Math.max(0, parseInt(parsed.score) || 50)),
  };
}

function resolveStreetName(props) {
  return (props.stname || props.streetlabe || props.st_name || '').trim();
}

// ── Process one feature ───────────────────────────────────────────────────────
async function processFeature(feat, globalIndex, counters, total, startTime) {
  const props  = feat.properties ?? {};
  const fid    = props.objectid ?? props.seg_id ?? globalIndex;
  const name   = resolveStreetName(props);
  const label  = name || `Street #${fid}`;
  const pt     = midpoint(feat.geometry);
  if (!pt) { counters.skipped++; return; }

  try {
    const b64 = await getStreetViewBase64(pt.lat, pt.lng);
    if (!b64) { counters.noImagery++; return; }

    const result = await withRetry(() => analyzeStreet(b64, label));

    const { error } = await supabase.from('street_ai_scores').upsert({
      feature_id:  fid,
      street_name: label,
      ai_score:    result.score,
      keywords:    result.keywords,
      lat:         pt.lat,
      lng:         pt.lng,
      analyzed_at: new Date().toISOString(),
    });
    if (error) throw error;
    counters.processed++;
  } catch (err) {
    counters.errors++;
    process.stdout.write(`\n  ✗ [${label}] ${err.message}\n`);
  }

  renderProgress(
    counters.processed + counters.errors + counters.noImagery,
    total, startTime, counters.errors, counters.noImagery
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const args        = process.argv.slice(2);
  const geojsonPath = args[0];
  const limitIdx    = args.indexOf('--limit');
  const bboxIdx     = args.indexOf('--bbox');
  const fullIdx     = args.indexOf('--full');
  const limit       = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : Infinity;

  // Parse bbox(es): --bbox overrides with a single box; default = two study zones; --full = no filter
  let bboxes = null; // null means no filter (full city)
  if (fullIdx < 0) {
    if (bboxIdx >= 0) {
      const [minLng, minLat, maxLng, maxLat] = args[bboxIdx + 1].split(',').map(Number);
      bboxes = [{ minLng, minLat, maxLng, maxLat }];
    } else {
      bboxes = DEFAULT_BBOXES;
    }
  }

  if (!geojsonPath) {
    console.error('Usage: node scripts/analyze-streets.mjs <streets.geojson> [--limit N] [--bbox "minLng,minLat,maxLng,maxLat"] [--full]');
    process.exit(1);
  }
  if (!process.env.VITE_SUPABASE_URL) { console.error('❌  VITE_SUPABASE_URL missing'); process.exit(1); }

  try {
    await new Promise((resolve, reject) => {
      http.get('http://127.0.0.1:11434', r => resolve(r)).on('error', reject);
    });
    console.log('✅  Ollama is running');
  } catch {
    console.error('❌  Ollama is not running. Please open Ollama app first.');
    process.exit(1);
  }

  console.log(`📂  ${geojsonPath}`);
  const allFeatures = JSON.parse(fs.readFileSync(geojsonPath, 'utf-8')).features;
  console.log(`📍  Total features in file: ${allFeatures.length}`);
  if (bboxes) {
    bboxes.forEach((b, i) =>
      console.log(`📦  Zone ${i + 1}: lng[${b.minLng}, ${b.maxLng}] lat[${b.minLat}, ${b.maxLat}]`)
    );
    console.log(`    (use --full to process all streets, --bbox to set custom area)`);
  } else {
    console.log(`🌍  Full city mode (--full)`);
  }
  console.log(`🤖  Model: ${MODEL}  |  ⚡ Concurrency: ${CONCURRENCY}\n`);

  const { data: existing } = await supabase.from('street_ai_scores').select('feature_id');
  const done = new Set((existing ?? []).map(r => r.feature_id));
  console.log(`✅  Already in DB: ${done.size}\n`);

  const todo = [];
  for (let i = 0; i < allFeatures.length; i++) {
    const feat  = allFeatures[i];
    const props = feat.properties ?? {};
    const fid   = props.objectid ?? props.seg_id ?? i;
    if (done.has(fid)) continue;

    // Bbox filter — point must fall inside at least one study zone
    if (bboxes) {
      const pt = midpoint(feat.geometry);
      if (!pt || !bboxes.some(b => inBbox(pt, b))) continue;
    }

    todo.push({ feat, globalIndex: i });
    if (todo.length >= limit) break;
  }

  console.log(`🚀  To process: ${todo.length} streets${bboxes ? ' (in study zones)' : ''}\n`);
  if (todo.length === 0) { console.log('Nothing to do.'); return; }

  const counters  = { processed: 0, skipped: 0, noImagery: 0, errors: 0 };
  const startTime = Date.now();
  renderProgress(0, todo.length, startTime, 0, 0);

  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    const batch = todo.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(({ feat, globalIndex }) =>
        processFeature(feat, globalIndex, counters, todo.length, startTime)
      )
    );
    if (i + CONCURRENCY < todo.length) await sleep(BATCH_DELAY);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  process.stdout.write('\n');
  console.log('\n─────────────────────────────────────');
  console.log(`🎉  Done in ${elapsed}s`);
  console.log(`   processed=${counters.processed}  skipped=${counters.skipped}  noImagery=${counters.noImagery}  errors=${counters.errors}`);
}

main().catch(err => { console.error(err); process.exit(1); });
