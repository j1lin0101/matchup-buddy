import { useNavigate } from 'react-router-dom'

const GAMES = [
  { id: 'roa2', label: 'Rivals of Aether 2', color: 'var(--accent)', logo: 'roa2.png' },
  // SSBU's official logo is black line art on a transparent background — invert
  // it so it reads as white against this app's dark theme instead of vanishing.
  { id: 'ssbu', label: 'Super Smash Bros. Ultimate', color: 'var(--accent2)', logo: 'ssbu.png', invert: true },
  // No logo asset yet — Melee is a coming-soon stub, falls back to text label.
  { id: 'ssbm', label: 'Super Smash Bros. Melee', color: '#4CAF50' },
]

export default function GameSelect() {
  const navigate = useNavigate()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <header className="select-header">
        <div className="select-header-text">
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '0.02em', color: 'var(--accent)' }}>
            MatchupBuddy
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: '4px' }}>
            Shield safety &amp; punish analysis
          </p>
        </div>
      </header>

      <main style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: '32px',
      }}>
        <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '24px' }}>
          Which game?
        </h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', justifyContent: 'center', maxWidth: '640px' }}>
          {GAMES.map(g => (
            <button
              key={g.id}
              onClick={() => navigate(`/${g.id}`)}
              aria-label={g.label}
              title={g.label}
              style={{
                width: '260px', height: '150px', padding: '20px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', cursor: 'pointer',
                transition: 'border-color 0.15s, background 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = g.color
                e.currentTarget.style.background = g.color + '11'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--border)'
                e.currentTarget.style.background = 'var(--surface)'
              }}
            >
              {g.logo ? (
                <img
                  src={`${import.meta.env.BASE_URL}logos/${g.logo}`}
                  alt={g.label}
                  style={{
                    maxWidth: '100%', maxHeight: '100%', objectFit: 'contain',
                    filter: g.invert ? 'invert(1)' : 'none',
                  }}
                />
              ) : (
                <span style={{ fontSize: '1.05rem', fontWeight: 700, color: g.color, textAlign: 'center', lineHeight: 1.4 }}>
                  {g.label}
                </span>
              )}
            </button>
          ))}
        </div>
      </main>
    </div>
  )
}
