'use strict';
/**
 * fetch-ssbu-frame-data.js
 * Parses the community-maintained Smash Ultimate frame data spreadsheet
 * (Zapp Branniglenn's "Super Smash Bros. Ultimate Patch 13.1 Frame Data",
 * free to use/repurpose per its own GlossaryNotes tab) into per-character
 * JSON files under app/public/data/ssbu/, mirroring the shape of
 * app/public/data/ssbm/*.json (see scripts/fetch-melee-data.js).
 *
 * Source: data/ssbu/frame-data-source.xlsx, committed to the repo rather
 * than fetched over network — this is a manually-shared community resource
 * updated per SSBU patch (not an API), so re-running this script means
 * replacing that file with a newer patch's copy first.
 *
 * Unlike the FightCore-based Melee scraper, this sheet already contains a
 * precomputed "Advantage" (on-shield frame advantage) column per the
 * glossary's documented formula, rather than raw ingredients we'd have to
 * derive shield safety from ourselves — that was the exact failure mode
 * that got the original dragdown.wiki-based SSBU scrape rolled back (see
 * memory: SSBU data status). We trust the sheet's own numbers here instead
 * of recomputing them.
 *
 * PARSING PHILOSOPHY — every one of Startup/Total Frames/Landing Lag/Base
 * Damage/Shieldlag/Shieldstun/Advantage is stored as { raw, parsed }: raw
 * preserves the exact source text always; parsed is a best-effort number
 * array, explicitly null whenever the cell isn't confidently machine-
 * parseable (a range like "-16 to +3", a "shieldbreak"/"N/A"/"?" sentinel,
 * a multi-line cell, or a character-state-variant cell using " | " as a
 * separator — e.g. Lucario's aura stages, Joker's Normal/Arsene). This
 * mirrors the lesson from this session's Melee Getup Attack bug: a wrong
 * silent parse is worse than no parse, so ambiguous cells surface as
 * null rather than a guessed number. Character-state variants and
 * whole-sheet alternate forms (Shulk's Monado Arts, Kirby's Copy
 * Abilities) are deliberately NOT parsed in this pass — see SKIPPED_SHEETS
 * and the "forms: null" placeholder below.
 *
 * "|+N|" / "[+N]" wrapping in the Advantage column is the sheet author's
 * own manual emphasis on notably positive (safe) numbers — confirmed by
 * checking every instance across the sheet (~20 of them, spanning a dozen
 * characters): 100% of wrapped values are positive, 100% of bare values in
 * the same cell are negative or zero. It's stripped and parsed as a plain
 * signed number, not a distinct meaning.
 */

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const fetch = require('node-fetch');

const SOURCE_XLSX = path.join(__dirname, '../data/ssbu/frame-data-source.xlsx');
const OUT_DIR = path.join(__dirname, '../app/public/data/ssbu');
const ROSTER_JSON = path.join(__dirname, '../app/public/data/ssbu/characters.json');
const PATCH = '13.1';
const SSBWIKI_API = 'https://www.ssbwiki.com/api.php';
const UA = 'MatchupBuddy/1.0 (https://matchupbuddy.gg)';

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

// Sheets structurally incompatible with the canonical 9-column schema, or
// bonus/supplementary sheets layered on top of a character's primary
// moveset — skipped entirely rather than force-fit. Revisit each as its
// own dedicated pass:
//   - Ice Climbers: Player/AI split columns, desync-hitlag mechanic, no
//     Startup/Total Frames/etc header at all.
//   - Kirby (Copy Abilities) / Shulk (Arts): supplementary variant tables
//     for a mechanic (copied moveset / Monado Art), not the character's
//     own primary moves — the base 06/57 sheets already cover their real
//     moveset.
const SKIPPED_SHEETS = new Set([
  'GlossaryNotes',
  '15 - Ice Climbers',
  '06 - Kirby (Copy Abilities)',
  "57 - Shulk (Arts)",
]);

