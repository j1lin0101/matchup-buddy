'use strict';
/**
 * cargo-scrape.js
 * Builds data/characters/*.json using the dragdown.wiki Cargo API (Special:CargoExport).
 *
 * Tables used:
 *   ROA2_MoveMode   – frame data, active windows, per-hitbox custom SS overrides
 *   ROA2_HitData    – damage, knockback, stun multipliers
 *   ROA2_Articles   – projectile / article flags
 *   ROA2_CharacterData – weights (for tumble % calculation)
 *
 * Shield safety formula (from Module:RoA2_Move_Card):
 *   ShieldStun  = max(2, floor(Damage × 0.8 + 1) + ExtraShieldStun)
 *   SharedFrame = 1  (always; hitlag is nil in Cargo context → not 0 in Lua)
 *   Aerial  SS  = ShieldStun − 1 − landingLag
 *   Grounded SS = ShieldStun − 1 − (IASA − lastActiveFrame − 1)
 *   Projectile  = "Stun: (ShieldStun − 1)"  [hitActive contains '+']
 *
 * Tumble % formula (from Module:RoA2_Move_Card / calcTumblePercent):
 *   percent = ceil(max(0, (26/3 − BKB) × (weight+100) / (200 × 0.12 × KBS × gSpike) − Damage))
 *   Spike angle adjustments applied when KnockbackAngle ∈ (180,360).
 */

const fetch  = require('node-fetch');
const fs     = require('fs');
const path   = require('path');

const BASE     = 'https://dragdown.wiki/wiki/Special:CargoExport';
const DATA_DIR     = path.join(__dirname, '../data/characters');
const PUBLIC_DIR   = path.join(__dirname, '../app/public/data');

const { characters } = require('../characters.json');

// ─── Display name mapping ─────────────────────────────────────────────────────

const MOVE_DISPLAY = {
  Jab:            'Jab',
  Ftilt:          'Forward Tilt',
  Utilt:          'Up Tilt',
  Dtilt:          'Down Tilt',
  Dattack:        'Dash Attack',
  Fstrong:        'Forward Strong',
  Ustrong:        'Up Strong',
  Dstrong:        'Down Strong',
  Nair:           'Neutral Air',
  Fair:           'Forward Air',
  Bair:           'Back Air',
  Uair:           'Up Air',
  Dair:           'Down Air',
  Zair:           'Z-Air',
  Nspecial:       'Neutral Special',
  Fspecial:       'Forward Special',
  Uspecial:       'Up Special',
  Dspecial:       'Down Special',
  NspecialAir:    'Neutral Special (Air)',
  FspecialAir:    'Forward Special (Air)',
  UspecialAir:    'Up Special (Air)',
  DspecialAir:    'Down Special (Air)',
  Grab:           'Grab',
  DashGrab:       'Dash Grab',
  PivotGrab:      'Pivot Grab',
  Pummel:         'Pummel',
  PummelSpecial:  'Pummel (Special)',
  Fthrow:         'Forward Throw',
  Bthrow:         'Back Throw',
  Uthrow:         'Up Throw',
  Dthrow:         'Down Throw',
  GetupAttack:    'Getup Attack',
  GetupSpecial:   'Getup Special',
  LedgeAttack:    'Ledge Attack',
  LedgeSpecial:   'Ledge Special',
  WalljumpSpecial:'Walljump Special',
};

// Canonical display order for moves output
const MOVE_ORDER = [
  'Jab','Ftilt','Utilt','Dtilt','Dattack',
  'Fstrong','Ustrong','Dstrong',
  'Nair','Fair','Bair','Uair','Dair','Zair',
  'Nspecial','Fspecial','Uspecial','Dspecial',
  'NspecialAir','FspecialAir','UspecialAir','DspecialAir',
  'Grab','DashGrab','PivotGrab',
  'Pummel','PummelSpecial',
  'Fthrow','Bthrow','Uthrow','Dthrow',
  'GetupAttack','GetupSpecial','LedgeAttack','LedgeSpecial','WalljumpSpecial',
];

// These moves have no meaningful shield safety
const NO_SHIELD = new Set([
  'Bthrow','Uthrow','Dthrow','Fthrow',
  'Grab','PivotGrab','DashGrab',
  'Pummel','PummelSpecial',
]);

// ─── Constants (from Module:RoA2_Move_Card) ───────────────────────────────────

const TUMBLE_THRESHOLD  = 26;
const WRASTOR_WEIGHT    = 71;
const LOX_WEIGHT        = 110;

