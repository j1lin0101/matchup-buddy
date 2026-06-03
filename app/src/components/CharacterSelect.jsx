import { useState, useEffect } from 'react'

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

function iconPath(name) {
  return `${import.meta.env.BASE_URL}icons/${name.replace(/ /g, '_')}.png`
}

export default function CharacterSelect({ label, accentColor, selected, onSelect }) {
  const [characters, setCharacters] = useState([])

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}characters.json`)
      .then(r => r.json())
      .then(d => setCharacters(d.characters.map(c => c.name)))
      .catch(console.error)
  }, [])

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
            src={iconPath(selected)}
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

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '8px',
      }}>
        {characters.map(name => {
          const isSelected = selected === name
          const color = CHARACTER_COLORS[name] || '#444'
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
                src={iconPath(name)}
                alt={name}
                style={{ width: '48px', height: '48px', objectFit: 'contain' }}
              />
              {name}
            </button>
          )
        })}
      </div>
    </div>
  )
}
