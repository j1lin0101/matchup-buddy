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
 * Powershield mode (analyzeMatchup's shieldReleaseFrames parameter) does NOT
 * change this OOS timing — a character's own OOS options are a fixed
 * property of their moveset, not of whether they're powershielding a
 * specific incoming hit. Instead it adjusts the ATTACKER's on-shield number
 * directly: powershielding removes the defender's 15-frame shield-drop delay
 * and replaces it with 1, so every attacker hitbox's shieldSafety shifts by
 * -(15 - 1) = -14, making moves read as less safe against a powershielding
 * opponent. See analyzeMatchup for the exact mechanics.
 *
 * Categorization uses FightCore's numeric move `type` field (1=Tilts, 2=Jab/Dash
 * Attack/Smash, 3=Aerials, 4=Specials, 5=Dodges, 6=Grab/Throw/Pummel, 7=Getup
 * Attack, 8=Ledge Attack) rather than name matching — reliable across the whole
 * cast, unlike SSBU's naming inconsistencies. Type 5 (dodges) is always excluded;
 * type 6 is excluded except for the two universal OOS options it contains (Grab,
 * Dashgrab) — throws/pummel aren't meaningful here since they only happen after a
 * grab already connected. Types 7/8 (Getup/Ledge Attack) appear in shield-safety
 * and punish-breakdown views (the sheet used to verify the shield formula tracks
 * these too) but are excluded from OOS options specifically — you can't be
 * shielding and also throwing a getup/ledge attack, so isExcludedMove and
 * isExcludedFromOOS diverge here.
 *
 * Projectiles (Fox's Blaster, Samus's Missile, etc. — see the hand-curated
 * PROJECTILE_SPECIALS list in scripts/fetch-melee-data.js) get
 * { isProjectile: true, isStun: true, min, max: shieldstun } instead of a
 * computed shieldSafety, mirroring Rivals' cargo-scrape.js/analysis.js
 * convention exactly. getSafestOptions skips isStun entries (not a meaningful
 * "safe" classification); getAllShieldSafeties and analyzeMatchup do not —
 * they still sort/classify using the raw stun value, same as Rivals — the
 * only display difference is MeleeMatchupView.jsx showing a PROJ badge
 * instead of a computed advantage number. dedupeProjectileValues additionally
 * collapses same-move projectile hitboxes down to one row per distinct stun
 * value (e.g. Link's Bow has several differently-labeled charge levels that
 * happen to stun for the same number of frames) — the internal variant
 * doesn't matter to shield safety if the outcome is identical.
 */

const SHIELD_RELEASE_FRAMES = 15;
// Powershielding a physical hit removes the normal shield-drop delay and
// replaces it with a single frame — see getOOSDelay.
const POWERSHIELD_RELEASE_FRAMES = 1;
const GRAB_OOS_DELAY = 0;
const JUMP_CANCEL_SHARED_FRAME = 1;
const SAFE_THRESHOLD = -3;

// "On hit" (not-shielding) constants — Crouch Cancel and ASDI Down. See the
// getMelee* functions below for how these are used.
const CC_KB_THRESHOLD = 32;        // Crouch Cancel reduces knockback below this; at/above, CC doesn't help
const CC_REDUCTION = 2 / 3;        // multiplier CC applies to knockback when it helps
const ASDI_DOWN_KB_THRESHOLD = 80; // Melee's real tumble/special-fall threshold — ASDI Down can't keep you grounded at/above this
const ON_HIT_HITSTUN_SCALAR = 0.4; // hitstun = floor(finalKB * ON_HIT_HITSTUN_SCALAR)

const CATEGORY_ORDER = ['Normals', 'Smashes', 'Aerials', 'Specials', 'Getup/Ledge'];

// Per-character specials that are jump-cancelable OOS the same way aerials are
// (jumpSquat + startup, not the Up Smash/Up Special "+1" shortcut) — most
// famously Fox/Falco's Shine. Confirmed against outofshield.com's published
// Fox data: Shine OOS = 4 = jumpSquat(3) + startup(1). Mirrors the same
// per-character exception list pattern analysis.js uses for Rivals
// (JUMP_CANCEL_OOS_SPECIALS). "Shine" here matches scripts/fetch-melee-data.js's
// applyFlavorMoveName, which relabels FightCore's generic "Reflector" to
// "Shine" for these two characters only.
const JUMP_CANCEL_SPECIALS = {
  Fox: ['Shine'],
  Falco: ['Shine'],
};

