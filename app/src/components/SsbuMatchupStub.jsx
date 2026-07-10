export default function SsbuMatchupStub({ myChar, oppChar, onBack }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', overflowX: 'hidden' }}>
      <header className="page-header">
        <button onClick={onBack} style={{
          background: 'none', border: '1px solid var(--border)',
          color: 'var(--muted)', borderRadius: 'var(--radius)',
          padding: '6px 10px', cursor: 'pointer', fontSize: '1rem',
          flexShrink: 0, lineHeight: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          ←
        </button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 style={{ fontSize: 'clamp(0.72rem, 3.8vw, 1.1rem)', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <span style={{ color: 'var(--accent)' }}>{myChar}</span>
            <span style={{ color: 'var(--muted)', margin: '0 8px' }}>vs</span>
            <span style={{ color: 'var(--accent2)' }}>{oppChar}</span>
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
          Full matchup analysis coming soon
        </h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem', maxWidth: '440px' }}>
          Smash Ultimate's frame data doesn't map cleanly onto Rivals' calculators — we're
          building out shield safety and punish-option tables for {myChar} vs {oppChar} the
          right way. Check back soon.
        </p>
      </main>
    </div>
  )
}