// Sheet name -> roster slug(s), matching app/public/data/ssbu/characters.json
// exactly. Explicit (not derived from the sheet name string) since sheet
// naming is inconsistent (missing spaces/dashes: "33- Squirtle",
// "39 King Dedede", "74- Terry") and a handful of sheets cover two roster
// slugs at once — true echo pairs that share one frame-data table because
// they're frame-data-identical (Peach/Daisy, Pit/Dark Pit, Samus/Dark
// Samus, Simon/Richter), unlike Ryu/Ken or Marth/Lucina/Roy/Chrom which
// get their own dedicated "e" sheet for the handful of real differences.
const SHEET_TO_SLUGS = {
  '01 - Mario': ['Mario'],
  '02 - Donkey Kong': ['Donkey_Kong'],
  '03 - Link': ['Link'],
  '04 -SamusDark Samus': ['Samus', 'Dark_Samus'],
  '05 - Yoshi': ['Yoshi'],
  '06 - Kirby': ['Kirby'],
  '07 - Fox': ['Fox'],
  '08 - Pikachu': ['Pikachu'],
  '09 - Luigi': ['Luigi'],
  '10 - Ness': ['Ness'],
  '11 - Captain Falcon': ['Captain_Falcon'],
  '12 - Jigglypuff': ['Jigglypuff'],
  '13 - PeachDaisy': ['Peach', 'Daisy'],
  '14 - Bowser': ['Bowser'],
  '16 - Sheik': ['Sheik'],
  '17 - Zelda': ['Zelda'],
  '18 - Dr. Mario': ['Dr_Mario'],
  '19 - Pichu': ['Pichu'],
  '20 - Falco': ['Falco'],
  '21 - Marth': ['Marth'],
  '21e - Lucina': ['Lucina'],
  '22 - Young Link': ['Young_Link'],
  '23 - Ganondorf': ['Ganondorf'],
  '24 - Mewtwo': ['Mewtwo'],
  '25 - Roy': ['Roy'],
  '25e - Chrom': ['Chrom'],
  '26 - Mr. Game & Watch': ['Mr_Game_and_Watch'],
  '27 - Meta Knight': ['Meta_Knight'],
  '28 - PitDark Pit': ['Pit', 'Dark_Pit'],
  '29 - Zero Suit Samus': ['Zero_Suit_Samus'],
  '30 - Wario': ['Wario'],
  '31 - Snake': ['Snake'],
  '32 - Ike': ['Ike'],
  '33- Squirtle': ['Squirtle'],
  '34 - Ivysaur': ['Ivysaur'],
  '35 - Charizard': ['Charizard'],
  '36 - Diddy Kong': ['Diddy_Kong'],
  '37 - Lucas': ['Lucas'],
  '38 - Sonic': ['Sonic'],
  '39 King Dedede': ['King_Dedede'],
  '40 - Olimar': ['Olimar'],
  '41 - Lucario': ['Lucario'],
  '42 - R.O.B.': ['ROB'],
  '43 - Toon Link': ['Toon_Link'],
  '44 - Wolf': ['Wolf'],
  '45 - Villager': ['Villager'],
  '46 - Mega Man': ['Mega_Man'],
  '47 - Wii Fit Trainer': ['Wii_Fit_Trainer'],
  '48 - Rosalina & Luma': ['Rosalina_and_Luma'],
  '49 - Little Mac': ['Little_Mac'],
  '50 - Greninja': ['Greninja'],
  '51 - Mii Brawler': ['Mii_Brawler'],
  '52 - Mii Swordfighter': ['Mii_Swordfighter'],
  '53 - Mii Gunner': ['Mii_Gunner'],
  '54 - Palutena': ['Palutena'],
  '55 - PAC-MAN': ['Pac-Man'],
  '56 - Robin': ['Robin'],
  '57 - Shulk': ['Shulk'],
  '58 - Bowser Jr': ['Bowser_Jr'],
  '59 - Duck Hunt': ['Duck_Hunt'],
  '60 - Ryu': ['Ryu'],
  '60e - Ken': ['Ken'],
  '61 - Cloud': ['Cloud'],
  '62 - Corrin': ['Corrin'],
  '63 - Bayonetta': ['Bayonetta'],
  '64 - Inkling': ['Inkling'],
  '65 - Ridley': ['Ridley'],
  '66 - SimonRichter': ['Simon', 'Richter'],
  '67 - King K Rool': ['King_K_Rool'],
  '68 - Isabelle': ['Isabelle'],
  '69 - Incineroar': ['Incineroar'],
  '70 - Piranha Plant': ['Piranha_Plant'],
  '71 - Joker': ['Joker'],
  '72 - Hero': ['Hero'],
  '73 - Banjo & Kazooie': ['Banjo_and_Kazooie'],
  '74- Terry': ['Terry'],
  '75 - Byleth': ['Byleth'],
  '76 - Min Min': ['Min_Min'],
  '77 - Steve': ['Steve'],
  '78 - Sephiroth': ['Sephiroth'],
  '79 - Pyra': ['Pyra'],
  '80 - Mythra': ['Mythra'],
  '81 - Kazuya': ['Kazuya'],
  '82 - Sora': ['Sora'],
};