// ─── Cargo API ────────────────────────────────────────────────────────────────

async function cargo(table, fields, where) {
  const p = new URLSearchParams({ tables: table, fields, where, format: 'json', limit: '1000' });
  const res = await fetch(`${BASE}?${p}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${table} (${where})`);
  return res.json();
}

// ─── Shield safety helpers ────────────────────────────────────────────────────

function calcShieldStun(damage, extraShieldStun) {
  return Math.max(2, Math.floor(Number(damage) * 0.8 + 1) + (Number(extraShieldStun) || 0));
}

/**
 * Returns a shieldSafety object or null.
 * Notes on shared_frame: in the wiki Lua module, `hitlag` is nil (undefined global),
 * so `hitlag == 0` is false → shared_frame = 1 always when firstFrameOfStun = true.
 * Shield hitpause for Cargo-sourced data is always 0 because `not article.bIsAttachedToOwner`
 * evaluates to `not "false"` = false in Lua (strings are truthy). So:
 *   SS = ShieldStun − 1 − endlagFrames
 */
function calcShieldSafety(attack, hitActive, iasa, landingLag, customSS, isProjectileHitbox, shieldStun) {
  if (NO_SHIELD.has(attack)) return null;

  const SHARED = 1;

  if (customSS === 'N/A') {
    // No computable SS — show raw stun value as badge
    const stunVal = shieldStun - SHARED;
    if (isProjectileHitbox) {
      return { isProjectile: true, isStun: true, min: stunVal, max: stunVal };
    }
    // Non-projectile N/A (e.g. Zetterburn Shine, Clairen Fspecial sour) —
    // show STUN badge so the move still appears in the table
    return { isStun: true, min: stunVal, max: stunVal };
  }

  // Explicit override (not a formula placeholder)
  if (customSS && customSS !== '-' && customSS !== 'JAB' && customSS !== 'GALVAN') {
    // "E{n}" → single endlag override → SS = ShieldStun − 1 − n
    const singleE = customSS.match(/^E(\d+)$/i);
    if (singleE) {
      const ss = shieldStun - SHARED - parseInt(singleE[1], 10);
      return { min: ss, max: ss };
    }

    // "E{n} to E{m}" or "E{n}-E{m}" → endlag range
    const rangeE = customSS.match(/E(\d+)\s*(?:to|-)\s*E(\d+)/i);
    if (rangeE) {
      const e1 = parseInt(rangeE[1], 10);
      const e2 = parseInt(rangeE[2], 10);
      return { min: shieldStun - SHARED - Math.max(e1, e2), max: shieldStun - SHARED - Math.min(e1, e2) };
    }

    // "E{n} at best" → best-case endlag only (ongoing hitbox with a single best exit point)
    const atBest = customSS.match(/E(\d+)\s+at\s+best/i);
    if (atBest) {
      const ss = shieldStun - SHARED - parseInt(atBest[1], 10);
      return { min: ss, max: ss };
    }

    // Direct SS range: "{n} to {m}"
    const directRange = customSS.match(/^(-?\d+)\s+to\s+(-?\d+)$/i);
    if (directRange) {
      return { min: parseInt(directRange[1], 10), max: parseInt(directRange[2], 10) };
    }

    // Direct SS single value: "{n}"
    const v = parseInt(customSS, 10);
    if (!isNaN(v)) return { min: v, max: v };
  }

  const activeStr = String(hitActive);

  // Projectile / ongoing hitbox → show stun value instead of ±frame advantage
  if (activeStr.includes('+') || activeStr.includes('...')) {
    const stunVal = shieldStun - SHARED;
    return { min: stunVal, max: stunVal, isStun: true, isProjectile: isProjectileHitbox };
  }

  // Aerial: SS = ShieldStun − 1 − landingLag (does not require iasa)
  if (landingLag != null) {
    const ss = shieldStun - SHARED - landingLag;
    return { min: ss, max: ss };
  }

  // Grounded: requires iasa — if missing, fall back to raw stun badge
  if (iasa == null) {
    const stunVal = shieldStun - SHARED;
    return { isStun: true, min: stunVal, max: stunVal };
  }

  // SS range based on first/last active frame of the LAST active window
  // (matches the Lua rpartition(hitActive, ", ") logic)
  const lastRange = activeStr.split(', ').pop().trim();
  const parts     = lastRange.split('-').map(s => parseInt(s.trim(), 10));
  const firstF    = parts[0];
  const lastF     = parts.length > 1 ? parts[1] : firstF;
  if (isNaN(firstF)) return null;

  const ssMin = shieldStun - SHARED - (iasa - firstF - 1);
  const ssMax = shieldStun - SHARED - (iasa - lastF  - 1);
  return { min: ssMin, max: ssMax };
}