function isGrabMove(moveName) {
  return /^(dash)?grab$/i.test(moveName.trim());
}

function isUpSmash(moveName) {
  return /^up\s*smash/i.test(moveName);
}

function isExcludedMove(move) {
  if (move.type === 5) return true;
  if (move.type === 6) return !isGrabMove(move.move);
  return false;
}

// OOS options can never include a Getup Attack or Ledge Attack (type 7/8) —
// those only happen when getting up from the ground or the ledge, never from
// shield — on top of everything isExcludedMove already excludes.
function isExcludedFromOOS(move) {
  if (move.type === 7 || move.type === 8) return true;
  return isExcludedMove(move);
}

// On-hit (CC/ASDI Down) analysis excludes Grab on top of everything
// isExcludedMove already excludes — a grab connecting produces a grab state,
// not a CC/ASDI-hit state, so it's not a meaningful row in that table.
// Getup/Ledge (type 7/8) stay included here, unlike isExcludedFromOOS.
function isExcludedFromOnHit(move) {
  if (isGrabMove(move.move)) return true;
  return isExcludedMove(move);
}

// FightCore names many hitboxes that are simultaneously active on the same
// swing (e.g. multiple collision volumes covering different parts of a limb)
// "id0"/"id1"/"id2" with no real distinction between them — as opposed to
// genuinely different hits like "clean"/"late" or "sourspot"/"sweetspot",
// where the label itself carries meaning worth keeping separate. FightCore
// also literally names some single-hitbox moves (e.g. Fox's Reflector)
// "unknown" — that's a data gap, not a real label, so it's treated the same
// as the generic "id0" case rather than shown to the user.
function isGenericHitboxName(name) {
  return !name || /^id\d+$/i.test(String(name).trim()) || String(name).trim().toLowerCase() === 'unknown';
}

// Projectile hitboxes are often labeled by internal variant (charge level,
// throw direction, point-blank frame, etc.) rather than by outcome, so it's
// common for two differently-labeled variants of the same move to produce
// the exact same shield stun — e.g. Link's Bow "No Charge" and "Level 1
// Charge" both stun for 4 frames, or his Boomerang's "Pointblank Frame1/2/3"
// all stun for 9. The specific variant doesn't matter if the shield outcome
// is identical, so this collapses same-move projectile hitboxes down to one
// row per distinct stun value, keeping the first-seen label as
// representative. Runs before dedupeAndLabelHitboxes so its label-based
// grouping only has to consider what's left after this collapse.
function dedupeProjectileValues(rows) {
  const seen = new Map();
  const order = [];
  const passthrough = [];
  rows.forEach(function(row) {
    if (!row.shieldSafety || !row.shieldSafety.isProjectile) {
      passthrough.push(row);
      return;
    }
    const key = row.move + '|' + row.shieldSafety.min + '|' + row.shieldSafety.max;
    if (!seen.has(key)) {
      seen.set(key, row);
      order.push(key);
    }
  });
  return passthrough.concat(order.map(function(key) { return seen.get(key); }));
}

