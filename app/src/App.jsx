import { useState } from 'react'
import CharacterSelect from './components/CharacterSelect'
import MatchupView from './components/MatchupView'
import './index.css'

export default function App() {
  const [myChar, setMyChar]       = useState(null)
  const [oppChar, setOppChar]     = useState(null)
  const [analyzing, setAnalyzing] = useState(false)

  function handleAnalyze() {
    if (myChar && oppChar) setAnalyzing(true)
  }

  function handleBack() {
    setAnalyzing(false)
  }

  if (analyzing) {
    return <MatchupView myChar={myChar} oppChar={oppChar} onBack={handleBack} />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <header className="select-header">
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '0.02em', color: 'var(--accent)' }}>
          RoA2 Gameplan Helper
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: '4px' }}>
          Shield safety &amp; punish analysis
        </p>
      </header>

      <main className="select-main">
        <div className="char-select-grid">
          <CharacterSelect
            label="Your Character"
            accentColor="var(--accent)"
            selected={myChar}
            onSelect={setMyChar}
          />
          <CharacterSelect
            label="Opponent"
            accentColor="var(--accent2)"
            selected={oppChar}
            onSelect={setOppChar}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '40px', gap: '12px' }}>
          <button
            onClick={handleAnalyze}
            disabled={!myChar || !oppChar}
            style={{
              padding: '14px 48px',
              fontSize: '1rem',
              fontWeight: 700,
              letterSpacing: '0.05em',
              background: myChar && oppChar ? 'var(--accent)' : 'var(--border)',
              color: myChar && oppChar ? '#0e0e12' : 'var(--muted)',
              border: 'none',
              borderRadius: 'var(--radius)',
              cursor: myChar && oppChar ? 'pointer' : 'not-allowed',
              transition: 'background 0.2s',
            }}
          >
            ANALYZE MATCHUP
          </button>
          {myChar && oppChar && (
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
              {myChar} vs {oppChar}
            </p>
          )}
        </div>
      </main>
    </div>
  )
}
