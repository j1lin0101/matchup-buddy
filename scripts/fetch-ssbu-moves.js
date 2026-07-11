'use strict';
/**
 * fetch-ssbu-moves.js
 * Builds app/public/data/ssbu/<slug>.json — per-character move + shield-safety
 * data for Smash Ultimate, mirroring the shape of app/public/data/roa2/*.json
 * so app/src/analysis/analysisSsbu.js can follow the same iteration patterns
 * as app/src/analysis/analysis.js.
 *
 * Sources:
 *   dragdown.wiki SSBU_MoveData     – per-hitbox active frames + pre-baked shield safety
 *   dragdown.wiki SSBU_CharacterData – jump_squat_frame (3 for everyone except Kazuya's 6)
 *   ssbwiki.com "Air dodge" article  – per-character neutral-airdodge intangibility start
 *                                      frame + total duration (dragdown has no airdodge data)
 *
 * Ice Climbers quirk: dragdown's roster (app/public/data/ssbu/characters.json) lists
 * "Nana" and "Popo" as separate selectable characters, but both SSBU_MoveData and the
 * ssbwiki airdodge table only have a single combined "Ice Climbers" entry — SHARED_OVERRIDES
 * maps both names to that shared lookup key. jump_squat_frame is NOT affected: SSBU_CharacterData
 * has its own separate Nana/Popo rows there.
 *
 * Echo-fighter quirk: R.O.B./Daisy/Dark Samus/Richter have their own airdodge rows on
 * ssbwiki, but SSBU_MoveData folds their movesets into a differently-named or shared
 * base-character row (see MOVE_DATA_OVERRIDES) — that override is move-data-only.
 */

const fetch = require('node-fetch');
const fs    = require('fs');
const path  = require('path');

const CARGO_BASE  = 'https://dragdown.wiki/wiki/Special:CargoExport';
const SSBWIKI_API = 'https://www.ssbwiki.com/api.php';
const UA          = 'MatchupBuddy/1.0 (https://matchupbuddy.gg)';
const OUT_DIR     = path.join(__dirname, '../app/public/data/ssbu');
const ROSTER_PATH = path.join(OUT_DIR, 'characters.json');

// Nana/Popo -> Ice Climbers: SSBU_MoveData and ssbwiki's airdodge table both only
// have one combined "Ice Climbers" entry, so both lookups need this override.
const SHARED_OVERRIDES = { Nana: 'Ice Climbers', Popo: 'Ice Climbers' };

// R.O.B. is stored as "ROB" (no periods) in SSBU_MoveData specifically. Daisy/Dark
// Samus/Richter are echo fighters whose movesets dragdown folds into their base
// character's SSBU_MoveData rows rather than duplicating — but they DO have their
// own distinct airdodge rows on ssbwiki, so this override is move-data-only.
const MOVE_DATA_OVERRIDES = {
  ...SHARED_OVERRIDES,
  'R.O.B.': 'ROB',
  Daisy: 'Peach',
  'Dark Samus': 'Samus',
  Richter: 'Simon',
};

function decodeEntities(str) {
  return String(str)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&');
}

async function withRetry(fn, label, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === attempts) throw new Error(`${label} failed after ${attempts} attempts: ${err.message}`);
      await new Promise(r => setTimeout(r, i * 1000));
    }
  }
}

