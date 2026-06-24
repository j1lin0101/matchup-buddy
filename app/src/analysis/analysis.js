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
    // Matchup-aware: include all non-STUN hitboxes with 0–3 punish options
    const results = [];
    entries.forEach(function(entry) {
      if (entry.shieldSafety.isStun) return;
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

  // Fallback: frame-threshold based (skip STUN hitboxes, include all qualifying hitboxes)
  const results = [];
  entries.forEach(function(entry) {
    if (entry.shieldSafety.isStun) return;
    if (entry.shieldSafety.max < SAFE_THRESHOLD) return;
    results.push(entry);
  });
  results.sort(function(a, b) { return b.shieldSafety.max - a.shieldSafety.max; });
  return results;
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

  // Grab and Wavedash are universal OOS options for every character
  // Add Grab only if not already present from character move data
  if (!options.some(function(o) { return isGrabMove(o.move); })) {
    options.push({
      move:         'Grab',
      label:        'Grab',
      startup:      8,
      oosDelay:     GRAB_OOS_DELAY,
      oosStartup:   8,
      jumpCancel:   false,
      shieldSafety: null,
    });
  }
  options.push({
    move:         'Wavedash',
    label:        'Wavedash',
    startup:      12,
    oosDelay:     0,
    oosStartup:   12,
    jumpCancel:   false,
    shieldSafety: null,
  });

  options.sort(function(a, b) { return a.oosStartup - b.oosStartup; });
  return options;
}

/**
 * Returns only the OOS options that are 12f or faster — used for the display panel
 * and filter chips. analyzeMatchup uses the full getOOSOptions so punish counts
 * reflect all moves that can realistically punish, not just the fastest ones.
 */
function getDisplayOOSOptions(characterData) {
  return getOOSOptions(characterData).filter(function(o) { return o.oosStartup <= 12; });
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
 * Returns moves that break floorhug at 0% — i.e. the opponent cannot crouch-cancel them
 * regardless of their current stock percentage. Three qualifying conditions:
 *   1. Strong attacks (Forward/Up/Down Strong) — always cause knockdown per game rules
 *   2. Spike hitboxes (hitbox name contains "Spike") — cause flinch, breaking floorhug
 *   3. Any hitbox with tumblePercent.max === 0 — always tumbles
 * Deduped to one entry per move name.
 */
function getFloorhugBreakers(characterData) {
  const seen = new Set();
  const results = [];

  characterData.moves.forEach(function(move) {
    if (isExcludedMove(move.move)) return;
    if (isGrabMove(move.move)) return;

    const isStrong = /^(Forward|Up|Down) Strong/i.test(move.move);

    move.hitboxes.forEach(function(h) {
      // Condition 1: Strong attacks (always break floorhug)
      const qualifiesStrong = isStrong;

      // Condition 2: Spike (angle 180–360)
      // Amsah-techability depends on aerial tumble % — tracked separately via badge (future)
      const angle = h.knockbackAngle;
      const isSpikeAngle = h.knockbackAngleMode === 'SpecifiedAngle' && angle > 180 && angle < 360;
      const qualifiesSpike = isSpikeAngle;

      // Condition 3: bForceFlinch
      const qualifiesFlinch = h.forceFlinch === true;

      // Condition 4: ForceTumble
      const qualifiesForceTumble = h.forceTumble === true;

      // Condition 5: ASDIMultiplier === 0, or SDIMultiplier === 0 and ASDIMultiplier === -1
      const qualifiesSDI = h.asdiMultiplier === 0 ||
        (h.sdiMultiplier === 0 && h.asdiMultiplier === -1);

      const qualifies = (qualifiesStrong || qualifiesSpike || qualifiesFlinch ||
                        qualifiesForceTumble || qualifiesSDI) && !h.autoFloorhuggable;

      const displayMove = /^(Neutral|Forward|Up|Down) Special/i.test(move.move)
        ? move.move.replace(/^((Neutral|Forward|Up|Down) Special).*/i, '$1')
        : move.move;

      const seenKey = isStrong ? displayMove : `${displayMove}|${h.hitbox}`;
      if (qualifies && !seen.has(seenKey)) {
        seen.add(seenKey);
        // For spikes: if aerial tumble threshold > 0, the move can be Amsah teched below
        // that threshold (flinch state allows teching; tumble state does not).
        // aerial.max === 0 means always tumbles → cannot be Amsah teched → no badge.
        const aerialTumble = qualifiesSpike && h.tumblePercent && h.tumblePercent.aerial
          && h.tumblePercent.aerial.max > 0
            ? h.tumblePercent.aerial
            : null;
        results.push({
          move:         displayMove,
          startup:      move.startup,
          hitbox:       isStrong ? null : (h.hitbox || null),
          aerialTumble, // {min, max} or null
          category:     getCategory(move.move),
        });
      }
    });
  });

  return results;
}

// From Module:RoA2_Move_Card: floorhug hitstun constants
const FLUG_SCALAR           = 4.07 / 3   // KB-to-hitstun multiplier
const CROUCH_REDUCTION      = 0.8        // CC reduces set-KB hitstun by this factor
const FLOORHUG_KB_THRESHOLD = 26         // KB threshold at which tumble occurs (= tumble threshold)

/**
 * Floorhug hitstun (flugStun) for a hitbox.
 * For scaling moves (kbs ≠ 0): uses the constant tumble-threshold KB (26).
 * For set-KB moves (kbs === 0): uses 3 × BKB (with crouch reduction for CC).
 * Cap: 8f for floorhug, 5f for crouch cancel.
 */
function calcFlugStun(kbs, bkb, hitstunMul, isCrouch) {
  if (hitstunMul == null) return null;
  const cap = isCrouch ? 5 : 8;
  const effectiveKB = (kbs !== 0)
    ? FLOORHUG_KB_THRESHOLD
    : 3 * bkb * (isCrouch ? CROUCH_REDUCTION : 1);
  const hitstun = effectiveKB * FLUG_SCALAR * hitstunMul;
  return Math.floor(Math.min(Math.max((hitstun - 1) / 2, 4), cap));
}

/**
 * On-hit frame advantage assuming defender is floorhugging or crouching.
 * FlugAdvantage = FlugStun − endlag
 * Endlag: use stored endlag field directly if available, else derive from
 * shieldSafety + shieldStun (requires damage). Returns null if not computable.
 */
function calcOnHitAdvantage(hitbox, isCrouch) {
  if (hitbox.hitstunMultiplier == null) return null;
  const flugStun = calcFlugStun(hitbox.kbs, hitbox.bkb, hitbox.hitstunMultiplier, isCrouch);
  if (flugStun === null) return null;
  let endlag;
  if (hitbox.endlag != null) {
    endlag = hitbox.endlag;
  } else if (hitbox.damage != null && hitbox.shieldSafety && !hitbox.shieldSafety.isStun && !hitbox.shieldSafety.isProjectile) {
    const shieldStun = Math.max(2, Math.floor(hitbox.damage * 0.8 + 1));
    endlag = shieldStun - 1 - hitbox.shieldSafety.max;
  } else {
    return null;
  }
  return flugStun - endlag;
}

/**
 * Defender's punish options when not behind a shield — no shield release overhead.
 * Grounded moves: raw startup. Aerials / JC moves: JUMP_SQUAT_FRAMES + startup.
 * Grab is always present at 8f.
 */
function getOnHitOptions(characterData) {
  const options = [];
  characterData.moves.forEach(function(move) {
    if (isExcludedMove(move.move)) return;
    if (move.startup == null) return;
    // Aerials require jump squat on hit; JC specials do not (pressed directly from ground)
    const isAerial = /\bAir\b/i.test(move.move);
    const delay = isAerial ? JUMP_SQUAT_FRAMES : 0;
    const onHitStartup = move.startup + delay;
    const displayName = getDisplayName(characterData.character, move.move);
    options.push({
      move:         move.move,
      label:        displayName,
      startup:      move.startup,
      onHitStartup,
      jumpCancel:   isAerial,
    });
  });
  if (!options.some(function(o) { return isGrabMove(o.move); })) {
    options.push({ move: 'Grab', label: 'Grab', startup: 8, onHitStartup: 8, jumpCancel: false });
  }
  options.sort(function(a, b) { return a.onHitStartup - b.onHitStartup; });
  return options;
}

/**
 * On-hit breakdown: for each attacker hitbox, computes floorhug/CC frame advantage
 * at the given defender percent. Moves that cause tumble at this % are flagged as
 * breaking floorhug (knockdown). Defender punish options use on-hit startup (no shield release).
 */
function getOnHitBreakdown(attackerData, defenderData, pct, isCrouch) {
  const defKey = defenderData.character.toUpperCase();
  const defenderOptions = getOnHitOptions(defenderData);
  const results = [];

  attackerData.moves.forEach(function(move) {
    if (isExcludedMove(move.move)) return;
    if (isGrabMove(move.move)) return;

    const isStrong = /^(Forward|Up|Down) Strong/i.test(move.move);
    const seenStrong = new Set();

    move.hitboxes.forEach(function(h) {
      const angle = h.knockbackAngle;
      const isSpike = h.knockbackAngleMode === 'SpecifiedAngle' && angle > 180 && angle < 360;

      // Moves that always break floorhug (per the 5-condition rule)
      const alwaysBreaks = isStrong || isSpike || h.forceTumble === true || h.forceFlinch === true
        || h.asdiMultiplier === 0 || (h.sdiMultiplier === 0 && h.asdiMultiplier === -1);

      // Deduplicate strongs: only one row per move name
      const displayMove = /^(Neutral|Forward|Up|Down) Special/i.test(move.move)
        ? move.move.replace(/^((Neutral|Forward|Up|Down) Special).*/i, '$1')
        : move.move;
      if (isStrong) {
        if (seenStrong.has(displayMove)) return;
        seenStrong.add(displayMove);
      }

      // Does it cause tumble (knockdown) at this specific %?
      let tumbleAtPct = false;
      if (!alwaysBreaks && h.tumblePercent) {
        let threshold = null;
        if (h.perCharacterTumble && h.perCharacterTumble[defKey] !== undefined) {
          threshold = h.perCharacterTumble[defKey];
        } else {
          threshold = h.tumblePercent.min;
        }
        tumbleAtPct = threshold !== null && pct >= threshold;
      }

      const breaksFloorhug = alwaysBreaks || tumbleAtPct;

      let flugAdvantage = null;
      let punishes = [];

      if (!breaksFloorhug) {
        flugAdvantage = calcOnHitAdvantage(h, isCrouch);
        if (flugAdvantage !== null) {
          const defenderFrameAdv = -flugAdvantage;
          if (defenderFrameAdv > 0) {
            punishes = defenderOptions.filter(function(opt) {
              return opt.onHitStartup <= defenderFrameAdv;
            });
          }
        }
      }

      results.push({
        move:               displayMove,
        hitbox:             isStrong ? null : h.hitbox,
        startup:            move.startup,
        category:           getCategory(move.move),
        breaksFloorhug,
        alwaysBreaks,
        flugAdvantage,
        punishes,
        tumblePercent:      h.tumblePercent,
        perCharacterTumble: h.perCharacterTumble,
      });
    });
  });

  return results;
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
  getDisplayOOSOptions,
  getBestOOSOption,
  analyzeMatchup,
  getTumbleVsOpponent,
  getFloorhugBreakers,
  calcFlugStun,
  calcOnHitAdvantage,
  getOnHitOptions,
  getOnHitBreakdown,
  getPerfectShieldOOSOptions,
  analyzePerfectShieldMatchup,
};

// --- Perfect Shield analysis ---

/**
 * Perfect Shield OOS options: grounded attacks only (jabs, tilts, strongs, specials).
 * No dash attack, no aerials. No shield release delay — raw startup is the OOS timing.
 * Deduplicates by base move name, keeping only the fastest hitbox per move.
 */
function getPerfectShieldOOSOptions(characterData) {
  const seen = {};
  characterData.moves.forEach(function(move) {
    if (isExcludedMove(move.move)) return;
    if (isGrabMove(move.move)) return;
    if (/dash\s*attack/i.test(move.move)) return;
    if (/\bair\b|aerial|z.air/i.test(move.move)) return;
    if (/ledge|getup|get[- ]up|walljump|pummel/i.test(move.move)) return;
    const cat = getCategory(move.move);
    if (!['Normals', 'Strongs', 'Specials'].includes(cat)) return;
    if (move.startup == null) return;
    // Use base move name (strip hitbox suffix like " [Hit 1]") for dedup
    const baseName = move.move.replace(/\s*\[.*\]$/, '').trim();
    if (!seen[baseName] || move.startup < seen[baseName].startup) {
      seen[baseName] = {
        move:       move.move,
        label:      getDisplayName(characterData.character, baseName),
        startup:    move.startup,
        oosStartup: move.startup,
        category:   cat,
      };
    }
  });
  const options = Object.values(seen);
  options.sort(function(a, b) { return a.oosStartup - b.oosStartup; });
  return options;
}

/**
 * Perfect Shield matchup analysis.
 * PS negates shield stun, so the attacker's frame advantage is:
 *   psAdv = shieldSafety.max - (shieldStun - 1)  =  shieldSafety.max - shieldStun + 1
 * Defender's PS OOS options (no shield release) can punish if startup <= endlag.
 */
function analyzePerfectShieldMatchup(attackerData, defenderData) {
  const defenderPSOOS = getPerfectShieldOOSOptions(defenderData);
  const results = [];

  attackerData.moves.forEach(function(move) {
    if (isExcludedMove(move.move)) return;
    if (isGrabMove(move.move)) return;
    move.hitboxes.forEach(function(h) {
      if (!h.shieldSafety) return;
      if (h.shieldSafety.isStun || h.shieldSafety.isProjectile) return;

      // PS advantage = -(endlag). Use stored endlag if available, else derive from damage.
      let psAdv;
      if (h.endlag != null) {
        psAdv = -h.endlag;
      } else if (h.damage != null) {
        const shieldStun = Math.max(2, Math.floor(h.damage * 0.8 + 1));
        psAdv = h.shieldSafety.max - shieldStun;
      } else {
        return;
      }
      const defenderFrameAdv = -psAdv;

      const punishes = defenderPSOOS.filter(function(opt) {
        return opt.oosStartup <= defenderFrameAdv;
      });
      const isSafe       = punishes.length === 0;
      const isRisky      = punishes.length >= 1 && punishes.length <= 3;
      const isPunishable = punishes.length >= 4;

      results.push({
        move:                    move.move,
        hitbox:                  h.hitbox,
        startup:                 move.startup,
        category:                getCategory(move.move),
        shieldSafety:            { min: psAdv, max: psAdv },
        shieldRaw:               h.shieldRaw,
        isSafe, isRisky, isPunishable,
        punishCount:             punishes.length,
        defenderFrameAdv,
        punishes,
        tumblePercent:           h.tumblePercent             ?? null,
        perCharacterTumble:      h.perCharacterTumble        ?? {},
        perCharacterTumbleAerial: h.perCharacterTumbleAerial ?? {},
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
    shieldRelease: 0,
    safeThreshold: SAFE_THRESHOLD,
    breakdown:     results,
  };
}
