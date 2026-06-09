/**
 * RoA2 Shield Analysis Logic
 *
 * Shield safety: how many frames the attacker is +/- after the move hits shield.
 *   Positive = attacker has advantage (safe)
 *   Negative = defender has advantage (punishable)
 *
 * OOS (Out of Shield) options use one of two delay values:
 *
 *   Standard OOS  → shield_release (8f) + move startup
 *     Applies to: grounded normals (Jab, tilts, Grab, Dash Attack, etc.)
 *
 *   Jump-cancel OOS → jump_squat (4f) + move startup
 *     Applies to: aerials, Up Strong, and specific jump-cancellable specials.
 *     These moves bypass shield release by being buffered during jump squat.
 */

// Grounded moves not listed below use shield release before they can come out
import { getDisplayName } from './nicknames.js';

const SHIELD_RELEASE_FRAMES = 12;

// Aerials, Up Strong, and Up Specials buffer during jump squat
// Total OOS = JUMP_SQUAT_FRAMES (4) + move startup
const JUMP_SQUAT_FRAMES = 4;

// Grab has no shield release overhead — its startup IS its OOS timing
// (Active on frame 8 = just grab's raw startup of 8)
const GRAB_OOS_DELAY = 0;

// How safe a move must be (max shield safety) to be considered "safe on shield"
const SAFE_THRESHOLD = -3;

/**
 * Per-character specials that can be jump-cancel OOS (buffered during jump squat).
 * Neutral Specials that behave like Zetterburn's shine go here.
 */
const JUMP_CANCEL_OOS_SPECIALS = {
  'Zetterburn': ['Neutral Special'],
};

function isGrabMove(moveName) {
  return /\bgrab\b/i.test(moveName);
}

function isExcludedMove(moveName) {
  return /Pummel|Throw|Ledge|Getup|Get[- ]up|Walljump/i.test(moveName);
}

/**
 * Returns true if a move uses jump-squat OOS timing (JUMP_SQUAT_FRAMES + startup).
 * Applies to: aerials, Up Strong, Up Special, and specific jump-cancellable specials.
 */
function isJumpCancelOOS(moveName, characterName) {
  if (/\bAir\b/i.test(moveName))       return true;  // any aerial
  if (moveName === 'Up Strong')          return true;
  if (/^Up Special/i.test(moveName))    return true;  // all Up Specials
  const specials = JUMP_CANCEL_OOS_SPECIALS[characterName] || [];
  return specials.some(function(s) { return moveName.includes(s); });
}

/**
 * Returns the OOS delay in frames for a given move.
 *   Grab-type moves    → GRAB_OOS_DELAY (0)
 *   Jump-cancel moves  → JUMP_SQUAT_FRAMES (4)
 *   Everything else    → SHIELD_RELEASE_FRAMES (8)
 */
function getOOSDelay(moveName, characterName) {
  if (isGrabMove(moveName))                        return GRAB_OOS_DELAY;
  if (isJumpCancelOOS(moveName, characterName))    return JUMP_SQUAT_FRAMES;
  return SHIELD_RELEASE_FRAMES;
}

const CATEGORY_ORDER = ['Normals', 'Strongs', 'Aerials', 'Specials', 'Misc'];

/**
 * Categorizes a move name into one of: Normals, Strongs, Aerials, Specials, Misc.
 */
function getCategory(moveName) {
  if (/\bAir\b/i.test(moveName) || /Z-Air/i.test(moveName))    return 'Aerials';
  if (/Ledge|Getup|Get[- ]up|Walljump|Pummel/i.test(moveName)) return 'Misc';
  if (/^(Neutral|Forward|Up|Down) Special/i.test(moveName))    return 'Specials';
  if (/^(Forward|Up|Down) Strong/i.test(moveName))             return 'Strongs';
  return 'Normals';
}

/**
 * Returns all moves with their best (least negative / most positive) shield safety,
 * sorted from safest to most punishable.
 */