// Header cell text -> logical column key, matched by case-insensitive
// substring so the handful of sheets with extra state-dimension suffixes
// ("Base Damage\nR/Y/B/W/P", "Advantage\n0% | 65% | 190%") or unrelated
// bonus columns ("Special cancel?", "Tomes") still resolve their core
// columns correctly — only recognized columns are read, anything else is
// ignored rather than misread.
const COLUMN_MATCHERS = [
  ['startup', /^startup/i],
  ['totalFrames', /^total frames/i],
  ['landingLag', /^landing lag/i],
  ['notes', /^additional notes/i],
  ['baseDamage', /^base damage/i],
  ['shieldlag', /^shieldlag/i],
  ['shieldstun', /^shieldstun/i],
  ['hitboxLabels', /which hitbox/i],
  ['advantage', /^advantage/i],
];

// Row-name -> category, checked in this order; the first match wins.
// Specials have no consistent naming scheme (character-flavored names like
// "Fireball"/"Cape"/"Blaster"), so they're the positional default for any
// row that doesn't match a more specific pattern and hasn't reached the
// Grab/Throws phase yet — see classifyRow.
// All patterns are anchored to the start of the move name and match only
// the sheet's own canonical labels for these rows — a plain substring match
// (e.g. "throw" or "grab" anywhere in the name) is NOT safe here: special
// moves like Charizard's "Flamethrower", Snake's "Hand Grenade (neutral
// throw)", and Pac-Man's "Bonus Fruit (throw)" all contain "throw" without
// being a real grab-game throw, and once a row is misclassified the
// phase-tracking state machine below never recovers (everything after it
// falls into the same wrong category too) — confirmed this the hard way
// when Charizard and Pac-Man came out with zero Specials.
const NORMAL_PATTERN = /^(jab|rapid|dash attack|f-tilt|u-tilt|d-tilt)/i;
const SMASH_PATTERN = /^[fud]-smash/i;
const AERIAL_PATTERN = /^[nfbud]-air/i;
const GRAB_THROW_PATTERN = /^(grab|dash grab|pivot grab|pummel|forward throw|back throw|up throw|down throw)/i;
const DEFENSIVE_PATTERN = /^(spot dodge|forward roll|back roll|neutral air dodge|dir\.?\s*ad)/i;

function classifyRow(moveName, phase) {
  if (NORMAL_PATTERN.test(moveName)) return { category: 'Normals', phase: Math.max(phase, 1) };
  if (SMASH_PATTERN.test(moveName)) return { category: 'Smashes', phase: Math.max(phase, 2) };
  if (AERIAL_PATTERN.test(moveName)) return { category: 'Aerials', phase: Math.max(phase, 3) };
  if (GRAB_THROW_PATTERN.test(moveName)) return { category: 'Grabs/Throws', phase: Math.max(phase, 5) };
  if (DEFENSIVE_PATTERN.test(moveName)) return { category: 'Defensive', phase: Math.max(phase, 6) };
  // No name match: Specials while we haven't reached Grab/Throws yet,
  // otherwise fall back to whatever the current phase's category is (a
  // stray unnamed-pattern row after throws/dodges started, e.g. a
  // sub-variant line) rather than mis-bucketing it as Specials.
  if (phase < 5) return { category: 'Specials', phase: Math.max(phase, 4) };
  return { category: phase >= 6 ? 'Defensive' : 'Grabs/Throws', phase };
}

