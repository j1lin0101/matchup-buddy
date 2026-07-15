/**
 * Melee Shield Safety & Punish Analysis
 *
 * Scope is intentionally narrower than Rivals 2 (see analysis.js): this mirrors
 * the SSBU build's scope (analysisSsbu.js, since removed) — shield safety and
 * punish analysis only, no On Hit calculator or floorhug/CC analysis.
 *
 * Unlike SSBU, FightCore's frame data (scripts/fetch-melee-data.js) gives raw
 * per-hitbox shieldstun rather than a pre-baked advantage number, so the scraper
 * computes shield advantage itself using the same formula already proven correct
 * for Rivals of Aether 2 in scripts/cargo-scrape.js (Rivals' own mechanics were
 * explicitly modeled after Melee's).
 *
 * OOS (Out of Shield) timing — verified this session against outofshield.com's
 * published Melee numbers for Fox (Shine=4, Nair=7, Bair=7, Grab=7, Up-Smash=8,
 * Dair=8, Fair=9, Uair=11/14 — all matched exactly):
 *   Grab              → raw startup, no extra delay (shield-native option)
 *   Aerials           → characterData.jumpSquat + startup (must fully leave the ground)
 *   Up Smash / Up Special (jump-cancelled) → startup + 1 (Melee-specific: jump-cancelling
 *                        these skips jumpsquat entirely rather than adding it — this is
 *                        genuinely different from how Ultimate/Rivals model jump-cancel,
 *                        confirmed empirically rather than assumed)
 *   Everything else (jab/tilt/dash attack/forward+down smash/other specials)
 *                     → SHIELD_RELEASE_FRAMES (15) + startup
 *
 * Categorization uses FightCore's numeric move `type` field (1=Tilts, 2=Jab/Dash
 * Attack/Smash, 3=Aerials, 4=Specials, 5=Dodges, 6=Grab/Throw/Pummel, 7=Tech/Getup,
 * 8=Ledge attack) rather than name matching — reliable across the whole cast,
 * unlike SSBU's naming inconsistencies. Types 5/7/8 are always excluded from
 * shield-safety analysis (dodges, tech/getup, ledge attacks don't interact with
 * shield pressure); type 6 is excluded except for the two universal OOS options
 * it contains (Grab, Dashgrab) — throws/pummel aren't meaningful here since they
 * only happen after a grab already connected.
 */

const SHIELD_RELEASE_FRAMES = 15;
const GRAB_OOS_DELAY = 0;
const JUMP_CANCEL_SHARED_FRAME = 1;
const SAFE_THRESHOLD = -3;

const CATEGORY_ORDER = ['Normals', 'Smashes', 'Aerials', 'Specials'];

// Per-character specials that are jump-cancelable OOS the same way aerials are
// (jumpSquat + startup, not the Up Smash/Up Special "+1" shortcut) — most
// famously Fox/Falco's Shine ("Reflector"). Confirmed against outofshield.com's
// published Fox data: Shine OOS = 4 = jumpSquat(3) + startup(1). Mirrors the
// same per-character exception list pattern analysis.js uses for Rivals
// (JUMP_CANCEL_OOS_SPECIALS).
const JUMP_CANCEL_SPECIALS = {
  Fox: ['Reflector'],
  Falco: ['Reflector'],
};

function isGrabMove(moveName) {
  return /^(dash)?grab$/i.test(moveName.trim());
}

function isUpSmash(moveName) {
  return /^up\s*smash/i.test(moveName);
}

function isExcludedMove(move) {
  if (move.type === 5 || move.type === 7 || move.type === 8) return true;
  if (move.type === 6) return !isGrabMove(move.move);
  return false;
}

/**
 * Categorizes a move into one of: Normals, Smashes, Aerials, Specials, based on
 * FightCore's numeric type field (type 2 bundles Jab/Dash Attack in with Smashes,
 * split out here by checking for "Smash" in the name).
 */
function getCategory(move) {
  if (move.type === 3) return 'Aerials';
  if (move.type === 4) return 'Specials';
  if (move.type === 2 && /smash/i.test(move.move)) return 'Smashes';
  return 'Normals'; // type 1 (tilts) and type 2 non-smashes (jab, dash attack)
}

/**
 * Returns the OOS delay in frames for a given move.
 *   Grab                          → 0 (shield-native, raw startup)
 *   Up Smash, Up Special          → 1 (jump-cancelled: skips jumpsquat in Melee)
 *   Aerials, JUMP_CANCEL_SPECIALS → characterData.jumpSquat
 *   Everything else               → SHIELD_RELEASE_FRAMES (15)
 */
function getOOSDelay(move, characterData) {
  if (isGrabMove(move.move)) return GRAB_OOS_DELAY;
  if (isUpSmash(move.move) || move.isUpSpecial) return JUMP_CANCEL_SHARED_FRAME;
  const jumpCancelSpecials = JUMP_CANCEL_SPECIALS[characterData.character] || [];
  if (move.type === 3 || jumpCancelSpecials.some(s => move.move.startsWith(s))) {
    return characterData.jumpSquat ?? SHIELD_RELEASE_FRAMES;
  }
  return SHIELD_RELEASE_FRAMES;
}

/**
 * Returns all moves with their best (least negative / most positive) shield safety,
 * sorted from safest to most punishable.
 */
function getAllShieldSafeties(characterData) {
  const results = [];
  characterData.moves.forEach(function(move) {
    if (isExcludedMove(move)) return;
    move.hitboxes.forEach(function(h) {
      if (!h.shieldSafety) return;
      results.push({
        move:         move.move,
        hitbox:       h.hitbox,
        startup:      move.startup,
        category:     getCategory(move),
        shieldSafety: h.shieldSafety,
        shieldRaw:    h.shieldRaw,
      });
    });
  });
  results.sort(function(a, b) { return b.shieldSafety.max - a.shieldSafety.max; });
  return results;
}

