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
 * frame-advantage number, so we compute it ourselves. Verified exactly against a
 * community-maintained reference spreadsheet (docs.google.com/spreadsheets/d/
 * 1KwdYkNVcJbJxV_Ijqi-jyrWjGcJH4lR2e2lfrDuDC0g), whose "What is this?" tab documents
 * Melee's real on-shield formula:
 *   Grounded: On Block = Shieldstun - Active - Recovery + 1
 *   Aerial:   On Block = Shieldstun - Landlag  (assumes proper L-cancel, no extra "-1")
 * Mapped onto FightCore's fields: Active = hit.end - hit.start + 1, Recovery =
 * (iasa ?? totalFrames) - hit.end. An earlier version of this script used a formula
 * borrowed from Rivals' scripts/cargo-scrape.js (iasa - hit.end - 1 as endlag, plus
 * an extra "-1" for aerials) — that formula does not match Melee's actual mechanics
 * and produced systematically wrong (too-safe) numbers; confirmed by comparing
 * generated Fox/Falco data against the spreadsheet above.
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
 *
 * Special move display names: FightCore's flavor names for specials (e.g. "Fox
 * Illusion", "Blaster", "Fire Fox") are replaced with generic "<Direction>
 * Special" labels (Neutral/Side/Up/Down Special), using the same ssbwiki
 * MovesetTable cross-reference extended to all four name params (nsname/ssname/
 * usname/dsname). One exception: Fox/Falco's Down Special keeps its "Shine"
 * name (applyFlavorMoveName) since that's how the community universally refers
 * to it — applied before the direction-naming pass so it isn't overwritten.
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
// {{MovesetTable}} template's four special-move name params (nsname/ssname/
// usname/dsname) into { characterName -> { neutral, side, up, down } flavor names }.
const SPECIAL_DIRECTIONS = [
  ['neutral', 'nsname', 'Neutral Special'],
  ['side',    'ssname', 'Side Special'],
  ['up',      'usname', 'Up Special'],
  ['down',    'dsname', 'Down Special'],
];

async function fetchSpecialNames(characterNames) {
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
    }, `Fetching Special names batch ${i / batchSize + 1}`);

    Object.values(data.query.pages).forEach(page => {
      if (page.missing !== undefined || !page.revisions) return;
      const name = page.title.replace(/ \(SSBM\)$/, '');
      const content = page.revisions[0]['*'];
      const flavorNames = {};
      SPECIAL_DIRECTIONS.forEach(([key, param]) => {
        const m = content.match(new RegExp(`\\|${param}\\s*=\\s*([^\\n|]+)`, 'i'));
        if (!m) return;
        flavorNames[key] = m[1].trim().replace(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g, '$1').trim();
      });
      result.set(name, flavorNames);
    });
  }
  return result;
}

// Matches a FightCore move name against an ssbwiki flavor name. Exact match
// first; falls back to a prefix match since FightCore sometimes adds a
// variant suffix (e.g. "Fire Fox (Air)").
function matchesFlavorName(moveName, flavorName) {
  if (!flavorName) return false;
  return moveName === flavorName || moveName.startsWith(flavorName);
}

function isUpSpecialMove(moveName, flavorNames) {
  return matchesFlavorName(moveName, flavorNames && flavorNames.up);
}

// FightCore's raw special-move names occasionally have typos, are left as an
// unnamed placeholder, or use different spelling/punctuation/terminology than
// ssbwiki's flavor name — any of which would otherwise stop
// applyDirectionSpecialName below from finding a match. Each entry is a
// prefix correction (applied with startsWith, not exact match) so it also
// fixes multi-hit combo variants that trail extra text after the base name
// (e.g. Marth's "Sword Dance (1, Side)" -> "Dancing Blade (1, Side)", which
// then matches ssname and becomes "Side Special (1, Side)").
const SPECIAL_NAME_CORRECTIONS = {
  'Facon kick': 'Falcon Kick',              // Captain Falcon: typo ("Facon" -> "Falcon")
  'Neutral special': 'Rollout',             // Jigglypuff: FightCore left this unnamed
  'Side special': 'Egg Roll',               // Yoshi: FightCore left this unnamed
  'Homing Missle': 'Missile',               // Samus: typo ("Missle") + FightCore's own sub-variant name
  'Up B': 'Vanish',                         // Sheik: FightCore left the air variant unnamed
  'Judgement': 'Judgment',                  // Mr. Game & Watch: British vs. American spelling
  'Farores Wind': "Farore's Wind",          // Zelda: FightCore drops the apostrophe
  'Sword Dance': 'Dancing Blade',           // Marth: FightCore's own community-convention name for the same move
  'Double Edged Dance': 'Double-Edge Dance', // Roy: spelling/hyphenation variant of the same move
};

function correctSpecialName(name) {
  for (const [wrong, right] of Object.entries(SPECIAL_NAME_CORRECTIONS)) {
    if (name.startsWith(wrong)) return right + name.slice(wrong.length);
  }
  return name;
}

