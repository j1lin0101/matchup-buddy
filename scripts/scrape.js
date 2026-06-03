const fetch = require('node-fetch');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const { characters, baseUrl } = require('../characters.json');
const DATA_DIR = path.join(__dirname, '../data/characters');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Referer': 'https://dragdown.wiki/',
};

function parseShieldSafety(raw) {
  if (!raw || raw.trim() === '—' || raw.trim() === '') return null;
  const clean = raw.trim();
  // "Stun: N" means the shield is stunned for N frames — positive advantage for the attacker
  const stun = clean.match(/^Stun:\s*(\d+)$/i);
  if (stun) { const v = parseInt(stun[1]); return { min: v, max: v, isStun: true }; }
  const range = clean.match(/(-?\d+)\s*to\s*(-?\d+)/i);
  if (range) return { min: parseInt(range[1]), max: parseInt(range[2]) };
  const single = clean.match(/^(-?\d+)$/);
  if (single) { const v = parseInt(single[1]); return { min: v, max: v }; }
  return null;
}

function parseOneRange(str) {
  if (!str) return null;
  const s = str.replace(/%/g, '').trim();
  const range = s.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (range) return { min: parseInt(range[1]), max: parseInt(range[2]) };
  const single = s.match(/(\d+)/);
  if (single) { const v = parseInt(single[1]); return { min: v, max: v }; }
  return null;
}

function parseTumblePercent(raw) {
  if (!raw || raw.trim() === '—' || raw.trim() === '') return null;
  // Context format: "⛰️4 - 7%☁️0 - 0%" — split on the aerial emoji
  if (raw.includes('☁')) {
    const parts = raw.split(/☁/);
    const grounded = parseOneRange(parts[0]);
    const aerial   = parseOneRange(parts[1] || '');
    if (!grounded) return null;
    // Only attach aerial if it's meaningfully different
    if (aerial && (aerial.min !== grounded.min || aerial.max !== grounded.max)) {
      return { ...grounded, aerial };
    }
    return grounded;
  }
  return parseOneRange(raw);
}

// Slugify a hitbox name to match tabber panel IDs (e.g. "Arm (Weak)" → "Arm_(Weak)")
function toTabId(name) {
  return name.replace(/\s/g, '_');
}

// Parse the startup frame number from raw text like "10 [6+3]", "5", "Notes: ..."
function parseStartup(raw) {
  if (!raw) return null;
  const m = raw.match(/^(\d+)/);
  return m ? parseInt(m[1]) : null;
}

/**
 * Parses a tumble-cell text into a hitbox's perCharacterTumble / perCharacterTumbleAerial maps.
 * Handles two formats:
 *   Simple:  "CLAIREN: 172%"
 *   Context: "CLAIREN: ⛰️When grounded.42%☁️When airborne.35%"
 */
function parseTumbleCell(text, hitbox) {
  // Simple: "CLAIREN: 172%"
  const simple = text.match(/^([A-Z][A-Z\s]+):\s*(\d+)%$/);
  if (simple) {
    hitbox.perCharacterTumble[simple[1].trim()] = parseInt(simple[2]);
    return;
  }
  // Context: "CLAIREN: ⛰️...X%☁️...Y%"
  const charMatch = text.match(/^([A-Z][A-Z\s]+):/);
  if (!charMatch) return;
  const charName = charMatch[1].trim();
  const parts = text.split(/☁/);
  const groundedMatch = parts[0].match(/(\d+)%/);
  const aerialMatch   = parts[1] ? parts[1].match(/(\d+)%/) : null;
  if (groundedMatch) hitbox.perCharacterTumble[charName]       = parseInt(groundedMatch[1]);
  if (aerialMatch)   hitbox.perCharacterTumbleAerial[charName] = parseInt(aerialMatch[1]);
}