async function cargoExport(params) {
  return withRetry(async () => {
    const res = await fetch(`${CARGO_BASE}?${params}`, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }, `CargoExport ${params.get('tables')}`);
}

// SSBU_MoveData has ~5515 rows; the server caps a single CargoExport response at
// 5000, so page through with offset until a short page signals the end.
async function fetchAllMoveRows() {
  const rows = [];
  const pageSize = 5000;
  let offset = 0;
  for (;;) {
    const params = new URLSearchParams({
      tables: 'SSBU_MoveData',
      fields: 'chara,attack,name,active,safety',
      where:  'chara IS NOT NULL',
      format: 'json',
      limit:  String(pageSize),
      offset: String(offset),
    });
    const page = await cargoExport(params);
    rows.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return rows;
}

async function fetchJumpSquats() {
  const params = new URLSearchParams({
    tables: 'SSBU_CharacterData',
    fields: 'chara,jump_squat_frame',
    where:  'chara IS NOT NULL',
    format: 'json',
    limit:  '200',
  });
  const rows = await cargoExport(params);
  const map = new Map();
  rows.forEach(r => map.set(decodeEntities(r.chara), Number(r['jump squat frame'])));
  return map;
}

// Parses the ssbwiki.com "Air dodge" article's Ultimate wikitable into
// { name -> { startup, totalFrames } }. startup = first frame of the "Fresh"
// neutral-airdodge intangibility window; totalFrames = neutral airdodge duration.
async function fetchAirdodgeData() {
  const params = new URLSearchParams({
    action: 'query',
    titles: 'Air dodge',
    prop: 'revisions',
    rvprop: 'content',
    format: 'json',
  });
  const data = await withRetry(async () => {
    const res = await fetch(`${SSBWIKI_API}?${params}`, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }, 'Fetching ssbwiki Air dodge article');

  const page = Object.values(data.query.pages)[0];
  const content = page.revisions[0]['*'];

  const tableStart = content.indexOf('{|class="wikitable sortable" style="text-align:center;"\n!rowspan=3|Characters');
  const tableEnd = content.indexOf('\n|}', tableStart);
  if (tableStart === -1 || tableEnd === -1) {
    throw new Error('Could not locate the Ultimate air dodge table in ssbwiki content');
  }
  const table = content.slice(tableStart, tableEnd);

  const result = new Map();
  table.split('\n|-\n').forEach(row => {
    const nameMatch = row.match(/\{\{CharHead\|([^|}]+)\|SSBU\}\}/);
    if (!nameMatch) return;
    const name = nameMatch[1];
    const dataLine = row.split('\n').find(l => l.includes('||') && !l.includes('CharHead'));
    if (!dataLine) return;
    const cells = dataLine.replace(/^\|/, '').split('||');
    const freshMatch = cells[0].match(/^(\d+)/);
    const totalFrames = parseInt(cells[2], 10);
    if (!freshMatch || Number.isNaN(totalFrames)) return;
    result.set(name, { startup: parseInt(freshMatch[1], 10), totalFrames });
  });
  return result;
}

// "active" -> startup: first integer found ("6-7" -> 6, "23" -> 23,
// "5/7/9/11 / 5/7/9/11" -> 5, "2 + 19 Charging" -> 2). Returns null if none.
function parseStartup(active) {
  if (active === null || active === undefined) return null;
  const m = String(active).match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

// "safety" -> {min,max}: strips the charged-variant tooltip text (keeping only
// the base/uncharged number), then takes the min/max of all remaining numbers
// (handles plain numbers, ranges, and slash-separated multi-hit variants).
// N/A / NaN / "-" sentinels -> null (hitbox excluded from shield analysis).
function parseShieldSafety(safety) {
  if (safety === null || safety === undefined) return null;
  let s = decodeEntities(String(safety));
  if (/^\s*(N\/A|NaN|-)\s*$/i.test(s.trim())) return null;
  s = s.replace(/<span class="tooltiptext"[^>]*>.*?<\/span>/gi, '');
  s = s.replace(/<[^>]+>/g, '');
  const nums = [...s.matchAll(/-?\d+(?:\.\d+)?/g)].map(m => parseFloat(m[0]));
  if (!nums.length) return null;
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

function buildCharacterMoves(rows) {
  const moves = new Map(); // move name -> hitboxes[]
  rows.forEach(row => {
    const moveName = decodeEntities(row.attack);
    const startup  = parseStartup(row.active);
    const shieldSafety = parseShieldSafety(row.safety);
    const hitboxName = row.name ? decodeEntities(row.name) : null;
    // "Landing" hitboxes fire when an aerial's landing-lag window hits, not when
    // the move is first thrown out — excluding them from the move-level startup
    // avoids e.g. Mario's Down Aerial (real startup ~5) looking like a 1f move
    // because its landing hit is active on frame 1 of the landing animation.
    const isLandingHitbox = hitboxName && /landing/i.test(hitboxName);
    if (!moves.has(moveName)) moves.set(moveName, { move: moveName, startup: null, hitboxes: [] });
    const move = moves.get(moveName);
    if (!isLandingHitbox && startup !== null && (move.startup === null || startup < move.startup)) {
      move.startup = startup;
    }
    move.hitboxes.push({
      hitbox: hitboxName,
      shieldSafety,
      shieldRaw: shieldSafety ? decodeEntities(String(row.safety)).replace(/<[^>]+>/g, '') : null,
    });
  });
  // Fall back to the landing hitbox's startup only if a move has no non-landing
  // hitbox with a known startup at all (rare, but avoids leaving startup null).
  moves.forEach(move => {
    if (move.startup !== null) return;
    const landingRow = rows.find(r => decodeEntities(r.attack) === move.move && parseStartup(r.active) !== null);
    if (landingRow) move.startup = parseStartup(landingRow.active);
  });
  return Array.from(moves.values());
}

async function main() {
  const { characters } = require(ROSTER_PATH);
  console.log(`Loaded ${characters.length} characters from roster.`);

  console.log('Fetching all SSBU_MoveData rows...');
  const allRows = await fetchAllMoveRows();
  console.log(`  ${allRows.length} rows fetched.`);
  const rowsByChara = new Map();
  allRows.forEach(row => {
    const chara = decodeEntities(row.chara);
    if (!rowsByChara.has(chara)) rowsByChara.set(chara, []);
    rowsByChara.get(chara).push(row);
  });

  console.log('Fetching jumpsquat frames...');
  const jumpSquats = await fetchJumpSquats();

  console.log('Fetching airdodge data from ssbwiki.com...');
  const airdodgeData = await fetchAirdodgeData();

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const missingMoves = [];
  const missingAirdodge = [];
  const missingJumpSquat = [];

  characters.forEach(({ name, slug }) => {
    const moveKey = MOVE_DATA_OVERRIDES[name] || name;
    const rows = rowsByChara.get(moveKey) || [];
    if (!rows.length) missingMoves.push(name);

    const jumpSquat = jumpSquats.get(name);
    if (jumpSquat === undefined) missingJumpSquat.push(name);

    const airdodgeKey = SHARED_OVERRIDES[name] || name;
    const airdodge = airdodgeData.get(airdodgeKey);
    if (!airdodge) missingAirdodge.push(name);

    const out = {
      character: name,
      slug,
      scrapedAt: new Date().toISOString(),
      jumpSquat: jumpSquat ?? null,
      airdodge: airdodge || null,
      moves: buildCharacterMoves(rows),
    };
    fs.writeFileSync(path.join(OUT_DIR, `${slug}.json`), JSON.stringify(out, null, 2) + '\n');
  });

  console.log(`\nWrote ${characters.length} character files to ${OUT_DIR}`);
  if (missingMoves.length)     console.log(`  WARNING: no move data for: ${missingMoves.join(', ')}`);
  if (missingJumpSquat.length) console.log(`  WARNING: no jumpsquat for: ${missingJumpSquat.join(', ')}`);
  if (missingAirdodge.length)  console.log(`  WARNING: no airdodge data for: ${missingAirdodge.join(', ')}`);
}

main().catch(err => { console.error(err); process.exit(1); });