function getAllShieldSafeties(characterData) {
  const results = [];

  characterData.moves.forEach(function(move) {
    if (isExcludedMove(move.move)) return;
    if (isGrabMove(move.move)) return;
    move.hitboxes.forEach(function(h) {
      if (!h.shieldSafety) return;
      if (h.shieldSafety.isNA) return;  // (legacy guard, no longer generated)
      results.push({
        move:        move.move,
        hitbox:      h.hitbox,
        startup:     move.startup,
        shieldSafety: h.shieldSafety,
        shieldRaw:   h.shieldRaw,
        tumblePercent: h.tumblePercent,
        perCharacterTumble: h.perCharacterTumble,
      });
    });
  });

  // Sort: highest max shield safety first (safest first)
  results.sort(function(a, b) { return b.shieldSafety.max - a.shieldSafety.max; });
  return results;
}

/**
 * Returns the character's safest moves on shield.
 *
 * When defenderOOSOptions is provided (matchup context), "safest" means fewest
 * punish options available — moves with 0–3 punishes, sorted by punish count then
 * by best shield safety.
 *
 * Without defender context, falls back to moves where shield safety max >= SAFE_THRESHOLD.
 */
function getSafestOptions(characterData, defenderOOSOptions) {
  const entries = getAllShieldSafeties(characterData);

  if (defenderOOSOptions) {
    // Matchup-aware: classify by punish count, keep best hitbox per move
    const seen = {};
    entries.forEach(function(entry) {
      const defenderFrameAdv = -entry.shieldSafety.max;
      const punishCount = defenderOOSOptions.filter(function(opt) {
        return opt.oosStartup <= defenderFrameAdv;
      }).length;
      // Only show moves that are safe or risky (0–3 punish options)
      if (punishCount > 3) return;
      if (!seen[entry.move] || punishCount < seen[entry.move].punishCount ||
          (punishCount === seen[entry.move].punishCount &&
           entry.shieldSafety.max > seen[entry.move].shieldSafety.max)) {
        seen[entry.move] = Object.assign({}, entry, { punishCount });
      }
    });
    const result = Object.values(seen);
    result.sort(function(a, b) {
      return a.punishCount - b.punishCount || b.shieldSafety.max - a.shieldSafety.max;
    });
    return result;
  }

  // Fallback: frame-threshold based
  const seen = {};
  entries.forEach(function(entry) {
    if (entry.shieldSafety.max < SAFE_THRESHOLD) return;
    if (!seen[entry.move] || entry.shieldSafety.max > seen[entry.move].shieldSafety.max) {
      seen[entry.move] = entry;
    }
  });
  const result = Object.values(seen);
  result.sort(function(a, b) { return b.shieldSafety.max - a.shieldSafety.max; });
  return result;
}

/**
 * Returns the character's best OOS (out of shield) options — moves with the lowest startup
 * that can realistically punish common shield pressure.
 *
 * Returns all moves sorted by effective OOS startup (startup + SHIELD_RELEASE_FRAMES),
 * filtered to moves that have a startup value.
 */
function getOOSOptions(characterData) {
  const options = [];

  characterData.moves.forEach(function(move) {
    if (isExcludedMove(move.move)) return;
    if (move.startup === null || move.startup === undefined) return;

    const oosDelay   = getOOSDelay(move.move, characterData.character);
    const oosStartup = move.startup + oosDelay;
    const jc         = (oosDelay === JUMP_SQUAT_FRAMES);

    // Determine the best shield safety of this move (if any) — relevant context
    let bestShieldSafety = null;
    move.hitboxes.forEach(function(h) {
      if (!h.shieldSafety) return;
      if (!bestShieldSafety || h.shieldSafety.max > bestShieldSafety.max) {
        bestShieldSafety = h.shieldSafety;
      }
    });

    // Label: use nickname if available, prefix non-aerial JC moves with "JC"
    const isAerial   = /\bAir\b/i.test(move.move);
    const displayName = getDisplayName(characterData.character, move.move);
    const label       = (jc && !isAerial) ? 'JC ' + displayName : displayName;

    options.push({
      move:           move.move,
      label,
      startup:        move.startup,
      oosDelay,
      oosStartup,     // total frames from shielding to move hitting
      jumpCancel:     jc,
      shieldSafety:   bestShieldSafety,
    });
  });

  options.sort(function(a, b) { return a.oosStartup - b.oosStartup; });
  return options;
}