function parseMoves($) {
  const moves = [];

  $('.mw-heading3').each(function(_, headingDiv) {
    const moveName = $(headingDiv).find('h3').text().trim();
    if (!moveName) return;

    // Find the attack-container immediately following this heading
    const container = $(headingDiv).nextAll('.attack-container').first();
    if (!container.length) return;

    // Capture startup frames from the first table (Startup | Active | Endlag | IASA)
    let startup = null;
    const startupTable = container.find('table').first();
    const startupHeaders = startupTable.find('tr').first().find('th').map(function(_, th) {
      return $(th).clone().find('.tooltiptext').remove().end().text().trim().toLowerCase();
    }).toArray();
    const startupColIdx = startupHeaders.findIndex(h => h.startsWith('startup'));
    if (startupColIdx >= 0) {
      const dataRow = startupTable.find('tbody tr').last().find('td');
      const raw = $(dataRow[startupColIdx]).clone().find('.tooltiptext').remove().end().text().trim();
      startup = parseStartup(raw);
    }

    // Find the hitbox table — the one with a "Shield Safety" header
    const hitboxTable = container.find('table').filter(function(_, tbl) {
      return $(tbl).find('th').toArray().some(th => $(th).text().includes('Shield Safety'));
    }).first();

    // If no hitbox table, still record the move with just startup data (e.g. Grab)
    if (!hitboxTable.length) {
      if (startup !== null) moves.push({ move: moveName, startup, hitboxes: [] });
      return;
    }

    // Map column headers to indices (strip tooltip text — just use first word/phrase match)
    const rawHeaders = hitboxTable.find('tr').first().find('th').map(function(_, th) {
      return $(th).text().trim();
    }).toArray();

    const colIdx = (keyword) => rawHeaders.findIndex(h => h.toLowerCase().includes(keyword.toLowerCase()));
    const hitboxCol  = colIdx('hit');
    const shieldCol  = colIdx('shield safety');
    const tumbleCol  = colIdx('tumble');

    if (shieldCol === -1) return;

    // Parse hitbox rows — skip rows where the first cell is empty (those are blank spacer rows)
    // "Unique:" rows are property modifiers for the preceding hitbox, not separate hitboxes.
    const hitboxes = [];
    hitboxTable.find('tbody tr').each(function(_, row) {
      const cells = $(row).find('td').map(function(_, td) {
        // Get only direct text, stripping tooltip spans
        return $(td).clone().find('.tooltiptext').remove().end().text().trim();
      }).toArray();

      if (!cells.length || !cells[0]) return; // skip empty/spacer rows

      const hitboxName = hitboxCol >= 0 ? cells[hitboxCol] : 'Hit ' + (hitboxes.length + 1);

      // "Unique:" rows are informational metadata — skip them
      if (hitboxName.startsWith('Unique:')) return;

      const shieldRaw = shieldCol >= 0 ? cells[shieldCol] : '';
      const tumbleRaw = tumbleCol >= 0 ? cells[tumbleCol] : '';

      hitboxes.push({
        hitbox:                  hitboxName,
        shieldSafety:            parseShieldSafety(shieldRaw),
        shieldRaw,
        tumblePercent:           parseTumblePercent(tumbleRaw),
        tumbleRaw,
        perCharacterTumble:      {},
        perCharacterTumbleAerial: {},
      });
    });

    if (!hitboxes.length) return;

    // Parse per-character tumble % from the "Stats for Nerds" collapsible
    const nerdsCollapsible = container.find('[data-expandtext="Show Stats for Nerds"]').first();
    if (nerdsCollapsible.length) {
      // Collect all tabber panels once, keyed by their id (decode HTML entities like &amp; → &)
      const allPanels = {};
      nerdsCollapsible.find('.tabber__panel').each(function(_, el) {
        const id = ($(el).attr('id') || '').replace(/&amp;/g, '&');
        allPanels[id.toLowerCase()] = $(el);
      });

      // Build set of panel keys that match any hitbox name
      const hitboxTabIds = new Set(hitboxes.map(function(h) {
        return ('tabber-' + toTabId(h.hitbox)).toLowerCase();
      }));

      // Panels whose IDs don't match any hitbox name are "variant" panels
      // (e.g. tabber-Uncharged, tabber-Full_Charge) — used as fallback when
      // there is only one hitbox and no name-matched panel exists.
      const variantPanels = Object.keys(allPanels).filter(function(k) {
        return !Array.from(hitboxTabIds).some(function(id) { return k.startsWith(id); });
      });

      hitboxes.forEach(function(h) {
        const tabId = ('tabber-' + toTabId(h.hitbox)).toLowerCase();
        // Try exact match first
        let panel = allPanels[tabId];
        // Fuzzy: find any panel id that starts with tabId (some get a _2 suffix for duplicates)
        if (!panel) {
          const key = Object.keys(allPanels).find(k => k.startsWith(tabId));
          if (key) panel = allPanels[key];
        }
        // Fallback: if only one hitbox and panels are variant-named (e.g. Uncharged/Full_Charge),
        // use the first variant panel that has non-zero tumble data
        if (!panel && hitboxes.length === 1 && variantPanels.length > 0) {
          const fallbackKey = variantPanels.find(function(k) {
            return allPanels[k].find('.tumble-cell').toArray().some(function(cell) {
              const m = $(cell).text().trim().match(/:\s*(\d+)%$/);
              return m && parseInt(m[1]) > 0;
            });
          });
          if (fallbackKey) panel = allPanels[fallbackKey];
        }
        // Last-resort fallback: if still no panel and there's only one hitbox,
        // check for tumble-cells directly in the nerds section (no tabber at all)
        if (!panel && hitboxes.length === 1) {
          const directCells = nerdsCollapsible.find('.tumble-cell').not('.tabber__panel .tumble-cell');
          if (directCells.length > 0) {
            directCells.each(function(_, cell) { parseTumbleCell($(cell).text().trim(), h); });
            return;
          }
        }
        if (!panel) return;

        panel.find('.tumble-cell').each(function(_, cell) { parseTumbleCell($(cell).text().trim(), h); });
      });
    }

    moves.push({ move: moveName, startup, hitboxes });
  });

  return moves;
}

