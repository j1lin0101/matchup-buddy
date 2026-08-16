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
 *
 * Up Special identification: unlike Up Smash (always literally named
 * "U-Smash" in the source data), specials use each character's own flavor
 * name, so which Specials-category row IS their Up Special can't be
 * detected from the data itself — this is the same problem that helped
 * sink the original SSBU scrape (see memory: ssbu-data-status). UP_SPECIAL_NAMES
 * below is a hand-curated, per-character lookup — every entry has been
 * checked to actually appear in that character's own generated Specials
 * list (catches typos, not hallucinated moves). Four characters are
 * deliberately left out rather than guessed: Kazuya (no traditional
 * recovery-special mapping — his kit doesn't fit the Neutral/Side/Up/Down
 * taxonomy) and the three customizable Mii Fighters (each has three valid
 * Up-special loadout options, picked at character select, not one fixed
 * move). Those four just don't get the Up Special OOS discount — they
 * fall through to the safe default (full shield-drop delay) rather than
 * a wrong one.
 */

const SHIELD_DROP_FRAMES = 11;
const GRAB_OOS_DELAY = 4;
const AERIAL_OOS_DELAY = 3;
const UP_B_UP_SMASH_OOS_DELAY = 0;

// Keyed by slug (see scripts/fetch-ssbu-frame-data.js SHEET_TO_SLUGS),
// value is the exact move name as it appears in that character's own
// Specials list.
const UP_SPECIAL_NAMES = {
  Banjo_and_Kazooie: 'Shock Spring Jump',
  Bayonetta: 'After Burner Kick',
  Bowser: 'Whirling Fortress',
  Bowser_Jr: 'Abandon Ship',
  Byleth: 'Sword of the Creator',
  Captain_Falcon: 'Falcon Dive',
  Charizard: 'Fly',
  Chrom: 'Soaring Slash',
  Cloud: 'Climhazzard',
  Corrin: 'Dragon Ascent',
  Daisy: 'Peach Parasol',
  Dark_Pit: 'Power of Flight',
  Dark_Samus: 'Screw Attack',
  Diddy_Kong: 'Rocketbarrel Boost',
  Donkey_Kong: 'Spinning Kong',
  Dr_Mario: 'Super Jump Punch',
  Duck_Hunt: 'Duck Jump',
  Falco: 'Fire Bird',
  Fox: 'Fire Fox',
  Ganondorf: 'Dark Dive',
  Greninja: 'Hydro Pump',
  Hero: 'Zap',
  Ike: 'Aether',
  Incineroar: 'Cross Chop',
  Inkling: 'Super Jump',
  Isabelle: 'Balloon Trip',
  Ivysaur: 'Vine Whip',
  Jigglypuff: 'Sing',
  Joker: 'Grappling Hook',
  Ken: 'Shoryuken',
  King_Dedede: 'Super Dedede Jump',
  King_K_Rool: 'Propellerpack',
  Kirby: 'Final Cutter',
  Link: 'Spin Attack',
  Little_Mac: 'Rising Uppercut',
  Lucario: 'Extreme Speed',
  Lucas: 'PK Thunder',
  Lucina: 'Dolphin Slash',
  Luigi: 'Super Jump Punch (ground)',
  Mario: 'Super Jump Punch',
  Marth: 'Dolphin Slash',
  Mega_Man: 'Rush Coil',
  Meta_Knight: 'Shuttle Loop',
  Mewtwo: 'Teleport',
  Min_Min: 'ARMS Jump',
  Mr_Game_and_Watch: 'Fire',
  Mythra: 'Ray of Punishment',
  Ness: 'PK Thunder',
  Olimar: 'Winged Pikmin',
  'Pac-Man': 'Pac-Jump',
  Palutena: 'Warp',
  Peach: 'Peach Parasol',
  Pichu: 'Agility',
  Pikachu: 'Quick Attack (one/two dashes)',
  Piranha_Plant: 'Piranhacopter',
  Pit: 'Power of Flight',
  Pyra: 'Prominence Revolt',
  ROB: 'Robo Burner',
  Richter: 'Uppercut',
  Ridley: 'Wing Blitz (up/horizontal/down)',
  Robin: 'Elwind',
  Rosalina_and_Luma: 'Launch Star',
  Roy: 'Blazer',
  Ryu: 'Shoryuken',
  Samus: 'Screw Attack',
  Sephiroth: 'Octaslash',
  Sheik: 'Vanish',
  Shulk: 'Air Slash',
  Simon: 'Uppercut',
  Snake: 'Cypher',
  Sonic: 'Spring Jump',
  Sora: 'Aerial Sweep',
  Squirtle: 'Waterfall',
  Steve: 'Elytra (ground)',
  Terry: 'Rising Tackle',
  Toon_Link: 'Spin Attack',
  Villager: 'Balloon Trip',
  Wario: 'Corkscrew',
  Wii_Fit_Trainer: 'Super Hoop',
  Wolf: 'Fire Wolf',
  Yoshi: 'Egg Throw',
  Young_Link: 'Spin Attack',
  Zelda: "Farore's Wind",
  Zero_Suit_Samus: 'Flip Jump',
};

function isGrabMove(moveName) {
  return /^grab$/i.test(moveName.trim());
}

function isUpSmash(moveName) {
  return /^u-smash/i.test(moveName.trim());
}

function isUpSpecial(slug, moveName) {
  return UP_SPECIAL_NAMES[slug] === moveName;
}

// True for moves that belong in the OOS options list at all — mirrors
// Melee/Rivals' own conventions: dodges/rolls/air dodges aren't "attack
// options out of shield", and only plain Grab (not Dash Grab/Pivot
// Grab/Pummel/Throws) is a meaningful punish option here.
function isEligibleForOOS(move) {
  if (move.category === 'Defensive') return false;
  if (move.category === 'Grabs/Throws') return isGrabMove(move.move);
  return true;
}

function getOOSDelay(move, slug) {
  if (isGrabMove(move.move)) return GRAB_OOS_DELAY;
  if (move.category === 'Smashes' && isUpSmash(move.move)) return UP_B_UP_SMASH_OOS_DELAY;
  if (move.category === 'Specials' && isUpSpecial(slug, move.move)) return UP_B_UP_SMASH_OOS_DELAY;
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
    const oosDelay = getOOSDelay(move, characterData.slug);
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
  UP_SPECIAL_NAMES,
  getOOSOptions,
  getDisplayOOSOptions,
};