// Hitbox labels in FightCore's data are inconsistent in a way that needs two
// passes to clean up:
//   1. Exact duplicates — same move, same label (generic or named), same
//      shield safety — are pure noise (e.g. Fox's Back Air "late" hit has 3
//      identically-valued sub-hitboxes) and collapse to one row.
//   2. Sometimes what's left still has 2+ rows sharing one move+label with
//      DIFFERENT values — either because the label was generic to begin with
//      (Fox's Neutral Air has two hit-windows, both anonymously "id0"-"id2",
//      with different values: -1 vs -2) or because a named hit-window itself
//      contains an unlabeled sub-variant (Fox's Back Air "clean" hit has one
//      sub-hitbox at -3 and another at -5, with no further distinguishing
//      name in the source data). Rather than show two identical-looking rows
//      with no explanation, these get numbered by safety order.
function dedupeAndLabelHitboxes(rows) {
  const exactSeen = new Set();
  const deduped = [];
  rows.forEach(function(row) {
    const label = isGenericHitboxName(row.hitbox) ? null : row.hitbox;
    if (!row.shieldSafety) { deduped.push(Object.assign({}, row, { hitbox: label })); return; }
    const key = row.move + '|' + (label || '') + '|' + row.shieldSafety.min + '|' + row.shieldSafety.max;
    if (exactSeen.has(key)) return;
    exactSeen.add(key);
    deduped.push(Object.assign({}, row, { hitbox: label }));
  });

  const groups = new Map();
  deduped.forEach(function(row) {
    const key = row.move + '|' + (row.hitbox || '');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });

  const results = [];
  groups.forEach(function(group) {
    if (group.length === 1) { results.push(group[0]); return; }
    const sorted = [...group].sort(function(a, b) {
      const av = a.shieldSafety ? a.shieldSafety.max : -Infinity;
      const bv = b.shieldSafety ? b.shieldSafety.max : -Infinity;
      return bv - av;
    });
    sorted.forEach(function(row, i) {
      const label = row.hitbox ? `${row.hitbox} (${i + 1})` : `Hit ${i + 1}`;
      results.push(Object.assign({}, row, { hitbox: label }));
    });
  });
  return results;
}

// Collapses OOS options that are the same special cast from the ground vs.
// in the air (e.g. "Shine" / "Shine (Air)", "Dolphin Slash" / "Dolphin
// Slash (Air)") when they resolve to the same OOS timing — showing both is
// redundant since it's the same punish tool. Kept separate if the ground and
// air versions genuinely differ in OOS speed.
function dedupeGroundAirOOS(options) {
  const groups = new Map();
  options.forEach(function(opt) {
    const base = opt.move.replace(/\s*\(Air\)$/i, '').trim();
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base).push(opt);
  });

  const results = [];
  groups.forEach(function(group, base) {
    if (group.length === 1) {
      results.push(group[0]);
      return;
    }
    const byStartup = new Map();
    group.forEach(function(opt) {
      if (!byStartup.has(opt.oosStartup)) byStartup.set(opt.oosStartup, []);
      byStartup.get(opt.oosStartup).push(opt);
    });
    byStartup.forEach(function(variants) {
      results.push(variants.find(function(v) { return v.move === base; }) || variants[0]);
    });
  });
  return results;
}

// Same idea as dedupeGroundAirOOS, applied to shield-safety/punish-breakdown
// rows instead of OOS options — collapses "Shine" / "Shine (Air)" (same
// hitbox, same shield safety) into one row, since showing both is redundant
// when they're equally safe. Grouped by (base move, hitbox label) so it only
// merges genuinely matching hitboxes; kept separate whenever the ground and
// air versions differ in safety for that hitbox.
function dedupeGroundAirShieldSafety(rows) {
  const groups = new Map();
  rows.forEach(function(row) {
    const base = row.move.replace(/\s*\(Air\)$/i, '').trim();
    const key = base + '|' + (row.hitbox || '');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });

  const results = [];
  groups.forEach(function(group) {
    if (group.length === 1) { results.push(group[0]); return; }
    const base = group[0].move.replace(/\s*\(Air\)$/i, '').trim();
    const bySafety = new Map();
    group.forEach(function(row) {
      const safetyKey = row.shieldSafety ? row.shieldSafety.min + '|' + row.shieldSafety.max : 'null';
      if (!bySafety.has(safetyKey)) bySafety.set(safetyKey, []);
      bySafety.get(safetyKey).push(row);
    });
    bySafety.forEach(function(variants) {
      results.push(variants.find(function(v) { return v.move === base; }) || variants[0]);
    });
  });
  return results;
}