// Expands the sheet's abbreviated move labels to full words, matching the
// naming convention already used for Melee/Rivals (analysisMelee.js/
// analysis.js — "Neutral Air" not "N-Air"). Applied after classifyRow (which
// already matches the abbreviated forms), so this only touches the stored
// label, not categorization. Anchored + word-boundary so it only rewrites
// the move's own prefix, preserving any trailing variant text (e.g.
// Snake's "F-Tilt 1"/"F-Tilt 2" -> "Forward Tilt 1"/"Forward Tilt 2").
const ABBREVIATED_MOVE_RENAMES = [
  [/^N-Air\b/i, 'Neutral Air'],
  [/^F-Air\b/i, 'Forward Air'],
  [/^B-Air\b/i, 'Back Air'],
  [/^U-Air\b/i, 'Up Air'],
  [/^D-Air\b/i, 'Down Air'],
  [/^F-Tilt\b/i, 'Forward Tilt'],
  [/^U-Tilt\b/i, 'Up Tilt'],
  [/^D-Tilt\b/i, 'Down Tilt'],
  [/^F-Smash\b/i, 'Forward Smash'],
  [/^U-Smash\b/i, 'Up Smash'],
  [/^D-Smash\b/i, 'Down Smash'],
];

function expandAbbreviatedMoveName(name) {
  for (const [pattern, replacement] of ABBREVIATED_MOVE_RENAMES) {
    if (pattern.test(name)) return name.replace(pattern, replacement);
  }
  return name;
}

/* ── Special-move name generalization ──
 *
 * The sheet labels each Specials-category row with the character's own
 * flavor name (e.g. Mario's "Super Jump Punch", Snake's "Cypher") rather
 * than a generic "Neutral/Side/Up/Down Special" label — the same problem
 * Melee's scraper solved (see fetch-melee-data.js) by cross-referencing
 * ssbwiki.com's {{MovesetTable}} template, which names each of the four
 * special-move slots per character via nsname/ssname/usname/dsname params.
 * SSBU character pages use the exact same template param names (confirmed
 * directly against ssbwiki.com's live "<Name> (SSBU)" pages), so the same
 * technique applies here.
 */
const SPECIAL_DIRECTIONS = [
  ['neutral', 'nsname', 'Neutral Special'],
  ['side',    'ssname', 'Side Special'],
  ['up',      'usname', 'Up Special'],
  ['down',    'dsname', 'Down Special'],
];

// Echo pairs sharing one spreadsheet row (see SHEET_TO_SLUGS) use the
// PRIMARY character's own ssbwiki flavor names for matching — the
// spreadsheet's move-name text is written once for the pair and matches
// the primary's names (e.g. "Peach Bomber" appears in both Peach.json and
// Daisy.json, even though Daisy's own ssbwiki page documents her distinct
// "Daisy Bomber"/"Daisy Parasol" flavor names — confirmed by direct
// comparison against ssbwiki).
const WIKI_NAME_SOURCE_OVERRIDES = {
  Daisy: 'Peach',
  Dark_Samus: 'Samus',
  Richter: 'Simon',
};

// Pit and Dark Pit are the one echo pair whose spreadsheet Neutral/Side
// rows genuinely differ and are explicitly labeled "(Pit)"/"(Dark Pit)"
// within the same shared sheet (unlike Peach/Daisy, Samus/Dark Samus, and
// Simon/Richter, whose spreadsheet text is 100% identical for both
// members) — confirmed by direct inspection. Both Pit.json and
// Dark_Pit.json need BOTH characters' own flavor names available to match
// against, not just one.
const WIKI_NAME_MERGE_SOURCES = {
  Pit: ['Pit', 'Dark Pit'],
  Dark_Pit: ['Pit', 'Dark Pit'],
};

