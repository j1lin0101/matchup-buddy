'use strict';
/**
 * fetch-melee-data.js
 * Builds app/public/data/ssbm/characters.json (roster) and app/public/data/ssbm/<slug>.json
 * (per-character move + shield-safety data) for Super Smash Bros. Melee, plus
 * app/public/icons/ssbm/<slug>.png stock icons — mirroring the shape of
 * app/public/data/roa2/*.json so app/src/analysis/analysisMelee.js can follow the
 * same iteration patterns as app/src/analysis/analysis.js.
 *
 * Source: FightCore/frame-data (https://github.com/FightCore/frame-data), GPL-3.0
 * licensed, README explicitly states the data/ JSON files are "free to be used by
 * others." One combined characters.json file covers all 26 characters (plus an
 * unused "fwireframe" placeholder we exclude) with real per-hitbox damage/knockback/
 * hitlag/shieldstun, per-character jumpsquat, and a numeric move `type` field for
 * reliable categorization — no messy Wikitext parsing needed this time.
 *
 * Shield safety formula: FightCore gives raw shieldstun per hitbox but not a final
 * frame-advantage number, so we compute it ourselves — using the exact same formula
 * already proven correct for Rivals of Aether 2 in scripts/cargo-scrape.js, since
 * Rivals' own shield mechanics were explicitly modeled after Melee's:
 *   Grounded: advantage = shieldstun - 1 - (iasa - hit.end - 1)
 *   Aerial:   advantage = shieldstun - 1 - lCanceledLandLag  (assumes proper L-cancel)
 * The "-1" is the same "shared frame" constant cargo-scrape.js uses for Rivals.
 *
 * Icon naming on ssbwiki.com is `{Name}Head{Game}.png` with spaces and periods
 * stripped but "&" kept literal (e.g. "CaptainFalconHeadSSBM.png",
 * "MrGame&WatchHeadSSBM.png") — verified for several multi-word/punctuated names.
 *
 * Up Special identification: cross-checked against outofshield.com's published
 * Melee OOS numbers (Fox: Shine=4, Nair=7, Bair=7, Grab=7, Up-Smash=8, Dair=8,
 * Fair=9, Uair=11/14 — all matched our raw data exactly). This revealed that in
 * real Melee, jump-cancelling Up Smash or Up Special out of shield skips jumpsquat
 * entirely (OOS ≈ raw startup + 1), unlike aerials which must wait through the
 * full jumpsquat. Up Smash is reliably identifiable by name across the whole
 * cast ("Up Smash" is universal), but Up Special uses each character's unique
 * flavor name (e.g. Fox's "Fire Fox") — so we cross-reference ssbwiki.com's
 * {{MovesetTable}} `usname` param per character (same technique already proven
 * for SSBU) to flag which move is functionally the Up Special.
 */

const fetch = require('node-fetch');
const fs    = require('fs');
const path  = require('path');

const FRAME_DATA_URL = 'https://raw.githubusercontent.com/FightCore/frame-data/main/data/characters.json';
const SSBWIKI_API    = 'https://www.ssbwiki.com/api.php';
const UA              = 'MatchupBuddy/1.0 (https://matchupbuddy.gg)';
const OUT_DIR         = path.join(__dirname, '../app/public/data/ssbm');
const ICONS_DIR       = path.join(__dirname, '../app/public/icons/ssbm');

// Not a real fighter — an internal placeholder entry in FightCore's data.
const EXCLUDED_CHARACTERS = new Set(['fwireframe']);

// Universal Melee constant: L-cancelled landing lag from a wavedash airdodge is
// 10 frames for every character (verified: "Landing Lag/Generalized Frame Data
// Thread" on Smashboards — the only per-character variance is jumpsquat, not this).
const WAVEDASH_LANDING_LAG = 10;

// Matches the underscore-joined slug convention used for data/icon filenames
// across every game in this app (see CharacterSelect.jsx / useMatchupData.js).
function toFileSlug(name) {
  return name.replace(/&/g, 'and').replace(/[.]/g, '').replace(/\s+/g, '_');
}