async function scrapeCharacter(character) {
  const url = `${baseUrl}/${character.slug}`;
  console.log(`Fetching ${character.name}...`);

  let html;
  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (err) {
    console.error(`  ERROR: ${err.message}`);
    return null;
  }

  const $ = cheerio.load(html);
  const moves = parseMoves($);

  return {
    character: character.name,
    slug: character.slug,
    scrapedAt: new Date().toISOString(),
    moves,
  };
}

function detectChanges(oldData, newData) {
  if (!oldData) return { changed: true, summary: 'New character data' };
  const oldStr = JSON.stringify(oldData.moves);
  const newStr = JSON.stringify(newData.moves);
  if (oldStr === newStr) return { changed: false };

  const added   = newData.moves.filter(m => !oldData.moves.find(o => o.move === m.move)).map(m => m.move);
  const removed = oldData.moves.filter(m => !newData.moves.find(n => n.move === m.move)).map(m => m.move);
  const changed = newData.moves.filter(m => {
    const old = oldData.moves.find(o => o.move === m.move);
    return old && JSON.stringify(old.hitboxes) !== JSON.stringify(m.hitboxes);
  }).map(m => m.move);

  return {
    changed: true,
    summary: [
      added.length   ? `Added: ${added.join(', ')}` : '',
      removed.length ? `Removed: ${removed.join(', ')}` : '',
      changed.length ? `Updated: ${changed.join(', ')}` : '',
    ].filter(Boolean).join(' | '),
  };
}

async function main() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const results = { timestamp: new Date().toISOString(), changes: [] };

  for (const character of characters) {
    const outPath = path.join(DATA_DIR, `${character.slug}.json`);
    const oldData = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf8')) : null;

    const newData = await scrapeCharacter(character);
    if (!newData) {
      results.changes.push({ character: character.name, status: 'error' });
      continue;
    }

    const { changed, summary } = detectChanges(oldData, newData);
    if (changed) {
      fs.writeFileSync(outPath, JSON.stringify(newData, null, 2));
      console.log(`  UPDATED: ${summary}`);
      results.changes.push({ character: character.name, status: 'updated', summary });
    } else {
      console.log(`  No changes`);
      results.changes.push({ character: character.name, status: 'unchanged' });
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  fs.writeFileSync(path.join(__dirname, '../data/last-scrape.json'), JSON.stringify(results, null, 2));
  console.log('\nScrape complete.');
}

main().catch(err => { console.error(err); process.exit(1); });
