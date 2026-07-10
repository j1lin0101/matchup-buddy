import { useNavigate } from 'react-router-dom'

export default function GameComingSoon({ label }) {
  const navigate = useNavigate()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', overflowX: 'hidden' }}>
      <header className="page-header">
        <button onClick={() => navigate('/')} style={{
          background: 'none', border: '1px solid var(--border)',
          color: 'var(--muted)', borderRadius: 'var(--radius)',
          padding: '6px 10px', cursor: 'pointer', fontSize: '1rem',
          flexShrink: 0, lineHeight: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          ←
        </button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 style={{ fontSize: 'clamp(0.85rem, 3.8vw, 1.2rem)', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {label}
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.72rem', marginTop: '2px', lineHeight: 1.6 }}>
            Shield safety &amp; punish analysis
          </p>
        </div>
      </header>

      <main style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: '12px',
        padding: '32px', textAlign: 'center',
      }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)' }}>
          Coming soon
        </h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem', maxWidth: '440px' }}>
          {label} support is on the way — check back soon.
        </p>
      </main>
    </div>
  )
}
