'use strict';
/**
 * fetch-ssbu-roster.js
 * One-off (re-runnable) script: pulls the SSBU fighter roster from the
 * dragdown.wiki Cargo API and downloads each fighter's official stock icon.
 * Seed for the future full SSBU scraper (Phase 2) — this only needs the
 * roster + icons for the Phase 1 character-select screen.
 *
 * Output:
 *   app/public/data/ssbu/characters.json  — { characters: [{name, slug}], baseUrl }
 *   app/public/icons/ssbu/<slug>.png      — one stock icon per fighter
 */

const fetch = require('node-fetch');
const fs    = require('fs');
const path  = require('path');

const CARGO_BASE = 'https://dragdown.wiki/wiki/Special:CargoExport';
const API_BASE   = 'https://dragdown.wiki/w/api.php';
const DATA_OUT   = path.join(__dirname, '../app/public/data/ssbu/characters.json');
const ICONS_DIR  = path.join(__dirname, '../app/public/icons/ssbu');
const UA         = 'MatchupBuddy/1.0 (https://matchupbuddy.gg)';

// Decode the handful of HTML entities the Cargo export leaves in text fields
function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"');
}

// Filename-safe slug matching the existing Rivals convention (underscore-joined,
// original casing preserved) — strips punctuation that isn't filename-safe.
// This is OUR OWN convention for local files/URLs, distinct from the wiki's.
function toFileSlug(name) {
  return name
    .replace(/&/g, 'and')
    .replace(/[.]/g, '')
    .replace(/\s+/g, '_');
}

// The wiki's own File: naming just replaces spaces with underscores and keeps
// punctuation (periods, "&") as-is — e.g. "SSBU_Bowser_Jr._Stock.png",
// "SSBU_Mr._Game_&_Watch_Stock.png". "Rosalina & Luma" is a one-off exception
// where the file predates a simplification and is just "SSBU_Rosalina_Stock.png".
const WIKI_TITLE_OVERRIDES = { 'Rosalina & Luma': 'Rosalina' };
function toWikiTitle(name) {
  return (WIKI_TITLE_OVERRIDES[name] || name).replace(/\s+/g, '_');
}

async function withRetry(fn, label, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === attempts) throw new Error(`${label} failed after ${attempts} attempts: ${err.message}`);
      await new Promise(r => setTimeout(r, i * 1000));
    }
  }
}

async function fetchRoster() {
  const params = new URLSearchParams({
    tables: 'SSBU_CharacterData',
    fields: 'chara,char_id',
    where: 'chara IS NOT NULL',
    format: 'json',
    limit: '200',
  });
  return withRetry(async () => {
    const res = await fetch(`${CARGO_BASE}?${params}`, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = await res.json();
    return rows.map(r => ({ name: decodeEntities(r.chara), charId: r.char_id }));
  }, 'Fetching SSBU roster');
}

// MediaWiki imageinfo lookups, batched (max 50 titles per request), resolves
// redirects (e.g. "Rosalina & Luma" -> File:SSBU_Rosalina_Stock.png) so we
// never have to reimplement MediaWiki's md5 hash-path scheme ourselves.
async function resolveIconUrls(fighters) {
  const urlByName = new Map();
  const batchSize = 50;
  for (let i = 0; i < fighters.length; i += batchSize) {
    const batch = fighters.slice(i, i + batchSize);
    const titles = batch.map(f => `File:SSBU_${toWikiTitle(f.name)}_Stock.png`).join('|');
    const params = new URLSearchParams({
      action: 'query',
      titles,
      prop: 'imageinfo',
      iiprop: 'url',
      format: 'json',
    });
    const data = await withRetry(async () => {
      const res = await fetch(`${API_BASE}?${params}`, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }, `Resolving icon batch ${i / batchSize + 1}`);

    // Map normalized title back to the exact requested title (MediaWiki
    // normalizes underscores to spaces in the response) so results can be
    // re-associated with the fighter that produced them.
    const normalizedToRequested = new Map();
    (data.query.normalized || []).forEach(n => normalizedToRequested.set(n.to, n.from));
    const titleToFighter = new Map();
    batch.forEach(f => titleToFighter.set(`File:SSBU_${toWikiTitle(f.name)}_Stock.png`, f));

    Object.values(data.query.pages || {}).forEach(page => {
      const requestedTitle = normalizedToRequested.get(page.title) || page.title;
      const fighter = titleToFighter.get(requestedTitle);
      const url = page.imageinfo && page.imageinfo[0] && page.imageinfo[0].url;
      if (fighter && url) urlByName.set(fighter.name, url);
    });
  }
  return urlByName;
}

async function downloadIcon(name, url) {
  const dest = path.join(ICONS_DIR, `${toFileSlug(name)}.png`);
  await withRetry(async () => {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(dest, buf);
  }, `Downloading icon for ${name}`);
}

async function main() {
  console.log('Fetching SSBU roster...');
  const fighters = await fetchRoster();
  console.log(`  ${fighters.length} fighters found.`);

  console.log('Resolving stock icon URLs...');
  const iconUrls = await resolveIconUrls(fighters);
  const missing = fighters.filter(f => !iconUrls.has(f.name));
  if (missing.length) {
    console.log(`  WARNING: no icon resolved for: ${missing.map(f => f.name).join(', ')}`);
  }

  fs.mkdirSync(ICONS_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(DATA_OUT), { recursive: true });

  console.log('Downloading icons...');
  for (const fighter of fighters) {
    const url = iconUrls.get(fighter.name);
    if (!url) continue;
    process.stdout.write(`  ${fighter.name}... `);
    await downloadIcon(fighter.name, url);
    console.log('done');
  }

  const roster = {
    characters: fighters.map(f => ({ name: f.name, slug: toFileSlug(f.name) })),
    baseUrl: 'https://dragdown.wiki/wiki/SSBU',
  };
  fs.writeFileSync(DATA_OUT, JSON.stringify(roster, null, 2) + '\n');
  console.log(`\nWrote ${roster.characters.length} characters to ${DATA_OUT}`);
}

main().catch(err => { console.error(err); process.exit(1); });