// ssbwiki's own file-naming convention: strip spaces and periods, keep "&" literal.
function toWikiIconTitle(name) {
  return name.replace(/\./g, '').replace(/\s+/g, '');
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

async function fetchFrameData() {
  return withRetry(async () => {
    const res = await fetch(FRAME_DATA_URL, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }, 'Fetching FightCore frame data');
}

// MediaWiki imageinfo lookups, batched (max 50 titles per request), resolves
// redirects so we never have to reimplement MediaWiki's md5 hash-path scheme.
async function resolveIconUrls(characters) {
  const urlByName = new Map();
  const batchSize = 50;
  for (let i = 0; i < characters.length; i += batchSize) {
    const batch = characters.slice(i, i + batchSize);
    const titles = batch.map(c => `File:${toWikiIconTitle(c.name)}HeadSSBM.png`).join('|');
    const params = new URLSearchParams({
      action: 'query', titles, prop: 'imageinfo', iiprop: 'url', format: 'json',
    });
    const data = await withRetry(async () => {
      const res = await fetch(`${SSBWIKI_API}?${params}`, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }, `Resolving icon batch ${i / batchSize + 1}`);

    const normalizedToRequested = new Map();
    (data.query.normalized || []).forEach(n => normalizedToRequested.set(n.to, n.from));
    const titleToChar = new Map();
    batch.forEach(c => titleToChar.set(`File:${toWikiIconTitle(c.name)}HeadSSBM.png`, c));

    Object.values(data.query.pages || {}).forEach(page => {
      const requestedTitle = normalizedToRequested.get(page.title) || page.title;
      const char = titleToChar.get(requestedTitle);
      const url = page.imageinfo && page.imageinfo[0] && page.imageinfo[0].url;
      if (char && url) urlByName.set(char.name, url);
    });
  }
  return urlByName;
}

async function downloadIcon(name, url) {
  const dest = path.join(ICONS_DIR, `${toFileSlug(name)}.png`);
  await withRetry(async () => {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(dest, buf);
  }, `Downloading icon for ${name}`);
}

// Fetches ssbwiki.com's "<Name> (SSBM)" page for every character and parses the
// {{MovesetTable}} template's usname param into { characterName -> flavorName }.
async function fetchUpSpecialNames(characterNames) {
  const result = new Map();
  const batchSize = 20;
  for (let i = 0; i < characterNames.length; i += batchSize) {
    const batch = characterNames.slice(i, i + batchSize);
    const titles = batch.map(n => `${n} (SSBM)`).join('|');
    const params = new URLSearchParams({
      action: 'query', titles, prop: 'revisions', rvprop: 'content', format: 'json',
    });
    const data = await withRetry(async () => {
      const res = await fetch(`${SSBWIKI_API}?${params}`, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }, `Fetching Up Special names batch ${i / batchSize + 1}`);

    Object.values(data.query.pages).forEach(page => {
      if (page.missing !== undefined || !page.revisions) return;
      const name = page.title.replace(/ \(SSBM\)$/, '');
      const content = page.revisions[0]['*'];
      const m = content.match(/\|usname\s*=\s*([^\n|]+)/i);
      if (!m) return;
      const flavorName = m[1].trim().replace(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g, '$1').trim();
      result.set(name, flavorName);
    });
  }
  return result;
}

// Matches a FightCore move name against the ssbwiki Up Special flavor name.
// Exact match first; falls back to a prefix match since FightCore sometimes adds
// a variant suffix (e.g. "Fire Fox (Air)").
function isUpSpecialMove(moveName, flavorName) {
  if (!flavorName) return false;
  return moveName === flavorName || moveName.startsWith(flavorName);
}

function calcShieldAdvantage(shieldstun, endlag) {
  if (shieldstun == null || endlag == null) return null;
  return shieldstun - 1 - endlag;
}

// Builds this move's shield-relevant hitbox list. Aerials (type 3) use the
// move's L-cancelled landing lag as endlag for every hit; everything else uses
// each hit's own end frame against the move's overall iasa.
function buildHitboxes(move) {
  const isAerial = move.type === 3;
  const hitboxes = [];

  (move.hits || []).forEach(hit => {
    const endlag = isAerial
      ? (move.lCanceledLandLag != null ? move.lCanceledLandLag : null)
      : (move.iasa != null && hit.end != null ? move.iasa - hit.end - 1 : null);

    (hit.hitboxes || []).forEach(hb => {
      const advantage = calcShieldAdvantage(hb.shieldstun, endlag);
      hitboxes.push({
        hitbox: hit.name || hb.name || null,
        shieldSafety: advantage != null ? { min: advantage, max: advantage } : null,
        shieldRaw: advantage != null ? String(advantage) : null,
      });
    });
  });
  return hitboxes;
}

function buildCharacterMoves(moves, upSpecialFlavorName) {
  return (moves || [])
    .filter(m => m.hits && m.hits.length > 0) // skip placeholder/unused move slots
    .map(m => ({
      move: m.name,
      type: m.type,
      isUpSpecial: isUpSpecialMove(m.name, upSpecialFlavorName),
      startup: m.start ?? null,
      hitboxes: buildHitboxes(m),
    }));
}

async function main() {
  console.log('Fetching FightCore frame data...');
  const allCharacters = await fetchFrameData();
  const characters = allCharacters.filter(c => !EXCLUDED_CHARACTERS.has(c.normalizedName));
  console.log(`  ${characters.length} characters found.`);

  console.log('Resolving stock icon URLs...');
  const iconUrls = await resolveIconUrls(characters);
  const missingIcons = characters.filter(c => !iconUrls.has(c.name));
  if (missingIcons.length) {
    console.log(`  WARNING: no icon resolved for: ${missingIcons.map(c => c.name).join(', ')}`);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(ICONS_DIR, { recursive: true });

  console.log('Downloading icons...');
  for (const char of characters) {
    const url = iconUrls.get(char.name);
    if (!url) continue;
    process.stdout.write(`  ${char.name}... `);
    await downloadIcon(char.name, url);
    console.log('done');
  }

  console.log('Fetching Up Special names from ssbwiki.com...');
  const upSpecialNames = await fetchUpSpecialNames(characters.map(c => c.name));
  const missingUpSpecial = characters.filter(c => !upSpecialNames.get(c.name));
  if (missingUpSpecial.length) {
    console.log(`  WARNING: no Up Special name resolved for: ${missingUpSpecial.map(c => c.name).join(', ')}`);
  }

  characters.forEach(char => {
    const slug = toFileSlug(char.name);
    const stats = char.characterStatistics || {};
    const out = {
      character: char.name,
      slug,
      scrapedAt: new Date().toISOString(),
      jumpSquat: stats.jumpSquat ?? null,
      weight: stats.weight ?? null,
      wavedashOOSFrames: (stats.jumpSquat != null) ? stats.jumpSquat + WAVEDASH_LANDING_LAG : null,
      wikiUrl: (char.characterInfo && char.characterInfo.ssbWiki) || null,
      moves: buildCharacterMoves(char.moves, upSpecialNames.get(char.name)),
    };
    fs.writeFileSync(path.join(OUT_DIR, `${slug}.json`), JSON.stringify(out, null, 2) + '\n');
  });

  const roster = {
    characters: characters.map(c => ({ name: c.name, slug: toFileSlug(c.name) })),
    baseUrl: 'https://www.ssbwiki.com',
  };
  fs.writeFileSync(path.join(OUT_DIR, 'characters.json'), JSON.stringify(roster, null, 2) + '\n');

  console.log(`\nWrote ${characters.length} character files to ${OUT_DIR}`);
}

main().catch(err => { console.error(err); process.exit(1); });