// Same idea as dedupeAndLabelHitboxes, adapted for on-hit rows (which carry
// `advantage`/`beatsCC`/`isKnockdown` instead of `shieldSafety`). `beatsCC`/
// `isKnockdown` are folded into the exact-duplicate key so a knockdown
// variant of a hitbox is never silently collapsed with a non-knockdown one
// that happens to share the same advantage number.
function dedupeAndLabelOnHitHitboxes(rows) {
  const exactSeen = new Set();
  const deduped = [];
  rows.forEach(function(row) {
    const label = isGenericHitboxName(row.hitbox) ? null : row.hitbox;
    const key = row.move + '|' + (label || '') + '|' + row.advantage + '|' + row.beatsCC + '|' + row.isKnockdown;
    if (exactSeen.has(key)) return;
    exactSeen.add(key);
    deduped.push(Object.assign({}, row, { hitbox: label }));
  });

  const groups = new Map();
  deduped.forEach(function(row) {
    const key = row.move + '|' + (row.hitbox || '');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });

  const results = [];
  groups.forEach(function(group) {
    if (group.length === 1) { results.push(group[0]); return; }
    const sorted = [...group].sort(function(a, b) { return b.advantage - a.advantage; });
    sorted.forEach(function(row, i) {
      const label = row.hitbox ? `${row.hitbox} (${i + 1})` : `Hit ${i + 1}`;
      results.push(Object.assign({}, row, { hitbox: label }));
    });
  });
  return results;
}

// Same idea as dedupeGroundAirShieldSafety, adapted for on-hit rows —
// collapses "Move" / "Move (Air)" into one row when a hitbox has identical
// advantage and beatsCC/isKnockdown status on both sides.
function dedupeGroundAirOnHit(rows) {
  const groups = new Map();
  rows.forEach(function(row) {
    const base = row.move.replace(/\s*\(Air\)$/i, '').trim();
    const key = base + '|' + (row.hitbox || '');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });

  const results = [];
  groups.forEach(function(group) {
    if (group.length === 1) { results.push(group[0]); return; }
    const base = group[0].move.replace(/\s*\(Air\)$/i, '').trim();
    const byOutcome = new Map();
    group.forEach(function(row) {
      const outcomeKey = row.advantage + '|' + row.beatsCC + '|' + row.isKnockdown;
      if (!byOutcome.has(outcomeKey)) byOutcome.set(outcomeKey, []);
      byOutcome.get(outcomeKey).push(row);
    });
    byOutcome.forEach(function(variants) {
      results.push(variants.find(function(v) { return v.move === base; }) || variants[0]);
    });
  });
  return results;
}

/**
 * Categorizes a move into one of: Normals, Smashes, Aerials, Specials, based on
 * FightCore's numeric type field (type 2 bundles Jab/Dash Attack in with Smashes,
 * split out here by checking for "Smash" in the name).
 */
function getCategory(move) {
  if (move.type === 3) return 'Aerials';
  if (move.type === 4) return 'Specials';
  if (move.type === 7 || move.type === 8) return 'Getup/Ledge';
  if (move.type === 2 && /smash/i.test(move.move)) return 'Smashes';
  return 'Normals'; // type 1 (tilts) and type 2 non-smashes (jab, dash attack)
}

/**
 * Returns the OOS delay in frames for a given move.
 *   Grab                          → 0 (shield-native, raw startup)
 *   Up Smash, Up Special          → 1 (jump-cancelled: skips jumpsquat in Melee)
 *   Aerials, JUMP_CANCEL_SPECIALS → characterData.jumpSquat
 *   Everything else               → SHIELD_RELEASE_FRAMES (15)
 *
 * This is always the normal-shield value — a character's own OOS option
 * timing (used for the "Fastest OOS Options" panel and the punish-options
 * filter) doesn't depend on whether THEY are powershielding something; it's
 * the attacker's on-shield number that changes when the defender
 * powershields (see analyzeMatchup's shieldReleaseFrames parameter).
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

// True for any OOS option that requires jump-cancelling — aerials (must fully
// leave the ground), Up Smash/Up Special (skip jumpsquat via JC), and per-
// character JUMP_CANCEL_SPECIALS (e.g. Shine). Mirrors analysis.js's own
// jump-cancel detection for Rivals (same underlying Melee-derived mechanic).
function isJumpCancelOOS(move, characterData) {
  if (isGrabMove(move.move)) return false;
  if (isUpSmash(move.move) || move.isUpSpecial) return true;
  const jumpCancelSpecials = JUMP_CANCEL_SPECIALS[characterData.character] || [];
  return move.type === 3 || jumpCancelSpecials.some(s => move.move.startsWith(s));
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
  const deduped = dedupeGroundAirShieldSafety(dedupeAndLabelHitboxes(dedupeProjectileValues(results)));
  deduped.sort(function(a, b) { return b.shieldSafety.max - a.shieldSafety.max; });
  return deduped;
}

/**
 * Returns the character's safest moves on shield.
 *
 * When defenderOOSOptions is provided (matchup context), "safest" means fewest
 * punish options available — moves with 0–3 punishes, sorted by punish count then
 * by best shield safety. Without defender context, falls back to a frame threshold.
 *
 * Projectiles are excluded here (mirrors analysis.js's Rivals equivalent) —
 * "safe" isn't a meaningful classification for a hitbox with no real on-shield
 * frame advantage; they still appear in getAllShieldSafeties/analyzeMatchup
 * with a PROJ badge instead of a computed number.
 */
