import { useNavigate } from 'react-router-dom'

const GAMES = [
  { id: 'roa2', label: 'Rivals of Aether 2', color: 'var(--accent)', logo: 'roa2.png' },
  // SSBU's official logo is black line art on a transparent background — invert
  // it so it reads as white against this app's dark theme instead of vanishing.
  { id: 'ssbu', label: 'Super Smash Bros. Ultimate', color: 'var(--accent2)', logo: 'ssbu.png', invert: true },
  { id: 'ssbm', label: 'Super Smash Bros. Melee', color: '#4CAF50', logo: 'ssbm.png' },
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
        <a
          href="https://ko-fi.com/boi_jiro"
          target="_blank"
          rel="noopener noreferrer"
          className="kofi-link"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '6px 14px', borderRadius: '6px',
            border: '1px solid var(--border)',
            color: 'var(--muted)', fontSize: '0.78rem', fontWeight: 600,
            textDecoration: 'none', flexShrink: 0,
          }}
        >☕ Support me on Ko-Fi!</a>
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
              <img
                src={`${import.meta.env.BASE_URL}logos/${g.logo}`}
                alt={g.label}
                style={{
                  maxWidth: '100%', maxHeight: '100%', objectFit: 'contain',
                  filter: g.invert ? 'invert(1)' : 'none',
                }}
              />
            </button>
          ))}
        </div>
      </main>

      <footer style={{
        borderTop: '1px solid var(--border)',
        padding: '14px 32px',
        textAlign: 'center',
        fontSize: '0.78rem',
        color: 'var(--muted)',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}>
        <span>
          Created by{' '}
          <a href="https://x.com/boi_jir0" target="_blank" rel="noopener noreferrer"
            style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
            @boi_jiro
          </a>
        </span>
        <span>
          All frame data and definitions sourced from{' '}
          <a href="https://dragdown.wiki" target="_blank" rel="noopener noreferrer"
            style={{ color: 'var(--accent)', textDecoration: 'none' }}>
            dragdown.wiki
          </a>.
        </span>
        <span>
          Have a bug fix, feature suggestion, or general feedback? Please feel free to fill out{' '}
          <a href="https://forms.gle/7uZnA3EzMN2k19WA9" target="_blank" rel="noopener noreferrer"
            style={{ color: 'var(--accent)', textDecoration: 'none' }}>
            this form
          </a>.
        </span>
      </footer>
    </div>
  )
}