// Mii Fighters' ssbwiki pages don't use the standard MovesetTable
// nsname/ssname/usname/dsname params at all — confirmed directly (their
// {{MovesetTable}} has no such params). Their movesets are genuinely
// customizable (3 selectable options per Neutral/Side/Up slot, 2-3 for
// Down, picked at character select), so there's no single "the" special
// per direction the way every other character has, and no wiki param to
// cross-reference. Hand-grouped directly from the spreadsheet's own row
// ordering instead — like every other character, it lists Neutral's
// options, then Side's, then Up's, then Down's, in that order — verified
// against each Mii's actual generated Specials list before use.
const MII_SPECIAL_GROUPS = {
  Mii_Brawler: {
    neutral: ['Shot Put', 'Flashing Mach Punch', 'Exploding Side Kick'],
    side:    ['Onslaught', 'Burning Dropkick', 'Suplex'],
    up:      ['Soaring Axe Kick', 'Helicopter Kick', 'Thrust Uppercut'],
    down:    ['Head-On Assault', 'Feint Jump'],
  },
  Mii_Swordfighter: {
    neutral: ['Gale Strike', 'Shuriken of Light', 'Blurring Blade'],
    side:    ['Airborne Assault', 'Gale Stab', 'Chakram'],
    up:      ['Stone Scabbard', 'Skyward Slash Dash', "Hero's Spin"],
    down:    ['Blade Counter', 'Reversal Slash', 'Power Thrust'],
  },
  Mii_Gunner: {
    neutral: ['Charge Blast', 'Laser Blaze', 'Grenade Launch'],
    side:    ['Flame Pillar', 'Stealth Burst', 'Gunner Missile'],
    up:      ['Lunar Launch', 'Cannon Jump Kick', 'Arm Rocket'],
    down:    ['Echo Reflector', 'Bomb Drop', 'Absorbing Vortex'],
  },
};

// A handful of ssbwiki flavor names differ from the spreadsheet's own
// move-name text in ways that plain accent/punctuation normalization
// doesn't cover (a genuinely different word, not just formatting) —
// applied to the wiki-fetched flavor name to align it with the
// spreadsheet's own wording.
const SPECIAL_NAME_CORRECTIONS = {
  'Palutena Bow': "Palutena's Bow",
  'Bow and Arrows': "Hero's Bow",       // Link only — Toon Link/Young Link's own wiki names already match
  'Double-Edge Dance': 'Double Edged Dance', // Chrom/Roy
  'Shield Breaker': 'Shieldbreaker',    // Marth/Lucina
  'Megavitamins': 'Megavitamin',        // Dr. Mario — spreadsheet uses the singular
};

// Strips accents and normalizes punctuation so "Pokémon Change" matches
// "Pokemon Change" and "Abandon Ship!" matches "Abandon Ship" — real
// mismatches between ssbwiki's prose formatting and the spreadsheet's
// plainer move-name text, not different moves.
function normalizeForMatch(s) {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/!/g, '')
    .replace(/[‘’]/g, "'")
    .trim()
    .toLowerCase();
}

