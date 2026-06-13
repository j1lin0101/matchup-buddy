import { useState } from 'react'
import { BrowserRouter, Routes, Route, useNavigate, useParams } from 'react-router-dom'
import CharacterSelect from './components/CharacterSelect'
import MatchupView from './components/MatchupView'
import './index.css'

// Convert display name to URL slug and back
function toSlug(name) {
  return name.toLowerCase().replace(/ /g, '-')
}
function fromSlug(slug) {
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

const VALID_CHARACTERS = [
  'Zetterburn', 'Forsburn', 'Maypul', 'Absa', 'Etalus', 'Orcane',
  'Wrastor', 'Kragg', 'Ranno', 'Clairen', 'Fleet', 'Loxodont',
  'Olympia', 'La Reina', 'Galvan', 'Slade',
]
const VALID_SLUGS = new Set(VALID_CHARACTERS.map(toSlug))

function SelectPage() {
  const [myChar, setMyChar] = useState(null)
  const [oppChar, setOppChar] = useState(null)
  const navigate = useNavigate()

  function handleAnalyze() {
    if (myChar && oppChar) {
      navigate(`/${toSlug(myChar)}/${toSlug(oppChar)}`)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <header className="select-header">
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '0.02em', color: 'var(--accent)' }}>
          MatchupBuddy
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
          <a href="https://dragdown.wiki/wiki/RoA2" target="_blank" rel="noopener noreferrer"
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

function MatchupPage() {
  const { char1, char2 } = useParams()
  const navigate = useNavigate()

  if (!VALID_SLUGS.has(char1) || !VALID_SLUGS.has(char2)) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', flexDirection: 'column', gap: '16px', color: 'var(--muted)' }}>
        <p>Unknown characters.</p>
        <button onClick={() => navigate('/')} style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem' }}>
          ← Back to character select
        </button>
      </div>
    )
  }

  return (
    <MatchupView
      myChar={fromSlug(char1)}
      oppChar={fromSlug(char2)}
      onBack={() => navigate('/')}
    />
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SelectPage />} />
        <Route path="/:char1/:char2" element={<MatchupPage />} />
        <Route path="*" element={<SelectPage />} />
      </Routes>
    </BrowserRouter>
  )
}
