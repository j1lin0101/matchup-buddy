/**
 * SSBU Shield Safety & Punish Analysis
 *
 * Scope is intentionally narrower than Rivals 2 (see analysis.js): dragdown.wiki's
 * "safety" field is a pre-baked shield-advantage number (not raw formula inputs),
 * so this module only reads it directly rather than computing shield stun/endlag
 * itself. There is no live percent-adjustable On Hit calculator here — Ultimate's
 * hitstun is percent-dependent and we only have the wiki's fixed reference value.
 *
 * OOS (Out of Shield) timing, per ssbwiki.com's "Out of shield" article:
 *   Aerials       → jumpSquat (per-character; 3f for everyone except Kazuya's 6f) + startup
 *   Up Smash      → raw startup, no extra delay (Ultimate lets Up Smash act directly
 *                   out of shield without dropping shield or jumping first)
 *   Grab          → raw startup, no extra delay (shield-native option)
 *   Everything else (jab/tilt/dash attack/forward+down smash/all specials)
 *                 → SHIELD_RELEASE_FRAMES (11) + startup
 *
 * Note: Ultimate's "Up Special can also act OOS with zero delay" rule is NOT
 * modeled — SSBU_MoveData names specials with each character's unique move name
 * (e.g. Mario's up special is "Super Jump Punch"), so there's no reliable,
 * data-driven way to identify which of a character's specials occupies the
 * Up Special input slot without a hand-curated per-character table. All specials
 * are conservatively treated with the standard shield-release delay.
 *
 * Category naming is also inconsistent across the ~90-character cast (e.g. "Neutral
 * Aerial" vs "Neutral Air" vs Kazuya's abbreviated "NAir"), so categorization below
 * uses loose substring matching rather than exact names. A handful of especially
 * unusual movesets (Kazuya's Tekken-style abbreviations, Ice Climbers' split
 * per-partner/per-hit move names) will have some moves fall into the Specials
 * catch-all rather than their "true" category — cosmetic only, doesn't affect the
 * shield safety numbers themselves.
 */

const SHIELD_RELEASE_FRAMES = 11;
const GRAB_OOS_DELAY = 0;
const SAFE_THRESHOLD = -3;

const CATEGORY_ORDER = ['Normals', 'Smashes', 'Aerials', 'Specials'];

function isGrabMove(moveName) {
  return /grab/i.test(moveName);
}

function isExcludedMove(moveName) {
  return /grab|pummel|throw|getup|ledge/i.test(moveName);
}

function isUpSmash(moveName) {
  return /\bup\s*smash\b/i.test(moveName) || /^u\s*smash$/i.test(moveName);
}

function isAerial(moveName) {
  return /air|aerial/i.test(moveName);
}

/**
 * Categorizes a move name into one of: Normals, Smashes, Aerials, Specials.
 * See module doc comment for the naming-inconsistency caveat.
 */
function getCategory(moveName) {
  if (isAerial(moveName)) return 'Aerials';
  if (/smash/i.test(moveName)) return 'Smashes';
  if (/jab|tilt|dash attack/i.test(moveName)) return 'Normals';
  return 'Specials';
}

/**
 * Returns the OOS delay in frames for a given move.
 *   Grab       → 0 (shield-native, raw startup)
 *   Up Smash   → 0 (Ultimate-specific: acts directly out of shield)
 *   Aerials    → characterData.jumpSquat
 *   Everything else → SHIELD_RELEASE_FRAMES (11)
 */
function getOOSDelay(moveName, characterData) {
  if (isGrabMove(moveName)) return GRAB_OOS_DELAY;
  if (isUpSmash(moveName)) return 0;
  if (isAerial(moveName)) return characterData.jumpSquat ?? SHIELD_RELEASE_FRAMES;
  return SHIELD_RELEASE_FRAMES;
}

/**
 * Returns all moves with their best (least negative / most positive) shield safety,
 * sorted from safest to most punishable.
 */
function getAllShieldSafeties(characterData) {
  const results = [];
  characterData.moves.forEach(function(move) {
    if (isExcludedMove(move.move)) return;
    move.hitboxes.forEach(function(h) {
      if (!h.shieldSafety) return;
      results.push({
        move:         move.move,
        hitbox:       h.hitbox,
        startup:      move.startup,
        category:     getCategory(move.move),
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
 * startup (delay + move startup). Grab is added if not already present in the
 * move data.
 */
function getOOSOptions(characterData) {
  const options = [];

  characterData.moves.forEach(function(move) {
    if (isExcludedMove(move.move)) return;
    if (move.startup === null || move.startup === undefined) return;

    const oosDelay   = getOOSDelay(move.move, characterData);
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
      startup:      8,
      oosDelay:     GRAB_OOS_DELAY,
      oosStartup:   8,
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
    if (isExcludedMove(move.move)) return;
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
        category:        getCategory(move.move),
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

/**
 * Combo Breakers: a character's fastest escape options out of a combo — their
 * airdodge, their jump (jumpsquat), and any of their own moves faster than both.
 * Character-intrinsic, not matchup-dependent.
 */
function getComboBreakers(characterData) {
  const results = [];
  const { airdodge, jumpSquat, moves } = characterData;

  if (airdodge) results.push({ label: 'Airdodge', startup: airdodge.startup, isDefensive: true });
  if (jumpSquat != null) results.push({ label: 'Jump', startup: jumpSquat, isDefensive: true });

  const threshold = Math.min(
    airdodge ? airdodge.startup : Infinity,
    jumpSquat != null ? jumpSquat : Infinity
  );

  moves.forEach(function(move) {
    if (isExcludedMove(move.move)) return;
    if (move.startup == null) return;
    if (move.startup < threshold) {
      results.push({ label: move.move, startup: move.startup, isDefensive: false });
    }
  });

  results.sort(function(a, b) { return a.startup - b.startup; });
  return results;
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
  getComboBreakers,
};