function correctFlavorName(name) {
  return SPECIAL_NAME_CORRECTIONS[name] || name;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Renames a Specials-category move from its character-specific flavor name
// to a generic "<Direction> Special" label. Three shapes of match, tried in
// order against each direction's flavor name (normalized for accents/
// punctuation on both sides, e.g. "Pokémon Change" vs "Pokemon Change"):
//   - Exact match                                    -> bare label
//   - Flavor name is a PREFIX, followed by a
//     space/slash/paren/end (e.g. "Screw Attack (air)",
//     "Thunder/Elthunder/Arcthunder")                -> label + trailing text
//   - Flavor name is a SUFFIX, preceded by a
//     qualifier word (e.g. "Homing Missile", "True
//     Hadoken", "Limit Blade Beam")                   -> qualifier + " " + label
// Left alone if none of the four directions' flavor names match at all —
// covers characters with no wiki data and genuine mismatches (e.g. Sora's
// neutral special is generically named "Magic" on ssbwiki, but the sheet
// lists each element by its own name — "Firaga"/"Thundaga"/"Blizzaga" —
// which intentionally doesn't match, left as-is rather than guessed).
//
// keepOriginalName (used for the three Mii Fighters — see
// MII_SPECIAL_GROUPS) appends the un-renamed flavor name in parens even on
// an otherwise-bare exact match (e.g. "Up Special (Soaring Axe Kick)"
// instead of a bare "Up Special") — a Mii's three selectable options per
// slot would otherwise collapse into identical, indistinguishable rows.
//
// flavorNameSources is an array, usually of length 1 — Pit/Dark Pit are
// the one pair needing more than one (see WIKI_NAME_MERGE_SOURCES), since
// their sheet embeds both characters' own flavor names side by side.
function applyDirectionSpecialName(name, flavorNameSources, keepOriginalName) {
  for (const flavorNames of flavorNameSources || []) {
    const renamed = applyDirectionSpecialNameFromOneSource(name, flavorNames, keepOriginalName);
    if (renamed !== name) return renamed;
  }
  return name;
}

function applyDirectionSpecialNameFromOneSource(name, flavorNames, keepOriginalName) {
  if (!flavorNames) return name;
  const normName = normalizeForMatch(name);
  for (const [key, , label] of SPECIAL_DIRECTIONS) {
    const rawFlavor = flavorNames[key];
    if (!rawFlavor) continue;
    // Compound slots list multiple genuinely different specials sharing
    // one input, separated by " / " (e.g. Hero's staged "Frizz / Frizzle /
    // Kafrizz", Terry's "Burning Knuckle / Crack Shoot") — any alternative
    // is a valid match for this direction.
    const alternatives = rawFlavor.split('/').map(s => s.trim()).map(correctFlavorName);
    for (const alt of alternatives) {
      const normAlt = normalizeForMatch(alt);
      if (!normAlt) continue;
      if (normName === normAlt) {
        return keepOriginalName ? `${label} (${name})` : label;
      }
      const prefixMatch = normName.match(new RegExp(`^${escapeRegExp(normAlt)}(\\s|/|\\()`));
      if (prefixMatch) {
        const suffix = name.slice(normAlt.length);
        return keepOriginalName ? `${label} (${name})` : label + suffix;
      }
      const suffixMatch = normName.match(new RegExp(`(\\s)${escapeRegExp(normAlt)}$`));
      if (suffixMatch) {
        const qualifier = name.slice(0, name.length - normAlt.length).trim();
        return keepOriginalName ? `${label} (${name})` : `${qualifier} ${label}`;
      }
    }
  }
  return name;
}

// Fetches ssbwiki.com's "<Name> (SSBU)" page for every character and parses
// the {{MovesetTable}} template's four special-move name params into
// { characterName -> { neutral, side, up, down } flavor names }.
async function fetchSpecialNames(characterNames) {
  const result = new Map();
  const batchSize = 20;
  for (let i = 0; i < characterNames.length; i += batchSize) {
    const batch = characterNames.slice(i, i + batchSize);
    const titles = batch.map(n => `${n} (SSBU)`).join('|');
    const params = new URLSearchParams({
      action: 'query', titles, prop: 'revisions', rvprop: 'content', format: 'json',
    });
    const data = await withRetry(async () => {
      const res = await fetch(`${SSBWIKI_API}?${params}`, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }, `Fetching special names batch ${i / batchSize + 1}`);

    Object.values(data.query.pages).forEach(page => {
      if (page.missing !== undefined || !page.revisions) return;
      const name = page.title.replace(/ \(SSBU\)$/, '');
      const content = page.revisions[0]['*'];
      const flavorNames = {};
      SPECIAL_DIRECTIONS.forEach(([key, param]) => {
        const m = content.match(new RegExp(`\\|${param}\\s*=\\s*([^\\n|]+)`, 'i'));
        if (!m) return;
        flavorNames[key] = m[1].trim().replace(/\{\{!\}\}/g, '|').replace(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g, '$1').trim();
      });
      result.set(name, flavorNames);
    });
  }
  return result;
}

// Strips a "|+N|" or "[+N]" emphasis wrapper (see file header doc) down to
// the plain signed number inside, if present.
function unwrap(segment) {
  const barMatch = segment.match(/^\|(.+)\|$/);
  if (barMatch) return barMatch[1].trim();
  const bracketMatch = segment.match(/^\[(.+)\]$/);
  if (bracketMatch) return bracketMatch[1].trim();
  return segment;
}

const STRICT_NUMBER = /^[+-]?\d+(\.\d+)?$/;

function parseNumericSegment(segment) {
  const unwrapped = unwrap(segment.trim());
  if (!STRICT_NUMBER.test(unwrapped)) return null;
  return Number(unwrapped);
}

// Parses one of Startup/Total Frames/Landing Lag/Base Damage/Shieldlag/
// Shieldstun/Advantage. Always keeps the raw source string; `parsed` is a
// number array split on "/" (the hitbox-variant separator), or null
// whenever the cell isn't confidently parseable — see file header doc for
// exactly which cases fall back to null.
function parseVariantCell(raw) {
  if (raw == null) return { raw: null, parsed: null };
  const cleaned = String(raw).trim();
  if (cleaned === '') return { raw: null, parsed: null };
  // Multi-line cells (per-hit sub-grids like Shulk's 5-hit D-Smash) and
  // " | " character-state-variant separators (Lucario's aura stages,
  // Joker's Normal/Arsene, etc.) are deliberately deferred, not guessed —
  // both need dedicated per-character handling, not a blind split.
  if (cleaned.includes('\n') || cleaned.includes(' | ')) {
    return { raw: cleaned, parsed: null };
  }
  const segments = cleaned.split('/').map(s => s.trim());
  const parsedSegments = segments.map(parseNumericSegment);
  if (parsedSegments.some(v => v === null)) return { raw: cleaned, parsed: null };
  return { raw: cleaned, parsed: parsedSegments };
}

function parseHitboxLabels(raw) {
  if (raw == null) return null;
  const labels = String(raw)
    .split(/[/\n]/)
    .map(s => s.trim())
    .filter(Boolean);
  return labels.length ? labels : null;
}

// Builds a { columnKey: 1-indexed column number } map from the sheet's
// header row (row 1), so column position differences across sheets (see
// COLUMN_MATCHERS doc) don't need per-sheet special-casing.
function buildColumnMap(headerRow) {
  const map = {};
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const text = String(cell.value || '').trim();
    if (!text) return;
    for (const [key, pattern] of COLUMN_MATCHERS) {
      if (pattern.test(text)) {
        map[key] = colNumber;
        break;
      }
    }
  });
  return map;
}