// ─── Tumble helpers ───────────────────────────────────────────────────────────

/**
 * Derived from Module:RoA2_Move_Card calcTumblePercent:
 *   ceil(max(0, (threshold/3 − BKB) × (weight+100) / (200 × 0.12 × KBS × gSpike) − Damage))
 */
function calcTumblePercent(hit, weight, grounded, threshold, checkSpike) {
  const angle  = Number(hit.KnockbackAngle);
  const kbs    = Number(hit.KnockbackScaling);
  const bkb    = Number(hit.BaseKnockback);
  const damage = Number(hit.Damage);

  let gSpike      = 1;
  let adjThreshold = threshold;

  if (checkSpike && hit.KnockbackAngleMode === 'SpecifiedAngle' && angle > 180 && angle < 360) {
    const diff = Math.abs(angle - 270);
    if (grounded) {
      if (diff <= 30)      gSpike = 1.25;
      else if (diff < 70)  gSpike = 1 + 0.25 * Math.pow(1 - (diff - 30) / 40, 2);
      adjThreshold = threshold * (1 - (90 - diff) / 90 * 0.125);
    } else {
      adjThreshold = threshold * (1 - (90 - diff) / 90 * 0.25);
    }
  }

  if (kbs === 0) {
    return adjThreshold > bkb * 3 ? null : 0;
  }

  const val = (adjThreshold / 3 - bkb) * (weight + 100) / (200 * 0.12 * kbs * gSpike) - damage;
  return Math.ceil(Math.max(0, val));
}