// Renames a special move from its character-specific flavor name (e.g. "Fox
// Illusion", "Blaster") to a generic "<Direction> Special" label, preserving
// any trailing "(Air)" suffix FightCore adds (e.g. "Fox Illusion (Air)" ->
// "Side Special (Air)"). Left alone if it doesn't match any of the four
// ssbwiki flavor names for this character (covers non-special moves, and
// moves already renamed by applyFlavorMoveName, like Fox/Falco's Shine).
function applyDirectionSpecialName(name, flavorNames) {
  if (!flavorNames) return name;
  const airMatch = name.match(/^(.*?)\s*(\(Air\))$/);
  const baseName = airMatch ? airMatch[1] : name;
  const airSuffix = airMatch ? ' ' + airMatch[2] : '';
  const correctedBase = correctSpecialName(baseName);
  for (const [key, , label] of SPECIAL_DIRECTIONS) {
    const flavorName = flavorNames[key];
    if (!matchesFlavorName(correctedBase, flavorName)) continue;
    return label + correctedBase.slice(flavorName.length) + airSuffix;
  }
  return name;
}

function calcGroundedShieldAdvantage(shieldstun, active, recovery) {
  if (shieldstun == null || active == null || recovery == null) return null;
  return shieldstun - active - recovery + 1;
}

function calcAerialShieldAdvantage(shieldstun, landlag) {
  if (shieldstun == null || landlag == null) return null;
  return shieldstun - landlag;
}

// Builds this move's shield-relevant hitbox list. Aerials (type 3) use the
// move's L-cancelled landing lag directly. Grounded moves derive Active (this
// hit's own active-frame duration) and Recovery (frames from the end of that
// active window to the move's true end) from FightCore's fields. `totalFrames`
// is used as a fallback "true end" when `iasa` is absent (e.g. Fox's Forward
// Tilt/Forward Smash/Up Smash have no iasa field), except when it's the `0`
// sentinel FightCore uses for looping/held moves with no fixed length (e.g.
// Falco's Rapid Jabs) — treating that `0` as a real end frame produces
// nonsensical negative recovery, so those moves correctly get no shield safety
// (excluded from lists) rather than a fabricated number.
function buildHitboxes(move) {
  const isAerial = move.type === 3;
  const hitboxes = [];
  const totalEnd = move.iasa ?? (move.totalFrames > 0 ? move.totalFrames : null);

  (move.hits || []).forEach(hit => {
    const active = (hit.start != null && hit.end != null) ? hit.end - hit.start + 1 : null;
    const recovery = (totalEnd != null && hit.end != null) ? totalEnd - hit.end : null;

    (hit.hitboxes || []).forEach(hb => {
      const advantage = isAerial
        ? calcAerialShieldAdvantage(hb.shieldstun, move.lCanceledLandLag)
        : calcGroundedShieldAdvantage(hb.shieldstun, active, recovery);
      hitboxes.push({
        hitbox: cleanHitboxName(hit.name || hb.name || null),
        shieldSafety: advantage != null ? { min: advantage, max: advantage } : null,
        shieldRaw: advantage != null ? String(advantage) : null,
      });
    });
  });
  return hitboxes;
}

// FightCore's move names are mostly clean, but a few are missing a space
// that every other move name has ("Dashattack" vs. every other move being
// two words, e.g. "Forward Tilt").
function cleanMoveName(name) {
  if (name === 'Dashattack') return 'Dash Attack';
  return name;
}

// FightCore's generic move name for Fox/Falco's Reflector is universally
// known in Melee as "Shine" — everywhere else "Reflector" (Peach, Zelda) is
// left alone since it isn't Fox/Falco's move. Mirrors analysisMelee.js's own
// JUMP_CANCEL_SPECIALS['Fox'/'Falco'] = ['Reflector'] convention, which also
// needs to reference this same flavor name.
const SHINE_CHARACTERS = new Set(['Fox', 'Falco']);
function applyFlavorMoveName(name, characterName) {
  if (SHINE_CHARACTERS.has(characterName) && name.startsWith('Reflector')) {
    return name.replace('Reflector', 'Shine');
  }
  return name;
}

// FightCore labels the strong hit-window of a multi-hit-window move "clean"
// (paired with "late" for the weaker one) — Melee community terminology
// calls this "sweetspot" instead, so relabel it for display.
function cleanHitboxName(name) {
  if (name === 'clean') return 'sweetspot';
  return name;
}

function buildCharacterMoves(moves, flavorNames, characterName) {
  return (moves || [])
    .filter(m => m.hits && m.hits.length > 0) // skip placeholder/unused move slots
    .map(m => {
      // Shine must be applied before the generic direction-naming pass, since
      // once Fox/Falco's Down Special is renamed to "Shine" it no longer
      // matches ssbwiki's dsname flavor name ("Reflector") and so is left
      // alone by applyDirectionSpecialName below.
      const shineApplied = applyFlavorMoveName(cleanMoveName(m.name), characterName);
      return {
        move: applyDirectionSpecialName(shineApplied, flavorNames),
        type: m.type,
        isUpSpecial: isUpSpecialMove(m.name, flavorNames),
        startup: m.start ?? null,
        hitboxes: buildHitboxes(m),
      };
    });
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

  console.log('Fetching special move names from ssbwiki.com...');
  const specialNames = await fetchSpecialNames(characters.map(c => c.name));
  const missingSpecials = characters.filter(c => !specialNames.get(c.name));
  if (missingSpecials.length) {
    console.log(`  WARNING: no special move names resolved for: ${missingSpecials.map(c => c.name).join(', ')}`);
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
      moves: buildCharacterMoves(char.moves, specialNames.get(char.name), char.name),
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
