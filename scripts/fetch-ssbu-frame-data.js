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

const SOURCE_XLSX = path.join(__dirname, '../data/ssbu/frame-data-source.xlsx');
const OUT_DIR = path.join(__dirname, '../app/public/data/ssbu');
const PATCH = '13.1';

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

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(SOURCE_XLSX);

  const sheetNames = workbook.worksheets.map(ws => ws.name);
  const unmapped = sheetNames.filter(n => !SKIPPED_SHEETS.has(n) && !SHEET_TO_SLUGS[n]);
  if (unmapped.length) {
    throw new Error(`Unmapped sheet(s) found — add to SHEET_TO_SLUGS or SKIPPED_SHEETS: ${unmapped.join(', ')}`);
  }

  let written = 0;
  for (const [sheetName, slugs] of Object.entries(SHEET_TO_SLUGS)) {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) {
      console.log(`  WARNING: sheet "${sheetName}" not found in workbook, skipping`);
      continue;
    }
    const moves = parseSheet(sheet);
    for (const slug of slugs) {
      const out = {
        character: slug.replace(/_/g, ' '),
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
    console.log(`  ${sheetName} -> ${slugs.join(', ')} (${moves.length} moves)`);
  }

  console.log(`\nWrote ${written} character files to ${OUT_DIR}`);
  console.log(`Skipped: ${[...SKIPPED_SHEETS].filter(s => s !== 'GlossaryNotes').join(', ')}`);
}

main().catch(err => { console.error(err); process.exit(1); });
