import { useState, useEffect, useMemo } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom'
import CharacterSelect from './components/CharacterSelect'
import MatchupView from './components/MatchupView'
import GameSelect from './components/GameSelect'
import SsbuMatchupStub from './components/SsbuMatchupStub'
import UpdateToast from './components/UpdateToast'
import './index.css'

// Robust slugifier shared by both games' routes — strips punctuation rather
// than assuming simple space-separated names, since SSBU has names like
// "Mr. Game & Watch" that the old naive space->hyphen slugger can't round-trip.
function toSlug(name) {
  return name
    .replace(/&/g, 'and')
    .replace(/[.']/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Fetches a game's character roster once. Returns null while loading, an
// array (possibly empty on error) once resolved.
function useRoster(game) {
  const [characters, setCharacters] = useState(null)
  useEffect(() => {
    let cancelled = false
    setCharacters(null)
    fetch(`${import.meta.env.BASE_URL}data/${game}/characters.json`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setCharacters(d.characters.map(c => c.name)) })
      .catch(() => { if (!cancelled) setCharacters([]) })
    return () => { cancelled = true }
  }, [game])
  return characters
}

const GAME_META = {
  roa2: {
    label: 'Rivals of Aether 2',
    tagline: 'Shield safety & punish analysis',
    wikiUrl: 'https://dragdown.wiki/wiki/RoA2',
    demoVideoId: 'W2QBwcA57y0',
  },
  ssbu: {
    label: 'Super Smash Bros. Ultimate',
    tagline: 'Shield safety & punish analysis',
    wikiUrl: 'https://dragdown.wiki/wiki/SSBU',
    demoVideoId: null,
  },
}

function SelectPage({ game }) {
  const [myChar, setMyChar] = useState(null)
  const [oppChar, setOppChar] = useState(null)
  const navigate = useNavigate()
  const meta = GAME_META[game]

  function handleAnalyze() {
    if (myChar && oppChar) {
      navigate(`/${game}/${toSlug(myChar)}/${toSlug(oppChar)}`)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <header className="select-header">
        <div className="select-header-text">
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '0.02em', color: 'var(--accent)' }}>
            MatchupBuddy
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: '4px' }}>
            {meta.label} &middot; {meta.tagline}
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

      <main className="select-main">
        <div className="char-select-grid">
          <CharacterSelect
            game={game}
            label="Your Character"
            accentColor="var(--accent)"
            selected={myChar}
            onSelect={setMyChar}
          />
          <CharacterSelect
            game={game}
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

        {meta.demoVideoId && (
          <div style={{ marginTop: '48px', width: '100%', maxWidth: '640px', margin: '48px auto 0' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)', marginBottom: '16px' }}>
              How do I use this site?
            </h2>
            <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, borderRadius: 'var(--radius)', overflow: 'hidden', border: '1px solid var(--border)' }}>
              <iframe
                src={`https://www.youtube.com/embed/${meta.demoVideoId}`}
                title="MatchupBuddy demo"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
              />
            </div>
          </div>
        )}
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
          <a href={meta.wikiUrl} target="_blank" rel="noopener noreferrer"
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

function useMatchupSlugs(game, char1Slug, char2Slug) {
  const roster = useRoster(game)
  return useMemo(() => {
    if (roster === null) return { loading: true }
    const bySlug = new Map(roster.map(name => [toSlug(name), name]))
    const myChar = bySlug.get(char1Slug)
    const oppChar = bySlug.get(char2Slug)
    if (!myChar || !oppChar) return { loading: false, valid: false }
    return { loading: false, valid: true, myChar, oppChar }
  }, [roster, char1Slug, char2Slug])
}

function UnknownCharacters({ game }) {
  const navigate = useNavigate()
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', flexDirection: 'column', gap: '16px', color: 'var(--muted)' }}>
      <p>Unknown characters.</p>
      <button onClick={() => navigate(`/${game}`)} style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem' }}>
        ← Back to character select
      </button>
    </div>
  )
}

function MatchupPage() {
  const { char1, char2 } = useParams()
  const navigate = useNavigate()
  const { loading, valid, myChar, oppChar } = useMatchupSlugs('roa2', char1, char2)

  if (loading) return null
  if (!valid) return <UnknownCharacters game="roa2" />

  return (
    <MatchupView
      myChar={myChar}
      oppChar={oppChar}
      onBack={() => navigate('/roa2')}
    />
  )
}

function SsbuMatchupPage() {
  const { char1, char2 } = useParams()
  const navigate = useNavigate()
  const { loading, valid, myChar, oppChar } = useMatchupSlugs('ssbu', char1, char2)

  if (loading) return null
  if (!valid) return <UnknownCharacters game="ssbu" />

  return (
    <SsbuMatchupStub
      myChar={myChar}
      oppChar={oppChar}
      onBack={() => navigate('/ssbu')}
    />
  )
}

// Old bare /:char1/:char2 links (shared before SSBU support existed) still
// point at Rivals matchups — keep them working via a redirect rather than
// breaking already-shared/bookmarked URLs.
function LegacyMatchupRedirect() {
  const { char1, char2 } = useParams()
  return <Navigate to={`/roa2/${char1}/${char2}`} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<GameSelect />} />
        <Route path="/roa2" element={<SelectPage game="roa2" />} />
        <Route path="/roa2/:char1/:char2" element={<MatchupPage />} />
        <Route path="/ssbu" element={<SelectPage game="ssbu" />} />
        <Route path="/ssbu/:char1/:char2" element={<SsbuMatchupPage />} />
        <Route path="/:char1/:char2" element={<LegacyMatchupRedirect />} />
        <Route path="*" element={<GameSelect />} />
      </Routes>
      <UpdateToast />
    </BrowserRouter>
  )
}
