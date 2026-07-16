import { useState, useEffect, useMemo } from 'react'

const CHARACTER_COLORS = {
  Zetterburn: '#D55E00',  // vermilion
  Forsburn:   '#7b1fa2',  // purple
  Maypul:     '#009E73',  // bluish green
  Absa:       '#0072B2',  // blue
  Etalus:     '#56B4E9',  // sky blue
  Orcane:     '#0288d1',  // teal-blue
  Wrastor:    '#8B6355',  // brown (neutral)
  Kragg:      '#E69F00',  // orange
  Ranno:      '#009E73',  // bluish green
  Clairen:    '#CC79A7',  // reddish purple
  Fleet:      '#009E73',  // bluish green
  Loxodont:   '#D55E00',  // vermilion
  Olympia:    '#4527a0',  // deep purple
  'La Reina': '#CC79A7',  // reddish purple
  Galvan:     '#0072B2',  // blue
  Slade:      '#004d40',  // dark teal
}

// Matches the underscore-joined slug convention used for data/icon filenames
// across both games (see scripts/cargo-scrape.js and scripts/fetch-ssbu-roster.js).
function nameToSlug(name) {
  return name.replace(/&/g, 'and').replace(/[.]/g, '').replace(/\s+/g, '_')
}

function iconPath(game, name) {
  return `${import.meta.env.BASE_URL}icons/${game}/${nameToSlug(name)}.png`
}

function useNarrow(breakpoint = 600) {
  const [narrow, setNarrow] = useState(() => window.innerWidth <= breakpoint)
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`)
    const handler = e => setNarrow(e.matches)
    mq.addEventListener('change', handler)
    setNarrow(mq.matches)
    return () => mq.removeEventListener('change', handler)
  }, [breakpoint])
  return narrow
}

export default function CharacterSelect({ game = 'roa2', label, accentColor, selected, onSelect }) {
  const [characters, setCharacters] = useState([])
  const [search, setSearch] = useState('')
  const narrow = useNarrow(600)
  // SSBU's ~90-fighter roster is large enough that filtering matters; Rivals'
  // 16 characters don't need it.
  const searchable = game === 'ssbu'

  useEffect(() => {
    setCharacters([])
    setSearch('')
    fetch(`${import.meta.env.BASE_URL}data/${game}/characters.json`)
      .then(r => r.json())
      .then(d => setCharacters(d.characters.map(c => c.name).sort((a, b) => a.localeCompare(b))))
      .catch(console.error)
  }, [game])

  const filtered = useMemo(() => {
    if (!searchable || !search.trim()) return characters
    const q = search.trim().toLowerCase()
    return characters.filter(name => name.toLowerCase().includes(q))
  }, [characters, search, searchable])

  return (
    <div>
      <h2 style={{
        fontSize: '0.75rem',
        fontWeight: 700,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: accentColor,
        marginBottom: '16px',
      }}>
        {label}
      </h2>

      {narrow ? (
        /* ── Dropdown mode (narrow screens) ── */
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {selected && (
            <img
              src={iconPath(game, selected)}
              alt={selected}
              style={{ width: '36px', height: '36px', objectFit: 'contain', flexShrink: 0 }}
            />
          )}
          <select
            value={selected || ''}
            onChange={e => onSelect(e.target.value || null)}
            style={{
              flex: 1,
              padding: '10px 12px',
              background: 'var(--surface)',
              border: `2px solid ${selected ? accentColor : 'var(--border)'}`,
              borderRadius: 'var(--radius)',
              color: selected ? 'var(--text)' : 'var(--muted)',
              fontSize: '0.95rem',
              fontWeight: selected ? 600 : 400,
              cursor: 'pointer',
              appearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%23888899' d='M6 8L0 0h12z'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 12px center',
              paddingRight: '32px',
            }}
          >
            <option value="">— Select a character —</option>
            {characters.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
      ) : (
        /* ── Tile grid mode (wide screens) ── */
        <>
          {selected && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '20px',
              padding: '12px 16px',
              background: 'var(--surface)',
              border: `2px solid ${accentColor}`,
              borderRadius: 'var(--radius)',
            }}>
              <img
                src={iconPath(game, selected)}
                alt={selected}
                style={{ width: '40px', height: '40px', objectFit: 'contain', flexShrink: 0 }}
              />
              <span style={{ fontWeight: 600, fontSize: '1rem' }}>{selected}</span>
              <button
                onClick={() => onSelect(null)}
                style={{
                  marginLeft: 'auto',
                  background: 'none',
                  border: 'none',
                  color: 'var(--muted)',
                  cursor: 'pointer',
                  fontSize: '1.1rem',
                  lineHeight: 1,
                  padding: '2px 6px',
                }}
                title="Clear selection"
              >
                ✕
              </button>
            </div>
          )}

          {searchable && (
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search fighters..."
              style={{
                width: '100%',
                padding: '8px 12px',
                marginBottom: '12px',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                color: 'var(--text)',
                fontSize: '0.85rem',
              }}
            />
          )}

          {searchable && !search.trim() && (
            <p style={{ color: 'var(--muted)', fontSize: '0.82rem', padding: '8px 0', fontStyle: 'italic' }}>
              Type a name above to see matching fighters.
            </p>
          )}

          {searchable && search.trim() && filtered.length === 0 && (
            <p style={{ color: 'var(--muted)', fontSize: '0.82rem', padding: '8px 0' }}>
              No fighters match "{search}".
            </p>
          )}

          <div className="char-tile-grid">
            {(searchable ? (search.trim() ? filtered : []) : filtered).map(name => {
              const isSelected = selected === name
              const color = game === 'roa2' ? (CHARACTER_COLORS[name] || '#444') : accentColor
              return (
                <button
                  key={name}
                  onClick={() => onSelect(name)}
                  style={{
                    padding: '10px 6px',
                    background: isSelected ? color : 'var(--surface)',
                    border: `1px solid ${isSelected ? color : 'var(--border)'}`,
                    borderRadius: 'var(--radius)',
                    color: isSelected ? '#fff' : 'var(--text)',
                    fontSize: '0.72rem',
                    fontWeight: isSelected ? 700 : 400,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    textAlign: 'center',
                    lineHeight: 1.3,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                  onMouseEnter={e => {
                    if (!isSelected) {
                      e.currentTarget.style.borderColor = color
                      e.currentTarget.style.background = color + '22'
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isSelected) {
                      e.currentTarget.style.borderColor = 'var(--border)'
                      e.currentTarget.style.background = 'var(--surface)'
                    }
                  }}
                >
                  <img
                    src={iconPath(game, name)}
                    alt={name}
                    style={{ width: '48px', height: '48px', objectFit: 'contain' }}
                  />
                  {name}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