/**
 * Returns the single fastest OOS option for a character.
 */
function getBestOOSOption(characterData) {
  const options = getOOSOptions(characterData);
  return options.length ? options[0] : null;
}

/**
 * Matchup analysis: given attacker and defender character data,
 * returns a breakdown of each attacker move+hitbox as safe or punishable,
 * and lists which defender moves can punish it (with which specific hitbox).
 */
function analyzeMatchup(attackerData, defenderData) {
  const defenderOOSOptions = getOOSOptions(defenderData);
  const results = [];

  attackerData.moves.forEach(function(move) {
    if (isExcludedMove(move.move)) return;
    if (isGrabMove(move.move)) return;
    move.hitboxes.forEach(function(h) {
      if (!h.shieldSafety) return;

      const shieldAdv = h.shieldSafety; // { min, max }

      // Frames of advantage the defender has in the best case (most negative for attacker)
      const defenderFrameAdv = -shieldAdv.max;

      // All defender OOS options that can land: oosStartup <= defenderFrameAdv
      const punishes = defenderOOSOptions.filter(function(opt) {
        return opt.oosStartup <= defenderFrameAdv;
      });

      // Classify by number of punish options available
      const isSafe       = punishes.length === 0;
      const isRisky      = punishes.length >= 1 && punishes.length <= 3;
      const isPunishable = punishes.length >= 4;

      results.push({
        move:               move.move,
        hitbox:             h.hitbox,
        startup:            move.startup,
        category:           getCategory(move.move),
        shieldSafety:       shieldAdv,
        shieldRaw:          h.shieldRaw,
        isSafe,
        isRisky,
        isPunishable,
        punishCount:        punishes.length,
        defenderFrameAdv,
        punishes,
        tumblePercent:           h.tumblePercent             ?? null,
        perCharacterTumble:      h.perCharacterTumble        ?? {},
        perCharacterTumbleAerial: h.perCharacterTumbleAerial ?? {},
      });
    });
  });

  // Sort: fewest punish options first, then by best shield safety within each tier
  results.sort(function(a, b) {
    if (a.punishCount !== b.punishCount) return a.punishCount - b.punishCount;
    return b.shieldSafety.max - a.shieldSafety.max;
  });

  return {
    attacker:        attackerData.character,
    defender:        defenderData.character,
    shieldRelease:   SHIELD_RELEASE_FRAMES,
    safeThreshold:   SAFE_THRESHOLD,
    breakdown:       results,
  };
}

/**
 * Per-character tumble % for a specific hitbox against a specific opponent.
 * Returns the tumble % needed to send that opponent into tumble.
 */
function getTumbleVsOpponent(hitbox, opponentName) {
  const upper = opponentName.toUpperCase();
  if (hitbox.perCharacterTumble && hitbox.perCharacterTumble[upper] !== undefined) {
    return hitbox.perCharacterTumble[upper];
  }
  // Fallback to general tumble range midpoint
  if (hitbox.tumblePercent) {
    return Math.round((hitbox.tumblePercent.min + hitbox.tumblePercent.max) / 2);
  }
  return null;
}

export {
  CATEGORY_ORDER,
  getCategory,
  SHIELD_RELEASE_FRAMES,
  JUMP_SQUAT_FRAMES,
  GRAB_OOS_DELAY,
  JUMP_CANCEL_OOS_SPECIALS,
  SAFE_THRESHOLD,
  isGrabMove,
  isJumpCancelOOS,
  getOOSDelay,
  getAllShieldSafeties,
  getSafestOptions,
  getOOSOptions,
  getBestOOSOption,
  analyzeMatchup,
  getTumbleVsOpponent,
};
