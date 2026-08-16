/**
 * Smash Ultimate Out-of-Shield Analysis
 *
 * Data comes from app/public/data/ssbu/<slug>.json (see
 * scripts/fetch-ssbu-frame-data.js) — a community frame-data spreadsheet
 * with every numeric field stored as { raw, parsed }, where `parsed` is
 * explicitly null whenever the source cell wasn't confidently machine-
 * parseable. This module only ever reads `.parsed` and skips a move
 * entirely when it's null, rather than falling back to a guessed number.
 *
 * OOS (Out of Shield) timing — confirmed directly by the user, matching
 * the source spreadsheet's own "Block advantage stuff" glossary notes:
 *   Default (everything else)      → SHIELD_DROP_FRAMES (11) + startup
 *   Up Special, Up Smash           → raw startup, no extra delay (these
 *                                     skip putting the shield down first)
 *   Aerials (jump then act)        → AERIAL_OOS_DELAY (3) + startup
 *   Grab                           → GRAB_OOS_DELAY (4) + startup (grab's
 *                                     own shorter shieldgrab waiting period,
 *                                     not the full shield-drop)
 * Dash Grab/Pivot Grab/Pummel/Throws and the Defensive category (spot
 * dodge, rolls, air dodges) are not "attack options out of shield" in the
 * sense this list means — mirrors Melee/Rivals' own OOS list conventions.
 * Command-grab specials (Bowser's Flying Slam, Wario's Chomp, etc.) ARE
 * kept — they're Specials-category moves, not Grabs/Throws, so they're
 * unaffected by that exclusion.
 *
 * Up Special / Up Smash detection: the scraper now generalizes every
 * Specials-category move to a generic "Neutral/Side/Up/Down Special"
 * label (cross-referenced against ssbwiki.com, see
 * scripts/fetch-ssbu-frame-data.js's applyDirectionSpecialName) instead of
 * each character's own flavor name — so unlike the very first version of
 * this file, Up Special is now name-detectable the same reliable way Up
 * Smash always was, no hand-curated per-character lookup needed.
 *
 * Non-first-hit exclusion: a move that's a later hit of a combo string —
 * Jab 2/3, a numbered continuation tier of a Side Special string (Marth's
 * Dancing Blade, Corrin's Dragon Lunge), a Rapid Jab loop or its finisher —
 * can't be thrown out on its own from neutral; it only becomes available
 * once the earlier hit(s) in the string have already connected. These are
 * excluded from the OOS list entirely rather than shown as if they were a
 * standalone option.
 */

const SHIELD_DROP_FRAMES = 11;
const GRAB_OOS_DELAY = 4;
const AERIAL_OOS_DELAY = 3;
const UP_B_UP_SMASH_OOS_DELAY = 0;

function isGrabMove(moveName) {
  return /^grab$/i.test(moveName.trim());
}

function isUpSmash(moveName) {
  return /^up smash\b/i.test(moveName.trim());
}

// Contains, not startsWith — catches qualifier-prefixed variants too (e.g.
// "True Up Special", "Limit Up Special") which are still fundamentally the
// character's Up Special, just an enhanced form of it.
function isUpSpecial(moveName) {
  return /up special/i.test(moveName);
}

// Matches a later, non-first hit of a combo string — see file header doc.
const NON_FIRST_HIT_PATTERNS = [
  /rapid/i,
  /finisher/i,
  /\(combo w\/ finisher\)/i,
  /^-?jab\s*[2-9]/i,
  /^(forward|up|down) tilt\s*[2-9]/i,
  /(neutral|side|up|down) special\s*[2-9]/i,
];

function isNonFirstHit(moveName) {
  return NON_FIRST_HIT_PATTERNS.some(p => p.test(moveName));
}

// True for moves that belong in the OOS options list at all — mirrors
// Melee/Rivals' own conventions: dodges/rolls/air dodges aren't "attack
// options out of shield", only plain Grab (not Dash Grab/Pivot
// Grab/Pummel/Throws) is a meaningful punish option from that category,
// and a non-first-hit combo continuation can't be thrown out standalone.
function isEligibleForOOS(move) {
  if (move.category === 'Defensive') return false;
  if (move.category === 'Grabs/Throws') return isGrabMove(move.move);
  if (isNonFirstHit(move.move)) return false;
  return true;
}

function getOOSDelay(move) {
  if (isGrabMove(move.move)) return GRAB_OOS_DELAY;
  if (move.category === 'Smashes' && isUpSmash(move.move)) return UP_B_UP_SMASH_OOS_DELAY;
  if (move.category === 'Specials' && isUpSpecial(move.move)) return UP_B_UP_SMASH_OOS_DELAY;
  if (move.category === 'Aerials') return AERIAL_OOS_DELAY;
  return SHIELD_DROP_FRAMES;
}

/**
 * Returns the character's OOS (out of shield) options, sorted by effective
 * OOS startup (delay + move startup). Moves whose startup isn't confidently
 * parseable (see file header doc) are skipped rather than guessed.
 */
function getOOSOptions(characterData) {
  const options = [];
  characterData.moves.forEach(function(move) {
    if (!isEligibleForOOS(move)) return;
    const startupFrames = move.startup && move.startup.parsed;
    if (!startupFrames || startupFrames.length === 0) return;
    const startup = startupFrames[0];
    const oosDelay = getOOSDelay(move);
    options.push({
      move: move.move,
      category: move.category,
      startup,
      oosDelay,
      oosStartup: startup + oosDelay,
    });
  });
  options.sort(function(a, b) { return a.oosStartup - b.oosStartup; });
  return options;
}

/**
 * Returns only the OOS options at 15f or faster — used for a display
 * panel, mirroring Melee/Rivals' own "Fastest OOS Options" convention.
 */
function getDisplayOOSOptions(characterData) {
  return getOOSOptions(characterData).filter(function(o) { return o.oosStartup <= 15; });
}

export {
  SHIELD_DROP_FRAMES,
  GRAB_OOS_DELAY,
  AERIAL_OOS_DELAY,
  UP_B_UP_SMASH_OOS_DELAY,
  getOOSOptions,
  getDisplayOOSOptions,
};