function cellText(row, colNumber) {
  if (colNumber == null) return null;
  const value = row.getCell(colNumber).value;
  if (value == null) return null;
  // exceljs returns rich-text cells as { richText: [{text}, ...] } instead
  // of a plain string when the cell has mixed formatting (bold/italic runs
  // within one cell) — flatten those back to plain text.
  if (typeof value === 'object' && Array.isArray(value.richText)) {
    return value.richText.map(r => r.text).join('');
  }
  return String(value);
}

function parseSheet(sheet) {
  const headerRow = sheet.getRow(1);
  const cols = buildColumnMap(headerRow);
  if (cols.startup == null || cols.totalFrames == null) {
    throw new Error(`Sheet "${sheet.name}" is missing expected Startup/Total Frames columns`);
  }

  const moves = [];
  let phase = 0;
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const moveNameRaw = cellText(row, 1); // column A holds the move name (its header cell is blank)
    const moveName = moveNameRaw ? moveNameRaw.trim() : '';
    if (!moveName) return; // blank separator row

    const { category, phase: nextPhase } = classifyRow(moveName, phase);
    phase = nextPhase;

    moves.push({
      move: moveName,
      category,
      hitboxLabels: parseHitboxLabels(cellText(row, cols.hitboxLabels)),
      startup: parseVariantCell(cellText(row, cols.startup)),
      totalFrames: parseVariantCell(cellText(row, cols.totalFrames)),
      landingLag: parseVariantCell(cellText(row, cols.landingLag)),
      baseDamage: parseVariantCell(cellText(row, cols.baseDamage)),
      shieldlag: parseVariantCell(cellText(row, cols.shieldlag)),
      shieldstun: parseVariantCell(cellText(row, cols.shieldstun)),
      advantage: parseVariantCell(cellText(row, cols.advantage)),
      notes: cellText(row, cols.notes),
    });
  });
  return moves;
}