function getSafestOptions(characterData, defenderOOSOptions) {
  const entries = getAllShieldSafeties(characterData);

  if (defenderOOSOptions) {
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
 * Returns the character's OOS (out of shield) options, sorted by effective OOS
 * startup (delay + move startup). Grab and Wavedash are added if not already
 * present in the move data.
 */
function getOOSOptions(characterData) {
  const moveOptions = [];

  characterData.moves.forEach(function(move) {
    if (isExcludedFromOOS(move)) return;
    if (move.startup === null || move.startup === undefined) return;

    const oosDelay   = getOOSDelay(move, characterData);
    const oosStartup = move.startup + oosDelay;
    const isAerial   = move.type === 3;
    const jc         = isJumpCancelOOS(move, characterData);
    // Aerials always require jumping first, so a "JC" prefix on the label is
    // redundant there — reserved for grounded options genuinely being
    // jump-cancelled (Up Smash, Up Special, Shine-style specials).
    const label      = (jc && !isAerial) ? 'JC ' + move.move : move.move;

    let bestShieldSafety = null;
    move.hitboxes.forEach(function(h) {
      if (!h.shieldSafety) return;
      if (!bestShieldSafety || h.shieldSafety.max > bestShieldSafety.max) {
        bestShieldSafety = h.shieldSafety;
      }
    });

    moveOptions.push({
      move:         move.move,
      label,
      startup:      move.startup,
      oosDelay,
      oosStartup,
      jumpCancel:   jc,
      shieldSafety: bestShieldSafety,
      category:     getCategory(move),
    });
  });

  const options = dedupeGroundAirOOS(moveOptions);

  // Grab and Wavedash are universal OOS options not tied to any one move
  // category — grouped under "Misc" for the punish-options filter (mirrors
  // Rivals' OOS_FILTER_GROUPS convention in MatchupView.jsx).
  if (!options.some(function(o) { return isGrabMove(o.move); })) {
    options.push({
      move:         'Grab',
      label:        'Grab',
      startup:      7,
      oosDelay:     GRAB_OOS_DELAY,
      oosStartup:   7,
      jumpCancel:   false,
      shieldSafety: null,
      category:     'Misc',
    });
  }

  if (characterData.wavedashOOSFrames != null) {
    options.push({
      move:         'Wavedash',
      label:        'Wavedash',
      startup:      characterData.wavedashOOSFrames,
      oosDelay:     0,
      oosStartup:   characterData.wavedashOOSFrames,
      jumpCancel:   false,
      shieldSafety: null,
      category:     'Misc',
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
 *
 * shieldReleaseFrames defaults to normal shield; pass
 * POWERSHIELD_RELEASE_FRAMES to analyze the matchup assuming the defender
 * powershields. Powershielding removes the defender's normal 15-frame
 * shield-drop delay and replaces it with 1 — modeled here as a flat
 * (SHIELD_RELEASE_FRAMES - shieldReleaseFrames) subtraction applied directly
 * to the attacker's on-shield number, so a move visibly reads as less safe
 * against a powershielding opponent rather than leaving the number
 * unchanged and only expanding the punish list. The defender's own OOS
 * option timing (getOOSOptions) is unaffected either way — it's a property
 * of their own moves, not of this specific interaction.
 */
function analyzeMatchup(attackerData, defenderData, shieldReleaseFrames = SHIELD_RELEASE_FRAMES) {
  const defenderOOSOptions = getOOSOptions(defenderData);
  // How many fewer frames the defender needs before they're free to act —
  // 0 in normal shield, 14 (15 - 1) in powershield. Applied directly to the
  // attacker's on-shield number (not the defender's OOS timing) so a move
  // visibly reads as less safe when the opponent powershields, rather than
  // leaving the number unchanged and only expanding the punish list.
  const releaseDelta = SHIELD_RELEASE_FRAMES - shieldReleaseFrames;
  const results = [];

  attackerData.moves.forEach(function(move) {
    if (isExcludedMove(move)) return;
    move.hitboxes.forEach(function(h) {
      if (!h.shieldSafety) return;

      // Projectiles already show raw shield stun instead of a computed
      // advantage (see the isProjectile handling elsewhere) — powershield
      // doesn't change that presentation, so leave those untouched.
      const shieldAdv = (releaseDelta !== 0 && !h.shieldSafety.isStun)
        ? { ...h.shieldSafety, min: h.shieldSafety.min - releaseDelta, max: h.shieldSafety.max - releaseDelta }
        : h.shieldSafety;
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

  const deduped = dedupeGroundAirShieldSafety(dedupeAndLabelHitboxes(dedupeProjectileValues(results)));
  deduped.sort(function(a, b) {
    if (a.punishCount !== b.punishCount) return a.punishCount - b.punishCount;
    return b.shieldSafety.max - a.shieldSafety.max;
  });

  return {
    attacker:      attackerData.character,
    defender:      defenderData.character,
    shieldRelease: shieldReleaseFrames,
    safeThreshold: SAFE_THRESHOLD,
    breakdown:     deduped,
  };
}

/* ── On Hit (Crouch Cancel / ASDI Down) analysis ──
 *
 * Everything below models the OTHER defensive option — getting hit while
 * NOT shielding — mirroring Rivals' analysis.js Floorhug/CC system, but for
 * Melee's real Crouch Cancel and ASDI Down mechanics.
 *
 * Crouch Cancel: standard Melee knockback formula; if the result is under
 * CC_KB_THRESHOLD (32), CC reduces it by CC_REDUCTION (2/3) and the
 * character survives with reduced hitstun. At/above the threshold, CC
 * doesn't help at all — full knockback applies.
 *
 * ASDI Down: NOT a knockback-reduction mechanic (unlike CC) — it's purely
 * positional (stays grounded vs. gets launched). Modeled via Melee's real
 * tumble/special-fall threshold: at/above ASDI_DOWN_KB_THRESHOLD (80) the
 * defender is launched airborne regardless of ASDI input ("breaks", shown
 * as a Knockdown badge with no punish list — mirrors Rivals' exact
 * treatment of a broken floorhug). Below that, ASDI Down keeps them
 * grounded with the same hitstun as if nothing special happened.
 */

/**
 * Standard Melee total-knockback formula. `setKnockback` (when nonzero)
 * bypasses the %-scaling formula entirely — it's a fixed value regardless of
 * the defender's damage. Monotonically increasing in `pct` otherwise, so
 * `pct=0` always gives the global-minimum knockback for a hitbox/defender
 * pair — this is what lets getMeleeBreakers check "always breaks" with a
 * single call instead of a per-character baked table.
 */
function calcMeleeKnockback(hitbox, defenderWeight, pct) {
  if (hitbox.setKnockback) return hitbox.setKnockback;
  if (hitbox.damage == null || hitbox.knockbackGrowth == null ||
      hitbox.baseKnockback == null || defenderWeight == null) return null;
  const p = Math.max(0, pct);
  const scaled = ((p / 10 + p * hitbox.damage / 20) * (200 / (defenderWeight + 100)) * 1.4) + 18;
  return (scaled * hitbox.knockbackGrowth / 100) + hitbox.baseKnockback;
}

// Computes a hitbox's on-hit outcome assuming the defender always takes
// Crouch Cancel's knockback reduction when it's available (CC never hurts,
// so a defender minimizing hitstun never has a reason to skip it). Tumble
// (knockdown) is checked against raw, unreduced knockback — ASDI Down never
// reduces knockback, it only matters for whether tumble is forced at all,
// so "does this beat ASDI Down" is exactly the tumble check, independent of
// whether CC is also being used. See the module doc above for the mechanics.
function calcMeleeOnHitOutcome(hitbox, defenderWeight, pct) {
  const rawKB = calcMeleeKnockback(hitbox, defenderWeight, pct);
  if (rawKB == null) return null;
  const isKnockdown = rawKB >= ASDI_DOWN_KB_THRESHOLD;
  const beatsCC = rawKB >= CC_KB_THRESHOLD;
  const finalKB = beatsCC ? rawKB : rawKB * CC_REDUCTION;
  return { rawKB, finalKB, isKnockdown, beatsCC, hitstun: Math.floor(finalKB * ON_HIT_HITSTUN_SCALAR) };
}

// The defender % at which this hitbox's raw knockback first reaches the
// tumble threshold (independent of CC/ASDI — tumble is a raw-knockback
// state, not affected by DI input). calcMeleeKnockback is linear in pct
// (KB = pct*slope + intercept), so this is solved directly rather than
// searched. Returns 0 if the hit always tumbles (even at 0%), null if it
// never does (fixed/scaling knockback that can't reach 80).
function calcMeleeTumblePercent(hitbox, defenderWeight) {
  if (hitbox.setKnockback) {
    return hitbox.setKnockback >= ASDI_DOWN_KB_THRESHOLD ? 0 : null;
  }
  if (hitbox.damage == null || hitbox.knockbackGrowth == null ||
      hitbox.baseKnockback == null || defenderWeight == null) return null;
  const growthFactor = (1 / 10 + hitbox.damage / 20) * (200 / (defenderWeight + 100)) * 1.4;
  const slope = growthFactor * hitbox.knockbackGrowth / 100;
  const intercept = (18 * hitbox.knockbackGrowth / 100) + hitbox.baseKnockback;
  if (intercept >= ASDI_DOWN_KB_THRESHOLD) return 0;
  if (slope <= 0) return null;
  return Math.ceil((ASDI_DOWN_KB_THRESHOLD - intercept) / slope);
}

/**
 * Overview-panel data source: moves that always beat CC/ASDI Down against a
 * specific opponent's weight, regardless of the defender's damage % (checked
 * at pct=0, the global minimum). Matchup-specific by design — since both
 * characters are always loaded together in this app, this uses the actual
 * opponent's real weight rather than a neutral baseline like Rivals'
 * matchup-agnostic Floorhug panel.
 */
function getMeleeBreakers(attackerData, defenderWeight) {
  const seen = new Set();
  const results = [];
  attackerData.moves.forEach(function(move) {
    if (isExcludedFromOnHit(move)) return;
    move.hitboxes.forEach(function(h) {
      const minKB = calcMeleeKnockback(h, defenderWeight, 0);
      if (minKB == null) return;
      const breaksCC = minKB >= CC_KB_THRESHOLD;
      const breaksASDI = minKB >= ASDI_DOWN_KB_THRESHOLD;
      if (!breaksCC && !breaksASDI) return;
      const hitbox = isGenericHitboxName(h.hitbox) ? null : h.hitbox;
      const key = move.move + '|' + (hitbox || '') + '|' + breaksCC + '|' + breaksASDI;
      if (seen.has(key)) return;
      seen.add(key);
      results.push({
        move:     move.move,
        hitbox,
        category: getCategory(move),
        startup:  move.startup,
        breaksCC,
        breaksASDI,
      });
    });
  });
  return results;
}

/**
 * Defender's punish-option list when NOT in shield — no shield-release delay
 * at all since the defender isn't shielding. Aerials still need jumpsquat
 * (must leave the ground); everything else is raw startup. Grab and Shield
 * itself are added as universal options (mirrors Rivals' getOnHitOptions,
 * which also treats Shield as a frame-1 option).
 */
function getMeleeOnHitOptions(characterData) {
  const moveOptions = [];
  characterData.moves.forEach(function(move) {
    if (isExcludedFromOOS(move)) return; // same exclusion set applies (no dodges, no throws/pummel except grab, no getup/ledge)
    if (move.startup == null) return;
    const isAerial = move.type === 3;
    if (isAerial && characterData.jumpSquat == null) return;
    const delay = isAerial ? characterData.jumpSquat : 0;
    const onHitStartup = move.startup + delay;
    moveOptions.push({
      move:         move.move,
      label:        move.move,
      startup:      move.startup,
      onHitStartup,
      oosStartup:   onHitStartup, // alias so the shared FilterModal (reads opt.oosStartup) works unmodified
      jumpCancel:   isAerial,
      category:     getCategory(move),
    });
  });
  // Collapses "Move" / "Move (Air)" pairs with identical timing (e.g. Fox's
  // Shine — grounded startup alone, no jumpsquat needed either way, so the
  // air-cast variant is a redundant duplicate here) — same helper the
  // on-shield OOS list already uses for this.
  const options = dedupeGroundAirOOS(moveOptions);
  if (!options.some(function(o) { return isGrabMove(o.move); })) {
    options.push({ move: 'Grab', label: 'Grab', startup: 7, onHitStartup: 7, oosStartup: 7, jumpCancel: false, category: 'Misc' });
  }
  options.push({ move: 'Shield', label: 'Shield', startup: 1, onHitStartup: 1, oosStartup: 1, jumpCancel: false, category: 'Misc' });
  options.sort(function(a, b) { return a.onHitStartup - b.onHitStartup; });
  return options;
}

/**
 * On Hit breakdown: given attacker/defender character data and the
 * defender's current damage % (pct), returns a breakdown of each attacker
 * move+hitbox with the resulting advantage and which defender moves can
 * punish it. No defensive-tech toggle — the defender is assumed to always
 * take Crouch Cancel's knockback reduction when it helps (see
 * calcMeleeOnHitOutcome), and tumble/knockdown is checked against raw
 * knockback (ASDI Down never reduces knockback, so "beats ASDI Down" and
 * "causes tumble" are the same check — already surfaced via isKnockdown and
 * tumblePercent below).
 *
 * Projectile hitboxes are excluded entirely (not badged, unlike the
 * shield-safety table's PROJ treatment) — the attacker isn't physically
 * present at the point of impact for a projectile, so "attacker's own
 * recovery vs. defender's hitstun" isn't a meaningful comparison. They're
 * still included in getMeleeBreakers, since "does this always break
 * CC/ASDI" only depends on the hit's own knockback numbers.
 */
function getMeleeOnHitBreakdown(attackerData, defenderData, pct) {
  const defenderWeight = defenderData.weight;
  const defenderOptions = getMeleeOnHitOptions(defenderData);
  const results = [];

  attackerData.moves.forEach(function(move) {
    if (isExcludedFromOnHit(move)) return;
    move.hitboxes.forEach(function(h) {
      if (h.shieldSafety && h.shieldSafety.isProjectile) return;

      const outcome = calcMeleeOnHitOutcome(h, defenderWeight, pct);
      if (!outcome || h.endlag == null) return;
      const advantage = outcome.hitstun - h.endlag;

      const isKnockdown = outcome.isKnockdown;
      const punishes = (!isKnockdown && advantage <= 0)
        ? defenderOptions.filter(function(o) { return o.onHitStartup <= -advantage; })
        : [];

      results.push({
        move:       move.move,
        hitbox:     h.hitbox || null,
        category:   getCategory(move),
        startup:    move.startup,
        beatsCC:    outcome.beatsCC,
        isKnockdown,
        advantage,
        punishes,
        tumblePercent: calcMeleeTumblePercent(h, defenderWeight),
      });
    });
  });

  return dedupeGroundAirOnHit(dedupeAndLabelOnHitHitboxes(results));
}

export {
  CATEGORY_ORDER,
  SHIELD_RELEASE_FRAMES,
  POWERSHIELD_RELEASE_FRAMES,
  GRAB_OOS_DELAY,
  SAFE_THRESHOLD,
  getCategory,
  isGrabMove,
  isExcludedMove,
  isExcludedFromOOS,
  getOOSDelay,
  isJumpCancelOOS,
  getAllShieldSafeties,
  getSafestOptions,
  getOOSOptions,
  getDisplayOOSOptions,
  analyzeMatchup,
  CC_KB_THRESHOLD,
  ASDI_DOWN_KB_THRESHOLD,
  getMeleeBreakers,
  getMeleeOnHitOptions,
  getMeleeOnHitBreakdown,
};