function buildTumbleData(hit, characterWeights) {
  // Always tumbles
  if (hit.ForceTumble === 'True') {
    return {
      tumblePercent: null,
      tumbleRaw: '☑️',
      perCharacterTumble: {},
      perCharacterTumbleAerial: {},
    };
  }

  const kbs          = Number(hit.KnockbackScaling);
  const bIgnoresWeight = hit.bIgnoresWeight === 'True';

  // Weight-independent (set KB or ignores weight)
  if (bIgnoresWeight || kbs === 0) {
    const t = calcTumblePercent(hit, 100, true, TUMBLE_THRESHOLD, true);
    if (t === null) {
      return { tumblePercent: null, tumbleRaw: 'Never', perCharacterTumble: {}, perCharacterTumbleAerial: {} };
    }
    return {
      tumblePercent: { min: t, max: t },
      tumbleRaw: `${t}%`,
      perCharacterTumble: {},
      perCharacterTumbleAerial: {},
    };
  }

  // Per-character calculation
  const perGrounded = {};
  const perAerial   = {};
  let aerialDiffers = false;

  for (const { chara, Weight } of characterWeights) {
    const key = chara.toUpperCase();
    const tG  = calcTumblePercent(hit, Weight, true,  TUMBLE_THRESHOLD, true);
    const tA  = calcTumblePercent(hit, Weight, false, TUMBLE_THRESHOLD, true);
    if (tG != null) perGrounded[key] = tG;
    if (tA != null && tA !== tG) { perAerial[key] = tA; aerialDiffers = true; }
  }

  const vals = Object.values(perGrounded);
  if (vals.length === 0) {
    return { tumblePercent: null, tumbleRaw: 'Never', perCharacterTumble: {}, perCharacterTumbleAerial: {} };
  }

  const minT = Math.min(...vals);
  const maxT = Math.max(...vals);
  return {
    tumblePercent: { min: minT, max: maxT },
    tumbleRaw: minT === maxT ? `${minT}%` : `${minT} - ${maxT}%`,
    perCharacterTumble: perGrounded,
    perCharacterTumbleAerial: aerialDiffers ? perAerial : {},
  };
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function fmtShieldRaw(ss) {
  if (!ss) return null;
  if (ss.isStun) return `Stun: ${ss.min}`;
  if (ss.min === ss.max) return ss.min >= 0 ? `+${ss.min}` : `${ss.min}`;
  const fmtN = n => n >= 0 ? `+${n}` : `${n}`;
  return `${fmtN(ss.min)} to ${fmtN(ss.max)}`;
}

function parseStartup(raw) {
  if (raw == null) return null;
  const str = String(raw);
  // "X+Y" or "X+Y+Z" charged move: first active frame = sum of all parts + 1
  // (e.g. "6+3" → 10; "1+35" → 37; "6+33+4" → 44)
  if (/^\d+(\+\d+)+$/.test(str)) {
    const sum = str.split('+').reduce((a, n) => a + parseInt(n, 10), 0);
    return sum + 1;
  }
  const m = str.match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

// ─── Per-character scrape ─────────────────────────────────────────────────────

async function scrapeCharacter(charName, charSlug, characterWeights) {
  process.stdout.write(`  ${charName}... `);

  const [modes, hitDataArr, articlesArr] = await Promise.all([
    cargo('ROA2_MoveMode',
      'chara,attack,mode,startup,landingLag,iasa,hitID,hitName,hitActive,hitMoveID,customShieldSafety',
      `chara="${charName}"`),
    cargo('ROA2_HitData',
      'chara,moveID,nameID,Damage,BaseKnockback,KnockbackScaling,ExtraShieldStun,' +
      'HitpauseMultiplier,ShieldHitpauseMultiplier,HitstunMultiplier,ForceTumble,' +
      'KnockbackAngle,KnockbackAngleMode,bIgnoresWeight',
      `chara="${charName}"`),
    cargo('ROA2_Articles',
      'chara,moveID,ArticleName,bIsProjectile,bIsAttachedToOwner',
      `chara="${charName}"`),
  ]);

  // ── Build lookup maps ──
  const hitMap = {};   // moveID → nameID → hit row
  for (const h of hitDataArr) {
    if (!hitMap[h.moveID]) hitMap[h.moveID] = {};
    hitMap[h.moveID][h.nameID] = h;
  }

  const articleMap = {};  // moveID → article row
  for (const a of articlesArr) articleMap[a.moveID] = a;

  // ── Group modes by attack ──
  const attackModes = new Map();
  for (const mode of modes) {
    if (!attackModes.has(mode.attack)) attackModes.set(mode.attack, []);
    attackModes.get(mode.attack).push(mode);
  }

  // ── Build output moves in canonical order ──
  const movesOutput = [];
  const unknownAttacks = [];

  const orderedAttacks = [
    ...MOVE_ORDER.filter(a => attackModes.has(a)),
    ...Array.from(attackModes.keys()).filter(a => !MOVE_ORDER.includes(a)),
  ];

  for (const attack of orderedAttacks) {
    const modelist    = attackModes.get(attack);
    const displayName = MOVE_DISPLAY[attack] || attack;

    // Startup: smallest non-null value across modes
    let startup = null;
    for (const m of modelist) {
      const s = parseStartup(m.startup);
      if (s != null && (startup == null || s < startup)) startup = s;
    }

    const hitboxes = [];

    for (const mode of modelist) {
      const hitIDs      = Array.isArray(mode.hitID)              ? mode.hitID              : [];
      const hitNames    = Array.isArray(mode.hitName)            ? mode.hitName            : [];
      const hitActives  = Array.isArray(mode.hitActive)          ? mode.hitActive          : [];
      const hitMoveIDs  = Array.isArray(mode.hitMoveID)          ? mode.hitMoveID          : [];
      const customSSArr = Array.isArray(mode.customShieldSafety) ? mode.customShieldSafety : [];

      // iasa may be "N/A" or "X / Y" (mode-split) — treat N/A as null, take min of a range
      const iasaStr  = mode.iasa != null && mode.iasa !== 'N/A' ? String(mode.iasa) : null;
      const iasa     = iasaStr != null
        ? (Math.min(...iasaStr.split('/').map(s => Number(s.trim())).filter(n => !isNaN(n))) || null)
        : null;
      // landingLag may be "X / Y" (grounded/aerial split) — take the smaller (best case)
      const lagRaw   = mode.landingLag != null ? String(mode.landingLag) : null;
      const landingLag = lagRaw != null
        ? Math.min(...lagRaw.split('/').map(s => Number(s.trim())).filter(n => !isNaN(n))) || null
        : null;

      for (let i = 0; i < hitIDs.length; i++) {
        const hitID    = hitIDs[i];
        const hitName  = String(hitNames[i]    != null ? hitNames[i]    : (hitID    || '')).trim();
        const active   = hitActives[i]   != null ? String(hitActives[i])  : '';
        const moveID   = String(hitMoveIDs[i]  != null ? hitMoveIDs[i]  : attack).trim();
        const customSS = String(customSSArr[i] != null ? customSSArr[i] : '-').trim();

        if (!hitID || !hitName) continue;

        // Hitbox display label: include mode name unless it's "Default" or redundant
        const label = (mode.mode === 'Default' || mode.mode === hitName)
          ? hitName
          : `${mode.mode}: ${hitName}`;

        // Look up hit data (key: hitMoveID + hitID)
        // Fall back to prefix match when names diverge (e.g. "Multihit Back" ↔ "Multihit")
        const moveHits = hitMap[moveID] || {};
        let hit = moveHits[hitID];
        if (!hit) {
          // Prefix fallback: "Multihit Back" ↔ "Multihit"
          const fallback = Object.keys(moveHits).find(k =>
            k.startsWith(hitID) || hitID.startsWith(k)
          );
          if (fallback) hit = moveHits[fallback];
        }
        if (!hit) {
          // Last resort: if only one HitData entry exists for this move, use it
          // (handles name mismatches like Etalus Uspecial "Ice" vs "Spike")
          const keys = Object.keys(moveHits);
          if (keys.length === 1) hit = moveHits[keys[0]];
        }
        if (!hit && !NO_SHIELD.has(attack)) {
          console.warn(`\n    [WARN] No HitData: ${charName} attack="${attack}" moveID="${moveID}" hitID="${hitID}"`);
        }

        // Projectile detection: article exists, bIsProjectile === 'True'
        const article      = articleMap[moveID];
        const isProjectile = !!(article && (article.bIsProjectile === 'True' || article.bIsProjectile === 'true'));

        // Shield safety
        let shieldSafety = null;
        let shieldRaw    = null;
        if (hit && !NO_SHIELD.has(attack)) {
          const ss = calcShieldStun(hit.Damage, hit.ExtraShieldStun);
          shieldSafety = calcShieldSafety(attack, active, iasa, landingLag, customSS, isProjectile, ss);
          shieldRaw    = fmtShieldRaw(shieldSafety);
        }

        // Tumble data
        let tumblePercent        = null;
        let tumbleRaw            = 'Never';
        let perCharacterTumble   = {};
        let perCharacterTumbleAerial = {};
        if (hit) {
          const td = buildTumbleData(hit, characterWeights);
          tumblePercent            = td.tumblePercent;
          tumbleRaw                = td.tumbleRaw;
          perCharacterTumble       = td.perCharacterTumble;
          perCharacterTumbleAerial = td.perCharacterTumbleAerial;
        }

        hitboxes.push({
          hitbox:                  label,
          shieldSafety,
          shieldRaw,
          tumblePercent,
          tumbleRaw,
          perCharacterTumble,
          perCharacterTumbleAerial,
        });
      }
    }

    // Include moves with hitboxes, or grab moves (no hitboxes but needed for OOS options)
    const isGrab = attack === 'Grab' || attack === 'DashGrab' || attack === 'PivotGrab';
    if (hitboxes.length > 0 || (isGrab && startup != null)) {
      movesOutput.push({ move: displayName, startup, hitboxes });
    }
  }

  console.log(`✓  (${movesOutput.length} moves)`);
  return {
    character:  charName,
    slug:       charSlug,
    scrapedAt:  new Date().toISOString(),
    moves:      movesOutput,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Fetching character weights...');
  const weightRows    = await cargo('ROA2_CharacterData', 'chara,Weight', 'chara IS NOT NULL');
  const characterWeights = weightRows.map(r => ({ chara: r.chara, Weight: Number(r.Weight) }));
  console.log(`  ${characterWeights.length} characters loaded.\n`);

  if (!fs.existsSync(DATA_DIR))   fs.mkdirSync(DATA_DIR,   { recursive: true });
  if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });

  for (const { name, slug } of characters) {
    try {
      const data    = await scrapeCharacter(name, slug, characterWeights);
      const payload = JSON.stringify(data, null, 2);
      const out     = path.join(DATA_DIR, `${slug}.json`);
      fs.writeFileSync(out, payload);
      fs.writeFileSync(path.join(PUBLIC_DIR, `${slug}.json`), payload);
    } catch (err) {
      console.error(`\n  ✗ ${name}: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 250));  // be polite
  }

  console.log('\nAll done. Verifying files...');
  for (const { slug } of characters) {
    const p = path.join(DATA_DIR, `${slug}.json`);
    if (fs.existsSync(p)) {
      const d = JSON.parse(fs.readFileSync(p));
      console.log(`  ${slug}: ${d.moves.length} moves`);
    } else {
      console.log(`  ${slug}: MISSING`);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
