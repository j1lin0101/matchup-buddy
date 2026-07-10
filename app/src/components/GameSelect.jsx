import { useNavigate } from 'react-router-dom'

const GAMES = [
  { id: 'roa2', label: 'Rivals of Aether 2', color: 'var(--accent)' },
  { id: 'ssbu', label: 'Super Smash Bros. Ultimate', color: 'var(--accent2)' },
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
              style={{
                width: '260px', padding: '28px 24px', textAlign: 'left',
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
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: g.color }}>
                {g.label}
              </div>
            </button>
          ))}
        </div>
      </main>
    </div>
  )
}