/**
 * Returns the character's safest moves on shield.
 *
 * When defenderOOSOptions is provided (matchup context), "safest" means fewest
 * punish options available — moves with 0–3 punishes, sorted by punish count then
 * by best shield safety. Without defender context, falls back to a frame threshold.
 */
function getSafestOptions(characterData, defenderOOSOptions) {
  const entries = getAllShieldSafeties(characterData);

  if (defenderOOSOptions) {
    const results = [];
    entries.forEach(function(entry) {
      const defenderFrameAdv = -entry.shieldSafety.max;
      const punishCount = defenderOOSOptions.filter(function(opt) {
        return opt.oosStartup <= defenderFrameAdv;
      }).length;
      if (punishCount > 3) return;
      results.push(Object.assign({}, entry, { punishCount }));
    });
    results.sort(function(a, b) {
      return a.punishCount - b.punishCount || b.shieldSafety.max - a.shieldSafety.max;
    });
    return results;
  }

  const results = [];
  entries.forEach(function(entry) {
    if (entry.shieldSafety.max < SAFE_THRESHOLD) return;
    results.push(entry);
  });
  results.sort(function(a, b) { return b.shieldSafety.max - a.shieldSafety.max; });
  return results;
}

/**
 * Returns the character's OOS (out of shield) options, sorted by effective OOS
 * startup (delay + move startup). Grab and Wavedash are added if not already
 * present in the move data.
 */
function getOOSOptions(characterData) {
  const options = [];

  characterData.moves.forEach(function(move) {
    if (isExcludedMove(move)) return;
    if (move.startup === null || move.startup === undefined) return;

    const oosDelay   = getOOSDelay(move, characterData);
    const oosStartup = move.startup + oosDelay;

    let bestShieldSafety = null;
    move.hitboxes.forEach(function(h) {
      if (!h.shieldSafety) return;
      if (!bestShieldSafety || h.shieldSafety.max > bestShieldSafety.max) {
        bestShieldSafety = h.shieldSafety;
      }
    });

    options.push({
      move:         move.move,
      label:        move.move,
      startup:      move.startup,
      oosDelay,
      oosStartup,
      shieldSafety: bestShieldSafety,
    });
  });

  if (!options.some(function(o) { return isGrabMove(o.move); })) {
    options.push({
      move:         'Grab',
      label:        'Grab',
      startup:      7,
      oosDelay:     GRAB_OOS_DELAY,
      oosStartup:   7,
      shieldSafety: null,
    });
  }

  if (characterData.wavedashOOSFrames != null) {
    options.push({
      move:         'Wavedash',
      label:        'Wavedash',
      startup:      characterData.wavedashOOSFrames,
      oosDelay:     0,
      oosStartup:   characterData.wavedashOOSFrames,
      shieldSafety: null,
    });
  }

  options.sort(function(a, b) { return a.oosStartup - b.oosStartup; });
  return options;
}

/**
 * Returns only the OOS options at 15f or faster — used for the overview display
 * panel. analyzeMatchup uses the full getOOSOptions so punish counts reflect all
 * moves that can realistically punish, not just the fastest ones.
 */
function getDisplayOOSOptions(characterData) {
  return getOOSOptions(characterData).filter(function(o) { return o.oosStartup <= 15; });
}

/**
 * Matchup analysis: given attacker and defender character data, returns a
 * breakdown of each attacker move+hitbox as safe or punishable, and lists which
 * defender moves can punish it.
 */
function analyzeMatchup(attackerData, defenderData) {
  const defenderOOSOptions = getOOSOptions(defenderData);
  const results = [];

  attackerData.moves.forEach(function(move) {
    if (isExcludedMove(move)) return;
    move.hitboxes.forEach(function(h) {
      if (!h.shieldSafety) return;

      const shieldAdv = h.shieldSafety;
      const defenderFrameAdv = -shieldAdv.max;

      const punishes = defenderOOSOptions.filter(function(opt) {
        return opt.oosStartup <= defenderFrameAdv;
      });

      const isSafe       = punishes.length === 0;
      const isRisky       = punishes.length >= 1 && punishes.length <= 3;
      const isPunishable  = punishes.length >= 4;

      results.push({
        move:            move.move,
        hitbox:          h.hitbox,
        startup:         move.startup,
        category:        getCategory(move),
        shieldSafety:    shieldAdv,
        shieldRaw:       h.shieldRaw,
        isSafe,
        isRisky,
        isPunishable,
        punishCount:     punishes.length,
        defenderFrameAdv,
        punishes,
      });
    });
  });

  results.sort(function(a, b) {
    if (a.punishCount !== b.punishCount) return a.punishCount - b.punishCount;
    return b.shieldSafety.max - a.shieldSafety.max;
  });

  return {
    attacker:      attackerData.character,
    defender:      defenderData.character,
    shieldRelease: SHIELD_RELEASE_FRAMES,
    safeThreshold: SAFE_THRESHOLD,
    breakdown:     results,
  };
}

export {
  CATEGORY_ORDER,
  SHIELD_RELEASE_FRAMES,
  GRAB_OOS_DELAY,
  SAFE_THRESHOLD,
  getCategory,
  isGrabMove,
  isExcludedMove,
  getOOSDelay,
  getAllShieldSafeties,
  getSafestOptions,
  getOOSOptions,
  getDisplayOOSOptions,
  analyzeMatchup,
};