async function main() {
  if (!fs.existsSync(SOURCE_XLSX)) {
    throw new Error(`Source spreadsheet not found at ${SOURCE_XLSX}`);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const roster = JSON.parse(fs.readFileSync(ROSTER_JSON, 'utf8')).characters;
  const slugToDisplayName = new Map(roster.map(c => [c.slug, c.name]));

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(SOURCE_XLSX);

  const sheetNames = workbook.worksheets.map(ws => ws.name);
  const unmapped = sheetNames.filter(n => !SKIPPED_SHEETS.has(n) && !SHEET_TO_SLUGS[n]);
  if (unmapped.length) {
    throw new Error(`Unmapped sheet(s) found — add to SHEET_TO_SLUGS or SKIPPED_SHEETS: ${unmapped.join(', ')}`);
  }

  console.log('Fetching special move names from ssbwiki.com...');
  const allSlugs = Object.values(SHEET_TO_SLUGS).flat();
  const wikiLookupNames = allSlugs.flatMap(slug => {
    if (WIKI_NAME_MERGE_SOURCES[slug]) return WIKI_NAME_MERGE_SOURCES[slug];
    const name = slugToDisplayName.get(WIKI_NAME_SOURCE_OVERRIDES[slug] || slug);
    return name ? [name] : [];
  });
  const specialNames = await fetchSpecialNames([...new Set(wikiLookupNames)]);
  const missingWikiData = allSlugs.filter(slug => {
    if (MII_SPECIAL_GROUPS[slug]) return false;
    if (WIKI_NAME_MERGE_SOURCES[slug]) return WIKI_NAME_MERGE_SOURCES[slug].every(n => !specialNames.has(n));
    const displayName = slugToDisplayName.get(WIKI_NAME_SOURCE_OVERRIDES[slug] || slug);
    return !displayName || !specialNames.has(displayName);
  });
  if (missingWikiData.length) {
    console.log(`  No ssbwiki special-name data for: ${missingWikiData.join(', ')} (their Specials rows keep their original flavor names)`);
  }

  // Returns an array of flavor-name sources to try (usually one; Pit/Dark
  // Pit get both, since their sheet embeds both characters' own names).
  function flavorNamesForSlug(slug) {
    if (MII_SPECIAL_GROUPS[slug]) {
      const g = MII_SPECIAL_GROUPS[slug];
      return [{ neutral: g.neutral.join('/'), side: g.side.join('/'), up: g.up.join('/'), down: g.down.join('/') }];
    }
    if (WIKI_NAME_MERGE_SOURCES[slug]) {
      return WIKI_NAME_MERGE_SOURCES[slug].map(n => specialNames.get(n)).filter(Boolean);
    }
    const displayName = slugToDisplayName.get(WIKI_NAME_SOURCE_OVERRIDES[slug] || slug);
    const flavorNames = displayName ? specialNames.get(displayName) : null;
    return flavorNames ? [flavorNames] : [];
  }

  let written = 0;
  for (const [sheetName, slugs] of Object.entries(SHEET_TO_SLUGS)) {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) {
      console.log(`  WARNING: sheet "${sheetName}" not found in workbook, skipping`);
      continue;
    }
    const baseMoves = parseSheet(sheet);
    for (const slug of slugs) {
      const flavorNames = flavorNamesForSlug(slug);
      const isMii = Boolean(MII_SPECIAL_GROUPS[slug]);
      const moves = baseMoves.map(m => {
        const expanded = expandAbbreviatedMoveName(m.move);
        const renamed = m.category === 'Specials' ? applyDirectionSpecialName(expanded, flavorNames, isMii) : expanded;
        return { ...m, move: renamed };
      });
      const out = {
        character: slugToDisplayName.get(slug) || slug.replace(/_/g, ' '),
        slug,
        patch: PATCH,
        scrapedAt: new Date().toISOString(),
        sourceSheet: sheetName,
        moves,
        forms: null,
      };
      fs.writeFileSync(path.join(OUT_DIR, `${slug}.json`), JSON.stringify(out, null, 2) + '\n');
      written++;
    }
    console.log(`  ${sheetName} -> ${slugs.join(', ')} (${baseMoves.length} moves)`);
  }

  console.log(`\nWrote ${written} character files to ${OUT_DIR}`);
  console.log(`Skipped: ${[...SKIPPED_SHEETS].filter(s => s !== 'GlossaryNotes').join(', ')}`);
}

main().catch(err => { console.error(err); process.exit(1); });
