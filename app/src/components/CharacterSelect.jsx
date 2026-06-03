import { useState, useEffect } from 'react'

const CHARACTER_COLORS = {
  Zetterburn: '#e53935',
  Forsburn:   '#7b1fa2',
  Maypul:     '#388e3c',
  Absa:       '#1565c0',
  Etalus:     '#0288d1',
  Orcane:     '#00838f',
  Wrastor:    '#6d4c41',
  Kragg:      '#827717',
  Ranno:      '#2e7d32',
  Clairen:    '#ad1457',
  Fleet:      '#00695c',
  Loxodont:   '#bf360c',
  Olympia:    '#4527a0',
  'La Reina': '#c62828',
  Galvan:     '#1565c0',
  Slade:      '#004d40',
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
