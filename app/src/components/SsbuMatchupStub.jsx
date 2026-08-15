import { useState } from 'react'

function HelpModal({ onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          maxWidth: '560px',
          width: '100%',
          maxHeight: '80vh',
          overflowY: 'auto',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>How to Read This</h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1, padding: '2px 6px' }}
          >✕</button>
        </div>

        <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <iframe
            src="https://www.youtube.com/embed/W2QBwcA57y0"
            title="How to read this"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
          />
        </div>

        <div>
          <h3 style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent2)', marginBottom: '8px' }}>
            What is this?
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text)', lineHeight: 1.6 }}>
            MatchupBuddy shows frame data in a matchup context — shield safety, punish options, and defensive counterplay for every move in a given matchup. Smash Ultimate's full tables are still being verified; other games' matchup pages are already live.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function SsbuMatchupStub({ myChar, oppChar, onBack }) {
  const [helpOpen, setHelpOpen] = useState(false)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', overflowX: 'hidden' }}>
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}

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

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <a
            href="https://ko-fi.com/boi_jiro"
            target="_blank"
            rel="noopener noreferrer"
            title="Support me on Ko-Fi!"
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              color: 'var(--muted)',
              borderRadius: '6px',
              height: '26px', padding: '0 8px',
              fontSize: '1rem',
              lineHeight: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              textDecoration: 'none',
            }}
          >☕</a>
          <button
            onClick={() => setHelpOpen(true)}
            title="How to read this"
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              borderRadius: '6px',
              height: '26px', padding: '0 10px',
              cursor: 'pointer',
              fontSize: '0.72rem',
              fontWeight: 700,
              lineHeight: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >Demo</button>
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
          We're re-working our Smash Ultimate frame data source to make sure shield safety
          and punish-option tables for {myChar} vs {oppChar} are accurate before showing
          them. Check back soon.
        </p>
      </main>
    </div>
  )
}
